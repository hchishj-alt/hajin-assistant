// 하진 프롬프터: 카메라 위에 대본을 띄우고 바로 찍는 앱. sw.js의 VERSION과 같이 올릴 것
import { scripts, takes, uid, flag } from './store.js';
import { ic, esc, $, el, chars, fmt, paras, toast, buzz, sheet } from './ui.js';
import * as plan from './plan.js';
import { mountStage, autoSec } from './stage.js';

export const VERSION = '1.1.0';


/* ---------- 프로젝트(폴더) ---------- */
// 대본은 프로젝트 하나에 들어간다(project: id, 없으면 미분류). 프로젝트 목록은 이 기기 localStorage.
const PK = 'prompter:projects', CUR = 'prompter:proj';
const projects = {
  all() { try { return JSON.parse(localStorage.getItem(PK) || '[]'); } catch { return []; } },
  save(list) { try { localStorage.setItem(PK, JSON.stringify(list)); } catch {} },
  add(name) { const p = { id: uid(), name: name.trim().slice(0, 30) || '새 프로젝트', createdAt: Date.now() }; this.save([...this.all(), p]); return p; },
  rename(id, name) { this.save(this.all().map(p => p.id === id ? { ...p, name: name.trim().slice(0, 30) || p.name } : p)); },
  remove(id) { this.save(this.all().filter(p => p.id !== id)); },
  get(id) { return this.all().find(p => p.id === id); },
};
const curProj = () => { try { return localStorage.getItem(CUR) || 'all'; } catch { return 'all'; } };
const setCurProj = v => { try { localStorage.setItem(CUR, v); } catch {} };
const STATUS = { draft: ['쓰는 중', 'edit'], ready: ['촬영 대기', 'cam'], done: ['완료', 'check'] };
const secOf = s => s.sec || autoSec(s.body);

function ask(title, value = '', { ok = '저장', placeholder = '' } = {}) {
  return new Promise(res => {
    const box = el(`<div><h2>${esc(title)}</h2><input class="inp" style="width:100%" maxlength="30" placeholder="${esc(placeholder)}" value="${esc(value)}"><div class="row" style="margin-top:12px"><button class="ghost grow" data-x>그만두기</button><button class="btn grow" data-o>${esc(ok)}</button></div></div>`);
    let done = false; const fin = v => { if (done) return; done = true; res(v); sh.close(); };
    const sh = sheet(box, { onClose: () => fin(null) });
    const inp = $('input', box); setTimeout(() => inp.focus(), 350);
    $('[data-x]', box).onclick = () => fin(null);
    $('[data-o]', box).onclick = () => fin(inp.value.trim() || null);
    inp.onkeydown = e => { if (e.key === 'Enter') fin(inp.value.trim() || null); };
  });
}

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
    const cp = curProj();
    const s = await newScript('', '', cp !== 'all' && cp !== 'none' ? cp : ''); location.replace('#/s/' + s.id); return;
  }
  if (a === 'plan') { await plan.planView(view); requestAnimationFrame(() => view.classList.add('in')); return; }
  if (a === 'admin') { await plan.adminView(view); requestAnimationFrame(() => view.classList.add('in')); return; }
  if (a === 's' && b) cleanup = await editView(b);
  else if (a === 'shoot' && b) cleanup = await shootView(b);
  else cleanup = await listView();
  requestAnimationFrame(() => view.classList.add('in'));
}
window.addEventListener('hashchange', route);

async function newScript(body = '', title = '', project = '', sec = 0) {
  const s = { id: uid(), title, body, project, sec, status: 'draft', createdAt: Date.now(), updatedAt: Date.now() };
  await scripts.put(s); return s;
}

