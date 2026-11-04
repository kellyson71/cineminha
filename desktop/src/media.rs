//! Native PipeWire/GStreamer capture. Encode once and fan out RTP to all peers.
use anyhow::{Context, Result, anyhow};
use gst::prelude::*;
use gstreamer as gst;
use gstreamer_app::{AppSink, AppSrc};
use gstreamer_video::{VideoFrameExt, VideoInfo};
use std::{
    collections::HashMap,
    os::fd::{AsRawFd, OwnedFd},
    sync::{Arc, Mutex},
};
use tokio::sync::mpsc;
use webrtc::track::track_local::TrackLocalWriter;
use webrtc::{
    rtp::packet::Packet,
    track::track_local::track_local_static_rtp::TrackLocalStaticRTP,
    util::marshal::{Marshal, Unmarshal},
};

pub struct Frame {
    pub size: [usize; 2],
    pub rgba: Vec<u8>,
    pub serial: u64,
}
pub struct FrameStore {
    frames: Mutex<HashMap<String, Frame>>,
    visible: std::sync::atomic::AtomicBool,
}
impl Default for FrameStore {
    fn default() -> Self {
        Self {
            frames: Mutex::new(HashMap::new()),
            visible: std::sync::atomic::AtomicBool::new(true),
        }
    }
}
impl std::ops::Deref for FrameStore {
    type Target = Mutex<HashMap<String, Frame>>;
    fn deref(&self) -> &Self::Target {
        &self.frames
    }
}
impl FrameStore {
    pub fn set_visible(&self, visible: bool) {
        self.visible
            .store(visible, std::sync::atomic::Ordering::Relaxed);
    }
}
pub type Frames = Arc<FrameStore>;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Encoder {
    Va,
    Nvidia,
    Vp8,
}
impl Encoder {
    pub fn detect() -> Self {
        if gst::ElementFactory::find("vah264enc").is_some() {
            Self::Va
        } else if gst::ElementFactory::find("nvh264enc").is_some() {
            Self::Nvidia
        } else {
            Self::Vp8
        }
    }
    pub fn mime(self) -> &'static str {
        if self == Self::Vp8 {
            "video/VP8"
        } else {
            "video/H264"
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Va => "H.264 · GPU VA-API",
            Self::Nvidia => "H.264 · GPU NVIDIA",
            Self::Vp8 => "VP8 · CPU",
        }
    }
    fn pipeline(self, fps: u32) -> String {
        match self {
            Self::Va => format!(
                "videoconvert ! video/x-raw,format=NV12 ! vah264enc bitrate=5000 key-int-max={} ! h264parse ! rtph264pay pt=102 config-interval=-1",
                fps * 2
            ),
            Self::Nvidia => format!(
                "videoconvert ! video/x-raw,format=NV12 ! nvh264enc bitrate=5000 gop-size={} ! h264parse ! rtph264pay pt=102 config-interval=-1",
                fps * 2
            ),
            Self::Vp8 => format!(
                "videoconvert ! vp8enc deadline=1 cpu-used=8 threads=4 target-bitrate=3500000 keyframe-max-dist={} ! rtpvp8pay pt=96 picture-id-mode=15-bit",
                fps * 2
            ),
        }
    }
}

