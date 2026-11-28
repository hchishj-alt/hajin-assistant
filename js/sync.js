// 동기화: 기기 저장(IndexedDB)이 기본, Supabase는 사본.
// · 내 기록 → items (나만 보임)
// · 공유한 팀의 팀·팀 일정·시간 조율·응답 → space_items (참여 코드로 들어온 사람끼리)
// · 바뀐 것만(dirty) 올리고, 서버 시각(server_at) 이후 것만 내려받음. 같은 항목이 양쪽에서 바뀌면 더 나중에 고친 쪽이 이김.
// · 사진·녹음·영상 원본은 용량 때문에 기기에만 남음.
import * as db from './db.js';
import { SUPABASE } from './config.js';

const SHARE_COLS = new Set(['teams', 'events', 'polls', 'pollvotes', 'tasks', 'meetings', 'expenses', 'incomes', 'docs', 'notes', 'figmafiles', 'refs', 'reffolders', 'projects', 'leads', 'leadmarks', 'leadfb', 'vendors', 'grants', 'contacts', 'audit', 'labelsets', 'buys', 'boards', 'bnodes', 'feedback', 'gripes', 'prompts', 'promptlogs', 'acts']);
const CHUNK = 200;
let client = null, session = null, channel = null;
let pushT = null, pullT = null, busy = null, startP = null, pendingAgain = false, wired = false;
const state = { status: 'off', last: null, error: '', pushed: 0, pulled: 0, fails: 0 };
const subs = new Set();
const set = p => { Object.assign(state, p); subs.forEach(f => { try { f({ ...state }); } catch { } }); };
export const onState = f => (subs.add(f), () => subs.delete(f));
export const getState = () => ({ ...state });
/* 사람에게 알릴 만한 동기화 문제인지: 인터넷이 잠깐 끊긴 것은 두 번 이어질 때만, 그 밖(서버가 거절, 로그인 풀림)은 바로 */
export const trouble = (st = state) => ((st.status === 'error' || st.status === 'syncing') && st.error && (st.fails >= 2 || !/인터넷 연결/.test(st.error)) ? st.error : '');
export const user = () => session?.user || null;
export const userId = () => session?.user?.id || null;

export async function config() {
  return { url: (await db.kvGet('sync:url', '')) || SUPABASE.url, key: (await db.kvGet('sync:key', '')) || SUPABASE.key };
}
export async function setConfig(url, key) {
  await db.kvSetRaw('sync:url', (url || '').trim().replace(/\/+$/, ''));
  await db.kvSetRaw('sync:key', (key || '').trim());
  if (channel) { try { await client.removeChannel(channel); } catch { } }
  client = null; session = null; channel = null; startP = null;
  return start();
}

async function getClient() {
  if (client) return client;
  const { url, key } = await config();
  if (!url || !key) return null;
  const { createClient } = await import('./vendor-supabase.js');
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hajin-sync-auth', detectSessionInUrl: true } });
  client.auth.onAuthStateChange((ev, s) => {
    const was = session?.user?.id;
    session = s;
    if (s && s.user.id !== was) { listen(); syncNow(); }
    if (!s) { set({ status: 'signedout' }); if (channel) { client.removeChannel(channel); channel = null; } }
  });
  return client;
}

// 앱 시작 때 한 번
export function start() { return startP || (startP = start0()); }
/* 로그인돼 있는지 알게 될 때까지 기다림(길어도 ms). 앱을 메신저·멤버 화면에서 바로 열면 로그인 확인보다 화면이 먼저 그려져 "로그인하러 가기"가 뜨던 것을 막음 */
export const ready = (ms = 2500) => Promise.race([start().catch(() => state), new Promise(r => setTimeout(() => r(state), ms))]);
async function start0() {
  const c = await getClient().catch(e => { set({ status: 'error', error: e.message }); return null; });
  if (!c) { set({ status: 'off' }); return state; }
  const { data } = await c.auth.getSession();
  session = data.session;
  if (!session) { set({ status: 'signedout' }); return state; }
  set({ status: 'idle' });
  await loadGuest();
  listen();
  if (!wired) {
    wired = true;
    db.onChange((col, item) => { if (item?.dirty && session) schedulePush(); });
    window.addEventListener('online', () => syncNow());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refreshAll(); syncNow(); } });
    setInterval(() => syncNow(), 5 * 60 * 1000);
  }
  syncNow();
  teamKey().catch(() => { });
  return state;
}

