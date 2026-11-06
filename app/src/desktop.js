/* Recursos de desktop no renderer. Tudo é opcional: sem window.cine (rodando no navegador), nada quebra. */
import { useEffect, useRef, useState } from 'react'
import * as sala from './sala/sala.js'
import { person } from './data.js'

export const cine = typeof window !== 'undefined' ? window.cine : null

export function useDesktop({ prefs, setPref, fase, sharing, playing }) {
  const [info, setInfo] = useState(null)
  const [mini, setMini] = useState(false)
  const [convite, setConvite] = useState(null)
  const [programas, setProgramas] = useState([])
  const naoLidas = useRef(0)

  useEffect(() => {
    if (!cine) return
    cine.info().then(i => { setInfo(i); if (i.convite) setConvite(i.convite) })
    const offs = [cine.onMini(setMini), cine.onConvite(setConvite)]
    return () => offs.forEach(f => f())
  }, [])

  // estado para a bandeja e para o processo principal (voz segue minimizado; atalhos globais)
  const me = sala.useSala(s => s.me)
  const pessoas = sala.useSala(s => Object.keys(s.peers).length + 1)
  useEffect(() => { cine?.sala({ dentro: fase === 'dentro', muted: me.muted, deaf: me.deaf, pessoas }) }, [fase, me.muted, me.deaf, pessoas])
  useEffect(() => { cine?.acordado(sharing || playing) }, [sharing, playing])

  // notificações quando a janela não está em foco
  useEffect(() => {
    if (!prefs.notif) return
    const fora = () => !document.hasFocus()
    const notif = (title, body, key) => {
      if (!fora()) return
      const n = new Notification(title, { body, icon: person(key).foto, silent: true })
      n.onclick = () => cine?.mostrar()
      cine?.badge(++naoLidas.current)
    }
    const meu = () => sala.getSala().me
    const offs = [
      sala.on('entrou', h => notif(`${h.name} entrou na sala`, 'Cineminha', h.key)),
      sala.on('projetou', n => notif(`${n} começou a projetar`, 'Cineminha')),
      sala.on('msg', m => {
        if (m.key === meu().key) return
        const nome = (meu().name || '').toLowerCase()
        if (nome && m.text?.toLowerCase().includes('@' + nome)) notif(`${m.name} te marcou`, m.text, m.key)
        else if (fora()) cine?.badge(++naoLidas.current)
      }),
    ]
    const foco = () => { naoLidas.current = 0; cine?.badge(0) }
    addEventListener('focus', foco)
    return () => { offs.forEach(f => f()); removeEventListener('focus', foco) }
  }, [prefs.notif])

  // de onde vem o som da projeção: 'sistema' | 'nenhum' | 'app:<programa>'
  const audioFonte = prefs.audioFonte || 'sistema'
  const atualizarProgramas = () => cine?.programas().then(setProgramas)

  return {
    ativo: !!cine, info, mini, convite, limparConvite: () => setConvite(null),
    toggleMini: () => cine?.mini(!mini),
    audioFonte, setAudioFonte: v => setPref('audioFonte', v), programas, atualizarProgramas,
    // atalhos globais e menu da bandeja → mesmas ações dos botões
    useAtalhos(acoes) {
      const ref = useRef(acoes)
      ref.current = acoes
      useEffect(() => cine?.onAtalho(nome => ref.current[nome]?.()), [])
    },
  }
}
