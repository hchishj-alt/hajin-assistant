// 색 조합(팔레트): 배경·카드·글자·포인트 네 가지만 정하면 나머지는 CSS가 섞어 만들어요.
import * as db from './db.js';

export const PALETTES = {
  sky: { name: '기본', note: '회색 바탕과 파랑', light: ['#f3f4f6', '#ffffff', '#1b1d22', '#2f6fdd'], dark: ['#111214', '#1c1d21', '#ecedf0', '#6b9cf2'] },
  indigo: { name: '인디고', note: '예전 기본 · 크림과 인디고', light: ['#f6f5f2', '#ffffff', '#17181b', '#4b5bff'], dark: ['#0f1115', '#1a1d24', '#eceef3', '#7c88ff'] },
  peach: { name: '복숭아', note: '따뜻하고 말랑', light: ['#fbf3ee', '#fffaf7', '#2a1d1a', '#e2532f'], dark: ['#1a1312', '#241b19', '#f5e9e4', '#ff9a7d'] },
  mint: { name: '민트', note: '맑고 편안', light: ['#eff6f2', '#fbfefc', '#14231c', '#12976b'], dark: ['#0e1512', '#161f1b', '#e3f1ea', '#4fd6a4'] },
  lavender: { name: '라벤더', note: '차분한 보라', light: ['#f4f1fa', '#fdfcff', '#1e1830', '#7b5cf0'], dark: ['#131019', '#1c1826', '#ece7f7', '#a995ff'] },
  butter: { name: '버터', note: '포근한 노랑', light: ['#faf6e6', '#fffdf4', '#262112', '#a87b00'], dark: ['#171509', '#211e10', '#f4eed6', '#f0c84a'] },
  mono: { name: '흑백', note: '환상선택 · 미니멀', light: ['#f4f4f3', '#ffffff', '#111111', '#111111'], dark: ['#0c0c0c', '#171717', '#f2f2f2', '#f2f2f2'] },
  eternia: { name: '이터니아', note: '청보라 블랙과 네온 라임', light: ['#f1f1f6', '#ffffff', '#12122a', '#5a45e0'], dark: ['#0b0c14', '#14152a', '#e9eaf6', '#d9f64c'] },
};
const rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v * (1 - t) + rgb(b)[i] * t));
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
export const isDark = t => t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

// 내 조합: 배경 톤 색 + 포인트 색만 고르면 밝게/어둡게 둘 다 만들어 줌
export function customPalette(tint, acc) {
  return { name: '내 조합', note: '직접 고른 색',
    light: [mix('#ffffff', tint, .09), mix('#ffffff', tint, .02), mix('#16171a', tint, .06), acc],
    dark: [mix('#0e0f13', tint, .08), mix('#191b21', tint, .1), mix('#eef0f4', tint, .06), mix(acc, '#ffffff', lum(acc) < .25 ? .38 : .12)] };
}
export async function current() {
  const id = await db.kvGet('palette', 'sky');
  const tint = await db.kvGet('palTint', '#ffb7c5'), cacc = await db.kvGet('palAcc', '#ff5c8a');
  return { id, tint, cacc, pal: id === 'custom' ? customPalette(tint, cacc) : PALETTES[id] || PALETTES.sky };
}
let mqBound = false;
export async function applyTheme(t) {
  t = t || (await db.kvGet('theme', 'auto'));
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const { pal } = await current();
  const dark = isDark(t);
  let [bg, card, ink, acc] = dark ? pal.dark : pal.light;
  const over = await db.kvGet('accent', null);
  if (over) acc = dark && lum(over) < .2 ? mix(over, '#ffffff', .35) : over;
  // 포인트 색이 배경과 너무 비슷하면 글자색 쪽으로 조금 당김 (버튼·링크가 안 보이는 일 방지)
  for (let i = 0; i < 6 && contrast(acc, card) < 3.4; i++) acc = mix(acc, ink, .14);
  root.setAttribute('data-pal', '1');
  const set = (k, v) => root.style.setProperty(k, v);
  set('--bg', bg); set('--card', card); set('--ink', ink); set('--acc', acc);
  const L = await (await import('./look.js')).apply({ bg, card, ink, acc, dark }, set, root);
  if (L.ink) ink = getComputedStyle(root).getPropertyValue('--ink').trim() || ink;
  set('--acc-ink', contrast(acc, '#ffffff') >= contrast(acc, '#111111') ? '#ffffff' : '#111111');
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', bg));
  if (!mqBound) { mqBound = true; matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()); }
}