function listen() {
  if (!client || !session || channel) return;
  channel = client.channel('hajin-' + session.user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `owner=eq.${session.user.id}` }, () => schedulePull())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'space_items' }, () => schedulePull())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'space_members' }, () => schedulePull())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dms' }, p => dmStore([p.new], true).catch(() => { }))
    .subscribe();
}
function schedulePush() { clearTimeout(pushT); pushT = setTimeout(() => syncNow(), 1500); }
function schedulePull() { clearTimeout(pullT); pullT = setTimeout(() => syncNow(), 700); }

// ── 멤버 코드 로그인 ──
// 코드 → 서버가 멤버 id 알려줌 → 그 id로 만든 계정에 로그인 (처음이면 계정 자동 생성) → 멤버에 연결 + 팀 공간 자동 참여
const loginEmail = id => `m-${id}@members.hajin.example.com`;
const loginPw = (code, id) => `hj-${code}-${id.slice(0, 8)}`;
export async function loginWithCode(code) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,5}$/.test(code)) throw new Error('멤버 코드는 영문·숫자 5자리 이내예요');
  const c = await getClient(); if (!c) throw new Error('서버 연결 설정이 아직 없어요');
  const { data: m, error: e1 } = await c.rpc('check_code', { p_code: code });
  if (e1) throw new Error(koErr(e1.message));
  const mem = Array.isArray(m) ? m[0] : m;
  if (!mem?.id) throw new Error('멤버 코드가 맞지 않아요');
  const email = loginEmail(mem.id), password = loginPw(code, mem.id);
  let { error } = await c.auth.signInWithPassword({ email, password });
  if (error && /Invalid login/i.test(error.message)) {
    const r = await c.auth.signUp({ email, password });
    if (r.error) throw new Error(koErr(r.error.message));
    if (!r.data.session) throw new Error('Supabase에서 이메일 확인(Confirm email)을 꺼 주세요');
  } else if (error) throw new Error(koErr(error.message));
  const { data: me, error: e2 } = await c.rpc('claim_member', { p_code: code });
  if (e2) { await c.auth.signOut(); throw new Error(koErr(e2.message)); }
  const info = Array.isArray(me) ? me[0] : me;
  { const before = await db.kvGet('me:member', null); if (!before || before.id !== info.id) await db.kvSetRaw('me:was', []); }
  await db.kvSetRaw('me:member', info); await db.kvSetRaw('me:ended', false); await loadGuest();
  await teamKey().catch(() => { });
  const curName = await db.kvGet('name', '하진');
  await afterLogin();
  // 이름은 다른 기기에서 정해 둔 게 있으면 그걸 따르고, 없을 때만 멤버 이름으로
  { const nm = await db.kvGet('name', ''); if (!nm || nm === '하진') await db.kvSet('name', info.name.length === 3 ? info.name.slice(1) : info.name); }
  return info;
}
export async function me() { if (!session) await ready(); return session ? await db.kvGet('me:member', null) : null; }
// 내 색·사진: 내 줄만 바꿀 수 있고, 같은 팀 기기들은 바로 다시 받아 감. null은 그대로 두라는 뜻, ''는 지우라는 뜻
export async function setProfile({ color = null, avatar = null } = {}) {
  if (!session) throw new Error('먼저 멤버 코드로 로그인해 주세요');
  const { data, error } = await client.rpc('set_my_profile', { p_color: color, p_avatar: avatar });
  if (error) throw new Error(/set_my_profile|schema cache|does not exist/i.test(error.message) ? '서버에 프로필 기능이 아직 없어요. 관리자에게 서버 설치문 15번을 실행해 달라고 해 주세요.' : koErr(error.message));
  const r = Array.isArray(data) ? data[0] : data, o = typeof r === 'string' ? JSON.parse(r) : r;
  await db.kvSetRaw('sync:roster', (await db.kvGet('sync:roster', [])).map(x => (x.id === o.id ? { ...x, color: o.color || '', avatar: o.avatar || '' } : x)));
  return o;
}
export async function isAdmin() { return !!(await me())?.is_admin; }
export async function listMembers() {
  const { data, error } = await client.rpc('list_members');
  if (error) throw new Error(koErr(error.message));
  return (data || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x));
}
/* 프로젝트 이름이 바뀌면 단기 작업자에게 맡긴 프로젝트 이름도 같이 바꿈(관리자로 로그인한 기기에서만). 돌려주는 값: 바꾼 사람 이름, 못 바꿨으면 { todo: [이름] } */
export async function renameGuestProject(old, to) {
  const ros = (await db.kvGet('sync:roster', [])).filter(r => r.kind === 'guest' && (!r.projects || r.projects.includes(old)));   /* 예전 명단에는 맡은 프로젝트가 안 적혀 있어서, 없으면 서버에 물어봄 */
  if (!session || !(await isAdmin())) return ros.some(r => r.projects) ? { todo: ros.filter(r => r.projects).map(r => r.name) } : [];
  if (!ros.length) return [];
  const done = []; const all = await listMembers();
  for (const m of all) if (m.kind === 'guest' && (m.projects || []).includes(old)) { try { await saveMember({ ...m, projects: m.projects.map(x => (x === old ? to : x)) }); done.push(m.name); } catch { } }
  const left = ros.filter(r => r.projects).map(r => r.name).filter(n => !done.includes(n)); return left.length ? { todo: left, done } : done;
}
export async function saveMember(m) {
  const base = { p_id: m.id || null, p_code: m.code, p_name: m.name, p_role: m.role || '', p_gmail: m.gmail || '', p_is_admin: !!m.is_admin, p_active: m.active !== false };
  const guest = m.kind === 'guest';
  let { data, error } = await client.rpc('admin_save_member', { ...base, p_kind: guest ? 'guest' : 'member', p_until: m.until || null, p_projects: guest ? (m.projects || []) : [] });
  if (error && /Could not find the function|schema cache|does not exist/i.test(error.message)) {   /* 서버에 16번이 아직 없음 */
    if (guest || m.until) throw new Error('서버에 단기 작업자 기능이 아직 없어요. 설정의 서버 설치문(16번)을 Supabase에서 한 번 실행해 주세요.');
    ({ data, error } = await client.rpc('admin_save_member', base));
  }
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? '이미 쓰는 코드예요' : koErr(error.message));
  return data;
}
export function newCode() {
  const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const r = crypto.getRandomValues(new Uint8Array(5));
  return [...r].map(x => A[x % A.length]).join('');
}
// 팀원 이름 (공유 팀 공간의 멤버)
export async function teammates() {
  const sp = await db.kvGet('sync:spaces', []);
  const out = new Map();
  sp.forEach(s => s.members.forEach(m => out.set(m.user, m.name)));
  return [...out].map(([user, name]) => ({ user, name }));
}

