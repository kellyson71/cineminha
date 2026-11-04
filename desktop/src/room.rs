//! Native WebRTC room, compatible with the website's Trystero protocol.
use crate::{
    Command, Config, Event, Identity,
    media::{self, Encoder, Frames, Pipeline, ScreenCapture},
    protocol::{self, RoomKeys},
};
use anyhow::{Context, Result, anyhow};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{broadcast, mpsc};
use webrtc::{
    api::{
        APIBuilder, interceptor_registry::register_default_interceptors, media_engine::MediaEngine,
    },
    data_channel::RTCDataChannel,
    ice_transport::{ice_candidate::RTCIceCandidateInit, ice_server::RTCIceServer},
    interceptor::registry::Registry,
    peer_connection::{
        RTCPeerConnection, configuration::RTCConfiguration,
        peer_connection_state::RTCPeerConnectionState,
        sdp::session_description::RTCSessionDescription,
    },
    rtp_transceiver::rtp_codec::RTCRtpCodecCapability,
    track::track_local::{TrackLocal, track_local_static_rtp::TrackLocalStaticRTP},
};

enum Internal {
    Relay(Value),
    Signal(String, Value),
    Channel(String, Arc<RTCDataChannel>),
    Opened(String),
    ReceiverTask(String, tokio::task::JoinHandle<()>),
    Data(String, Vec<u8>),
    Gone(String),
    Error(String),
}
struct Peer {
    pc: Arc<RTCPeerConnection>,
    dc: Option<Arc<RTCDataChannel>>,
    decoder: protocol::Decoder,
    offer_id: String,
    active: bool,
    local_ready: bool,
    remote_ready: bool,
    challenge: String,
    created: Instant,
    tasks: Vec<tokio::task::JoinHandle<()>>,
    screen_senders: Vec<Arc<webrtc::rtp_transceiver::rtp_sender::RTCRtpSender>>,
    voice_sender: Option<Arc<webrtc::rtp_transceiver::rtp_sender::RTCRtpSender>>,
    renegotiate: bool,
}
impl Drop for Peer {
    fn drop(&mut self) {
        for task in &self.tasks {
            task.abort()
        }
    }
}

pub struct Frontend {
    events: std::sync::mpsc::Sender<Event>,
    ctx: eframe::egui::Context,
    frames: Frames,
}

