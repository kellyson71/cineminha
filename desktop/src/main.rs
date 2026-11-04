mod install;
mod media;
mod protocol;
mod room;

use eframe::egui::{self, Color32, RichText, Vec2};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, mpsc},
    time::Instant,
};

const SITE: &str = "https://cineminha-boo.vercel.app";
const RED: Color32 = Color32::from_rgb(200, 61, 71);
const BG: Color32 = Color32::from_rgb(18, 18, 23);
const PANEL: Color32 = Color32::from_rgb(26, 26, 33);
const DIM: Color32 = Color32::from_rgb(151, 151, 165);

#[derive(Clone, Deserialize)]
pub struct Config {
    #[serde(rename = "appId")]
    app_id: String,
    #[serde(rename = "senhaHash")]
    password_hash: String,
    pessoas: Vec<Person>,
    #[serde(default)]
    relays: Vec<String>,
}
#[derive(Clone, Deserialize)]
struct Person {
    id: String,
    nome: String,
    #[serde(rename = "cor")]
    _cor: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Identity {
    key: String,
    name: String,
}
pub enum Command {
    Join {
        identity: Identity,
        password: String,
        channel: String,
    },
    Leave,
    Chat(String),
    Mute(bool),
    Share {
        on: bool,
        game: bool,
        audio: bool,
        device: String,
    },
    Pause,
}
pub enum Event {
    Joined(String),
    Left,
    Status(String),
    Error(String),
    Peer(String, Value),
    Gone(String),
    Chat(Value),
    Sharing(bool),
    RemoteShare(String, bool),
    Muted(bool),
}
struct App {
    config: Config,
    tx: tokio::sync::mpsc::UnboundedSender<Command>,
    rx: mpsc::Receiver<Event>,
    identity: Identity,
    password: String,
    channel: String,
    joining: bool,
    joined: bool,
    status: String,
    error: String,
    peers: HashMap<String, Value>,
    messages: Vec<Value>,
    seen: HashSet<String>,
    draft: String,
    muted: bool,
    sharing: bool,
    share_pending: bool,
    game: bool,
    system_audio: bool,
    device: String,
    monitors: Vec<(String, String)>,
    settings: bool,
    frames: media::Frames,
    textures: HashMap<String, (u64, egui::TextureHandle)>,
    avatars: HashMap<String, egui::TextureHandle>,
    encoder: String,
    started: Instant,
    remote_shares: HashSet<String>,
}
impl App {
    fn new(cc: &eframe::CreationContext<'_>, config: Config) -> Self {
        let ctx = &cc.egui_ctx;
        let mut style = (*ctx.style_of(egui::Theme::Dark)).clone();
        style.visuals = egui::Visuals::dark();
        style.visuals.panel_fill = BG;
        style.visuals.window_fill = PANEL;
        style.visuals.override_text_color = Some(Color32::from_rgb(235, 234, 240));
        style.visuals.selection.bg_fill = RED;
        style.visuals.widgets.active.bg_fill = RED;
        style.visuals.widgets.hovered.bg_fill = Color32::from_rgb(60, 41, 49);
        style.visuals.widgets.inactive.bg_fill = PANEL;
        style.spacing.item_spacing = Vec2::new(10.0, 10.0);
        style.spacing.button_padding = Vec2::new(14.0, 9.0);
        ctx.set_style_of(egui::Theme::Dark, style);
        let (tx_events, rx) = mpsc::channel();
        let frames = Arc::new(media::FrameStore::default());
        let tx = room::spawn(config.clone(), tx_events, ctx.clone(), frames.clone());
        let mut avatars = HashMap::new();
        macro_rules! avatar {
            ($key:expr,$file:literal) => {
                if let Ok(img) = image::load_from_memory(include_bytes!($file)) {
                    let img = img.into_rgba8();
                    let texture = ctx.load_texture(
                        $key,
                        egui::ColorImage::from_rgba_unmultiplied(
                            [img.width() as usize, img.height() as usize],
                            &img,
                        ),
                        egui::TextureOptions::LINEAR,
                    );
                    avatars.insert($key.into(), texture);
                }
            };
        }
        avatar!("otavio", "../../public/assets/avatar1.png");
        avatar!("milenny", "../../public/assets/avatar2.png");
        avatar!("kellyson", "../../public/assets/avatar3.png");
        avatar!("jeyce", "../../public/assets/avatar-jeyce.png");
        avatar!("kauan", "../../public/assets/avatar-kauan.png");
        avatar!("luiz", "../../public/assets/avatar-luiz.png");
        avatar!("pedro", "../../public/assets/avatar-pedro.png");
        avatar!("gabi", "../../public/assets/avatar-gabi.png");
        avatar!("meris", "../../public/assets/avatar-meris.png");
        avatar!("rodrigues", "../../public/assets/avatar-rodrigues.png");
        avatar!("matheus", "../../public/assets/avatar-matheus.png");
        avatar!("guest", "../../public/assets/avatar-convidado.png");
        let monitors = media::monitors();
        Self {
            config,
            tx,
            rx,
            identity: Identity::default(),
            password: String::new(),
            channel: String::new(),
            joining: false,
            joined: false,
            status: "Sua sala de cinema, agora no desktop".into(),
            error: String::new(),
            peers: HashMap::new(),
            messages: vec![],
            seen: HashSet::new(),
            draft: String::new(),
            muted: true,
            sharing: false,
            share_pending: false,
            game: false,
            system_audio: true,
            device: String::new(),
            monitors,
            settings: false,
            frames,
            textures: HashMap::new(),
            avatars,
            encoder: String::new(),
            started: Instant::now(),
            remote_shares: HashSet::new(),
        }
    }
    fn send(&self, c: Command) {
        let _ = self.tx.send(c);
    }
    fn events(&mut self, _ctx: &egui::Context) {
        while let Ok(event) = self.rx.try_recv() {
            match event {
                Event::Joined(encoder) => {
                    self.joined = true;
                    self.joining = false;
                    self.encoder = encoder;
                    self.started = Instant::now();
                    self.password.clear();
                    self.error.clear();
                }
                Event::Left => {
                    self.joined = false;
                    self.joining = false;
                    self.sharing = false;
                    self.share_pending = false;
                    self.muted = true;
                    self.peers.clear();
                    self.textures.clear();
                    self.remote_shares.clear();
                    self.status = "Você saiu da sala".into();
                }
                Event::Status(s) => self.status = s,
                Event::Error(e) => {
                    self.error = e;
                    self.share_pending = false;
                }
                Event::Peer(id, v) => {
                    self.peers.insert(id, v);
                }
                Event::Gone(id) => {
                    self.peers.remove(&id);
                    self.textures.remove(&id);
                    self.remote_shares.remove(&id);
                }
                Event::Chat(v) => {
                    let id = v["id"].as_str().unwrap_or("").to_owned();
                    if !id.is_empty() && self.seen.insert(id) {
                        self.messages.push(v);
                        if self.messages.len() > 300 {
                            self.messages.remove(0);
                        }
                        if self.seen.len() > 1000 {
                            self.seen = self
                                .messages
                                .iter()
                                .filter_map(|v| v["id"].as_str().map(str::to_owned))
                                .collect();
                        }
                    }
                }
                Event::Sharing(on) => {
                    self.sharing = on;
                    self.share_pending = false;
                }
                Event::Muted(v) => self.muted = v,
                Event::RemoteShare(id, on) => {
                    if on {
                        self.remote_shares.insert(id);
                    } else {
                        self.remote_shares.remove(&id);
                        self.textures.remove(&id);
                        if let Ok(mut f) = self.frames.lock() {
                            f.remove(&id);
                        }
                    }
                }
            }
        }
    }
    fn update_textures(&mut self, ctx: &egui::Context) {
        if let Ok(frames) = self.frames.lock() {
            for (id, frame) in frames.iter() {
                if self
                    .textures
                    .get(id)
                    .is_none_or(|(serial, _)| *serial != frame.serial)
                {
                    let image = egui::ColorImage::from_rgba_unmultiplied(frame.size, &frame.rgba);
                    if let Some((serial, texture)) = self.textures.get_mut(id) {
                        texture.set(image, egui::TextureOptions::LINEAR);
                        *serial = frame.serial;
                    } else {
                        self.textures.insert(
                            id.clone(),
                            (
                                frame.serial,
                                ctx.load_texture(id, image, egui::TextureOptions::LINEAR),
                            ),
                        );
                    }
                }
            }
        }
    }
    fn enter(&mut self) {
        if self.identity.key.is_empty() || self.identity.name.trim().is_empty() {
            self.error = "Escolha quem vai entrar ou informe seu nome".into();
            return;
        }
        if protocol::hash(&self.password) != self.config.password_hash {
            self.error = "Senha da sala incorreta".into();
            return;
        }
        self.joining = true;
        self.error.clear();
        self.send(Command::Join {
            identity: self.identity.clone(),
            password: self.password.clone(),
            channel: self.channel.trim().into(),
        });
    }
    fn login(&mut self, ui: &mut egui::Ui) {
        ui.add_space(20.0);
        ui.vertical_centered(|ui| {
            ui.heading(RichText::new("Boa companhia. Um bom filme.").size(28.0));
            ui.label(RichText::new("Escolha sua poltrona e entre na sala.").color(DIM));
            ui.add_space(22.0);
            let people = self.config.pessoas.clone();
            egui::Grid::new("people")
                .num_columns(6)
                .spacing([12.0, 14.0])
                .show(ui, |ui| {
                    for (i, p) in people.iter().enumerate() {
                        let selected = self.identity.key == p.id;
                        egui::Frame::new()
                            .fill(if selected {
                                Color32::from_rgb(68, 32, 41)
                            } else {
                                PANEL
                            })
                            .corner_radius(12)
                            .inner_margin(8.0)
                            .show(ui, |ui| {
                                ui.set_min_width(96.0);
                                ui.set_max_width(96.0);
                                ui.vertical_centered(|ui| {
                                    if let Some(t) = self.avatars.get(&p.id)
                                        && ui
                                            .add(
                                                egui::Image::new(t)
                                                    .fit_to_exact_size(Vec2::new(65.0, 75.0))
                                                    .sense(egui::Sense::click()),
                                            )
                                            .clicked()
                                    {
                                        self.identity = Identity {
                                            key: p.id.clone(),
                                            name: p.nome.clone(),
                                        };
                                    }
                                    if ui.selectable_label(selected, &p.nome).clicked() {
                                        self.identity = Identity {
                                            key: p.id.clone(),
                                            name: p.nome.clone(),
                                        };
                                    }
                                });
                            });
                        if i % 6 == 5 {
                            ui.end_row();
                        }
                    }
                });
            ui.add_space(14.0);
            ui.horizontal(|ui| {
                ui.label("Convidado:");
                let response = ui.add(
                    egui::TextEdit::singleline(&mut self.identity.name)
                        .hint_text("Seu nome")
                        .desired_width(170.0),
                );
                if response.changed() {
                    self.identity.name = self.identity.name.chars().take(24).collect();
                    self.identity.key = format!("g:{}", self.identity.name.trim().to_lowercase());
                }
                ui.label("Senha da sala");
                let response = ui.add(
                    egui::TextEdit::singleline(&mut self.password)
                        .password(true)
                        .desired_width(160.0),
                );
                if response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                    self.enter();
                }
                if ui
                    .add_enabled(
                        !self.joining,
                        egui::Button::new(if self.joining {
                            "Entrando…"
                        } else {
                            "Entrar na sala"
                        })
                        .fill(RED),
                    )
                    .clicked()
                {
                    self.enter();
                }
            });
            ui.collapsing("Outra sala", |ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut self.channel)
                        .hint_text("Nome do canal (vazio = sala principal)"),
                );
            });
        });
    }
    fn chat(&mut self, ui: &mut egui::Ui) {
        ui.heading("Na conversa");
        ui.label(
            RichText::new(format!("{} na sala", self.peers.len() + 1))
                .small()
                .color(DIM),
        );
        ui.separator();
        let height = (ui.available_height() - 82.0).max(100.0);
        egui::ScrollArea::vertical()
            .max_height(height)
            .stick_to_bottom(true)
            .auto_shrink([false, false])
            .show(ui, |ui| {
                for m in &self.messages {
                    ui.label(
                        RichText::new(m["name"].as_str().unwrap_or("Alguém"))
                            .strong()
                            .color(RED),
                    );
                    if let Some(text) = m["text"].as_str().filter(|s| !s.is_empty()) {
                        ui.label(text);
                    }
                    if m["gif"].is_object() || m["img"].is_object() {
                        ui.label(RichText::new("Enviou uma imagem").small().color(DIM));
                    }
                    ui.add_space(8.0);
                }
            });
        ui.with_layout(egui::Layout::bottom_up(egui::Align::Min), |ui| {
            ui.horizontal(|ui| {
                let r = ui.add(
                    egui::TextEdit::singleline(&mut self.draft)
                        .hint_text("Manda uma mensagem…")
                        .desired_width((ui.available_width() - 78.0).max(60.0))
                        .char_limit(500),
                );
                let enter = r.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                if (ui.button("Enviar").clicked() || enter) && !self.draft.trim().is_empty() {
                    let text = std::mem::take(&mut self.draft);
                    self.send(Command::Chat(text));
                    r.request_focus();
                }
            });
        });
    }
    fn seats(&self, ui: &mut egui::Ui) {
        ui.horizontal_wrapped(|ui|{
            let local=serde_json::json!({"key":self.identity.key,"name":self.identity.name,"muted":self.muted});
            for p in std::iter::once(&local).chain(self.peers.values()){
                let key=p["key"].as_str().unwrap_or("guest");
                egui::Frame::new().fill(PANEL).corner_radius(12).inner_margin(8.0).show(ui,|ui|{
                    ui.vertical_centered(|ui|{
                        ui.set_min_width(68.0);
                        if let Some(t)=self.avatars.get(key).or_else(||self.avatars.get("guest")){ui.add(egui::Image::new(t).fit_to_exact_size(Vec2::new(56.0,62.0)));}
                        let name=p["name"].as_str().unwrap_or("Conectando…");ui.label(RichText::new(name).size(12.0));
                        ui.label(RichText::new(if p["muted"]==true{"Microfone desligado"}else{"Microfone ligado"}).size(9.0).color(DIM));
                    });
                });
            }
        });
    }
    fn screen(&self, ui: &mut egui::Ui) {
        let available = ui.available_size();
        let size = Vec2::new(available.x, (available.y - 165.0).max(200.0));
        let (rect, _) = ui.allocate_exact_size(size, egui::Sense::hover());
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, 12.0, Color32::from_rgb(7, 7, 11));
        let curtains = 32.0;
        for x in [rect.left(), rect.right() - curtains] {
            painter.rect_filled(
                egui::Rect::from_min_size(egui::pos2(x, rect.top()), Vec2::new(curtains, size.y)),
                4.0,
                Color32::from_rgb(75, 20, 32),
            );
            for n in 0..4 {
                let x = x + n as f32 * 8.0;
                painter.line_segment(
                    [egui::pos2(x, rect.top()), egui::pos2(x, rect.bottom())],
                    egui::Stroke::new(2.0, Color32::from_rgb(105, 28, 43)),
                );
            }
        }
        let video_rect = rect.shrink2(Vec2::new(curtains + 4.0, 8.0));
        let textures = self.textures.values().collect::<Vec<_>>();
        if textures.is_empty() {
            painter.text(
                rect.center() - Vec2::new(0.0, 20.0),
                egui::Align2::CENTER_CENTER,
                if self.sharing {
                    "Sua tela está no cinema"
                } else {
                    "A sessão começa por aqui"
                },
                egui::FontId::proportional(25.0),
                Color32::from_rgb(235, 230, 236),
            );
            painter.text(
                rect.center() + Vec2::new(0.0, 22.0),
                egui::Align2::CENTER_CENTER,
                if self.sharing {
                    "Pode abrir seu jogo. A transmissão continua em segundo plano."
                } else {
                    "Compartilhe sua tela para assistir ou jogar juntos."
                },
                egui::FontId::proportional(14.0),
                DIM,
            );
        } else {
            let count = textures.len().min(4);
            let cols = if count > 1 { 2 } else { 1 };
            let rows = count.div_ceil(cols);
            for (i, (_, texture)) in textures.iter().take(count).enumerate() {
                let cell = egui::Rect::from_min_size(
                    video_rect.min
                        + Vec2::new(
                            (i % cols) as f32 * video_rect.width() / cols as f32,
                            (i / cols) as f32 * video_rect.height() / rows as f32,
                        ),
                    Vec2::new(
                        video_rect.width() / cols as f32,
                        video_rect.height() / rows as f32,
                    ),
                )
                .shrink(4.0);
                let dimensions = texture.size_vec2();
                let scale = (cell.width() / dimensions.x).min(cell.height() / dimensions.y);
                let target = egui::Rect::from_center_size(cell.center(), dimensions * scale);
                painter.image(
                    texture.id(),
                    target,
                    egui::Rect::from_min_max(egui::Pos2::ZERO, egui::pos2(1.0, 1.0)),
                    Color32::WHITE,
                );
            }
        }
    }
}
impl eframe::App for App {
    fn logic(&mut self, ctx: &egui::Context, _: &mut eframe::Frame) {
        self.frames
            .set_visible(!ctx.input(|i| i.viewport().minimized.unwrap_or(false)));
        self.events(ctx);
    }
    fn ui(&mut self, ui: &mut egui::Ui, _: &mut eframe::Frame) {
        self.update_textures(ui.ctx());
        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(BG).inner_margin(20.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("CINEMINHA").size(23.0).strong().color(RED));
                    ui.label(RichText::new("um lugar pra estar junto").small().color(DIM));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if self.joined && ui.button("Sair da sala").clicked() {
                            self.send(Command::Leave);
                        }
                        if ui.button("Ajustes").clicked() {
                            self.settings = !self.settings;
                        }
                    });
                });
                ui.add_space(12.0);
                ui.separator();
                if !self.error.is_empty() {
                    ui.horizontal(|ui| {
                        ui.colored_label(Color32::from_rgb(255, 150, 150), &self.error);
                        if ui.small_button("Fechar").clicked() {
                            self.error.clear();
                        }
                    });
                }
                if self.joined {
                    ui.add_space(8.0);
                    let height = ui.available_height() - 76.0;
                    ui.horizontal_top(|ui| {
                        let width = (ui.available_width() - 290.0).max(300.0);
                        ui.allocate_ui_with_layout(
                            Vec2::new(width, height),
                            egui::Layout::top_down(egui::Align::Min),
                            |ui| {
                                self.screen(ui);
                                ui.add_space(8.0);
                                self.seats(ui);
                            },
                        );
                        egui::Frame::new()
                            .fill(PANEL)
                            .corner_radius(12)
                            .inner_margin(14.0)
                            .show(ui, |ui| {
                                ui.set_min_size(Vec2::new(242.0, height - 28.0));
                                ui.set_max_width(260.0);
                                self.chat(ui);
                            });
                    });
                    ui.separator();
                    ui.horizontal(|ui| {
                        if ui
                            .add_enabled(
                                !self.share_pending,
                                egui::Button::new(if self.sharing {
                                    "Parar transmissão"
                                } else if self.share_pending {
                                    "Preparando…"
                                } else {
                                    "Transmitir tela inteira"
                                })
                                .fill(RED),
                            )
                            .clicked()
                        {
                            self.share_pending = true;
                            self.send(Command::Share {
                                on: !self.sharing,
                                game: self.game,
                                audio: self.system_audio,
                                device: self.device.clone(),
                            });
                        }
                        if ui
                            .button(if self.muted {
                                "Ligar microfone"
                            } else {
                                "Desligar microfone"
                            })
                            .clicked()
                        {
                            self.muted = !self.muted;
                            self.send(Command::Mute(self.muted));
                        }
                        if ui.button("Pausa aí").clicked() {
                            self.send(Command::Pause);
                        }
                        if ui.button("Tela cheia").clicked() {
                            let full = ui.input(|i| i.viewport().fullscreen.unwrap_or(false));
                            ui.ctx()
                                .send_viewport_cmd(egui::ViewportCommand::Fullscreen(!full));
                        }
                        ui.label(RichText::new(&self.encoder).small().color(DIM));
                    });
                } else {
                    self.login(ui);
                }
                ui.add_space(8.0);
                ui.label(RichText::new(&self.status).small().color(DIM));
            });
        if self.settings {
            egui::Window::new("Ajustes da transmissão").collapsible(false).resizable(false).show(ui.ctx(),|ui|{
                ui.checkbox(&mut self.system_audio,"Transmitir som do sistema (estéreo)");
                ui.checkbox(&mut self.game,"Modo jogo · 720p a 60 fps");
                ui.label(RichText::new("Modo cinema: 1080p a 30 fps. Alterações valem na próxima transmissão.").small().color(DIM));
                egui::ComboBox::from_label("Saída a capturar").selected_text(if self.device.is_empty(){"Saída padrão"}else{self.monitors.iter().find(|(id,_)|id==&self.device).map(|(_,name)|name.as_str()).unwrap_or("Saída escolhida")}).show_ui(ui,|ui|{
                    ui.selectable_value(&mut self.device,String::new(),"Saída padrão");for(id,name)in &self.monitors{ui.selectable_value(&mut self.device,id.clone(),name);}
                });
                ui.label("A saída inteira inclui tudo que toca nela, inclusive vozes da sala.\nPara separar o jogo das vozes, escolha uma saída dedicada ao jogo.");
                if ui.button("Atualizar saídas de áudio").clicked(){self.monitors=media::monitors();}
                ui.separator();ui.label("Interface Rust nativa · PipeWire · WebRTC\nA captura continua com a janela minimizada.");
            });
        }
    }
}
impl Drop for App {
    fn drop(&mut self) {
        let _ = self.tx.send(Command::Leave);
    }
}

