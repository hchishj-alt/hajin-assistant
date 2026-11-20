import { icon } from './icons.js';

// 작은 DOM 헬퍼: h('div.card#id', {onclick}, children...)
// 화면에 null·false를 그대로 붙이면 "null" 글자가 보이므로, 붙이는 순간에 걸러 냄
if (typeof Element !== 'undefined' && !Element.prototype.__hajinAppend) { for (const P of [Element.prototype, DocumentFragment.prototype]) for (const fn of ['append', 'prepend']) { const o = P[fn]; P[fn] = function (...xs) { return o.apply(this, xs.filter(x => x != null && x !== false)); }; } Element.prototype.__hajinAppend = true; }
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { kids.unshift(attrs); attrs = {}; }
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const p of m[2].match(/[.#][\w-]+/g) || []) p[0] === '.' ? el.classList.add(p.slice(1)) : (el.id = p.slice(1));
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if ((k === 'href' || k === 'src') && typeof v === 'string' && /^\s*(javascript|vbscript|data:text)/i.test(v)) continue; // 저장된 주소에 스크립트가 들어 있어도 실행되지 않게
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv); }
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && !['list', 'type', 'form'].includes(k)) { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const ic = (name, size) => { const s = document.createElement('span'); s.className = 'ic'; s.innerHTML = icon(name, size); return s; };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };

let toastT;
export function toast(msg, action) {
  const t = document.getElementById('toast');
  clear(t).append(msg);
  if (action) t.append(h('button', { onclick: () => { action.fn(); t.classList.remove('on'); } }, action.label));
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), action ? 6000 : 2600);
}

