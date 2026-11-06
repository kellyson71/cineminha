// Processo principal: uma janela, sem Node no renderer. Tudo que é "de desktop" fica aqui:
// captura com som, som de um programa só, ffmpeg, bandeja, atalhos globais, links de convite,
// mini player, impedir descanso de tela e atualização automática.
import { app, BrowserWindow, desktopCapturer, session, shell, ipcMain, Tray, Menu, globalShortcut, powerSaveBlocker, nativeImage, Notification } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registraServidor, pastaDoSite, ORIGEM, SITE } from './servidor.js'
import * as som from './somlinux.js'
import { converter, temFfmpeg, limpar } from './converter.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.CINE_DEV_URL // definido pelo `npm run dev`
const LINUX = process.platform === 'linux'
const icone = n => path.join(dir, '..', 'build', n)

// decodificação/codificação pela GPU quando houver, captura PipeWire e atalhos globais no Wayland
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecodeLinuxGL,VaapiVideoEncoder,WebRTCPipeWireCapturer,GlobalShortcutsPortal')
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,SpareRendererForSitePerProcess')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

if (!app.requestSingleInstanceLock()) app.quit()
if (process.defaultApp) app.setAsDefaultProtocolClient('cineminha', process.execPath, [path.resolve(process.argv[1])])
else app.setAsDefaultProtocolClient('cineminha')

let win = null, tray = null, emSala = false, saindo = false, bloqueio = -1, mini = null
const extras = new Map() // id -> arquivo local servido em cine://app/local/<id>
const envia = (canal, ...a) => win?.webContents.send(canal, ...a)

// cineminha://nome-do-filme[/inicial][#ticket=…] ou o link do site → convite
function convite(argv) {
  const url = argv.find(a => /^cineminha:\/\//.test(a) || a.startsWith(SITE + '/'))
  if (!url) return null
  const u = new URL(url.replace(/^cineminha:\/\//, 'https://x/'))
  const [slug = '', ini = ''] = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? { slug, ini, ticket: new URLSearchParams(u.hash.slice(1)).get('ticket') || '' } : null
}
let conviteInicial = convite(process.argv)

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 360, minHeight: 240,
    show: false,
    backgroundColor: '#0b0b0e', // mesma cor do site: não pisca branco ao abrir
    title: 'Cineminha',
    icon: icone('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(dir, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
      backgroundThrottling: true, // vira false enquanto você está numa sala (voz e jogos seguem minimizado)
      v8CacheOptions: 'bypassHeatCheck',
    },
  })
  win.removeMenu()
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(DEV_URL || ORIGEM)) { e.preventDefault(); shell.openExternal(url) } })
  // fechar na sala = continua na call pela bandeja
  win.on('close', e => { if (emSala && !saindo) { e.preventDefault(); win.hide(); avisoBandeja() } })
  win.loadURL(DEV_URL || ORIGEM + '/index.html')
}
let avisou = false
function avisoBandeja() {
  if (avisou || !Notification.isSupported()) return
  avisou = true
  new Notification({ title: 'Cineminha continua na sala', body: 'Mutar, voltar ou sair pelo ícone na bandeja.', icon: icone('icon.png'), silent: true }).show()
}

function montaBandeja(estado = {}) {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(icone('tray.png')))
    tray.setToolTip('Cineminha')
    tray.on('click', mostrar)
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar o Cineminha', click: mostrar },
    { type: 'separator' },
    { label: estado.muted ? 'Ligar o microfone' : 'Mutar o microfone', enabled: emSala, click: () => envia('atalho', 'toggleMic') },
    { label: estado.deaf ? 'Voltar o som' : 'Cortar o som', enabled: emSala, click: () => envia('atalho', 'toggleDeaf') },
    { label: 'Mini player', type: 'checkbox', checked: !!mini, enabled: emSala, click: () => setMini(!mini) },
    { type: 'separator' },
    { label: 'Sair do Cineminha', click: () => { saindo = true; app.quit() } },
  ]))
}
const mostrar = () => { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus() }

// mini player: janelinha sempre por cima com a projeção
function setMini(on) {
  if (!win || !!mini === on) return
  if (on) {
    mini = { bounds: win.getBounds(), max: win.isMaximized() }
    if (mini.max) win.unmaximize()
    win.setAlwaysOnTop(true, 'floating')
    win.setBounds({ width: 480, height: 300 })
  } else {
    win.setAlwaysOnTop(false)
    win.setBounds(mini.bounds)
    if (mini.max) win.maximize()
    mini = null
  }
  envia('mini', !!mini)
  montaBandeja()
}

