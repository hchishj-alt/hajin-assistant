import { icon } from './icons.js';

// 작은 DOM 헬퍼: h('div.card#id', {onclick}, children...)
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { kids.unshift(attrs); attrs = {}; }
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const p of m[2].match(/[.#][\w-]+/g) || []) p[0] === '.' ? el.classList.add(p.slice(1)) : (el.id = p.slice(1));
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
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
export function modal(title, content, { wide = false, onClose } = {}) {
  const root = document.getElementById('modal-root');
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = e => e.key === 'Escape' && close();
  const body = typeof content === 'function' ? content(close) : content;
  const bg = h('div.modal-bg', { onclick: e => e.target === bg && close() },
    h('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-label': title },
      h('div.modal-h', h('h2', title), h('button.btn.ghost.icon', { onclick: close, 'aria-label': '닫기' }, ic('x'))),
      body));
  root.append(bg);
  document.addEventListener('keydown', esc);
  setTimeout(() => bg.querySelector('input,textarea,select')?.focus(), 30);
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
  const f = h('form.stack', { onsubmit: e => { e.preventDefault(); onSubmit(read()); } });
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