pub struct Pipeline {
    pub pipeline: gst::Pipeline,
    tasks: Vec<tokio::task::JoinHandle<()>>,
}
impl Drop for Pipeline {
    fn drop(&mut self) {
        let _ = self.pipeline.set_state(gst::State::Null);
        for task in &self.tasks {
            task.abort();
        }
    }
}
impl Pipeline {
    fn start(
        description: &str,
        track: Arc<TrackLocalStaticRTP>,
        device: Option<&str>,
    ) -> Result<Self> {
        let pipeline = gst::parse::launch(description)?
            .downcast::<gst::Pipeline>()
            .map_err(|_| anyhow!("Pipeline inválido"))?;
        if let Some(device) = device.filter(|s| !s.is_empty()) {
            pipeline
                .by_name("source")
                .context("Fonte de som ausente")?
                .set_property("device", device);
        }
        let sink = pipeline
            .by_name("rtp")
            .context("Saída RTP ausente")?
            .downcast::<AppSink>()
            .map_err(|_| anyhow!("Saída inválida"))?;
        let (tx, mut rx) = mpsc::channel::<Vec<u8>>(256);
        sink.set_callbacks(
            gstreamer_app::AppSinkCallbacks::builder()
                .new_sample(move |s| {
                    let sample = s.pull_sample().map_err(|_| gst::FlowError::Eos)?;
                    if let Some(buffer) = sample.buffer()
                        && let Ok(map) = buffer.map_readable()
                    {
                        let _ = tx.try_send(map.as_slice().to_vec());
                    }
                    Ok(gst::FlowSuccess::Ok)
                })
                .build(),
        );
        let task = tokio::spawn(async move {
            while let Some(packet) = rx.recv().await {
                if let Ok(packet) = Packet::unmarshal(&mut packet.as_slice()) {
                    let _ = track.write_rtp(&packet).await;
                }
            }
        });
        pipeline.set_state(gst::State::Playing)?;
        Ok(Self {
            pipeline,
            tasks: vec![task],
        })
    }
    pub fn error(&self) -> Option<String> {
        self.pipeline
            .bus()?
            .pop_filtered(&[gst::MessageType::Error])
            .and_then(|m| match m.view() {
                gst::MessageView::Error(e) => Some(e.error().to_string()),
                _ => None,
            })
    }
}

pub struct ScreenCapture {
    pub media: Pipeline,
    // These own the portal session and fd for the entire capture lifetime.
    _remote: Option<OwnedFd>,
    _portal: Option<ashpd::desktop::Session<ashpd::desktop::screencast::Screencast>>,
}
impl ScreenCapture {
    pub async fn start(
        track: Arc<TrackLocalStaticRTP>,
        encoder: Encoder,
        game: bool,
        test: bool,
    ) -> Result<Self> {
        let fps = if game { 60 } else { 30 };
        let mut remote = None;
        let mut portal = None;
        let source = if test {
            "videotestsrc is-live=true pattern=ball".into()
        } else if std::env::var("XDG_SESSION_TYPE").is_ok_and(|s| s == "wayland") {
            use ashpd::desktop::{
                PersistMode,
                screencast::{CursorMode, Screencast, SelectSourcesOptions, SourceType},
            };
            let proxy = Screencast::new().await?;
            let session = proxy.create_session(Default::default()).await?;
            proxy
                .select_sources(
                    &session,
                    SelectSourcesOptions::default()
                        .set_sources(Some(SourceType::Monitor.into()))
                        .set_multiple(false)
                        .set_cursor_mode(CursorMode::Embedded)
                        .set_persist_mode(PersistMode::DoNot),
                )
                .await?
                .response()?;
            let response = proxy
                .start(&session, None, Default::default())
                .await?
                .response()?;
            let stream = response
                .streams()
                .first()
                .context("Nenhum monitor selecionado")?;
            let fd = proxy
                .open_pipe_wire_remote(&session, Default::default())
                .await?;
            let source = format!(
                "pipewiresrc fd={} path={} do-timestamp=true",
                fd.as_raw_fd(),
                stream.pipe_wire_node_id()
            );
            remote = Some(fd);
            portal = Some(session);
            source
        } else {
            "ximagesrc use-damage=false show-pointer=true".into()
        };
        // Bound capture size before encoding, preserving the display aspect ratio.
        let width = if game { 1280 } else { 1920 };
        let description = format!(
            "{source} ! queue max-size-buffers=2 leaky=downstream ! videorate ! videoscale add-borders=true ! video/x-raw,width={width},height={},framerate={fps}/1 ! {} ! appsink name=rtp sync=false max-buffers=8 drop=true",
            width * 9 / 16,
            encoder.pipeline(fps)
        );
        let media = Pipeline::start(&description, track, None)?;
        Ok(Self {
            media,
            _remote: remote,
            _portal: portal,
        })
    }
}

pub fn audio(
    track: Arc<TrackLocalStaticRTP>,
    device: Option<&str>,
    voice: bool,
    test: bool,
) -> Result<Pipeline> {
    let source = if test {
        "audiotestsrc is-live=true wave=sine volume=0.05".to_string()
    } else {
        "pulsesrc name=source do-timestamp=true".to_string()
    };
    let pipeline = Pipeline::start(
        &format!(
            "{source} ! queue max-size-time=100000000 leaky=downstream ! audioconvert ! audioresample ! audio/x-raw,rate=48000,channels={} ! opusenc bitrate={} audio-type={} ! rtpopuspay pt=111 ! appsink name=rtp sync=false max-buffers=8 drop=true",
            if voice { 1 } else { 2 },
            if voice { 32000 } else { 192000 },
            if voice { "voice" } else { "generic" }
        ),
        track,
        if test { None } else { device },
    )?;
    Ok(pipeline)
}

