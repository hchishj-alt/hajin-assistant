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
export function drawFrame(ctx, src, W, H, c, { zoom = 1, t = 0, dx = 0, dy = 0 } = {}) {
  const L = c.look || {};
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (src) {
    const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
    if (sw && sh) {
      const k = Math.max(W / sw, H / sh) * zoom;
      const dw = sw * k, dh = sh * k;
      ctx.filter = `brightness(${L.brightness ?? 1}) contrast(${L.contrast ?? 1}) saturate(${L.saturate ?? 1})`;
      ctx.drawImage(src, (W - dw) / 2 + dx * W, (H - dh) / 2 + dy * H, dw, dh);
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

export function drawSubtitle(ctx, text, W, H, c, scale = 1, age = 9) {
  if (!text) return;
  const an = c.edit?.subAnim || 'none';
  if (an === 'type') text = [...text].slice(0, Math.max(1, Math.ceil(age * 22))).join('');
  if (an === 'pop' && age < .18) scale *= .7 + .3 * easeOut(age / .18);
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
    if (s.style === 'highlight') { ctx.fillStyle = c.accent || '#ffe14d'; roundRect(ctx, W / 2 - w / 2 - size * .25, y - lh / 2 + lh * .12, w + size * .5, lh * .8, size * .12); ctx.fill(); }
    if (s.style === 'box') { ctx.fillStyle = c.box || 'rgba(0,0,0,.45)'; roundRect(ctx, W / 2 - w / 2 - size * .4, y - lh / 2 + 2, w + size * .8, lh - 4, size * .25); ctx.fill(); }
    if (s.style === 'stroke') { ctx.lineWidth = size * .14; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(ln, W / 2, y); }
    if (s.style === 'plain') { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * .3; }
    ctx.fillStyle = s.style === 'highlight' ? (c.hlInk || '#14151a') : (c.main || '#fff'); ctx.fillText(ln, W / 2, y);
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
// 클립 길이(초). 이 기기에서 못 여는 영상은 길이를 모르므로 0 (그런 클립은 건너뜀)
export const clipLen = k => { if (k.bad) return 0; if (k.type === 'image') return k.dur || 3; const d = (k.out ?? k.el.duration ?? 0) - (k.in || 0); return Number.isFinite(d) ? Math.max(.3, d) : 0; };

// 만들 파일 형식: 아이폰·인스타·카톡에서 바로 열리는 mp4(H.264+AAC)를 먼저, 안 되면 webm.
// 크롬의 그냥 'video/mp4'는 속이 VP9이라 아이폰에서 안 열리므로 맨 뒤.
// 사파리와 아이폰·아이패드의 모든 브라우저(속이 같은 엔진)는 그냥 'video/mp4'가 H.264+AAC라서 그대로 어디서나 열림.
const APPLE = typeof navigator !== 'undefined' && /AppleWebKit/.test(navigator.userAgent || '') && !/Chrome\/|Chromium\/|Edg\/|Android/.test(navigator.userAgent || '');
export function recType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const AAC = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2'], WEBM = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const C = APPLE ? [...AAC, 'video/mp4', ...WEBM] : [...AAC, 'video/mp4;codecs=avc1.42E01E,opus', 'video/mp4;codecs=avc1,opus', ...WEBM, 'video/mp4'];
  return C.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) ?? '';
}
// 만든 파일이 어디서나 열리는 형식인지 (mp4 + H.264 + AAC)
export const plays = type => /mp4/.test(type || '') && !/opus/.test(type || '') && (/avc1/.test(type || '') || APPLE);

// 소리 길: 영상·음악 요소는 평생 한 번만 소리 길에 꽂을 수 있어서(두 번째부터는 오류) 한 번 꽂은 것을 계속 다시 씀.
// 예전에는 미리보기를 한 번 하고 나면 영상 만들기에 클립 소리가 안 들어갔음.
let AC = null; const SRC = new WeakMap();
function audioCtx() { if (!AC || AC.state === 'closed') AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function srcOf(el) { let n = SRC.get(el); if (!n || n.context !== audioCtx()) { n = audioCtx().createMediaElementSource(el); SRC.set(el, n); } return n; }

export function createPlayer(canvas, clips, concept, subs, { logo = null, music = null, musicVol = .35, sfx = [], onTime, onEnd, onError, record = false } = {}) {
  const [W, H] = RATIOS[concept.ratio] || RATIOS['9:16'];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  clips = clips.filter(k => clipLen(k) > 0);
  let ac = null, dest = null, raf = 0, stopped = false, paused = false, pauseAt = 0, idx = -1, base = 0, clipT0 = 0, ready = false, rec = null, chunks = [], wake = null, errs = 0, lastT = -1, lastMove = 0;
  const total = totalDuration(clips, concept);
  const gains = new Map(), made = [], bufs = [];
  function audioSetup() {
    ac = audioCtx();
    dest = ac.createMediaStreamDestination();
    const wire = (el, vol) => { try { const g = ac.createGain(); g.gain.value = vol; srcOf(el).connect(g); g.connect(dest); if (!record) g.connect(ac.destination); made.push(g); return g; } catch { return null; } };
    for (const k of clips) if (k.type === 'video' && !gains.has(k.el)) gains.set(k.el, wire(k.el, k.vol ?? 1));
    if (music) wire(music, musicVol);
  }
  const cues = sfx.filter(x => (x.t || 0) < total).sort((a, b) => (a.t || 0) - (b.t || 0)); let sfxAt = 0;
  const fire = x => { try { const b = ac.createBufferSource(); b.buffer = sfxBuffer(ac, x.kind); const g = ac.createGain(); g.gain.value = x.vol ?? .8; b.connect(g); g.connect(dest); if (!record) g.connect(ac.destination); b.start(); bufs.push(b); made.push(g); } catch { } };
  const waitSeek = (v, t) => new Promise(res => { let done = false; const end = () => { if (done) return; done = true; v.removeEventListener('seeked', end); res(); }; v.addEventListener('seeked', end); try { v.currentTime = t; } catch { end(); } setTimeout(end, 4000); });
  async function startClip(i) {
    const prev = clips[idx], nx = clips[i];
    const joined = !!(prev && nx && prev.type === 'video' && nx.type === 'video' && prev.el === nx.el && !prev.el.ended && Math.abs(prev.el.currentTime - (nx.in || 0)) < .12);
    if (prev && prev.type === 'video' && !joined) prev.el.pause();
    if (i > 0 && clips[i - 1]) base += clipLen(clips[i - 1]);
    idx = i; const k = clips[i]; if (!k) return finish();
    ready = false; lastT = -1; lastMove = performance.now();
    if (k.type === 'video') {
      if (!joined) await waitSeek(k.el, k.in || 0); if (stopped) return;
      k.el.muted = false; const g = gains.get(k.el); if (g) g.gain.value = k.vol ?? 1;
      if (!paused) { try { await k.el.play(); } catch { } }
    }
    clipT0 = performance.now(); ready = true;
  }
  function frame() {
    if (stopped || paused) return;
    raf = requestAnimationFrame(frame);
    const k = clips[idx];
    if (!k || !ready) return;   /* 다음 클립 자리를 찾는 동안은 앞 장면을 그대로 둠 */
    const len = clipLen(k);
    /* 영상 클립은 벽시계가 아니라 영상이 실제로 간 만큼 셈 (폰이 버벅여도 끝이 잘리거나 자막이 밀리지 않음) */
    const local = k.type === 'video' ? Math.max(0, k.el.currentTime - (k.in || 0)) : (performance.now() - clipT0) / 1000;
    const now = performance.now();
    if (k.type === 'video') { if (local !== lastT) { lastT = local; lastMove = now; } else if (now - lastMove > 6000) { ready = false; startClip(idx + 1); return; } }   /* 6초 넘게 멈춘 영상은 건너뜀 (영영 안 끝나는 것 막기) */
    if (local >= len - .01 || (k.type === 'video' && k.el.ended)) { ready = false; startClip(idx + 1); return; }
    const T = base + Math.min(local, len);
    try {
      const m = motionAt(concept, k, local, len, idx);
      drawFrame(ctx, k.el, W, H, concept, { ...m, t: Math.floor(T * 24) });
      transitionAt(ctx, W, H, concept, local, idx);
      drawOverlay(ctx, W, H, concept, { T, total, idx, n: clips.length });
      const s = subs.find(x => T >= x.start && T < x.end);
      if (s) drawSubtitle(ctx, s.text, W, H, concept, 1, T - s.start);
      if (concept.intro && T < 2.2) drawTitleCard(ctx, concept.intro, W, H, concept, T < 1.8 ? 1 : 1 - (T - 1.8) / .4);
      if (concept.outro && T > total - 2) drawTitleCard(ctx, concept.outro, W, H, concept, Math.min(1, (T - (total - 2)) / .4), concept.hashtags?.split(/\s+/).slice(0, 3).join(' '));
      drawLogo(ctx, logo, W, H, concept.logoPos);
      errs = 0;
      while (sfxAt < cues.length && (cues[sfxAt].t || 0) <= T) fire(cues[sfxAt++]);
    } catch (e) { if (++errs > 60) { console.error(e); onError && onError(e); return finish(true); } }   /* 한두 장면 못 그린 것은 넘기고, 계속 못 그리면 멈춤 */
    onTime && onTime(T, total);
  }
  function pause() {
    if (paused || stopped) return; paused = true; pauseAt = performance.now(); cancelAnimationFrame(raf);
    const k = clips[idx]; if (k && k.type === 'video') k.el.pause(); music && music.pause();
    try { ac && ac.suspend(); } catch { } try { if (rec && rec.state === 'recording') rec.pause(); } catch { }
  }
  function resume() {
    if (!paused || stopped) return; paused = false; const gap = performance.now() - pauseAt; clipT0 += gap; lastMove += gap;
    try { ac && ac.resume(); } catch { } try { if (rec && rec.state === 'paused') rec.resume(); } catch { }
    const k = clips[idx]; if (k && k.type === 'video' && ready) k.el.play().catch(() => { }); if (music) music.play().catch(() => { });
    raf = requestAnimationFrame(frame);
  }
  /* 다른 앱이나 탭으로 가면 화면을 못 그리므로 그동안 멈췄다가 돌아오면 이어서 (안 그러면 그 구간이 멈춘 화면으로 찍힘) */
  const onVis = () => (document.visibilityState === 'hidden' ? pause() : resume());
  function finish(failed) {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis);
    clips.forEach(k => k.type === 'video' && k.el.pause()); music && music.pause();
    bufs.forEach(b => { try { b.stop(); } catch { } }); made.forEach(g => { try { g.disconnect(); } catch { } });
    try { wake && wake.release(); } catch { }
    try { if (ac && ac.state === 'suspended') ac.resume(); } catch { }
    if (rec && rec.state !== 'inactive') { if (failed === true) { rec.onstop = () => onEnd && onEnd(null); } rec.stop(); } else onEnd && onEnd(null);
  }
  return {
    W, H, total,
    async play() {
      if (!clips.length) { stopped = true; onEnd && onEnd(null); return; }
      audioSetup();
      for (const el of new Set([...clips.filter(k => k.type === 'video').map(k => k.el), ...(music ? [music] : [])])) { try { const pr = el.play(); if (pr && pr.catch) pr.catch(() => { }); el.pause(); } catch { } }
      try { await ac.resume(); } catch { }
      if (record) {
        const type = recType();
        if (type == null) { stopped = true; onError && onError(new Error('이 브라우저는 영상 만들기를 지원하지 않아요')); onEnd && onEnd(null); return; }
        const stream = canvas.captureStream(30);
        dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: W * H >= 1920 * 1080 ? 8_000_000 : 6_000_000, audioBitsPerSecond: 128_000 });
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        rec.onstop = () => onEnd && onEnd(new Blob(chunks, { type: rec.mimeType || type || 'video/webm' }), { type: type || rec.mimeType || '' });
        rec.onerror = e => { console.error(e.error || e); onError && onError(e.error || new Error('녹화 중 오류')); };
        rec.start(1000);
        try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => { if (stopped) l.release(); else wake = l; }).catch(() => { }); } catch { }   /* 만드는 동안 화면이 꺼지지 않게 */
      }
      document.addEventListener('visibilitychange', onVis);
      if (music) { music.currentTime = 0; music.loop = true; try { await music.play(); } catch { } }
      stopped = false;
      base = 0; await startClip(0);
      raf = requestAnimationFrame(frame);
    },
    stop: () => finish(),
    cancel: () => finish(true),   /* 만들던 것을 버리고 멈춤 */
    pause, resume,
    close() { finish(true); },
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

