// Projeta a aba atual no Cineminha pela tabCapture: o Chrome não mostra a faixa "Compartilhando…"
// quando quem captura é a extensão. O id do stream vale por poucos segundos e só para a aba do Cineminha.
const SITE = ['https://cineminha-boo.vercel.app/*', 'http://localhost:8790/*']
const $ = id => document.getElementById(id)
const erro = t => { $('msg').textContent = t; $('msg').className = 'erro'; $('ir').disabled = false }
;(async () => {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true })
  $('aba').textContent = aba?.title?.slice(0, 40) || 'esta aba'
  const sites = await chrome.tabs.query({ url: SITE })
  if (SITE.some(p => new RegExp('^' + p.replace(/[.]/g, '\\.').replace('*', '.*')).test(aba?.url || ''))) {
    $('ir').disabled = true; $('msg').textContent = 'Abra esta janela na aba que você quer projetar (ex.: a Netflix).'; return
  }
  if (!sites.length) { $('ir').disabled = true; $('msg').textContent = 'Abra o Cineminha e entre na sala primeiro.'; $('msg').className = 'erro'; return }
  $('ir').addEventListener('click', () => {
    $('ir').disabled = true; $('msg').textContent = 'Começando…'; $('msg').className = ''
    const site = sites.find(t => t.audible) || sites[0]
    chrome.tabCapture.getMediaStreamId({ targetTabId: aba.id, consumerTabId: site.id }, async id => {
      if (chrome.runtime.lastError || !id) return erro('O Chrome não deixou capturar: ' + (chrome.runtime.lastError?.message || 'sem permissão'))
      try {
        await chrome.tabs.sendMessage(site.id, { de: 'captura', id, titulo: aba.title || '' })
        $('msg').textContent = 'Projetando! Pode voltar para o Cineminha.'
        setTimeout(() => window.close(), 1200)
      } catch { erro('Não achei o Cineminha aberto. Recarregue a aba do Cineminha e tente de novo.') }
    })
  })
})()
