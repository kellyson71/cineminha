// No Cineminha: avisa que a extensão está instalada e passa mensagens entre a página e a extensão.
// Se for injetada de novo (extensão atualizada com a aba aberta), tira o ouvinte da versão antiga.
window.__cinePonteOff?.()
{
  const ola = () => window.postMessage({ cineExt: 'netflix', tipo: 'ola', versao: chrome.runtime.getManifest().version }, location.origin)
  const daPagina = e => {
    if (e.source !== window || e.data?.cineExt !== 'netflix') return
    if (e.data.tipo === 'quem') ola()
    else if (e.data.tipo === 'cmd') chrome.runtime.sendMessage({ de: 'cineminha', op: e.data.op, d: e.data.d, id: e.data.id }).catch(() => {})
  }
  addEventListener('message', daPagina)
  window.__cinePonteOff = () => removeEventListener('message', daPagina)
  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.de === 'netflix') window.postMessage({ ...msg, cineExt: 'netflix', tipo: 'estado', de: undefined }, location.origin)
    // o botão da extensão: projetar a aba escolhida, sem a faixa de compartilhamento do Chrome
    else if (msg?.de === 'captura') window.postMessage({ cineExt: 'netflix', tipo: 'captura', id: msg.id, titulo: msg.titulo }, location.origin)
  })
  ola(); addEventListener('DOMContentLoaded', ola)
}
