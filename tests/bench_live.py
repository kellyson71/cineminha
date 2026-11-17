"""Mede o peso de cada jeito de transmitir a live, no Chrome de verdade (com a placa de vídeo), SEM live no ar.
Compara: juntar jogo+câmera no canvas (como o estúdio faz) vs. mandar a trilha direto; codificar no processador
vs. no circuito de vídeo (VA-API); 720p vs. 540p. Para cada caso: % de processador do Chrome, fps que sai e o motivo de limite.
Requer o servidor local (node tools/dev.mjs), ffmpeg e Playwright. Leva uns 4 minutos e esquenta o PC: rode fora da live.
  python3 tests/bench_live.py
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess, time, os, json

BASE = os.environ.get('CINEMINHA_TEST_URL', 'http://localhost:8790')
OUT = Path('/tmp/cineminha-bench'); OUT.mkdir(exist_ok=True)
VIDEO = OUT / 'jogo720.y4m'
if not VIDEO.exists():  # 5 s de "jogo" em movimento, 1280x720 a 30 fps (o Chrome repete em loop como se fosse a captura)
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '5', '-pix_fmt', 'yuv420p', str(VIDEO)], check=True)

HW = ['--enable-features=AcceleratedVideoEncoder,VaapiVideoEncoder,VaapiVideoDecodeLinuxGL,VaapiIgnoreDriverChecks', '--ignore-gpu-blocklist']
BASE_ARGS = ['--ozone-platform=wayland', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={VIDEO}', '--window-size=900,600']

def cpu_chrome(pids_antes=None):
    """tempo de CPU (s) somado de todos os processos chrome desta instância de teste"""
    tot = 0.0
    for pid in os.listdir('/proc'):
        if not pid.isdigit(): continue
        try:
            cmd = open(f'/proc/{pid}/cmdline', 'rb').read().decode(errors='ignore')
            if 'cineminha-bench' not in cmd: continue
            st = open(f'/proc/{pid}/stat').read().split(')')[-1].split()
            tot += (int(st[11]) + int(st[12])) / os.sysconf('SC_CLK_TCK')
        except Exception: pass
    return tot

# roda dentro da página: monta a fonte (câmera falsa = "jogo"), opcionalmente o compositor do estúdio, e envia por WebRTC local
CENA = '''async ({ juntar, qualidade, codec }) => {
  const jogo = (await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: 30 } })).getVideoTracks()[0]
  const cam = (await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, frameRate: 30 } })).getVideoTracks()[0]
  let trilha = jogo
  if (juntar) {
    const { criaCompositor } = await import('/live/compositor.js')
    const comp = criaCompositor({ fps: 30, qualidade })
    comp.jogo(jogo); comp.cam(cam)
    trilha = comp.saida.getVideoTracks()[0]
  } else if (qualidade === 540) await jogo.applyConstraints({ width: 960, height: 540 })
  const a = new RTCPeerConnection(), b = new RTCPeerConnection()
  a.onicecandidate = e => e.candidate && b.addIceCandidate(e.candidate); b.onicecandidate = e => e.candidate && a.addIceCandidate(e.candidate)
  const tr = a.addTransceiver(trilha, { direction: 'sendonly' })
  const cods = RTCRtpSender.getCapabilities('video').codecs
  tr.setCodecPreferences([...cods.filter(x => x.mimeType.toLowerCase() === 'video/' + codec), ...cods.filter(x => x.mimeType.toLowerCase() !== 'video/' + codec)])
  b.ontrack = e => { const v = document.createElement('video'); v.muted = true; v.srcObject = new MediaStream([e.track]); v.play(); document.body.append(v) }
  await a.setLocalDescription(); await b.setRemoteDescription(a.localDescription); await b.setLocalDescription(); await a.setRemoteDescription(b.localDescription)
  const p = tr.sender.getParameters(); p.encodings[0].maxBitrate = qualidade === 540 ? 1800000 : 3500000; await tr.sender.setParameters(p)
  window.__pc = a
}'''
STATS = '''async () => { let o = null; (await window.__pc.getStats()).forEach(x => { if (x.type === 'outbound-rtp' && x.kind === 'video') o = x })
  return o && { fps: Math.round(o.framesPerSecond || 0), w: o.frameWidth, h: o.frameHeight, motivo: o.qualityLimitationReason, codificador: o.encoderImplementation } }'''

CASOS = [
  ('juntar 720p, processador (como está hoje)', dict(juntar=True, qualidade=720, codec='vp8'), False),
  ('juntar 720p, H.264 no processador', dict(juntar=True, qualidade=720, codec='h264'), False),
  ('juntar 720p, H.264 na placa', dict(juntar=True, qualidade=720, codec='h264'), True),
  ('juntar 540p, H.264 na placa', dict(juntar=True, qualidade=540, codec='h264'), True),
  ('direto 720p, H.264 na placa (sem juntar)', dict(juntar=False, qualidade=720, codec='h264'), True),
  ('direto 720p, processador (sem juntar)', dict(juntar=False, qualidade=720, codec='vp8'), False),
]

res = []
with sync_playwright() as pw:
    for nome, cfg, hw in CASOS:
        args = BASE_ARGS + (HW if hw else []) + ['--user-data-dir=/tmp/cineminha-bench/perfil-' + ('hw' if hw else 'cpu')]
        nav = pw.chromium.launch(channel='chrome', headless=False, args=args)
        pg = nav.new_page(); pg.goto(f'{BASE}/live/')
        pg.evaluate(CENA, cfg)
        time.sleep(8)  # aquece (o WebRTC sobe a qualidade aos poucos)
        c0, t0 = cpu_chrome(), time.time()
        time.sleep(20)
        cpu = (cpu_chrome() - c0) / (time.time() - t0) * 100
        st = pg.evaluate(STATS)
        nav.close()
        linha = {'caso': nome, 'cpu_%': round(cpu), **(st or {})}
        res.append(linha); print(json.dumps(linha, ensure_ascii=False), flush=True)
        time.sleep(5)  # deixa esfriar um pouco entre um e outro

(OUT / 'resultado.json').write_text(json.dumps(res, ensure_ascii=False, indent=2))
print('\n% de processador = soma dos processos do Chrome de teste (100% = um núcleo inteiro). Resultado em', OUT / 'resultado.json')
