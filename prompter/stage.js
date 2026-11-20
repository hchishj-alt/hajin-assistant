// 촬영 화면: 이터니아 전시 사이트의 "프롬프터 스튜디오"(eternia-exhibition/studio)를 엔진으로 옮겨 온 것.
// 대사는 읽는 시간(초)에 맞춰 올라가고, 녹화는 고른 비율(16:9·9:16)로 잘라 저장한다. 테두리 조명, 렌즈·줌·마이크 고르기, 격자, [[구간]] 표시.
// 여기에 더한 것: 테이크 보관(onTake), 무료/프로 잠금(limits·needPro), 목소리 따라가기(프로).
// 모양은 stage.css (#st2 아래로만 적용).

const DEF = { mode: 'P', fsL: 44, fsP: 32, lh: 1.55, w: 80, fg: '#ffffff', bg: '#000000', dim: .35, ta: 'left', speed: 1, mk: 38, cd: 3, mirT: false, flv: false, beep: false, light: false, lv: 12, lt: '#ffffff', grid: false, dev: '', mic: '', q: 720, saveMir: true, viewMir: true, voice: false, cam: true };
const KEY = 'prompter:stage';
const small = () => Math.min(innerWidth, innerHeight) < 700;
function loadS() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (!s) { try { s = JSON.parse(localStorage.getItem('pst_S') || 'null'); } catch {} } // 예전 스튜디오 설정 이어받기
  const pc = !small() && !matchMedia('(pointer:coarse)').matches; // PC 웹캠은 처음에 가로로
  const base = { ...DEF, mode: pc ? 'L' : 'P', fsL: small() ? 26 : 44, fsP: small() ? 24 : 32 };
  return { ...base, ...(s || {}) };
}
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const autoSec = text => Math.max(5, Math.round(String(text || '').replace(/\[\[.+?\]\]|\s/g, '').length / 5.2));

