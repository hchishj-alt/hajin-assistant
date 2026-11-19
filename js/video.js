// SNS 스튜디오 렌더 엔진 — 브라우저 캔버스만으로 콘셉트 필터·자막·로고·인트로를 입혀 영상/썸네일을 만든다.
export const RATIOS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };
export const DEFAULT_CONCEPT = {
  name: '기본', ratio: '9:16',
  look: { brightness: 1.02, contrast: 1.06, saturate: 1.05, warmth: 0, fade: 0, vignette: 0.25, grain: 0.06 },
  font: 'Pretendard Variable', weight: 800, main: '#ffffff', accent: '#4b5bff', box: 'rgba(0,0,0,.45)',
  sub: { pos: 'bottom', size: 54, style: 'box' }, // box | stroke | plain
  intro: '', outro: '', logoKey: null, logoPos: 'tr', hashtags: '',
};
export const LOOKS = {
  자연스럽게: { brightness: 1.02, contrast: 1.05, saturate: 1.05, warmth: 0, fade: 0, vignette: .2, grain: .04 },
  필름: { brightness: 1.03, contrast: .95, saturate: .85, warmth: .25, fade: .18, vignette: .35, grain: .14 },
  쨍하게: { brightness: 1.05, contrast: 1.18, saturate: 1.3, warmth: .05, fade: 0, vignette: .15, grain: .02 },
  흑백: { brightness: 1.02, contrast: 1.2, saturate: 0, warmth: 0, fade: .05, vignette: .4, grain: .12 },
  파스텔: { brightness: 1.1, contrast: .88, saturate: .9, warmth: .08, fade: .22, vignette: 0, grain: .03 },
  시네마: { brightness: .97, contrast: 1.12, saturate: .9, warmth: -.12, fade: .06, vignette: .5, grain: .08 },
  하늘: { brightness: 1.08, contrast: 1.0, saturate: 1.12, warmth: -.18, fade: .1, vignette: .1, grain: .02 },
};

let grainCanvas = null;
function grain() {
  if (grainCanvas) return grainCanvas;
  grainCanvas = document.createElement('canvas'); grainCanvas.width = grainCanvas.height = 256;
  const g = grainCanvas.getContext('2d'); const d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0); return grainCanvas;
}

// 미디어 한 장을 캔버스에 cover로 그리고 콘셉트 룩을 입힘
export function drawFrame(ctx, src, W, H, c, { zoom = 1, t = 0 } = {}) {
  const L = c.look || {};
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (src) {
    const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
    if (sw && sh) {
      const k = Math.max(W / sw, H / sh) * zoom;
      const dw = sw * k, dh = sh * k;
      ctx.filter = `brightness(${L.brightness ?? 1}) contrast(${L.contrast ?? 1}) saturate(${L.saturate ?? 1})`;
      ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.filter = 'none';
    }
  }
  if (L.warmth) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = L.warmth > 0 ? `rgba(255,150,60,${L.warmth})` : `rgba(60,140,255,${-L.warmth})`; ctx.fillRect(0, 0, W, H); }
  if (L.fade) { ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = `rgba(40,40,50,${L.fade})`; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'source-over';
  if (L.vignette) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${L.vignette})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (L.grain) { ctx.globalAlpha = L.grain; ctx.globalCompositeOperation = 'overlay'; const p = ctx.createPattern(grain(), 'repeat'); ctx.translate((t * 997) % 256, (t * 613) % 256); ctx.fillStyle = p; ctx.fillRect(-256, -256, W + 512, H + 512); }
  ctx.restore();
}

export function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para.split(/(\s+)/)) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line.trim()) { out.push(line.trim()); line = ch.trimStart(); }
      else line = test;
      // 한글 긴 단어 강제 줄바꿈
      while (ctx.measureText(line).width > maxW && line.length > 1) { let i = line.length - 1; while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxW) i--; out.push(line.slice(0, i)); line = line.slice(i); }
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}