pub struct Room {
    config: Config,
    identity: Identity,
    password: String,
    room_id: String,
    keys: RoomKeys,
    id: String,
    peers: HashMap<String, Peer>,
    pending_candidates: HashMap<String, Vec<RTCIceCandidateInit>>,
    tx: mpsc::UnboundedSender<Internal>,
    rx: mpsc::UnboundedReceiver<Internal>,
    events: std::sync::mpsc::Sender<Event>,
    ctx: eframe::egui::Context,
    frames: Frames,
    signal_tx: broadcast::Sender<String>,
    relay_tasks: Vec<tokio::task::JoinHandle<()>>,
    video: Arc<TrackLocalStaticRTP>,
    sound: Arc<TrackLocalStaticRTP>,
    voice: Arc<TrackLocalStaticRTP>,
    screen: Option<ScreenCapture>,
    audio: Option<Pipeline>,
    mic: Option<Pipeline>,
    encoder: Encoder,
    muted: bool,
    seen: HashSet<String>,
    ice: Vec<RTCIceServer>,
    test: bool,
}
impl Drop for Room {
    fn drop(&mut self) {
        for task in &self.relay_tasks {
            task.abort();
        }
    }
}
impl Room {
    pub async fn new(
        config: Config,
        identity: Identity,
        password: String,
        channel: String,
        frontend: Frontend,
        test: bool,
    ) -> Result<Self> {
        let Frontend {
            events,
            ctx,
            frames,
        } = frontend;
        let id = protocol::id();
        let room_id = protocol::hash(&format!(
            "sala:{password}{}",
            if channel.is_empty() {
                String::new()
            } else {
                format!(":{channel}")
            }
        ))[..24]
            .to_string();
        let keys = RoomKeys::new(&config.app_id, &room_id, &password, &id);
        let (tx, rx) = mpsc::unbounded_channel();
        let (signal_tx, _) = broadcast::channel(256);
        let encoder = Encoder::detect();
        let track = |mime: &str, name: &str, stream: &str| {
            Arc::new(TrackLocalStaticRTP::new(
                RTCRtpCodecCapability {
                    mime_type: mime.into(),
                    clock_rate: if mime.starts_with("audio") {
                        48000
                    } else {
                        90000
                    },
                    channels: if mime.starts_with("audio") { 2 } else { 0 },
                    sdp_fmtp_line: if mime == "video/H264" {
                        "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"
                            .into()
                    } else {
                        String::new()
                    },
                    ..Default::default()
                },
                name.into(),
                stream.into(),
            ))
        };
        let video = track(encoder.mime(), "screen-video", "cineminha-screen");
        let sound = track("audio/opus", "screen-sound", "cineminha-screen");
        let voice = track("audio/opus", "voice", "cineminha-voice");
        let mut ice = vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".into()],
            ..Default::default()
        }];
        if !test {
            let http = reqwest::Client::builder()
                .timeout(Duration::from_secs(8))
                .build()?;
            if let Ok(r) = http
                .post(format!("{}/api/sala", crate::SITE))
                .json(&json!({"op":"turn","pw":password}))
                .send()
                .await
                && let Ok(v) = r.json::<Value>().await
                && let Some(servers) = v["iceServers"].as_array()
            {
                for s in servers {
                    let urls = if let Some(s) = s["urls"].as_str() {
                        vec![s.to_string()]
                    } else {
                        s["urls"]
                            .as_array()
                            .map(|a| {
                                a.iter()
                                    .filter_map(Value::as_str)
                                    .map(str::to_owned)
                                    .collect()
                            })
                            .unwrap_or_default()
                    };
                    ice.push(RTCIceServer {
                        urls,
                        username: s["username"].as_str().unwrap_or("").into(),
                        credential: s["credential"].as_str().unwrap_or("").into(),
                    });
                }
            }
        }
        let mut r = Self {
            config,
            identity,
            password,
            room_id,
            keys,
            id,
            peers: HashMap::new(),
            pending_candidates: HashMap::new(),
            tx,
            rx,
            events,
            ctx,
            frames,
            signal_tx,
            relay_tasks: vec![],
            video,
            sound,
            voice,
            screen: None,
            audio: None,
            mic: None,
            encoder,
            muted: true,
            seen: HashSet::new(),
            ice,
            test,
        };
        r.start_relays()?;
        r.emit(Event::Status(format!(
            "Conectando à sala · {}",
            encoder.label()
        )));
        Ok(r)
    }
    fn emit(&self, event: Event) {
        let _ = self.events.send(event);
        self.ctx.request_repaint();
    }
    fn hello(&self) -> Value {
        json!({"key":self.identity.key,"name":self.identity.name,"muted":self.muted,"deaf":false,"seat":-1,"speaking":false,"hidden":false})
    }
    fn start_relays(&mut self) -> Result<()> {
        let relays = if !self.config.relays.is_empty() {
            self.config.relays.clone()
        } else if let Ok(url) = std::env::var("CINEMINHA_RELAY") {
            vec![url]
        } else {
            serde_json::from_str::<Vec<String>>(include_str!("../assets/relays.json"))?
        };
        for url in relays {
            let tx = self.tx.clone();
            let out = self.signal_tx.clone();
            let keys = self.keys.clone();
            let peer_id = self.id.clone();
            let task = tokio::spawn(async move {
                let key = secp256k1::Keypair::from_seckey_byte_array(
                    secp256k1::SECP256K1,
                    rand::random(),
                )
                .unwrap();
                let mut delay = 1;
                loop {
                    let connect = tokio::time::timeout(
                        Duration::from_secs(10),
                        tokio_tungstenite::connect_async(&url),
                    )
                    .await;
                    if let Ok(Ok((socket, _))) = connect {
                        delay = 1;
                        let (mut sink, mut stream) = socket.split();
                        let mut rx = out.subscribe();
                        let kind = |topic: &str| {
                            20_000 + topic.bytes().map(u32::from).sum::<u32>() % 10_000
                        };
                        let request = json!(["REQ","cineminha",{"kinds":[kind(&keys.root),kind(&keys.own)],"since":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),"#x":[keys.root,keys.own]}]);
                        if sink.send(request.to_string().into()).await.is_err() {
                            continue;
                        }
                        let mut announce = tokio::time::interval(Duration::from_secs(20));
                        loop {
                            tokio::select! {
                                _=announce.tick()=>{if let Ok(event)=protocol::nostr_event(&keys.root,&json!({"peerId":peer_id,"nonce":protocol::id()}),&key)&& sink.send(event.to_string().into()).await.is_err(){break}},
                                message=rx.recv()=>{match message{Ok(raw)=>{if let Ok(v)=serde_json::from_str::<Value>(&raw)&& let(Some(topic),Some(content))=(v[0].as_str(),v.get(1))&& let Ok(event)=protocol::nostr_event(topic,content,&key)&& sink.send(event.to_string().into()).await.is_err(){break}},Err(broadcast::error::RecvError::Lagged(_))=>continue,Err(_)=>return}},
                                message=stream.next()=>{match message{
                                    Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text)))=>{if let Ok(v)=serde_json::from_str::<Value>(&text)&& v[0]=="EVENT"{let event=&v[2];if valid_event(event,&keys){let _=tx.send(Internal::Relay(event.clone()));}}},
                                    Some(Ok(tokio_tungstenite::tungstenite::Message::Ping(data)))=>{if sink.send(tokio_tungstenite::tungstenite::Message::Pong(data)).await.is_err(){break}},
                                    Some(Ok(_))=>{},_=>break,
                                }}
                            }
                        }
                    }
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                    delay = (delay * 2).min(30);
                }
            });
            self.relay_tasks.push(task);
        }
        Ok(())
    }
    fn relay_signal(&self, peer: &str, value: Value) {
        let topic = protocol::topic(&format!("{}@{peer}", self.keys.plaintext));
        let _ = self.signal_tx.send(json!([topic, value]).to_string());
    }
    async fn send(&self, peer: &str, action: &str, value: &Value) -> Result<()> {
        let dc = self
            .peers
            .get(peer)
            .and_then(|p| p.dc.clone())
            .context("Canal ainda não conectado")?;
        dc.send(&Bytes::from(protocol::frame(
            &self.keys.namespace,
            action,
            value,
        )?))
        .await?;
        Ok(())
    }
    async fn broadcast(&self, action: &str, value: &Value) {
        for (id, peer) in &self.peers {
            if peer.active {
                let _ = self.send(id, action, value).await;
            }
        }
    }
    async fn bind_channel(&mut self, id: String, dc: Arc<RTCDataChannel>) {
        let tx = self.tx.clone();
        let peer = id.clone();
        dc.on_open(Box::new(move || {
            let tx = tx.clone();
            let peer = peer.clone();
            Box::pin(async move {
                let _ = tx.send(Internal::Opened(peer));
            })
        }));
        let tx = self.tx.clone();
        let peer = id.clone();
        dc.on_message(Box::new(move |msg| {
            let tx = tx.clone();
            let peer = peer.clone();
            Box::pin(async move {
                let _ = tx.send(Internal::Data(peer, msg.data.to_vec()));
            })
        }));
        if let Some(p) = self.peers.get_mut(&id) {
            p.dc = Some(dc);
        }
    }
    async fn new_peer(
        &mut self,
        id: &str,
        offer_id: String,
        initiator: bool,
    ) -> Result<Arc<RTCPeerConnection>> {
        if self.peers.len() >= 12 {
            return Err(anyhow!("Sala cheia"));
        }
        let mut media = MediaEngine::default();
        media.register_default_codecs()?;
        let registry = register_default_interceptors(Registry::new(), &mut media)?;
        let api = APIBuilder::new()
            .with_media_engine(media)
            .with_interceptor_registry(registry)
            .build();
        let pc = Arc::new(
            api.new_peer_connection(RTCConfiguration {
                ice_servers: self.ice.clone(),
                ..Default::default()
            })
            .await?,
        );
        let tx = self.tx.clone();
        let peer = id.to_owned();
        pc.on_ice_candidate(Box::new(move|candidate|{let tx=tx.clone();let peer=peer.clone();Box::pin(async move{if let Some(c)=candidate&& let Ok(c)=c.to_json(){let _=tx.send(Internal::Signal(peer,json!({"type":"candidate","sdp":serde_json::to_string(&c).unwrap_or_default()})));}})}));
        let tx = self.tx.clone();
        let peer = id.to_owned();
        pc.on_data_channel(Box::new(move |dc| {
            let tx = tx.clone();
            let peer = peer.clone();
            Box::pin(async move {
                let _ = tx.send(Internal::Channel(peer, dc));
            })
        }));
        let tx = self.tx.clone();
        let peer = id.to_owned();
        pc.on_peer_connection_state_change(Box::new(move |state| {
            let tx = tx.clone();
            let peer = peer.clone();
            Box::pin(async move {
                if matches!(
                    state,
                    RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed
                ) {
                    let _ = tx.send(Internal::Gone(peer));
                }
            })
        }));
        let frames = self.frames.clone();
        let ctx = self.ctx.clone();
        let tx = self.tx.clone();
        let peer = id.to_owned();
        let weak_pc = Arc::downgrade(&pc);
        pc.on_track(Box::new(move |track, _, _| {
            let weak_pc=weak_pc.clone();
            let frames=frames.clone();let ctx=ctx.clone();let tx=tx.clone();let peer=peer.clone();
            Box::pin(async move {
                // The upstream callback is serialized. Keep stream processing in
                // an owned task so audio cannot prevent the video callback running.
                let register=tx.clone();let task_peer=peer.clone();
                let task=tokio::spawn(async move {
                    let codec=track.codec();let video=codec.capability.mime_type.starts_with("video/");
                    if std::env::var_os("CINEMINHA_TEST_AUDIO_SINK").is_some(){println!("TEST_TRACK {} {}",codec.capability.mime_type,codec.payload_type);}
                    let receiver=match media::Receiver::new(&peer,&codec.capability.mime_type,codec.payload_type,frames,ctx){
                        Ok(receiver)=>receiver,
                        Err(e)=>{let _=tx.send(Internal::Error(format!("Reprodução: {e}")));return}
                    };
                    let mut interval=tokio::time::interval(Duration::from_secs(2));
                    loop{tokio::select!{
                        packet=track.read_rtp()=>{match packet{
                            Ok((packet,_))=>{if let Err(e)=receiver.push(&packet){let _=tx.send(Internal::Error(e.to_string()));break}},
                            Err(_)=>break,
                        }},
                        _=interval.tick(),if video=>{
                            let Some(pc)=weak_pc.upgrade()else{break};
                            if pc.write_rtcp(&[Box::new(webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication{sender_ssrc:0,media_ssrc:track.ssrc()})]).await.is_err(){break}
                        }
                    }}
                });
                let _=register.send(Internal::ReceiverTask(task_peer,task));
            })
        }));
        self.peers.insert(
            id.into(),
            Peer {
                pc: pc.clone(),
                dc: None,
                decoder: Default::default(),
                offer_id,
                active: false,
                local_ready: false,
                remote_ready: false,
                challenge: String::new(),
                created: Instant::now(),
                tasks: vec![],
                screen_senders: vec![],
                voice_sender: None,
                renegotiate: false,
            },
        );
        if initiator {
            let dc = pc.create_data_channel("data", None).await?;
            self.bind_channel(id.into(), dc).await;
        }
        Ok(pc)
    }
    async fn signal(&mut self, id: &str, value: Value) -> Result<()> {
        let peer = self.peers.get(id).context("Peer desconhecido")?;
        let pc = peer.pc.clone();
        match value["type"].as_str() {
            Some("offer") => {
                if pc.signaling_state()
                    == webrtc::peer_connection::signaling_state::RTCSignalingState::HaveLocalOffer
                {
                    if self.id.as_str() < id {
                        return Ok(());
                    }
                    let mut rollback = pc
                        .local_description()
                        .await
                        .context("Oferta local ausente")?;
                    rollback.sdp_type =
                        webrtc::peer_connection::sdp::sdp_type::RTCSdpType::Rollback;
                    pc.set_local_description(rollback).await?;
                    self.peers.get_mut(id).unwrap().renegotiate = true;
                }
                pc.set_remote_description(RTCSessionDescription::offer(
                    value["sdp"].as_str().context("SDP ausente")?.into(),
                )?)
                .await?;
                self.flush_candidates(id).await;
                let answer = pc.create_answer(None).await?;
                pc.set_local_description(answer.clone()).await?;
                self.output_signal(id, json!({"type":"answer","sdp":answer.sdp}))
                    .await?;
            }
            Some("answer") => {
                pc.set_remote_description(RTCSessionDescription::answer(
                    value["sdp"].as_str().context("SDP ausente")?.into(),
                )?)
                .await?;
                self.flush_candidates(id).await;
            }
            Some("candidate") => {
                let candidate: RTCIceCandidateInit =
                    serde_json::from_str(value["sdp"].as_str().context("Candidato ausente")?)?;
                if pc.remote_description().await.is_some() {
                    let _ = pc.add_ice_candidate(candidate).await;
                } else {
                    let queue = self.pending_candidates.entry(id.into()).or_default();
                    if queue.len() < 128 {
                        queue.push(candidate)
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }
    async fn flush_candidates(&mut self, id: &str) {
        if let Some(candidates) = self.pending_candidates.remove(id)
            && let Some(p) = self.peers.get(id)
        {
            for c in candidates {
                let _ = p.pc.add_ice_candidate(c).await;
            }
        }
    }
    async fn output_signal(&self, id: &str, mut value: Value) -> Result<()> {
        if matches!(value["type"].as_str(), Some("offer" | "answer"))
            && let Some(sdp) = value["sdp"].as_str()
        {
            value["sdp"] = json!(clean_sdp(sdp));
        }
        let p = self.peers.get(id).context("Peer ausente")?;
        if p.active {
            return self.send(id, "@_signal", &value).await;
        }
        let kind = value["type"].as_str().context("Tipo ausente")?;
        let encrypted = self
            .keys
            .encrypt(value["sdp"].as_str().context("SDP ausente")?)?;
        let mut message = json!({"peerId":self.id,"offerId":p.offer_id});
        message[kind] = json!(encrypted);
        self.relay_signal(id, message);
        Ok(())
    }
    async fn relay(&mut self, event: Value) -> Result<()> {
        let event_id = event["id"].as_str().unwrap_or("");
        if !self.seen.insert(event_id.into()) {
            return Ok(());
        }
        if self.seen.len() > 4096 {
            self.seen.clear();
        }
        let v: Value =
            serde_json::from_str(event["content"].as_str().context("Conteúdo ausente")?)?;
        let id = v["peerId"].as_str().unwrap_or("").to_owned();
        if id == self.id || id.len() != 20 || !id.bytes().all(|c| c.is_ascii_alphanumeric()) {
            return Ok(());
        }
        if self.peers.get(&id).is_some_and(|p| p.active) {
            return Ok(());
        }
        if let Some(offer) = v["offer"].as_str() {
            if self.peers.contains_key(&id) {
                return Ok(());
            }
            let offer = self.keys.decrypt(offer)?;
            self.new_peer(&id, v["offerId"].as_str().unwrap_or("").into(), false)
                .await?;
            self.signal(&id, json!({"type":"offer","sdp":offer}))
                .await?;
        } else if let Some(answer) = v["answer"].as_str() {
            if self
                .peers
                .get(&id)
                .is_some_and(|p| v["offerId"] == p.offer_id)
            {
                self.signal(
                    &id,
                    json!({"type":"answer","sdp":self.keys.decrypt(answer)?}),
                )
                .await?;
            }
        } else if let Some(candidate) = v["candidate"].as_str() {
            if self.peers.contains_key(&id) {
                self.signal(
                    &id,
                    json!({"type":"candidate","sdp":self.keys.decrypt(candidate)?}),
                )
                .await?;
            }
        } else if !self.peers.contains_key(&id) {
            if self.id < id {
                let pc = self.new_peer(&id, protocol::id(), true).await?;
                let offer = pc.create_offer(None).await?;
                pc.set_local_description(offer.clone()).await?;
                self.output_signal(&id, json!({"type":"offer","sdp":offer.sdp}))
                    .await?;
            } else {
                self.relay_signal(&id, json!({"peerId":self.id}));
            }
        }
        Ok(())
    }
    async fn opened(&mut self, id: &str) -> Result<()> {
        let dc = self
            .peers
            .get(id)
            .and_then(|p| p.dc.clone())
            .context("Canal ausente")?;
        dc.send(&Bytes::from(protocol::presence(&self.keys.namespace, true)))
            .await?;
        if self.id.as_str() < id {
            let challenge = protocol::id() + &protocol::id();
            self.peers.get_mut(id).unwrap().challenge = challenge.clone();
            self.send(
                id,
                "@_hsdata",
                &json!({"__trystero_pw":"challenge","c":challenge}),
            )
            .await?;
        }
        Ok(())
    }
    async fn data(&mut self, id: &str, bytes: Vec<u8>) -> Result<()> {
        let Some(peer) = self.peers.get_mut(id) else {
            return Ok(());
        };
        let decoded = peer.decoder.decode(&self.keys.namespace, &bytes)?;
        if let Some(control) = decoded.control
            && let Some(dc) = &peer.dc
        {
            dc.send(&Bytes::from(control)).await?;
        }
        let Some((action, value)) = decoded.action else {
            return Ok(());
        };
        match action.as_str() {
            "@_hsdata" => {
                if value["__trystero_pw"] == "challenge" && self.id.as_str() > id {
                    let c = value["c"].as_str().context("Desafio inválido")?;
                    let h = protocol::hash(&format!(
                        "{c}:{}:{}:{}",
                        self.password, self.config.app_id, self.room_id
                    ));
                    self.send(id, "@_hsdata", &json!({"__trystero_pw":"response","h":h}))
                        .await?;
                } else if value["__trystero_pw"] == "response" && self.id.as_str() < id {
                    let c = &self.peers[id].challenge;
                    anyhow::ensure!(
                        !c.is_empty()
                            && value["h"]
                                == protocol::hash(&format!(
                                    "{c}:{}:{}:{}",
                                    self.password, self.config.app_id, self.room_id
                                )),
                        "Autenticação do participante falhou"
                    );
                } else {
                    return Err(anyhow!("Handshake inválido"));
                }
                self.peers.get_mut(id).unwrap().local_ready = true;
                self.send(id, "@_hsready", &json!("")).await?;
                self.activate(id).await?;
            }
            "@_hsready" => {
                self.peers.get_mut(id).unwrap().remote_ready = true;
                self.activate(id).await?;
            }
            _ if !self.peers[id].active => {}
            "@_ping" => {
                self.send(id, "@_pong", &json!("")).await?;
            }
            "@_signal" => {
                self.signal(id, value).await?;
            }
            "@_leave" => {
                self.remove(id).await;
            }
            "hello" => {
                self.emit(Event::Peer(id.into(), value));
            }
            "chat" => {
                self.emit(Event::Chat(value));
            }
            "hist" => {
                if let Some(history) = value.as_array() {
                    for message in history.iter().rev().take(80).rev() {
                        self.emit(Event::Chat(message.clone()));
                    }
                }
            }
            "share" => {
                self.emit(Event::RemoteShare(
                    id.into(),
                    value["on"].as_bool().unwrap_or(false),
                ));
            }
            "pausa" => self.emit(Event::Status("Alguém pediu uma pausa".into())),
            "adm" => {
                self.emit(Event::Status(
                    "Você recebeu uma ação de administração da sala".into(),
                ));
            }
            _ => {}
        }
        Ok(())
    }
    async fn activate(&mut self, id: &str) -> Result<()> {
        let p = self.peers.get_mut(id).unwrap();
        if p.active || !p.local_ready || !p.remote_ready {
            return Ok(());
        }
        p.active = true;
        self.send(id, "hello", &self.hello()).await?;
        self.update_media(id).await?;
        self.send(
            id,
            "share",
            &json!({"on":self.screen.is_some(),"kind":"tela"}),
        )
        .await?;
        self.emit(Event::Status("Conectado à sala".into()));
        Ok(())
    }
    async fn update_media(&mut self, id: &str) -> Result<()> {
        let pc = self.peers[id].pc.clone();
        if !self.peers[id].active {
            return Ok(());
        }
        if self.screen.is_some() && self.peers[id].screen_senders.is_empty() {
            self.send(
                id,
                "@_stream",
                &json!({"k":"cineminha-screen","s":"cineminha-screen","m":{"screen":1}}),
            )
            .await?;
            for track in [&self.video, &self.sound] {
                let sender = pc
                    .add_track(track.clone() as Arc<dyn TrackLocal + Send + Sync>)
                    .await?;
                let read = sender.clone();
                self.peers
                    .get_mut(id)
                    .unwrap()
                    .tasks
                    .push(tokio::spawn(async move {
                        while read.read_rtcp().await.is_ok() {}
                    }));
                self.peers.get_mut(id).unwrap().screen_senders.push(sender);
            }
            self.peers.get_mut(id).unwrap().renegotiate = true;
        } else if self.screen.is_none() && !self.peers[id].screen_senders.is_empty() {
            for sender in std::mem::take(&mut self.peers.get_mut(id).unwrap().screen_senders) {
                pc.remove_track(&sender).await?;
            }
            self.peers.get_mut(id).unwrap().renegotiate = true;
        }
        if self.mic.is_some() && self.peers[id].voice_sender.is_none() {
            self.send(
                id,
                "@_stream",
                &json!({"k":"cineminha-voice","s":"cineminha-voice","m":{"voice":1}}),
            )
            .await?;
            let sender = pc
                .add_track(self.voice.clone() as Arc<dyn TrackLocal + Send + Sync>)
                .await?;
            let read = sender.clone();
            self.peers
                .get_mut(id)
                .unwrap()
                .tasks
                .push(tokio::spawn(async move {
                    while read.read_rtcp().await.is_ok() {}
                }));
            self.peers.get_mut(id).unwrap().voice_sender = Some(sender);
            self.peers.get_mut(id).unwrap().renegotiate = true;
        } else if self.mic.is_none()
            && let Some(sender) = self.peers.get_mut(id).unwrap().voice_sender.take()
        {
            pc.remove_track(&sender).await?;
            self.peers.get_mut(id).unwrap().renegotiate = true;
        }
        if self.peers[id].renegotiate
            && pc.signaling_state()
                == webrtc::peer_connection::signaling_state::RTCSignalingState::Stable
        {
            self.peers.get_mut(id).unwrap().renegotiate = false;
            let offer = pc.create_offer(None).await?;
            pc.set_local_description(offer.clone()).await?;
            self.send(id, "@_signal", &json!({"type":"offer","sdp":offer.sdp}))
                .await?;
        }
        Ok(())
    }
    async fn update_all_media(&mut self) -> Result<()> {
        let ids = self.peers.keys().cloned().collect::<Vec<_>>();
        for id in ids {
            self.update_media(&id).await?;
        }
        Ok(())
    }
    async fn remove(&mut self, id: &str) {
        if let Some(p) = self.peers.remove(id) {
            let _ = p.pc.close().await;
        }
        self.pending_candidates.remove(id);
        if let Ok(mut f) = self.frames.lock() {
            f.remove(id);
        }
        self.emit(Event::Gone(id.into()));
    }
    async fn command(&mut self, command: Command) -> Result<bool> {
        match command {
            Command::Leave => return Ok(false),
            Command::Chat(text) => {
                let message = json!({"id":protocol::id(),"from":self.id,"key":self.identity.key,"name":self.identity.name,"text":text,"ts":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis()});
                self.broadcast("chat", &message).await;
                self.emit(Event::Chat(message));
            }
            Command::Mute(muted) => {
                self.mic = None;
                self.muted = muted;
                if !muted {
                    match media::audio(self.voice.clone(), None, true, self.test) {
                        Ok(p) => self.mic = Some(p),
                        Err(e) => {
                            self.muted = true;
                            self.emit(Event::Muted(true));
                            return Err(e);
                        }
                    }
                }
                self.broadcast("hello", &self.hello()).await;
                self.update_all_media().await?;
            }
            Command::Share {
                on,
                game,
                audio,
                device,
            } => {
                self.screen = None;
                self.audio = None;
                if on {
                    self.emit(Event::Status(
                        "Selecione o monitor que quer transmitir".into(),
                    ));
                    match ScreenCapture::start(self.video.clone(), self.encoder, game, self.test)
                        .await
                    {
                        Ok(screen) => {
                            self.screen = Some(screen);
                            if audio {
                                let device = if device.is_empty() {
                                    media::default_monitor()?
                                } else {
                                    device
                                };
                                match media::audio(
                                    self.sound.clone(),
                                    Some(&device),
                                    false,
                                    self.test,
                                ) {
                                    Ok(p) => self.audio = Some(p),
                                    Err(e) => {
                                        self.screen = None;
                                        return Err(e);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            self.emit(Event::Sharing(false));
                            return Err(e);
                        }
                    }
                }
                self.update_all_media().await?;
                self.broadcast("share", &json!({"on":on,"kind":"tela","game":game}))
                    .await;
                self.emit(Event::Sharing(on));
                self.emit(Event::Status(
                    if on {
                        "Transmitindo tela inteira com captura nativa"
                    } else {
                        "Transmissão encerrada"
                    }
                    .into(),
                ));
            }
            Command::Pause => self.broadcast("pausa", &json!({})).await,
            Command::Join { .. } => {}
        }
        Ok(true)
    }
    pub async fn run(mut self, commands: &mut mpsc::UnboundedReceiver<Command>) -> Result<()> {
        self.emit(Event::Joined(self.encoder.label().into()));
        let mut tick = tokio::time::interval(Duration::from_secs(2));
        loop {
            tokio::select! {
                command=commands.recv()=>{let Some(command)=command else{break};match self.command(command).await{Ok(true)=>{},Ok(false)=>break,Err(e)=>{self.emit(Event::Sharing(self.screen.is_some()));self.emit(Event::Error(e.to_string()));}}},
                message=self.rx.recv()=>{if let Some(message)=message{let result=match message{
                    Internal::Relay(event)=>self.relay(event).await,
                    Internal::Signal(id,v)=>self.output_signal(&id,v).await,
                    Internal::Channel(id,dc)=>{self.bind_channel(id,dc).await;Ok(())},
                    Internal::Opened(id)=>self.opened(&id).await,
                Internal::ReceiverTask(id,task)=>{if let Some(peer)=self.peers.get_mut(&id){peer.tasks.push(task);}else{task.abort();}Ok(())},
                    Internal::Data(id,b)=>self.data(&id,b).await,
                    Internal::Gone(id)=>{self.remove(&id).await;Ok(())},
                    Internal::Error(e)=>{self.emit(Event::Error(e));Ok(())},
                };if let Err(e)=result{self.emit(Event::Error(e.to_string()));}}},
                _=tick.tick()=>{
                    let _=self.update_all_media().await;
                    let expired=self.peers.iter().filter(|(_,p)|!p.active&&p.created.elapsed()>Duration::from_secs(35)).map(|(id,_)|id.clone()).collect::<Vec<_>>();for id in expired{self.remove(&id).await;}
                    let error=self.screen.as_ref().and_then(|s|s.media.error()).or_else(||self.audio.as_ref().and_then(Pipeline::error));
                    if let Some(e)=error{self.screen=None;self.audio=None;self.broadcast("share",&json!({"on":false})).await;self.emit(Event::Sharing(false));self.emit(Event::Error(e));}
                }
            }
        }
        self.broadcast("@_leave", &json!("")).await;
        let peers = self.peers.keys().cloned().collect::<Vec<_>>();
        for id in peers {
            self.remove(&id).await;
        }
        Ok(())
    }
}
// Native capture does not need browser RTP extensions. Avoid assigning conflicting
// extension IDs when a Chrome offer is rolled back during simultaneous shares.
fn clean_sdp(sdp: &str) -> String {
    sdp.lines()
        .filter(|l| !l.starts_with("a=extmap:"))
        .collect::<Vec<_>>()
        .join("\r\n")
        + "\r\n"
}
fn valid_event(event: &Value, keys: &RoomKeys) -> bool {
    let Some(content) = event["content"].as_str() else {
        return false;
    };
    if content.len() > 100_000 {
        return false;
    }
    let topic = event["tags"]
        .as_array()
        .and_then(|a| a.iter().find(|t| t[0] == "x"))
        .and_then(|t| t[1].as_str());
    if topic != Some(keys.root.as_str()) && topic != Some(keys.own.as_str()) {
        return false;
    }
    let payload = json!([
        0,
        event["pubkey"],
        event["created_at"],
        event["kind"],
        event["tags"],
        content
    ]);
    let digest = protocol::hash(&payload.to_string());
    if event["id"] != digest {
        return false;
    }
    let Ok(pk) = event["pubkey"]
        .as_str()
        .unwrap_or("")
        .parse::<secp256k1::XOnlyPublicKey>()
    else {
        return false;
    };
    let Ok(sig) = event["sig"]
        .as_str()
        .unwrap_or("")
        .parse::<secp256k1::schnorr::Signature>()
    else {
        return false;
    };
    let Ok(bytes) = hex::decode(digest) else {
        return false;
    };
    secp256k1::SECP256K1
        .verify_schnorr(&sig, &bytes, &pk)
        .is_ok()
}

pub fn spawn(
    config: Config,
    events: std::sync::mpsc::Sender<Event>,
    ctx: eframe::egui::Context,
    frames: Frames,
) -> mpsc::UnboundedSender<Command> {
    let (tx, mut rx) = mpsc::unbounded_channel();
    std::thread::Builder::new()
        .name("cineminha-media".into())
        .spawn(move || {
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
                .unwrap();
            runtime.block_on(async move {
                while let Some(command) = rx.recv().await {
                    if let Command::Join {
                        identity,
                        password,
                        channel,
                    } = command
                    {
                        match Room::new(
                            config.clone(),
                            identity,
                            password,
                            channel,
                            Frontend {
                                events: events.clone(),
                                ctx: ctx.clone(),
                                frames: frames.clone(),
                            },
                            false,
                        )
                        .await
                        {
                            Ok(room) => {
                                if let Err(e) = room.run(&mut rx).await {
                                    let _ = events.send(Event::Error(e.to_string()));
                                }
                            }
                            Err(e) => {
                                let _ = events.send(Event::Error(e.to_string()));
                            }
                        }
                        let _ = events.send(Event::Left);
                        ctx.request_repaint();
                    }
                }
            });
        })
        .expect("Não foi possível criar a thread de mídia");
    tx
}

/// Local integration harness: synthetic media and a temporary loopback-only relay.
/// Never accesses the live service, physical screen, microphone or audio output.
pub async fn test_session() -> Result<()> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let url = format!("ws://{}", listener.local_addr()?);
    println!("TEST_RELAY {url}");
    let (events, _) = broadcast::channel::<Value>(256);
    let relay = tokio::spawn(async move {
        while let Ok((socket, _)) = listener.accept().await {
            let events = events.clone();
            tokio::spawn(async move {
                let Ok(socket) = tokio_tungstenite::accept_async(socket).await else {
                    return;
                };
                let (mut out, mut input) = socket.split();
                let mut rx = events.subscribe();
                let mut subscription = String::new();
                let mut topics = HashSet::<String>::new();
                loop {
                    tokio::select! {
                        event=rx.recv()=>{if let Ok(event)=event{let topic=event["tags"].as_array().and_then(|a|a.iter().find(|t|t[0]=="x")).and_then(|t|t[1].as_str()).unwrap_or("");if topics.contains(topic)&& out.send(json!(["EVENT",subscription,event]).to_string().into()).await.is_err(){break}}},
                        message=input.next()=>{match message{Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text)))=>{if let Ok(v)=serde_json::from_str::<Value>(&text){match v[0].as_str(){
                            Some("REQ")=>{subscription=v[1].as_str().unwrap_or("").into();topics.clear();if let Some(filters)=v.as_array(){for filter in filters.iter().skip(2){if let Some(tags)=filter["#x"].as_array(){for t in tags{if let Some(s)=t.as_str(){topics.insert(s.into());}}}}}let _=out.send(json!(["EOSE",subscription]).to_string().into()).await;},
                            Some("EVENT")=>{let _=events.send(v[1].clone());},_=>{}
                        }}},Some(Ok(_))=>{},_=>break}}
                    }
                }
            });
        }
    });
    let mut config: Config = serde_json::from_str(include_str!("../assets/config.json"))?;
    config.app_id = "cineminha-native-test".into();
    config.relays = vec![url];
    let (events_tx, events_rx) = std::sync::mpsc::channel();
    let (commands, mut rx) = mpsc::unbounded_channel();
    let frames: Frames = Arc::new(media::FrameStore::default());
    let ctx = eframe::egui::Context::default();
    let room = Room::new(
        config,
        Identity {
            key: "g:nativo".into(),
            name: "Nativo".into(),
        },
        "test".into(),
        String::new(),
        Frontend {
            events: events_tx,
            ctx,
            frames: frames.clone(),
        },
        true,
    )
    .await?;
    let sender = commands.clone();
    let output = std::thread::spawn(move || {
        let mut started = false;
        while let Ok(event) = events_rx.recv() {
            match event {
                Event::Peer(_, data) => {
                    println!("TEST_PEER {}", data["name"]);
                    if !started {
                        started = true;
                        let _ = sender.send(Command::Chat("Olá do Rust nativo".into()));
                        let _ = sender.send(Command::Share {
                            on: true,
                            game: false,
                            audio: true,
                            device: "test".into(),
                        });
                        let _ = sender.send(Command::Mute(false));
                    }
                }
                Event::Chat(data) => println!("TEST_CHAT {}", data["text"]),
                Event::Error(error) => println!("TEST_ERROR {error}"),
                Event::Sharing(on) => println!("TEST_SHARING {on}"),
                _ => {}
            }
        }
    });
    let sender = commands.clone();
    let watch = tokio::spawn(async move {
        for _ in 0..480 {
            tokio::time::sleep(Duration::from_millis(250)).await;
            if frames.lock().is_ok_and(|f| !f.is_empty()) {
                println!("TEST_REMOTE_VIDEO decoded");
            }
        }
        let _ = sender.send(Command::Leave);
    });
    let result = room.run(&mut rx).await;
    watch.abort();
    relay.abort();
    drop(commands);
    let _ = output.join();
    result
}
