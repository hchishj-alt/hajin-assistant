import { h, ic, clear, toast, modal } from './ui.js';
import * as db from './db.js';
import * as store from './store.js';
import { VERSION } from './version.js';
import './install.js';

// 메뉴 구성 (모듈은 필요할 때 불러옴)
export const MODULES = [
  { id: 'today', title: '오늘', icon: 'home', group: '하루', tab: 1 },
  { id: 'assistant', title: '비서', icon: 'sparkles', group: '하루', tab: 3 },
  { id: 'inbox', title: '확인 대기함', icon: 'inbox', group: '하루', tab: 4, short: '대기함' },
  { id: 'calendar', title: '캘린더', icon: 'calendar', group: '시간', tab: 2, short: '일정·할 일' },
  { id: 'tasks', title: '할 일', icon: 'check2', group: '시간', short: '할 일' },
  { id: 'meetings', title: '회의록', icon: 'mic', group: '작업' },
  { id: 'board', title: '마인드맵 회의', icon: 'share', group: '작업', short: '마인드맵' },
  { id: 'plan', title: '기획 보드', icon: 'bulb', group: '작업', short: '기획' },
  { id: 'prompts', title: '프롬프트 스튜디오', icon: 'type', group: '작업', short: '프롬프트' },
  { id: 'studio', title: 'SNS 스튜디오', icon: 'film', group: '작업', short: 'SNS' },
  { id: 'archive', title: '레퍼런스', icon: 'image', group: '작업', short: '레퍼런스' },
  { id: 'figma', title: '피그마 정리', icon: 'layers', group: '작업', short: '피그마' },
  { id: 'talk', title: '메신저', icon: 'msg', group: '사람' },
  { id: 'people', title: '인맥 · 연락처', icon: 'users', group: '사람', short: '인맥' },
  { id: 'team', title: '팀 · 일정 조율', icon: 'grid', group: '사람', short: '팀' },
  { id: 'money', title: '비용 처리', icon: 'wallet', group: '회사', short: '비용' },
  { id: 'shop', title: '구매 목록', icon: 'cart', group: '회사', short: '구매' },
  { id: 'vendors', title: '업체 목록', icon: 'briefcase', group: '회사', short: '업체' },
  { id: 'radar', title: '지원사업 · 정보 랭킹', icon: 'trend', group: '회사', short: '랭킹' },
  { id: 'startup', title: '스타트업 PM', icon: 'rocket', group: '회사', short: '스타트업' },
  { id: 'look', title: '꾸미기', icon: 'palette', group: '시스템' },
  { id: 'admin', title: '관리자', icon: 'shield', group: '시스템', adminOnly: true },
  { id: 'dev', title: '앱 개선 요청', icon: 'zap', group: '시스템', short: '개선 요청' },
  { id: 'settings', title: '설정', icon: 'sliders', group: '시스템' },
  { id: 'health', title: '자가 점검', icon: 'shield', group: '시스템' },
  { id: 'menu', title: '메뉴', icon: 'menu', hidden: true, tab: 5 },
];
const cache = {};
async function load(id) {
  if (!cache[id]) cache[id] = (await import(`../modules/${id}.js`)).default;
  return cache[id];
}

let current = null, cleanup = null, lastHash = '';
export function go(route) { const h = '#/' + route; if (location.hash === h) render(); else location.hash = h; }
function parse() {
  const [id, ...rest] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  return { id: MODULES.some(m => m.id === id) ? id : 'today', params: rest.map(s => { try { return decodeURIComponent(s); } catch { return s; } }) };
}

