import { useRef, useState } from 'react'
import { REACTS } from '../data.js'
import { Icon, Check } from './ui.jsx'
import { PersonRows } from './PersonAudio.jsx'
import { Pfp } from './ui.jsx'

const pct = v => Math.round(v * 100) + '%'

function MixRow({ icon, label, title, value, max, onChange, cls = 'mrow' }) {
  return (
    <label className={cls} title={title}>
      <Icon name={icon} /><span>{label}</span>
      <input type="range" min="0" max={max} step="0.01" value={value} onChange={e => onChange(+e.target.value)} onDoubleClick={() => onChange(1)} />
      <output>{pct(value)}</output>
    </label>
  )
}

function ReactItem({ def, i, onReact }) {
  const [hover, setHover] = useState(false)
  const hold = useRef()
  const stop = () => { clearTimeout(hold.current?.first); clearInterval(hold.current?.iv) }
  return (
    <button type="button" className="reactgrid__item" title={def.label + (i < 9 ? ` (${i + 1})` : '')}
      onPointerEnter={() => setHover(true)} onPointerLeave={() => { setHover(false); stop() }}
      onPointerDown={e => { e.preventDefault(); onReact(def.id); hold.current = { first: setTimeout(() => { hold.current.iv = setInterval(() => onReact(def.id), 150) }, 300) } }}
      onPointerUp={stop} onPointerCancel={stop}>
      <img className="remoji" src={hover ? def.anim : def.still} alt={def.label} width={34} height={34} draggable={false} />
      <span>{def.label}</span>
    </button>
  )
}

