// AI 키를 다른 기기로 옮기기. QR은 이 기기 안에서만 그리고, 어떤 서버로도 키를 보내지 않는다.
// 주소의 # 뒤(해시)는 서버로 전송되지 않으므로 키를 거기에 싣는다.
import { h, modal, toast, confirmBox } from './ui.js';
import * as db from './db.js';

const KEY = 'secret:gemini';
const link = key => `${location.origin}${location.pathname}#k=${encodeURIComponent(key)}`;
export const keyFrom = s => { const m = /#k=([\w%.~-]{20,200})$/.exec(String(s || '').trim()); if (!m) return ''; try { return decodeURIComponent(m[1]); } catch { return ''; } };

async function save(key) { await db.kvSet(KEY, key); await db.kvSet('ai:model', ''); await db.kvSet('ai:on', true); window.dispatchEvent(new CustomEvent('hajin:ai-key')); }

// 보내는 쪽: 화면에 QR을 띄운다. 60초 뒤 스스로 닫힌다.
export async function showQR() {
  const key = (await db.kvGet(KEY, '')) || '';
  if (!key) { toast('먼저 키를 저장해 주세요'); return; }
  const qrcode = (await import('./vendor-qr.js')).default;
  const q = qrcode(0, 'M'); q.addData(link(key)); q.make();
  const n = q.getModuleCount(), cell = 6, pad = 4, size = (n + pad * 2) * cell;
  const cv = h('canvas.qr-cv', { width: size, height: size, 'aria-label': 'AI 키 QR' }); const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size); cx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) cx.fillRect((c + pad) * cell, (r + pad) * cell, cell, cell);
  let left = 60, timer; const cnt = h('span.faint.tiny', '60초 뒤 닫혀요');
  const close = modal('폰·아이패드로 키 보내기', h('div.stack.qr-box',
    cv,
    h('p.small', '받을 기기에서 비서 앱을 열고 ', h('b', '설정 → 외부 AI 연결 → QR로 키 받기'), '를 눌러 이 QR을 비춰 주세요.'),
    h('p.faint.tiny', '앱을 설치하지 않았다면 기본 카메라로 찍어도 돼요. 이 QR은 키 그 자체라서 다른 사람에게 보이거나 캡처해 두지 마세요. 키는 이 화면에서만 그려지고 어디로도 전송되지 않아요.'),
    h('div.row', { style: { gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
      h('button.btn.sm', { onclick: async e => { try { await navigator.clipboard.writeText(link(key)); e.currentTarget.textContent = '복사했어요. 다른 브라우저 주소창에 붙여 넣으세요'; } catch { toast('복사하지 못했어요'); } } }, '같은 컴퓨터의 다른 브라우저로 옮기기 (링크 복사)')),
    cnt), { onClose: () => clearInterval(timer) });
  timer = setInterval(() => { left -= 1; cnt.textContent = `${left}초 뒤 닫혀요`; if (left <= 0) close(); }, 1000);
}

// 받는 쪽: 카메라로 QR을 읽는다.
export function scan(onDone) {
  let stream, raf, stopped = false;
  const video = h('video', { playsInline: true, muted: true, autoplay: true }); video.setAttribute('playsinline', '');
  const msg = h('p.small.muted', '카메라를 켜는 중…');
  const stop = () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  const close = modal('QR로 키 받기', h('div.stack.qr-box', h('div.qr-cam', video, h('i')), msg,
    h('p.faint.tiny', '키가 있는 기기(PC)에서 설정 → 외부 AI 연결 → "폰·아이패드로 키 보내기"를 누르면 QR이 떠요.')), { onClose: stop });
  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = '이 브라우저는 카메라를 쓸 수 없어요. 키를 직접 붙여 넣어 주세요.'; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch { msg.textContent = '카메라 권한이 없어요. 브라우저 설정에서 카메라를 허용한 뒤 다시 눌러 주세요.'; return; }
    if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = stream; await video.play().catch(() => {});
    const jsQR = (await import('./vendor-jsqr.js')).default;
    const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
    msg.textContent = 'QR을 화면 가운데에 비춰 주세요.';
    let last = 0;
    const tick = async t => {
      if (stopped) return;
      if (t - last > 160 && video.readyState >= 2 && video.videoWidth) {
        last = t; const s = Math.min(1, 720 / video.videoWidth); cv.width = Math.round(video.videoWidth * s); cv.height = Math.round(video.videoHeight * s);
        cx.drawImage(video, 0, 0, cv.width, cv.height);
        let r = null; try { r = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' }); } catch {}
        const k = r && keyFrom(r.data);
        if (k) { stop(); await save(k); close(); toast('AI 키를 받았어요'); onDone && onDone(k); return; }
        if (r && r.data) msg.textContent = '이 QR은 비서 키가 아니에요. PC의 "키 보내기" QR을 비춰 주세요.';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  })();
}

// 기본 카메라로 찍어 주소로 들어온 경우. 키를 꺼낸 즉시 주소에서 지운다.
export async function takeFromHash() {
  const PK = 'hajin:pk'; const ss = { get: () => { try { return sessionStorage.getItem(PK) || ''; } catch { return ''; } }, set: v => { try { v ? sessionStorage.setItem(PK, v) : sessionStorage.removeItem(PK); } catch {} } };
  const inHash = /^#k=/.test(location.hash); const k = inHash ? keyFrom(location.hash) : ss.get();
  if (inHash) history.replaceState(null, '', '#/settings');
  if (!k) return inHash;
  const cur = (await db.kvGet(KEY, '')) || '';
  if (cur === k) { ss.set(''); toast('이미 같은 키가 들어 있어요'); return true; }
  ss.set(k); // 물어보는 사이 화면이 새로고침돼도 이어서 물어보려고 이 탭에만 잠깐 둔다
  setTimeout(async () => {
    const yes = await confirmBox(cur ? '이 링크에 담긴 AI 키로 바꿀까요? 직접 만든 QR이 아니면 취소하세요.' : '이 링크에 담긴 AI 키를 이 기기에 저장할까요? 직접 만든 QR이 아니면 취소하세요.', '저장');
    ss.set(''); if (yes) { await save(k); toast('AI 키를 받았어요'); }
  }, 400);
  return true;
}

// 이 기기에 AI 연결하기: 폰 하나로 끝낼 수 있게 두 단계로 안내 (키 복사 → 붙여넣고 연결). PC가 옆에 있으면 QR로도.
export function guide(onDone) {
  const inp = h('input.in', { type: 'password', placeholder: '여기에 키 붙여넣기', autocomplete: 'off', 'aria-label': 'Gemini API 키' });
  const out = h('p.small', { style: { minHeight: '1.4em' } });
  const looksKey = k => /^[\w-]{30,80}$/.test(k);
  const connect = async k => {
    k = String(k || '').trim(); if (!looksKey(k)) { out.textContent = '키처럼 보이지 않아요. AI Studio에서 키 옆의 복사를 누른 뒤 다시 해 주세요.'; inp.focus(); return; }
    out.textContent = '연결을 시험하는 중…'; await save(k);
    try { const AI = await import('./ai.js'); await AI.ask('“연결됐어요”라고만 답해.', { ms: 15000 }); out.textContent = '연결됐어요. 이제 이 기기에서도 AI가 답해요.'; toast('AI가 연결됐어요'); onDone && onDone(); setTimeout(() => close(), 900); }
    catch (e) { out.textContent = `키는 넣었는데 시험이 안 됐어요: ${e.message}`; onDone && onDone(); }
  };
  const close = modal('이 기기에 AI 연결하기', h('div.stack',
    h('p.small.muted', '연결은 기기마다 한 번만 하면 돼요. 폰 하나로 1분이면 끝나요.'),
    h('a.btn', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener', style: { minHeight: '44px', justifyContent: 'center' } }, '① Google AI Studio 열기'),
    h('p.faint.tiny', '구글에 로그인하면 전에 만든 키가 보여요. 키를 눌러 “복사”를 누르고 이 화면으로 돌아오세요. 키가 없으면 “API 키 만들기”를 누르면 돼요(무료, 카드 등록 없음).'),
    h('button.btn.pri', { style: { minHeight: '44px' }, onclick: async () => { let k = ''; try { k = await navigator.clipboard.readText(); } catch { } if (looksKey(String(k).trim())) connect(k); else { out.textContent = '복사한 키를 못 읽었어요. 아래 칸을 길게 눌러 붙여넣고 “연결”을 눌러 주세요.'; inp.focus(); } } }, '② 복사한 키 붙여넣고 연결'),
    h('div.row', { style: { gap: '6px' } }, h('div.grow', inp), h('button.btn.sm', { style: { minHeight: '44px' }, onclick: () => connect(inp.value) }, '연결')),
    out,
    h('p.faint.tiny', 'PC가 옆에 있으면 PC 앱의 설정 → 외부 AI 연결 → “폰·아이패드로 키 보내기”를 누르고 아래 버튼으로 QR을 비춰도 돼요. 키는 이 기기에만 저장돼요.'),
    h('button.btn.sm', { style: { minHeight: '44px' }, onclick: () => { close(); scan(() => { toast('AI가 연결됐어요'); onDone && onDone(); }); } }, 'QR로 키 받기')));
  setTimeout(() => { try { inp.blur(); } catch { } }, 80);   /* 폰에서 자판이 먼저 올라와 버튼을 가리지 않게 */
  return close;
}