let seq = 0;
async function render() {
  const my = ++seq;
  const { id, params } = parse();
  const view = document.getElementById('view');
  markNav(id);
  try { cleanup && cleanup(); } catch { }
  cleanup = null;
  const mod = await load(id).catch(e => { store.logError(e, 'load:' + id); return null; });
  if (my !== seq) return; // 더 새 화면 요청이 왔으면 이건 버림
  const sameView = current === id && location.hash === lastHash;
  const keepY = sameView ? window.scrollY : 0;
  lastHash = location.hash;
  clear(view);
  // 화면마다 새 상자: 늦게 끝난 이전 화면이 새 화면에 섞이지 않게
  const page = h('div.page');
  view.append(page);
  if (!sameView) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
  if (!mod) { page.append(h('div.empty', '화면을 불러오지 못했어요. 새로고침해 주세요.')); return; }
  current = id;
  import('./helper.js').then(H => H.visit(id)).then(up => { if (up) buildNav(); }).catch(() => { });   /* 자주 여는 화면은 메뉴 앞쪽으로 */
  try { const c = (await mod.render(page, params)) || null; if (my === seq) cleanup = c; else { try { c && c(); } catch { } } }
  catch (e) { console.error(e); store.logError(e, 'render:' + id); page.append(h('div.card', h('h3', '이 화면에서 문제가 생겼어요'), h('p.muted.small', String(e.message)), h('p.faint.tiny', '자가 점검 메뉴에 기록해 뒀어요.'))); }
  if (my !== seq) return;
  view.focus({ preventScroll: true });
  window.scrollTo(0, keepY);
}
export function refresh() { render(); }

function markNav(id) {
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === id || (id === 'tasks' && a.dataset.nav === 'calendar' && !!a.closest('#tabbar')) || (id !== 'today' && id !== 'tasks' && a.dataset.nav === 'menu' && !MODULES.find(m => m.id === id)?.tab)));
  { const box = document.querySelector(`#nav .navlink[data-nav="${id}"]`)?.closest('.navg'); if (box && !box.classList.contains('open') && navFold[box.dataset.g] !== true) { /* 직접 접어 둔 묶음은 다시 열지 않음 */ box.classList.add('open'); box.previousElementSibling?.setAttribute('aria-expanded', 'true'); } }
}

