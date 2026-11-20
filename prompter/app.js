// 프롬프리에딧(PROMPRI EDIT): 카메라 위에 대본을 띄우고 씬별로 찍어 이어 붙이는 앱. sw.js의 VERSION과 같이 올릴 것
import { scripts, takes, uid, flag } from './store.js';
import { ic, esc, $, el, chars, fmt, paras, toast, buzz, sheet, undoToast } from './ui.js';
import * as plan from './plan.js';
import { mountStage, autoSec } from './stage.js';
import { startI18n, LANGS, lang, langPref, setLang } from './i18n.js';
import { CONTACT } from './config.js';
import { legalView, legalLinks, bizLine } from './legal.js';

export const VERSION = '1.5.3';


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
  const [, a, b, c] = (location.hash || '#/').split('/');
  view.classList.remove('in');
  view.innerHTML = '';
  if (a === 'new') {
    if ((await scripts.all()).length >= plan.limits().scripts) { location.replace('#/'); plan.needPro('scripts'); return; }
    const cp = curProj();
    const s = await newScript('', '', cp !== 'all' && cp !== 'none' ? cp : ''); location.replace('#/s/' + s.id); return;
  }
  if (a === 'hello') { helloView(); requestAnimationFrame(() => view.classList.add('in')); return; }
  if (a === 'plan') { await plan.planView(view); requestAnimationFrame(() => view.classList.add('in')); return; }
  if (a === 'terms' || a === 'privacy' || a === 'refund') { legalView(view, a); scrollTo(0, 0); requestAnimationFrame(() => view.classList.add('in')); return; }
  if (a === 'admin') { await plan.adminView(view); requestAnimationFrame(() => view.classList.add('in')); return; }
  if (a === 's' && b) cleanup = await editView(b);
  else if (a === 'shoot' && b) cleanup = await shootView(b, +c || 0);
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
    <div class="top"><a class="brand" href="#/hello" aria-label="프롬프리에딧 소개"><img src="icon.svg" alt=""><span><b>프롬프리에딧</b><em>PROMPRI EDIT</em></span></a>
      <div class="row"><button class="iconbtn sm" data-lang aria-label="언어">${ic('globe', 18)}</button><a class="planbtn${plan.isPro() ? ' on' : ''}" href="#/plan" aria-label="구독 관리">${ic('star', 16)}${plan.isPro() ? '프로' : '무료'}</a><a class="iconbtn" href="#/new" aria-label="새 대본">${ic('plus', 22)}</a></div></div>
    ${installTip()}
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
    <a class="btn wide" href="#/new" style="margin-top:6px">${ic('plus')}새 대본 쓰기</a>
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
    <div class="edit2"><div class="emain">
    <input class="titlein" id="ti" placeholder="제목 (비우면 첫 줄)" value="${esc(s.title)}" maxlength="60">
    <div class="erow">
      <button class="chipbtn" id="pj">${ic('folder', 14)}<span>${esc(projects.get(s.project)?.name || '프로젝트 없음')}</span></button>
      <div class="stepper" id="stt" data-i="${Object.keys(STATUS).indexOf(s.status || 'draft')}" role="group" aria-label="진행 상태"><i class="track"><b></b></i>${Object.entries(STATUS).map(([k, [n, i]]) => `<button data-s="${k}" aria-pressed="${(s.status || 'draft') === k}"><span class="dot">${ic(i, 13)}</span><em>${n}</em></button>`).join('')}</div>
    </div>
    <div class="emeta"><div class="meta" id="em"></div><button class="ghost sm" id="paste">${ic('paste', 16)}붙여넣기</button></div>
    <div id="scn"></div>
    <button class="addscn" id="addS">${ic('plus', 18)}씬 추가</button>
    <div class="secrow"><span class="lab">${ic('timer', 16)}읽는 시간</span><input class="inp" id="sec" type="number" min="5" max="3600" inputmode="numeric" value="${secOf(s)}"><span class="muted">초</span><button class="ghost sm" id="auto">글자 수로 맞추기</button></div>
    <p class="tip">대사는 이 시간에 맞춰 올라가요. 촬영 화면에서 속도(%)로 더 조절할 수 있어요.</p>
    </div><div class="eside">
    <div id="tk"></div>
    <div class="bar"><a class="btn acc wide" href="#/shoot/${s.id}">${ic('cam')}이 대본으로 찍기</a></div></div></div>`;
  const ti = $('#ti'), em = $('#em'), sec = $('#sec'), scn = $('#scn');
  let SC = toScenes(s.body), lastTa = null;
  const ed = { get value() { return fromScenes(SC); } }; // 아래 코드가 쓰는 '전체 대본'
  let autoS = !s.sec; // 직접 정하기 전까지는 글자 수를 따라감
  const meta = () => { em.innerHTML = `<span>${ic('text', 14)}${chars(ed.value)}자</span><span>${ic('para', 14)}문단 ${paras(ed.value)}</span>`; };
  const growOne = ta => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, SC.length > 1 ? 120 : window.innerHeight * .42) + 'px'; };
  const grow = () => scn.querySelectorAll('textarea').forEach(growOne);
  const drawScenes = (focus = -1) => {
    const multi = SC.length > 1;
    scn.className = multi ? 'scenes multi' : 'scenes';
    scn.innerHTML = SC.map((c, i) => `<div class="scene" style="animation-delay:${i * 30}ms">
      ${multi ? `<div class="shead"><b class="snum">${i + 1}</b><input class="sname" data-n="${i}" value="${esc(c.name)}" placeholder="씬 ${i + 1}" maxlength="30">
        <span class="smeta">${chars(c.text)}자</span>
        <button class="mini" data-up="${i}" aria-label="위로" ${i ? '' : 'disabled'}>${ic('top', 16)}</button>
        <button class="mini" data-rm="${i}" aria-label="씬 지우기">${ic('trash', 16)}</button></div>` : ''}
      <textarea class="editor" data-t="${i}" spellcheck="false" placeholder="${multi ? '이 씬에서 할 말' : '여기에 대본을 쓰거나 붙여 넣어요.&#10;&#10;여러 번 나눠 찍으려면 아래 [씬 추가]를 눌러요.'}">${esc(c.text)}</textarea></div>`).join('');
    scn.querySelectorAll('textarea').forEach(ta => {
      ta.oninput = () => { SC[+ta.dataset.t].text = ta.value; growOne(ta); const m = ta.parentNode.querySelector('.smeta'); if (m) m.textContent = chars(ta.value) + '자'; changed(); };
      ta.onfocus = () => lastTa = ta;
    });
    scn.querySelectorAll('.sname').forEach(n => n.oninput = () => { SC[+n.dataset.n].name = n.value; changed(); });
    scn.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [SC[i - 1], SC[i]] = [SC[i], SC[i - 1]]; changed(); drawScenes(); buzz(8); });
    scn.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const i = +b.dataset.rm, gone = SC.splice(i, 1)[0];
      if (SC.length === 1 && /^씬 \d+$/.test(SC[0].name)) SC[0].name = '';
      changed(); drawScenes();
      if (gone.text.trim()) toast('씬을 지웠어요');
    });
    requestAnimationFrame(grow);
    if (focus >= 0) setTimeout(() => scn.querySelectorAll(focus === -2 ? '.sname' : 'textarea')[focus]?.focus(), 250);
  };
  const changed = () => { if (autoS) { s.sec = 0; sec.value = autoSec(ed.value); } meta(); later(); };
  $('#addS').onclick = () => { SC.push({ name: '', text: '' }); changed(); drawScenes(SC.length - 1); buzz(8); };
  drawScenes();
  let t; let dirty = false;
  const save = async () => { clearTimeout(t); if (!dirty) return; dirty = false; s.title = ti.value.trim(); s.body = fromScenes(SC); s.updatedAt = Date.now(); await scripts.put(s); };
  const later = () => { dirty = true; clearTimeout(t); t = setTimeout(save, 400); };
  ti.oninput = later;
  sec.onchange = () => { s.sec = Math.max(5, Math.min(3600, +sec.value || 30)); sec.value = s.sec; autoS = false; later(); };
  $('#auto').onclick = () => { s.sec = 0; autoS = true; sec.value = autoSec(ed.value); later(); toast(`${sec.value}초로 맞췄어요`); };
  $('#stt').querySelectorAll('button').forEach((b, i) => b.onclick = () => { s.status = b.dataset.s; $('#stt').dataset.i = i; $('#stt').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); buzz(8); later(); });
  $('#pj').onclick = () => {
    const box = el(`<div><h2>프로젝트로 옮기기</h2><div class="plist">
      <button data-p="" aria-pressed="${!s.project}">${ic('doc', 16)}프로젝트 없음</button>
      ${projs.map(p => `<button data-p="${p.id}" aria-pressed="${s.project === p.id}">${ic('folder', 16)}${esc(p.name)}</button>`).join('')}
      <button data-new>${ic('plus', 16)}새 프로젝트 만들기</button></div></div>`);
    const sh = sheet(box);
    box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { s.project = b.dataset.p; $('#pj span').textContent = projects.get(s.project)?.name || '프로젝트 없음'; later(); sh.close(); toast('옮겼어요'); });
    $('[data-new]', box).onclick = async () => { sh.close(); const n = await ask('새 프로젝트', '', { ok: '만들기' }); if (!n) return; const p = projects.add(n); projs.push(p); s.project = p.id; $('#pj span').textContent = p.name; later(); };
  };
  meta();
  if (!s.body) setTimeout(() => scn.querySelector('textarea')?.focus(), 300);
  $('#paste').onclick = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt.trim()) return toast('복사한 글이 없어요');
      const ta = lastTa || scn.querySelector('textarea:last-of-type') || scn.querySelectorAll('textarea')[SC.length - 1];
      const at = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, at) + txt + ta.value.slice(ta.selectionEnd ?? at);
      ta.oninput(); toast(`${chars(txt)}자를 붙였어요`);
    } catch { (lastTa || scn.querySelector('textarea'))?.focus(); toast('글 칸을 길게 눌러 붙여 넣어 주세요'); }
  };
  $('#del').onclick = () => {
    const box = el(`<div><h2>이 대본을 지울까요?</h2><p style="color:var(--sub);margin:0 0 14px">찍은 테이크도 같이 지워져요. 되돌릴 수 없어요.</p>
      <div class="row"><button class="ghost grow" data-x>그만두기</button><button class="btn grow" style="background:var(--rec);color:#fff" data-d>지우기</button></div></div>`);
    const sh = sheet(box);
    $('[data-x]', box).onclick = sh.close;
    $('[data-d]', box).onclick = async () => {
      dirty = false; const keep = await takes.of(s.id);
      await scripts.remove(s.id); sh.close(); location.replace('#/');
      setTimeout(() => undoToast('대본을 지웠어요', async () => { await scripts.put(s); for (const t of keep) await takes.put(t); route(); }), 300);
    };
  };
  await renderTakes(s, $('#tk'));
  return save;
}


async function renderTakes(s, box) {
  const list = await takes.of(s.id);
  const urls = [];
  const P = splitParts(s.body), multi = P.length > 1;
  const card = (t, n, i, star) => {
    const u = URL.createObjectURL(t.blob); urls.push(u);
    const c = el(`<div class="take${star ? ' pick' : ''}" style="animation-delay:${i * 40}ms"><video src="${u}#t=0.1" playsinline muted preload="metadata"></video>
      ${star != null ? `<button class="star" data-k aria-pressed="${!!star}" aria-label="이 테이크 쓰기">${ic('star', 16)}</button>` : ''}
      <div class="tb"><span>${t.joined ? '이어 붙임' : '#' + n} · ${fmt(t.dur)}</span><span class="row"><button class="mini" data-s aria-label="저장">${ic('share', 18)}</button><button class="mini" data-d aria-label="지우기">${ic('trash', 18)}</button></span></div></div>`);
    $('video', c).onclick = () => takeSheet(s, t, n, () => renderTakes(s, box));
    $('[data-s]', c).onclick = () => saveTake(s, t, n);
    $('[data-d]', c).onclick = async () => { await takes.remove(t.id); renderTakes(s, box); undoToast('테이크를 지웠어요', async () => { await takes.put(t); renderTakes(s, box); }); };
    const k = $('[data-k]', c); if (k) k.onclick = async () => { s.picks = { ...(s.picks || {}), [t.part]: t.id }; await scripts.put(s); buzz(8); renderTakes(s, box); };
    return c;
  };
  box.innerHTML = '';
  if (!multi) {
    const own = list.filter(t => !t.joined);
    if (own.length) {
      box.append(el(`<div class="sec">${ic('film', 16)}찍은 테이크 ${own.length}</div>`));
      const g = el('<div class="takes"></div>'); own.forEach((t, i) => g.append(card(t, own.length - i, i, null))); box.append(g);
    } else box.append(el(`<div class="tkempty">${ic('film', 22)}<br>찍은 테이크가 여기에 모여요.<br>씬을 나누면 씬별로 모이고 한 번에 이어 붙일 수 있어요.</div>`));
  } else {
    // 씬마다 고른 테이크(★, 없으면 가장 최근)
    const pick = {};
    for (const p of P) { const mine = list.filter(t => t.part === p.name && !t.joined); pick[p.name] = mine.find(t => t.id === s.picks?.[p.name]) || mine[0] || null; }
    const ready = P.filter(p => pick[p.name]), miss = P.filter(p => !pick[p.name]);
    const total = ready.reduce((a, p) => a + (pick[p.name].dur || 0), 0);
    const jb = el(`<div class="joinbox"><div><b>이어서 한 번에 저장</b><span><span>${ready.length}/${P.length}씬 · ${fmt(total)}</span>${miss.length ? `<span> · 아직 안 찍은 씬:</span> <span class="noi18n">${miss.map(p => esc(p.name)).join(', ')}</span>` : ''}</span></div>
      <button class="btn acc" ${ready.length < 2 ? 'disabled' : ''}>${ic('film', 18)}이어 붙이기</button></div>`);
    $('button', jb).onclick = () => joinSheet(s, ready.map(p => pick[p.name]), miss, () => renderTakes(s, box));
    box.append(jb);
    const joined = list.filter(t => t.joined);
    if (joined.length) {
      box.append(el(`<div class="sec">${ic('film', 16)}이어 붙인 영상 ${joined.length}</div>`));
      const g = el('<div class="takes"></div>'); joined.forEach((t, i) => g.append(card(t, joined.length - i, i, null))); box.append(g);
    }
    P.forEach((p, pi) => {
      const mine = list.filter(t => t.part === p.name && !t.joined);
      const h = el(`<div class="sec scs"><span>${ic('film', 16)}${esc(p.name)} <em>${mine.length ? mine.length + '개' : ''}</em></span><a class="ghost sm" href="#/shoot/${s.id}/${pi + 1}">${ic('cam', 15)}이 씬 찍기</a></div>`);
      box.append(h);
      if (!mine.length) { box.append(el('<p class="tip">아직 안 찍었어요</p>')); return; }
      const g = el('<div class="takes"></div>'); mine.forEach((t, i) => g.append(card(t, mine.length - i, i, pick[p.name] === t))); box.append(g);
    });
    const rest = list.filter(t => !t.joined && !P.some(p => p.name === t.part));
    if (rest.length) {
      box.append(el(`<div class="sec">${ic('film', 16)}통째로 찍은 테이크 ${rest.length}</div>`));
      const g = el('<div class="takes"></div>'); rest.forEach((t, i) => g.append(card(t, rest.length - i, i, null))); box.append(g);
    }
  }
  setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 60000);
}

function joinSheet(s, list, miss, onDone) {
  const box = el(`<div><h2>${list.length}개 씬을 이어 붙여요</h2>
    <p class="tip" style="margin:0 0 12px"><span class="noi18n">${list.map(t => esc(t.part)).join(' → ')}</span>${miss.length ? `<br><span>아직 안 찍은 씬은 빼고 붙여요:</span> <span class="noi18n">${miss.map(p => esc(p.name)).join(', ')}</span>` : ''}<br>영상 길이(${fmt(list.reduce((a, t) => a + (t.dur || 0), 0))})만큼 걸려요. 그동안 화면을 켜 두세요.</p>
    <div class="jprog"><i></i></div><p class="jpct">0%</p>
    <div class="row"><button class="ghost grow" data-x>그만두기</button><button class="btn acc grow" data-go>${ic('film', 18)}시작</button></div></div>`);
  let busy = false;
  const sh = sheet(box, { onClose: () => {} });
  $('[data-x]', box).onclick = () => { if (!busy) sh.close(); };
  $('[data-go]', box).onclick = async () => {
    if (busy) return; busy = true; $('[data-go]', box).disabled = true; $('[data-x]', box).disabled = true;
    let wl = null; try { wl = await navigator.wakeLock?.request('screen'); } catch {}
    try {
      const r = await joinTakes(list, f => { $('.jprog i', box).style.width = (f * 100).toFixed(1) + '%'; $('.jpct', box).textContent = Math.round(f * 100) + '%'; });
      const t = { id: uid(), scriptId: s.id, createdAt: Date.now(), dur: r.dur, mime: r.mime, blob: r.blob, joined: true };
      try { await takes.put(t); } catch { toast('저장 공간이 부족해요. 지금 바로 저장해 주세요'); }
      try { navigator.storage?.persist?.(); } catch {} // 브라우저가 영상을 함부로 지우지 않게
      sh.close(); onDone?.();
      setTimeout(() => takeSheet(s, t, 1, onDone, { fresh: true, joined: true }), 400);
    } catch (e) { busy = false; $('[data-go]', box).disabled = false; $('[data-x]', box).disabled = false; toast('이어 붙이지 못했어요 · ' + (e?.message || e)); }
    try { wl?.release(); } catch {}
  };
}

function fileName(s, n, mime, t) {
  const ext = /mp4/.test(mime) ? 'mp4' : 'webm';
  const base = (s.title || (s.body || '').trim().split('\n')[0] || '대본').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24);
  return `${base}${t?.joined ? '_전체' : (t?.part ? '_' + t.part.replace(/\s+/g, '') : '') + '_테이크' + n}.${ext}`;
}
async function saveTake(s, t, n) {
  const name = fileName(s, n, t.mime, t);
  const file = new File([t.blob], name, { type: t.mime.split(';')[0] });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast('내려받기를 시작했어요');
}

function takeSheet(s, t, n, onChange, { fresh, joined } = {}) {
  const u = URL.createObjectURL(t.blob);
  const box = el(`<div><h2>${joined ? '이어 붙였어요' : fresh ? '찍었어요' : t.joined ? '이어 붙인 영상' : (t.part ? `<span class="noi18n">${esc(t.part)}</span> · ` : '') + '<span>테이크 ' + n + '</span>'}</h2>
    <video class="tview" src="${u}" playsinline controls ${fresh ? 'autoplay' : ''}></video>
    <div class="tinfo"><span>${ic('clock', 14)}${fmt(t.dur)}</span><span>${ic('film', 14)}${t.joined ? '이어 붙임' : (t.part ? `<span class="noi18n">${esc(t.part)}</span> ` : '') + '<span>테이크 ' + n + '</span>'}</span><span>${(t.blob.size / 1048576).toFixed(1)}MB</span></div>
    <div class="row"><button class="ghost grow" data-d>${ic('trash', 18)}지우기</button><button class="btn acc grow" data-s>${ic('share', 18)}사진첩에 저장</button></div>
    ${fresh && !joined ? `<button class="ghost wide" data-r style="margin-top:8px">${ic('cam', 18)}다시 찍기</button>` : ''}</div>`);
  const sh = sheet(box, { onClose: () => setTimeout(() => URL.revokeObjectURL(u), 500) });
  $('[data-s]', box).onclick = () => saveTake(s, t, n);
  $('[data-d]', box).onclick = async () => { await takes.remove(t.id); sh.close(); onChange?.(); undoToast('테이크를 지웠어요', async () => { await takes.put(t); onChange?.(); }); };
  const r = $('[data-r]', box); if (r) r.onclick = sh.close;
  return sh;
}

/* ---------- 촬영 (스튜디오 엔진: stage.js) ---------- */
async function shootView(id, k = 0) {
  const s = await scripts.get(id);
  if (!s) { location.replace('#/'); return; }
  const title = s.title || (s.body || '').trim().split('\n')[0] || '새 대본';
  const P = splitParts(s.body); // [[이름]]으로 나뉜 파트. 2개 이상일 때만 파트 촬영
  const names = P.length > 1 ? ['전체', ...P.map(p => p.name)] : null;
  if (!names || k >= names.length) k = 0;
  const scriptFor = i => {
    if (!i) return { id: s.id, title, body: (s.body || '').trim() || '대본이 비어 있어요. 나가서 대본을 써 주세요.', sec: secOf(s) };
    const p = P[i - 1];
    // 파트 읽는 시간 = 전체 시간을 글자 수 비율로 나눈 것
    const all = Math.max(1, autoSec(s.body)), sec = Math.max(5, Math.round(secOf(s) * autoSec(p.text) / all));
    return { id: s.id, title, body: p.text, sec };
  };
  const st = mountStage({
    script: scriptFor(k), parts: names, part: k,
    onPart: i => { k = i; st.setScript(scriptFor(i), i); history.replaceState(null, '', `#/shoot/${s.id}${i ? '/' + i : ''}`); buzz(8); },
    limits: () => ({ ...plan.limits(), hq: plan.limits().hq }),
    needPro: kind => plan.needPro(kind),
    onExit: () => { location.replace('#/s/' + s.id); },
    onTake: async ({ blob, mime, dur }) => {
      const t = { id: uid(), scriptId: s.id, createdAt: Date.now(), dur, mime, blob };
      if (k) t.part = names[k];
      try { await takes.put(t); } catch { toast('저장 공간이 부족해요. 지금 바로 저장해 주세요'); }
      try { navigator.storage?.persist?.(); } catch {} // 브라우저가 영상을 함부로 지우지 않게
      const list = await takes.of(s.id);
      const done = !names || !k || P.every(p => list.some(x => x.part === p.name));
      if (done && s.status !== 'done') { s.status = 'done'; s.updatedAt = Date.now(); await scripts.put(s); }
      const sh = takeSheet(s, t, list.filter(x => x.part === t.part && !x.joined).length, null, { fresh: true });
      // 다음 씬으로 바로 넘어가기
      if (k && k < names.length - 1) {
        const nb = el(`<button class="btn acc wide" style="margin-top:8px">${ic('play', 18)}<span>다음 씬 ·</span> <span class="noi18n">${esc(names[k + 1])}</span></button>`);
        nb.onclick = () => { sh.close(); onPartGo(k + 1); };
        sh.el.lastElementChild.append(nb);
      }
    },
  });
  const onPartGo = i => { k = i; st.setScript(scriptFor(i), i); history.replaceState(null, '', `#/shoot/${s.id}/${i}`); };
  return () => { st.destroy(); document.querySelectorAll('#sheet-root > *').forEach(n => n.remove()); };
}