// ── 콘셉트 = 편집 방식 (색감만이 아니라 컷 길이·움직임·전환·화면 틀·시간 표시·자막 등장·효과음까지) ──
const easeOut = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
export const EDIT_DEFAULT = { cut: 0, motion: 'kenburns', trans: 'cut', frame: 'none', stamp: 'none', progress: false, subAnim: 'none', sfxCut: '', startTime: '08:00', stepMin: 60, dayLabel: '' };
export const OPTS = {
  motion: [['none', '고정'], ['kenburns', '천천히 다가가기'], ['punch', '컷마다 훅 당기기'], ['handheld', '손으로 든 느낌'], ['drift', '옆으로 흐르기']],
  trans: [['cut', '바로 넘기기'], ['fade', '어둡게 넘기기'], ['flash', '번쩍'], ['slide', '밀어 넘기기'], ['zoom', '확대하며 넘기기']],
  frame: [['none', '없음'], ['letterbox', '영화 띠'], ['polaroid', '폴라로이드'], ['border', '색 테두리'], ['camcorder', '캠코더'], ['paper', '종이 다이어리']],
  stamp: [['none', '없음'], ['time', '시간 (컷마다 흐름)'], ['date', '날짜'], ['day', 'DAY 라벨'], ['count', '컷 번호']],
  subAnim: [['none', '그냥 나타남'], ['pop', '톡 튀어나옴'], ['type', '한 글자씩']],
};
export function motionAt(c, k, local, len, idx) {
  const e = c.edit || {}; const u = len ? local / len : 0; const mo = e.motion || (k.type === 'image' ? 'kenburns' : 'none');
  let zoom = 1, dx = 0, dy = 0;
  if (mo === 'kenburns') zoom = 1 + .07 * u;
  else if (mo === 'punch') zoom = 1.02 + .12 * (1 - easeOut(local / .28));
  else if (mo === 'handheld') { zoom = 1.05; dx = .006 * Math.sin(local * 2.1 + idx); dy = .005 * Math.sin(local * 1.7 + idx * 2); }
  else if (mo === 'drift') { zoom = 1.08; dx = (idx % 2 ? 1 : -1) * .03 * (u - .5); }
  if (idx > 0 && e.trans === 'zoom' && local < .3) zoom *= 1 + .25 * (1 - easeOut(local / .3));
  if (idx > 0 && e.trans === 'slide' && local < .28) dx += (1 - easeOut(local / .28)) * .5;
  return { zoom, dx, dy };
}
export function transitionAt(ctx, W, H, c, local, idx) {
  const tr = c.edit?.trans; if (!idx || local > .32) return;
  if (tr === 'fade') { ctx.fillStyle = `rgba(0,0,0,${1 - local / .32})`; ctx.fillRect(0, 0, W, H); }
  if (tr === 'flash') { ctx.fillStyle = `rgba(255,255,255,${Math.max(0, .85 - local / .22)})`; ctx.fillRect(0, 0, W, H); }
}
const addMin = (hm, m) => { const [h, mi] = hm.split(':').map(Number); const t = ((h * 60 + mi + m) % 1440 + 1440) % 1440; return [Math.floor(t / 60), t % 60]; };
export function drawOverlay(ctx, W, H, c, { T = 0, total = 1, idx = 0, n = 1 } = {}) {
  const e = c.edit || {}; const u = W / 1080; const font = `"${c.font || 'Pretendard Variable'}", Pretendard, sans-serif`;
  ctx.save();
  if (e.frame === 'letterbox') { const b = H * (W > H ? .11 : .09); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); }
  if (e.frame === 'polaroid' || e.frame === 'paper') { const m = 46 * u, bot = (e.frame === 'polaroid' ? 190 : 46) * u; ctx.fillStyle = e.frame === 'paper' ? '#f6f1e6' : '#fff'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(m, m, W - m * 2, H - m - bot); ctx.fill('evenodd');
    if (e.frame === 'paper') { ctx.strokeStyle = 'rgba(60,50,40,.35)'; ctx.lineWidth = 3 * u; ctx.setLineDash([14 * u, 10 * u]); ctx.strokeRect(m - 12 * u, m - 12 * u, W - m * 2 + 24 * u, H - m - bot + 24 * u); ctx.setLineDash([]); } }
  if (e.frame === 'border') { ctx.strokeStyle = c.accent || '#fff'; ctx.lineWidth = 26 * u; ctx.strokeRect(13 * u, 13 * u, W - 26 * u, H - 26 * u); }
  if (e.frame === 'camcorder') {
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 5 * u; const m = 60 * u, L = 90 * u;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { ctx.beginPath(); ctx.moveTo(x + L * sx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + L * sy); ctx.stroke(); }
    if (Math.floor(T * 2) % 2 === 0) { ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(m + 40 * u, m + 46 * u, 13 * u, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = `700 ${34 * u}px ui-monospace, Menlo, monospace`; ctx.textBaseline = 'middle'; ctx.fillText('REC', m + 64 * u, m + 48 * u);
    const tc = `${String(Math.floor(T / 60)).padStart(2, '0')}:${String(Math.floor(T % 60)).padStart(2, '0')}:${String(Math.floor((T % 1) * 30)).padStart(2, '0')}`; ctx.textAlign = 'right'; ctx.fillText(tc, W - m - 30 * u, m + 48 * u);
  }
  const st = e.stamp; let label = '';
  if (st === 'time') { const [h, mi] = addMin(e.startTime || '08:00', idx * (e.stepMin ?? 60)); label = `${h < 12 ? 'AM' : 'PM'} ${String(h % 12 || 12).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; }
  if (st === 'date') { const d = new Date(); label = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]}`; }
  if (st === 'day') label = e.dayLabel || 'DAY 1';
  if (st === 'count') label = `${String(idx + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  if (label) {
    const size = 40 * u, x = (e.frame === 'camcorder' ? 100 : 64) * u, y = e.frame === 'camcorder' ? H - 120 * u : (e.frame === 'letterbox' ? H * .09 + 70 * u : 110 * u);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (e.frame === 'camcorder' || st === 'date') { ctx.font = `700 ${size}px ui-monospace, Menlo, monospace`; ctx.fillStyle = e.frame === 'camcorder' ? '#ffb020' : '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8 * u; ctx.fillText(label, x, y); }
    else { ctx.font = `800 ${size}px ${font}`; const w = ctx.measureText(label).width; ctx.fillStyle = st === 'day' ? (c.accent || '#4b5bff') : 'rgba(0,0,0,.42)'; roundRect(ctx, x - 22 * u, y - size * .78, w + 44 * u, size * 1.56, size * .78); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + 2 * u); }
    ctx.shadowBlur = 0;
  }
  if (e.progress) { ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(0, H - 10 * u, W, 10 * u); ctx.fillStyle = c.accent || '#fff'; ctx.fillRect(0, H - 10 * u, W * Math.min(1, T / (total || 1)), 10 * u); }
  ctx.restore();
}
// 콘셉트의 편집 방식을 클립에 적용: 컷 길이 맞추기 + 컷마다 효과음
export function applyConcept(clips, c) {
  const e = c.edit || {}; let n = 0;
  if (e.cut > 0) for (const k of clips) {
    if (k.type === 'image') { if (k.dur !== e.cut) { k.dur = e.cut; n++; } continue; }
    const a = k.in || 0, b = k.out ?? k.el.duration; if (b - a > e.cut + .15) { const mid = (a + b) / 2; k.in = +(Math.max(a, mid - e.cut / 2)).toFixed(2); k.out = +(k.in + e.cut).toFixed(2); n++; }
  }
  const sfx = []; if (e.sfxCut) { let t = 0; clips.slice(0, -1).forEach(k => { t += clipLen(k); sfx.push({ t: +t.toFixed(2), kind: e.sfxCut, vol: .55 }); }); }
  return { trimmed: n, sfx };
}
const FONT_W = { 'Gaegu': '400;700', 'Gowun Dodum': '400', 'Jua': '400', 'Noto Serif KR': '500;700', 'Nanum Pen Script': '400', 'Black Han Sans': '400', 'IBM Plex Sans KR': '500;700' };
export async function ensureFont(name) {
  if (!name || /Pretendard/.test(name) || !FONT_W[name]) return;
  const id = 'vf-' + name.replace(/\s/g, ''); if (!document.getElementById(id)) { const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:wght@${FONT_W[name]}&display=swap`; document.head.append(l); }
  try { await Promise.race([document.fonts.load(`700 40px "${name}"`, '가나다'), new Promise(r => setTimeout(r, 2500))]); } catch { }
}
export const FONT_NAMES = ['Pretendard Variable', ...Object.keys(FONT_W)];
const L = (b, ct, s, w, f, v, g) => ({ brightness: b, contrast: ct, saturate: s, warmth: w, fade: f, vignette: v, grain: g });
const P = (name, about, look, o = {}, edit = {}, music = '') => ({ ...DEFAULT_CONCEPT, name, about, music, look, ...o, sub: { ...DEFAULT_CONCEPT.sub, ...(o.sub || {}) }, edit: { ...EDIT_DEFAULT, ...edit } });
// 일상 브이로그 숏폼에서 널리 쓰이는 편집 방식 20가지 (특정 사람을 베낀 게 아니라 형식을 정리한 것). 전부 복사해서 고칠 수 있음
export const PRESETS = [
  P('미니멀 일상', '작은 흰 자막, 느린 호흡, 여백 많은 화면', L(1.04, .98, .95, .04, .08, .1, .03), { weight: 600, sub: { size: 40, style: 'plain' } }, { cut: 3, motion: 'kenburns', trans: 'cut' }, '잔잔한 피아노·로파이'),
  P('타임스탬프 하루', '컷마다 시간이 흐르는 하루 요약', L(1.03, 1.05, 1.05, 0, 0, .15, .03), { sub: { size: 46, style: 'box' } }, { cut: 2, motion: 'punch', stamp: 'time', startTime: '07:00', stepMin: 90, sfxCut: 'click' }, '경쾌한 어쿠스틱'),
  P('캠코더 Y2K', 'REC 표시와 거친 입자, 옛날 캠코더 느낌', L(1.05, .92, .85, .12, .2, .3, .2), { font: 'IBM Plex Sans KR', weight: 700, main: '#fff7d6', sub: { size: 44, style: 'stroke' } }, { cut: 2.5, motion: 'handheld', frame: 'camcorder', stamp: 'date', trans: 'cut' }, '2000년대 팝·시티팝'),
  P('필름 무드', '영화 띠와 느린 페이드, 말 없는 영상에 맞음', L(1.0, .95, .82, .2, .16, .4, .14), { font: 'Noto Serif KR', weight: 500, sub: { size: 38, style: 'plain', pos: 'bottom' } }, { cut: 3.5, motion: 'kenburns', frame: 'letterbox', trans: 'fade' }, '재즈·앰비언트'),
  P('GRWM 수다', '말하는 영상용. 컷마다 훅 당기고 큰 자막이 톡', L(1.06, 1.06, 1.12, .05, 0, .08, .02), { weight: 900, sub: { size: 62, style: 'stroke', pos: 'middle' } }, { cut: 0, motion: 'punch', subAnim: 'pop', sfxCut: 'pop' }, '밝은 팝 반주'),
  P('카페 감성', '따뜻한 색, 폴라로이드 틀, 손글씨 자막', L(1.05, .96, .95, .22, .1, .15, .06), { font: 'Gaegu', weight: 700, main: '#3b2f25', sub: { size: 56, style: 'highlight', pos: 'bottom' }, accent: '#fff3d1', hlInk: '#3b2f25' }, { cut: 2.5, motion: 'kenburns', frame: 'polaroid', trans: 'fade' }, '보사노바·어쿠스틱 기타'),
  P('스터디 위드 미', '진행 막대와 시간 표시, 차분한 푸른 톤', L(1.02, 1.02, .9, -.12, .08, .2, .04), { weight: 700, sub: { size: 42, style: 'box' }, accent: '#8fb8ff' }, { cut: 3, motion: 'none', stamp: 'time', startTime: '09:00', stepMin: 60, progress: true, trans: 'fade' }, '로파이·빗소리'),
  P('왓 아이 잇', '쨍한 음식 색, 형광펜 자막, 뿅 효과음', L(1.06, 1.12, 1.28, .06, 0, .1, .02), { weight: 800, sub: { size: 54, style: 'highlight' }, accent: '#ffe14d' }, { cut: 1.8, motion: 'punch', subAnim: 'pop', sfxCut: 'pop', stamp: 'count' }, '통통 튀는 우쿨렐레'),
  P('출근 브이로그', 'DAY 라벨과 시간, 담백한 직장인 하루', L(1.02, 1.04, 1.0, 0, .04, .15, .04), { weight: 700, sub: { size: 46, style: 'box' } }, { cut: 2.5, motion: 'handheld', stamp: 'day', dayLabel: 'MON', trans: 'cut' }, '가벼운 시티팝'),
  P('주말 몰아보기', '1초대 빠른 컷, 번쩍 전환, 휙 효과음', L(1.05, 1.14, 1.2, .04, 0, .12, .03), { weight: 900, sub: { size: 58, style: 'stroke' } }, { cut: 1.2, motion: 'punch', trans: 'flash', sfxCut: 'whoosh', stamp: 'count' }, '빠른 비트·하우스'),
  P('룸투어·정리', '깨끗한 화면, 옆으로 밀어 넘기기', L(1.08, 1.0, 1.02, -.04, .06, 0, .02), { weight: 700, sub: { size: 44, style: 'box' } }, { cut: 2.5, motion: 'drift', trans: 'slide', sfxCut: 'whoosh' }, '깔끔한 로파이'),
  P('언박싱·하울', '훅 당기는 컷, 딩 효과음, 형광펜 자막', L(1.06, 1.08, 1.15, .03, 0, .1, .02), { weight: 800, sub: { size: 56, style: 'highlight' }, accent: '#b8f2c9' }, { cut: 2, motion: 'punch', trans: 'zoom', subAnim: 'pop', sfxCut: 'ding', stamp: 'count' }, '신나는 팝'),
  P('작업 과정', '그림·디자인 과정용. 진행 막대와 컷 번호', L(1.04, 1.04, 1.05, 0, 0, .1, .03), { weight: 700, sub: { size: 44, style: 'box' } }, { cut: 1.5, motion: 'none', progress: true, stamp: 'count', trans: 'cut', sfxCut: 'click' }, '집중되는 로파이'),
  P('드로잉 타임랩스', '말 없이 과정만. 한 글자씩 나오는 자막', L(1.05, 1.02, 1.08, .02, .04, .08, .02), { font: 'Gowun Dodum', weight: 400, sub: { size: 42, style: 'plain', pos: 'top' } }, { cut: 1, motion: 'none', progress: true, subAnim: 'type', trans: 'cut' }, '잔잔한 오르골'),
  P('전시·나들이', '영화 띠와 날짜, 천천히 흐르는 화면', L(1.0, 1.08, .92, -.06, .06, .35, .08), { font: 'Noto Serif KR', weight: 700, sub: { size: 42, style: 'plain' } }, { cut: 3, motion: 'drift', frame: 'letterbox', stamp: 'date', trans: 'fade' }, '시네마틱 스트링'),
  P('다이어리 손글씨', '종이 틀과 손글씨, 날짜가 찍힌 일기장', L(1.06, .94, .9, .14, .14, .05, .08), { font: 'Nanum Pen Script', weight: 400, main: '#2f2a25', sub: { size: 66, style: 'highlight' }, accent: '#fffdf5', hlInk: '#2f2a25' }, { cut: 2.5, motion: 'kenburns', frame: 'paper', stamp: 'date', subAnim: 'type' }, '포근한 피아노'),
  P('흑백 에세이', '흑백, 가운데 명조 자막, 느린 호흡', L(1.02, 1.18, 0, 0, .06, .4, .12), { font: 'Noto Serif KR', weight: 500, sub: { size: 44, style: 'plain', pos: 'middle' } }, { cut: 4, motion: 'kenburns', trans: 'fade', subAnim: 'type' }, '피아노 독주'),
  P('하이틴 팝', '쨍한 색, 분홍 테두리, 톡 튀는 자막', L(1.08, 1.1, 1.35, .05, .04, 0, .02), { font: 'Jua', weight: 400, sub: { size: 58, style: 'highlight' }, accent: '#ff8fc7', hlInk: '#fff' }, { cut: 1.6, motion: 'punch', frame: 'border', subAnim: 'pop', sfxCut: 'sparkle', trans: 'flash' }, '하이틴 팝·케이팝 반주'),
  P('새벽 감성', '푸르고 어두운 톤, 작은 자막, 어둡게 넘기기', L(.94, 1.06, .85, -.2, .1, .5, .1), { weight: 500, sub: { size: 38, style: 'plain' }, accent: '#9db4ff' }, { cut: 3.5, motion: 'handheld', trans: 'fade', stamp: 'time', startTime: '23:30', stepMin: 30 }, '몽환적인 신스'),
  P('유튜브 가로 브이로그', '1920×1080 가로. 아래 자막과 DAY 라벨, 진행 막대', L(1.03, 1.05, 1.04, .02, .03, .15, .03), { ratio: '16:9', weight: 700, sub: { size: 34, style: 'box', pos: 'bottom' } }, { cut: 4, motion: 'kenburns', stamp: 'day', dayLabel: 'VLOG', progress: true, trans: 'fade' }, '브이로그용 어쿠스틱'),
];