fn main() -> anyhow::Result<()> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.iter().any(|a| a == "--install") {
        install::install().map_err(anyhow::Error::msg)?;
        return Ok(());
    }
    gstreamer::init()?;
    if args.iter().any(|a| a == "--test-session") {
        return tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()?
            .block_on(room::test_session());
    }
    if args.iter().any(|a| a == "--check") {
        println!(
            "Cineminha Desktop · Rust nativo (sem navegador)\nEncoder: {}\nSessão: {}\nSom: {}",
            media::Encoder::detect().label(),
            std::env::var("XDG_SESSION_TYPE").unwrap_or_default(),
            media::default_monitor().unwrap_or_else(|e| e.to_string())
        );
        for name in [
            "pipewiresrc",
            "pulsesrc",
            "opusenc",
            "rtpopuspay",
            "vp8enc",
            "rtpvp8pay",
        ] {
            anyhow::ensure!(
                gstreamer::ElementFactory::find(name).is_some(),
                "Plugin GStreamer ausente: {name}"
            );
        }
        return Ok(());
    }
    if !args.is_empty() {
        println!(
            "Cineminha Desktop\n\n  cineminha            Abrir o app\n  cineminha --install  Instalar no menu\n  cineminha --check    Verificar captura e codecs"
        );
        return Ok(());
    }
    let config: Config = serde_json::from_str(include_str!("../assets/config.json"))?;
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1280.0, 900.0])
            .with_min_inner_size([1000.0, 700.0])
            .with_app_id("cineminha"),
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };
    eframe::run_native(
        "Cineminha",
        options,
        Box::new(move |cc| Ok(Box::new(App::new(cc, config)))),
    )
    .map_err(|e| anyhow::anyhow!(e.to_string()))
}