let navFold = {};
export async function buildNav() {
  const adm = await (await import('./admin.js')).isAdmin();
  const nav = document.getElementById('nav');
  clear(nav);
  nav.append(h('div.brand', h('img', { src: 'icons/icon.svg', alt: '' }), '하진 비서'));
  nav.append(h('button.searchbtn', { onclick: openPalette }, ic('search', 16), h('span.lbl', '검색·명령'), h('kbd', navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K')));
  let g = '', box = null;
  const hid = (await db.kvGet('look', null))?.hidden || [];
  // 카테고리별로 접기: 하루는 늘 펼침, 나머지는 접어 두고 지금 보는 화면의 묶음만 열림 (누르면 기억)
  const fold = await db.kvGet('nav:fold', {}); navFold = fold; const cur = (location.hash.replace(/^#\//, '').split('/')[0]) || 'today';
  let curGroup = '';
  // 메뉴 줄이기: 하루·시간은 그대로, 나머지는 내 역할에서 주로 쓰는 것 + 자주 연 것만 "자주 쓰는 것"으로, 그 밖은 "더보기"로 접음
  const pins = await (await import('./helper.js')).pinned();
  const shown = MODULES.filter(m => !m.hidden && !hid.includes(m.id) && (!m.adminOnly || adm)).map(m => ({ ...m, group: ['하루', '시간'].includes(m.group) ? m.group : pins.has(m.id) ? '자주 쓰는 것' : '더보기' }));
  const ORDER = ['하루', '시간', '자주 쓰는 것', '더보기']; shown.sort((x, y) => ORDER.indexOf(x.group) - ORDER.indexOf(y.group)); curGroup = shown.find(m => m.id === cur)?.group;
  for (const m of shown) {
    if (m.group !== g) {
      g = m.group; const name = g; const open = fold[name] === false || (fold[name] !== true && (name === '하루' || name === '자주 쓰는 것' || name === curGroup)); /* 직접 접거나 편 건 그대로 기억 */
      const outer = h('div.navg' + (open ? '.open' : ''), { 'data-g': name }); box = h('div.navg-in'); outer.append(box); /* 안쪽 한 겹이 있어야 접었을 때 높이가 0이 됨 */
      const head = h('button.grp', { 'aria-expanded': String(open), onclick: async () => { const b2 = head.nextElementSibling; const now = !b2.classList.contains('open'); b2.classList.toggle('open', now); head.setAttribute('aria-expanded', String(now)); const f = await db.kvGet('nav:fold', {}); f[name] = !now; navFold = f; await db.kvSet('nav:fold', f); } }, h('span', name), ic('down', 12));
      nav.append(head, outer);
    }
    const a = h('a.navlink', { href: '#/' + m.id, 'data-nav': m.id }, ic(m.icon), h('span.grow', m.title));
    if (m.id === 'inbox') a.append(h('span.badge#inbox-badge.hide'));
    if (m.id === 'talk') a.append(h('span.badge#talk-badge.hide'));
    box.append(a);
  }
  const tb = document.getElementById('tabbar');
  clear(tb);
  for (const m of MODULES.filter(m => m.tab).sort((a, b) => a.tab - b.tab)) {
    const a = h('a', { href: '#/' + m.id, 'data-nav': m.id }, h('span.tabic', ic(m.icon, 22), m.id === 'inbox' ? h('span.badge#inbox-badge-m.hide') : null), m.short || m.title);
    if (m.id === 'assistant') a.classList.add('center');
    tb.append(a);
  }
  updateBadge();
}

export async function updateBadge() {
  const n = (await store.drafts()).length;
  { const u = (await db.list('dms')).filter(d => !d.mine && !d.readAt).length; const tb = document.getElementById('talk-badge'); if (tb) { tb.textContent = u; tb.classList.toggle('hide', !u); } }
  for (const id of ['inbox-badge', 'inbox-badge-m']) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.textContent = n > 99 ? '99+' : n;
    b.classList.toggle('hide', !n);
    if (n) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  }
}

// ── 명령 팔레트 (Raycast·Linear 방식): 어디서든 ⌘K → 검색/이동/빠른 입력 ──
let paletteOpen = false;
export async function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;
  const brain = await import('./brain.js');
  const docs = await store.corpus();
  const inp = h('input.in.pal-in', { placeholder: '찾기, 메뉴 이동, 또는 "내일 3시 회의"처럼 바로 입력', autocomplete: 'off' });
  const res = h('div.pal-res');
  let sel = 0, items = [];
  const close = modal('검색·명령', h('div', inp, res), { onClose: () => (paletteOpen = false) });
  const draw = () => {
    const q = inp.value.trim();
    items = []; let made = null;
    if (q) {
      const parsed = brain.interpretCapture(q).filter(x => !['query', 'nav'].includes(x.kind));
      if (parsed.length) made = { icon: 'zap', title: `적어 두기: ${parsed.map(p => p.label).join(', ')}`, sub: parsed.map(p => p.data.title || p.data.name).join(' / '), run: async () => { for (const p of parsed) await store.draft(p.kind, p.data, { source: p.src || q, confidence: p.confidence, origin: 'palette' }); updateBadge(); toast('확인 대기함에 넣었어요', { label: '보기', fn: () => go('inbox') }); } };
    }
    const ql = q.toLowerCase();
    for (const m of MODULES.filter(m => !m.hidden && (!m.adminOnly || !document.body.classList.contains('not-admin')) && (!q || m.title.includes(q) || m.title.replace(/\s/g, '').includes(q.replace(/\s/g, '')) || m.id.includes(ql)))) items.push({ icon: m.icon, title: m.title, sub: '메뉴로 이동', run: () => go(m.id) });
    if (made) { if (items.length && q.length <= 6) items.push(made); else items.unshift(made); } /* 메뉴 이름을 친 거면 이동이 먼저 */
    if (q) for (const d of brain.similar(q, docs, 8)) items.push({ icon: store.KINDS[Object.keys(store.KINDS).find(k => store.KINDS[k].col === d.col)]?.icon || 'file', title: d.title || '(제목 없음)', sub: d.text.slice(0, 70), run: () => go(d.route + '/' + d.id) });
    sel = Math.min(sel, Math.max(0, items.length - 1));
    clear(res);
    items.slice(0, 14).forEach((it, i) => res.append(h('div.li.click' + (i === sel ? '.sel' : ''), { onclick: () => { close(); it.run(); } }, ic(it.icon), h('div.grow', h('div.t', it.title), h('div.faint.tiny', it.sub)))));
    if (!items.length) res.append(h('div.empty', '결과가 없어요'));
  };
  let palT; inp.addEventListener('input', () => { sel = 0; clearTimeout(palT); palT = setTimeout(draw, 140); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && !e.isComposing && items[sel]) { e.preventDefault(); clearTimeout(palT); draw(); if (items[sel]) { close(); items[sel].run(); } }
  });
  draw();
}

// ── 테마 ──
export { applyTheme } from './theme.js';
import { applyTheme } from './theme.js';

// ── 자동 업데이트 ──
async function setupSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    // 앱을 막 열어서 아직 아무것도 안 눌렀으면 묻지 않고 새 버전으로 바꿈(고친 것이 바로 닿게). 쓰는 중이면 알림만 띄움
    let touched = false; for (const ev of ['pointerdown', 'keydown', 'input']) addEventListener(ev, () => { touched = true; }, { once: true, capture: true });
    const prompt = w => { if (!touched && navigator.serviceWorker.controller) w.postMessage('skip'); else toast('새 버전이 준비됐어요', { label: '업데이트', fn: () => { w.postMessage('skip'); } }); };
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); });
    });
    let reloaded = false; const hadController = !!navigator.serviceWorker.controller; // 처음 설치될 때는 새로고침할 필요가 없다
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && hadController) { reloaded = true; location.reload(); } });
    if (reg.waiting) prompt(reg.waiting);
    addEventListener('hashchange', () => { if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage('skip'); }); // 알림을 놓쳤어도 화면을 옮길 때 새 버전으로 (적던 것이 없는 순간)
    setInterval(() => reg.update().catch(() => { }), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => { }));
  } catch (e) { store.logError(e, 'sw'); }
}