const HTML = `
<div id="app">
  <header id="top">
    <button class="s-pill" id="backB" aria-label="나가기">‹ 나가기</button>
    <span id="ttl"></span>
    <div class="s-seg" role="group" aria-label="화면 비율"><button id="mL" aria-pressed="false"><span class="s-long">가로 </span>16:9</button><button id="mP" aria-pressed="true"><span class="s-long">세로 </span>9:16</button></div>
    <button class="s-pill" id="setBtn" aria-haspopup="dialog">설정</button>
  </header>
  <main id="stage">
    <div id="frame">
      <video id="cam" hidden autoplay muted playsinline></video>
      <div id="tint"></div><div id="grid" hidden></div><div id="mark"></div>
      <div id="flip"><div id="script"></div></div>
      <div id="bar"></div><div id="rec" hidden>0:00</div><div id="msg" hidden></div><div id="mic" hidden>목소리 따라가는 중</div>
      <div id="count" hidden></div><div id="slate" hidden></div>
    </div>
    <div id="turn" hidden>폰을 가로로 돌리면 더 크게 보여요</div>
  </main>
  <footer id="dock">
    <div class="s-side">
      <div class="s-clock" id="clock"><b>0:00</b> / 0:00</div>
      <button class="s-icon" id="resetB" aria-label="처음으로">처음</button>
    </div>
    <button id="go" class="s-nocam" aria-label="시작"><i></i></button>
    <div class="s-side s-r">
      <div class="s-spd" role="group" aria-label="속도"><button id="sm" aria-label="느리게">−</button><output id="so">100%</output><button id="sp" aria-label="빠르게">+</button></div>
      <button class="s-icon" id="camB" aria-pressed="false">카메라</button>
      <button class="s-icon" id="lightB" aria-pressed="false">조명</button>
    </div>
  </footer>
</div>
<aside class="s-sheet" id="pSet" hidden aria-label="설정">
  <div class="s-head"><b>설정</b><button class="s-pill" data-close>닫기</button></div>
  <h2>글자</h2>
  <div class="s-row"><label for="fs">크기</label><input type="range" id="fs" min="16" max="120" step="2"><output id="fsO"></output></div>
  <div class="s-row"><label for="lh">줄 간격</label><input type="range" id="lh" min="1.1" max="2.2" step="0.05"><output id="lhO"></output></div>
  <div class="s-row"><label for="w">글 폭</label><input type="range" id="w" min="40" max="96" step="2"><output id="wO"></output></div>
  <div class="s-row"><span>글자 색</span><div class="s-sw" id="fgS"></div></div>
  <div class="s-row"><span>배경 색</span><div class="s-sw" id="bgS"></div></div>
  <div class="s-row"><label for="dim">배경 진하기</label><input type="range" id="dim" min="0" max="1" step="0.05"><output id="dimO"></output></div>
  <div class="s-row"><label for="ta">정렬</label><select id="ta"><option value="left">왼쪽</option><option value="center">가운데</option></select></div>
  <h2>스크롤</h2>
  <div class="s-row"><label for="spd">속도</label><input type="range" id="spd" min="0.5" max="2" step="0.05"><output id="spdO"></output></div>
  <div class="s-row"><label for="mk">읽는 줄 위치</label><input type="range" id="mk" min="10" max="70" step="2"><output id="mkO"></output></div>
  <div class="s-row"><label for="cd">카운트다운</label><select id="cd"><option value="0">없음</option><option value="3">3초</option><option value="5">5초</option><option value="10">10초</option></select></div>
  <div class="s-tog">
    <button class="s-pill" id="voiceB" aria-pressed="false">목소리 따라가기 <em class="s-pro" id="voicePro">프로</em></button>
    <button class="s-pill" id="mirT" aria-pressed="false">글자 좌우 반전</button>
    <button class="s-pill" id="flv" aria-pressed="false">글자 상하 반전</button>
    <button class="s-pill" id="beep" aria-pressed="false">시작 신호음·플래시</button>
  </div>
  <p class="s-tip">목소리 따라가기를 켜면 버튼을 누르지 않아도 읽는 만큼 대사가 따라 올라와요(실험 기능, 크롬·사파리).</p>
  <h2>카메라</h2>
  <div class="s-row"><label for="dev">카메라·렌즈</label><select id="dev"><option value="">기본 (전면)</option></select></div>
  <div class="s-row" id="zoomRow" hidden><label for="zoom">줌 (낮추면 광각)</label><input type="range" id="zoom" step="0.1"><output id="zoomO"></output></div>
  <div class="s-row"><label for="micS">마이크</label><select id="micS"><option value="">기본 마이크</option></select></div>
  <div class="s-row"><label for="q">저장 화질</label><select id="q"><option value="1080">1080p (프로)</option><option value="720">720p</option></select></div>
  <div class="s-tog">
    <button class="s-pill" id="saveMir" aria-pressed="true">좌우 반전해서 저장</button>
    <button class="s-pill" id="viewMir" aria-pressed="true">거울처럼 보기</button>
    <button class="s-pill" id="gridB" aria-pressed="false">3분할 격자</button>
  </div>
  <p class="s-tip">카메라를 켜고 가운데 버튼을 누르면 녹화가 시작되고, 다시 누르면 영상이 저장돼요. 영상은 고른 비율(16:9 또는 9:16)로 잘려 저장되고 대사와 격자는 들어가지 않아요. 찍은 영상은 대본 화면의 "찍은 테이크"에 모여요.</p>
  <h2>조명</h2>
  <div class="s-row"><label for="lv">밝기(테두리)</label><input type="range" id="lv" min="4" max="45" step="1"><output id="lvO"></output></div>
  <div class="s-row"><span>조명 색</span><div class="s-sw" id="ltS"></div></div>
  <div class="s-tog"><button class="s-pill" id="lightAll">전체 화면 조명</button><button class="s-pill" id="fullB">전체 화면</button></div>
  <p class="s-tip">조명은 화면 테두리를 밝게 켜 얼굴을 비춰요. 화면 밝기를 최대로 올리면 더 밝아요. 전체 화면 조명은 화면을 누르면 꺼져요.</p>
  <h2>단축키 (PC·블루투스 리모컨)</h2>
  <p class="s-tip">Space 시작·멈춤 · ↑↓ 속도 · PageUp/PageDown 대사 위치 · 마우스 휠이나 드래그로 대사 위치 이동</p>
  <button class="s-pill" id="defaults">설정 초기화</button>
</aside>
<div id="flood" hidden></div>`;

