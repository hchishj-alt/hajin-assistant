// 음성 받아쓰기 + 녹음.
// 1순위: 브라우저 내장 음성인식(키 없음, 실시간). 2순위: 확장 두뇌(기기 내 Whisper, 녹음 파일 받아쓰기).
export const hasSpeech = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function createRecorder({ onText, onInterim, onLevel, onState, record = true, lang = 'ko-KR' } = {}) {
  let rec = null, media = null, stream = null, chunks = [], ctx = null, raf = 0, running = false, finalText = '', startedAt = 0;
  async function start() {
    running = true; finalText = ''; chunks = []; startedAt = Date.now();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { running = false; onState && onState('denied'); throw new Error('마이크 권한이 필요해요'); }
    if (record && window.MediaRecorder) {
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
      media = new MediaRecorder(stream, type ? { mimeType: type } : {});
      media.ondataavailable = e => e.data.size && chunks.push(e.data);
      media.start(1000);
    }
    // 레벨 미터
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); onLevel && onLevel(m / 128); raf = requestAnimationFrame(loop); };
      loop();
    } catch { }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const mk = () => {
        rec = new SR(); rec.lang = lang; rec.continuous = true; rec.interimResults = true;
        rec.onresult = e => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) { finalText += (finalText ? ' ' : '') + r[0].transcript.trim(); onText && onText(finalText, r[0].transcript.trim()); }
            else interim += r[0].transcript;
          }
          onInterim && onInterim(interim);
        };
        rec.onerror = e => { if (e.error === 'not-allowed') onState && onState('denied'); };
        rec.onend = () => { if (running) { try { mk(); rec.start(); } catch { } } }; // 끊기면 자동으로 이어 듣기
      };
      mk(); try { rec.start(); } catch { }
    }
    onState && onState('recording');
  }
  async function stop() {
    running = false;
    try { rec && rec.stop(); } catch { }
    cancelAnimationFrame(raf);
    try { ctx && ctx.close(); } catch { }
    let blob = null;
    if (media && media.state !== 'inactive') {
      blob = await new Promise(res => { media.onstop = () => res(new Blob(chunks, { type: media.mimeType || 'audio/webm' })); media.stop(); });
    }
    stream && stream.getTracks().forEach(t => t.stop());
    onState && onState('stopped');
    return { text: finalText, blob, seconds: Math.round((Date.now() - startedAt) / 1000) };
  }
  return { start, stop, get running() { return running; } };
}

export function waveEl(n = 24) {
  const w = document.createElement('div'); w.className = 'wave';
  const bars = Array.from({ length: n }, () => { const i = document.createElement('i'); i.style.height = '4px'; w.append(i); return i; });
  const hist = Array(n).fill(0);
  w.level = v => { hist.push(v); hist.shift(); bars.forEach((b, i) => (b.style.height = Math.max(3, Math.min(28, hist[i] * 70)) + 'px')); };
  return w;
}
export const fmtSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