// ── 로그인 (이메일, 예비) ──
export async function signUp(email, password) {
  const c = await getClient(); if (!c) throw new Error('먼저 Supabase 주소와 키를 넣어 주세요');
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new Error(koErr(error.message));
  if (!data.session) return { confirm: true };
  await afterLogin(); return { confirm: false };
}
export async function signIn(email, password) {
  const c = await getClient(); if (!c) throw new Error('먼저 Supabase 주소와 키를 넣어 주세요');
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(koErr(error.message));
  await afterLogin();
}
async function afterLogin() {
  const { data } = await client.auth.getSession(); session = data.session;
  startP = null; await start();
}
// ── 팀 공용 AI 키 ──
// 관리자 기기에 직접 넣은 키는 서버에 올리고(설정에서 끌 수 있음), 다른 기기·팀원은 로그인만 하면 받아서 씀.
// 이 기기에 직접 넣은 키가 있으면 그 키를 그대로 씀. 키 값은 화면·기록에 남기지 않음.
const GK = 'secret:gemini';
export async function teamKey() {
  if (!session || !client) return { ok: false };
  try {
    const mine = (await db.kvGet(GK, '')) || '', fromTeam = !!(await db.kvGet('me:aiteam', false));
    const { data, error } = await client.rpc('team_secret', { p_k: 'gemini' }); if (error) return { ok: false, error: error.message };
    const team = typeof data === 'string' ? data : '';
    if (mine && !fromTeam) {
      if ((await isAdmin()) && (await db.kvGet('me:aishare', true)) !== false) {
        if (team !== mine) { const r = await client.rpc('admin_set_team_secret', { p_k: 'gemini', p_v: mine }); if (r.error) return { ok: false, error: r.error.message }; }
        return { ok: true, shared: true, own: true };
      }
      return { ok: true, own: true, team: !!team };
    }
    if (team) {
      if (team !== mine) { await db.kvSetRaw(GK, team); await db.kvSetRaw('ai:model', ''); }
      await db.kvSetRaw('me:aiteam', true);
      if (team !== mine) window.dispatchEvent(new CustomEvent('hajin:ai-key'));
      return { ok: true, team: true, got: team !== mine };
    }
    if (fromTeam) { await db.kvSetRaw(GK, ''); await db.kvSetRaw('me:aiteam', false); window.dispatchEvent(new CustomEvent('hajin:ai-key')); } /* 팀 키가 없어지면 받아 둔 것도 지움 */
    return { ok: true, team: false };
  } catch (e) { return { ok: false, error: e.message }; }
}
// 관리자: 내 키를 팀이 같이 쓸지
export async function setShareKey(on) {
  await db.kvSetRaw('me:aishare', !!on);
  if (!session || !client || !(await isAdmin())) return { ok: false };
  if (on) return teamKey();
  const r = await client.rpc('admin_set_team_secret', { p_k: 'gemini', p_v: '' });
  return { ok: !r.error };
}
export async function aiKeyInfo() { return { fromTeam: !!(await db.kvGet('me:aiteam', false)), share: (await db.kvGet('me:aishare', true)) !== false, admin: await isAdmin(), signedIn: !!session, hasServer: !!(await config()).url }; }

