import { useEffect, useState } from 'react'
import { CFG, PEOPLE, asset, sha256 } from '../data.js'
import { guestKey, api } from '@site/core/rede.js'
import { Icon, Pfp } from './ui.jsx'

const GUEST = { id: 'guest', nome: 'Convidado', cor: '#a9b6bf', ...(CFG.convidado || {}) }

function WhoCard({ p, checked, onPick }) {
  const boneco = asset(p.boneco)
  return (
    <label className="whocard" style={{ '--c': p.cor || 'var(--accent)' }}>
      <input type="radio" name="who" value={p.id} checked={checked} onChange={() => onPick(p.id)} />
      <span className="whocard__in">
        <span className="whocard__art">
          {boneco && <img className="whocard__boneco" src={boneco} alt="" draggable={false} decoding="async" />}
          {p.foto ? <img className="pfp whocard__pfp" src={asset(p.foto)} alt="" width={44} height={44} decoding="async" /> : <Pfp pkey={p.id} size={44} />}
        </span>
        <b>{p.nome}</b>
      </span>
    </label>
  )
}

// link do convite colado (do site ou cineminha://) → { slug, ini, ticket }
export function lerConvite(txt) {
  try {
    const u = new URL(String(txt).trim().replace(/^cineminha:\/\//, 'https://x/'))
    const [slug = '', ini = ''] = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? { slug, ini, ticket: new URLSearchParams(u.hash.slice(1)).get('ticket') || '' } : null
  } catch { return null }
}

export default function Lobby({ onEnter, last, convite: conviteLink }) {
  const [link, setLink] = useState(conviteLink)
  const [inv, setInv] = useState(null)
  useEffect(() => { if (conviteLink) setLink(conviteLink) }, [conviteLink])
  // convite: carrega o ingresso; link pessoal (com ticket) já entra direto
  useEffect(() => {
    if (!link) return
    let vivo = true
    ;(async () => {
      const r = await api('convite?s=' + link.slug + (link.ini ? '&p=' + encodeURIComponent(link.ini) : ''))
      if (!vivo) return
      if (!r?.convite) { setErr('Esse convite não existe mais. Entre com a senha da sala.'); setLink(null); return }
      if (link.ini) {
        const res = await api('convite', { method: 'POST', body: { op: 'resgatar', s: link.slug, p: link.ini, segredo: link.ticket } })
        if (res?.conta?.token) return onEnter({ key: res.conta.key, name: res.conta.nome, pw: res.conta.pw, canal: res.convite?.sala || r.convite.sala || '' })
      }
      setInv(r.convite)
    })()
    return () => { vivo = false }
  }, [link])
  const [pw, setPw] = useState('')
  const [who, setWho] = useState(last?.key && !last.key.startsWith('g:') ? last.key : '')
  const [guestName, setGuestName] = useState(last?.key?.startsWith('g:') ? last.name : '')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(false)
  const fail = msg => { setErr(msg); setShake(true); setTimeout(() => setShake(false), 400) }

  async function submit(e) {
    e.preventDefault()
    if (!who) return fail('Escolha quem você é')
    if (inv) {
      const name = who === 'guest' ? guestName.trim().slice(0, 24) : PEOPLE.find(p => p.id === who)?.nome
      if (!name) return fail('Diga seu nome')
      const key = who === 'guest' ? guestKey(name) : who
      if (!key.startsWith('g:')) {
        const r = await api('convite', { method: 'POST', body: { op: 'ocupar', s: link.slug, key, pw: inv.pw } })
        if (r?.ocupado) return fail(`${name} já entrou por este convite. Se é você em outro aparelho, peça um link pessoal.`)
      }
      return onEnter({ key, name, pw: inv.pw, canal: inv.sala || '' })
    }
    if (CFG.senhaHash && (await sha256(pw.trim().toLowerCase())) !== CFG.senhaHash) return fail('Senha errada')
    if (who === 'guest') {
      const n = guestName.trim()
      if (!n) return fail('Diga seu nome')
      return onEnter({ key: guestKey(n), name: n.slice(0, 24), pw: pw.trim().toLowerCase() })
    }
    onEnter({ key: who, name: PEOPLE.find(p => p.id === who)?.nome, pw: pw.trim().toLowerCase() })
  }

  return (
    <div id="gate" className={'gate lobby' + (shake ? ' shake' : '')}>
      <div className="lobby__bg" aria-hidden="true" />
      <form className="lobby__inner" autoComplete="off" onSubmit={submit}>
        <header className="lobby__head">
          <span className="lobby__kicker"><Icon name="clapperboard" /><span>{inv ? 'Sessão · É só entrar' : 'Sessão de hoje'}</span></span>
          {inv?.poster && <img className="lobby__poster" src={inv.poster} alt="" />}
          <h1 className="lobby__title">{inv?.filme || CFG.nome}</h1>
          <p className="lobby__sub">{inv?.filme ? `no ${CFG.nome}` : 'Escolha quem você é para entrar'}</p>
        </header>
        <label className="field lobby__pw" hidden={!!inv}>
          <span>Senha da sala</span>
          <input type="password" placeholder="• • •" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
        </label>
        <fieldset className="who">
          <legend>Quem é você?</legend>
          {PEOPLE.filter(p => !inv || inv.pessoas?.includes(p.id) || p.id === 'kellyson').filter(p => !inv?.ocupados?.includes(p.id)).map(p => <WhoCard key={p.id} p={p} checked={who === p.id} onPick={setWho} />)}
          {CFG.convidados && (!inv || inv.convidados) && <WhoCard p={GUEST} checked={who === 'guest'} onPick={setWho} />}
        </fieldset>
        <label className="field guestname" hidden={who !== 'guest'}>
          <span>Seu nome</span>
          <input maxLength={24} placeholder="Como te chamam?" value={guestName} onChange={e => setGuestName(e.target.value)} />
        </label>
        <p className="gate__err" hidden={!err}>{err}</p>
        <button className="btn btn--primary lobby__go" type="submit"><Icon name="ticket" /><span>Entrar na sala</span></button>
        {!inv && (
          <label className="field lobby__convite">
            <span>Tem um convite?</span>
            <input placeholder="Cole o link aqui" onPaste={e => { const c = lerConvite(e.clipboardData.getData('text')); if (c) { e.preventDefault(); setLink(c) } }}
              onChange={e => { const c = lerConvite(e.target.value); if (c) setLink(c) }} />
          </label>
        )}
      </form>
    </div>
  )
}
