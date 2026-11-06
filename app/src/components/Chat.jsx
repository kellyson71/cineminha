import { memo, useLayoutEffect, useRef, useState } from 'react'
import { person, REACT_BY, fmtTime } from '../data.js'
import { Icon, Pfp } from './ui.jsx'

const QUICK = ['1f602', '2764_fe0f', '1f631', '1f480']
const GROUP_MS = 5 * 60e3

export const ReactArt = ({ id, size, still }) => {
  const r = REACT_BY[id]
  return r ? <img className="remoji" src={still ? r.still : r.anim} alt={r.label} width={size} height={size} draggable={false} decoding="async" /> : null
}

const Msg = memo(function Msg({ m, cont, mine, reacts, myKey, onReact, onReply }) {
  const p = person(m.key, m.name)
  return (
    <li className={'msg' + (mine ? ' mine' : '') + (cont ? ' cont' : '')} data-key={m.key}>
      <div className="msg__gutter"><Pfp pkey={m.key} size={36} name={m.name} /><time className="msg__clock">{fmtTime(m.ts)}</time></div>
      <div className="msg__body">
        {m.re && <button type="button" className="msg__quote"><Icon name="reply" /><b>{m.re.name}</b><span>{m.re.text}</span></button>}
        <div className="msg__head"><b style={{ color: p.cor || 'inherit' }}>{p.nome}</b><time>{fmtTime(m.ts)}</time></div>
        <div className="msg__line"><span className="msg__text">{m.text}</span></div>
        <div className="msg__reacts">
          {reacts && Object.entries(reacts).filter(([, s]) => s.length).map(([e, s]) => (
            <button key={e} type="button" className={'msg__react' + (s.includes(myKey) ? ' on' : '')} title={`${REACT_BY[e]?.label}: ${s.map(k => person(k).nome).join(', ')}`} onClick={() => onReact(m.id, e)}>
              <ReactArt id={e} size={18} still /><span>{s.length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="msg__acts">
        {QUICK.map(e => <button key={e} type="button" className="msg__act" title={REACT_BY[e]?.label} onClick={() => onReact(m.id, e)}><ReactArt id={e} size={20} still /></button>)}
        <button type="button" className="msg__act" title="Responder" onClick={() => onReply(m)}><Icon name="reply" /></button>
      </div>
    </li>
  )
})

export default function Chat({ messages, myKey, msgReacts, onSend, onReact, onTyping, fixo, onFixo }) {
  const listRef = useRef(null)
  const [text, setText] = useState('')
  const [reply, setReply] = useState(null)
  const stick = useRef(true)

  // rola para o fim só se já estava no fim (ou se a mensagem é minha)
  useLayoutEffect(() => {
    const l = listRef.current
    const last = messages[messages.length - 1]
    if (l && (stick.current || last?.key === myKey)) l.scrollTop = l.scrollHeight
  }, [messages, myKey])

  function submit(e) {
    e.preventDefault()
    const t = text.trim().slice(0, 500)
    if (!t) return
    onSend(t, reply && { id: reply.id, name: reply.name, text: reply.text })
    setText(''); setReply(null); onTyping(false)
  }

  return (
    <aside className="chat paper" id="chat">
      <button type="button" className="chat__modo" title={fixo ? 'Deixar o chat flutuando sobre o vídeo' : 'Fixar o chat à direita'} onClick={onFixo}>
        <Icon name={fixo ? 'maximize-2' : 'panel-right'} />
      </button>
      <header className="chat__head"><Icon name="message-square" /><h2>Chat</h2></header>
      <ol className="chat__list" id="chatList" ref={listRef}
        onScroll={e => { const l = e.currentTarget; stick.current = l.scrollHeight - l.scrollTop - l.clientHeight < 60 }}>
        {messages.map((m, i) => {
          if (m.sys) return <li key={m.id} className="sys">{m.text}</li>
          const prev = messages[i - 1]
          const cont = !m.re && prev && !prev.sys && prev.key === m.key && m.ts - prev.ts < GROUP_MS
          return <Msg key={m.id} m={m} cont={cont} mine={m.key === myKey} reacts={msgReacts[m.id]} myKey={myKey} onReact={onReact} onReply={setReply} />
        })}
      </ol>
      <div className="chat__reply" hidden={!reply}>
        <Icon name="reply" /><span>Respondendo a <b>{reply?.name}</b></span>
        <button type="button" title="Cancelar resposta (Esc)" onClick={() => setReply(null)}><Icon name="x" /></button>
      </div>
      <form className="chat__form" onSubmit={submit}>
        <button className="chat__tool" type="button" title="GIFs e figurinhas"><Icon name="sticker" /></button>
        <button className="chat__tool" type="button" title="Enviar imagem (ou cole no campo)"><Icon name="image-plus" /></button>
        <input id="chatInput" maxLength={500} placeholder="Mensagem" autoComplete="off" value={text}
          onChange={e => { setText(e.target.value); onTyping(!!e.target.value.trim()) }}
          onBlur={() => onTyping(false)}
          onKeyDown={e => { if (e.key === 'Escape') setReply(null) }} />
        <button className="chat__send" type="submit" title="Enviar"><Icon name="send" /></button>
      </form>
    </aside>
  )
}