export async function signOut() {
  if (!client) return;
  await client.auth.signOut(); session = null; await db.kvSetRaw('me:member', null); await db.kvSetRaw('me:ended', false); GUEST = null; set({ status: 'signedout' });
}
function koErr(m = '') {
  if (/Invalid login/i.test(m)) return '이메일이나 비밀번호가 맞지 않아요';
  if (/not confirmed/i.test(m)) return '메일함에서 가입 확인 링크를 먼저 눌러 주세요';
  if (/already registered|already exists/i.test(m)) return '이미 가입된 이메일이에요. 로그인해 주세요';
  if (/at least 6/i.test(m)) return '비밀번호는 6자 이상이어야 해요';
  if (/Failed to fetch|NetworkError/i.test(m)) return '인터넷 연결을 확인해 주세요';
  if (/Could not find the function|function .* does not exist/i.test(m)) return '서버 설정이 아직 안 됐어요 (SQL 실행 필요)';
  if (/permission denied|42501/i.test(m)) return '서버가 이 기록을 열어 주지 않았어요. 관리자가 서버 설정 SQL(표 권한)을 한 번 실행해야 해요';
  if (/JWT expired|invalid JWT|session.*(missing|expired)/i.test(m)) return '로그인이 오래돼서 풀렸어요. 다시 로그인해 주세요';
  if (/row-level security|violates/i.test(m)) return '등록된 멤버만 쓸 수 있어요. 관리자에게 코드를 받아 주세요';
  if (/relation .* does not exist|schema cache/i.test(m)) return '서버 테이블이 아직 없어요. 설정의 SQL을 Supabase에서 한 번 실행해 주세요';
  return m;
}

// ── 한 번 맞추기: 내려받기 → 올리기 ──
export async function syncNow() {
  if (!session || !client) return state;
  if (busy) { pendingAgain = true; return busy; }
  if (!navigator.onLine) { set({ status: 'offline', error: '', fails: 0 }); return state; }
  busy = (async () => {
    set({ status: 'syncing' });   /* 지난번 문제 글은 성공할 때까지 남겨 둠 (맞추는 동안 안내가 깜빡이지 않게) */
    const once = async () => {
      const pulled = await pull();
      try { await dmPull(); } catch { }
      const pushed = await push();
      set({ status: 'idle', error: '', last: new Date().toISOString(), pulled, pushed, fails: 0 });
      if (pulled) window.dispatchEvent(new CustomEvent('hajin:remote', { detail: { pulled } }));
    };
    try {
      try { await once(); }
      catch (e) {
        /* 오래 닫아 뒀다 열면 로그인 표가 낡아 있을 수 있음: 한 번 새로 받아서 다시 해 봄 */
        if (!/JWT expired|invalid JWT|PGRST301/i.test(`${e.code || ''} ${e.message || ''}`)) throw e;
        const r = await client.auth.refreshSession(); if (r.error || !r.data?.session) throw e;
        session = r.data.session; await once();
      }
    } catch (e) {
      set({ status: 'error', error: koErr(e.message || String(e)), fails: state.fails + 1 });
    } finally {
      busy = null;
      if (pendingAgain) { pendingAgain = false; schedulePull(); }
    }
    return state;
  })();
  return busy;
}

async function teamSpaces() {
  const teams = await db.list('teams', { includeDeleted: true });
  const m = {}; teams.forEach(t => t.space && (m[t.id] = t.space));
  return m;
}
// 이 항목이 어느 팀 공간으로 가야 하는지 (없으면 개인)
const GUEST_COLS = new Set(['tasks', 'events', 'meetings', 'notes', 'docs', 'refs', 'figmafiles']);
let GUEST = null;   /* 단기 작업자면 { projects: [...] } */
export async function loadGuest() { const m = await db.kvGet('me:member', null); GUEST = m && m.kind === 'guest' ? { projects: m.projects || [] } : null; return GUEST; }
export const guestCanShare = (it, g = GUEST) => !g || (GUEST_COLS.has(it.col) && !!it.project && g.projects.includes(it.project));
/* 기간이 끝난 단기 작업자 기기에서는 받아 둔 팀 기록을 지움 (내가 따로 적은 내 기록은 그대로) */
async function dropTeamCopies() { for (const it of await db.allItems()) if (SHARE_COLS.has(it.col) && (it.team || it.space) && it.col !== '_kv') await db.purge(it.id); await db.kvSetRaw('sync:roster', []); }
/* 볼 수 있는 범위가 바뀌는 사람(단기 작업자)은 서버가 "이제 안 보여요"를 따로 알려 주지 않음. 그래서 가끔 통째로 다시 받아, 서버에 안 보이는 남의 팀 기록을 이 기기에서 치움.
   내가 쓴 것, 아직 못 올린 것, 서버가 거절한 것은 지우지 않음 */