/* ---------- 씬 ---------- */
// 대본은 한 줄 글로 저장하고, 씬은 [[이름]] 줄로 나눈다(예전 스튜디오와 같은 방식). 화면에서는 씬마다 칸이 따로.
function toScenes(body) {
  const seg = String(body || '').split(/^[ \t]*\[\[(.+?)\]\][ \t]*$/m);
  const out = [];
  if (seg[0].trim() || seg.length === 1) out.push({ name: '', text: seg[0].replace(/^\n+|\s+$/g, '') });
  for (let i = 1; i < seg.length; i += 2) out.push({ name: seg[i].trim(), text: (seg[i + 1] || '').replace(/^\n+|\s+$/g, '') });
  if (out.length > 1 && !out[0].name) out[0].name = '';
  return out.length ? out : [{ name: '', text: '' }];
}
function fromScenes(sc) {
  if (sc.length === 1 && !sc[0].name.trim()) return sc[0].text;
  return sc.map((c, i) => `[[${c.name.trim() || '씬 ' + (i + 1)}]]\n${c.text}`).join('\n\n');
}
// 촬영용: 글이 있는 씬만. 이름 없는 첫 씬은 '씬 1'.
export function splitParts(body) {
  const seg = String(body || '').split(/^[ \t]*\[\[(.+?)\]\][ \t]*$/m);
  const out = [];
  if (seg[0].trim()) out.push({ name: '씬 1', text: seg[0].trim() });
  for (let i = 1; i < seg.length; i += 2) {
    const name = seg[i].trim(), text = (seg[i + 1] || '').trim();
    if (!text) continue;
    out.push({ name, text: `[[${name}]]\n${text}` });
  }
  return out;
}

