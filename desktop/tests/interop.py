"""Native app <-> actual website transport. Local relay, synthetic media, no production writes.
Requires: compiled desktop binary, Python Playwright, installed Chrome/Chromium.
Run: python3 desktop/tests/interop.py [path/to/cineminha-desktop]
"""
from pathlib import Path
import functools, http.server, json, os, queue, subprocess, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
BINARY = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT/'desktop/target/debug/cineminha-desktop'
PAGE = '''<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><button id="join">Entrar</button><script type="module">
import {joinRoom,selfId} from '/vendor/trystero.js';
__FILM_PC__
function iceReport(){} function evento(){}
window.result={id:selfId,peers:0,chats:[],streams:[],errors:[]};
join.onclick=async()=>{
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('sala:test'));
 const roomId=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
 const relay=new URLSearchParams(location.search).get('relay');
 const room=window.room=joinRoom({appId:'cineminha-native-test',password:'test',rtcPolyfill:FilmPC,relayConfig:{urls:[relay]},rtcConfig:{iceServers:[]},_test_only_mdnsHostFallbackToLoopback:true},roomId,{onJoinError:e=>result.errors.push(e.error)});
 const hello=room.makeAction('hello'),chat=room.makeAction('chat'),share=room.makeAction('share');
 chat.onMessage=v=>result.chats.push(v.text);
 hello.onMessage=v=>result.hello=v;
 share.onMessage=v=>result.share=v;
 const ac=window.ac=new AudioContext();await ac.resume();
 room.onPeerStream=(stream,id,meta)=>{
   result.streams.push({id,meta,video:stream.getVideoTracks().length,audio:stream.getAudioTracks().length});
   if(stream.getVideoTracks().length){const v=document.createElement('video');v.autoplay=true;v.muted=true;v.srcObject=stream;document.body.append(v);v.play().catch(()=>{});}
   if(stream.getAudioTracks().length){const a=ac.createAnalyser();ac.createMediaStreamSource(stream).connect(a);window.analyzers??=[];analyzers.push(a);}
 };
 room.onPeerJoin=async id=>{
   result.peers++;
   await hello.send({key:'g:browser',name:'Navegador',muted:false},{target:id});
   await chat.send({id:'browser-message',name:'Navegador',key:'g:browser',text:'Olá do navegador',ts:Date.now()},{target:id});
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');let n=0;
   window.drawTimer=setInterval(()=>{ctx.fillStyle=n++%2?'red':'blue';ctx.fillRect(0,0,320,180)},100);
   await room.addStream(canvas.captureStream(10),{target:id,metadata:{screen:1}});
   const osc=ac.createOscillator(),dest=ac.createMediaStreamDestination();osc.connect(dest);osc.start();
   await room.addStream(dest.stream,{target:id,metadata:{voice:1}});
 };
};
window.audioPeak=()=>Math.max(0,...(window.analyzers||[]).map(a=>{const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);return Math.max(...b.map(Math.abs));}));
</script>'''
app_source=(ROOT/'public/app.js').read_text()
PAGE=PAGE.replace('__FILM_PC__',app_source[app_source.index('function stereoSdp('):app_source.index('async function iceReport(')]).encode()

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/desktop-test'):
            self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.end_headers();self.wfile.write(PAGE)
        else: super().do_GET()
    def log_message(self,*args):pass

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'public')))
threading.Thread(target=server.serve_forever,daemon=True).start()
native=subprocess.Popen([str(BINARY),'--test-session'],env=dict(os.environ,CINEMINHA_TEST_AUDIO_SINK='1'),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
logs=[];lines=queue.Queue()
def read():
    for line in native.stdout:
        logs.append(line.rstrip()); lines.put(line.rstrip())
threading.Thread(target=read,daemon=True).start()
try:
    relay=lines.get(timeout=15).split('TEST_RELAY ',1)[1]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/google-chrome-stable',headless=True,args=['--autoplay-policy=no-user-gesture-required','--disable-features=WebRtcHideLocalIpsWithMdns'])
        page=browser.new_page();page.on('pageerror',lambda e:logs.append('BROWSER_ERROR '+str(e)));page.on('console',lambda m: logs.append('BROWSER_'+m.type+' '+m.text) if m.type in ['error','warning'] else None)
        order=os.environ.get('CINEMINHA_TEST_BROWSER_ORDER')
        if order in ['first','last']:page.add_init_script('Math.random=()=>'+('0' if order=='first' else '0.999999'))
        page.goto(f'http://127.0.0.1:{server.server_port}/desktop-test?relay={relay}')
        page.click('#join')
        page.wait_for_function('result.peers>0',timeout=25000)
        page.wait_for_function('result.chats.includes("Olá do Rust nativo")',timeout=15000)
        try:
            page.wait_for_function('[...document.querySelectorAll("video")].some(v=>v.videoWidth>0 && v.currentTime>.2)',timeout=15000)
        except Exception:
            print('RESULT',page.evaluate('result'))
            print('RTC',page.evaluate('async()=>await Promise.all(Object.values(room.getPeers()).map(async pc=>({signaling:pc.signalingState,ice:pc.iceConnectionState,local:pc.localDescription?.sdp,remote:pc.remoteDescription?.sdp,stats:[...await pc.getStats()].map(x=>x[1]).filter(x=>["inbound-rtp","outbound-rtp"].includes(x.type))})))'))
            raise
        page.wait_for_function('audioPeak()>.001',timeout=15000)
        deadline=time.monotonic()+10
        while time.monotonic()<deadline and not any('TEST_REMOTE_VIDEO' in s for s in logs):time.sleep(.1)
        assert any('TEST_CHAT "Olá do navegador"' in s for s in logs),logs
        if not any('TEST_REMOTE_VIDEO decoded' in s for s in logs):
            print('SEND_STATS',page.evaluate('async()=>await Promise.all(Object.values(room.getPeers()).map(async pc=>({state:pc.signalingState,transceivers:pc.getTransceivers().map(t=>({mid:t.mid,direction:t.direction,current:t.currentDirection,track:t.sender.track?.kind})),stats:[...await pc.getStats()].map(x=>x[1]).filter(x=>["outbound-rtp","inbound-rtp"].includes(x.type))})))'))
        assert any('TEST_REMOTE_VIDEO decoded' in s for s in logs),logs
        print(json.dumps(page.evaluate('result'),ensure_ascii=False))
        print('PASS: handshake, chat bidirecional, vídeo nativo → navegador, áudio não silencioso, vídeo navegador → nativo.')
        page.evaluate('room.leave()');browser.close()
finally:
    native.terminate()
    try:native.wait(timeout=5)
    except subprocess.TimeoutExpired:native.kill();native.wait()
    server.shutdown()
    print('\n'.join(logs[-30:]))
    errors=native.stderr.read()
    if errors:print(errors[-5000:])
