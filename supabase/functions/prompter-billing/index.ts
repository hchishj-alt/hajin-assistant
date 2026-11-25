// 프롬프리에딧 카드 정기결제 (포트원 V2) — Supabase Edge Function
// 배포: supabase functions deploy prompter-billing --no-verify-jwt   (또는 대시보드 Edge Functions에 이 파일을 붙여 넣기)
// 비밀(대시보드 Edge Functions › Secrets 또는 supabase secrets set, 채팅·저장소에 절대 쓰지 않음):
//   PORTONE_API_SECRET      포트원 콘솔 › 연동 정보 › V2 API Secret
//   PORTONE_STORE_ID        포트원 상점 아이디(store-...)  ※ 공개 값이지만 서버에서도 확인용으로 씀
//   PORTONE_WEBHOOK_SECRET  포트원 콘솔 › 웹훅 › 시크릿 (whsec_...)
//   CRON_SECRET             아무 긴 무작위 글자. pg_cron이 매일 청구를 부를 때 씀
//   SITE_ORIGINS            (선택) 결제 화면을 여는 주소들, 쉼표로. 비우면 기본 목록
//
// 보안 원칙(docs/SECURITY.md):
// - 금액은 화면이 아니라 여기(PRICE)와 서버 표(pr_billing.amount)가 정한다. 화면이 보낸 금액은 받지 않는다.
// - 결제가 "됐다"는 것은 포트원 결제 조회(GET /payments/:id)로 상태 PAID·금액·통화·상점·손님까지 맞을 때만 믿는다.
// - 빌링키는 그 손님(customer.id = 복구 코드의 해시) 것인지 확인하고 받는다.
// - 매달 청구의 paymentId는 "손님+청구일"로 정해서, 두 번 불려도 포트원이 두 번째를 거절한다(중복 청구 방지).
// - 웹훅은 Standard Webhooks 서명(HMAC-SHA256)과 5분 시간 창을 확인한 뒤에만 반영하고, 반영할 때도 포트원에 다시 조회한다.
// - 실패 응답에 내부 오류 내용을 싣지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';

// prompter/config.js PRICE.month와 같게 (tests/prompter-price.mjs가 확인)
const PRICE = { amount: 1990, days: 31, name: '프롬프리에딧 프로 월 구독' };
const API = 'https://api.portone.io';
const env = (k: string) => Deno.env.get(k) ?? '';
const SECRET = env('PORTONE_API_SECRET');
const STORE_ID = env('PORTONE_STORE_ID');
const WEBHOOK_SECRET = env('PORTONE_WEBHOOK_SECRET');
const CRON_SECRET = env('CRON_SECRET');
const ORIGINS = (env('SITE_ORIGINS') || 'https://hchishj-alt.github.io,https://prompri-edit.netlify.app').split(',').map(s => s.trim()).filter(Boolean);
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

const corsFor = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return { 'access-control-allow-origin': ORIGINS.includes(o) ? o : ORIGINS[0], vary: 'origin', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
};
const portone = (path: string, init: RequestInit = {}) =>
  fetch(API + path, { ...init, headers: { authorization: `PortOne ${SECRET}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });

const enc = new TextEncoder();
async function sha256hex(s: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
// 포트원·카드사에 복구 코드를 그대로 보내지 않는다. 손님 구분은 해시 앞 24자로.
export const customerId = async (token: string) => 'pr_' + (await sha256hex('prompri:' + token)).slice(0, 24);
const TOKEN_RE = /^[A-Z0-9]{8,32}$/;
const normToken = (t: unknown) => String(t ?? '').trim().toUpperCase();

function safeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
const safeEqualStr = (a: string, b: string) => safeEqual(enc.encode(a), enc.encode(b));

// Standard Webhooks 서명 확인(포트원 server-sdk 0.19.0 webhook.verify와 같은 방식). 맞으면 JSON, 아니면 null
export async function verifyWebhook(secret: string, payload: string, h: Headers, nowSec = Math.floor(Date.now() / 1000)) {
  const id = h.get('webhook-id'), sig = h.get('webhook-signature'), ts = h.get('webhook-timestamp');
  if (!secret || !id || !sig || !ts) return null;
  const t = Number.parseInt(ts, 10);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > 300) return null;
  let raw: Uint8Array;
  try { raw = Uint8Array.from(atob(secret.startsWith('whsec_') ? secret.slice(6) : secret), c => c.charCodeAt(0)); } catch { return null; }
  if (!raw.length) return null;
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${ts}.${payload}`)));
  for (const part of sig.split(' ')) {
    const [v, s] = part.split(',', 2);
    if (v !== 'v1' || !s) continue;
    let got: Uint8Array;
    try { got = Uint8Array.from(atob(s), c => c.charCodeAt(0)); } catch { continue; }
    if (safeEqual(got, want)) { try { return JSON.parse(payload); } catch { return null; } }
  }
  return null;
}

