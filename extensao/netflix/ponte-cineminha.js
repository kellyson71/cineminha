// No Cineminha: avisa que a extensão está instalada e passa mensagens entre a página e a extensão.
const ola = () => window.postMessage({ cineExt: 'netflix', tipo: 'ola', versao: chrome.runtime.getManifest().version }, location.origin)
ola(); addEventListener('DOMContentLoaded', ola)
addEventListener('message', e => {
  if (e.source !== window || e.data?.cineExt !== 'netflix') return
  if (e.data.tipo === 'quem') ola()
  else if (e.data.tipo === 'cmd') chrome.runtime.sendMessage({ de: 'cineminha', op: e.data.op, d: e.data.d }).catch(() => {})
})
chrome.runtime.onMessage.addListener(msg => { if (msg?.de === 'netflix') window.postMessage({ cineExt: 'netflix', tipo: 'estado', ...msg, de: undefined }, location.origin) })
