// 영상 살펴보기 (이 기기 안에서): 장면 뽑기 + 앱이 직접 재는 것(비율, 길이, 화질, 밝기, 첫 1초 움직임)
const wait = (el, ev) => new Promise((res, rej) => { const ok = () => { el.removeEventListener(ev, ok); res(); }; el.addEventListener(ev, ok); el.addEventListener('error', () => rej(new Error('영상을 열지 못했어요')), { once: true }); });
export async function inspect(file, { n = 7 } = {}) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
  const url = URL.createObjectURL(file); v.src = url;
  try {
    await wait(v, 'loadedmetadata');
    const dur = v.duration, w = v.videoWidth, h = v.videoHeight;
    if (!dur || !w) throw new Error('영상을 열지 못했어요');
    const times = [0.15, 0.9, 1.8, ...Array.from({ length: Math.max(1, n - 4) }, (_, i) => dur * (i + 1) / (n - 2)), Math.max(0, dur - 0.3)].filter(t => t < dur).slice(0, n);
    const W = 360, H = Math.round(W * h / w);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
    const frames = [];
    for (const t of times) {
      v.currentTime = t; await wait(v, 'seeked');
      x.drawImage(v, 0, 0, W, H);
      const px = x.getImageData(0, 0, W, H).data; let lum = 0; const small = [];
      for (let i = 0; i < px.length; i += 4 * 37) { const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; lum += l; small.push(l); }
      const url2 = c.toDataURL('image/jpeg', 0.72);
      frames.push({ t, lum: lum / small.length, sig: small, url: url2, b64: url2.split(',')[1] });
    }
    const diff = (a, b) => a.sig.reduce((s, l, i) => s + Math.abs(l - (b.sig[i] ?? l)), 0) / a.sig.length;
    const meta = { dur, w, h, ratio: ratioName(w, h), size: file.size };
    return { meta, frames, rules: rules(meta, frames, diff) };
  } finally { URL.revokeObjectURL(url); }
}
const ratioName = (w, h) => { const r = w / h; return Math.abs(r - 9 / 16) < 0.03 ? '9:16 세로' : Math.abs(r - 4 / 5) < 0.03 ? '4:5' : Math.abs(r - 1) < 0.03 ? '1:1 정사각' : Math.abs(r - 16 / 9) < 0.05 ? '16:9 가로' : (r < 1 ? '세로 ' : '가로 ') + r.toFixed(2); };
// lvl: good / warn / bad
function rules(m, f, diff) {
  const out = []; const add = (lvl, msg, how = '') => out.push({ lvl, msg, how });
  const r = m.w / m.h;
  if (Math.abs(r - 9 / 16) < 0.03) add('good', '9:16 세로라 화면을 꽉 채워요');
  else if (r < 1) add('warn', `세로지만 ${ratioName(m.w, m.h)}이에요`, '릴스·틱톡은 9:16(1080×1920)이 가장 크게 보여요');
  else add('bad', '가로 영상이에요', '추천 피드에서 작게 보여요. 9:16으로 잘라 올려요');
  const short = Math.min(m.w, m.h);
  if (short >= 1080) add('good', `화질 ${m.w}×${m.h}`); else if (short >= 720) add('warn', `화질이 조금 낮아요 (${m.w}×${m.h})`, '1080p로 내보내요'); else add('bad', `화질이 낮아요 (${m.w}×${m.h})`, '흐린 영상은 추천에서 밀려요. 1080p로 찍고 내보내요');
  if (m.dur <= 15) add('good', `${m.dur.toFixed(1)}초, 끝까지 보기 쉬운 길이`);
  else if (m.dur <= 35) add('good', `${m.dur.toFixed(1)}초`);
  else if (m.dur <= 90) add('warn', `${Math.round(m.dur)}초, 조금 길어요`, '초반 이탈이 많으면 앞을 잘라 30초 안쪽으로');
  else add('warn', `${Math.round(m.dur)}초, 길어요`, '길게 갈 거면 3초마다 장면·글자를 바꿔 붙잡아요');
  const first = f.slice(0, 3); const move = first.length > 1 ? Math.max(diff(first[0], first[1]), first[2] ? diff(first[1], first[2]) : 0) : 0;
  if (move < 4) add('bad', '첫 2초에 화면이 거의 안 움직여요', '시작하자마자 표정·손짓·컷 전환·글자 중 하나는 있어야 넘기지 않아요');
  else if (move < 10) add('warn', '첫 2초 움직임이 약해요', '첫 장면에 결론이나 가장 예쁜 컷을 먼저 보여 줘요');
  else add('good', '첫 2초에 움직임이 있어요');
  const dark = f.filter(x => x.lum < 55).length;
  if (dark > f.length / 2) add('warn', '전체적으로 어두워요', '창가 쪽이나 조명을 얼굴 앞에 두고 찍어요');
  else if (f.some(x => x.lum > 225)) add('warn', '하얗게 날아간 장면이 있어요', '노출을 한 칸 내려요');
  const flat = f.slice(1).filter((x, i) => diff(f[i], x) < 3).length;
  if (f.length > 4 && flat >= f.length - 2) add('warn', '장면 변화가 거의 없어요', '3~4초마다 컷·각도·자막을 바꿔 리듬을 줘요');
  return out;
}
export async function imgB64(file, max = 1280) {
  const bmp = await createImageBitmap(file); const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return { b64: c.toDataURL('image/jpeg', 0.85).split(',')[1], mime: 'image/jpeg' };
}
