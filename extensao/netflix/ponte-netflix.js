// Na Netflix: passa comandos da extensão para o player (no mundo da página) e o estado de volta.
// Se for injetada de novo (extensão atualizada com a aba aberta), tira o ouvinte da versão antiga.
window.__cinePonteOff?.()
{
  const daPagina = e => {
    if (e.source !== window || e.data?.cineNfx !== 'estado') return
    chrome.runtime.sendMessage({ ...e.data, cineNfx: undefined, de: 'netflix' }).catch(() => {})
  }
  addEventListener('message', daPagina)
  window.__cinePonteOff = () => removeEventListener('message', daPagina)
  chrome.runtime.onMessage.addListener(msg => { if (msg?.de === 'cineminha') window.postMessage({ cineNfx: 'cmd', op: msg.op, d: msg.d, id: msg.id }, location.origin) })
}
