// 화면 도구: 아이콘, 시트, 알림
export const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  cam: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  flip: '<path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><path d="m15 15 3 3-3 3M9 9 6 6l3-3"/>',
  gear: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2.2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>',
  mirror: '<path d="M12 3v18"/><path d="M8 7 3 12l5 5zM16 7l5 5-5 5z"/>',
  align: '<path d="M3 6h18M7 12h10M5 18h14"/>',
  top: '<path d="M5 3h14M12 21V8M6 13l6-6 6 6"/>',
  minus: '<path d="M5 12h14"/>',
  para: '<path d="M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  size: '<path d="M4 20 9 6l5 14M5.8 15h6.4M16 20l3-8 3 8M16.8 18h4.4"/>',
  band: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 11h18"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  devices: '<rect x="2" y="4" width="14" height="10" rx="2"/><rect x="15" y="9" width="7" height="12" rx="2"/><path d="M6 18h6"/>',
  receipt: '<path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-3-2-2 2z"/><path d="M8 9h8M8 13h6"/>',
  timer: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
};
export const ic = (n, s = 20) => `<span class="ic"><svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg></span>`;
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const $ = (sel, r = document) => r.querySelector(sel);
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const chars = s => (s || '').replace(/\s/g, '').length;
export const fmt = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
export const estimate = (s, cpm) => chars(s) / (cpm / 60);
export const paras = s => (s || '').split(/\n\s*\n/).filter(p => p.trim()).length;
let toastT;
export function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
export const buzz = n => { try { navigator.vibrate?.(n); } catch {} };

/* ---------- 시트 ---------- */
export function sheet(inner, { onClose } = {}) {
  const root = $('#sheet-root');
  const scrim = el('<div class="scrim"></div>');
  const sh = el(`<div class="sheet" role="dialog"><div class="grab"></div></div>`);
  sh.append(inner);
  root.append(scrim, sh);
  requestAnimationFrame(() => { scrim.classList.add('in'); sh.classList.add('in'); });
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    scrim.classList.remove('in'); sh.classList.remove('in');
    setTimeout(() => { scrim.remove(); sh.remove(); }, 380);
    onClose?.();
  };
  scrim.onclick = close;
  // 아래로 끌어 닫기
  let y0 = null;
  sh.addEventListener('touchstart', e => { if (sh.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sh.addEventListener('touchmove', e => { if (y0 == null) return; const d = e.touches[0].clientY - y0; if (d > 0) { sh.style.transition = 'none'; sh.style.transform = `translateY(${d}px)`; } }, { passive: true });
  sh.addEventListener('touchend', e => { if (y0 == null) return; const d = e.changedTouches[0].clientY - y0; sh.style.transition = ''; sh.style.transform = ''; y0 = null; if (d > 90) close(); });
  return { close, el: sh };
}


export async function copy(text, msg = '복사했어요') {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.style.cssText = 'position:fixed;opacity:0'; ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(msg);
}
