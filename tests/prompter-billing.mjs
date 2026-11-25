// Edge Function을 node에서 돌리는 시험: Deno·supabase·포트원을 흉내
// 실행: node --experimental-strip-types --no-warnings tests/prompter-billing.mjs  (결제 열기 전·Edge Function 고칠 때마다)
import fs from 'node:fs'; import crypto from 'node:crypto'; import os from 'node:os'; import path from 'node:path';
const FN = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prb-')), 'fn.mts');
const src = fs.readFileSync(new URL('../supabase/functions/prompter-billing/index.ts', import.meta.url), 'utf8')
  .replace(/^import \{ createClient \}.*$/m, 'const createClient = () => globalThis.__db;');
fs.writeFileSync(FN, src);
const ENV = { PORTONE_API_SECRET: 'sec', PORTONE_STORE_ID: 'store-1', PORTONE_WEBHOOK_SECRET: 'whsec_' + Buffer.from('k'.repeat(32)).toString('base64'), CRON_SECRET: 'cron123', SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' };
globalThis.Deno = { env: { get: k => ENV[k] }, serve: fn => { globalThis.__h = fn; } };
// 가짜 DB
const S = { customers: { ABCDEFGH12345678: { card: null } }, calls: [], lock: {} };
globalThis.__db = { rpc: async (fn, a) => { S.calls.push([fn, a]);
  if (fn === 'pr_me') return { data: S.customers[a.p_token] ? { token: a.p_token, card: S.customers[a.p_token].card } : null };
  if (fn === 'pr_card_claim') { if (S.lock[a.p_token]) return { data: false }; S.lock[a.p_token] = 1; return { data: true }; }
  if (fn === 'pr_card_release') { delete S.lock[a.p_token]; return { data: null }; }
  if (fn === 'pr_card_paid') { if (a.p_billing_key) S.customers[a.p_token].card = { status: 'active' }; return { data: { ok: true } }; }
  if (fn === 'pr_card_due') return { data: S.due ?? [] };
  return { data: { ok: true } }; } };
// 가짜 포트원
const P = { keys: {}, pays: {}, failNext: false, getFails: false };
const cid = async t => 'pr_' + crypto.createHash('sha256').update('prompri:' + t).digest('hex').slice(0, 24);
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); const j = (v, s = 200) => new Response(JSON.stringify(v), { status: s });
  if (init.headers?.authorization !== 'PortOne sec') return j({ type: 'UNAUTHORIZED' }, 401);
  let m;
  if ((m = u.pathname.match(/^\/billing-keys\/(.+)$/))) { const k = P.keys[decodeURIComponent(m[1])]; return k ? j(k) : j({ type: 'NOT_FOUND' }, 404); }
  if ((m = u.pathname.match(/^\/payments\/(.+)\/billing-key$/))) { const id = decodeURIComponent(m[1]); const b = JSON.parse(init.body);
    if (P.pays[id]) return j({ type: 'ALREADY_PAID' }, 409);
    if (P.failNext) { P.failNext = false; return j({ type: 'PG_PROVIDER', message: 'declined' }, 400); }
    P.pays[id] = { status: 'PAID', id, storeId: 'store-1', amount: { total: b.amount.total }, currency: b.currency, customer: { id: b.customer.id } }; return j({ payment: { pgTxId: 't', paidAt: 'now' } }); }
  if ((m = u.pathname.match(/^\/payments\/(.+)$/))) { if (P.getFails) return j({}, 500); const p = P.pays[decodeURIComponent(m[1])]; return p ? j(p) : j({ type: 'NOT_FOUND' }, 404); }
  return j({}, 404);
};
await import(FN);
// 화면과 서버 금액이 같아야 함
const cfg = fs.readFileSync(new URL('../prompter/config.js', import.meta.url), 'utf8');
const fnAmt = +src.match(/amount: (\d+), days/)[1], cfgAmt = +cfg.match(/PRICE = \{ month: (\d+)/)[1];
const call = (path, body, headers = {}) => __h(new Request('https://x/functions/v1/prompter-billing' + path, { method: 'POST', headers: { origin: 'https://evil.example', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
ok(fnAmt === cfgAmt, `price mismatch: function ${fnAmt} vs config ${cfgAmt}`);
const T = 'ABCDEFGH12345678', C = await cid(T);
P.keys.bkOther = { status: 'ISSUED', billingKey: 'bkOther', storeId: 'store-1', customer: { id: 'pr_someoneelse' }, methods: [{ card: { publisher: '신한', number: '1234-****-****-5678' } }] };
P.keys.bk1 = { ...P.keys.bkOther, billingKey: 'bk1', customer: { id: C } };
P.keys.bk2 = { ...P.keys.bk1, billingKey: 'bk2' };
let r = await call('/issue', { token: T, billingKey: 'bkOther' }); ok(r.status === 400, 'other person billing key refused');
ok(r.headers.get('access-control-allow-origin') !== 'https://evil.example', 'cors not reflected for unknown origin');
r = await call('/issue', { token: 'bad token!', billingKey: 'bk1' }); ok(r.status === 400, 'bad token format');
r = await call('/issue', { token: 'ZZZZZZZZ12345678', billingKey: 'bk1' }); ok(r.status === 404, 'unknown customer');
r = await call('/issue', 'x'.repeat(5000)); ok(r.status === 413, 'too big body');
// 금액은 화면이 못 바꿈
r = await call('/issue', { token: T, billingKey: 'bk1', amount: 1 }); ok(r.status === 200, 'first pay ok ' + r.status);
const paid = Object.values(P.pays); ok(paid.length === 1 && paid[0].amount.total === 1990 && paid[0].customer.id === C, 'charged 1990 to hashed id');
ok(!JSON.stringify(paid).includes(T), 'token never sent to portone');
r = await call('/issue', { token: T, billingKey: 'bk2' }); ok(r.status === 409, 'already active refused');
// 동시 두 번
S.customers.QQQQQQQQ12345678 = { card: null }; const C2 = await cid('QQQQQQQQ12345678');
P.keys.bk3 = { ...P.keys.bk1, billingKey: 'bk3', customer: { id: C2 } }; P.keys.bk4 = { ...P.keys.bk3, billingKey: 'bk4' };
const before = Object.keys(P.pays).length;
const [a, b] = await Promise.all([call('/issue', { token: 'QQQQQQQQ12345678', billingKey: 'bk3' }), call('/issue', { token: 'QQQQQQQQ12345678', billingKey: 'bk4' })]);
ok(Object.keys(P.pays).length - before === 1 && [a.status, b.status].sort().join() === '200,409', 'double click charges once ' + a.status + b.status);
// 실패 카드
S.customers.FFFFFFFF12345678 = { card: null }; const C3 = await cid('FFFFFFFF12345678'); P.keys.bk5 = { ...P.keys.bk1, billingKey: 'bk5', customer: { id: C3 } };
P.failNext = true; r = await call('/issue', { token: 'FFFFFFFF12345678', billingKey: 'bk5' }); ok(r.status === 402, 'declined 402');
ok(S.calls.some(c => c[0] === 'pr_card_failed' && c[1].p_token === 'FFFFFFFF12345678'), 'failure recorded');
ok(!S.calls.some(c => c[0] === 'pr_card_paid' && c[1].p_token === 'FFFFFFFF12345678'), 'no pro on decline');
ok(!S.lock.FFFFFFFF12345678, 'lock released');
const body500 = await (await call('/issue', '{bad json')).text(); ok(!/JSON|Unexpected|at /.test(body500), 'no internal error leak: ' + body500);
// 매달 청구
r = await call('/charge-due', {}); ok(r.status === 401, 'cron needs secret');
r = await call('/charge-due', {}, { 'x-cron-secret': 'cron12' }); ok(r.status === 401, 'wrong cron secret');
S.due = [{ token: T, billing_key: 'bk1', amount: 1990, next_at: '2026-12-26T00:00:00Z' }];
let n0 = Object.keys(P.pays).length;
r = await (await call('/charge-due', {}, { 'x-cron-secret': 'cron123' })).json(); ok(r.paid === 1, 'monthly paid');
r = await (await call('/charge-due', {}, { 'x-cron-secret': 'cron123' })).json();
ok(Object.keys(P.pays).length - n0 === 1, 'cron twice same day = one charge');
ok(r.paid === 1, 'second run sees already-paid and records idempotently');
P.getFails = true; S.due = [{ token: T, billing_key: 'bk1', amount: 1990, next_at: '2027-01-26T00:00:00Z' }];
const fc = S.calls.filter(c => c[0] === 'pr_card_failed').length;
await call('/charge-due', {}, { 'x-cron-secret': 'cron123' }); ok(S.calls.filter(c => c[0] === 'pr_card_failed').length === fc, 'lookup outage not marked failed'); P.getFails = false;
// 웹훅
const raw = Buffer.from('k'.repeat(32));
const sign = (id, ts, body) => 'v1,' + crypto.createHmac('sha256', raw).update(`${id}.${ts}.${body}`).digest('base64');
const pid = Object.keys(P.pays)[0]; const wb = JSON.stringify({ type: 'Transaction.Cancelled', data: { paymentId: pid, storeId: 'store-1' } });
const now = Math.floor(Date.now() / 1000);
r = await call('/webhook', wb); ok(r.status === 401, 'unsigned webhook refused');
r = await call('/webhook', wb, { 'webhook-id': 'w1', 'webhook-timestamp': String(now), 'webhook-signature': 'v1,AAAA' }); ok(r.status === 401, 'bad sig refused');
r = await call('/webhook', wb, { 'webhook-id': 'w1', 'webhook-timestamp': String(now - 600), 'webhook-signature': sign('w1', now - 600, wb) }); ok(r.status === 401, 'old timestamp refused');
// 서명은 맞지만 포트원에서는 아직 PAID → 기간 안 거둠
r = await call('/webhook', wb, { 'webhook-id': 'w2', 'webhook-timestamp': String(now), 'webhook-signature': 'v0,x ' + sign('w2', now, wb) }); ok(r.status === 200 && !S.calls.some(c => c[0] === 'pr_card_refunded'), 'signed but not cancelled at portone: ignored');
P.pays[pid].status = 'CANCELLED';
r = await call('/webhook', wb, { 'webhook-id': 'w3', 'webhook-timestamp': String(now), 'webhook-signature': sign('w3', now, wb) }); ok(r.status === 200 && S.calls.some(c => c[0] === 'pr_card_refunded' && c[1].p_payment_id === pid && c[1].p_full), 'cancel applied');
// 시크릿 비면 닫힘
console.log(`pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