/* ---------- 목록 ---------- */
async function listView() {
  const all = await scripts.all();
  const counts = await takes.countBy();
  const projs = projects.all();
  let cp = curProj();
  if (cp !== 'all' && cp !== 'none' && !projects.get(cp)) { cp = 'all'; setCurProj(cp); }
  const inProj = s => cp === 'all' ? true : cp === 'none' ? !s.project || !projects.get(s.project) : s.project === cp;
  const list = all.filter(inProj);
  const nNone = all.filter(s => !s.project || !projects.get(s.project)).length;
  const total = list.reduce((a, s) => a + (counts[s.id] || 0), 0);
  const time = list.reduce((a, s) => a + secOf(s), 0);
  const done = list.filter(s => s.status === 'done').length;
  const P = projects.get(cp);
  view.innerHTML = `
    <div class="top"><div><h1>프롬프터</h1><p class="sub">대본을 띄우고 바로 찍어요</p></div>
      <div class="row"><a class="planbtn${plan.isPro() ? ' on' : ''}" href="#/plan" aria-label="구독 관리">${ic('star', 16)}${plan.isPro() ? '프로' : '무료'}</a><a class="iconbtn" href="#/new" aria-label="새 대본">${ic('plus', 22)}</a></div></div>
    <div class="chips" id="chips">
      <button class="chipbtn" data-p="all" aria-pressed="${cp === 'all'}">전체 <b>${all.length}</b></button>
      ${projs.map(p => `<button class="chipbtn" data-p="${p.id}" aria-pressed="${cp === p.id}">${ic('folder', 14)}${esc(p.name)} <b>${all.filter(s => s.project === p.id).length}</b></button>`).join('')}
      ${nNone && projs.length ? `<button class="chipbtn" data-p="none" aria-pressed="${cp === 'none'}">미분류 <b>${nNone}</b></button>` : ''}
      <button class="chipbtn add" id="addP">${ic('plus', 14)}프로젝트</button>
    </div>
    ${P ? `<div class="phead"><div class="grow"><b>${esc(P.name)}</b><span class="muted">대본 ${list.length} · 완료 ${done}</span></div><button class="mini" id="pmenu" aria-label="프로젝트 관리">${ic('more', 20)}</button></div>` : ''}
    <div class="stats">
      <div class="stat"><div class="n">${ic('doc', 18)}${list.length}</div><div class="l">대본${done ? ` · 완료 ${done}` : ''}</div></div>
      <div class="stat"><div class="n">${ic('film', 18)}${total}</div><div class="l">찍은 테이크</div></div>
      <div class="stat"><div class="n">${ic('clock', 18)}${fmt(time)}</div><div class="l">읽는 시간 합</div></div>
    </div>
    <div id="cards"></div>
    <a class="btn wide" href="#/new" style="margin-top:6px">${ic('plus')}${P ? esc(P.name) + '에 ' : ''}새 대본 쓰기</a>
    ${plan.isPro() ? '' : `<p class="tip c">무료는 대본 ${plan.limits().scripts}개까지 · 지금 ${all.length}개</p>`}`;
  view.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { setCurProj(b.dataset.p); buzz(8); route(); });
  $('#addP').onclick = async () => { const n = await ask('새 프로젝트', '', { ok: '만들기', placeholder: '예: 인스타 릴스 11월' }); if (!n) return; const p = projects.add(n); setCurProj(p.id); route(); };
  $('#pmenu')?.addEventListener('click', () => projectMenu(P, list));
  const chips = $('#chips'), on = chips.querySelector('[aria-pressed=true]'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  const box = $('#cards');
  if (!list.length) box.innerHTML = `<div class="empty">${ic('doc', 34)}<p>${P ? '이 프로젝트에 아직 대본이 없어요.' : '아직 대본이 없어요.'}<br>새 대본을 쓰거나 복사한 글을 붙여 넣어요.</p></div>`;
  const order = { ready: 0, draft: 1, done: 2 };
  list.sort((x, y) => (order[x.status || 'draft'] - order[y.status || 'draft']) || (y.updatedAt - x.updatedAt));
  list.forEach((s, i) => {
    const first = (s.body || '').replace(/\[\[.+?\]\]\n?/g, '').trim().split('\n')[0] || '내용 없음';
    const [st, sic] = STATUS[s.status || 'draft'];
    const pj = cp === 'all' && projects.get(s.project);
    const c = el(`<div class="card${s.status === 'done' ? ' isdone' : ''}" style="animation-delay:${i * 40}ms">
      <div class="grow"><div class="ctop"><span class="st st-${s.status || 'draft'}">${ic(sic, 12)}${st}</span>${pj ? `<span class="pj">${ic('folder', 12)}${esc(pj.name)}</span>` : ''}</div>
        <h3>${esc(s.title || first.slice(0, 24) || '제목 없음')}</h3><p class="pv">${esc(first)}</p>
        <div class="meta"><span>${ic('text', 14)}${chars(s.body)}자</span><span>${ic('clock', 14)}${fmt(secOf(s))}</span><span>${ic('film', 14)}${counts[s.id] || 0}</span></div></div>
      <button class="shoot" aria-label="이 대본으로 찍기">${ic('cam', 24)}</button></div>`);
    c.onclick = e => { location.hash = (e.target.closest('.shoot') ? '#/shoot/' : '#/s/') + s.id; };
    box.append(c);
  });
}

