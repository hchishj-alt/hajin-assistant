// 카드 결제 어댑터. 결제사(포트원)를 바꾸거나 붙일 때는 이 파일과 Edge Function만 고친다.
// 화면(plan.js)은 cardReady(), startCard(), redirectKey(), issue() 네 개만 쓴다.
import { PORTONE, SB, PRICE } from './config.js';

export const cardReady = () => !!(PORTONE.storeId && PORTONE.channelKey);

// 결제사에는 복구 코드 대신 그 해시를 손님 id로 보낸다(서버 customerId와 같은 식)
async function customerId(token) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('prompri:' + token)));
  return 'pr_' + [...h].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

let sdkP;
function loadSdk() {
  if (window.PortOne) return Promise.resolve(window.PortOne);
  sdkP ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = PORTONE.sdk; s.onload = () => res(window.PortOne); s.onerror = () => rej(new Error('sdk')); document.head.append(s);
  });
  return sdkP;
}

// Edge Function 부르기 (공개 키로. 함수 안에서 서비스 키로 서버 표를 고침)
export async function callFn(path, body) {
  const r = await fetch(PORTONE.fn + path, { method: 'POST', headers: { 'content-type': 'application/json', apikey: SB.key, authorization: 'Bearer ' + SB.key }, body: JSON.stringify(body), signal: AbortSignal.timeout?.(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.message || j.error || '결제를 마치지 못했어요'), { status: r.status });
  return j;
}

// 빌링키로 첫 결제(서버). 여러 번 불러도 한 번만 결제된다(서버가 같은 결제 id·잠금으로 막음)
export const issue = (token, billingKey) => callFn('/issue', { token, billingKey });

// 카드 등록 창 → 빌링키. 폰에서는 결제창이 다른 페이지로 넘어갔다 돌아올 수 있다 → redirectKey()가 이어서 받음.
export async function startCard(token) {
  if (!cardReady()) throw new Error('not-ready');
  const PortOne = await loadSdk();
  const base = location.origin + location.pathname;
  const r = await PortOne.requestIssueBillingKey({
    storeId: PORTONE.storeId,
    channelKey: PORTONE.channelKey,
    billingKeyMethod: 'CARD',
    issueId: (await customerId(token)) + '-k' + Date.now().toString(36),
    issueName: `프롬프리에딧 프로 월 구독 ${PRICE.month.toLocaleString('ko-KR')}원`,
    customer: { customerId: await customerId(token) },
    redirectUrl: base + '?after=card',
  });
  if (!r || r.code) throw new Error(r?.message || '카드 등록을 마치지 못했어요');
  return r.billingKey;
}

// 결제창에서 돌아왔을 때 (주소에 billingKey가 붙어 옴) → 빌링키만 돌려줌
export function redirectKey() {
  const q = new URLSearchParams(location.search);
  if (q.get('after') !== 'card') return null;
  history.replaceState(null, '', location.pathname + '#/plan');
  if (q.get('code')) throw new Error(q.get('message') || '카드 등록을 마치지 못했어요');
  return q.get('billingKey') || null;
}
