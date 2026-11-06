// Na Netflix: passa comandos da extensão para o player (no mundo da página) e o estado de volta.
chrome.runtime.onMessage.addListener(msg => { if (msg?.de === 'cineminha') window.postMessage({ cineNfx: 'cmd', op: msg.op, d: msg.d }, location.origin) })
addEventListener('message', e => {
  if (e.source !== window || e.data?.cineNfx !== 'estado') return
  chrome.runtime.sendMessage({ ...e.data, cineNfx: undefined, de: 'netflix' }).catch(() => {})
})