let fullNext = false, guestFullAt = 0; const GUEST_FULL_MS = 10 * 60 * 1000;
export const refreshAll = () => { guestFullAt = 0; };
async function dropUnseen(spaceId, seen) {
  const tmap = await teamSpaces(), myName = await db.kvGet('name', ''), was = await db.kvGet('me:was', []);   /* 올린 사람(by)에는 이 이름이 적힘 */ let n = 0;
  for (const it of await db.allItems()) {
    if (it.col === '_kv' || !SHARE_COLS.has(it.col) || it.dirty || it.syncDenied || seen.has(it.id)) continue;
    if ((it.col === 'teams' ? it.space : (it.team && tmap[it.team])) !== spaceId) continue;
    if (it.by && (it.by === myName || was.includes(it.by)) && it.col !== 'audit') continue;
    await db.purge(it.id); n++;
  }
  return n;
}
/* 서버가 거절해서 못 올린 것: 다시 쓸 수 있게 되면(코드가 다시 살아남, 맡은 프로젝트가 늘어남) 한 번 더 올려 봄 */
async function retryDenied() { for (const it of await db.allItems()) { if (it.syncDenied) { const { syncDenied, ...x } = it; await db.putRaw({ ...x, dirty: true }); } else if (it.shareLater && !it.deleted) { const { shareLater, ...x } = it; await db.putRaw({ ...x, team: 'team-main', dirty: true, updatedAt: new Date().toISOString() }); } } }   /* shareLater: 단기 작업자가 코드가 멈춘 동안 맡은 프로젝트에 적은 것 */
export function spaceFor(it, tmap) {
  if (!SHARE_COLS.has(it.col)) return null;
  if (GUEST && !guestCanShare(it)) return null;
  if (it.col === 'teams') return it.space || null;
  return (it.team && tmap[it.team]) || null;
}
const row = it => { const { dirty, sharedMembers, syncDenied, shareLater, ...data } = it; return { id: it.id, col: it.col, data, deleted: !!it.deleted, updated_at: it.updatedAt || new Date().toISOString() }; };

async function push() {
  const dirty = await db.dirtyItems();
  if (!dirty.length) return 0;
  const tmap = await teamSpaces();
  const mine = [], shared = [];
  for (const it of dirty) {
    const sp = spaceFor(it, tmap);
    if (sp) shared.push({ ...row(it), space: sp }); else mine.push({ ...row(it), owner: session.user.id });
  }
  for (let i = 0; i < mine.length; i += CHUNK) {
    const { error } = await client.from('items').upsert(mine.slice(i, i + CHUNK), { onConflict: 'owner,id' });
    if (error) throw error;
  }
  const denied = new Set();
  for (let i = 0; i < shared.length; i += CHUNK) {
    const part = shared.slice(i, i + CHUNK);
    const { error } = await client.from('space_items').upsert(part, { onConflict: 'space,id' });
    if (!error) continue;
    if (!/row-level security|permission denied|42501/i.test(`${error.code || ''} ${error.message || ''}`)) throw error;
    // 권한이 없는 줄 하나 때문에 전체가 멈추지 않게: 하나씩 올리고, 막힌 것은 건너뜀
    for (const one of part) { const r1 = await client.from('space_items').upsert([one], { onConflict: 'space,id' }); if (r1.error) { if (/row-level security|permission denied|42501/i.test(`${r1.error.code || ''} ${r1.error.message || ''}`)) denied.add(one.id); else throw r1.error; } }
  }
  // 올리는 동안 또 고친 건 dirty 유지
  for (const it of dirty) {
    const cur = await db.get(it.id);
    if (cur && cur.updatedAt === it.updatedAt && cur.dirty) await db.putRaw({ ...cur, dirty: false, ...(denied.has(it.id) ? { syncDenied: true } : {}) });
  }
  return dirty.length;
}

