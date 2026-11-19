// 개인 꾸미기: 사람마다 따로 저장되는 화면 취향 (글씨·모양·투명도·배경·움직임·메뉴).
// 고를 수 있는 값은 전부 화면이 깨지지 않는 범위로 테스트해서 정해 둔 것만 있어요.
import * as db from './db.js';

export const DEFAULT = { fs: 1, font: 'pretendard', ls: 'normal', lh: 'normal', ink: '', rd: 1, bw: 1, line: 'soft', cardA: 100, shadow: 'soft', density: 'normal', motion: 'bouncy', iw: 1.9,
  bg: { kind: 'none', grad: 'aurora', url: '', blur: 24, dim: 60, mask: 'bottom' }, start: 'today', hidden: [], home: [], homeOff: [] };

const SYS = '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
export const FONTS = {
  pretendard: { name: '프리텐다드', note: '기본 · 또렷', css: `"Pretendard Variable",Pretendard,${SYS}` },
  system: { name: '기기 기본', note: '가장 빠름', css: SYS },
  gowun: { name: '고운돋움', note: '부드럽고 단정', g: 'Gowun+Dodum', css: `"Gowun Dodum",${SYS}` },
  plex: { name: 'IBM 플렉스', note: '깔끔한 업무용', g: 'IBM+Plex+Sans+KR:wght@400;500;600;700', css: `"IBM Plex Sans KR",${SYS}` },
  jua: { name: '주아', note: '통통 귀여움', g: 'Jua', css: `"Jua",${SYS}`, k: .97 },
  gaegu: { name: '개구', note: '손글씨', g: 'Gaegu:wght@400;700', css: `"Gaegu",${SYS}`, k: 1.12 },
  serif: { name: '노토 명조', note: '차분한 글', g: 'Noto+Serif+KR:wght@400;600;700', css: `"Noto Serif KR","Apple SD Gothic Neo",serif` },
  mono: { name: '나눔고딕코딩', note: '또박또박', g: 'Nanum+Gothic+Coding:wght@400;700', css: `"Nanum Gothic Coding",ui-monospace,monospace`, k: .96 },
};
export const GRADS = {
  aurora: 'radial-gradient(60% 50% at 15% 10%,color-mix(in srgb,var(--acc) 70%,#fff) 0,transparent 70%),radial-gradient(50% 50% at 90% 20%,#ffb7d5 0,transparent 70%),radial-gradient(60% 60% at 60% 100%,#9be7ff 0,transparent 70%)',
  sunset: 'radial-gradient(60% 50% at 10% 20%,#ffcf8f 0,transparent 70%),radial-gradient(60% 60% at 95% 10%,#ff8fb1 0,transparent 70%),radial-gradient(70% 60% at 50% 100%,#b69cff 0,transparent 70%)',
  mint: 'radial-gradient(60% 50% at 10% 10%,#a8f0d0 0,transparent 70%),radial-gradient(50% 60% at 95% 30%,#bfe3ff 0,transparent 70%),radial-gradient(60% 60% at 40% 100%,#fff3b0 0,transparent 70%)',
  candy: 'radial-gradient(50% 50% at 20% 15%,#ffc2e2 0,transparent 70%),radial-gradient(50% 50% at 85% 25%,#c9c2ff 0,transparent 70%),radial-gradient(60% 60% at 55% 95%,#bff3ff 0,transparent 70%)',
  lime: 'radial-gradient(55% 50% at 15% 15%,#d9f64c 0,transparent 70%),radial-gradient(50% 55% at 90% 30%,#7c88ff 0,transparent 70%),radial-gradient(60% 60% at 50% 100%,#1b1d3a 0,transparent 70%)',
  point: 'radial-gradient(70% 60% at 0% 0%,var(--acc) 0,transparent 70%),radial-gradient(70% 60% at 100% 100%,color-mix(in srgb,var(--acc) 50%,var(--bg)) 0,transparent 70%)',
};
// 분위기 한 번에
export const PRESETS = {
  basic: { name: '기본', note: '처음 그대로', look: {} },
  glass: { name: '유리', note: '비치는 카드와 배경', look: { cardA: 72, bg: { kind: 'grad', grad: 'aurora', blur: 30, dim: 55, mask: 'bottom' }, rd: 1.4, shadow: 'soft' } },
  paper: { name: '종이', note: '명조, 선 또렷', look: { font: 'serif', rd: .35, bw: 1.5, line: 'strong', shadow: 'none', lh: 'loose', motion: 'calm' } },
  mallang: { name: '말랑', note: '둥글고 통통', look: { font: 'jua', rd: 1.9, bw: 2, line: 'acc', shadow: 'none', iw: 2.4, bg: { kind: 'grad', grad: 'candy', blur: 30, dim: 70, mask: 'bottom' } } },
  note: { name: '공책', note: '손글씨 느낌', look: { font: 'gaegu', fs: 1.08, rd: 1.4, bw: 1.5, line: 'strong', shadow: 'none' } },
  focus: { name: '집중', note: '촘촘하고 조용', look: { font: 'system', density: 'tight', shadow: 'none', motion: 'off', rd: .35, fs: .92 } },
  neon: { name: '네온', note: '어두운 화면에 추천', look: { cardA: 72, line: 'acc', bw: 1, bg: { kind: 'grad', grad: 'lime', blur: 36, dim: 62, mask: 'vignette' }, font: 'plex' } },
};

const rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v * (1 - t) + rgb(b)[i] * t));
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));

