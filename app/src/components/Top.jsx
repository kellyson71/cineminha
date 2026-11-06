import { CFG, person } from '../data.js'
import { Icon, Pfp } from './ui.jsx'

const SetToggle = ({ texto, dica, v, set }) => (
  <label className="setp"><span><b>{texto}</b>{dica && <small>{dica}</small>}</span><input type="checkbox" checked={!!v} onChange={e => set(e.target.checked)} /></label>
)

export default function Top({ tempo, me, count, pop, togglePop, onLogout, prefs, setPref, mics, micId, setMicId, canal, canalNome, canais, setCanal, addCanal, desktop, meKey }) {
  const outrosCanais = canais.some(c => (c.id || '') !== canal && c.pres?.some(x => x.key !== meKey))
  const p = person(me.key, me.name)
  return (
    <header className="top">
      <div className="top__brand">
        <h1 className="brand">{CFG.nome}</h1>
        <div className="top__linha"><span className="top__tempo"><Icon name="clock" />sessão <b>{tempo}</b></span>{CFG.subtitulo && <span className="top__sub">{CFG.subtitulo}</span>}</div>
      </div>
      <button type="button" className="btn btn--icon btn--ghost top__diary" title="Diário: o que já vimos"><Icon name="book-open" /></button>

      <div className="popwrap chan">
        <button type="button" className="chan__btn" title="Trocar de canal" aria-expanded={pop === 'canal'} aria-haspopup="true" onClick={() => togglePop('canal')}>
          <Icon name="hash" /><span>{canalNome}</span><i className="chan__dot" hidden={!outrosCanais} /><Icon name="chevron-down" />
        </button>
        <div className="pop chan__pop" hidden={pop !== 'canal'}>
          <h3>Canais</h3>
          <ul className="chan__list">
            {canais.map(c => {
              const aqui = (c.id || '') === canal
              const pres = c.pres || []
              return (
                <li key={c.id || 'principal'}><button type="button" className="chan__item" title={aqui ? 'Você está aqui' : `Entrar em ${c.nome}`} onClick={() => { if (!aqui) setCanal(c.id || '') }}>
                  <Icon name="hash" /><span className="chan__name">{c.nome}</span>
                  {pres.length > 0 && <span className="chan__who" title={pres.map(x => x.name || person(x.key).nome).join(', ')}>{pres.slice(0, 4).map(x => <Pfp key={x.key} pkey={x.key} size={20} name={x.name} />)}{pres.length > 4 && <small>+{pres.length - 4}</small>}</span>}
                  {aqui && <small className="chan__here">aqui</small>}
                </button></li>
              )
            })}
          </ul>
          <form className="chan__new" onSubmit={e => { e.preventDefault(); const v = e.currentTarget.elements.n.value.trim(); if (v) { addCanal(v); e.currentTarget.reset() } }}>
            <input name="n" maxLength={32} placeholder="Novo canal" aria-label="Nome do novo canal" autoComplete="off" />
            <button type="submit" className="btn btn--icon btn--ghost" title="Criar canal"><Icon name="plus" /></button>
          </form>
        </div>
      </div>

      <div className="invite-split">
        <button type="button" className="btn btn--ghost" title="Gerar e copiar convite geral"><Icon name="ticket" /><span>Convidar</span></button>
        <button type="button" className="invite-split__options" title="Personalizar convite" aria-label="Personalizar convite"><Icon name="settings" /></button>
      </div>
      <span className={'status' + (count > 1 ? ' ok' : '')}><i /><b>{count === 1 ? 'Só você na sala' : `${count} na sala`}</b></span>

      <div className="top-account">
        <button type="button" className="top-profile" title="Minha conta" onClick={() => togglePop('settings')}>
          <span><Pfp pkey={me.key} size={30} name={me.name} /></span><span>{p.nome}</span>
        </button>
        <div className="popwrap top-settings">
          <button className="btn btn--icon btn--ghost" title="Configurações" aria-expanded={pop === 'settings'} onClick={() => togglePop('settings')}><Icon name="settings" /></button>
          <div className="pop settings" hidden={pop !== 'settings'}>
            <button type="button" className="settings__me" title="Minha conta · foto e preferências">
              <span><Pfp pkey={me.key} size={36} name={me.name} /></span><span><b>{p.nome}</b></span><Icon name="chevron-right" />
            </button>
            <h3>Voz</h3>
            <div className="seg" role="radiogroup" aria-label="Modo de voz">
              <label><input type="radio" name="vmode" checked={prefs.vmode !== 'ptt'} onChange={() => setPref('vmode', 'open')} /><span>Microfone aberto</span></label>
              <label><input type="radio" name="vmode" checked={prefs.vmode === 'ptt'} onChange={() => setPref('vmode', 'ptt')} /><span>Aperte para falar</span></label>
            </div>
            <label className="srow" hidden={prefs.vmode !== 'ptt'}><Icon name="keyboard" /><span>Segure</span><button type="button" className="btn btn--ghost keycap">V</button></label>
            <label className="srow"><Icon name="mic" />
              <select aria-label="Microfone" value={micId} onChange={e => setMicId(e.target.value)}>
                <option value="">Microfone padrão</option>
                {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microfone'}</option>)}
              </select>
            </label>
            <div className="setprefs">
              <h3>Tela</h3>
              <SetToggle texto="Modo teatro" dica="Tela mais larga, chat embaixo (T)" v={prefs.teatro} set={v => setPref('teatro', v)} />
              <SetToggle texto="Chat fixo na tela cheia" dica="Em vez de flutuar por cima do vídeo" v={prefs.chatFixo} set={v => setPref('chatFixo', v)} />
            </div>
            {desktop?.ativo && (
              <div className="setprefs">
                <h3>Desktop</h3>
                <SetToggle texto="Notificações" dica="Quem entra, quem projeta e quando te marcam (@nome)" v={prefs.notif} set={v => setPref('notif', v)} />
                <p className="setp"><span><b>Atalhos de qualquer lugar</b><small>Ctrl+Shift+M muta · Ctrl+Shift+D corta o som · Ctrl+Shift+P mini player</small></span></p>
                {desktop.info && <p className="setp"><span><b>Este computador</b><small>{[desktop.info.ffmpeg ? 'ffmpeg: qualquer formato de filme' : 'sem ffmpeg: só MP4/WebM', desktop.info.pactl ? 'som de um programa só' : ''].filter(Boolean).join(' · ')} · v{desktop.info.versao}</small></span></p>}
              </div>
            )}
            <button type="button" className="btn btn--ghost btn--block" onClick={onLogout}><Icon name="log-out" /><span>Sair da conta</span></button>
          </div>
        </div>
        <button type="button" className="btn btn--icon btn--ghost" title="Sair da conta" onClick={onLogout}><Icon name="log-out" /></button>
      </div>
    </header>
  )
}
