import { h, ic, clear, toast, modal } from './ui.js';
import * as db from './db.js';
import * as store from './store.js';
import { VERSION } from './version.js';

// 메뉴 구성 (모듈은 필요할 때 불러옴)
export const MODULES = [
  { id: 'today', title: '오늘', icon: 'home', group: '하루', tab: 1 },
  { id: 'assistant', title: '비서', icon: 'sparkles', group: '하루', tab: 3 },
  { id: 'inbox', title: '확인 대기함', icon: 'inbox', group: '하루', tab: 4, short: '대기함' },
  { id: 'calendar', title: '캘린더', icon: 'calendar', group: '시간', tab: 2 },
  { id: 'tasks', title: '할 일', icon: 'check2', group: '시간', short: '할 일' },
  { id: 'meetings', title: '회의록', icon: 'mic', group: '작업' },
  { id: 'board', title: '마인드맵 회의', icon: 'share', group: '작업', short: '마인드맵' },
  { id: 'plan', title: '기획 보드', icon: 'bulb', group: '작업', short: '기획' },
  { id: 'studio', title: 'SNS 스튜디오', icon: 'film', group: '작업', short: 'SNS' },
  { id: 'archive', title: '레퍼런스', icon: 'image', group: '작업', short: '레퍼런스' },
  { id: 'figma', title: '피그마 정리', icon: 'layers', group: '작업', short: '피그마' },
  { id: 'people', title: '인맥 · 연락처', icon: 'users', group: '사람', short: '인맥' },
  { id: 'team', title: '팀 · 일정 조율', icon: 'grid', group: '사람', short: '팀' },
  { id: 'money', title: '비용 처리', icon: 'wallet', group: '회사', short: '비용' },
  { id: 'shop', title: '구매 목록', icon: 'cart', group: '회사', short: '구매' },
  { id: 'radar', title: '지원사업 · 정보 랭킹', icon: 'trend', group: '회사', short: '랭킹' },
  { id: 'startup', title: '스타트업 PM', icon: 'rocket', group: '회사', short: '스타트업' },
  { id: 'look', title: '꾸미기', icon: 'palette', group: '시스템' },
  { id: 'admin', title: '관리자', icon: 'shield', group: '시스템', adminOnly: true },
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
  return { id: MODULES.some(m => m.id === id) ? id : 'today', params: rest.map(decodeURIComponent) };
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
  try { const c = (await mod.render(page, params)) || null; if (my === seq) cleanup = c; else { try { c && c(); } catch { } } }
  catch (e) { console.error(e); store.logError(e, 'render:' + id); page.append(h('div.card', h('h3', '이 화면에서 문제가 생겼어요'), h('p.muted.small', String(e.message)), h('p.faint.tiny', '자가 점검 메뉴에 기록해 뒀어요.'))); }
  if (my !== seq) return;
  view.focus({ preventScroll: true });
  window.scrollTo(0, keepY);
}
export function refresh() { render(); }

function markNav(id) {
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === id || (id !== 'today' && a.dataset.nav === 'menu' && !MODULES.find(m => m.id === id)?.tab)));
}