// 결제 조회: 상태 PAID·금액·통화·상점·손님이 모두 맞아야 true
async function confirmPaid(paymentId: string, amount: number, cid: string) {
  const r = await portone(`/payments/${encodeURIComponent(paymentId)}?storeId=${encodeURIComponent(STORE_ID)}`);
  if (!r.ok) return { ok: false, status: 'UNKNOWN' };
  const p = await r.json();
  const ok = p?.status === 'PAID' && p?.amount?.total === amount && p?.currency === 'KRW' && (!STORE_ID || p?.storeId === STORE_ID) && p?.customer?.id === cid;
  return { ok, status: String(p?.status ?? '') };
}

// 빌링키로 한 번 청구. paymentId를 정해서 넘김(같은 id 두 번이면 포트원이 거절 → 중복 청구 없음)
async function charge(paymentId: string, billingKey: string, amount: number, cid: string) {
  const r = await portone(`/payments/${encodeURIComponent(paymentId)}/billing-key`, {
    method: 'POST',
    body: JSON.stringify({ storeId: STORE_ID || undefined, billingKey, orderName: PRICE.name, customer: { id: cid }, amount: { total: amount }, currency: 'KRW' }),
  });
  const body = await r.json().catch(() => ({}));
  const c = await confirmPaid(paymentId, amount, cid); // 응답만 믿지 않고 다시 조회
  if (c.ok) return { ok: true, paymentId, reason: '' };
  // 조회가 안 되면 실패로 적지 않는다(실제로 됐을 수 있음)
  if (c.status === 'UNKNOWN' && r.ok) return { ok: false, paymentId, reason: 'UNKNOWN' };
  return { ok: false, paymentId, reason: String(body?.type ?? body?.message ?? c.status).slice(0, 120) };
}

// 빌링키가 이 손님 것인지 + 카드 이름(예: "신한 1234")
async function billingKeyInfo(billingKey: string, cid: string) {
  const r = await portone(`/billing-keys/${encodeURIComponent(billingKey)}?storeId=${encodeURIComponent(STORE_ID)}`);
  if (!r.ok) return null;
  const b = await r.json();
  if (b?.status !== 'ISSUED' || b?.customer?.id !== cid || (STORE_ID && b?.storeId !== STORE_ID)) return null;
  const card = b?.methods?.[0]?.card ?? {};
  const name = card.publisher || card.issuer || card.name || '카드';
  const num = String(card.number ?? '').replace(/\D/g, '').slice(-4);
  return { label: `${name}${num ? ' ' + num : ''}` };
}

// 첫 결제 id: 손님+날짜+카드(같은 카드로 하루 두 번 못 함). 매달 id: 손님+청구 예정일
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const firstId = async (cid: string, billingKey: string) => `${cid}-f${day(new Date())}-${(await sha256hex(billingKey)).slice(0, 8)}`;
const dueId = (cid: string, nextAt: string) => `${cid}-m-${day(new Date(nextAt))}`;