// 모달. content: Node | (close)=>Node. 반환: close 함수
// 맨 위 창만 Esc·뒤로 가기에 반응하고, 적던 내용이 있으면 바깥을 눌러도 바로 닫지 않음
const stack = [];
let mseq = 0, noteState = () => { };
const hstate = () => { try { return history.state || {}; } catch { return {}; } };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
if (typeof window !== 'undefined') {
  let cur = hstate(), curHash = location.hash;
  noteState = () => { cur = hstate(); curHash = location.hash; };
  window.addEventListener('popstate', () => {
    const st = hstate(), was = cur, wasHash = curHash; let closed = 0;
    while (stack.length && stack[stack.length - 1].id !== st.modal) { stack[stack.length - 1].close(true); closed++; }
    cur = st; curHash = location.hash;
    /* 이미 닫힌 창이 남긴 빈 칸에서 뒤로 가면 같은 화면이 한 번 더 나오므로 건너뜀 */
    if (!closed && !stack.length && (was.modalDone || was.modal) && wasHash === location.hash) history.back();
  });
  window.addEventListener('hashchange', () => { for (const m of [...stack].reverse()) if (m.hash !== location.hash) m.close(true); noteState(); });
  document.addEventListener('keydown', e => {
    const top = stack[stack.length - 1]; if (!top) return;
    if (e.key === 'Escape' && !e.isComposing) { e.stopPropagation(); top.tryClose(); return; }
    if (e.key !== 'Tab') return;
    const els = [...top.el.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
    if (!els.length) { e.preventDefault(); return; }
    const first = els[0], last = els[els.length - 1], cur = document.activeElement;
    if (!top.el.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  }, true);
}
export function modal(title, content, { wide = false, onClose, nofocus = false } = {}) {
  const root = document.getElementById('modal-root');
  const id = Date.now() * 100 + (mseq++ % 100);
  const prev = document.activeElement;
  let dirty = false, sure = 0, gone = false;
  const me = { id, hash: location.hash, el: null, close: null, tryClose: null };
  const close = fromPop => {
    if (gone) return; gone = true;
    bg.remove();
    const i = stack.indexOf(me); if (i >= 0) stack.splice(i, 1);
    try { if (fromPop !== true && hstate().modal === id) history.replaceState({ modalDone: true }, ''); noteState(); } catch { }
    const app = document.getElementById('app'); if (app && !stack.length) app.inert = false;
    if (prev && document.contains(prev) && !/^(INPUT|TEXTAREA|SELECT|BODY)$/.test(prev.tagName)) { try { prev.focus({ preventScroll: true }); } catch { } }
    onClose && onClose();
  };
  const tryClose = () => {
    if (dirty && bg.querySelector('form,textarea') && Date.now() - sure > 4000) { sure = Date.now(); toast('적던 내용이 있어요. 닫으려면 한 번 더 눌러 주세요'); return; }
    close();
  };
  const body = typeof content === 'function' ? content(close) : content;
  const dlg = h('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h('div.modal-h', h('h2', title), h('button.btn.ghost.icon', { type: 'button', onclick: () => close(), 'aria-label': '닫기' }, ic('x'))),
    body);
  const bg = h('div.modal-bg', { onclick: e => e.target === bg && tryClose() }, dlg);
  bg.addEventListener('input', () => { dirty = true; });
  me.el = dlg; me.close = close; me.tryClose = tryClose;
  root.append(bg); stack.push(me);
  try { const st = hstate(); if (st.modalDone || (st.modal && stack.length === 1)) history.replaceState({ modal: id }, ''); else history.pushState({ modal: id }, ''); noteState(); } catch { }
  const app = document.getElementById('app'); if (app) app.inert = true;
  setTimeout(() => { if (gone) return; const f = nofocus ? null : dlg.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea,select'); try { (f || dlg).focus({ preventScroll: !f }); } catch { } }, 30);
  return close;
}
export function confirmBox(msg, okLabel = '확인') {
  return new Promise(res => {
    const close = modal('확인', c => h('div', h('p', msg), h('div.modal-f',
      h('button.btn', { onclick: () => { res(false); c(); } }, '취소'),
      h('button.btn.pri', { onclick: () => { res(true); c(); } }, okLabel))), { onClose: () => res(false) });
  });
}

// 폼 빌더: fields = [{k, label, type, options, placeholder, full}]
import { all as labelList } from './labels.js';
export function form(fields, values = {}, onSubmit, { submitLabel = '저장', extra } = {}) {
  const inputs = {};
  let busy = false;
  const need = (fd, i) => fd.req ?? (i === 0 && (fd.k === 'title' || fd.k === 'name') && (!fd.type || fd.type === 'text'));
  const f = h('form.stack', { novalidate: '', onsubmit: async e => {
    e.preventDefault(); if (busy) return;
    const v = read();
    const miss = fields.find((fd, i) => need(fd, i) && !String(v[fd.k] ?? '').trim());
    if (miss) { toast(`‘${miss.label}’ 칸을 적어 주세요`); try { inputs[miss.k].focus(); } catch { } return; }
    const btn = f.querySelector('.modal-f button[type=submit]');
    busy = true; if (btn) btn.disabled = true;
    try { await onSubmit(v); } finally { busy = false; if (btn) btn.disabled = false; }
  } });
  const grid = h('div.grid.g2');
  for (const fd of fields) {
    let inp;
    const v = values[fd.k] ?? fd.default ?? '';
    if (fd.type === 'textarea') inp = h('textarea.in', { name: fd.k, placeholder: fd.placeholder || '', rows: fd.rows || 4 }, v);
    else if (fd.type === 'select') { const opts = fd.options.map(o => (Array.isArray(o) ? o : [o, o])); if (v != null && v !== '' && !opts.some(([val]) => String(val) === String(v))) opts.push([v, fd.k === 'team' ? '다른 팀' : String(v)]); inp = h('select.in', { name: fd.k }, opts.map(([val, lab]) => h('option', { value: val, selected: String(val) === String(v) }, lab))); }
    else if (fd.type === 'label') { inp = h('input', { type: 'hidden', name: fd.k, value: v }); }
    else if (fd.type === 'checkbox') inp = h('input', { type: 'checkbox', name: fd.k, checked: !!v });
    else inp = h('input.in', { name: fd.k, type: fd.type || 'text', value: v, placeholder: fd.placeholder || '', step: fd.step, inputmode: fd.inputmode, list: fd.datalist ? fd.k + '-dl' : null });
    inputs[fd.k] = inp;
    const wrap = fd.type === 'checkbox' ? h('label.chk', inp, fd.label) : h('label.f', fd.label, inp);
    if (fd.type === 'label') { const row = h('div.labels'); const paint = () => { clear(row); for (const l of [{ id: '', name: '없음', color: 'var(--line2)' }, ...labelList()]) row.append(h('button.lab' + (inp.value === l.id ? '.on' : ''), { type: 'button', style: { '--lc': l.color }, onclick: () => { inp.value = l.id; paint(); } }, h('i'), l.name)); }; paint(); wrap.append(row); }
    if (fd.datalist) wrap.append(h('datalist#' + fd.k + '-dl', fd.datalist.map(o => h('option', { value: o }))));
    if (fd.full || fd.type === 'textarea') wrap.style.gridColumn = '1/-1';
    grid.append(wrap);
  }
  function read() {
    const o = {};
    for (const fd of fields) {
      const i = inputs[fd.k];
      o[fd.k] = fd.type === 'checkbox' ? i.checked : fd.type === 'number' ? (i.value === '' ? null : Number(i.value)) : i.value.trim();
    }
    return o;
  }
  f.append(grid);
  if (extra) f.append(extra);
  f.append(h('div.modal-f', h('button.btn.pri', { type: 'submit' }, submitLabel)));
  f.read = read; f.inputs = inputs;
  return f;
}

// 날짜
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const hm = d => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const todayStr = () => ymd(new Date());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const wd = d => WD[new Date(d).getDay()];
export function fmtDate(d, { time = false, year = false } = {}) {
  if (!d) return '';
  const x = new Date(d);
  let s = `${year ? x.getFullYear() + '. ' : ''}${x.getMonth() + 1}월 ${x.getDate()}일 (${wd(x)})`;
  if (time) s += ' ' + hm(x);
  return s;
}
export function rel(d) {
  if (!d) return '';
  const days = Math.round((new Date(ymd(d)) - new Date(todayStr())) / 864e5);
  if (days === 0) return '오늘'; if (days === 1) return '내일'; if (days === -1) return '어제';
  if (days > 0) return `${days}일 후`; return `${-days}일 전`;
}
export const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';

// 가벼운 마크다운 → HTML (AI 응답 표시용)
export function md(src) {
  const lines = esc(src || '').split('\n');
  let out = '', inList = false;
  for (let l of lines) {
    l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const li = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${li[1]}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    const hd = l.match(/^(#{1,4})\s+(.*)/);
    if (hd) out += `<h${Math.min(hd[1].length + 1, 4)}>${hd[2]}</h${Math.min(hd[1].length + 1, 4)}>`;
    else if (l.trim()) out += `<p>${l}</p>`;
  }
  if (inList) out += '</ul>';
  return out;
}

export function download(name, data, type = 'application/octet-stream') {
  const b = data instanceof Blob ? data : new Blob([data], { type });
  const a = h('a', { href: URL.createObjectURL(b), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function pickFile(accept, multiple = false) {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept, multiple });
    i.onchange = () => res(multiple ? [...i.files] : i.files[0]);
    i.click();
  });
}
export const COLORS = ['#4b5bff', '#ff7a59', '#1fae84', '#e3a008', '#b05cff', '#14a3c7', '#e24c8a', '#6b7280'];
export const colorFor = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return COLORS[x % COLORS.length]; };
export const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export function busy(btn, on, label) {
  if (on) { btn._l = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${esc(label || '처리 중')}`; }
  else { btn.disabled = false; if (btn._l) btn.innerHTML = btn._l; }
}
export function head(title, sub, ...actions) {
  return h('div.page-head', h('div', h('h1', title), sub ? h('p.sub', sub) : null), h('div.row', actions));
}
export function card(title, iconName, body, ...actions) {
  return h('div.card', h('div.card-h', h('h3', iconName ? ic(iconName) : null, title), h('div.row', actions)), body);
}
export function seg(options, value, onPick) {
  const s = h('div.seg');
  for (const [v, l] of options) s.append(h('button' + (v === value ? '.on' : ''), { type: 'button', onclick: () => onPick(v) }, l));
  return s;
}
export function dropzone(label, accept, onFiles, multiple = true) {
  const d = h('div.drop', { onclick: async () => { const f = await pickFile(accept, multiple); if (f && (!Array.isArray(f) || f.length)) onFiles([].concat(f)); } }, label);
  d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = () => d.classList.remove('over');
  d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); onFiles([...e.dataTransfer.files]); };
  return d;
}

// 수치 타일 (픽토그램 + 숫자 + 라벨)
export function tile(iconName, n, label, tone = '', href) {
  const t = h(href ? 'a.tile' : 'div.tile', { href }, h('div.ti', ic(iconName, 16)), h('div.tn', n), h('div.tl', label));
  if (tone) t.classList.add(tone);
  return t;
}
// 진행 링
export function ring(pct, { size = 44, stroke = 5, color = 'var(--acc)', label } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct || 0));
  const el = h('div.ring', { html: `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg>` });
  el.append(h('b', label ?? Math.round(p * 100) + '%'));
  requestAnimationFrame(() => requestAnimationFrame(() => { const cc = el.querySelectorAll('circle')[1]; if (cc) cc.style.strokeDashoffset = c * (1 - p); }));
  return el;
}
// 숫자 카운트업
export function countUp(el, to, ms = 700) {
  const from = 0, t0 = performance.now(); const fmt = v => Math.round(v).toLocaleString('ko-KR');
  const step = t => { const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  return el;
}

// 일정과 할 일의 차이를 한 줄로. 화면마다 같은 말을 씀
export const KIND_RULE = { event: '때가 정해진 약속', task: '마감까지 끝낼 일' };
// 캘린더·할 일 화면 맨 위의 전환: 둘이 무엇이 다른지와 어디에 있는지를 같이 보여 줌
export function kindPair(on) {
  return h('nav.kindpair', { 'aria-label': '일정과 할 일 바꿔 보기' },
    h('a.ev' + (on === 'event' ? '.on' : ''), { href: '#/calendar', 'aria-current': on === 'event' ? 'page' : null }, ic('calendar', 20), h('span', h('b', '일정'), h('small', KIND_RULE.event))),
    h('a.tk' + (on === 'task' ? '.on' : ''), { href: '#/tasks', 'aria-current': on === 'task' ? 'page' : null }, ic('check2', 20), h('span', h('b', '할 일'), h('small', KIND_RULE.task))));
}