// atalhos que funcionam com o jogo em foco
const ATALHOS = { 'CommandOrControl+Shift+M': 'toggleMic', 'CommandOrControl+Shift+D': 'toggleDeaf', 'CommandOrControl+Shift+P': 'mini' }
function registraAtalhos(on) {
  globalShortcut.unregisterAll()
  if (!on) return
  for (const [tecla, acao] of Object.entries(ATALHOS)) {
    try { globalShortcut.register(tecla, () => (acao === 'mini' ? setMini(!mini) : envia('atalho', acao))) } catch {}
  }
}

/* ---------- ponte com o renderer ---------- */
ipcMain.handle('fullscreen', (_e, on) => { win?.setFullScreen(typeof on === 'boolean' ? on : !win.isFullScreen()); return win?.isFullScreen() })
ipcMain.handle('info', async () => ({ plataforma: process.platform, versao: app.getVersion(), pactl: LINUX && await som.temPactl(), ffmpeg: await temFfmpeg(), convite: conviteInicial, atalhos: ATALHOS }))
ipcMain.on('sala', (_e, estado) => {
  const antes = emSala
  emSala = !!estado.dentro
  if (antes !== emSala) { win?.webContents.setBackgroundThrottling(!emSala); registraAtalhos(emSala); if (!emSala) setMini(false) }
  montaBandeja(estado)
  tray?.setToolTip(emSala ? `Cineminha · ${estado.pessoas || 1} na sala${estado.muted ? ' · mudo' : ''}` : 'Cineminha')
})
// não deixa a tela/PC dormir enquanto tem filme ou projeção
ipcMain.on('acordado', (_e, on) => {
  if (on && bloqueio < 0) bloqueio = powerSaveBlocker.start('prevent-display-sleep')
  else if (!on && bloqueio >= 0) { powerSaveBlocker.stop(bloqueio); bloqueio = -1 }
})
ipcMain.on('mini', (_e, on) => setMini(!!on))
ipcMain.on('mostrar', mostrar)
ipcMain.on('badge', (_e, n) => { app.setBadgeCount(n); if (!win?.isFocused()) win?.flashFrame(n > 0) })

// som de um programa só / do sistema (Linux)
ipcMain.handle('som:programas', () => (LINUX ? som.programas().catch(() => []) : []))
ipcMain.handle('som:separar', (_e, id) => som.separar(id))
ipcMain.handle('som:sistema', () => som.monitorPadrao())
ipcMain.handle('som:juntar', () => som.juntar())

// ffmpeg: converte e serve em cine://app/local/<id>
ipcMain.handle('converter', async (e, arq, opts = {}) => {
  const r = await converter(arq, { ...opts, progresso: p => e.sender.send('converter:progresso', p) })
  const id = path.basename(r.saida)
  extras.set(id, r.saida)
  let leg = null
  if (r.vtt) { const lid = path.basename(r.vtt); extras.set(lid, r.vtt); leg = 'local/' + lid }
  return { url: 'local/' + id, leg, recodificouVideo: r.recodificouVideo, nomeLeg: r.nomeLeg }
})

app.whenReady().then(() => {
  registraServidor({ dist: path.join(dir, '..', 'dist'), site: pastaDoSite(dir), extras })
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'notifications', 'speaker-selection'].includes(perm)))
  // "Projetar → Tela ou janela": seletor do sistema (portal no Wayland). No Windows o som do
  // sistema vem junto (loopback); no Linux o app pega o som pelo PipeWire (somlinux.js).
  ses.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] })
      .then(src => cb(src[0] ? { video: src[0], audio: process.platform === 'win32' ? 'loopback' : undefined } : {}))
      .catch(() => cb({}))
  }, { useSystemPicker: true })
  createWindow()
  montaBandeja()
  if (app.isPackaged) import('electron-updater').then(({ default: u }) => { u.autoUpdater.autoDownload = true; u.autoUpdater.checkForUpdatesAndNotify().catch(() => {}) }).catch(() => {})
})

app.on('second-instance', (_e, argv) => { mostrar(); const c = convite(argv); if (c) envia('convite', c) })
app.on('open-url', (e, url) => { e.preventDefault(); const c = convite([url]); if (c) { conviteInicial = c; envia('convite', c) } })
app.on('before-quit', () => { saindo = true })
app.on('will-quit', () => { globalShortcut.unregisterAll(); som.juntar().catch(() => {}); limpar() })
app.on('window-all-closed', () => app.quit())
