// 음성 받아쓰기 + 녹음.
// 길 두 가지: ① 실시간 받아쓰기(브라우저 내장, 말하는 대로 글이 보임) ② 녹음한 뒤 글로 바꾸기(AI가 소리를 듣거나, 기기 안 Whisper).
// 폰은 마이크를 한 번에 한 곳만 쓸 수 있어서 둘을 같이 켜면 소리가 안 들어감 → 폰에서는 하나만 켜고, ①이 안 되면 알아서 ②로 넘어감.
const UA = navigator.userAgent || '';
export const isIOS = () => /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isMobile = () => /Android/.test(UA) || isIOS();
export const hasSpeech = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
export const canVoice = () => hasSpeech() || canRecord();
// 녹음을 글로 바꿔 줄 것이 이 기기에 있는지 (연결된 AI 또는 기기 안 Whisper)
export async function hasEngine() { try { if (await (await import('./ai.js')).enabled()) return true; return !!(await (await import('./ext.js')).isReady('stt')); } catch { return false; } }
// 이 기기에서 실시간 받아쓰기가 안 됐던 걸 기억해 두고(7일), 다음에는 기다리지 않고 바로 녹음으로 감
const NOLIVE = 'ha:nolive';
const noLive = () => { try { return Date.now() - Number(localStorage.getItem(NOLIVE) || 0) < 7 * 864e5; } catch { return false; } };
const markLive = ok => { try { if (ok) localStorage.removeItem(NOLIVE); else localStorage.setItem(NOLIVE, String(Date.now())); } catch { } };

// onState(상태, 방식): 상태 = recording | denied | unsupported | no-engine(글로 바꿀 방법 없음) | stopped, 방식 = live(실시간) | rec(녹음 뒤 글로)
export function createRecorder({ onText, onInterim, onLevel, onState, record = true, lang = 'ko-KR' } = {}) {
  let rec = null, media = null, stream = null, chunks = [], ctx = null, raf = 0, running = false, finalText = '', interimText = '', startedAt = 0;
  let mode = '', heard = false, gotText = false, told = false, fake = 0, wd = 0, quick = 0, lastStart = 0, bump = () => { };
  const mobile = isMobile();
  const state = s => { if (s !== 'recording' && s !== 'stopped') told = true; try { onState && onState(s, mode); } catch { } };

  function startMedia() {
    if (!stream || !window.MediaRecorder || media) return;
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    media = new MediaRecorder(stream, type ? { mimeType: type } : {});
    media.ondataavailable = e => e.data.size && chunks.push(e.data);
    media.start(1000);
  }
  async function openMic(withMedia) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (withMedia) startMedia();
    try {   /* 소리 막대. 아이폰은 만든 뒤 resume을 해 줘야 움직임 */
      ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume?.().catch(() => { });
      const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); onLevel && onLevel(m / 128); raf = requestAnimationFrame(loop); };
      loop();
    } catch { }
  }
  // 마이크를 따로 열지 않는 실시간 받아쓰기(폰)에서는 소리 크기를 알 수 없어, 글자가 들어올 때마다 움직이게
  function fakeMeter() { let v = 0; bump = () => { v = 0.3 + Math.random() * 0.45; }; fake = setInterval(() => { v = Math.max(0.05, v * 0.75); onLevel && onLevel(v + Math.random() * 0.03); }, 90); }

  function startLive() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return false;
    const mk = () => {
      rec = new SR(); rec.lang = lang; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.continuous = !isIOS();   /* 아이폰은 이어 듣기가 불안정해서 한 마디씩 듣고 다시 켬 */
      rec.onstart = rec.onaudiostart = () => { heard = true; clearTimeout(wd); };
      rec.onresult = e => {
        heard = true; if (!gotText) { gotText = true; markLive(true); } let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i], t = (r[0]?.transcript || '').trim();
          if (r.isFinal) { if (t) { finalText += (finalText ? ' ' : '') + t; onText && onText(finalText, t); } }
          else interim += r[0]?.transcript || '';
        }
        interimText = interim; bump(); onInterim && onInterim(interim);
      };
      rec.onerror = e => { const er = e.error || ''; if (er === 'no-speech' || er === 'aborted') return; fail(er); };
      rec.onend = () => {
        if (!running || mode !== 'live') return;
        if (interimText.trim()) { finalText += (finalText ? ' ' : '') + interimText.trim(); interimText = ''; onText && onText(finalText, ''); }   /* 끝맺음 없이 끊긴 말도 살림 */
        const now = Date.now(); quick = now - lastStart < 700 ? quick + 1 : 0;
        if (quick >= 3) { fail('ended'); return; }   /* 켜자마자 꺼지기를 되풀이 = 이 기기에서는 안 되는 것 */
        try { mk(); lastStart = Date.now(); rec.start(); } catch { fail('restart'); }
      };
    };
    mk();
    try { lastStart = Date.now(); rec.start(); } catch { rec = null; return false; }
    /* 듣기 시작도 못 하면 녹음으로. 마이크 허용 창이 떠 있을 수 있으면 넉넉히 기다림 */
    const arm = ms => { clearTimeout(wd); wd = setTimeout(() => { if (running && mode === 'live' && !heard) fail('silent'); }, ms); };
    arm(8000);
    try { navigator.permissions?.query({ name: 'microphone' }).then(p => { if (!heard && running && mode === 'live') arm(p.state === 'granted' ? 3500 : p.state === 'prompt' ? 30000 : 8000); }).catch(() => { }); } catch { }
    return true;
  }
  // 실시간 받아쓰기가 안 되면 녹음으로 넘어감 (끝낸 뒤 글로 바꿈)
  async function fail(reason) {
    if (!running || mode === 'rec') return;
    clearTimeout(wd); clearInterval(fake); fake = 0;
    try { if (rec) { rec.onend = null; rec.onerror = null; rec.abort?.(); } } catch { } rec = null;
    if (['silent', 'ended', 'nostart', 'restart', 'service-not-allowed', 'language-not-supported'].includes(reason)) markLive(false);
    if (reason === 'not-allowed') { running = false; state('denied'); return; }
    if (!canRecord()) { running = false; state('unsupported'); return; }
    if (!record && !(await hasEngine())) { running = false; state('no-engine'); return; }   /* 녹음해도 글로 바꿀 방법이 없으면 헛되이 말하게 두지 않음 */
    mode = 'rec';
    try { if (!stream) await openMic(true); else startMedia(); state('recording'); }
    catch { running = false; state('denied'); }
  }

  async function start() {
    running = true; finalText = ''; interimText = ''; chunks = []; startedAt = Date.now(); heard = false; gotText = false; told = false; quick = 0;
    let live = hasSpeech();
    if (mobile && live && !record && noLive() && canRecord() && await hasEngine()) live = false;   /* 지난번에 실시간이 안 됐던 기기: 바로 녹음 */
    if (mobile && live && !record) { mode = 'live'; fakeMeter(); if (!startLive()) await fail('nostart'); }
    else if (mobile && !record && !live && !(await hasEngine())) { running = false; mode = 'rec'; state(canRecord() ? 'no-engine' : 'unsupported'); }
    else {
      mode = live && !mobile ? 'live' : 'rec';
      try { await openMic(record || mode === 'rec'); } catch (e) { running = false; state('denied'); throw new Error('마이크를 쓸 수 없어요. 마이크 권한을 허용해 주세요.'); }
      if (mode === 'live' && !startLive()) { mode = 'rec'; startMedia(); }
    }
    if (!running) { const e = new Error(canRecord() ? '마이크를 쓸 수 없어요. 마이크 권한을 허용해 주세요.' : '이 브라우저는 말로 입력할 수 없어요.'); e.told = told; throw e; }
    state('recording');
  }
  async function stop() {
    const was = mode; running = false; clearTimeout(wd); clearInterval(fake); fake = 0;
    if (rec) await new Promise(res => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; rec.onend = fin; try { rec.stop(); } catch { fin(); } setTimeout(fin, 900); });   /* 마지막 말이 글로 굳을 틈을 줌 */
    if (interimText.trim()) { finalText += (finalText ? ' ' : '') + interimText.trim(); interimText = ''; }
    cancelAnimationFrame(raf);
    try { ctx && ctx.close(); } catch { }
    let blob = null;
    if (media && media.state !== 'inactive') {
      blob = await new Promise(res => { media.onstop = () => res(new Blob(chunks, { type: media.mimeType || 'audio/webm' })); media.stop(); });
    }
    stream && stream.getTracks().forEach(t => t.stop());
    state('stopped');
    return { text: finalText, blob, seconds: Math.round((Date.now() - startedAt) / 1000), mode: was };
  }
  return { start, stop, get running() { return running; }, get mode() { return mode; } };
}