export default function Toolbar(p) {
  const { pop, togglePop, sharing, onShareScreen, onShareFile, onStopShare, onReact, mix, setMix, others, vols, setVol,
    muted, deaf, onMic, onDeaf, chatOn, setChatOn, teatro, setTeatro, palco, setPalco, onFs, fs, prefs, setPref,
    onTrocar, onPausa, onReload, subs, setSubs, jogos, jogosOn, onJogo, desktop } = p
  const fileRef = useRef(null)
  const [tab, setTab] = useState('emoji')

  return (
    <div className="toolbar">
      <div className="popwrap">
        <button className={'btn btn--project' + (sharing ? ' on-air' : '')} aria-expanded={pop === 'share'}
          onClick={() => (sharing ? onStopShare() : togglePop('share'))}>
          <Icon name={sharing ? 'monitor-off' : 'projector'} /><span>{sharing ? 'Parar' : 'Projetar'}</span>
        </button>
        <div className="pop sharemenu" hidden={pop !== 'share'}>
          <button title="Para filme numa aba, jogo ou app" type="button" className="menuitem" onClick={onShareScreen}><Icon name="monitor" /><span><b>Tela ou janela</b></span></button>
          <button title=".mp4 / .mkv / .webm, qualidade máxima" type="button" className="menuitem" onClick={() => fileRef.current.click()}><Icon name="film" /><span><b>Arquivo</b></span></button>
          <input type="file" ref={fileRef} accept="video/*,.mkv" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onShareFile(f) }} />
          <div className="sharemenu__junto">
            <span className="sharemenu__lbl">Assistir junto, sem transmitir</span>
            <form className="midia-form" autoComplete="off" onSubmit={e => e.preventDefault()}>
              <input placeholder="Link do YouTube (Spotify vai para a rádio)" inputMode="url" />
              <button type="submit" className="btn btn--primary btn--icon" title="Abrir para todos"><Icon name="play" /></button>
            </form>
          </div>
          <Check title="60 fps e o mínimo de atraso" checked={prefs.gameMode} onChange={v => setPref('gameMode', v)}>Modo jogo</Check>
          {desktop.ativo && (
            <label title="O som de um programa só vai sem as vozes da call" className="sel"><Icon name="volume-2" /><span><b>Som</b></span>
              <select value={desktop.audioFonte} onFocus={desktop.atualizarProgramas} onChange={e => desktop.setAudioFonte(e.target.value)}>
                <option value="sistema">Do sistema</option>
                <option value="nenhum">Sem som</option>
                {desktop.info?.pactl && desktop.programas.map(a => <option key={a.id} value={'app:' + a.id}>Só {a.nome}</option>)}
                {desktop.audioFonte.startsWith('app:') && !desktop.programas.some(a => 'app:' + a.id === desktop.audioFonte) && <option value={desktop.audioFonte}>Só {desktop.audioFonte.slice(4)}</option>}
              </select>
            </label>
          )}
        </div>
      </div>
      {onTrocar && <button className="btn btn--ghost" title="Trocar a tela ou janela projetada sem parar a transmissão" onClick={onTrocar}><Icon name="monitor-up" /><span>Trocar</span></button>}
      {onReload && <button className="btn btn--icon btn--ghost" title="Recarregar a projeção (se travou)" onClick={onReload}><Icon name="refresh-cw" /></button>}
      {onPausa && <button className="btn btn--ghost" title="Pedir pausa para quem projeta (P)" onClick={onPausa}><Icon name="pause" /><span>Pausa aí</span></button>}
      {subs != null && <button className="btn btn--icon btn--ghost" title="Legendas" aria-pressed={subs} onClick={() => setSubs(!subs)}><Icon name="captions" /></button>}
      <span className="toolbar__grow" />

      <div className="popwrap">
        <button className="btn btn--icon btn--ghost" title="Reações (R)" aria-expanded={pop === 'react'} onClick={() => togglePop('react')}><Icon name="smile-plus" /></button>
        <div className="reactgrid" hidden={pop !== 'react'}>
          <div className="reactgrid__tabs" role="tablist">
            {[['emoji', 'Reações'], ['memes', 'Memes'], ['sons', 'Sons']].map(([k, l]) => (
              <button key={k} type="button" className="reactgrid__tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'emoji' && <div className="reactgrid__emoji">{REACTS.map((d, i) => <ReactItem key={d.id} def={d} i={i} onReact={onReact} />)}</div>}
          {tab === 'emoji' && <p className="gifs__by reactgrid__credit">Emoji animados: Noto Emoji (Google), CC BY 4.0</p>}
          {tab !== 'emoji' && <p className="sons__hint" style={{ padding: '1.4rem .8rem', textAlign: 'center' }}>Disponível quando o app estiver conectado à sala.</p>}
        </div>
      </div>
      <div className="popwrap">
        <button className={'btn btn--icon btn--ghost' + (jogosOn.length ? ' on-air' : '')} title="Jogos" aria-expanded={pop === 'jogos'} onClick={() => togglePop('jogos')}><Icon name="gamepad-2" /></button>
        <div className="pop sharemenu" hidden={pop !== 'jogos'}>
          {Object.entries(jogos).map(([id, J]) => (
            <button key={id} type="button" className="menuitem" onClick={() => onJogo(id)}><Icon name={jogosOn.includes(id) ? 'play' : 'gamepad-2'} /><span><b>{J.nome}</b></span></button>
          ))}
        </div>
      </div>
      <div className="popwrap">
        <button className="btn btn--icon btn--ghost radiobtn" title="Rádio da sala: música de fundo para todos"><Icon name="music" /></button>
      </div>

      <div className="popwrap">
        <button className="btn btn--icon btn--ghost" title="Áudio da sala e das pessoas" aria-expanded={pop === 'mixer'} onClick={() => togglePop('mixer')}><Icon name="sliders-horizontal" /></button>
        <div className="pop mixer" hidden={pop !== 'mixer'}>
          <MixRow cls="mrow mrow--geral" icon="volume-2" label="Geral" title="Volume de tudo. Duplo clique volta a 100%" max={1} value={mix.master} onChange={v => setMix('master', v)} />
          <MixRow icon="film" label="Filme" title="Duplo clique volta a 100%" max={2} value={mix.movie} onChange={v => setMix('movie', v)} />
          <MixRow icon="users" label="Vozes" title="Duplo clique volta a 100%" max={2} value={mix.voices} onChange={v => setMix('voices', v)} />
          <MixRow icon="volume-2" label="Sons" title="Sons da aba Sons das reações" max={1.5} value={mix.board} onChange={v => setMix('board', v)} />
          <MixRow icon="bell" label="Efeitos" max={1} value={mix.sfx} onChange={v => setMix('sfx', v)} />
          <MixRow icon="music" label="Rádio" title="Rádio da sala (só para você)" max={1} value={mix.radio} onChange={v => setMix('radio', v)} />
          <div id="mixPeople">
            {others.map(u => (
              <details className="person-audio person-audio--mix" key={u.key}>
                <summary><Pfp pkey={u.key} size={24} name={u.name} /><span>{u.name}</span></summary>
                <PersonRows pkey={u.key} vols={vols} setVol={setVol} />
              </details>
            ))}
          </div>
          <label title="Volta ao volume escolhido quando a conversa para" className="check mixer__opt"><input type="checkbox" checked={!!prefs.duck} onChange={e => setPref('duck', e.target.checked)} /><span><b>Baixar durante falas</b></span></label>
          <label title="Quem senta à sua esquerda soa mais à esquerda (melhor com fone)" className="check mixer__opt"><input type="checkbox" checked={!!prefs.spatial} onChange={e => setPref('spatial', e.target.checked)} /><span><b>Espacial</b></span></label>
          <label title="Sugere ajustes quando o filme abafa a conversa ou alguém fala baixo" className="check mixer__opt mixer__opt--2"><input type="checkbox" checked={!!prefs.nudges} onChange={e => setPref('nudges', e.target.checked)} /><span><b>Avisos de volume</b></span></label>
        </div>
      </div>

      <div className="voicectl">
        <div className={'voice-control popwrap' + (muted ? ' voice-control--muted' : '')}>
          <button className={'btn btn--icon' + (muted ? ' btn--muted' : '')} aria-pressed={!muted} title={muted ? 'Microfone mudo (M para ligar)' : 'Microfone ligado (M para mutar)'} onClick={onMic}>
            <Icon name={muted ? 'mic-off' : 'mic'} />
          </button>
          <button type="button" className="voice-options" title="Opções do microfone" aria-label="Opções do microfone" onClick={() => togglePop('settings')}><Icon name="chevron-down" /></button>
        </div>
        <div className="voice-control popwrap">
          <button className="btn btn--icon" aria-pressed={deaf} title="Desativar todo o áudio (D)" onClick={onDeaf}><Icon name={deaf ? 'headphone-off' : 'headphones'} /></button>
          <button type="button" className="voice-options" title="Opções de áudio" aria-label="Opções de áudio" onClick={() => togglePop('mixer')}><Icon name="chevron-down" /></button>
        </div>
      </div>
      <button className="btn btn--icon" title="Mostrar/ocultar chat (C)" onClick={() => setChatOn(!chatOn)}><Icon name={chatOn ? 'message-square' : 'message-square-off'} /></button>
      <button className="btn btn--icon" title="Modo teatro (T): tela mais larga, chat embaixo" aria-pressed={teatro} onClick={() => setTeatro(!teatro)}><Icon name="rectangle-horizontal" /></button>
      <button className="btn btn--icon" title="Palco (G): a tela ocupa a página inteira" aria-pressed={palco} onClick={() => setPalco(!palco)}><Icon name={palco ? 'minimize' : 'maximize-2'} /></button>
      {desktop.ativo && <button className="btn btn--icon" title="Mini player sempre por cima (Ctrl+Shift+P)" aria-pressed={!!desktop.mini} onClick={desktop.toggleMini}><Icon name="panel-right" /></button>}
      <button className="btn btn--icon" title="Tela cheia (F)" onClick={onFs}><Icon name={fs ? 'minimize' : 'maximize'} /></button>
    </div>
  )
}
