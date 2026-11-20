import { icon as base } from '../js/icons.js';
const EXTRA = {
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  userminus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ig: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  tt: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
};
export function icon(name, size = 18) {
  if (EXTRA[name]) return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EXTRA[name]}</svg>`;
  return base(name, size);
}
// h('div.a.b', {attrs/on*}, ...kids)
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.'); const el = document.createElement(tag || 'div'); if (cls.length) el.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list' && k !== 'type') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
export const ic = (n, s) => h('span.ic', { html: icon(n, s) });
export function toast(msg, ms = 2400) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
// 아래에서 올라오는 창
export function sheet(title, body, { onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const close = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 260); onClose && onClose(); };
  const wrap = h('div.sheetwrap', { onclick: e => { if (e.target === wrap) close(); } },
    h('div.sheet', { role: 'dialog', 'aria-label': title }, h('div.grab'), h('div.sheethead', h('b', title), h('button.iconbtn', { 'aria-label': '닫기', onclick: close, html: icon('x', 20) })), h('div.sheetbody', body)));
  root.append(wrap); requestAnimationFrame(() => wrap.classList.add('on'));
  return close;
}
export const busy = (btn, on, label) => { if (!btn) return; if (on) { btn._l = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (label || ''); } else { btn.disabled = false; if (btn._l) btn.innerHTML = btn._l; } };
export function seg(items, cur, onPick) {
  const el = h('div.seg', { role: 'tablist' }, items.map(([v, label, icn]) => h('button', { role: 'tab', 'aria-selected': String(v === cur), class: v === cur ? 'on' : '', onclick: () => onPick(v) }, icn ? ic(icn, 16) : null, label)));
  return el;
}
export const field = (label, input, hint) => h('label.field', h('span.flabel', label), input, hint ? h('span.fhint', hint) : null);
export function copy(text) { navigator.clipboard?.writeText(text).then(() => toast('복사했어요'), () => toast('복사하지 못했어요')); }
// 작은 꺾은선 (팔로워 추이)
export function spark(vals, { w = 300, h: H = 64 } = {}) {
  if (vals.length < 2) return h('div.sparkempty', '기록이 쌓이면 추이가 보여요');
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
  const pts = vals.map((v, i) => [i / (vals.length - 1) * w, H - 6 - (v - mn) / rg * (H - 12)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return h('div.spark', { html: `<svg viewBox="0 0 ${w} ${H}" preserveAspectRatio="none" width="100%" height="${H}"><defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".22"/><stop offset="1" stop-color="var(--acc)" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w} ${H} L0 ${H}Z" fill="url(#sg)"/><path d="${d}" fill="none" stroke="var(--acc)" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>` });
}
