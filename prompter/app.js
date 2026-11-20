// 하진 프롬프터: 카메라 위에 대본을 띄우고 바로 찍는 앱. sw.js의 VERSION과 같이 올릴 것
import { scripts, takes, uid, getSet, saveSet, flag } from './store.js';
import { ic, esc, $, el, chars, fmt, estimate, paras, toast, buzz, sheet } from './ui.js';
import * as plan from './plan.js';

export const VERSION = '1.0.0';

let SET = getSet();
const setSet = patch => { SET = { ...SET, ...patch }; saveSet(SET); };

/* ---------- 라우터 ---------- */
const view = $('#view');
let cleanup = null;
async function route() {
  try { await cleanup?.(); } catch {}
  cleanup = null;
  const [, a, b] = (location.hash || '#/').split('/');
  view.classList.remove('in');
  view.innerHTML = '';
  if (a === 'new') {
    if ((await scripts.all()).length >= plan.limits().scripts) { location.replace('#/'); plan.needPro('scripts'); return; }
    const s = await newScript(); location.replace('#/s/' + s.id); return;
  }
  if (a === 'plan') { await plan.planView(view); requestAnimationFrame(() => view.classList.add('in')); return; }
  if (a === 'admin') { await plan.adminView(view); requestAnimationFrame(() => view.classList.add('in')); return; }
  if (a === 's' && b) cleanup = await editView(b);
  else if (a === 'shoot' && b) cleanup = await shootView(b);
  else cleanup = await listView();
  requestAnimationFrame(() => view.classList.add('in'));
}
window.addEventListener('hashchange', route);

async function newScript(body = '', title = '') {
  const s = { id: uid(), title, body, createdAt: Date.now(), updatedAt: Date.now() };
  await scripts.put(s); return s;
}

/* ---------- 목록 ---------- */
async function listView() {
  const list = await scripts.all();
  const counts = await takes.countBy();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  view.innerHTML = `
    <div class="top"><div><h1>프롬프터</h1><p class="sub">대본을 띄우고 바로 찍어요</p></div>
      <div class="row"><a class="planbtn${plan.isPro() ? ' on' : ''}" href="#/plan" aria-label="구독 관리">${ic('star', 16)}${plan.isPro() ? '프로' : '무료'}</a><a class="iconbtn" href="#/new" aria-label="새 대본">${ic('plus', 22)}</a></div></div>
    <div class="stats">
      <div class="stat"><div class="n">${ic('doc', 18)}${list.length}</div><div class="l">대본</div></div>
      <div class="stat"><div class="n">${ic('film', 18)}${total}</div><div class="l">찍은 테이크</div></div>
      <div class="stat"><div class="n">${ic('gauge', 18)}${SET.cpm}</div><div class="l">분당 글자</div></div>
    </div>
    <div id="cards"></div>
    <a class="btn wide" href="#/new" style="margin-top:6px">${ic('plus')}새 대본 쓰기</a>
    ${plan.isPro() ? '' : `<p class="tip c">무료는 대본 ${plan.limits().scripts}개까지 · 지금 ${list.length}개</p>`}`;
  const box = $('#cards');
  if (!list.length) box.innerHTML = `<div class="empty">${ic('doc', 34)}<p>아직 대본이 없어요.<br>새 대본을 쓰거나 복사한 글을 붙여 넣어요.</p></div>`;
  list.forEach((s, i) => {
    const first = (s.body || '').trim().split('\n')[0] || '내용 없음';
    const c = el(`<div class="card" style="animation-delay:${i * 40}ms">
      <div class="grow"><h3>${esc(s.title || first.slice(0, 24) || '제목 없음')}</h3><p class="pv">${esc(first)}</p>
        <div class="meta"><span>${ic('text', 14)}${chars(s.body)}자</span><span>${ic('clock', 14)}${fmt(estimate(s.body, SET.cpm))}</span><span>${ic('film', 14)}${counts[s.id] || 0}</span></div></div>
      <button class="shoot" aria-label="이 대본으로 찍기">${ic('cam', 24)}</button></div>`);
    c.onclick = e => { location.hash = (e.target.closest('.shoot') ? '#/shoot/' : '#/s/') + s.id; };
    box.append(c);
  });
}