async function apply(r, space) {
  r = { ...r, updated_at: new Date(r.updated_at).toISOString() }; // 서버 형식(+00:00) → 앱 형식(Z)
  // 팀 공간에서는 공유하는 종류만 받음. 설정(_kv)이나 내 개인 기록을 남이 덮어쓰지 못하게
  if (space && !SHARE_COLS.has(r.col)) return false;
  const cur = await db.get(r.id);
  if (space && cur && (cur.col !== r.col || !SHARE_COLS.has(cur.col))) return false;
  if (cur && cur.dirty && (cur.updatedAt || '') > r.updated_at) return false; // 아직 안 올린 내 수정이 더 최근이면 내 것을 둠. 이미 올린 건 서버 것을 따라 기기 시계가 달라도 맞춰짐
  if (cur && !cur.dirty && cur.updatedAt === r.updated_at && !!cur.deleted === r.deleted) return false;
  const item = db.clean({ ...r.data, id: r.id, col: r.col, deleted: r.deleted, updatedAt: r.updated_at, dirty: false }); if (!item) return false;
  if (space && r.col === 'teams') { item.space = space; if (cur?.sharedMembers) item.sharedMembers = cur.sharedMembers; }
  await db.putRaw(item);
  if (!space && r.col === '_kv' && item.key && db.SYNC_KV.includes(item.key)) await db.kvSetRaw(item.key, item.deleted ? null : item.value);
  return true;
}

const EPOCH = '1970-01-01T00:00:00Z';
async function pullTable(table, filterCol, filterVal, curKey, space, seen = null) {
  const saved = await db.kvGet(curKey, EPOCH); let n = 0;
  /* 첫 장은 지난번 자리보다 5초 앞에서부터: 두 기기가 거의 동시에 올리면 서버에 늦게 적힌 줄이 시각은 더 이를 수 있어서, 그런 줄을 놓치지 않게 겹쳐 읽음(같은 줄은 apply가 건너뜀).
     seen을 주면 처음부터 통째로 다시 받으며 서버에 있는 id를 모음 */
  let cursor = seen ? EPOCH : saved; const t = Date.parse(saved);
  if (!seen && saved !== EPOCH && !isNaN(t)) cursor = new Date(t - 5000).toISOString();
  for (; ;) {
    let q = client.from(table).select('id,col,data,deleted,updated_at,server_at').gt('server_at', cursor).order('server_at', { ascending: true }).limit(500);
    if (filterCol) q = q.eq(filterCol, filterVal);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of data) { if (seen && !r.deleted) seen.add(r.id); if (await apply(r, space)) n++; }
    if (data.length) { cursor = data[data.length - 1].server_at; if (!(Date.parse(cursor) < Date.parse(saved))) await db.kvSetRaw(curKey, cursor); }
    if (data.length < 500) break;
  }
  return n;
}