export function drawSubtitle(ctx, text, W, H, c, scale = 1) {
  if (!text) return;
  const s = c.sub || {}; const size = (s.size || 54) * scale * (W / 1080);
  ctx.save();
  ctx.font = `${c.weight || 800} ${size}px "${c.font || 'Pretendard Variable'}", Pretendard, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, text, W * .84);
  const lh = size * 1.28;
  const total = lines.length * lh;
  let y = s.pos === 'top' ? H * .14 : s.pos === 'middle' ? H / 2 - total / 2 + lh / 2 : H * (W > H ? .86 : .78) - total + lh / 2;
  for (const ln of lines) {
    const w = ctx.measureText(ln).width;
    if (s.style === 'box') { ctx.fillStyle = c.box || 'rgba(0,0,0,.45)'; roundRect(ctx, W / 2 - w / 2 - size * .4, y - lh / 2 + 2, w + size * .8, lh - 4, size * .25); ctx.fill(); }
    if (s.style === 'stroke') { ctx.lineWidth = size * .14; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(ln, W / 2, y); }
    if (s.style === 'plain') { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * .3; }
    ctx.fillStyle = c.main || '#fff'; ctx.fillText(ln, W / 2, y);
    y += lh;
  }
  ctx.restore();
}
export function drawTitleCard(ctx, text, W, H, c, alpha = 1, sub = '') {
  if (!text) return;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, W, H);
  const size = W * .095;
  ctx.font = `${c.weight || 800} ${size}px "${c.font || 'Pretendard Variable'}", Pretendard, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, text, W * .82);
  let y = H / 2 - (lines.length - 1) * size * .62;
  for (const l of lines) { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = size * .25; ctx.fillStyle = c.main || '#fff'; ctx.fillText(l, W / 2, y); y += size * 1.22; }
  ctx.shadowBlur = 0;
  ctx.fillStyle = c.accent || '#4b5bff'; roundRect(ctx, W / 2 - W * .06, y - size * .35, W * .12, size * .12, size * .06); ctx.fill();
  if (sub) { ctx.font = `600 ${size * .38}px "${c.font || 'Pretendard Variable'}", Pretendard, sans-serif`; ctx.fillStyle = c.main || '#fff'; ctx.fillText(sub, W / 2, y + size * .35); }
  ctx.restore();
}
export function drawLogo(ctx, img, W, H, pos = 'tr') {
  if (!img) return;
  const s = W * .14, k = s / Math.max(img.width, img.height), w = img.width * k, h = img.height * k, m = W * .05;
  const x = pos.includes('l') ? m : W - m - w, y = pos.includes('t') ? m : H - m - h;
  ctx.save(); ctx.globalAlpha = .92; ctx.drawImage(img, x, y, w, h); ctx.restore();
}
export function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// 클립 목록 → 재생/렌더
// clips: [{ type:'video'|'image', el, in, out, dur }]
// subs: [{ start, end, text }] (전체 타임라인 기준 초)
export function totalDuration(clips, c) {
  return clips.reduce((s, k) => s + clipLen(k), 0) + (c.intro ? 0 : 0);
}
export const clipLen = k => k.type === 'image' ? (k.dur || 3) : Math.max(.3, (k.out ?? k.el.duration ?? 0) - (k.in || 0));