/* ---------- 이어 붙이기 ---------- */
// 고른 테이크들을 차례로 틀면서 캔버스+소리로 다시 녹화한다. 서버·라이브러리 없이 폰 안에서. 영상 길이만큼 걸린다.
async function joinTakes(list, onP) {
  const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px'; document.body.append(v);
  const meta = t => new Promise((ok, no) => { const u = URL.createObjectURL(t.blob); v.onloadedmetadata = () => ok(u); v.onerror = () => no(new Error('영상을 열지 못했어요')); v.src = u; });
  const firstU = await meta(list[0]);
  const W = v.videoWidth || 720, H = v.videoHeight || 1280;
  URL.revokeObjectURL(firstU);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const ac = new (window.AudioContext || window.webkitAudioContext)(); await ac.resume();
  const dest = ac.createMediaStreamDestination(); ac.createMediaElementSource(v).connect(dest);
  const out = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mt = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(out, { mimeType: mt || undefined, videoBitsPerSecond: H >= 1080 || W >= 1920 ? 12e6 : 6e6, audioBitsPerSecond: 192e3 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(ok => rec.onstop = ok);
  const total = list.reduce((a, t) => a + (t.dur || 0), 0) || 1; let done = 0, raf = 0;
  const drawF = () => {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (vw) { const r = Math.min(W / vw, H / vh), dw = vw * r, dh = vh * r; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh); }
    onP?.(Math.min(1, (done + (v.currentTime || 0)) / total));
    raf = requestAnimationFrame(drawF);
  };
  rec.start(1000); drawF();
  try {
    for (const t of list) {
      const u = await meta(t);
      await new Promise((ok, no) => { v.onended = ok; v.onerror = () => no(new Error('재생이 멈췄어요')); v.currentTime = 0; v.play().catch(no); });
      done += t.dur || v.duration || 0; URL.revokeObjectURL(u);
    }
  } finally {
    await new Promise(r => setTimeout(r, 120));
    cancelAnimationFrame(raf); rec.stop(); await stopped;
    out.getTracks().forEach(x => x.stop()); ac.close(); v.remove();
  }
  const blob = new Blob(chunks, { type: (mt || 'video/webm').split(';')[0] });
  return { blob, mime: blob.type, dur: total };
}

/* ---------- 소개(첫 화면) ---------- */
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => isIOS() || /Android/.test(navigator.userAgent);
function installSteps() {
  return `<div class="steps">
    <div class="step"><b>아이폰 · 아이패드</b><span>사파리 아래(아이패드는 위) <i>${ic('share', 14)}공유</i> → <i>홈 화면에 추가</i></span></div>
    <div class="step"><b>갤럭시 · 안드로이드</b><span>크롬 오른쪽 위 <i>⋮</i> → <i>홈 화면에 추가</i> 또는 <i>앱 설치</i></span></div>
    <div class="step"><b>PC (크롬 · 엣지)</b><span>주소창 오른쪽 <i>설치</i> 아이콘을 누르거나 그냥 즐겨찾기에 두고 써요</span></div></div>`;
}
function installTip() {
  if (standalone() || !isMobile() || flag('hideInstall')) return '';
  return `<div class="itip" id="itip"><div class="grow"><b>${ic('devices', 16)}홈 화면에 추가하면 앱처럼 써요</b>
    <span>${isIOS() ? '사파리 공유 버튼 → 홈 화면에 추가' : '크롬 ⋮ 메뉴 → 홈 화면에 추가'} · 전체 화면으로 열리고 찍은 영상도 더 안전하게 보관돼요</span></div>
    <button class="mini" onclick="localStorage.setItem('prompter:hideInstall','1');this.closest('.itip').remove()" aria-label="닫기">${ic('x', 18)}</button></div>`;
}
const FAQ = [
  ['찍은 영상이 서버에 올라가나요?', '아니요. 대본과 영상은 이 기기 브라우저에만 저장돼요. 카메라 화면도 밖으로 나가지 않아요.'],
  ['가입해야 하나요?', '아니요. 열자마자 바로 써요. 프로를 쓰면 이름·메일 대신 16자리 복구 코드가 생겨요.'],
  ['아이폰에서도 되나요?', '사파리에서 돼요. 홈 화면에 추가해 두면 영상이 더 오래 안전하게 보관돼요.'],
  ['영상은 어떻게 꺼내요?', '찍고 나서 저장을 누르면 폰은 사진첩·파일로, PC는 다운로드 폴더로 저장돼요.'],
  ['해지는 어떻게 해요?', '구독 관리에서 해지하기를 두 번 누르면 끝이에요. 남은 기간은 그대로 쓰고, 결제 후 7일 안이면 전액 환불해 드려요.'],
  ['인터넷이 없어도 되나요?', '한 번 열어 두면 비행기 모드에서도 대본 보고 찍을 수 있어요.'],
];
function helloView() {
  flag('hello', '1');
  document.body.classList.add('hello-on');
  const F = [
    ['text', '카메라 위에 대본', '렌즈 바로 아래 읽는 줄. 정한 시간에 맞춰 흘러가요'],
    ['film', '씬으로 나눠 찍기', '씬 추가만 누르면 끝. 씬마다 따로 찍고 ★로 골라요'],
    ['share', '한 번에 이어 붙이기', '고른 테이크를 순서대로 붙여 영상 하나로 저장'],
    ['folder', '프로젝트로 정리', '영상 기획을 폴더로 묶고 쓰는 중·촬영 대기·완료'],
    ['flip', '가로 16:9 · 세로 9:16', '릴스·쇼츠·유튜브 비율 그대로 잘라 저장'],
    ['mic', '목소리 따라가기', '말하는 속도에 맞춰 대본이 따라와요 (프로)'],
  ];
  view.innerHTML = `<div class="hello">
    <div class="hbar"><button class="ghost sm" data-lang aria-label="언어">${ic('globe', 16)}<span class="noi18n">${LANGS[lang()]}</span></button></div>
    <section class="hero">
      <img class="hmark" src="icon.svg" alt="">
      <h1>프롬프리에딧</h1><p class="en">PROMPRI EDIT</p>
      <p class="lead">대본을 카메라 위에 띄우고,<br>씬별로 찍고, 한 번에 이어 붙여요.</p>
      <div class="cta"><a class="btn acc" href="#/" id="go1">${ic('cam', 18)}무료로 시작하기</a><a class="ghost" href="#/plan">${ic('star', 16)}프로 보기</a></div>
      <p class="tip c">설치 없이 브라우저에서 바로 · 폰 · 아이패드 · PC</p>
    </section>
    <section class="feat">${F.map(([i, t, d], k) => `<div class="fc" style="animation-delay:${k * 50}ms"><span class="fi">${ic(i, 22)}</span><b>${t}</b><span>${d}</span></div>`).join('')}</section>
    <section class="nums"><div><b>3</b><span>무료 대본</span></div><div><b>3분</b><span>무료 한 번 녹화</span></div><div><b>0</b><span>서버로 가는 영상</span></div></section>
    <section class="howto price2"><h2>${ic('star', 20)}요금</h2>
      <div class="pcols"><div class="pc"><b class="pn">무료</b><div class="pv2">0원</div><span>가입 없이 바로</span></div>
        <div class="pc pro"><b class="pn">프로</b><div class="pv2">${plan.priceTag()}</div><span>언제든 해지 · 7일 안 전액 환불</span></div></div>
      ${plan.perkTable()}
      <a class="btn acc wide" href="#/plan" style="margin-top:12px">${ic('star', 18)}프로 보기</a></section>
    <section class="howto faq"><h2>${ic('help', 20)}자주 묻는 것</h2>
      ${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>
    <section class="howto"><h2>${ic('devices', 20)}앱처럼 쓰기</h2>
      <p>폰이랑 아이패드는 <b>홈 화면에 추가</b>하면 앱처럼 쓸 수 있어요. 전체 화면으로 열리고, 찍은 영상도 브라우저에 더 오래 안전하게 보관돼요.</p>
      ${installSteps()}</section>
    <section class="howto"><h2>${ic('play', 20)}이렇게 써요</h2>
      <ol class="flow"><li><b>대본 쓰기</b>붙여넣기 OK. 길면 씬 추가로 나눠요</li><li><b>찍기</b>빨간 버튼 → 3·2·1 → 읽기만 하면 끝</li><li><b>고르고 붙이기</b>씬마다 ★ 고르고 이어 붙이기</li><li><b>저장</b>사진첩·파일로 바로 저장</li></ol></section>
    <a class="btn acc wide" href="#/">${ic('cam', 18)}지금 시작하기</a>
    <footer class="hfoot"><a class="mailto" href="mailto:${CONTACT}?subject=${encodeURIComponent('[PROMPRI EDIT] 문의')}">${ic('mail', 15)}<span>문의</span></a><span class="noi18n">${CONTACT}</span><button class="linkbtn" data-lang>${ic('globe', 15)}<span class="noi18n">${LANGS[lang()]}</span></button></footer>
    ${legalLinks()}${bizLine()}
  </div>`;
  const off = () => document.body.classList.remove('hello-on');
  addEventListener('hashchange', off, { once: true });
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

/* ---------- 언어 고르기 ---------- */
function langSheet() {
  const cur = langPref();
  const box = el(`<div><h2>언어</h2><div class="plist">
    <button data-l="auto" aria-pressed="${cur === 'auto'}">${ic('globe', 16)}<span>자동 (브라우저 따라감)</span></button>
    ${Object.entries(LANGS).map(([k, n]) => `<button data-l="${k}" aria-pressed="${cur === k}"><b class="lcode noi18n">${k.toUpperCase()}</b><span class="noi18n">${n}</span></button>`).join('')}</div></div>`);
  const sh = sheet(box);
  box.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { setLang(b.dataset.l); sh.close(); setTimeout(() => location.reload(), 250); });
}
document.addEventListener('click', e => { if (e.target.closest('[data-lang]')) { e.preventDefault(); langSheet(); } });

const SAMPLES = {
  ko: [SAMPLE, '첫 대본 예시'],
  en: ['[[Hello]]\nHi everyone! Today I’ll show you the work routine I use every single day.\n\n[[Routine]]\nFirst thing in the morning, I write down just three things to do. Write more, and I end up doing none.\n\nThen I put on music I love and do only one thing for an hour.\n\n[[Outro]]\nWhat’s your routine? Tell me in the comments!', 'Sample script'],
  ja: ['[[あいさつ]]\nみなさん、こんにちは。今日は私が毎日やっている作業ルーティンを紹介します。\n\n[[ルーティン]]\n朝起きたら、まず今日やることを3つだけ書きます。多く書くと逆にひとつもできないんです。\n\nそれから好きな音楽をかけて、1時間ひとつのことだけをします。\n\n[[おわり]]\nみなさんのルーティンは？コメントで教えてください！', '台本の例'],
  zh: ['[[开场]]\n大家好！今天给大家看看我每天都在用的工作习惯。\n\n[[习惯]]\n早上起床后，我先只写下今天要做的三件事。写多了反而一件都做不完。\n\n然后放上喜欢的音乐，一小时只做一件事。\n\n[[结尾]]\n你有什么习惯？在评论里告诉我吧！', '台词示例'],
  es: ['[[Hola]]\n¡Hola a todos! Hoy os enseño la rutina de trabajo que uso cada día.\n\n[[Rutina]]\nNada más levantarme, apunto solo tres cosas que hacer. Si apunto más, no hago ninguna.\n\nLuego pongo música que me gusta y hago una sola cosa durante una hora.\n\n[[Final]]\n¿Cuál es tu rutina? ¡Cuéntamelo en los comentarios!', 'Guion de ejemplo'],
};

(async () => {
  startI18n();
  const moved = await migrateStudio();
  if (!flag('seeded')) { flag('seeded', '1'); if (!(await scripts.all()).length) { const [b, ti] = SAMPLES[lang()] || SAMPLES.ko; await newScript(b, ti); } }
  if (moved) setTimeout(() => toast(`스튜디오에서 쓰던 대본 ${moved}개를 옮겨 왔어요`), 600);
  // 처음 온 사람은 소개부터
  if (!flag('hello') && (!location.hash || location.hash === '#/') && !standalone()) history.replaceState(null, '', '#/hello');
  route();
  plan.boot();
  plan.onChange(() => { if ((location.hash || '#/') === '#/') route(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