pub fn default_monitor() -> Result<String> {
    let result = std::process::Command::new("pactl")
        .arg("get-default-sink")
        .output()
        .context("Instale pactl (libpulse) para capturar o som do sistema")?;
    anyhow::ensure!(
        result.status.success(),
        "Não foi possível acessar o PipeWire/PulseAudio"
    );
    Ok(format!(
        "{}.monitor",
        String::from_utf8(result.stdout)?.trim()
    ))
}
pub fn monitors() -> Vec<(String, String)> {
    let Ok(output) = std::process::Command::new("pactl")
        .args(["-f", "json", "list", "sources"])
        .output()
    else {
        return vec![];
    };
    let Ok(sources) = serde_json::from_slice::<Vec<serde_json::Value>>(&output.stdout) else {
        return vec![];
    };
    sources
        .iter()
        .filter_map(|s| {
            let name = s["name"].as_str()?;
            if !name.ends_with(".monitor") {
                return None;
            }
            Some((
                name.into(),
                s["description"].as_str().unwrap_or(name).into(),
            ))
        })
        .collect()
}

pub struct Receiver {
    pub _media: Pipeline,
    pub source: AppSrc,
    frames: Frames,
    video: bool,
}
impl Receiver {
    pub fn new(
        peer: &str,
        mime: &str,
        payload: u8,
        frames: Frames,
        ctx: eframe::egui::Context,
    ) -> Result<Self> {
        let video = mime.starts_with("video/");
        let codec = mime
            .split('/')
            .nth(1)
            .context("Codec inválido")?
            .to_uppercase();
        let decode = match codec.as_str() {
            "VP8" => "rtpvp8depay ! vp8dec",
            "VP9" => "rtpvp9depay ! vp9dec",
            "H264" => "rtph264depay ! decodebin",
            "OPUS" => "rtpopusdepay ! opusdec",
            _ => return Err(anyhow!("Codec não suportado: {codec}")),
        };
        let output = if video {
            "videoconvert ! video/x-raw,format=RGBA ! appsink name=frames sync=false max-buffers=1 drop=true"
        } else {
            if std::env::var_os("CINEMINHA_TEST_AUDIO_SINK").is_some() {
                "audioconvert ! audioresample ! volume name=volume ! fakesink sync=false"
            } else {
                "audioconvert ! audioresample ! volume name=volume ! pulsesink sync=false"
            }
        };
        let description = format!(
            "appsrc name=input is-live=true format=time do-timestamp=true caps=\"application/x-rtp,media={},encoding-name={codec},clock-rate={},payload={payload}\" ! rtpjitterbuffer latency=60 drop-on-latency=true ! {decode} ! {output}",
            if video { "video" } else { "audio" },
            if video { 90000 } else { 48000 }
        );
        let pipeline = gst::parse::launch(&description)?
            .downcast::<gst::Pipeline>()
            .map_err(|_| anyhow!("Pipeline inválido"))?;
        let source = pipeline
            .by_name("input")
            .unwrap()
            .downcast::<AppSrc>()
            .unwrap();
        let state = frames.clone();
        if video {
            let sink = pipeline
                .by_name("frames")
                .unwrap()
                .downcast::<AppSink>()
                .unwrap();
            let peer = peer.to_owned();
            let mut serial = 0;
            sink.set_callbacks(
                gstreamer_app::AppSinkCallbacks::builder()
                    .new_sample(move |sink| {
                        let sample = sink.pull_sample().map_err(|_| gst::FlowError::Eos)?;
                        let info =
                            VideoInfo::from_caps(sample.caps().ok_or(gst::FlowError::Error)?)
                                .map_err(|_| gst::FlowError::Error)?;
                        let frame = gstreamer_video::VideoFrameRef::from_buffer_ref_readable(
                            sample.buffer().ok_or(gst::FlowError::Error)?,
                            &info,
                        )
                        .map_err(|_| gst::FlowError::Error)?;
                        let stride = frame.plane_stride()[0] as usize;
                        let w = info.width() as usize;
                        let h = info.height() as usize;
                        let data = frame.plane_data(0).map_err(|_| gst::FlowError::Error)?;
                        let rgba = data
                            .chunks(stride)
                            .take(h)
                            .flat_map(|r| r[..w * 4].iter().copied())
                            .collect();
                        serial += 1;
                        if let Ok(mut f) = frames.lock() {
                            f.insert(
                                peer.clone(),
                                Frame {
                                    size: [w, h],
                                    rgba,
                                    serial,
                                },
                            );
                        }
                        ctx.request_repaint();
                        Ok(gst::FlowSuccess::Ok)
                    })
                    .build(),
            );
        }
        pipeline.set_state(gst::State::Playing)?;
        Ok(Self {
            _media: Pipeline {
                pipeline,
                tasks: vec![],
            },
            source,
            frames: state,
            video,
        })
    }
    pub fn push(&self, packet: &Packet) -> Result<()> {
        // Keep RTP/RTCP reception alive while skipping video decoding when hidden.
        if self.video
            && !self
                .frames
                .visible
                .load(std::sync::atomic::Ordering::Relaxed)
        {
            return Ok(());
        }

        if let Some(error) = self._media.error() {
            return Err(anyhow!(error));
        }
        let data = packet.marshal()?;
        self.source
            .push_buffer(gst::Buffer::from_mut_slice(data.to_vec()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;

    struct PulseModule(String);
    impl Drop for PulseModule {
        fn drop(&mut self) {
            let _ = std::process::Command::new("pactl")
                .args(["unload-module", &self.0])
                .status();
        }
    }
    fn samples(pipeline: &gst::Pipeline) -> u64 {
        pipeline
            .by_name("rtp")
            .unwrap()
            .property::<gst::Structure>("stats")
            .get::<u64>("rendered")
            .unwrap_or(0)
    }
    fn track(mime: &str) -> Arc<TrackLocalStaticRTP> {
        Arc::new(TrackLocalStaticRTP::new(
            RTCRtpCodecCapability {
                mime_type: mime.into(),
                clock_rate: if mime.starts_with("audio/") {
                    48000
                } else {
                    90000
                },
                ..Default::default()
            },
            "test".into(),
            "test".into(),
        ))
    }

    // Explicit opt-in: Xvfb plus a temporary null sink, never the user's monitor or microphone.
    #[tokio::test]
    async fn capture_x11_and_pulse_monitor() -> Result<()> {
        if std::env::var("CINEMINHA_CAPTURE_TEST").as_deref() != Ok("1") {
            return Ok(());
        }
        anyhow::ensure!(
            std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("x11"),
            "Run this test under Xvfb with XDG_SESSION_TYPE=x11"
        );
        gst::init()?;
        let sink_name = format!("cineminha_native_test_{}", std::process::id());
        let output = std::process::Command::new("pactl")
            .args([
                "load-module",
                "module-null-sink",
                &format!("sink_name={sink_name}"),
            ])
            .output()?;
        anyhow::ensure!(
            output.status.success(),
            "Could not create isolated audio sink"
        );
        let _module = PulseModule(String::from_utf8(output.stdout)?.trim().into());
        let tone = gst::parse::launch(
            "audiotestsrc is-live=true volume=0.05 ! audioconvert ! pulsesink name=speaker",
        )?
        .downcast::<gst::Pipeline>()
        .unwrap();
        tone.by_name("speaker")
            .unwrap()
            .set_property("device", &sink_name);
        let tone = Pipeline {
            pipeline: tone,
            tasks: vec![],
        };
        tone.pipeline.set_state(gst::State::Playing)?;
        let capture = ScreenCapture::start(track("video/VP8"), Encoder::Vp8, false, false).await?;
        let audio = audio(
            track("audio/opus"),
            Some(&format!("{sink_name}.monitor")),
            false,
            false,
        )?;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        anyhow::ensure!(capture.media.error().is_none(), "X11 capture error");
        anyhow::ensure!(audio.error().is_none(), "Monitor audio capture error");
        anyhow::ensure!(
            samples(&capture.media.pipeline) > 0,
            "X11 produced no RTP packets"
        );
        anyhow::ensure!(
            samples(&audio.pipeline) > 0,
            "Pulse monitor produced no RTP packets"
        );
        println!("PASS: real X11 display capture and isolated PulseAudio monitor produced RTP");
        Ok(())
    }
}