/**
 * mountStage({ script:{id,title,body,sec}, limits:()=>({recSec,voice,hq}), needPro(kind), onTake({blob,mime,dur,name}), onSec(sec), onExit() })
 * 돌려주는 함수를 부르면 카메라·타이머·이벤트를 모두 정리한다.
 */
export function mountStage({ script: T, limits, needPro, onTake, onSec, onExit, parts: scenes = null, part = 0, onPart }) {
  const root = document.createElement('div'); root.id = 'st2'; root.innerHTML = HTML; document.body.append(root);
  const $ = id => root.querySelector('#' + id);
  let S = loadS();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  if (!T.sec) T.sec = autoSec(T.body);
  let playing = false, elapsed = 0, last = 0, raf = 0, counting = 0, actx = null, stream = null, recd = null, chunks = [], recT0 = 0, recTimer = 0, cv = null, recW = 0, recH = 0, alive = true;
  const scriptEl = $('script'), stage = $('stage'), frame = $('frame'), cam = $('cam');
  const dur = () => Math.max(5, T.sec) / S.speed;
  const fsNow = () => S.mode == 'L' ? S.fsL : S.fsP;
  const L = () => limits();
  if (S.q == 1080 && !L().hq) S.q = 720;
  if (S.voice && !L().voice) S.voice = false;

  // 대사: 낱말마다 span (목소리 따라가기용), [[구간]]은 작은 표시
  const words = []; let normAll = '';
  function renderScript() {
    words.length = 0; normAll = '';
    const parts = String(T.body || ' ').split(/(\[\[.+?\]\]\n?)/);
    scriptEl.innerHTML = parts.map(p => {
      const m = p.match(/^\[\[(.+?)\]\]\n?$/);
      if (m) return `<span class="s-cue">${esc(m[1])}</span>`;
      return p.split(/(\s+)/).map(tok => {
        if (!tok || /^\s+$/.test(tok)) return esc(tok);
        const n = norm(tok); const i = words.length;
        words.push({ n0: normAll.length, n1: normAll.length + n.length }); normAll += n;
        return `<span class="w" data-i="${i}">${esc(tok)}</span>`;
      }).join('');
    }).join('');
    const ttl = $('ttl'), name = T.title || (T.body || '').trim().split('\n')[0] || '대본';
    if (scenes && scenes.length > 1) {
      // 씬 고르기: 제목 자리를 누르면 폰 기본 고르기 창이 뜬다
      ttl.innerHTML = `<span class="s-pn">${esc(scenes[part])}</span><span class="s-pt">${esc(name)}</span><select aria-label="찍을 씬">${scenes.map((n, i) => `<option value="${i}"${i == part ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
      const sel = ttl.querySelector('select');
      sel.onchange = () => { if (recd) { sel.value = part; say('녹화가 끝난 뒤에 씬을 바꿀 수 있어요'); return; } onPart?.(+sel.value); };
    } else ttl.textContent = name;
  }
  const spans = () => scriptEl.querySelectorAll('.w');

  function fit() {
    const r = S.mode == 'L' ? 16 / 9 : 9 / 16, pad = S.light ? Math.min(stage.clientWidth, stage.clientHeight) * S.lv / 100 : 0, pw = stage.clientWidth - pad * 2, ph = stage.clientHeight - pad * 2;
    let w = pw, h = w / r; if (h > ph) { h = ph; w = h * r; }
    frame.style.width = Math.floor(w) + 'px'; frame.style.height = Math.floor(h) + 'px';
    $('turn').hidden = !(S.mode == 'L' && innerHeight > innerWidth && small() && !S.light);
  }
  function apply() {
    $('mL').setAttribute('aria-pressed', S.mode == 'L'); $('mP').setAttribute('aria-pressed', S.mode == 'P');
    frame.style.setProperty('--sbg', S.bg); scriptEl.style.setProperty('--sfg', S.fg); scriptEl.style.setProperty('--fs', fsNow() + 'px');
    scriptEl.style.setProperty('--lh', S.lh); scriptEl.style.setProperty('--w', S.w + '%'); scriptEl.style.setProperty('--ta', S.ta);
    $('mark').style.top = S.mk + '%'; $('flip').style.transform = `scale(${S.mirT ? -1 : 1},${S.flv ? -1 : 1})`;
    $('tint').style.opacity = stream ? S.dim : 1; cam.style.transform = S.viewMir ? 'scaleX(-1)' : 'none'; $('grid').hidden = !S.grid;
    stage.style.background = S.light ? S.lt : '';
    const press = { lightB: S.light, camB: !!stream, mirT: S.mirT, flv: S.flv, beep: S.beep, saveMir: S.saveMir, viewMir: S.viewMir, gridB: S.grid, voiceB: S.voice };
    for (const k in press) $(k).setAttribute('aria-pressed', !!press[k]);
    $('voicePro').hidden = L().voice;
    $('go').classList.toggle('s-nocam', !stream);
    const val = { fs: fsNow(), lh: S.lh, w: S.w, dim: S.dim, spd: S.speed, mk: S.mk, lv: S.lv, cd: S.cd, ta: S.ta, q: S.q }; for (const k in val) $(k).value = val[k];
    $('fsO').textContent = fsNow(); $('lhO').textContent = (+S.lh).toFixed(2); $('wO').textContent = S.w + '%'; $('dimO').textContent = Math.round(S.dim * 100) + '%';
    $('spdO').textContent = Math.round(S.speed * 100) + '%'; $('mkO').textContent = S.mk + '%'; $('lvO').textContent = S.lv;
    for (const [id, k] of [['fgS', 'fg'], ['bgS', 'bg'], ['ltS', 'lt']]) [...$(id).children].forEach(b => { if (b.tagName == 'BUTTON') b.setAttribute('aria-pressed', b.dataset.c == S[k]); else b.value = S[k]; });
    fit(); draw();
  }
  let lastRead = -2;
  function draw() {
    const top = frame.clientHeight * S.mk / 100, h = scriptEl.scrollHeight, p = Math.min(elapsed / dur(), 1.1);
    scriptEl.style.transform = `translateY(${top - p * h}px)`; $('bar').style.width = Math.min(p, 1) * 100 + '%';
    const c = $('clock'); c.innerHTML = `<b>${fmt(elapsed)}</b> / ${fmt(T.sec)}`; c.classList.toggle('s-over', elapsed > T.sec + 2);
    $('so').textContent = Math.round(S.speed * 100) + '%';
    const on = playing || !!counting; $('go').classList.toggle('s-on', on); $('go').setAttribute('aria-label', on ? '멈춤' : '시작');
    if (root.classList.contains('playing') != on) { root.classList.toggle('playing', on); fit(); draw(); }
    // 노란 선을 지난 낱말은 흐리게
    const y = p * h - fsNow() * 0.6; const sp = spans(); let k = -1;
    for (let i = 0; i < sp.length; i++) { if (sp[i].offsetTop < y) k = i; else break; }
    if (k !== lastRead) { lastRead = k; sp.forEach((s, i) => s.classList.toggle('read', i <= k)); }
  }
  function tick(now) {
    if (!playing) return; elapsed += (now - last) / 1000; last = now; draw();
    if (elapsed > dur() * 1.1 + (recd ? 2 : 0)) { stop(); draw(); return; }
    raf = requestAnimationFrame(tick);
  }
  function stop() { recStop(); playing = false; cancelAnimationFrame(raf); clearTimeout(counting); counting = 0; $('count').hidden = true; }
  function signal() {
    $('slate').hidden = false; setTimeout(() => $('slate').hidden = true, 90);
    try { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 1000; g.gain.value = .25; o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + .12); } catch {}
  }
  function start() {
    closeSheets(); if (elapsed >= dur()) elapsed = 0; let n = elapsed > 0 ? 0 : +S.cd;
    if (S.beep) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {} }
    const step = () => {
      if (!alive) return;
      if (n > 0) { $('count').hidden = false; $('count').textContent = n; n--; counting = setTimeout(step, 1000); draw(); }
      else {
        counting = 0; $('count').hidden = true; if (S.beep && elapsed == 0) signal(); recStart();
        if (!S.voice) { playing = true; last = performance.now(); raf = requestAnimationFrame(tick); }
        draw();
      }
    };
    step();
  }
  function toggle() { if (playing || counting || recd) { stop(); draw(); } else start(); }
  function say(t) { const m = $('msg'); m.textContent = t; m.hidden = !t; if (t) setTimeout(() => { if (m.textContent == t) m.hidden = true; }, 9000); }

  /* 카메라 */
  // 카메라를 못 열었을 때: 왜인지, 어떻게 푸는지, 다시 하기 단추. 대사는 그대로 흘려 볼 수 있다.
  function camErr(name) {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const how = name == 'NotAllowedError'
      ? (ios ? '설정 앱 › 사파리 › 카메라·마이크를 "허용"으로 바꾸거나, 주소창의 「가가」 › 웹 사이트 설정에서 허용해 주세요.' : '주소창 왼쪽 자물쇠(또는 카메라) 아이콘을 눌러 카메라와 마이크를 허용해 주세요.')
      : name == 'NotReadableError' ? '다른 앱(줌·카메라 앱 등)이 카메라를 쓰고 있어요. 그 앱을 닫아 주세요.'
      : name == 'NotFoundError' ? '이 기기에서 카메라를 찾지 못했어요.' : '카메라를 열지 못했어요.';
    const m = $('msg'); m.hidden = false; m.classList.add('err');
    m.innerHTML = `<b>${name == 'NotAllowedError' ? '카메라 권한이 막혀 있어요' : '카메라를 열 수 없어요'}</b><span>${how}</span><span class="dim">대사는 카메라 없이도 흘려 볼 수 있어요.</span><button type="button" id="camRetry">다시 해 보기</button>`;
    m.onpointerdown = m.onpointerup = e => e.stopPropagation();
    $('camRetry').onclick = e => { e.stopPropagation(); m.classList.remove('err'); m.hidden = true; camOn(); };
  }
  async function camOn() {
    camOff(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('이 화면에서는 카메라를 쓸 수 없어요. 크롬이나 사파리에서 주소를 직접 열어 주세요.'); apply(); return; }
    const tall = innerHeight > innerWidth && small();
    const video = Object.assign({ width: { ideal: tall ? 1080 : 1920 }, height: { ideal: tall ? 1920 : 1080 }, frameRate: { ideal: 30 } }, S.dev ? { deviceId: { exact: S.dev } } : { facingMode: 'user' });
    let st;
    try { st = await navigator.mediaDevices.getUserMedia({ video, audio: S.mic ? { deviceId: { exact: S.mic } } : true }); }
    catch (e) {
      if (S.dev || S.mic) { S.dev = ''; S.mic = ''; save(); return camOn(); }
      stream = null; camErr(e.name); apply(); return;
    }
    if (!alive) { st.getTracks().forEach(t => t.stop()); return; }
    stream = st; cam.srcObject = stream; cam.hidden = false; $('msg').classList.remove('err'); say('');
    try {
      const ds = await navigator.mediaDevices.enumerateDevices();
      for (const [id, kind, k, first] of [['dev', 'videoinput', 'dev', '기본 (전면)'], ['micS', 'audioinput', 'mic', '기본 마이크']]) {
        const sel = $(id); sel.length = 0; sel.add(new Option(first, ''));
        ds.filter(d => d.kind == kind && d.deviceId && d.deviceId != 'default').forEach((d, i) => sel.add(new Option(d.label || (kind == 'videoinput' ? '카메라 ' : '마이크 ') + (i + 1), d.deviceId))); sel.value = S[k];
      }
    } catch {}
    const tr = stream.getVideoTracks()[0], caps = tr.getCapabilities ? tr.getCapabilities() : {};
    if (caps.zoom && caps.zoom.max > caps.zoom.min) { const z = $('zoom'); z.min = caps.zoom.min; z.max = Math.min(caps.zoom.max, 10); z.step = caps.zoom.step || 0.1; z.value = (tr.getSettings().zoom) || 1; $('zoomO').textContent = (+z.value).toFixed(1) + 'x'; $('zoomRow').hidden = false; }
    else $('zoomRow').hidden = true;
    apply();
  }
  function camOff(keep) { recStop(); if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } cam.hidden = true; cam.srcObject = null; if (!keep) apply(); }
  function paint() {
    if (!recd || !cv) return; const g = cv.getContext('2d'), vw = cam.videoWidth, vh = cam.videoHeight;
    if (vw && vh) { const s = Math.max(recW / vw, recH / vh), dw = vw * s, dh = vh * s; g.setTransform(S.saveMir ? -1 : 1, 0, 0, 1, S.saveMir ? recW : 0, 0); g.drawImage(cam, (recW - dw) / 2, (recH - dh) / 2, dw, dh); }
    if (cam.requestVideoFrameCallback) cam.requestVideoFrameCallback(paint); else requestAnimationFrame(paint);
  }
  function recStart() {
    if (!stream || recd || !window.MediaRecorder) return;
    const mt = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const q = (+S.q >= 1080 && L().hq) ? 1080 : 720, long = Math.round(q * 16 / 9);
    recW = S.mode == 'L' ? long : q; recH = S.mode == 'L' ? q : long; let src = stream;
    try { cv = cv || document.createElement('canvas'); cv.width = recW; cv.height = recH; const cs = cv.captureStream(30); stream.getAudioTracks().forEach(t => cs.addTrack(t)); src = cs; } catch { cv = null; src = stream; }
    chunks = [];
    try { recd = new MediaRecorder(src, { mimeType: mt || undefined, videoBitsPerSecond: q >= 1080 ? 8e6 : 4e6, audioBitsPerSecond: 160e3 }); } catch (e) { say('녹화를 시작하지 못했어요 (' + e.name + ')'); return; }
    const r = recd;
    r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      const d = (performance.now() - recT0) / 1000;
      const blob = new Blob(chunks, { type: mt || 'video/webm' }); chunks = [];
      if (blob.size && alive) onTake({ blob, mime: blob.type, dur: d });
    };
    // 저장 공간이 모자라면 미리 알림(1분 ≈ 720p 30MB · 1080p 60MB)
    try { navigator.storage?.estimate?.().then(e => { const free = (e.quota || 0) - (e.usage || 0); if (e.quota && free < 400e6) say(`저장 공간이 ${Math.max(0, Math.round(free / 1e6))}MB 남았어요. 지난 테이크를 사진첩에 저장하고 지우면 더 길게 찍을 수 있어요.`); }); } catch {}
    r.start(1000); recT0 = performance.now(); $('rec').hidden = false; if (cv) paint();
    recTimer = setInterval(() => {
      const t = (performance.now() - recT0) / 1000, cap = L().recSec;
      $('rec').textContent = cap < Infinity ? `${fmt(t)} / ${fmt(cap)}` : fmt(t);
      if (t >= cap) { stop(); draw(); setTimeout(() => needPro('rec'), 700); }
    }, 250);
  }
  function recStop() {
    if (!recd) return; clearInterval(recTimer); $('rec').hidden = true; $('rec').textContent = '0:00';
    const r = recd; recd = null; try { r.stop(); } catch {}
  }

  /* 목소리 따라가기 (프로) */
  let recog = null, vpos = 0, vTarget = null, vraf = 0;
  function voiceOn() {
    voiceOff();
    if (!S.voice) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { say('이 브라우저는 목소리 따라가기를 못 해요. 크롬이나 사파리에서 열어 주세요.'); S.voice = false; save(); apply(); return; }
    const r = new SR(); recog = r; r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    r.onresult = e => { let t = ''; for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript; follow(norm(t)); };
    r.onerror = e => { if (e.error == 'not-allowed') { say('마이크 권한이 없어 목소리 따라가기를 껐어요.'); S.voice = false; save(); voiceOff(); apply(); } };
    r.onend = () => { if (recog === r && alive && S.voice) setTimeout(() => { try { r.start(); } catch {} }, 150); };
    try { r.start(); $('mic').hidden = false; } catch {}
    const loop = () => { vraf = requestAnimationFrame(loop); if (vTarget == null || playing) return; const d = vTarget - elapsed; if (Math.abs(d) > .01) { elapsed += d * .12; draw(); } };
    vraf = requestAnimationFrame(loop);
  }
  function voiceOff() { const r = recog; recog = null; try { r?.abort(); } catch {} cancelAnimationFrame(vraf); $('mic').hidden = true; vTarget = null; }
  function follow(heard) {
    if (heard.length < 2) return;
    for (const n of [8, 6, 4, 3]) {
      if (heard.length < n) continue;
      const tail = heard.slice(-n), from = Math.max(0, vpos - 12), at = normAll.slice(from, vpos + 260).indexOf(tail);
      if (at >= 0) { vpos = from + at + n; break; }
    }
    let k = words.findIndex(w => w.n1 >= vpos); if (k < 0) k = words.length - 1;
    const sp = spans()[k]; if (!sp) return;
    vTarget = Math.min(dur(), (sp.offsetTop + sp.offsetHeight / 2) / scriptEl.scrollHeight * dur());
  }

  /* 조작 */
  function setSpeed(v) { const p = elapsed / dur(); S.speed = Math.min(2, Math.max(.5, Math.round(v * 20) / 20)); elapsed = p * dur(); save(); apply(); }
  function swatches(id, k, list) {
    const box = $(id); list.forEach(c => { const b = document.createElement('button'); b.dataset.c = c; b.style.background = c; b.setAttribute('aria-label', c); b.onclick = () => { S[k] = c; save(); apply(); }; box.appendChild(b); });
    const i = document.createElement('input'); i.type = 'color'; i.setAttribute('aria-label', '직접 고르기'); i.oninput = () => { S[k] = i.value; save(); apply(); }; box.appendChild(i);
  }
  swatches('fgS', 'fg', ['#ffffff', '#fff36b', '#b4f53e', '#7fe3ff', '#ffb3c7', '#111317']);
  swatches('bgS', 'bg', ['#000000', '#14161b', '#0d2a1a', '#1a1440', '#ffffff']);
  swatches('ltS', 'lt', ['#ffffff', '#ffe9c9', '#ffd29a', '#dff0ff', '#ffd6e6']);
  const bind = (id, k, num = true) => $(id).oninput = e => { S[k] = num ? +e.target.value : e.target.value; save(); apply(); };
  $('fs').oninput = e => { S[S.mode == 'L' ? 'fsL' : 'fsP'] = +e.target.value; save(); apply(); };
  bind('lh', 'lh'); bind('w', 'w'); bind('mk', 'mk'); bind('lv', 'lv'); bind('cd', 'cd'); bind('dim', 'dim'); bind('ta', 'ta', false);
  $('q').onchange = e => { if (+e.target.value >= 1080 && !L().hq) { e.target.value = 720; needPro('hq'); return; } S.q = +e.target.value; save(); apply(); };
  $('spd').oninput = e => setSpeed(+e.target.value);
  const flipBtn = (id, k) => $(id).onclick = () => { S[k] = !S[k]; save(); apply(); };
  flipBtn('mirT', 'mirT'); flipBtn('flv', 'flv'); flipBtn('beep', 'beep'); flipBtn('lightB', 'light'); flipBtn('saveMir', 'saveMir'); flipBtn('viewMir', 'viewMir'); flipBtn('gridB', 'grid');
  $('voiceB').onclick = () => { if (!S.voice && !L().voice) { closeSheets(); needPro('voice'); return; } S.voice = !S.voice; save(); apply(); if (S.voice) { stop(); vpos = 0; voiceOn(); } else voiceOff(); };
  $('mL').onclick = () => { S.mode = 'L'; save(); apply(); }; $('mP').onclick = () => { S.mode = 'P'; save(); apply(); };
  $('go').onclick = () => { if (!stream && !playing && !counting) { /* 카메라 없이도 대사만 흐르게 */ } toggle(); };
  $('resetB').onclick = () => { stop(); elapsed = 0; vpos = 0; if (S.voice) vTarget = 0; draw(); };
  $('sm').onclick = () => setSpeed(S.speed - .05); $('sp').onclick = () => setSpeed(S.speed + .05);
  $('camB').onclick = () => { if (stream) { camOff(); S.cam = false; } else { camOn(); S.cam = true; } save(); };
  $('dev').onchange = e => { S.dev = e.target.value; save(); camOn(); }; $('micS').onchange = e => { S.mic = e.target.value; save(); camOn(); };
  $('zoom').oninput = e => { const v = +e.target.value; $('zoomO').textContent = v.toFixed(1) + 'x'; const tr = stream && stream.getVideoTracks()[0]; if (tr) tr.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {}); };
  function closeSheets() { $('pSet').hidden = true; }
  $('setBtn').onclick = () => { $('pSet').hidden = !$('pSet').hidden; };
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheets);
  $('fullB').onclick = () => { const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); p && p.catch && p.catch(() => {}); };
  $('lightAll').onclick = () => { $('flood').style.background = S.lt; $('flood').hidden = false; closeSheets(); };
  $('flood').onclick = () => $('flood').hidden = true;
  $('defaults').onclick = () => { S = { ...DEF, fsL: small() ? 26 : 44, fsP: small() ? 24 : 32 }; save(); apply(); };
  $('backB').onclick = () => { if (recd) { say('녹화를 먼저 멈춰 주세요.'); return; } onExit(); };

  /* 화면 손짓: 누르면 멈춤, 끌거나 휠로 위치 이동 */
  let drag = null;
  frame.addEventListener('pointerdown', e => { drag = { y: e.clientY, el: elapsed, moved: false }; frame.setPointerCapture(e.pointerId); });
  frame.addEventListener('pointermove', e => {
    if (!drag || playing || counting) return; const dy = e.clientY - drag.y; if (Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) { elapsed = Math.min(dur(), Math.max(0, drag.el - dy / scriptEl.scrollHeight * dur())); syncVoice(); draw(); }
  });
  frame.addEventListener('pointerup', () => { if (drag && !drag.moved) { if (playing || counting) { stop(); draw(); } else if (!stream) start(); } drag = null; });
  frame.addEventListener('wheel', e => { e.preventDefault(); if (playing) return; elapsed = Math.min(dur(), Math.max(0, elapsed + e.deltaY / scriptEl.scrollHeight * dur())); syncVoice(); draw(); }, { passive: false });
  function syncVoice() { if (!S.voice) return; vTarget = elapsed; const y = elapsed / dur() * scriptEl.scrollHeight; const sp = [...spans()]; const k = sp.findIndex(s => s.offsetTop >= y); vpos = words[Math.max(0, k)]?.n0 || 0; }
  const onKey = e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector('.sheet.in')) return;
    const step = dur() * fsNow() * S.lh / Math.max(1, scriptEl.scrollHeight);
    if (e.code == 'Space' || e.key == 'Enter') { e.preventDefault(); toggle(); }
    else if (e.key == 'ArrowUp') { e.preventDefault(); setSpeed(S.speed + .05); } else if (e.key == 'ArrowDown') { e.preventDefault(); setSpeed(S.speed - .05); }
    else if (e.key == 'PageDown' || e.key == 'ArrowRight') { e.preventDefault(); elapsed = Math.min(dur(), elapsed + step * 2); syncVoice(); draw(); }
    else if (e.key == 'PageUp' || e.key == 'ArrowLeft') { e.preventDefault(); elapsed = Math.max(0, elapsed - step * 2); syncVoice(); draw(); }
    else if (e.key == 'Escape') { closeSheets(); $('flood').hidden = true; }
  };
  addEventListener('keydown', onKey);
  let ori = innerHeight > innerWidth;
  const onResize = () => { fit(); draw(); const o = innerHeight > innerWidth; if (o != ori) { ori = o; if (stream && !recd) camOn(); } };
  addEventListener('resize', onResize);
  let wl = null; const wake = () => { try { navigator.wakeLock && navigator.wakeLock.request('screen').then(w => wl = w).catch(() => {}); } catch {} };
  // 전화가 오거나 다른 앱으로 나가면 녹화를 끊고 거기까지 테이크로 남김(멈춘 화면이 녹화되지 않게)
  const onVis = () => { if (!document.hidden) return wake(); if (recd || playing || counting) { const was = !!recd; stop(); draw(); if (was) setTimeout(() => say('다른 앱으로 나가서 녹화를 멈췄어요. 거기까지 테이크로 남겼어요.'), 300); } };
  wake(); document.addEventListener('visibilitychange', onVis);
  document.fonts && document.fonts.ready.then(() => { if (alive) { fit(); draw(); } });

  renderScript(); apply();
  if (S.cam !== false) camOn();
  if (S.voice) voiceOn();

  return {
    setSec(sec) { T.sec = sec; draw(); },
    // 씬 바꾸기: 카메라는 그대로 두고 대사만 갈아 끼운다
    setScript(t, i) { stop(); Object.assign(T, t); if (!T.sec) T.sec = autoSec(T.body); part = i; renderScript(); elapsed = 0; vpos = 0; if (S.voice) vTarget = 0; fit(); apply(); draw(); },
    destroy() {
      alive = false; stop(); voiceOff(); camOff(true);
      try { wl?.release(); } catch {}
      removeEventListener('keydown', onKey); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis);
      root.remove();
    },
  };
}
