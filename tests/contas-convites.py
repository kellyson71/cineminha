"""Integração real navegador/API, usando um Redis REST temporário em memória.
Execute: python3 tests/contas-convites.py (requer Playwright para Python e Chrome).
Nenhuma conexão com o Redis de produção.
"""
import json, os, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
for artifact_dir in ['/tmp/cineminha-continuacao', '/tmp/cineminha-discord', '/tmp/cineminha-convite-rapido', '/tmp/cineminha-audio', '/tmp/cineminha-menu-polish']:
    Path(artifact_dir).mkdir(parents=True, exist_ok=True)
DB = {}
LOCK = threading.Lock()
class RedisREST(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_POST(self):
        cmd = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        op, k, *args = cmd
        with LOCK:
            val = DB.get(k)
            if op == 'GET': out = val
            elif op == 'SET':
                if 'NX' in args[1:] and k in DB: out = None
                else: DB[k] = args[0]; out = 'OK'
            elif op == 'DEL': out = int(k in DB); DB.pop(k, None)
            elif op == 'EXPIRE': out = int(k in DB)
            elif op == 'HGETALL': out = [x for pair in (val or {}).items() for x in pair]
            elif op == 'HGET': out = (val or {}).get(args[0])
            elif op == 'HEXISTS': out = int(args[0] in (val or {}))
            elif op == 'HSET': DB.setdefault(k, {})[args[0]] = args[1]; out = 1
            elif op == 'HDEL': out = int(args[0] in (val or {})); (val or {}).pop(args[0], None)
            elif op == 'LRANGE': out = (val or [])[int(args[0]):int(args[1])+1 if int(args[1]) >= 0 else None]
            elif op == 'LPUSH': DB.setdefault(k, []).insert(0,args[0]); out = len(DB[k])
            elif op == 'LTRIM': DB[k] = (val or [])[int(args[0]):int(args[1])+1]; out = 'OK'
            elif op == 'SMEMBERS': out = sorted(val or [])
            elif op == 'SADD': DB.setdefault(k, set()); n0 = len(DB[k]); DB[k].update(args); out = len(DB[k]) - n0
            elif op == 'HLEN': out = len(val or {})
            else: raise RuntimeError(cmd)
        payload = json.dumps({'result': out}).encode()
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(payload)

redis_server = ThreadingHTTPServer(('127.0.0.1', 0), RedisREST)
threading.Thread(target=redis_server.serve_forever, daemon=True).start()
env = dict(os.environ, PORT='8791', KV_REST_API_URL=f'http://127.0.0.1:{redis_server.server_port}', KV_REST_API_TOKEN='test-only')
log = open('/tmp/cineminha-continuacao/test-server.log','w')
server = subprocess.Popen(['node','tools/dev.mjs'], cwd=ROOT, env=env, stdout=log, stderr=log)
BASE='http://localhost:8791'
def api(path, body=None):
    req=Request(BASE+'/api/'+path, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type':'application/json'})
    try:
        with urlopen(req) as r: return r.status,json.load(r)
    except HTTPError as e: return e.code,json.load(e)
try:
    for _ in range(50):
        try: urlopen(BASE); break
        except Exception: time.sleep(.1)
    _, session = api('sessoes', {'tok':'kellyson','sessao':{'filme':'Teste de ingresso','quando':'Hoje, 21h','pessoas':['kauan','gabi'], 'poster':'https://example.com/poster.jpg'}})
    sid=session['sessao']['id']
    _, invitation = api('convite', {'tok':'kellyson','pw':'cineminha','filme':'Teste de ingresso','quando':'Hoje, 21h','pessoas':['kauan','gabi'],'diretos':True,'sessao':sid,'sala':'teste-contas'})
    assert api('convite', {'pw':'errada','filme':'Sem acesso','pessoas':['gabi']})[0]==400
    assert api('convite', {'pw':'cineminha','filme':'Sem admin','pessoas':['gabi']})[0]==200
    slug=invitation['slug']; suffix=invitation['diretos']['kauan']; initial, secret=suffix.split('#ticket=')
    status, preview=api(f'convite?s={slug}&p={initial}')
    assert status==200 and 'pw' not in preview['convite'] and not any(k.startswith('conv-uso') for k in DB)
    status,_=api('convite',{'op':'resgatar','s':slug,'p':initial,'segredo':'0'*48}); assert status==403
    # A disputa simultânea só pode emitir uma conta.
    from concurrent.futures import ThreadPoolExecutor
    gabi=invitation['diretos']['gabi']; gi,gs=gabi.split('#ticket=')
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda _: api('convite',{'op':'resgatar','s':slug,'p':gi,'segredo':gs}),range(2)))
    assert sorted(r[0] for r in results)==[200,409],results
    print('API: prévia sem consumo, segredo inválido e resgate concorrente passaram',flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/opt/google/chrome/chrome', headless=True, args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'])
        errors=[]
        context=browser.new_context(viewport={'width':1400,'height':950},permissions=['microphone'])
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/'+slug); page.wait_for_selector('#who .whocard')
        assert page.locator('#who input').evaluate_all('(xs)=>xs.map(x=>x.value)')==['kauan','gabi']
        page.screenshot(path='/tmp/cineminha-continuacao/ingresso.png')
        page.goto(BASE+'/'+slug+'/'+suffix)
        page.wait_for_function("!document.body.classList.contains('locked')")
        assert json.loads(page.evaluate("localStorage.getItem('cine.sess')"))['key']=='kauan'
        token=json.loads(page.evaluate("localStorage.getItem('cine.conta')"));assert token
        assert '#ticket=' not in page.url
        page.reload();page.wait_for_function("!document.body.classList.contains('locked')")
        page.click('#btnSettings');page.click('#btnConta')
        page.wait_for_selector('#contaForm')
        page.check('#prefMuted');page.check('#prefSpatial');page.uncheck('#prefNudges')
        page.fill('#contaCor','#59bc9a')
        # Upload atravessa HTTP e limite do corpo (foto >20 KB).
        page.set_input_files('#contaFile', str(ROOT/'public/assets/pfp-kauan.png'))
        page.wait_for_function("document.querySelector('#contaFoto img').src.startsWith('data:')")
        page.screenshot(path='/tmp/cineminha-continuacao/conta.png')
        page.click('#contaForm button[type=submit]');page.wait_for_selector('#contaModal',state='hidden')
        assert json.loads(DB['perfis']['kauan'])['cor']=='#59bc9a'
        assert json.loads(DB['perfis']['kauan'])['foto'].startswith('data:image/webp')
        page.reload();page.wait_for_function("!document.body.classList.contains('locked')")
        page.wait_for_timeout(1500)
        assert page.locator('#btnMic').get_attribute('aria-pressed')=='false',page.locator('#btnMic').evaluate('(e)=>e.outerHTML')
        assert json.loads(page.evaluate("localStorage.getItem('cine.prefs')"))['entryMuted'] is True
        assert not errors,errors
        # Convidar está acessível ao Kauan, sem senha nem ferramentas de admin.
        page.click('#btnSettings');assert page.locator('#admLogin').is_hidden()
        page.click('#btnSettings');page.click('#btnInviteDetails');page.wait_for_selector('#invFilme')
        page.locator('.invite-avatar').filter(has=page.locator('input[value=kauan]')).click()
        page.locator('.invite-avatar').filter(has=page.locator('input[value=gabi]')).click()
        page.click('#invGo');page.wait_for_selector('#invOut:not([hidden])')
        assert page.locator('#invOut .invite-link').count()==3
        page.click('#invClose')
        # Botão principal copia o convite geral sem abrir formulário.
        context.grant_permissions(['clipboard-read','clipboard-write'])
        page.click('#btnInvite');page.wait_for_function("document.querySelector('#toast').textContent.includes('Convite copiado')")
        quick_link=page.evaluate('navigator.clipboard.readText()')
        assert quick_link.startswith(BASE+'/') and page.locator('#inviteModal').is_hidden()
        _,quick=api('convite?s='+quick_link.split('/')[-1]);assert len(quick['convite']['pessoas'])==9
        # Sem formulário preenchido, o botão gera um convite geral.
        page.click('#btnInviteDetails');page.click('#invGo');page.wait_for_selector('#invOut:not([hidden])')
        assert page.locator('#invOut .invite-link').count()==1
        page.click('#invClose')
        # Filme com autocomplete, capa e nota, convite pessoal direto.
        def movies_fixture(route):
            m={'id':'tt0081505','filme':'O Iluminado','ano':'1980','poster':'https://example.com/poster.jpg','nota':8.4,'fonteNota':'IMDb','sinopse':'Uma sessão de terror.'}
            route.fulfill(json={'filme':m} if 'id=' in route.request.url else {'list':[m]})
        page.route('**/api/filmes?*',movies_fixture)
        page.click('#btnInviteDetails');page.fill('#invFilme','Iluminado')
        page.wait_for_selector('.movie-result');page.locator('.movie-result').last.click()
        page.wait_for_function("document.querySelector('#invPreview').textContent.includes('8.4')")
        page.locator('.invite-avatar').filter(has=page.locator('input[value=otavio]')).click()
        assert page.locator('#invQuando').count()==0 and page.locator('#invSessao').count()==0
        page.screenshot(path='/tmp/cineminha-convite-rapido/formulario.png')
        page.click('#invGo');page.wait_for_selector('#invOut:not([hidden])')
        direct_link=page.locator('#invOut input').input_value();assert '/o#ticket=' in direct_link
        assert page.locator('#invOut .invite-link').count()==1
        from urllib.parse import urlparse
        path=urlparse(direct_link).path
        html=urlopen(Request(BASE+path,headers={'User-Agent':'WhatsApp/2.0'})).read().decode()
        assert 'property="og:image" content="https://example.com/poster.jpg"' in html
        assert 'property="og:title" content="O Iluminado' in html
        assert direct_link.split('#ticket=')[-1] not in html
        assert not any(k.startswith('conv-uso:'+path.split('/')[1]+':') for k in DB)
        _,metadata=api('convite?s='+path.split('/')[1]);assert metadata['convite']['nota']==8.4 and metadata['convite']['quando']==''
        page.click('#invClose')
        # Minha conta pela própria poltrona.
        page.click('.seat.mine .seat__avatar');page.click('.seat.mine .pvol__account')
        page.wait_for_selector('#contaForm');page.click('#contaClose')
        # Outro navegador não reutiliza o ingresso nem vira convite aberto do grupo.
        stranger=browser.new_context();used=stranger.new_page();used.goto(BASE+'/'+slug+'/'+suffix)
        used.wait_for_selector('#gateErr:not([hidden])')
        assert 'já foi usado' in used.locator('#gateErr').inner_text()
        assert used.locator('#who input').count()==0
        assert used.evaluate("localStorage.getItem('cine.conta')") is None
        print('Navegador: filtro de convidados, entrada automática, reabertura, perfil e bloqueio de reuso passaram',flush=True)
        # Conta administrativa gera ingressos da sessão registrada.
        admin=browser.new_context(permissions=['microphone'])
        def expose_audio(route):
            source=route.fetch().text()
            route.fulfill(body=source+"\nwindow.__cine = { me, peers, mix, prefs, renderAll, applyPrefs, playVoice, sfx, playSound, updateDucking, addTile, shareInfo, tiles, get mic() { return mic }, get actions() { return actions } };",content_type='text/javascript')
        admin.route('**/app.js',expose_audio)
        admin.route('**/api/sons?f=*',lambda route:route.fulfill(body=(ROOT/'public/sounds/palmas.mp3').read_bytes(),content_type='audio/mpeg'))
        a=admin.new_page();a.set_default_timeout(10000);a.on('pageerror',lambda e:errors.append(str(e)))
        a.goto(BASE+'/?sala=teste-contas');a.fill('#pw','cineminha');a.locator('.whocard').filter(has=a.locator('input[value=kellyson]')).click()
        a.wait_for_function("!document.body.classList.contains('locked')")
        a.click('#btnSettings');a.fill('#admPw','kellyson');a.click('#admGo')
        a.wait_for_selector('#btnInvite:not([hidden])');a.click('#btnSettings');a.click('#btnDiary');a.locator('.diary__invite').first.click()
        a.wait_for_selector('#invFilme');assert a.input_value('#invFilme')=='Teste de ingresso'
        assert a.locator('#invWho input:checked').count()==2
        a.click('#invGo');a.wait_for_selector('#invOut:not([hidden])')
        assert a.locator('#invOut .invite-link').count()==3
        assert '#ticket=' in a.locator('#invOut input').nth(1).input_value()
        a.screenshot(path='/tmp/cineminha-continuacao/convites.png')
        assert not errors,errors
        # O arquivo de palmas é decodificável e a reação troca a pose.
        duration = a.evaluate("async () => { const ac = new AudioContext(); const buf = await ac.decodeAudioData(await (await fetch('/sounds/palmas.mp3')).arrayBuffer()); await ac.close(); return buf.duration }")
        assert 2 < duration < 5, duration
        a.click('#invClose');a.locator('body').click(position={'x':10,'y':10});a.keyboard.press('6')
        a.wait_for_function("!!document.querySelector('.seat.mine .seat__avatar img')?.src.match(/palmas[12]/)")
        # O sinal artificial do microfone não deve ativar a atenuação local neste cenário.
        if a.locator('#btnMic').get_attribute('aria-pressed')=='true': a.click('#btnMic')
        # Botão direito funciona com a tela vazia; redução automática atenua e restaura.
        a.click('#screenInner',button='right',position={'x':100,'y':100})
        a.wait_for_selector('.ctxmenu:not([hidden])')
        a.check('.ctxmenu .audio-duck input')
        assert a.evaluate('__cine.prefs.duck') is True
        a.evaluate('''() => {
            const c = window.__cine;
            c.peers.set('synthetic-luiz', {key:'luiz',name:'Luiz',speaking:false,muted:false});
            const dest = c.mix.ac.createMediaStreamDestination();
            c.playVoice(dest.stream,'synthetic-luiz'); c.renderAll();
        }''')
        a.evaluate("__cine.peers.get('synthetic-luiz').speaking=true; __cine.updateDucking()")
        a.wait_for_timeout(550)
        assert .28<a.evaluate('__cine.mix.movie.gain.value')<.34
        a.evaluate("__cine.peers.get('synthetic-luiz').speaking=false; __cine.updateDucking()")
        a.wait_for_timeout(1800)
        assert a.evaluate('__cine.mix.movie.gain.value')>.97
        # O fone silencia todos os barramentos e restaura o volume escolhido.
        a.locator('body').click(position={'x':10,'y':10});a.click('#btnDeaf');a.wait_for_timeout(2500)
        assert a.evaluate('[__cine.mix.movie,__cine.mix.voice,__cine.mix.board,__cine.mix.sfx].every(g=>g.gain.value<.02)')
        a.click('#btnDeaf');a.wait_for_timeout(2000)
        assert a.evaluate('__cine.mix.board.gain.value')>.7
        # Voz, projeção, sons e efeitos têm ajustes próprios por pessoa.
        a.click('.seat[data-key=luiz] .seat__avatar')
        assert a.locator('.seat[data-key=luiz] .person-audio__row').count()==4
        voice=a.locator('.seat[data-key=luiz] input[data-channel=voice]')
        voice.evaluate("e=>{e.value=.4;e.dispatchEvent(new Event('input',{bubbles:true}))}")
        assert abs(a.evaluate("__cine.mix.peer.get('synthetic-luiz').g.gain.value")-.4)<.01
        a.locator('.seat[data-key=luiz] .person-audio__row').nth(0).locator('button').click()
        assert a.evaluate("__cine.mix.peer.get('synthetic-luiz').g.gain.value")==0
        a.locator('.seat[data-key=luiz] .person-audio__row').nth(2).locator('button').click()
        a.evaluate("__cine.playSound('/media/sounds/test.mp3','teste','luiz')")
        assert a.evaluate("[...__cine.mix.userSounds].some(x=>x.key==='luiz' && x.kind==='board' && x.g.gain.value===0)")
        a.locator('.seat[data-key=luiz] .person-audio__row').nth(3).locator('button').click()
        a.evaluate("__cine.sfx('palmas','luiz')")
        assert a.evaluate("[...__cine.mix.userSounds].some(x=>x.key==='luiz' && x.kind==='effects' && x.g.gain.value===0)")
        a.evaluate('''() => { const c=__cine; const dest=c.mix.ac.createMediaStreamDestination();c.addTile('synthetic-luiz',dest.stream); }''')
        movie=a.locator('.seat[data-key=luiz] input[data-channel=movie]');movie.evaluate("e=>{e.value=.5;e.dispatchEvent(new Event('input',{bubbles:true}))}")
        # O slider da projeção também chega ao nó de áudio remoto.
        assert a.evaluate("__cine.tiles.get('synthetic-luiz').gain.gain.value")==.5
        a.screenshot(path='/tmp/cineminha-discord/controles.png')
        a.locator('body').click(position={'x':10,'y':10})
        # Configurações e Minha conta continuam acessíveis em tela cheia.
        a.click('#btnFs');a.wait_for_function('!!document.fullscreenElement')
        a.wait_for_selector('#settingsFsHome #btnSettings')
        a.click('#btnSettings');a.click('#btnConta');a.wait_for_selector('#contaForm')
        a.click('#contaClose');a.evaluate('document.exitFullscreen()');a.wait_for_function('!document.fullscreenElement')
        a.wait_for_selector('#settingsHome #btnSettings')
        assert not errors,errors
        print('Áudio: atenuação/restauração, fone, quatro canais por pessoa e tela cheia passaram',flush=True)
        # Mesmo perfil em outra aba não abre seleção nem troca a conta.
        a.evaluate("__cine.actions.hello.onMessage({key:'kellyson',name:'Kellyson'}, {peerId:'duplicate-kellyson'})")
        assert a.locator('#seatModal').is_hidden()
        assert a.evaluate('__cine.me.key')=='kellyson'
        # Menus de entrada/saída em ambos os controles de voz.
        a.click('#btnMic',button='right');a.wait_for_selector('#audioMenu')
        assert a.locator('#audioInput').is_visible() and a.locator('#audioOutput').is_visible()
        assert a.locator('#audioSpatial').is_checked()
        a.select_option('#voiceProfile','raw')
        a.wait_for_function("__cine.mic?.settings.engine==='off' && __cine.mic?.settings.gate===false")
        a.select_option('#voiceProfile','balanced')
        a.wait_for_function("__cine.mic?.effectiveEngine==='rnnoise' && __cine.mic?.settings.gate===false")
        # RNNoise não acumula supressão do navegador.
        assert a.evaluate('__cine.mic.raw.getAudioTracks()[0].getConstraints().noiseSuppression') is False
        a.locator('#voiceAdvanced summary').click()
        a.check('#gateEnabled');a.wait_for_function('__cine.mic?.settings.gate===true')
        a.locator('#gateHold').evaluate("e=>{e.value=1000;e.dispatchEvent(new Event('change',{bubbles:true}))}")
        a.wait_for_function('__cine.mic?.settings.hold===1000')
        a.uncheck('#gateEnabled');a.wait_for_function('__cine.mic?.settings.gate===false')
        a.screenshot(path='/tmp/cineminha-audio/menu.png')
        a.click('#audioMenuClose');a.click('#btnDeaf',button='right');a.wait_for_selector('#audioMenu')
        a.click('#audioMenuClose')
        # Cada controle tem a própria seta. Teste de voz usa ramo privado dos filtros.
        was_muted=a.evaluate('__cine.me.muted')
        a.click('#btnMicOptions');a.wait_for_selector('#audioMenu')
        a.locator('#voiceAdvanced').evaluate('e=>e.open=false')
        a.click('#testMic');a.wait_for_function("document.querySelector('#testMic').dataset.state==='recording'")
        assert a.evaluate('__cine.me.muted') is True
        assert a.evaluate('__cine.mic.testStream.id!==__cine.mic.stream.id')
        assert a.evaluate('__cine.mic.stream.getAudioTracks()[0].enabled') is False
        a.wait_for_function("document.querySelector('#micTestGlyph').textContent==='2'")
        a.screenshot(path='/tmp/cineminha-menu-polish/contagem.png')
        a.wait_for_function("document.querySelector('#micTestGlyph').textContent==='1'")
        a.wait_for_function("document.querySelector('#testMic').dataset.state==='playing'",timeout=12000)
        a.wait_for_function("document.querySelector('#testMic').dataset.state==='idle'",timeout=12000)
        assert a.evaluate('__cine.me.muted')==was_muted
        a.screenshot(path='/tmp/cineminha-audio/teste-microfone.png')
        a.click('#audioMenuClose');a.click('#btnDeafOptions');a.wait_for_selector('#audioMenu')
        a.click('#testMic');a.wait_for_function("document.querySelector('#testMic').dataset.state==='recording'")
        a.click('#audioMenuClose')
        assert a.evaluate('__cine.me.muted')==was_muted
        a.screenshot(path='/tmp/cineminha-audio/botoes.png')
        print('Teste de microfone: gravação privada, reprodução, cancelamento e estado de mudo preservado passaram',flush=True)
        # Renderiza HRTF em áudio offline: ambas as orelhas recebem energia.
        energy=a.evaluate('''async () => {
          const {createSpatialVoice,spatialPosition}=await import('/audio-settings.js');
          const ac=new OfflineAudioContext(2,48000,48000), osc=ac.createOscillator();osc.frequency.value=440;
          const graph=createSpatialVoice(ac,osc,ac.destination),pos=spatialPosition(2,0,4);
          graph.pan.positionX.value=pos.x;graph.pan.positionZ.value=pos.z;
          osc.start();const result=await ac.startRendering();
          return [0,1].map(ch=>result.getChannelData(ch).reduce((a,v)=>a+v*v,0));
        }''')
        assert min(energy)/max(energy)>.15,energy
        # Reprodução privada centralizada mesmo com sinal só na esquerda ou direita.
        stereo=a.evaluate('''async () => {
          const {createCenteredPlayback}=await import('/audio-settings.js');
          const results=[];
          for(const signalChannel of [0,1]) {
            const ac=new OfflineAudioContext(2,4800,48000), input=ac.createBuffer(2,4800,48000);
            const samples=input.getChannelData(signalChannel);
            for(let i=0;i<samples.length;i++) samples[i]=.2*Math.sin(2*Math.PI*440*i/48000);
            const test=createCenteredPlayback(ac,input);test.source.start();const rendered=await ac.startRendering();
            const l=rendered.getChannelData(0),r=rendered.getChannelData(1);
            results.push({energy:l.reduce((a,v)=>a+v*v,0),difference:l.reduce((a,v,i)=>Math.max(a,Math.abs(v-r[i])),0)});
          }
          return results;
        }''')
        assert all(x['energy']>1 and x['difference']<1e-7 for x in stereo),stereo
        print('Teste estéreo: sinal original só à esquerda ou só à direita reproduz igualmente nos dois canais.',flush=True)

        print('Áudio novo: menus, perfis, portão manual, HRTF nos dois ouvidos e conta estável passaram',flush=True)
        # A conta expirada no navegador volta à escolha de identidade.
        DB.pop('conta:'+token);page.goto(BASE+'/?sala=teste-contas');page.wait_for_selector('#pwField:not([hidden])')
        assert 'locked' in page.locator('body').get_attribute('class')
        # Layout do ingresso no celular.
        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True)
        m=mobile.new_page();m.goto(BASE+'/'+slug);m.wait_for_selector('.ticket')
        assert m.locator('body').evaluate('(e)=>e.scrollWidth <= innerWidth')
        m.screenshot(path='/tmp/cineminha-continuacao/ingresso-mobile.png')
        # A sala móvel também mantém o cabeçalho e os controles dentro da largura.
        m.locator('.whocard').filter(has=m.locator('input[value=kauan]')).click()
        m.wait_for_function("!document.body.classList.contains('locked')")
        assert m.locator('body').evaluate('(e)=>e.scrollWidth <= innerWidth')
        m.screenshot(path='/tmp/cineminha-discord/sala-mobile.png')
        # Sair revoga o token e permite escolher outra identidade.
        a.click('#btnSettings');a.click('#btnConta');a.click('#contaSair')
        a.wait_for_selector('#pwField:not([hidden])')
        assert a.evaluate("localStorage.getItem('cine.conta')") is None
        assert not errors,errors
        browser.close()
    # A ferramenta MCP retorna os links pessoais e vincula o convite à sessão.
    mcp=subprocess.Popen(['node','tools/mcp.mjs'],cwd=ROOT,env=dict(os.environ,CINEMINHA_URL=BASE,CINEMINHA_ADMIN='kellyson',CINEMINHA_SENHA='cineminha'),stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
    rpc={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'criar_sessao','arguments':{'filme':'Sessão via MCP','pessoas':['pedro'],'gerar_convite':True,'sala':'teste-mcp'}}}
    output,_=mcp.communicate(json.dumps(rpc)+'\n',timeout=15)
    result=json.loads(output)['result'];assert not result.get('isError'),result
    data=json.loads(result['content'][0]['text']);assert '#ticket=' in data['diretos']['pedro']
    assert json.loads(DB['sessoes'][data['sessao']])['convite'] in data['convite']
    request_file=Path('/tmp/cineminha-discord/convite-test.json');request_file.write_text(json.dumps({'sessao':data['sessao'],'pessoas':['otavio','milenny'],'sala':'teste-skill'}))
    cli=subprocess.run(['node','tools/cine.mjs','criar_convite','--file',str(request_file)],cwd=ROOT,env=dict(os.environ,CINEMINHA_URL=BASE,CINEMINHA_SENHA='cineminha'),capture_output=True,text=True,timeout=20)
    assert cli.returncode==0,cli.stderr+cli.stdout
    invitation_cli=json.loads(cli.stdout);assert set(invitation_cli['diretos'])=={'otavio','milenny'}
    for arguments, personal in [({},False),({'pessoas':['otavio']},True)]:
        request_file.write_text(json.dumps(arguments))
        run=subprocess.run(['node','tools/cine.mjs','criar_convite','--file',str(request_file)],cwd=ROOT,env=dict(os.environ,CINEMINHA_URL=BASE,CINEMINHA_SENHA='cineminha'),capture_output=True,text=True,timeout=20)
        assert run.returncode==0,run.stdout+run.stderr
        result=json.loads(run.stdout);assert ('#ticket=' in result['link'])==personal
    print('Convite rápido: clique único, formulário vazio, grupos, pessoa única e preview sem consumir ingresso passaram',flush=True)
    print('Skill/CLI: convite de sessão existente para convidados escolhidos passou',flush=True)
    print('MCP: cadastro, ingresso de grupo e link pessoal passaram',flush=True)
    print('PASS: contas, convites e preferências; nenhum dado de produção acessado.',flush=True)
finally:
    server.terminate();server.wait();redis_server.shutdown();log.close()
