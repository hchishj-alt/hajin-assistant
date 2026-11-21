// 계정: 메일 + 비밀번호로 가입·로그인 (Supabase Auth). 구독 상태와 서버 백업이 이 계정에 붙음.
// 비밀번호는 Supabase가 보관하고 앱은 저장하지 않음. 공개 키만 씀(접근 규칙은 서버 RLS).
import { SUPABASE } from '../js/config.js';
import * as S from './store.js';

let client = null, session = null;
const subs = new Set();
export const onAuth = f => (subs.add(f), () => subs.delete(f));
const ko = m => /Invalid login/i.test(m) ? '가입한 적이 없는 메일이거나 비밀번호가 달라요. 처음이면 아래 "메일로 가입하기"를 눌러 주세요' : /already registered|already been registered/i.test(m) ? '이미 가입한 메일이에요. 로그인해 주세요' : /Password should be/i.test(m) ? '비밀번호는 8자 이상으로 해 주세요' : /rate limit|too many/i.test(m) ? '잠시 뒤에 다시 해 주세요' : /Failed to fetch|NetworkError|Load failed/i.test(m) ? '인터넷 연결을 확인해 주세요' : /valid email|invalid format/i.test(m) ? '메일 주소를 다시 확인해 주세요' : /not confirmed/i.test(m) ? '메일 확인이 아직 안 됐어요. 받은 메일의 링크를 눌러 주세요' : m;

async function get() {
  if (client) return client;
  const { createClient } = await import('../js/vendor-supabase.js');
  client = createClient(SUPABASE.url, SUPABASE.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mgr-auth', detectSessionInUrl: false } });
  client.auth.onAuthStateChange((_e, s) => { session = s; subs.forEach(f => { try { f(user()); } catch { } }); });
  const { data } = await client.auth.getSession(); session = data.session;
  return client;
}
export const user = () => session?.user ? { id: session.user.id, email: session.user.email } : null;
// 로그인돼 있는지 (저장된 표시가 없으면 서버 코드를 불러오지 않음: 로그인 안 한 사람은 가볍게)
export async function current() { try { if (!client && !localStorage.getItem('mgr-auth')) return null; await get(); return user(); } catch { return null; } }
export const okMail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export async function signUp(email, password) {
  const c = await get(); const r = await c.auth.signUp({ email: email.trim().toLowerCase(), password });
  if (r.error) throw new Error(ko(r.error.message));
  if (!r.data.session) return { confirm: true };   // 서버가 메일 확인을 요구하는 설정일 때
  session = r.data.session; return { user: user() };
}
export async function signIn(email, password) {
  const c = await get(); const r = await c.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (r.error) throw new Error(ko(r.error.message));
  session = r.data.session; return user();
}
export async function signOut() { const c = await get(); await c.auth.signOut(); session = null; }

// 구독 상태 (서버 표 mg_subs). 표가 아직 없으면 무료로 봄
export async function sub() {
  if (!user()) return null;
  try { const c = await get(); const { data, error } = await c.from('mg_subs').select('paid_until,plan').maybeSingle(); if (error) return null; return data && new Date(data.paid_until) > new Date() ? data : null; } catch { return null; }
}
// 서버 백업: 기기 기록 한 덩어리를 내 계정 줄에 올림. 인스타 토큰·AI 키는 안 올림
export const BK = ['profile', 'posts', 'snaps', 'people', 'handled', 'deals', 'about', 'ads', 'reviews', 'plan', 'strategy', 'explore', 'routine', 'drafts'];
export async function push() {
  if (!user() || S.getMode() === 'demo') return false;
  const c = await get(); const data = {}; for (const k of BK) data[k] = await S.get(k);
  const { error } = await c.from('mg_data').upsert({ owner: user().id, data, updated_at: new Date().toISOString() });
  if (error) throw new Error(/mg_data|schema cache|does not exist|404/i.test(error.message) ? '서버 백업은 아직 준비 중이에요' : ko(error.message));
  localStorage.setItem('mgr:cloudAt', Date.now()); return true;
}
export async function pull() {
  if (!user()) return null;
  const c = await get(); const { data, error } = await c.from('mg_data').select('data,updated_at').maybeSingle();
  if (error) throw new Error(/mg_data|schema cache|does not exist|404/i.test(error.message) ? '서버 백업은 아직 준비 중이에요' : ko(error.message));
  return data;
}
export async function restore(row) { let n = 0; for (const k of BK) if (row.data?.[k] != null) { await S.set(k, row.data[k]); n++; } return n; }
// 탈퇴: 서버의 내 계정·백업을 지움 (서버 함수 mg_delete_me)
export async function remove() {
  const c = await get(); const { error } = await c.rpc('mg_delete_me');
  if (error) throw new Error(/mg_delete_me|schema cache|does not exist|404/i.test(error.message) ? '탈퇴 처리는 아직 준비 중이에요. 문의 메일로 알려 주세요' : ko(error.message));
  await c.auth.signOut().catch(() => { }); session = null;
}