export function createPlayer(canvas, clips, concept, subs, { logo = null, music = null, musicVol = .35, sfx = [], onTime, onEnd, record = false } = {}) {
  const [W, H] = RATIOS[concept.ratio] || RATIOS['9:16'];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  let ac = null, dest = null, raf = 0, stopped = false, idx = 0, clipStart = 0, t0 = 0, rec = null, chunks = [];
  const total = totalDuration(clips, concept);
  const nodes = new Map();
  function audioSetup() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    dest = ac.createMediaStreamDestination();
    for (const k of clips) if (k.type === 'video' && !nodes.has(k.el)) { try { const n = ac.createMediaElementSource(k.el); const g = ac.createGain(); g.gain.value = k.vol ?? 1; n.connect(g); g.connect(dest); if (!record) g.connect(ac.destination); nodes.set(k.el, n); } catch { } }
    if (music) { try { const n = ac.createMediaElementSource(music); const g = ac.createGain(); g.gain.value = musicVol; n.connect(g); g.connect(dest); if (!record) g.connect(ac.destination); } catch { } }
  }
  async function startClip(i) {
    idx = i; const k = clips[i]; if (!k) return finish();
    clipStart = elapsed();
    if (k.type === 'video') { k.el.currentTime = k.in || 0; k.el.muted = false; try { await k.el.play(); } catch { } }
  }
  const elapsed = () => (performance.now() - t0) / 1000;
  function frame() {
    if (stopped) return;
    const T = elapsed();
    const k = clips[idx];
    if (!k) return finish();
    const local = T - clipStart;
    const len = clipLen(k);
    if (local >= len || (k.type === 'video' && (k.el.ended || k.el.currentTime >= (k.out ?? Infinity)))) { if (k.type === 'video') k.el.pause(); startClip(idx + 1); raf = requestAnimationFrame(frame); return; }
    const zoom = k.type === 'image' ? 1 + .06 * (local / len) : 1;
    drawFrame(ctx, k.el, W, H, concept, { zoom, t: Math.floor(T * 24) });
    const s = subs.find(x => T >= x.start && T < x.end);
    if (s) drawSubtitle(ctx, s.text, W, H, concept);
    if (concept.intro && T < 2.2) drawTitleCard(ctx, concept.intro, W, H, concept, T < 1.8 ? 1 : 1 - (T - 1.8) / .4);
    if (concept.outro && T > total - 2) drawTitleCard(ctx, concept.outro, W, H, concept, Math.min(1, (T - (total - 2)) / .4), concept.hashtags?.split(/\s+/).slice(0, 3).join(' '));
    drawLogo(ctx, logo, W, H, concept.logoPos);
    onTime && onTime(T, total);
    raf = requestAnimationFrame(frame);
  }
  function finish() {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf);
    clips.forEach(k => k.type === 'video' && k.el.pause()); music && music.pause();
    if (rec && rec.state !== 'inactive') rec.stop(); else onEnd && onEnd(null);
  }
  return {
    W, H, total,
    async play() {
      audioSetup();
      try { await ac.resume(); } catch { }
      if (record) {
        const stream = canvas.captureStream(30);
        dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        const type = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
        rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        rec.onstop = () => onEnd && onEnd(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
        rec.start(500);
      }
      if (music) { music.currentTime = 0; music.loop = true; try { await music.play(); } catch { } }
      t0 = performance.now(); stopped = false;
      for (const x of sfx) { try { const b = ac.createBufferSource(); b.buffer = sfxBuffer(ac, x.kind); const g = ac.createGain(); g.gain.value = x.vol ?? .8; b.connect(g); g.connect(dest); if (!record) g.connect(ac.destination); b.start(ac.currentTime + Math.max(0, x.t || 0)); } catch { } }
      await startClip(0);
      raf = requestAnimationFrame(frame);
    },
    stop: finish,
    close() { finish(); try { ac && ac.close(); } catch { } },
  };
}

// 썸네일 후보: 영상에서 프레임을 고르게 뽑아 선명도·밝기·채도로 점수
export async function thumbCandidates(clips, n = 8) {
  const out = [];
  const c = document.createElement('canvas'); c.width = 320; c.height = 320;
  const g = c.getContext('2d', { willReadFrequently: true });
  const per = Math.max(1, Math.ceil(n / Math.max(1, clips.length)));
  for (const k of clips) {
    if (k.type === 'image') { out.push({ clip: k, time: 0, score: score(k.el) }); continue; }
    const len = clipLen(k);
    for (let i = 0; i < per; i++) {
      const t = (k.in || 0) + len * (i + .5) / per;
      await seek(k.el, t);
      out.push({ clip: k, time: t, score: score(k.el) });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
  function score(src) {
    const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
    const k = Math.max(320 / sw, 320 / sh);
    g.drawImage(src, (320 - sw * k) / 2, (320 - sh * k) / 2, sw * k, sh * k);
    const d = g.getImageData(0, 0, 320, 320).data;
    let lum = 0, sat = 0, edge = 0, prev = 0;
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const l = .299 * r + .587 * gg + .114 * b; lum += l;
      sat += Math.max(r, gg, b) - Math.min(r, gg, b);
      edge += Math.abs(l - prev); prev = l;
    }
    const N = d.length / 16; lum /= N; sat /= N; edge /= N;
    const expo = 1 - Math.abs(lum - 135) / 135; // 너무 어둡거나 밝지 않게
    return edge * .6 + sat * .25 + expo * 40;
  }
}
export function seek(v, t) { return new Promise(res => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = Math.min(t, (v.duration || t) - .05); setTimeout(done, 1500); }); }