Deno.serve(async req => {
  const cors = corsFor(req);
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false }, 405);
  if (!SECRET || !STORE_ID) return json({ ok: false, message: '카드 결제 준비 중이에요' }, 503);
  const path = new URL(req.url).pathname.replace(/.*\/prompter-billing/, '');
  try {
    // 화면: 카드 등록 직후 → 빌링키 확인 → 첫 결제
    if (path === '/issue') {
      const raw = await req.text();
      if (raw.length > 2000) return json({ ok: false }, 413);
      const { token: t, billingKey } = JSON.parse(raw || '{}');
      const token = normToken(t);
      if (!TOKEN_RE.test(token) || typeof billingKey !== 'string' || billingKey.length > 200) return json({ ok: false, message: '값이 잘못됐어요' }, 400);
      const { data: me } = await db.rpc('pr_me', { p_token: token });
      if (!me) return json({ ok: false, message: '손님을 찾지 못했어요' }, 404);
      if (me.card?.status === 'active') return json({ ok: false, message: '이미 카드 구독 중이에요' }, 409);
      const cid = await customerId(token);
      const info = await billingKeyInfo(billingKey, cid);
      if (!info) return json({ ok: false, message: '카드 등록을 확인하지 못했어요' }, 400);
      // 같은 손님이 동시에 두 번 눌러도 한 번만 결제되게 잠금(2분)
      const { data: got } = await db.rpc('pr_card_claim', { p_token: token });
      if (got !== true) return json({ ok: false, message: '결제를 처리하는 중이에요. 잠시 뒤 확인해 주세요' }, 409);
      try {
        const c = await charge(await firstId(cid, billingKey), billingKey, PRICE.amount, cid);
        if (!c.ok) {
          if (c.reason !== 'UNKNOWN') await db.rpc('pr_card_failed', { p_token: token, p_payment_id: c.paymentId, p_reason: c.reason });
          return json({ ok: false, message: '첫 결제가 안 됐어요. 다른 카드로 해 주세요' }, 402);
        }
        await db.rpc('pr_card_paid', { p_token: token, p_payment_id: c.paymentId, p_amount: PRICE.amount, p_days: PRICE.days, p_billing_key: billingKey, p_card_label: info.label });
      } finally { await db.rpc('pr_card_release', { p_token: token }); }
      const { data: after } = await db.rpc('pr_me', { p_token: token });
      return json({ ok: true, ...after });
    }
    // pg_cron이 하루 한 번: 다음 결제일 지난 구독 청구
    if (path === '/charge-due') {
      if (!CRON_SECRET || !safeEqualStr(req.headers.get('x-cron-secret') ?? '', CRON_SECRET)) return json({ ok: false }, 401);
      const { data: due } = await db.rpc('pr_card_due');
      let paid = 0, failed = 0;
      for (const d of due ?? []) {
        const cid = await customerId(d.token);
        const c = await charge(dueId(cid, d.next_at), d.billing_key, d.amount, cid);
        if (c.ok) { await db.rpc('pr_card_paid', { p_token: d.token, p_payment_id: c.paymentId, p_amount: d.amount, p_days: PRICE.days }); paid++; }
        else if (c.reason === 'UNKNOWN') { continue; } // 조회가 안 됨: 내일 같은 id로 다시(이미 됐으면 그때 PAID로 잡힘)
        else { await db.rpc('pr_card_failed', { p_token: d.token, p_payment_id: c.paymentId + '-f' + Date.now().toString(36), p_reason: c.reason }); failed++; }
      }
      return json({ ok: true, paid, failed });
    }
    // 포트원 웹훅: 서명 확인 → 포트원에 다시 조회 → 취소·환불이면 기간 회수
    if (path === '/webhook') {
      const payload = await req.text();
      if (payload.length > 20000) return json({ ok: false }, 413);
      const ev = await verifyWebhook(WEBHOOK_SECRET, payload, req.headers);
      if (!ev) return json({ ok: false }, 401);
      const pid = String(ev?.data?.paymentId ?? '');
      if (ev?.type === 'Transaction.Cancelled' && pid) {
        const r = await portone(`/payments/${encodeURIComponent(pid)}?storeId=${encodeURIComponent(STORE_ID)}`);
        const p = r.ok ? await r.json() : null;
        if (p && (p.status === 'CANCELLED' || p.status === 'PARTIAL_CANCELLED') && (!STORE_ID || p.storeId === STORE_ID)) {
          await db.rpc('pr_card_refunded', { p_payment_id: pid, p_full: p.status === 'CANCELLED' });
        }
      }
      return json({ ok: true }); // 다른 이벤트는 받기만
    }
    return json({ ok: false }, 404);
  } catch (e) {
    console.error('prompter-billing', e);
    return json({ ok: false, message: '잠시 뒤 다시 해 주세요' }, 500);
  }
});
