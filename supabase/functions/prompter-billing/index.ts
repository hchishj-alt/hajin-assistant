// 하진 프롬프터 카드 정기결제 (포트원 V2) — Supabase Edge Function
// 배포: supabase functions deploy prompter-billing --no-verify-jwt
// 비밀: supabase secrets set PORTONE_API_SECRET=... PORTONE_WEBHOOK_SECRET=... CRON_SECRET=...
//
// ⚠ 포트원 API 경로·응답 모양은 공식 문서(https://developers.portone.io, V2)로 확인하고 맞춘다.
//    아래는 뼈대다. 테스트 채널에서 docs/prompter-codex/01_카드결제_연동.md 의 "끝난 기준"을 통과시킨 뒤 실제 채널로 바꾼다.
//
// 서버 규칙(supabase/prompter.sql): 결제가 성공하면 pr_card_paid, 실패하면 pr_card_failed, 청구 대상은 pr_card_due.
// 이 세 함수는 service_role 전용이라 여기서만 부른다.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRICE = { amount: 990, days: 31, name: '하진 프롬프터 월 구독' }; // prompter/config.js PRICE와 같게
const API = 'https://api.portone.io';
const SECRET = Deno.env.get('PORTONE_API_SECRET') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...cors, 'content-type': 'application/json' } });
const portone = (path: string, init: RequestInit = {}) =>
  fetch(API + path, { ...init, headers: { authorization: `PortOne ${SECRET}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });

// 빌링키로 한 번 청구
async function charge(token: string, billingKey: string, amount: number) {
  const paymentId = `pr-${token.slice(0, 8)}-${Date.now().toString(36)}`;
  const r = await portone(`/payments/${encodeURIComponent(paymentId)}/billing-key`, {
    method: 'POST',
    body: JSON.stringify({ billingKey, orderName: PRICE.name, customer: { id: token }, amount: { total: amount }, currency: 'KRW' }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, paymentId, body };
}

// 카드 이름 (예: "신한 1234"). 응답 모양은 문서로 확인
async function cardLabel(billingKey: string) {
  const r = await portone(`/billing-keys/${encodeURIComponent(billingKey)}`);
  if (!r.ok) return null;
  const b = await r.json();
  const card = b?.methods?.[0]?.card ?? b?.method?.card ?? {};
  const name = card.publisher || card.issuer || card.name || '카드';
  const num = String(card.number ?? '').replace(/\D/g, '').slice(-4);
  return `${name}${num ? ' ' + num : ''}`;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const path = new URL(req.url).pathname.replace(/.*\/prompter-billing/, '');
  try {
    // 화면: 카드 등록 직후 → 빌링키 확인 → 첫 결제
    if (path === '/issue') {
      const { token, billingKey } = await req.json();
      if (!token || !billingKey) return json({ ok: false, message: '값이 비었어요' }, 400);
      const { data: me } = await db.rpc('pr_me', { p_token: token });
      if (!me) return json({ ok: false, message: '손님을 찾지 못했어요' }, 404);
      const label = await cardLabel(billingKey);
      if (label == null) return json({ ok: false, message: '카드 등록을 확인하지 못했어요' }, 400);
      const c = await charge(token, billingKey, PRICE.amount);
      if (!c.ok) { await db.rpc('pr_card_failed', { p_token: token, p_payment_id: c.paymentId, p_reason: c.body?.message ?? '' }); return json({ ok: false, message: '첫 결제가 안 됐어요. 다른 카드로 해 주세요' }, 402); }
      const { data } = await db.rpc('pr_card_paid', { p_token: token, p_payment_id: c.paymentId, p_amount: PRICE.amount, p_days: PRICE.days, p_billing_key: billingKey, p_card_label: label });
      return json({ ok: true, ...data });
    }
    // pg_cron이 하루 한 번: 다음 결제일 지난 구독 청구
    if (path === '/charge-due') {
      if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ ok: false }, 401);
      const { data: due } = await db.rpc('pr_card_due');
      let paid = 0, failed = 0;
      for (const d of due ?? []) {
        const c = await charge(d.token, d.billing_key, d.amount);
        if (c.ok) { await db.rpc('pr_card_paid', { p_token: d.token, p_payment_id: c.paymentId, p_amount: d.amount, p_days: PRICE.days }); paid++; }
        else { await db.rpc('pr_card_failed', { p_token: d.token, p_payment_id: c.paymentId, p_reason: c.body?.message ?? '' }); failed++; }
      }
      return json({ ok: true, paid, failed });
    }
    // 포트원 웹훅: TODO 서명 검증(PORTONE_WEBHOOK_SECRET, Standard Webhooks) 후 결제 상태 반영(취소·환불)
    if (path === '/webhook') {
      return json({ ok: true, todo: 'verify signature and sync status' });
    }
    return json({ ok: false, message: 'not found' }, 404);
  } catch (e) {
    return json({ ok: false, message: String((e as Error)?.message ?? e) }, 500);
  }
});