/* ---------- 편집 ---------- */
async function editView(id) {
  const s = await scripts.get(id);
  if (!s) { location.replace('#/'); return; }
  view.innerHTML = `
    <div class="top"><a class="iconbtn" href="#/" aria-label="목록">${ic('left', 22)}</a>
      <div class="row"><button class="iconbtn" id="del" aria-label="대본 지우기">${ic('trash')}</button></div></div>
    <input class="titlein" id="ti" placeholder="제목 (비우면 첫 줄)" value="${esc(s.title)}" maxlength="60">
    <div class="emeta"><div class="meta" id="em"></div><button class="ghost sm" id="paste">${ic('paste', 16)}붙여넣기</button></div>
    <textarea class="editor" id="ed" placeholder="여기에 대본을 쓰거나 붙여 넣어요.&#10;&#10;빈 줄로 문단을 나누면 찍을 때 쉬어 가기 좋아요." spellcheck="false">${esc(s.body)}</textarea>
    <p class="tip">빈 줄로 문단을 나누면 화면에서도 문단이 띄어져요. 시간은 분당 ${SET.cpm}자로 어림한 거예요.</p>
    <div id="tk"></div>
    <div class="bar"><a class="btn acc wide" href="#/shoot/${s.id}">${ic('cam')}이 대본으로 찍기</a></div>`;
  const ed = $('#ed'), ti = $('#ti'), em = $('#em');
  const meta = () => { em.innerHTML = `<span>${ic('text', 14)}${chars(ed.value)}자</span><span>${ic('clock', 14)}약 ${fmt(estimate(ed.value, SET.cpm))}</span><span>${ic('para', 14)}문단 ${paras(ed.value)}</span>`; };
  const grow = () => { ed.style.height = 'auto'; ed.style.height = Math.max(ed.scrollHeight, window.innerHeight * .46) + 'px'; };
  let t; let dirty = false;
  const save = async () => { clearTimeout(t); if (!dirty) return; dirty = false; s.title = ti.value.trim(); s.body = ed.value; s.updatedAt = Date.now(); await scripts.put(s); };
  const later = () => { dirty = true; clearTimeout(t); t = setTimeout(save, 400); };
  ed.oninput = () => { meta(); grow(); later(); };
  ti.oninput = later;
  meta(); requestAnimationFrame(grow);
  if (!s.body) setTimeout(() => ed.focus(), 300);
  $('#paste').onclick = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt.trim()) return toast('복사한 글이 없어요');
      const at = ed.selectionStart ?? ed.value.length;
      ed.value = ed.value.slice(0, at) + txt + ed.value.slice(ed.selectionEnd ?? at);
      ed.oninput(); toast(`${chars(txt)}자를 붙였어요`);
    } catch { ed.focus(); toast('글 칸을 길게 눌러 붙여 넣어 주세요'); }
  };
  $('#del').onclick = () => {
    const box = el(`<div><h2>이 대본을 지울까요?</h2><p style="color:var(--sub);margin:0 0 14px">찍은 테이크도 같이 지워져요. 되돌릴 수 없어요.</p>
      <div class="row"><button class="ghost grow" data-x>그만두기</button><button class="btn grow" style="background:var(--rec);color:#fff" data-d>지우기</button></div></div>`);
    const sh = sheet(box);
    $('[data-x]', box).onclick = sh.close;
    $('[data-d]', box).onclick = async () => { dirty = false; await scripts.remove(s.id); sh.close(); location.replace('#/'); toast('지웠어요'); };
  };
  await renderTakes(s, $('#tk'));
  return save;
}

async function renderTakes(s, box) {
  const list = await takes.of(s.id);
  const urls = [];
  box.innerHTML = list.length ? `<div class="sec">${ic('film', 16)}찍은 테이크 ${list.length}</div><div class="takes"></div>` : '';
  const grid = $('.takes', box);
  list.forEach((t, i) => {
    const u = URL.createObjectURL(t.blob); urls.push(u);
    const c = el(`<div class="take" style="animation-delay:${i * 40}ms"><video src="${u}#t=0.1" playsinline muted preload="metadata"></video>
      <div class="tb"><span>#${list.length - i} · ${fmt(t.dur)}</span><span class="row"><button class="mini" data-s aria-label="저장">${ic('share', 18)}</button><button class="mini" data-d aria-label="지우기">${ic('trash', 18)}</button></span></div></div>`);
    $('video', c).onclick = () => takeSheet(s, t, list.length - i, () => renderTakes(s, box));
    $('[data-s]', c).onclick = () => saveTake(s, t, list.length - i);
    $('[data-d]', c).onclick = async () => { await takes.remove(t.id); toast('테이크를 지웠어요'); renderTakes(s, box); };
    grid.append(c);
  });
  setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 60000);
}

