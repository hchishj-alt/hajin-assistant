// 링크만 붙이면 미리보기 + 색·느낌 자동 분석 (전부 무료 공개 서비스, 키 없음)
// 영상: YouTube 썸네일 / noembed(Vimeo 등) · 웹: microlink(하루 50회 무료) · 색 분석: wsrv.nl 이미지 프록시
export function ytId(u) {
  const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? m[1] : '';
}
const isImg = u => /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(u) || /[?&](format|fm)=(jpe?g|png|webp|avif)/i.test(u) || /^https?:\/\/(i\.pinimg\.com|pbs\.twimg\.com\/media|images\.unsplash\.com|[\w-]+\.googleusercontent\.com|i\.ytimg\.com|img\.youtube\.com|cdn\.dribbble\.com\/userupload|mir-s3-cdn-cf\.behance\.net|i\.imgur\.com|[\w.-]*cdninstagram\.com|postfiles\.pstatic\.net|blogfiles\.pstatic\.net)\//i.test(u);
// 확장자가 없어도 실제로 그림이 뜨는 주소인지 직접 불러 봄 (우클릭 › 이미지 주소 복사로 가져온 링크용)
export const probeImage = (url, ms = 5000) => new Promise(res => { const im = new Image(); im.referrerPolicy = 'no-referrer'; const t = setTimeout(() => { im.src = ''; res(false); }, ms); im.onload = () => { clearTimeout(t); res(im.naturalWidth > 1); }; im.onerror = () => { clearTimeout(t); res(false); }; im.src = url; });
// 아트팀 작업 분야 자동 분류
export const USES = [['캐릭터', /캐릭터|character|인물|chara|oc\b|마스코트/i], ['배경', /배경|background|풍경|landscape|environment|공간|건물|인테리어/i], ['UI', /\bui\b|ux|인터페이스|hud|대시보드|dashboard|앱\s*디자인|웹\s*디자인|화면\s*설계|아이콘/i], ['모션', /모션|motion|애니메이션|animation|트랜지션|after\s*effects|애펙|에펙|mv\b|뮤직비디오/i], ['타이포', /타이포|typo|폰트|font|레터링|lettering|글자/i], ['컬러', /컬러|color|palette|팔레트|배색|색감/i], ['일러스트', /일러스트|illust|드로잉|drawing|그림|원화|concept\s*art|컨셉\s*아트/i], ['3D', /3d|blender|블렌더|c4d|모델링|렌더|voxel/i], ['포즈·인체', /포즈|pose|인체|해부|anatomy|손\s*그리|동세/i], ['조명', /조명|lighting|라이팅|빛|그림자/i], ['레이아웃', /레이아웃|layout|구도|composition|그리드|포스터|편집\s*디자인/i], ['브랜딩', /브랜딩|branding|로고|logo|패키지|굿즈|md\b/i], ['영상편집', /편집|컷|릴스|reels|shorts|쇼츠|브이로그|vlog|자막/i], ['의상·소품', /의상|패션|fashion|코스튬|소품|prop|무기|액세서리/i]];
export const usesOf = text => USES.filter(([, re]) => re.test(text || '')).map(([n]) => n).slice(0, 3);
const isVid = u => /\.(mp4|webm|mov)(\?|#|$)/i.test(u);
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const VIDEO_HOSTS = /youtube|youtu\.be|vimeo|tiktok|instagram\.com\/(reel|tv)|twitch|dailymotion|naver\.tv|tv\.kakao/i;

async function getJSON(url, ms = 8000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}

export async function preview(url) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const out = { url, title: '', thumb: '', kind: 'web', provider: host(url), embed: '' };
  const ytThumb = url.match(/(?:i\.ytimg\.com|img\.youtube\.com)\/vi(?:_webp)?\/([\w-]{11})\//);
  if (ytThumb) url = out.url = `https://youtu.be/${ytThumb[1]}`; // 유튜브 썸네일 주소를 붙여도 영상으로
  const yt = ytId(url);
  if (yt) { out.kind = 'video'; out.thumb = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`; out.embed = `https://www.youtube-nocookie.com/embed/${yt}`; out.provider = 'YouTube'; }
  else if (isImg(url)) { out.kind = 'image'; out.thumb = url; out.title = decodeURIComponent(url.split('/').pop().split('?')[0]).replace(/\.\w+$/, ''); return out; }
  else if (isVid(url)) { out.kind = 'video'; out.embed = url; out.title = decodeURIComponent(url.split('/').pop().split('?')[0]); }
  else if (VIDEO_HOSTS.test(url)) out.kind = 'video';
  else if (await probeImage(url)) { out.kind = 'image'; out.thumb = url; out.title = host(url); return out; }
  try {
    const j = await getJSON('https://noembed.com/embed?url=' + encodeURIComponent(url));
    if (!j.error) {
      out.title ||= j.title || ''; out.thumb ||= j.thumbnail_url || ''; out.provider = j.provider_name || out.provider;
      if (j.type === 'video') out.kind = 'video'; if (j.type === 'photo') { out.kind = 'image'; out.thumb ||= j.url; }
      if (!out.embed && /vimeo/i.test(out.provider)) { const m = url.match(/vimeo\.com\/(\d+)/); if (m) out.embed = `https://player.vimeo.com/video/${m[1]}`; }
    }
  } catch { }
  if (!out.title || !out.thumb) {
    try {
      const j = await getJSON('https://api.microlink.io/?url=' + encodeURIComponent(url));
      const d = j.data || {};
      out.title ||= d.title || ''; out.thumb ||= d.image?.url || d.logo?.url || ''; out.provider = d.publisher || out.provider;
      if (!out.desc && d.description) out.desc = d.description.slice(0, 200);
      if (d.video?.url && out.kind === 'web') out.kind = 'video';
    } catch { }
  }
  out.title ||= out.provider || url;
  return out;
}

// ── 색 분석 ──
const proxied = (u, w = 72) => `https://wsrv.nl/?url=${encodeURIComponent(u.replace(/^https?:\/\//, ''))}&w=${w}&h=${w}&fit=cover&output=png`;
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; setTimeout(() => rej(new Error('timeout')), 9000); });
}
async function pixelsOf(src) {
  let img;
  if (src.startsWith('blob:') || src.startsWith('data:')) img = await loadImg(src);
  else { try { img = await loadImg(proxied(src)); } catch { img = await loadImg(src); } }
  const c = document.createElement('canvas'); c.width = 48; c.height = 48;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data; const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  return px;
}
function kmeans(px, k = 5) {
  if (!px.length) return [];
  let cs = Array.from({ length: k }, (_, i) => px[Math.floor((i + .5) / k * px.length)].slice());
  let as = new Array(px.length).fill(0);
  for (let it = 0; it < 10; it++) {
    px.forEach((p, i) => { let b = 0, bd = 1e9; cs.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; b = j; } }); as[i] = b; });
    cs = cs.map((c, j) => { const m = px.filter((_, i) => as[i] === j); if (!m.length) return c; return [0, 1, 2].map(ch => m.reduce((s, p) => s + p[ch], 0) / m.length); });
  }
  const n = cs.map((_, j) => as.filter(a => a === j).length);
  return cs.map((c, j) => ({ rgb: c.map(Math.round), w: n[j] / px.length })).filter(x => x.w > 0.02).sort((a, b) => b.w - a.w);
}
export function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  let hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s, l];
}
export const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
export const HUES = [
  ['빨강', '#e5484d'], ['주황', '#f76b15'], ['노랑', '#ffc53d'], ['초록', '#30a46c'], ['청록', '#12a594'], ['파랑', '#0090ff'], ['보라', '#8e4ec6'], ['분홍', '#e93d82'], ['갈색', '#a07553'], ['검정', '#1c1c1f'], ['회색', '#8b8d98'], ['흰색', '#f4f4f5'],
];
export function bucket(rgb) {
  const [h, s, l] = hsl(rgb);
  if (s < 0.14 || l < 0.08 || l > 0.95) return l < 0.25 ? '검정' : l > 0.8 ? '흰색' : '회색';
  if (h >= 15 && h < 45 && l < 0.42 && s < 0.7) return '갈색';
  if (h < 15 || h >= 345) return '빨강'; if (h < 40) return '주황'; if (h < 65) return '노랑'; if (h < 160) return '초록';
  if (h < 200) return '청록'; if (h < 250) return '파랑'; if (h < 290) return '보라'; return '분홍';
}
export const MOODS = ['밝은', '어두운', '비비드', '파스텔', '뮤트', '모노톤', '따뜻한', '차가운', '대비 강한', '부드러운'];
export function moodOf(pal) {
  if (!pal.length) return [];
  const W = pal.reduce((s, p) => s + p.w, 0) || 1;
  const hs = pal.map(p => ({ ...p, hsl: hsl(p.rgb) }));
  const L = hs.reduce((s, p) => s + p.hsl[2] * p.w, 0) / W, S = hs.reduce((s, p) => s + p.hsl[1] * p.w, 0) / W;
  const sd = Math.sqrt(hs.reduce((s, p) => s + (p.hsl[2] - L) ** 2 * p.w, 0) / W);
  let warm = 0, cool = 0; hs.forEach(p => { if (p.hsl[1] < .15) return; const h = p.hsl[0]; if (h < 70 || h > 330) warm += p.w * p.hsl[1]; else if (h > 160 && h < 290) cool += p.w * p.hsl[1]; });
  const m = [];
  if (L > .62) m.push('밝은'); if (L < .35) m.push('어두운');
  if (S < .1) m.push('모노톤'); else if (S < .25) m.push('뮤트');
  if (S > .55 && L > .3 && L < .75) m.push('비비드');
  if (L > .72 && S > .25) m.push('파스텔');
  if (warm > cool * 1.4 && warm > .08) m.push('따뜻한'); if (cool > warm * 1.4 && cool > .08) m.push('차가운');
  if (sd > .2) m.push('대비 강한'); if (sd < .12) m.push('부드러운');
  return m;
}
export async function analyzeColors(src) {
  const pal = kmeans(await pixelsOf(src), 6);
  const buckets = {}; pal.forEach(p => { const b = bucket(p.rgb); buckets[b] = (buckets[b] || 0) + p.w; });
  return { colors: pal.slice(0, 5).map(p => hex(p.rgb)), hues: Object.entries(buckets).filter(([, w]) => w > .08).sort((a, b) => b[1] - a[1]).map(([b]) => b), mood: moodOf(pal) };
}
