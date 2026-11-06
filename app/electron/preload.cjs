// Ponte mínima para o renderer (sandbox ligado, sem Node exposto)
const { contextBridge, ipcRenderer, webUtils } = require('electron')

const ouvir = canal => fn => { const f = (_e, ...a) => fn(...a); ipcRenderer.on(canal, f); return () => ipcRenderer.removeListener(canal, f) }

contextBridge.exposeInMainWorld('cine', {
  desktop: true,
  plataforma: process.platform,
  info: () => ipcRenderer.invoke('info'),
  fullscreen: on => ipcRenderer.invoke('fullscreen', on),
  sala: estado => ipcRenderer.send('sala', estado),
  acordado: on => ipcRenderer.send('acordado', !!on),
  mini: on => ipcRenderer.send('mini', !!on),
  mostrar: () => ipcRenderer.send('mostrar'),
  badge: n => ipcRenderer.send('badge', n | 0),
  onAtalho: ouvir('atalho'),
  onMini: ouvir('mini'),
  onConvite: ouvir('convite'),
  // som
  programas: () => ipcRenderer.invoke('som:programas'),
  separarSom: id => ipcRenderer.invoke('som:separar', id),
  somSistema: () => ipcRenderer.invoke('som:sistema'),
  juntarSom: () => ipcRenderer.invoke('som:juntar'),
  // arquivos
  caminho: file => webUtils.getPathForFile(file),
  converter: (arq, opts) => ipcRenderer.invoke('converter', arq, opts),
  onProgresso: ouvir('converter:progresso'),
})