async function pull() {
  let n = await pullTable('items', 'owner', session.user.id, 'sync:cur:' + session.user.id, null);
  // 내가 속한 팀 공간
  const { data: mem, error } = await client.from('space_members').select('space,user_id,name,spaces(id,name,code)').order('joined_at');
  if (error) throw error;
  const spaces = {};
  for (const m of mem) { const s = spaces[m.space] ||= { id: m.space, name: m.spaces?.name, code: m.spaces?.code, members: [] }; s.members.push({ user: m.user_id, name: m.name || '팀원' }); }
  await db.kvSetRaw('sync:spaces', Object.values(spaces));
  try { const { data: ros, error: rerr } = await client.rpc('list_members'); if (ros && !rerr) { const all = ros.map(x => (typeof x === 'string' ? JSON.parse(x) : x));
      const next = all.filter(x => x.active && !x.ended).map(x => ({ id: x.id, name: x.name, role: x.role, gmail: x.gmail, user: x.user_id, color: x.color || '', avatar: x.avatar || '', ...(x.kind === 'guest' ? { kind: 'guest', projects: x.projects || [] } : {}), ...(x.until ? { until: x.until } : {}) }));
      const meM = await db.kvGet('me:member', null);
      /* 로그인했는데 명단이 비어서 오면: 코드가 멈췄거나 쓸 수 있는 기간이 끝난 것 */
      const ended = !!meM && !all.length; if (ended !== !!(await db.kvGet('me:ended', false))) { await db.kvSetRaw('me:ended', ended); n++; if (ended && meM.kind === 'guest') await dropTeamCopies().catch(() => { }); if (!ended) { fullNext = true; await retryDenied().catch(() => { }); } }
      if (!ended) {
        const before = JSON.stringify(await db.kvGet('sync:roster', [])); await db.kvSetRaw('sync:roster', next);
        const mine = meM && all.find(x => x.id === meM.id);
        if (mine) { const want = { name: mine.name, role: mine.role, is_admin: !!mine.is_admin, kind: mine.kind || 'member', until: mine.until || null, projects: mine.projects || [] }, had = { name: meM.name, role: meM.role, is_admin: !!meM.is_admin, kind: meM.kind || 'member', until: meM.until || null, projects: meM.projects || [] };
          if (JSON.stringify(want) !== JSON.stringify(had)) { await db.kvSetRaw('me:member', { ...meM, ...want }); if (want.kind !== had.kind || JSON.stringify(want.projects) !== JSON.stringify(had.projects)) { fullNext = true; await retryDenied().catch(() => { }); }   /* 볼 수 있는 범위가 바뀜 → 통째로 다시 맞춤 */ if (mine.name !== meM.name) { await db.kvSetRaw('me:was', [...new Set([...(await db.kvGet('me:was', [])), await db.kvGet('name', ''), meM.name].filter(Boolean))].slice(-8));   /* 예전 이름으로 올린 것도 내 것으로 알아보게 */ await db.kvSet('name', mine.name.length === 3 ? mine.name.slice(1) : mine.name); } await loadGuest(); try { (await import('./admin.js')).clearCache(); } catch { } n++; } }
        if (before !== JSON.stringify(next)) n++;   /* 이름·역할·색·사진이 바뀌면 화면을 다시 그림. 이름과 역할은 관리자가 정한 것을 따름 */
      } } } catch { }
  for (const s of Object.values(spaces)) {
    if (!s.members.some(m => m.user === session.user.id)) continue;
    const full = fullNext || (!!GUEST && Date.now() - guestFullAt > GUEST_FULL_MS), seen = full ? new Set() : null;
    n += await pullTable('space_items', 'space', s.id, 'sync:cur:space:' + s.id, s.id, seen);
    if (seen && GUEST) n += await dropUnseen(s.id, seen);
    // 팀 기록에 공간 멤버·코드 붙이기 (기기 표시용, 올리지 않음)
    for (const t of (await db.list('teams')).filter(t => t.space === s.id)) {
      const same = JSON.stringify(t.sharedMembers || []) === JSON.stringify(s.members) && t.code === s.code;
      if (!same) { await db.putRaw({ ...t, sharedMembers: s.members, code: s.code }); n++; }
    }
  }
  if (GUEST) guestFullAt = Date.now(); fullNext = false;
  return n;
}

// ── 팀 공유 ──
export async function shareTeam(team) {
  if (!session) throw new Error('먼저 설정에서 동기화 로그인을 해 주세요');
  const me = await db.kvGet('name', '하진');
  const { data, error } = await client.rpc('create_space', { p_name: team.name, p_my_name: me });
  if (error) throw new Error(koErr(error.message));
  const s = Array.isArray(data) ? data[0] : data;
  await db.put('teams', { ...team, space: s.id, code: s.code });
  // 이미 있던 팀 일정·조율·할 일도 공간으로 올림
  for (const col of ['events', 'polls', 'pollvotes', 'tasks']) for (const x of await db.list(col)) if (x.team === team.id) await db.put(col, x);
  await syncNow();
  return s.code;
}
export async function joinTeam(code) {
  if (!session) throw new Error('먼저 설정에서 동기화 로그인을 해 주세요');
  const me = await db.kvGet('name', '하진');
  const { data, error } = await client.rpc('join_space', { p_code: code, p_my_name: me });
  if (error) throw new Error(koErr(error.message));
  const s = Array.isArray(data) ? data[0] : data;
  await syncNow();
  return s;
}
export async function leaveTeam(team) {
  if (!session || !team.space) return;
  await client.from('space_members').delete().eq('space', team.space).eq('user_id', session.user.id);
  for (const col of ['teams', 'events', 'polls', 'pollvotes', 'tasks']) for (const x of await db.list(col)) if (x.id === team.id || x.team === team.id) await db.putRaw({ ...x, deleted: true, dirty: false });
}