// 녹음을 글로: AI가 연결돼 있으면 AI가 듣고, 아니면 기기 안 Whisper(확장 두뇌). 둘 다 없으면 code='no-engine'
export async function toText(blob, onProgress) {
  if (!blob || blob.size < 600) return '';
  const AI = await import('./ai.js');
  if (await AI.enabled()) {
    let pcm = null;
    try { pcm = await (await import('./ext.js')).decode(blob); } catch { }
    if (!pcm) return (await AI.hear(await rawB64(blob), (blob.type || 'audio/webm').split(';')[0])).trim();   /* 풀지 못하는 형식이면 그대로 보냄 */
    const STEP = 16000 * 240, n = Math.max(1, Math.ceil(pcm.length / STEP)), out = [];   /* 4분씩 나눠 보냄 (한 번에 보낼 수 있는 크기 제한) */
    for (let i = 0; i < n; i++) { onProgress && onProgress(i / n); const t = (await AI.hear(wavB64(pcm.subarray(i * STEP, (i + 1) * STEP)), 'audio/wav', { ms: 90000 })).trim(); if (t) out.push(t); }
    onProgress && onProgress(1);
    return out.join(' ');
  }
  const ext = await import('./ext.js');
  if (await ext.isReady('stt')) return ((await ext.transcribe(blob, onProgress)).text || '').trim();
  const e = new Error('말을 글로 바꿀 방법이 이 기기에 아직 없어요'); e.code = 'no-engine'; throw e;
}
const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const rawB64 = async blob => b64(new Uint8Array(await blob.arrayBuffer()));
// 16kHz 모노 Float32 → WAV(16비트)
export function wavB64(f32, rate = 16000) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return b64(new Uint8Array(buf));
}

export function waveEl(n = 24) {
  const w = document.createElement('div'); w.className = 'wave';
  const bars = Array.from({ length: n }, () => { const i = document.createElement('i'); i.style.height = '4px'; w.append(i); return i; });
  const hist = Array(n).fill(0);
  w.level = v => { hist.push(v); hist.shift(); bars.forEach((b, i) => (b.style.height = Math.max(3, Math.min(28, hist[i] * 70)) + 'px')); };
  return w;
}
export const fmtSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
