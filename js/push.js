// 앱을 닫아도 울리는 알림 (웹 푸시). 아이폰·아이패드(홈 화면에 설치한 앱), 안드로이드, PC 모두 같은 방식.
// 따로 돌리는 서버 없이 됨:
//  · 이 기기가 자기 서명 키를 만들어 기기 안에만 둠 (서버에 비밀 키가 없음)
//  · 앞으로 8일 치 "보내도 된다는 서명"을 미리 만들어 서버에 올림
//  · 앞으로 울릴 알림 목록(alarm.plan)도 서버에 올림
//  · 서버(Supabase)는 1분마다 때가 된 알림이 있으면 그 서명으로 폰에 신호만 보냄. 알림 글은 서비스 워커가 가져와 띄움.
// 그래서 8일 넘게 앱을 한 번도 안 열면 서명이 떨어져 멈추고, 앱을 열면 다시 채워짐.
import * as db from './db.js';
import * as A from './alarm.js';
import { SUPABASE } from './config.js';

const KEY = 'me:push';          /* 이 기기에서만 기억: { on, endpoint, at, signedAt, server } */
const VAPID = 'secret:vapid';   /* 이 기기의 서명 키. 내보내기·동기화에서 빠짐 */
const HALF = 43200;             /* 12시간(초) */
const enc = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const dec = s => { const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const utf = s => new TextEncoder().encode(s);
const sync = () => import('./sync.js');

export const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!(window.crypto && crypto.subtle);
export async function status() {
  const st = await db.kvGet(KEY, {});
  let sub = null; try { sub = supported() ? await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription() : null; } catch { }
  const S = await sync(); const me = await S.me().catch(() => null);
  return { supported: supported(), perm: A.perm(), signedIn: !!me, on: !!(st.on && sub), at: st.at || '', server: st.server !== false };
}

// 이 기기의 서명 키 (없으면 만듦)
async function keys() {
  let k = await db.kvGet(VAPID, null);
  if (!k || !k.pub || !k.jwk) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    k = { pub: enc(await crypto.subtle.exportKey('raw', pair.publicKey)), jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
    await db.kvSet(VAPID, k);
  }
  return { pub: k.pub, priv: await crypto.subtle.importKey('jwk', k.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
}
// 푸시 서비스(애플·구글 등)에 보일 "이 서버가 보내도 됨" 서명을 12시간 간격으로 n개. 하나는 만료 24시간 전부터 쓸 수 있음
export async function tokens(endpoint, priv, { n = 16, now = Date.now() } = {}) {
  const aud = new URL(endpoint).origin, head = enc(utf(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), first = Math.ceil(now / 1000 / HALF) * HALF, out = [];
  for (let i = 0; i < n; i++) {
    const exp = first + i * HALF, body = enc(utf(JSON.stringify({ aud, exp, sub: SUPABASE.url })));
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, utf(head + '.' + body));
    out.push({ exp, t: head + '.' + body + '.' + enc(sig) });
  }
  return out;
}
async function register(c, sub, k) {
  const j = sub.toJSON();
  const r = await c.rpc('push_register', { p_endpoint: j.endpoint, p_pub: k.pub, p_tokens: await tokens(j.endpoint, k.priv), p_ua: (navigator.userAgent || '').slice(0, 180) });
  if (r.error) { const miss = /push_register|schema cache|does not exist|PGRST20/i.test((r.error.message || '') + (r.error.code || '')); const e = new Error(miss ? '서버의 알림 설정이 아직 안 끝났어요. 조금 뒤에 다시 눌러 주세요.' : '이 기기를 서버에 등록하지 못했어요: ' + r.error.message); e.miss = miss; throw e; }
  await db.kvSet('me:pushcfg', { url: SUPABASE.url, key: SUPABASE.key });   /* 서비스 워커가 알림 글을 가져올 곳 */
  await db.kvSet(KEY, { on: true, endpoint: j.endpoint, at: (await db.kvGet(KEY, {})).at || new Date().toISOString(), signedAt: Date.now(), server: true });
}

// 켜기: 알림 허용 → 이 기기 푸시 주소 만들기 → 서버에 등록 → 알림 목록 올리기
export async function enable() {
  if (!supported()) throw new Error('이 브라우저는 닫혀 있을 때 알림을 받을 수 없어요. 아이폰·아이패드는 홈 화면에 설치한 앱에서 켜 주세요.');
  const S = await sync(); const c = await S.raw(); if (!c || !(await S.me())) throw new Error('멤버 코드로 로그인한 뒤에 켤 수 있어요.');
  if ((await A.ask()) !== 'granted') throw new Error('알림이 막혀 있어요. 폰 설정에서 이 앱의 알림을 허용해 주세요.');
  const k = await keys(); const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && enc(sub.options?.applicationServerKey || new ArrayBuffer(0)) !== k.pub) { await sub.unsubscribe().catch(() => { }); sub = null; }   /* 다른 키로 만든 예전 주소면 새로 */
  if (!sub) { try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: dec(k.pub) }); } catch (e) { throw new Error('이 기기에서 닫힌 앱 알림을 켜지 못했어요. 잠시 뒤 다시 눌러 주세요. (' + (e.name || e.message) + ')'); } }
  try { await register(c, sub, k); } catch (e) { if (e.miss) await db.kvSet(KEY, { ...(await db.kvGet(KEY, {})), on: false, server: false }); throw e; }
  await upload(true);
  return status();
}
export async function disable() {
  const st = await db.kvGet(KEY, {});
  try { const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription(); const ep = sub?.endpoint || st.endpoint; await sub?.unsubscribe(); if (ep) { const c = await (await sync()).raw(); await c?.rpc('push_unregister', { p_endpoint: ep }); } } catch { }
  await db.kvSet(KEY, { on: false });
}
// 앱을 열 때: 서명이 하루 넘게 묵었으면 새로 채우고, 폰이 푸시 주소를 바꿨으면 다시 등록
export async function refresh() {
  const st = await db.kvGet(KEY, {}); if (!st.on || !supported()) return false;
  const c = await (await sync()).raw(); if (!c) return false;
  const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return false;
  const k = await keys(); let sub = await reg.pushManager.getSubscription();
  if (!sub && A.perm() === 'granted') { try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: dec(k.pub) }); } catch { } }
  if (!sub) { await db.kvSet(KEY, { ...st, on: false }); return false; }   /* 폰이 주소를 없앴고 다시 못 만들면 꺼진 걸로 보여 줌 */
  if (sub.endpoint === st.endpoint && Date.now() - (st.signedAt || 0) < 20 * 36e5) return true;
  try { await register(c, sub, k); if (st.endpoint && st.endpoint !== sub.endpoint) await c.rpc('push_unregister', { p_endpoint: st.endpoint }); return true; } catch { return false; }
}