export function renderThumb(canvas, src, concept, { title = '', sub = '', ratio, layout = 'center' } = {}) {
  const [W, H] = RATIOS[ratio || concept.ratio] || RATIOS['9:16'];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawFrame(ctx, src, W, H, concept);
  if (title) {
    const size = W * (W > H ? .075 : .1);
    ctx.save();
    const grd = ctx.createLinearGradient(0, layout === 'top' ? 0 : H * .45, 0, layout === 'top' ? H * .55 : H);
    grd.addColorStop(layout === 'top' ? 1 : 0, 'rgba(0,0,0,0)'); grd.addColorStop(layout === 'top' ? 0 : 1, 'rgba(0,0,0,.65)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ctx.font = `${concept.weight || 800} ${size}px "${concept.font || 'Pretendard Variable'}", Pretendard, sans-serif`;
    ctx.textAlign = layout === 'left' ? 'left' : 'center'; ctx.textBaseline = 'alphabetic';
    const lines = wrapText(ctx, title, W * .84);
    const x = layout === 'left' ? W * .08 : W / 2;
    let y = layout === 'top' ? H * .14 + size : layout === 'center' ? H / 2 - (lines.length - 1) * size * .6 + size * .35 : H * .9 - (lines.length - 1) * size * 1.15 - (sub ? size * .7 : 0);
    if (sub) { ctx.font = `700 ${size * .42}px "${concept.font || 'Pretendard Variable'}", Pretendard, sans-serif`; ctx.fillStyle = concept.accent || '#4b5bff'; const sw = ctx.measureText(sub).width; const bx = layout === 'left' ? x : x - sw / 2 - size * .25; roundRect(ctx, bx, y - size * 1.45, sw + size * .5, size * .62, size * .15); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(sub, layout === 'left' ? x + size * .25 : x, y - size * 1.0); }
    ctx.font = `${concept.weight || 800} ${size}px "${concept.font || 'Pretendard Variable'}", Pretendard, sans-serif`;
    for (const l of lines) { ctx.lineWidth = size * .08; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeText(l, x, y); ctx.fillStyle = concept.main || '#fff'; ctx.fillText(l, x, y); y += size * 1.15; }
    ctx.restore();
  }
  return canvas;
}

// 자막: 대본을 줄 단위로 나눠 길이에 비례해 시간 배분 (자동 받아쓰기가 없을 때)
export function distributeSubs(text, total, startAt = 0) {
  const lines = String(text).split(/\n+|(?<=[.!?。])\s+/).map(s => s.trim()).filter(Boolean);
  const chars = lines.reduce((s, l) => s + l.length, 0) || 1;
  let t = startAt; const span = Math.max(0.5, total - startAt);
  return lines.map(l => { const d = span * l.length / chars; const s = { start: +t.toFixed(2), end: +(t + d).toFixed(2), text: l }; t += d; return s; });
}
// SRT 내보내기
export function toSrt(subs) {
  const f = s => { const ms = Math.round(s * 1000); const hh = Math.floor(ms / 3600000), mm = Math.floor(ms % 3600000 / 60000), ss = Math.floor(ms % 60000 / 1000), r = ms % 1000; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(r).padStart(3, '0')}`; };
  return subs.map((s, i) => `${i + 1}\n${f(s.start)} --> ${f(s.end)}\n${s.text}\n`).join('\n');
}

// 효과음: 소리 파일 없이 앱이 직접 만들어 내는 소리라 저작권 걱정이 없음
export const SFX = { pop: '뿅', ding: '딩', whoosh: '휙', click: '딸깍', boom: '쿵', rise: '올라가는 소리', sparkle: '반짝' };
const bufCache = new Map();
export function sfxBuffer(ac, kind) {
  const key = kind + ac.sampleRate; if (bufCache.has(key)) return bufCache.get(key);
  const sr = ac.sampleRate, len = { pop: .14, ding: .9, whoosh: .5, click: .04, boom: .7, rise: .6, sparkle: .7 }[kind] || .2;
  const b = ac.createBuffer(1, Math.ceil(sr * len), sr), d = b.getChannelData(0); let ph = 0, lp = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, u = t / len; let f = 440, v = 0;
    if (kind === 'pop') { f = 620 * Math.pow(.28, u); ph += 2 * Math.PI * f / sr; v = Math.sin(ph) * Math.exp(-u * 5); }
    else if (kind === 'ding') v = (Math.sin(2 * Math.PI * 1320 * t) + .5 * Math.sin(2 * Math.PI * 1980 * t) + .25 * Math.sin(2 * Math.PI * 2640 * t)) / 1.75 * Math.exp(-t * 5);
    else if (kind === 'whoosh') { lp += ((Math.random() * 2 - 1) - lp) * (.04 + .25 * Math.sin(Math.PI * u)); v = lp * 2.2 * Math.pow(Math.sin(Math.PI * u), 2); }
    else if (kind === 'click') v = (Math.random() * 2 - 1) * Math.exp(-u * 6);
    else if (kind === 'boom') { f = 95 * Math.pow(.4, u); ph += 2 * Math.PI * f / sr; v = Math.sin(ph) * Math.exp(-u * 3.2); }
    else if (kind === 'rise') { f = 300 * Math.pow(4, u); ph += 2 * Math.PI * f / sr; v = Math.sin(ph) * Math.sin(Math.PI * u) * .8; }
    else if (kind === 'sparkle') { const n = Math.floor(u * 6); f = [1568, 2093, 2637, 3136, 2637, 3520][n] || 2093; v = Math.sin(2 * Math.PI * f * t) * Math.exp(-((u * 6) % 1) * 4) * .7 * (1 - u * .5); }
    d[i] = Math.max(-1, Math.min(1, v));
  }
  bufCache.set(key, b); return b;
}
let demoAc = null;
export function playSfx(kind, vol = .8) { demoAc = demoAc || new (window.AudioContext || window.webkitAudioContext)(); const b = demoAc.createBufferSource(); b.buffer = sfxBuffer(demoAc, kind); const g = demoAc.createGain(); g.gain.value = vol; b.connect(g); g.connect(demoAc.destination); b.start(); }

// 자동 컷 나누기: 화면이 확 바뀌는 곳을 찾음. 0.4초마다 작은 그림으로 줄여 밝기 차이를 봄
export async function detectCuts(el, from = 0, to = el.duration, onProgress) {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 18; const c = cv.getContext('2d', { willReadFrequently: true });
  const step = Math.max(.25, Math.min(.5, (to - from) / 240)); let prev = null; const diffs = [];
  for (let t = from; t < to - .05; t += step) {
    await seek(el, t); c.drawImage(el, 0, 0, 32, 18); const px = c.getImageData(0, 0, 32, 18).data; const cur = new Float32Array(576);
    for (let i = 0; i < 576; i++) cur[i] = .3 * px[i * 4] + .59 * px[i * 4 + 1] + .11 * px[i * 4 + 2];
    if (prev) { let s = 0; for (let i = 0; i < 576; i++) s += Math.abs(cur[i] - prev[i]); diffs.push({ t, d: s / 576 }); }
    prev = cur; onProgress && onProgress((t - from) / (to - from));
  }
  if (!diffs.length) return [];
  const mean = diffs.reduce((a, x) => a + x.d, 0) / diffs.length; const th = Math.max(22, mean * 3);
  const cuts = []; for (const x of diffs) if (x.d > th && (!cuts.length || x.t - cuts[cuts.length - 1] > 1)) cuts.push(+(x.t - step / 2).toFixed(2));
  return cuts.filter(t => t - from > .6 && to - t > .6);
}
