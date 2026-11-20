// 매니저 앱 저장소: 이 기기 IndexedDB 'hajin-manager'의 kv 하나. 비서 앱 데이터와 섞이지 않음.
// 가상 인플루언서(연습 모드)는 'demo:' 접두어로 따로 저장해서 진짜 기록을 건드리지 않음.
const DB = 'hajin-manager';
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
const tx = (mode, fn) => open().then(d => new Promise((res, rej) => {
  const t = d.transaction('kv', mode), s = t.objectStore('kv'); let out;
  const q = fn(s); if (q) q.onsuccess = () => { out = q.result; };
  t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
}));
let mode = 'real';
export const setMode = m => { mode = m; };
export const getMode = () => mode;
const ns = k => (mode === 'demo' && !k.startsWith('g:') ? 'demo:' : '') + k;   // g: 는 모드와 상관없는 공용 값
const subs = new Set();
export const onChange = f => (subs.add(f), () => subs.delete(f));
export async function get(k, d = null) { const v = await tx('readonly', s => s.get(ns(k))); return v === undefined ? d : v; }
export async function set(k, v) { await tx('readwrite', s => s.put(v, ns(k))); subs.forEach(f => f(k)); return v; }
export async function del(k) { await tx('readwrite', s => s.delete(ns(k))); subs.forEach(f => f(k)); }
export async function clearDemo() { const d = await open(); await new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); const s = t.objectStore('kv'); const q = s.getAllKeys(); q.onsuccess = () => q.result.filter(k => String(k).startsWith('demo:')).forEach(k => s.delete(k)); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
export async function update(k, d, fn) { const v = await get(k, d); const n = await fn(v); return set(k, n === undefined ? v : n); }
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// 게시물 넣기: 같은 플랫폼에서 id나 (링크) 또는 (올린 시각+캡션 앞부분)이 같으면 합침. 숫자는 새 값이 있으면 새 값
export function postKey(p) { return p.plat + ':' + (p.ext || p.url || (String(p.at).slice(0, 16) + '|' + (p.caption || '').slice(0, 24))); }
export async function addPosts(list) {
  const cur = await get('posts', []); const map = new Map(cur.map(p => [postKey(p), p]));
  let added = 0;
  for (const p of list) {
    const k = postKey(p); const old = map.get(k);
    if (old) { for (const [f, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') old[f] = v; }
    else { map.set(k, { id: uid(), ...p }); added++; }
  }
  const all = [...map.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  await set('posts', all); return added;
}
export async function snap(plat, followers, following) {
  if (!Number.isFinite(+followers)) return;
  const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  await update('snaps', [], s => { const o = s.find(x => x.date === date && x.plat === plat); if (o) { o.followers = +followers; if (following != null) o.following = +following; } else s.push({ date, plat, followers: +followers, following: following == null ? undefined : +following }); s.sort((a, b) => a.date.localeCompare(b.date)); return s; });
}