export const enabled = () => !!session;
// 로그인돼 있을 때만 서버 연결을 내줌 (푸시 알림 등록 같은 작은 일에 씀)
export const raw = async () => (session && client ? client : null);
// 레퍼런스 이미지 → 팀 저장소 (무료 1GB). 로그인 안 했거나 실패하면 null (그땐 기기에만 저장)
export async function uploadImage(blob) {
  if (!session || !client) return null;
  const ext = (blob.type.split('/')[1] || 'webp').replace('jpeg', 'jpg');
  const path = `${session.user.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await client.storage.from('refs').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) return null;
  return client.storage.from('refs').getPublicUrl(path).data.publicUrl;
}
// 공유를 끈 항목: 팀 공간에서는 지운 것으로 표시 (내 쪽 기록은 그대로)
export async function unshare(it) {
  if (!session || !it?.team) return;
  const sp = spaceFor(it, await teamSpaces());
  if (!sp) return;
  await client.from('space_items').upsert([{ ...row({ ...it, deleted: true }), space: sp }], { onConflict: 'space,id' });
}

// 실시간 방 (DB를 거치지 않는 즉시 전달: 마인드맵 회의에서 서로의 움직임을 바로 보기)
export function room(name, onMsg) {
  if (!client || !session) return null;
  try {
    const ch = client.channel('room-' + name, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'm' }, p => { try { onMsg(p.payload); } catch { } }).subscribe();
    return { send: payload => { try { ch.send({ type: 'broadcast', event: 'm', payload }); } catch { } }, close: () => { try { client.removeChannel(ch); } catch { } } };
  } catch { return null; }
}

// ── 개인 메신저 (dms 테이블: 보낸 사람·받는 사람만 읽을 수 있음) ──
async function dmStore(rows, live = false) {
  const my = (await me())?.id; if (!my) return 0; let n = 0;
  const roster = await db.kvGet('sync:roster', []);
  for (const r of rows || []) {
    if (!r?.id || (r.from_member !== my && r.to_member !== my)) continue;
    const had = await db.get('dm-' + r.id);
    const mine = r.from_member === my, other = mine ? r.to_member : r.from_member;
    const it = { id: 'dm-' + r.id, col: 'dms', sid: r.id, mine, other, otherName: roster.find(x => x.id === other)?.name || '멤버', body: r.body, meta: r.meta || {}, readAt: r.read_at || '', createdAt: r.created_at, updatedAt: r.created_at, deleted: false, dirty: false };
    await db.putRaw({ ...(had || {}), ...it, handled: had?.handled });
    if (!had) { n++; if (!mine) window.dispatchEvent(new CustomEvent('hajin:dm', { detail: { item: it, live } })); }
  }
  return n;
}
export async function dmPull() {
  if (!client || !session || !(await me())) return 0;
  const cur = await db.kvGet('sync:dmCursor', '1970-01-01T00:00:00Z');
  const back = new Date(new Date(cur).getTime() - 5 * 60 * 1000).toISOString(); // 보낸 기기 시계가 조금 느려도 빠뜨리지 않게 5분 겹쳐서 받음 (같은 건 id로 걸러짐)
  const { data, error } = await client.from('dms').select('*').gt('created_at', back).order('created_at').limit(500);
  if (error) { if (/does not exist|schema cache/i.test(error.message)) return 0; throw new Error(koErr(error.message)); }
  const n = await dmStore(data);
  if (data?.length) await db.kvSetRaw('sync:dmCursor', data[data.length - 1].created_at);
  return n;
}
export async function dmSend(toId, body, meta = {}) {
  const my = (await me())?.id; if (!client || !session || !my) throw new Error('멤버 코드로 로그인해야 메시지를 보낼 수 있어요');
  const row = { id: crypto.randomUUID(), from_member: my, to_member: toId, body: String(body).slice(0, 4000), meta }; // 보낸 시각은 서버가 찍음
  const { error } = await client.from('dms').insert(row);
  if (error) throw new Error(koErr(error.message));
  await dmStore([{ ...row, created_at: new Date().toISOString() }]);   /* 서버 시각을 받기 전까지는 이 기기 시각으로: 안 그러면 방금 보낸 말이 시각 없이 대화 맨 위로 올라감 */
  return row;
}
export async function dmRead(otherId) {
  const my = (await me())?.id; if (!client || !session || !my) return;
  const now = new Date().toISOString();
  for (const d of (await db.list('dms')).filter(d => !d.mine && d.other === otherId && !d.readAt)) await db.putRaw({ ...d, readAt: now });
  try { await client.from('dms').update({ read_at: now }).eq('to_member', my).eq('from_member', otherId).is('read_at', null); } catch { }
}

// 구글 캘린더 구독용 일정 파일(.ics). 주소에 긴 무작위 값이 들어가서 주소를 아는 사람만 볼 수 있음
export async function publishCal(text, key) {
  if (!session || !client) return null;
  key = key || `${session.user.id}/${crypto.randomUUID().replace(/-/g, '')}.ics`;
  const { error } = await client.storage.from('cal').upload(key, new Blob([text], { type: 'text/calendar' }), { contentType: 'text/calendar; charset=utf-8', cacheControl: '300', upsert: true });
  if (error) throw new Error('일정 파일을 올리지 못했어요: ' + error.message);
  return { key, url: client.storage.from('cal').getPublicUrl(key).data.publicUrl };
}
export async function removeCal(key) { if (session && client) await client.storage.from('cal').remove([key]); }