function fileName(s, n, mime) {
  const ext = /mp4/.test(mime) ? 'mp4' : 'webm';
  const base = (s.title || (s.body || '').trim().split('\n')[0] || '대본').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24);
  return `${base}_테이크${n}.${ext}`;
}
async function saveTake(s, t, n) {
  const name = fileName(s, n, t.mime);
  const file = new File([t.blob], name, { type: t.mime.split(';')[0] });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast('내려받기를 시작했어요');
}

function takeSheet(s, t, n, onChange, { fresh } = {}) {
  const u = URL.createObjectURL(t.blob);
  const box = el(`<div><h2>${fresh ? '찍었어요' : '테이크 ' + n}</h2>
    <video class="tview" src="${u}" playsinline controls ${fresh ? 'autoplay' : ''}></video>
    <div class="tinfo"><span>${ic('clock', 14)}${fmt(t.dur)}</span><span>${ic('film', 14)}테이크 ${n}</span><span>${(t.blob.size / 1048576).toFixed(1)}MB</span></div>
    <div class="row"><button class="ghost grow" data-d>${ic('trash', 18)}지우기</button><button class="btn acc grow" data-s>${ic('share', 18)}사진첩에 저장</button></div>
    ${fresh ? `<button class="ghost wide" data-r style="margin-top:8px">${ic('cam', 18)}다시 찍기</button>` : ''}</div>`);
  const sh = sheet(box, { onClose: () => setTimeout(() => URL.revokeObjectURL(u), 500) });
  $('[data-s]', box).onclick = () => saveTake(s, t, n);
  $('[data-d]', box).onclick = async () => { await takes.remove(t.id); sh.close(); toast('테이크를 지웠어요'); onChange?.(); };
  const r = $('[data-r]', box); if (r) r.onclick = sh.close;
  return sh;
}

/* ---------- 촬영 ---------- */
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