function projectMenu(P, list) {
  const box = el(`<div><h2>${esc(P.name)}</h2>
    <button class="ghost wide" data-r>${ic('edit', 18)}이름 바꾸기</button>
    <button class="ghost wide" data-d style="margin-top:8px;color:var(--rec)">${ic('trash', 18)}프로젝트 지우기</button>
    <p class="tip" style="margin-top:10px">프로젝트를 지워도 대본은 지워지지 않고 미분류로 옮겨져요.</p></div>`);
  const sh = sheet(box);
  $('[data-r]', box).onclick = async () => { sh.close(); const n = await ask('프로젝트 이름', P.name); if (n) { projects.rename(P.id, n); route(); } };
  $('[data-d]', box).onclick = async () => {
    for (const s of list) { s.project = ''; await scripts.put(s); }
    projects.remove(P.id); setCurProj('all'); sh.close(); toast('프로젝트를 지웠어요. 대본은 미분류로 옮겼어요'); route();
  };
}

/* ---------- 편집 ---------- */
async function editView(id) {
  const s = await scripts.get(id);
  if (!s) { location.replace('#/'); return; }
  const projs = projects.all();
  view.innerHTML = `
    <div class="top"><a class="iconbtn" href="#/" aria-label="목록">${ic('left', 22)}</a>
      <div class="row"><button class="iconbtn" id="del" aria-label="대본 지우기">${ic('trash')}</button></div></div>
    <input class="titlein" id="ti" placeholder="제목 (비우면 첫 줄)" value="${esc(s.title)}" maxlength="60">
    <div class="erow">
      <button class="chipbtn" id="pj">${ic('folder', 14)}<span>${esc(projects.get(s.project)?.name || '프로젝트 없음')}</span></button>
      <div class="seg sm" id="stt">${Object.entries(STATUS).map(([k, [n]]) => `<button data-s="${k}" aria-pressed="${(s.status || 'draft') === k}">${n}</button>`).join('')}</div>
    </div>
    <div class="emeta"><div class="meta" id="em"></div><button class="ghost sm" id="paste">${ic('paste', 16)}붙여넣기</button></div>
    <textarea class="editor" id="ed" placeholder="여기에 대본을 쓰거나 붙여 넣어요.&#10;&#10;[[인사]]처럼 대괄호 두 개로 감싼 줄은 촬영 화면에서 작은 구간 표시로 보여요." spellcheck="false">${esc(s.body)}</textarea>
    <div class="secrow"><span class="lab">${ic('timer', 16)}읽는 시간</span><input class="inp" id="sec" type="number" min="5" max="3600" inputmode="numeric" value="${secOf(s)}"><span class="muted">초</span><button class="ghost sm" id="auto">글자 수로 맞추기</button></div>
    <p class="tip">대사는 이 시간에 맞춰 올라가요. 촬영 화면에서 속도(%)로 더 조절할 수 있어요.</p>
    <div id="tk"></div>
    <div class="bar"><a class="btn acc wide" href="#/shoot/${s.id}">${ic('cam')}이 대본으로 찍기</a></div>`;
  const ed = $('#ed'), ti = $('#ti'), em = $('#em'), sec = $('#sec');
  let autoS = !s.sec; // 직접 정하기 전까지는 글자 수를 따라감
  const meta = () => { em.innerHTML = `<span>${ic('text', 14)}${chars(ed.value)}자</span><span>${ic('para', 14)}문단 ${paras(ed.value)}</span>`; };
  const grow = () => { ed.style.height = 'auto'; ed.style.height = Math.max(ed.scrollHeight, window.innerHeight * .46) + 'px'; };
  let t; let dirty = false;
  const save = async () => { clearTimeout(t); if (!dirty) return; dirty = false; s.title = ti.value.trim(); s.body = ed.value; s.updatedAt = Date.now(); await scripts.put(s); };
  const later = () => { dirty = true; clearTimeout(t); t = setTimeout(save, 400); };
  ed.oninput = () => { meta(); grow(); if (autoS) { s.sec = 0; sec.value = autoSec(ed.value); } later(); };
  ti.oninput = later;
  sec.onchange = () => { s.sec = Math.max(5, Math.min(3600, +sec.value || 30)); sec.value = s.sec; autoS = false; later(); };
  $('#auto').onclick = () => { s.sec = 0; autoS = true; sec.value = autoSec(ed.value); later(); toast(`${sec.value}초로 맞췄어요`); };
  $('#stt').querySelectorAll('button').forEach(b => b.onclick = () => { s.status = b.dataset.s; $('#stt').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); buzz(8); later(); });
  $('#pj').onclick = () => {
    const box = el(`<div><h2>프로젝트로 옮기기</h2><div class="plist">
      <button data-p="" aria-pressed="${!s.project}">${ic('doc', 16)}프로젝트 없음</button>
      ${projs.map(p => `<button data-p="${p.id}" aria-pressed="${s.project === p.id}">${ic('folder', 16)}${esc(p.name)}</button>`).join('')}
      <button data-new>${ic('plus', 16)}새 프로젝트 만들기</button></div></div>`);
    const sh = sheet(box);
    box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { s.project = b.dataset.p; $('#pj span').textContent = projects.get(s.project)?.name || '프로젝트 없음'; later(); sh.close(); toast('옮겼어요'); });
    $('[data-new]', box).onclick = async () => { sh.close(); const n = await ask('새 프로젝트', '', { ok: '만들기' }); if (!n) return; const p = projects.add(n); projs.push(p); s.project = p.id; $('#pj span').textContent = p.name; later(); };
  };
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

