import { memo, useEffect, useRef } from 'react'

// Uma tela projetada. Remota: <video> com o stream e som no volume da pessoa.
// Minha tela: prévia muda. Meu arquivo: o próprio <video> que toca (e é capturado) entra aqui.
const Tile = memo(function Tile({ t, focus, thumb, index, volume, onFocus, onRemoteToggle }) {
  const box = useRef(null)
  const own = useRef(null)
  useEffect(() => {
    if (t.video) { box.current.prepend(t.video); return () => t.video.remove() }
    const v = own.current
    v.srcObject = t.stream
    v.muted = t.mine
    v.play().catch(() => {})
    return () => { v.srcObject = null }
  }, [t.stream, t.video, t.mine])
  useEffect(() => { if (!t.mine && own.current) own.current.volume = volume }, [volume, t.mine])
  const cls = ['tile', t.kind === 'arquivo' && 'tile--file', focus && 'focus', thumb && 'thumb', t.paused && 'paused', !t.mine && t.kind === 'arquivo' && 'remote-file'].filter(Boolean).join(' ')
  const click = e => {
    if (e.target.closest('button')) return
    if (t.kind === 'arquivo') { if (t.mine) { const v = t.video; v.paused ? v.play() : v.pause() } else onRemoteToggle(t.id) }
    else onFocus(t.id)
  }
  return (
    <div className={cls} tabIndex={0} ref={box} style={{ '--i': thumb ? index : 0 }} onClick={click}>
      {!t.video && <video ref={own} playsInline autoPlay disablePictureInPicture controls={false} />}
      <div className="tile__sub">{t.sub}</div>
      <div className="tile__paused"><span>Pausado</span></div>
      <div className="tile__label" title={t.kind}><i />{t.who}</div>
    </div>
  )
})

export default function Stage({ tiles, focusId, setFocusId, toast, busy, onRemoteToggle, vols, mix, deaf }) {
  const n = tiles.length
  // volume do filme de cada um (no <video>, máximo 100%)
  const volume = key => { const v = vols[key] || {}; return deaf || v.movieMute ? 0 : Math.min(1, (mix.master ?? 1) * (mix.movie ?? 1) * (v.movie ?? 1)) }
  let i = 0
  return (
    <div className="screen paper">
      <div className="screen__inner" id="screenInner">
        <div id="tiles" className={'tiles' + (n > 1 && focusId ? ' has-focus' : '')} data-n={n}>
          {tiles.map(t => {
            const thumb = n > 1 && !!focusId && t.id !== focusId
            return <Tile key={t.id} t={t} focus={n > 1 && t.id === focusId} thumb={thumb} index={thumb ? i++ : 0} volume={t.mine ? 0 : volume(t.key)}
              onFocus={id => setFocusId(f => (f === id ? null : id))} onRemoteToggle={onRemoteToggle} />
          })}
        </div>
        <div id="empty" className="empty" hidden={n > 0}>
          <div className="empty__bg" aria-hidden="true" />
          <div className="empty__box">
            <h2>Ninguém projetando</h2>
            <p>A sessão começa quando alguém projeta. Escolha <b>Projetar</b> na barra abaixo.</p>
          </div>
        </div>
        <div className="curtain" aria-hidden="true"><i className="curtain__l" /><i className="curtain__r" /></div>
        {busy && <div className="jogo-carregando"><span><i /><i /><i /></span><small>{busy}</small></div>}
        <div id="toast" className={'toast' + (toast.show ? ' show' : '')} role="status" aria-live="polite">{toast.text}</div>
        <div id="nudges" className="nudges" aria-live="polite" />
      </div>
    </div>
  )
}