export async function get() { const l = (await db.kvGet('look', null)) || {}; return { ...DEFAULT, ...l, bg: { ...DEFAULT.bg, ...(l.bg || {}) } }; }
export async function save(patch) { const cur = await get(); const next = { ...cur, ...patch, bg: { ...cur.bg, ...(patch.bg || {}) } }; await db.kvSet('look', next); return next; }
export async function reset() { await db.kvSet('look', null); await db.delBlob('look:bg').catch(() => { }); }

// 글자색을 직접 골라도 배경과 대비 7:1 이상이 되게 보정
export function safeInk(ink, bg) { const to = lum(bg) > .4 ? '#000000' : '#ffffff'; for (let i = 0; i < 14 && contrast(ink, bg) < 10; i++) ink = mix(ink, to, .15); return ink; }

let bgUrl = null, fontLink = null;
// theme.js 의 applyTheme 가 색을 정한 뒤 부름. c = { bg, card, ink, acc, dark }
export async function apply(c, set, root = document.documentElement) {
  const L = await get();
  const unset = k => root.style.removeProperty(k);
  // 글씨
  const f = FONTS[L.font] || FONTS.pretendard;
  if (f.g) { const href = `https://fonts.googleapis.com/css2?family=${f.g}&display=swap`; if (!fontLink) { fontLink = document.createElement('link'); fontLink.rel = 'stylesheet'; document.head.append(fontLink); } if (fontLink.href !== href) fontLink.href = href; }
  set('--font', f.css);
  set('--fs', String(clamp(L.fs, .9, 1.18) * (f.k || 1)));
  set('--ls', { tight: '-.028em', normal: '-.011em', wide: '.012em' }[L.ls] || '-.011em');
  set('--lh', { tight: '1.45', normal: '1.58', loose: '1.74' }[L.lh] || '1.58');
  if (L.ink) set('--ink', safeInk(L.ink, c.bg));
  // 모양
  set('--rd', String(clamp(L.rd, .3, 1.9)));
  const bw = clamp(L.bw, 0, 2); set('--bw', bw + 'px');
  if (L.line === 'strong') { set('--line', mix(c.bg, c.ink, c.dark ? .34 : .3)); set('--line2', mix(c.bg, c.ink, c.dark ? .46 : .42)); }
  else if (L.line === 'acc') { set('--line', mix(c.bg, c.acc, .42)); set('--line2', mix(c.bg, c.acc, .6)); }
  else { unset('--line'); unset('--line2'); }
  if (L.shadow === 'none') set('--sh', 'none'); else if (L.shadow === 'deep') set('--sh', c.dark ? '0 2px 4px rgba(0,0,0,.4),0 14px 36px rgba(0,0,0,.45)' : '0 2px 4px rgba(20,20,30,.06),0 14px 36px rgba(20,20,30,.13)'); else unset('--sh');
  set('--iw', String(clamp(L.iw, 1.4, 2.5)));
  root.dataset.density = L.density; root.dataset.motion = L.motion;
  // 투명도 (글자가 묻히지 않게 55% 아래로는 못 내림)
  const a = clamp(L.cardA, 55, 100);
  if (a < 100) { set('--card-bg', `color-mix(in srgb, ${c.card} ${a}%, transparent)`); root.dataset.glass = '1'; } else { unset('--card-bg'); delete root.dataset.glass; }
  // 배경
  let el = document.getElementById('bgfx');
  if (!el) { el = document.createElement('div'); el.id = 'bgfx'; el.innerHTML = '<div class="img"></div><div class="mask"></div>'; document.body.prepend(el); }
  const img = el.firstChild, B = L.bg;
  let src = '';
  if (B.kind === 'grad') src = GRADS[B.grad] || GRADS.aurora;
  else if (B.kind === 'url' && /^https?:\/\//.test(B.url)) src = `url("${B.url.replace(/["\\\n]/g, '')}")`;
  else if (B.kind === 'image') { const blob = await db.getBlob('look:bg').catch(() => null); if (blob) { if (bgUrl) URL.revokeObjectURL(bgUrl); bgUrl = URL.createObjectURL(blob); src = `url("${bgUrl}")`; } }
  document.body.classList.toggle('has-bg', !!src);
  if (src) {
    img.style.backgroundImage = src; img.style.backgroundColor = c.bg;
    set('--bg-blur', (B.kind === 'grad' ? Math.max(20, clamp(B.blur, 0, 40)) : clamp(B.blur, 0, 40)) + 'px');
    // 덮개: 배경색을 위에 깔아 글자가 읽히게. dim 은 최소 40%.
    const d = clamp(B.dim, 40, 95), m = (p) => `color-mix(in srgb, ${c.bg} ${Math.round(p)}%, transparent)`;
    const hi = m(d), lo = m(Math.max(18, d - 38)), full = m(Math.min(98, d + 22));
    set('--bg-mask', { none: hi, bottom: `linear-gradient(180deg, ${lo} 0%, ${hi} 34%, ${full} 100%)`, top: `linear-gradient(0deg, ${lo} 0%, ${hi} 34%, ${full} 100%)`, side: `linear-gradient(90deg, ${full} 0%, ${hi} 45%, ${lo} 100%)`, vignette: `radial-gradient(120% 90% at 50% 40%, ${hi} 0%, ${hi} 45%, ${lo} 100%)` }[B.mask] || hi);
  }
  return L;
}
// 배경으로 쓸 사진을 줄여서 이 기기에 저장
export async function setImage(file) {
  const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/webp', .82));
  await db.putBlob(blob || file, 'look:bg');
  return save({ bg: { kind: 'image' } });
}