// 글꼴은 화면을 막지 않게 나중에 붙임 (CDN이 느려도 첫 화면이 바로 뜸)
function lateFont() { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'; document.head.append(l); }
// 눌러서 여는 줄·칸은 키보드로도 닿게 (Tab으로 가서 Enter)
function kbAccess() {
  const NATIVE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/;
  const mark = () => document.querySelectorAll('.click:not([tabindex]),[data-kb]:not([tabindex]),.cal .d:not([tabindex])').forEach(el => { if (NATIVE.test(el.tagName)) return; el.tabIndex = 0; el.setAttribute('role', 'button'); });
  let t; new MutationObserver(() => { clearTimeout(t); t = setTimeout(mark, 150); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('keydown', e => { const el = e.target; if ((e.key === 'Enter' || e.key === ' ') && !e.isComposing && el?.matches?.('[role=button][tabindex]') && !NATIVE.test(el.tagName)) { e.preventDefault(); el.click(); } });
}

async function boot() {
  lateFont(); kbAccess();
  window.addEventListener('error', e => store.logError(e.error || e.message, 'window'));
  window.addEventListener('unhandledrejection', e => { if (/관리자만|올린 사람과 관리자/.test(e.reason?.message || '')) { toast(e.reason.message); e.preventDefault(); return; } store.logError(e.reason, 'promise'); if (/QuotaExceeded|InvalidState|저장소/.test(String(e.reason?.name || '') + String(e.reason?.message || ''))) toast('저장하지 못했어요. 기기 저장 공간이나 브라우저 설정을 확인해 주세요.'); });
  (await import('./admin.js')).install();
  await (await import('./labels.js')).load();
  await applyTheme();
  if (!(await db.kvGet('onboarded', false)) && (await db.kvGet('name', null)) == null) await db.kvSet('askName', true); /* 새 기기에서는 이름부터 물어봄 */
  if (!location.hash || location.hash === '#/') { const st = (await db.kvGet('look', null))?.start; if (st && st !== 'today' && MODULES.some(m => m.id === st)) history.replaceState(null, '', '#/' + st); }
  if (/^#k=/.test(location.hash) || sessionStorage.getItem('hajin:pk')) await (await import('./keyshare.js')).takeFromHash();
  await store.loadLearned();
  await buildNav();
  window.addEventListener('hashchange', async () => { if (/^#k=/.test(location.hash)) await (await import('./keyshare.js')).takeFromHash(); render(); });
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });
  db.onChange(col => { if (col === 'drafts') updateBadge(); });
  import('./gcal.js').then(g => g.watch());
  await render();
  updateBadge();
  db.persist();
  setupSW();
  store.repairTitles().catch(() => { }); // 예전 버전이 잘못 만든 제목(“만들어기”)을 한 번 고침
  import('./helper.js').then(H => H.start()).catch(e => store.logError(e, 'helper'));   /* 어느 화면에서든 비서 부르기 */
  import('./alarm.js').then(A => A.start()); import('./push.js').then(P => P.start());   /* 알림: 일정 전, 마감, 아침 브리핑, 닫힌 앱 푸시 */
  // 동기화 (설정에서 로그인했을 때만). 다른 기기·팀원이 바꾼 게 오면 입력 중이 아닐 때 화면 새로 그림
  import('./sync.js').then(s => { let was = ''; s.onState(async st => { if (st.status === was) return; was = st.status; (await import('./admin.js')).clearCache(); await buildNav(); document.body.classList.toggle('not-admin', !(await (await import('./admin.js')).isAdmin())); }); return s.start(); }).catch(e => store.logError(e, 'sync'));
  // 피그마 실시간 감시 (토큰 있을 때만, 바뀐 파일만 다시 읽음)
  import('./figma-api.js').then(async F => { if (await F.getToken()) F.watch(f => { toast(`피그마 "${f.name}"이 바뀌어서 다시 정리했어요`, { label: '보기', fn: () => go('figma/' + f.id) }); updateBadge(); }); }).catch(e => store.logError(e, 'figma'));
  window.addEventListener('hajin:dm', async e => {
    const d = e.detail.item; updateBadge();
    if (await db.get('chatdm-' + d.sid)) return;
    const cm = await db.put('chat', { id: 'chatdm-' + d.sid, role: 'bot', text: `${d.otherName} 님이 보낸 메시지예요: “${d.body}”`, dm: { id: d.id, from: d.other, name: d.otherName, body: d.body } });
    window.dispatchEvent(new CustomEvent('hajin:chat', { detail: cm }));
    if (!e.detail.live && Date.now() - new Date(d.createdAt) > 10 * 60 * 1000) return; // 오래된 건 조용히
    toast(`${d.otherName}: ${d.body.slice(0, 40)}`, { label: '보기', fn: () => go('talk/' + d.other) });
    try { if (document.visibilityState !== 'visible' && Notification?.permission === 'granted') (await navigator.serviceWorker?.ready)?.showNotification(`${d.otherName} 님의 메시지`, { body: d.body.slice(0, 120), tag: 'dm-' + d.other, icon: 'icons/icon-192.png', data: { route: 'talk/' + d.other } }); } catch { }
  });
  window.addEventListener('hajin:remote', () => {
    updateBadge(); applyTheme();
    const a = document.activeElement;
    if (document.querySelector('.modal-bg') || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || document.querySelector('.avail.painting') || document.querySelector('[data-live]')) return; // 녹음·작성 중인 화면은 건드리지 않음
    render();
  });
  if (!(await db.kvGet('onboarded', false))) { await db.kvSet('onboarded', true); (await import('./seed.js')).welcome(); }
}
boot().catch(e => { console.error(e); const v = document.getElementById('view') || document.body; const box = document.createElement('div'); box.style.cssText = 'padding:24px;line-height:1.7'; box.textContent = '앱을 열지 못했어요. 사생활 보호(시크릿) 창이거나 브라우저가 기기 저장소를 막아 둔 것 같아요. 일반 창에서 다시 열어 주세요. (' + (e && e.message || e) + ')'; v.append(box); });