async function shootView(id) {
  const s = await scripts.get(id);
  if (!s) { location.replace('#/'); return; }
  const body = (s.body || '').trim() || '대본이 비어 있어요. 뒤로 가서 대본을 써 주세요.';

  // 낱말마다 span: 읽은 곳 표시와 목소리 따라가기에 씀
  const words = []; let normAll = '';
  const html = body.split(/\n\s*\n/).map(p => '<p>' + p.split(/(\s+)/).map(tok => {
    if (!tok) return '';
    if (/^\s+$/.test(tok)) return tok.includes('\n') ? '<br>' : ' ';
    const n = norm(tok); const i = words.length;
    words.push({ n0: normAll.length, n1: normAll.length + n.length }); normAll += n;
    return `<span class="w" data-i="${i}">${esc(tok)}</span>`;
  }).join('') + '</p>').join('');
  const total = Math.max(1, chars(body));

  const st = el(`<div class="stage${SET.cam ? '' : ' textonly'}">
    <video class="cam" playsinline muted autoplay></video>
    <div class="band"><div class="scroller"><div class="script"></div></div><div class="guide"></div>
      <div class="paused">${ic('pause', 13)}<span>멈춤</span></div></div>
    <div class="hint" id="hint">글자를 누르면 흐르고 멈춰요 · 끌어서 위치를 옮겨요</div>
    <div class="hud">
      <div class="pill" id="pill"><span class="dot"></span><span id="tm">0:00</span><span class="sep">|</span><span id="left">남은 0:00</span><span class="mic">${ic('mic', 14)}</span></div>
      <div class="ctrls">
        <div class="side l"><button class="cbtn" id="close" aria-label="나가기">${ic('x', 22)}</button></div>
        <div class="speed"><button id="slow" aria-label="느리게">${ic('minus', 18)}</button><div class="v"><b id="cpm">${SET.cpm}</b><small>자/분</small></div><button id="fast" aria-label="빠르게">${ic('plus', 18)}</button></div>
        <button class="rec" id="rec" aria-label="녹화"><i></i></button>
        <div class="speed" style="justify-content:center;gap:4px;background:none;backdrop-filter:none;-webkit-backdrop-filter:none"><button class="cbtn" id="flip" aria-label="카메라 바꾸기">${ic('flip', 20)}</button></div>
        <div class="side"><button class="cbtn" id="opt" aria-label="설정">${ic('gear', 20)}</button></div>
      </div></div>
    <div class="flash"></div></div>`);
  document.body.append(st);
  const scroller = $('.scroller', st), script = $('.script', st), video = $('video.cam', st), pill = $('#pill', st);
  const recBtn = $('#rec', st), pausedEl = $('.paused', st), hint = $('#hint', st);
  script.innerHTML = html;
  const spans = [...script.querySelectorAll('.w')];

  let stream = null, rec = null, chunks = [], recStart = 0, recording = false;
  let playing = false, touching = false, pos = 0, last = 0, raf = 0, wake = null, alive = true;
  let camFail = false; const camOn = () => SET.cam && !camFail;
  let tops = [], guidePx = 0, lineIdx = -1, voiceTarget = null, recog = null, counting = false;

  /* 모양 */
  function layout() {
    st.style.setProperty('--bandh', camOn() ? SET.band + '%' : '100%');
    st.style.setProperty('--tfs', SET.fs + 'px');
    script.classList.toggle('flip', SET.mirrorText);
    script.classList.toggle('center', SET.center);
    st.classList.toggle('textonly', !camOn());
    recBtn.classList.toggle('play', !camOn());
    recBtn.setAttribute('aria-label', camOn() ? '녹화' : '재생');
    $('#flip', st).style.visibility = camOn() ? '' : 'hidden';
    requestAnimationFrame(measure);
  }
  function measure() {
    const h = scroller.clientHeight;
    guidePx = Math.round(h * (camOn() ? 0.3 : 0.38));
    st.style.setProperty('--guide', `calc(env(safe-area-inset-top) + ${guidePx}px)`);
    script.style.paddingTop = guidePx + 'px';
    script.style.paddingBottom = Math.round(h * 0.75) + 'px';
    tops = spans.map(sp => sp.offsetTop + sp.offsetHeight / 2);
    lineIdx = -1; mark();
  }
  const pxPerChar = () => Math.max(1, (script.scrollHeight - parseFloat(script.style.paddingTop || 0) - parseFloat(script.style.paddingBottom || 0)) / total);
  // 안내선에 걸린 줄은 노랗게, 지난 줄은 흐리게
  function mark() {
    const y = scroller.scrollTop + guidePx;
    let lo = 0, hi = tops.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (tops[m] <= y + SET.fs * 0.75) { k = m; lo = m + 1; } else hi = m - 1; }
    if (k === lineIdx) return; lineIdx = k;
    const lineTop = k >= 0 ? spans[k].offsetTop : -1;
    spans.forEach((sp, i) => {
      const now = i <= k && sp.offsetTop === lineTop;
      sp.classList.toggle('now', now);
      sp.classList.toggle('read', i <= k && !now);
    });
    const doneChars = k >= 0 ? words[k].n1 : 0;
    $('#left', st).textContent = '남은 ' + fmt((total - doneChars) / (SET.cpm / 60));
  }

  /* 흐르기 */
  function tick(t) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    if (!touching) {
      if (voiceTarget != null) {
        const d = voiceTarget - scroller.scrollTop;
        if (Math.abs(d) > 0.5) { pos = scroller.scrollTop + d * Math.min(1, dt * 4); scroller.scrollTop = pos; }
      } else if (playing && !counting) {
        pos += (SET.cpm / 60) * pxPerChar() * dt;
        scroller.scrollTop = pos;
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) { setPlaying(false); if (recording) toast('대본 끝까지 왔어요'); }
      } else pos = scroller.scrollTop;
    } else pos = scroller.scrollTop;
    mark();
    if (recording) {
      const el = (Date.now() - recStart) / 1000, cap = plan.limits().recSec;
      $('#tm', st).textContent = cap < Infinity ? `${fmt(el)} / ${fmt(cap)}` : fmt(el);
      if (el >= cap) { stopRec(); setTimeout(() => plan.needPro('rec'), 900); }
    }
  }
  function setPlaying(v) {
    playing = v; last = 0;
    pausedEl.classList.toggle('hide', v || SET.voice);
    if (!camOn()) recBtn.classList.toggle('on', v);
    if (v) { hint.style.opacity = 0; flag('hinted', '1'); }
  }

  /* 카메라 */
  async function startCam() {
    stopCam();
    camFail = false;
    if (!SET.cam) { video.srcObject = null; return; }
    const v = { facingMode: SET.facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    try {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { if (e?.name === 'NotAllowedError') throw e; stream = await navigator.mediaDevices.getUserMedia({ video: v }); toast('마이크 없이 영상만 찍혀요'); }
      if (!alive) return stopCam();
      video.srcObject = stream;
      video.classList.toggle('mirror', SET.facing === 'user');
    } catch (e) {
      toast(e?.name === 'NotAllowedError' ? '카메라 권한을 허락해 주세요. 지금은 글자만 띄울게요' : '카메라를 열 수 없어요. 글자만 띄울게요');
      camFail = true; layout();
    }
  }
  function stopCam() { stream?.getTracks().forEach(t => t.stop()); stream = null; }

  /* 녹화 */
  async function countdown() {
    const n = SET.countdown; if (!n) return true;
    counting = true;
    const box = el('<div class="count"></div>'); st.append(box);
    for (let i = n; i > 0; i--) {
      if (!alive || !counting) { box.remove(); return false; }
      box.innerHTML = `<span>${i}</span>`; buzz(15);
      await new Promise(r => setTimeout(r, 1000));
    }
    box.remove(); counting = false; return alive;
  }
  async function startRec() {
    if (!stream) return toast('카메라가 켜져 있지 않아요');
    const mime = pickMime();
    if (mime === null) return toast('이 브라우저는 녹화를 못 해요');
    recBtn.classList.add('on'); st.classList.add('recording');
    if (!(await countdown())) { recBtn.classList.remove('on'); st.classList.remove('recording'); return; }
    chunks = [];
    try { rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 8_000_000 }); }
    catch { rec = new MediaRecorder(stream); }
    rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = onRecStop;
    rec.start(1000);
    recording = true; recStart = Date.now();
    pill.classList.add('on');
    $('.flash', st).classList.remove('go'); void st.offsetWidth; $('.flash', st).classList.add('go');
    buzz(30);
    if (!SET.voice) setPlaying(true);
    keepAwake();
  }
  function stopRec() {
    if (counting) { counting = false; return; }
    if (!recording) return;
    recording = false; setPlaying(false);
    recBtn.classList.remove('on'); st.classList.remove('recording'); pill.classList.remove('on');
    buzz([20, 40, 20]);
    try { rec.stop(); } catch {}
  }
  async function onRecStop() {
    const dur = (Date.now() - recStart) / 1000;
    const type = rec.mimeType || chunks[0]?.type || 'video/webm';
    const blob = new Blob(chunks, { type }); chunks = [];
    if (!blob.size) return toast('녹화된 내용이 없어요');
    const t = { id: uid(), scriptId: s.id, createdAt: Date.now(), dur, mime: type, blob };
    try { await takes.put(t); } catch { toast('저장 공간이 부족해요. 지금 바로 저장해 주세요'); }
    const n = (await takes.of(s.id)).length;
    $('#tm', st).textContent = '0:00';
    pos = 0; scroller.scrollTop = 0; voiceTarget = SET.voice ? 0 : null; vpos = 0;
    takeSheet(s, t, n, null, { fresh: true });
  }

  /* 목소리 따라가기 (실험) */
  let vpos = 0;
  function startVoice() {
    stopVoice();
    if (!SET.voice) { voiceTarget = null; pill.classList.remove('listen'); pausedEl.classList.toggle('hide', playing); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('이 기기는 목소리 따라가기를 못 해요'); setSet({ voice: false }); return; }
    voiceTarget = scroller.scrollTop; setPlaying(false); pausedEl.classList.add('hide');
    const r = new SR(); recog = r;
    r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true;
    r.onresult = e => {
      let txt = ''; for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
      follow(norm(txt));
    };
    r.onerror = e => { if (e.error === 'not-allowed') { toast('마이크 권한이 없어 목소리 따라가기를 껐어요'); setSet({ voice: false }); recog = null; pill.classList.remove('listen'); voiceTarget = null; } };
    r.onend = () => { if (recog === r && alive && SET.voice) setTimeout(() => { try { r.start(); } catch {} }, 150); };
    try { r.start(); pill.classList.add('listen'); } catch {}
  }
  function stopVoice() { const r = recog; recog = null; try { r?.abort(); } catch {} pill.classList.remove('listen'); }
  function follow(heard) {
    if (heard.length < 2) return;
    for (const L of [8, 6, 4, 3]) {
      if (heard.length < L) continue;
      const tail = heard.slice(-L);
      const from = Math.max(0, vpos - 12), to = vpos + 260;
      const at = normAll.slice(from, to).indexOf(tail);
      if (at >= 0) { vpos = from + at + L; break; }
    }
    let k = words.findIndex(w => w.n1 >= vpos); if (k < 0) k = words.length - 1;
    voiceTarget = Math.max(0, spans[k].offsetTop + spans[k].offsetHeight / 2 - guidePx);
  }

  async function keepAwake() { try { wake = await navigator.wakeLock?.request('screen'); } catch {} }

  /* 손 */
  let downY = null, moved = false;
  scroller.addEventListener('pointerdown', e => { touching = true; downY = e.clientY; moved = false; });
  scroller.addEventListener('pointermove', e => { if (downY != null && Math.abs(e.clientY - downY) > 8) moved = true; });
  const up = () => {
    if (downY == null) return;
    touching = false; downY = null; pos = scroller.scrollTop; last = 0;
    if (SET.voice) { voiceTarget = scroller.scrollTop; const k = Math.max(0, lineIdx); vpos = words[k]?.n0 || 0; return; }
    if (!moved) { setPlaying(!playing); buzz(10); }
  };
  scroller.addEventListener('pointerup', up);
  scroller.addEventListener('pointercancel', () => { touching = false; downY = null; });
  scroller.addEventListener('wheel', () => { pos = scroller.scrollTop; }, { passive: true });

  const speed = d => { setSet({ cpm: Math.min(700, Math.max(120, SET.cpm + d)) }); $('#cpm', st).textContent = SET.cpm; buzz(8); mark(); lineIdx = -1; };
  $('#slow', st).onclick = () => speed(-20);
  $('#fast', st).onclick = () => speed(20);
  // 길게 누르면 빨리 바뀜
  for (const [b, d] of [['#slow', -20], ['#fast', 20]]) {
    let iv, to; const btn = $(b, st);
    btn.addEventListener('pointerdown', () => { to = setTimeout(() => { iv = setInterval(() => speed(d), 110); }, 380); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => { clearTimeout(to); clearInterval(iv); });
  }
  recBtn.onclick = () => {
    if (!camOn()) { setPlaying(!playing); keepAwake(); return; }
    recording || counting ? stopRec() : startRec();
  };
  $('#flip', st).onclick = async () => { if (recording) return; setSet({ facing: SET.facing === 'user' ? 'environment' : 'user' }); await startCam(); layout(); };
  $('#close', st).onclick = () => { if (recording) return toast('녹화를 먼저 멈춰 주세요'); history.length > 1 ? history.back() : location.replace('#/s/' + s.id); };
  $('#opt', st).onclick = () => optSheet();

  function optSheet() {
    const wasPlaying = playing; setPlaying(false);
    const box = el(`<div><h2>프롬프터 설정</h2>
      <div class="slide"><div class="row"><span class="lab row">${ic('size', 18)}글자 크기</span><b class="val" id="fsv">${SET.fs}</b></div><input type="range" id="fs" min="20" max="72" step="2" value="${SET.fs}"></div>
      <div class="slide" ${SET.cam ? '' : 'hidden'}><div class="row"><span class="lab row">${ic('band', 18)}글자 영역 높이</span><b class="val" id="bdv">${SET.band}%</b></div><input type="range" id="bd" min="25" max="80" step="1" value="${SET.band}"></div>
      <div class="opt"><span class="lab">${ic('cam', 18)}<span>카메라<small>끄면 글자만 크게 띄워요(다른 카메라로 찍을 때)</small></span></span><button class="sw" role="switch" data-k="cam" aria-checked="${SET.cam}"></button></div>
      <div class="opt"><span class="lab">${ic('mic', 18)}<span>목소리 따라가기 ${plan.limits().voice ? '' : '<em class="pro">프로</em>'}<small>읽는 만큼 글자가 따라와요 (실험)</small></span></span><button class="sw" role="switch" data-k="voice" aria-checked="${SET.voice}"></button></div>
      <div class="opt"><span class="lab">${ic('mirror', 18)}<span>글자 좌우 반전<small>반사 유리 프롬프터에 끼울 때</small></span></span><button class="sw" role="switch" data-k="mirrorText" aria-checked="${SET.mirrorText}"></button></div>
      <div class="opt"><span class="lab">${ic('align', 18)}가운데 정렬</span><button class="sw" role="switch" data-k="center" aria-checked="${SET.center}"></button></div>
      <div class="opt"><span class="lab">${ic('timer', 18)}카운트다운</span><div class="seg" id="cd">${[0, 3, 5].map(n => `<button aria-pressed="${SET.countdown === n}" data-n="${n}">${n ? n + '초' : '없음'}</button>`).join('')}</div></div>
      <button class="ghost wide" id="totop" style="margin-top:12px">${ic('top', 18)}처음으로 돌아가기</button></div>`);
    const sh = sheet(box, { onClose: () => { if (wasPlaying && !SET.voice) setPlaying(true); } });
    $('#fs', box).oninput = e => { setSet({ fs: +e.target.value }); $('#fsv', box).textContent = SET.fs; const frac = scroller.scrollTop / Math.max(1, scroller.scrollHeight); layout(); requestAnimationFrame(() => { scroller.scrollTop = pos = frac * scroller.scrollHeight; }); };
    $('#bd', box).oninput = e => { setSet({ band: +e.target.value }); $('#bdv', box).textContent = SET.band + '%'; layout(); };
    box.querySelectorAll('.sw').forEach(b => b.onclick = async () => {
      const k = b.dataset.k;
      if (k === 'voice' && !SET.voice && !plan.limits().voice) { sh.close(); plan.needPro('voice'); return; }
      setSet({ [k]: !SET[k] }); b.setAttribute('aria-checked', SET[k]); buzz(8);
      if (k === 'cam') { await startCam(); layout(); $('#bd', box).closest('.slide').hidden = !SET.cam; }
      else if (k === 'voice') startVoice();
      else layout();
    });
    box.querySelectorAll('#cd button').forEach(b => b.onclick = () => { setSet({ countdown: +b.dataset.n }); box.querySelectorAll('#cd button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#totop', box).onclick = () => { scroller.scrollTop = pos = 0; vpos = 0; if (SET.voice) voiceTarget = 0; sh.close(); };
  }

  /* 키보드·블루투스 리모컨 */
  const onKey = e => {
    if (document.querySelector('.sheet.in')) return;
    const line = SET.fs * 1.42;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); scroller.scrollTop = pos = scroller.scrollTop + line * (e.key === 'PageDown' ? 3 : 1); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); scroller.scrollTop = pos = scroller.scrollTop - line * (e.key === 'PageUp' ? 3 : 1); }
    else if (e.key === 'ArrowRight') speed(20);
    else if (e.key === 'ArrowLeft') speed(-20);
    else if (e.key === 'r' || e.key === 'R') recBtn.click();
    else if (e.key === 'Escape') $('#close', st).click();
  };
  document.addEventListener('keydown', onKey);
  const onResize = () => measure();
  window.addEventListener('resize', onResize);
  const onVis = () => { if (document.visibilityState === 'visible' && (playing || recording)) keepAwake(); };
  document.addEventListener('visibilitychange', onVis);

  if (flag('hinted')) hint.style.display = 'none'; else setTimeout(() => { hint.style.opacity = 0; }, 6000);
  layout();
  await startCam();
  setPlaying(false);
  if (SET.voice && !plan.limits().voice) setSet({ voice: false });
  if (SET.voice) startVoice();
  raf = requestAnimationFrame(tick);

  return async () => {
    alive = false; counting = false;
    if (recording) { recording = false; try { rec.onstop = null; rec.stop(); } catch {} }
    cancelAnimationFrame(raf); stopVoice(); stopCam();
    try { await wake?.release(); } catch {}
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    document.querySelectorAll('#sheet-root > *').forEach(n => n.remove());
    st.remove();
  };
}

/* ---------- 시작 ---------- */
const SAMPLE = `안녕하세요, 오늘은 제가 요즘 매일 쓰는 작업 루틴을 보여 드릴게요.

아침에 일어나면 제일 먼저 오늘 할 일을 세 개만 적어요. 많이 적으면 오히려 하나도 못 하더라고요.

그다음엔 좋아하는 음악을 틀고 한 시간 동안 딱 한 가지 일만 해요.

여러분은 어떤 루틴이 있나요? 댓글로 알려 주세요!`;

(async () => {
  if (!flag('seeded')) { flag('seeded', '1'); if (!(await scripts.all()).length) await newScript(SAMPLE, '첫 대본 예시'); }
  route();
  plan.boot();
  plan.onChange(() => { if ((location.hash || '#/') === '#/') route(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
