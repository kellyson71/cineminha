/* Som do jogo na projeção: o ajudante do PC (node scripts/live-local.mjs) isola o som do Greenlight numa entrada
   "Cineminha-Programa". Este módulo pergunta ao ajudante se está tudo pronto e, se estiver, já deixa escolhido o
   "Som extra" (essa entrada) e o "Modo jogo" no menu de projetar: é só clicar em projetar e escolher a janela.
   Na tela vazia aparece um aviso de como está (pronto, sem som tocando, ou ajudante desligado). Não mexe no app.js. */
const AJUDANTE = 'http://localhost:8792/som'
const CMD = 'cd ~/projetos/cineminha && node scripts/live-local.mjs'
const $ = s => document.querySelector(s)
const eu = () => { try { return JSON.parse(localStorage.getItem('cine.sess'))?.key || '' } catch { return '' } }

document.head.append(Object.assign(document.createElement('style'), { textContent: `
.somjogo{display:inline-flex;align-items:center;gap:8px;margin:12px auto 0;padding:7px 14px 7px 10px;border-radius:999px;background:rgba(20,20,26,.78);color:#fff;font:600 .82rem/1.2 Inter,system-ui,sans-serif;backdrop-filter:blur(6px);text-shadow:none}
.somjogo i{width:9px;height:9px;border-radius:50%;background:#ffffff55;flex:none}
.somjogo.ok i{background:#3ddc84;box-shadow:0 0 8px #3ddc84}
.somjogo.aviso i{background:#ffb04a}
.somjogo button{border:0;border-radius:999px;padding:4px 10px;background:#ffffff1f;color:#fff;font:700 .75rem Inter,system-ui,sans-serif;cursor:pointer}
.somjogo button:hover{background:#ff4fa3}
.tema-gta6 .somjogo{background:rgba(28,8,48,.78);box-shadow:0 0 0 1px rgba(255,79,163,.35)}
` }))

let ultimo = null
async function confere() {
  if ($('#gate') && !$('#gate').hidden) return
  // só para quem projeta do PC com o ajudante (o dono): para os outros o Chrome pediria permissão de rede local à toa
  if (eu() !== 'kellyson') return
  const r = await fetch(AJUDANTE, { cache: 'no-store', targetAddressSpace: 'loopback' }).then(r => r.ok ? r.json() : null).catch(() => null)
  const greenlight = r?.isolado && /greenlight/i.test(r.isolado.id + r.isolado.nome)
  let pronto = false
  if (greenlight) {
    // escolhe o Som extra (a entrada do ajudante) e o Modo jogo; o app guarda a escolha sozinho (evento change)
    const sel = $('#extraAudio'), opt = sel && [...sel.options].find(o => /cineminha.?programa/i.test(o.textContent))
    if (opt) {
      pronto = true
      if (sel.value !== opt.value) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })) }
      const jogo = $('#gameMode'); if (jogo && !jogo.checked) { jogo.checked = true; jogo.dispatchEvent(new Event('change', { bubbles: true })) }
    }
  }
  pinta(!r ? 'desligado' : pronto ? 'pronto' : greenlight ? 'sem-lista' : 'sem-som')
}

function pinta(estado) {
  const box = $('.empty__box'); if (!box) return
  // ajudante desligado só interessa a quem projeta do PC dele (o dono); para os outros, nada aparece
  if (estado === 'desligado' && eu() !== 'kellyson') { $('.somjogo')?.remove(); return }
  if (estado === ultimo && $('.somjogo')) return
  ultimo = estado
  let el = $('.somjogo')
  if (!el) { el = document.createElement('div'); el.className = 'somjogo'; el.setAttribute('role', 'status'); box.append(el) }
  const txt = {
    pronto: ['ok', 'Som do jogo pronto: o Greenlight vai junto quando você projetar'],
    'sem-lista': ['aviso', 'Som do Greenlight isolado, mas a entrada ainda não apareceu: abra o menu de projetar uma vez'],
    'sem-som': ['aviso', 'Ajudante ligado: abra o jogo no Greenlight para o som entrar'],
    desligado: ['', 'Ajudante desligado: sem ele a projeção vai sem o som do jogo'],
  }[estado]
  el.className = 'somjogo ' + txt[0]
  el.innerHTML = '<i></i><span></span>'
  el.querySelector('span').textContent = txt[1]
  if (estado === 'desligado') {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Copiar comando'
    b.title = 'Cole no terminal e deixe aberto'
    b.onclick = () => navigator.clipboard.writeText(CMD).then(() => { b.textContent = 'Copiado: cole no terminal' })
    el.append(b)
  }
}

setInterval(confere, 5000)
setTimeout(confere, 1500)
