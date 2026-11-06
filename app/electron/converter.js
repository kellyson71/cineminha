// Filmes em qualquer formato: o ffmpeg do sistema troca o som para AAC estéreo e, só se precisar,
// o vídeo para H.264. Legendas de texto do MKV viram WebVTT. O resultado fica em uma pasta temporária
// e é apagado ao sair do app.
import { execFile, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

let pasta = null
const tmp = () => (pasta ||= mkdtempSync(path.join(tmpdir(), 'cineminha-')))
export const limpar = () => { if (pasta) rmSync(pasta, { recursive: true, force: true }); pasta = null }

const probe = arq => new Promise((ok, err) => execFile('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', arq], { maxBuffer: 8e6 }, (e, out) => (e ? err(e) : ok(JSON.parse(out)))))
export const temFfmpeg = () => new Promise(ok => execFile('ffmpeg', ['-version'], e => ok(!e)))

const VIDEO_OK = ['h264', 'vp8', 'vp9', 'av1']
const AUDIO_OK = ['aac', 'opus', 'mp3', 'vorbis']
const LEG_TEXTO = ['subrip', 'ass', 'ssa', 'mov_text', 'webvtt', 'text']

// forcarVideo: o Chromium não decodificou o vídeo copiado (ex.: HEVC sem GPU) → recodifica
export async function converter(arq, { forcarVideo = false, progresso = () => {} } = {}) {
  const info = await probe(arq)
  const v = info.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const a = info.streams.find(s => s.codec_type === 'audio' && s.disposition?.default) || info.streams.find(s => s.codec_type === 'audio')
  const legs = info.streams.filter(s => s.codec_type === 'subtitle' && LEG_TEXTO.includes(s.codec_name))
  const leg = legs.find(s => /^(por|pt)/i.test(s.tags?.language || '')) || legs[0]
  const dur = +info.format?.duration || 0
  const id = createHash('sha1').update(arq + forcarVideo).digest('hex').slice(0, 12)
  const saida = path.join(tmp(), id + '.mp4')
  const vtt = leg ? path.join(tmp(), id + '.vtt') : null
  const copiaVideo = !forcarVideo && v && VIDEO_OK.concat('hevc').includes(v.codec_name)
  const copiaAudio = a && AUDIO_OK.includes(a.codec_name) && (a.channels || 2) <= 2 && a.codec_name === 'aac'
  if (existsSync(saida)) return { saida, vtt: vtt && existsSync(vtt) ? vtt : null, recodificouVideo: !copiaVideo, nomeLeg: leg?.tags?.title || leg?.tags?.language || '' }

  const args = ['-hide_banner', '-nostdin', '-y', '-i', arq, '-map', `0:${v.index}`]
  if (a) args.push('-map', `0:${a.index}`)
  args.push('-c:v', ...(copiaVideo ? ['copy'] : ['libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p']))
  if (copiaVideo && v.codec_name === 'hevc') args.push('-tag:v', 'hvc1')
  if (a) args.push('-c:a', ...(copiaAudio ? ['copy'] : ['aac', '-b:a', '192k', '-ac', '2']))
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', saida)
  if (leg) args.push('-map', `0:${leg.index}`, '-c:s', 'webvtt', vtt)

  await new Promise((ok, err) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let erro = ''
    p.stdout.on('data', d => {
      const m = String(d).match(/out_time_us=(\d+)/g)
      if (m && dur) progresso(Math.min(0.99, +m.at(-1).split('=')[1] / 1e6 / dur))
    })
    p.stderr.on('data', d => { erro = (erro + d).slice(-2000) })
    p.on('close', c => (c === 0 ? ok() : err(new Error('ffmpeg falhou: ' + erro.split('\n').filter(Boolean).at(-1)))))
  })
  progresso(1)
  return { saida, vtt, recodificouVideo: !copiaVideo, nomeLeg: leg?.tags?.title || leg?.tags?.language || '' }
}