/* ---------- 촬영 (스튜디오 엔진: stage.js) ---------- */
async function shootView(id) {
  const s = await scripts.get(id);
  if (!s) { location.replace('#/'); return; }
  const T = { id: s.id, title: s.title, body: (s.body || '').trim() || '대본이 비어 있어요. 나가서 대본을 써 주세요.', sec: secOf(s) };
  const st = mountStage({
    script: T,
    limits: () => ({ ...plan.limits(), hq: plan.limits().hq }),
    needPro: k => plan.needPro(k),
    onExit: () => { history.length > 1 ? history.back() : location.replace('#/s/' + s.id); },
    onTake: async ({ blob, mime, dur }) => {
      const t = { id: uid(), scriptId: s.id, createdAt: Date.now(), dur, mime, blob };
      try { await takes.put(t); } catch { toast('저장 공간이 부족해요. 지금 바로 저장해 주세요'); }
      if (s.status !== 'done') { s.status = 'done'; s.updatedAt = Date.now(); await scripts.put(s); }
      const n = (await takes.of(s.id)).length;
      takeSheet(s, t, n, null, { fresh: true });
    },
  });
  return () => { st.destroy(); document.querySelectorAll('#sheet-root > *').forEach(n => n.remove()); };
}

/* ---------- 예전 스튜디오(eternia-exhibition/studio) 대본 옮기기 ---------- */
// 같은 사이트(hchishj-alt.github.io)라 그 페이지가 저장한 localStorage 'pst_scripts'를 읽을 수 있다.
async function migrateStudio() {
  if (flag('migrated')) return 0;
  let old = null; try { old = JSON.parse(localStorage.getItem('pst_scripts') || 'null'); } catch {}
  flag('migrated', '1');
  if (!Array.isArray(old)) return 0;
  const mine = old.filter(x => x && x.text && !/^ex\d$/.test(x.id));
  if (!mine.length) return 0;
  const p = projects.add('스튜디오에서 옮긴 대본');
  for (const x of mine) await newScript(String(x.text), String(x.name || ''), p.id, +x.sec || 0);
  return mine.length;
}


/* ---------- 시작 ---------- */
const SAMPLE = `[[인사]]
안녕하세요, 오늘은 제가 요즘 매일 쓰는 작업 루틴을 보여 드릴게요.

아침에 일어나면 제일 먼저 오늘 할 일을 세 개만 적어요. 많이 적으면 오히려 하나도 못 하더라고요.

그다음엔 좋아하는 음악을 틀고 한 시간 동안 딱 한 가지 일만 해요.

여러분은 어떤 루틴이 있나요? 댓글로 알려 주세요!`;

(async () => {
  const moved = await migrateStudio();
  if (!flag('seeded')) { flag('seeded', '1'); if (!(await scripts.all()).length) await newScript(SAMPLE, '첫 대본 예시'); }
  if (moved) setTimeout(() => toast(`스튜디오에서 쓰던 대본 ${moved}개를 옮겨 왔어요`), 600);
  route();
  plan.boot();
  plan.onChange(() => { if ((location.hash || '#/') === '#/') route(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