// 앞으로 7일 동안 울릴 알림을 서버에 올림 (바뀔 때마다 통째로 바꿔 끼움). 이 기기에서 이미 울린 것은 뺌
let last = '';
export async function upload(force = false) {
  const st = await db.kvGet(KEY, {}); if (!st.on) return false;
  const c = await (await sync()).raw(); if (!c) return false;
  const now = new Date(), fired = await db.kvGet('me:alarmfired', {});
  const list = (await A.plan({ from: now, days: 7 })).filter(a => a.until > now && !(a.at <= now && fired[a.id])).slice(0, 300)
    .map(a => ({ id: a.id, at: a.at.toISOString(), until: a.until.toISOString(), title: a.title, body: a.body || '', url: a.url || '' }));
  const sig = JSON.stringify(list.map(a => [a.id, a.at, a.title, a.body]));
  if (!force && sig === last) return true;
  const { error } = await c.rpc('set_alarms', { p: list });
  if (error) return false;
  last = sig; return true;
}
// 진짜 폰 알림 시험: 서버가 delay초 뒤(다음 1분 주기)에 이 계정의 기기들로 보냄
export async function test(delay = 15) {
  const st = await db.kvGet(KEY, {}); if (!st.on) return false;
  const c = await (await sync()).raw(); if (!c) return false;
  const { error } = await c.rpc('push_test', { p_delay: delay });
  return !error;
}

let started = false;
export function start() {
  if (started) return; started = true;
  let t = 0; const later = (ms = 5000) => { clearTimeout(t); t = setTimeout(() => upload().catch(() => { }), ms); };
  db.onChange(col => { if (col === 'events' || col === 'tasks') later(); });
  A.onChange(() => later(1500));
  setTimeout(() => refresh().catch(() => { }).then(() => upload().catch(() => { })), 8000);   /* 앱을 열 때 한 번 (동기화가 먼저 끝나게 조금 기다림) */
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refresh().catch(() => { }); later(6000); } });
  navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.go) location.hash = e.data.go; });
}
