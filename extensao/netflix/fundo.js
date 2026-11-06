// Leva comandos do Cineminha para a aba da Netflix e o estado da Netflix de volta para o Cineminha.
const SITE = ['https://cineminha-boo.vercel.app/*', 'http://localhost:8790/*']
let netflixAtiva = null // última aba da Netflix que mandou estado tocando
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg?.de === 'netflix') {
    if (!msg.paused || netflixAtiva == null) netflixAtiva = sender.tab.id
    if (sender.tab.id !== netflixAtiva) return
    for (const t of await chrome.tabs.query({ url: SITE })) chrome.tabs.sendMessage(t.id, msg).catch(() => {})
  } else if (msg?.de === 'cineminha') {
    const abas = await chrome.tabs.query({ url: 'https://www.netflix.com/watch/*' })
    const alvo = abas.find(t => t.id === netflixAtiva) || abas.find(t => t.audible) || abas[0]
    if (alvo) chrome.tabs.sendMessage(alvo.id, msg).catch(() => {})
  }
})
chrome.tabs.onRemoved.addListener(id => { if (id === netflixAtiva) netflixAtiva = null })
