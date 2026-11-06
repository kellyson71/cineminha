// Leva comandos do Cineminha para a aba da Netflix e o estado da Netflix de volta para o Cineminha.
const SITE = ['https://cineminha-boo.vercel.app/*', 'http://localhost:8790/*']
let netflixAtiva = null // última aba da Netflix que mandou estado tocando

// Ao instalar ou atualizar, o Chrome não injeta nada nas abas que já estavam abertas:
// injeta agora, para não precisar recarregar a Netflix nem o Cineminha.
chrome.runtime.onInstalled.addListener(async () => {
  const inj = (tabs, files, world) => tabs.forEach(t => chrome.scripting.executeScript({ target: { tabId: t.id }, files, ...(world ? { world } : {}) }).catch(() => {}))
  const nf = await chrome.tabs.query({ url: 'https://www.netflix.com/*' })
  inj(nf, ['ponte-netflix.js']); inj(nf, ['player-netflix.js'], 'MAIN')
  inj(await chrome.tabs.query({ url: SITE }), ['ponte-cineminha.js'])
})

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.de === 'netflix' && sender.tab) {
    if (!msg.paused || netflixAtiva == null) netflixAtiva = sender.tab.id
    if (sender.tab.id !== netflixAtiva) return
    chrome.tabs.query({ url: SITE }).then(abas => abas.forEach(t => chrome.tabs.sendMessage(t.id, msg).catch(() => {})))
  } else if (msg?.de === 'cineminha') {
    chrome.tabs.query({ url: 'https://www.netflix.com/*' }).then(abas => {
      abas = abas.filter(t => /\/watch\//.test(t.url || ''))
      const alvo = abas.find(t => t.id === netflixAtiva) || abas.find(t => t.audible) || abas[0]
      if (alvo) chrome.tabs.sendMessage(alvo.id, msg).catch(() => {})
    })
  }
})
chrome.tabs.onRemoved.addListener(id => { if (id === netflixAtiva) netflixAtiva = null })