export async function buildNav() {
  const adm = await (await import('./admin.js')).isAdmin();
  const nav = document.getElementById('nav');
  clear(nav);
  nav.append(h('div.brand', h('img', { src: 'icons/icon.svg', alt: '' }), '하진 비서'));
  nav.append(h('button.searchbtn', { onclick: openPalette }, ic('search', 16), h('span.lbl', '검색·명령'), h('kbd', navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K')));
  let g = '';
  const hid = (await db.kvGet('look', null))?.hidden || [];
  for (const m of MODULES.filter(m => !m.hidden && !hid.includes(m.id) && (!m.adminOnly || adm))) {
    if (m.group !== g) { g = m.group; nav.append(h('div.grp', g)); }
    const a = h('a.navlink', { href: '#/' + m.id, 'data-nav': m.id }, ic(m.icon), h('span.grow', m.title));
    if (m.id === 'inbox') a.append(h('span.badge#inbox-badge.hide'));
    nav.append(a);
  }
  const tb = document.getElementById('tabbar');
  clear(tb);
  for (const m of MODULES.filter(m => m.tab).sort((a, b) => a.tab - b.tab)) {
    const a = h('a', { href: '#/' + m.id, 'data-nav': m.id }, h('span.tabic', ic(m.icon, 22), m.id === 'inbox' ? h('span.badge#inbox-badge-m.hide') : null), m.short || m.title);
    if (m.id === 'assistant') a.classList.add('center');
    tb.append(a);
  }
}

export async function updateBadge() {
  const n = (await store.drafts()).length;
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
    items = [];
    if (q) {
      const parsed = brain.interpret(q).filter(x => !['query', 'nav'].includes(x.kind));
      if (parsed.length) items.push({ icon: 'zap', title: `${parsed.map(p => p.label).join(' + ')}로 만들기`, sub: parsed.map(p => p.data.title || p.data.name).join(' / '), run: async () => { for (const p of parsed) await store.draft(p.kind, p.data, { source: p.src || q, confidence: p.confidence, origin: 'palette' }); updateBadge(); toast('확인 대기함에 넣었어요', { label: '보기', fn: () => go('inbox') }); } });
    }
    const ql = q.toLowerCase();
    for (const m of MODULES.filter(m => !m.hidden && (!q || m.title.includes(q) || m.id.includes(ql)))) items.push({ icon: m.icon, title: m.title, sub: '메뉴로 이동', run: () => go(m.id) });
    if (q) for (const d of brain.similar(q, docs, 8)) items.push({ icon: store.KINDS[Object.keys(store.KINDS).find(k => store.KINDS[k].col === d.col)]?.icon || 'file', title: d.title || '(제목 없음)', sub: d.text.slice(0, 70), run: () => go(d.route + '/' + d.id) });
    sel = Math.min(sel, Math.max(0, items.length - 1));
    clear(res);
    items.slice(0, 14).forEach((it, i) => res.append(h('div.li.click' + (i === sel ? '.sel' : ''), { onclick: () => { close(); it.run(); } }, ic(it.icon), h('div.grow', h('div.t', it.title), h('div.faint.tiny', it.sub)))));
    if (!items.length) res.append(h('div.empty', '결과가 없어요'));
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) { e.preventDefault(); close(); items[sel].run(); }
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
    const prompt = w => toast('새 버전이 준비됐어요', { label: '업데이트', fn: () => { w.postMessage('skip'); } });
    if (reg.waiting) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    setInterval(() => reg.update().catch(() => { }), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => { }));
  } catch (e) { store.logError(e, 'sw'); }
}

// ── 알림 (오늘 일정 10분 전) ──
const notified = new Set();
async function tickReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const evs = await store.eventsOn(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  for (const e of evs) {
    if (!e.start || notified.has(e.id)) continue;
    const [hh, mm] = e.start.split(':').map(Number);
    const diff = (hh * 60 + mm) - (now.getHours() * 60 + now.getMinutes());
    if (diff <= (e.remind ?? 10) && diff >= 0) {
      notified.add(e.id);
      try { (await navigator.serviceWorker?.getRegistration())?.showNotification(e.title, { body: `${e.start} 시작${e.place ? ' · ' + e.place : ''}`, icon: 'icons/icon-192.png', tag: e.id }) || new Notification(e.title, { body: e.start }); } catch { }
    }
  }
}

async function boot() {
  window.addEventListener('error', e => store.logError(e.error || e.message, 'window'));
  window.addEventListener('unhandledrejection', e => { if (/관리자만|올린 사람과 관리자/.test(e.reason?.message || '')) { toast(e.reason.message); e.preventDefault(); return; } store.logError(e.reason, 'promise'); });
  (await import('./admin.js')).install();
  await (await import('./labels.js')).load();
  await applyTheme();
  if (!location.hash || location.hash === '#/') { const st = (await db.kvGet('look', null))?.start; if (st && st !== 'today' && MODULES.some(m => m.id === st)) history.replaceState(null, '', '#/' + st); }
  await store.loadLearned();
  await buildNav();
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });
  db.onChange(col => { if (col === 'drafts') updateBadge(); });
  await render();
  updateBadge();
  db.persist();
  setupSW();
  setInterval(tickReminders, 60 * 1000); tickReminders();
  // 동기화 (설정에서 로그인했을 때만). 다른 기기·팀원이 바꾼 게 오면 입력 중이 아닐 때 화면 새로 그림
  import('./sync.js').then(s => { let was = ''; s.onState(async st => { if (st.status === was) return; was = st.status; (await import('./admin.js')).clearCache(); await buildNav(); document.body.classList.toggle('not-admin', !(await (await import('./admin.js')).isAdmin())); }); return s.start(); }).catch(e => store.logError(e, 'sync'));
  // 피그마 실시간 감시 (토큰 있을 때만, 바뀐 파일만 다시 읽음)
  import('./figma-api.js').then(async F => { if (await F.getToken()) F.watch(f => { toast(`피그마 "${f.name}"이 바뀌어서 다시 정리했어요`, { label: '보기', fn: () => go('figma/' + f.id) }); updateBadge(); }); }).catch(e => store.logError(e, 'figma'));
  window.addEventListener('hajin:remote', () => {
    updateBadge(); applyTheme();
    const a = document.activeElement;
    if (document.querySelector('.modal-bg') || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || document.querySelector('.avail.painting')) return;
    render();
  });
  if (!(await db.kvGet('onboarded', false))) { await db.kvSet('onboarded', true); (await import('./seed.js')).welcome(); }
}
boot();
