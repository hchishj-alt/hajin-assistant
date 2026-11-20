// 로컬 우선 저장소 (IndexedDB). 모든 데이터는 items 스토어 하나에 컬렉션 이름(col)으로 구분해 저장.
// 각 항목: { id, col, createdAt, updatedAt, deleted, dirty, ...필드 }
// dirty=true 는 아직 클라우드로 올라가지 않은 변경 (동기화 단계에서 사용).
const DB_NAME = 'hajin-assistant';
const VER = 1;
let dbp;
const listeners = new Set();

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('items')) {
        const s = db.createObjectStore('items', { keyPath: 'id' });
        s.createIndex('col', 'col');
        s.createIndex('dirty', 'dirty');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    r.onsuccess = () => { const d = r.result; d.onclose = d.onversionchange = () => { try { d.close(); } catch { } dbp = null; }; res(d); }; // 브라우저가 연결을 닫으면 다음에 다시 엶
    r.onerror = () => { dbp = null; rej(r.error); };
    r.onblocked = () => { dbp = null; rej(new Error('저장소가 다른 탭에서 잠겨 있어요')); };
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => (out = v));
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const now = () => new Date().toISOString();
// 저장된 시각(UTC로 적힌 글)이 이 기기 시간으로 며칠인지. 그냥 앞 10글자를 자르면 자정부터 아침 9시(한국) 사이에 하루가 어긋남
export const dayOf = x => { if (!x) return ''; if (typeof x === 'string' && x.length <= 10) return x; const d = x instanceof Date ? x : new Date(x); if (isNaN(d)) return String(x).slice(0, 10); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function emit(col, item) { listeners.forEach(fn => { try { fn(col, item); } catch (e) { console.error(e); } }); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function list(col, { includeDeleted = false } = {}) {
  const all = await tx('items', 'readonly', s => req(s.index('col').getAll(col)));
  return all.filter(x => includeDeleted || !x.deleted);
}
export async function get(id) { return tx('items', 'readonly', s => req(s.get(id))); }

// 저장 전 검사·기록 (권한, 수정 기록). js/admin.js 가 등록함
let guard = null;
export function setGuard(fn) { guard = fn; }
export async function put(col, data) {
  const prev = data.id ? await get(data.id) : null;
  const item = { ...(prev || {}), ...data, id: data.id || uid(), col, updatedAt: now(), dirty: true };
  if (guard) await guard(prev, item);
  if (!item.createdAt) item.createdAt = item.updatedAt;
  if (item.deleted === undefined) item.deleted = false;
  await tx('items', 'readwrite', s => req(s.put(item)));
  emit(col, item);
  return item;
}
export async function patch(id, fields) {
  const prev = await get(id);
  if (!prev) return null;
  return put(prev.col, { ...prev, ...fields });
}
export async function remove(id) {
  const prev = await get(id);
  if (!prev) return;
  return put(prev.col, { ...prev, deleted: true });
}
// 동기화 단계에서 서버 값 반영할 때 사용 (dirty 표시 안 함)
export async function putRaw(item) {
  await tx('items', 'readwrite', s => req(s.put(item)));
  emit(item.col, item);
}
export async function dirtyItems() {
  const all = await tx('items', 'readonly', s => req(s.getAll()));
  return all.filter(x => x.dirty);
}
export async function allItems() { return tx('items', 'readonly', s => req(s.getAll())); }

// 큰 파일(사진·음성·영상)은 blobs 스토어에
export async function putBlob(blob, key = uid()) { await tx('blobs', 'readwrite', s => req(s.put(blob, key))); return key; }
export async function getBlob(key) { return key ? tx('blobs', 'readonly', s => req(s.get(key))) : null; }
export async function delBlob(key) { return tx('blobs', 'readwrite', s => req(s.delete(key))); }

// 설정 등 키-값
export async function kvGet(k, d = null) { const v = await tx('kv', 'readonly', s => req(s.get(k))); return v === undefined ? d : v; }
// 기기 사이에 같이 맞출 설정 (동기화 켜면 items의 _kv 로 오감)
export const SYNC_KV = ['name', 'focusGoal', 'brain:learned', 'accent', 'theme', 'palette', 'palTint', 'palAcc', 'look', 'auto:learned', 'ai:prefs', 'gcal', 'prompts:fav', 'prompts:about'];
export async function kvSet(k, v) {
  await tx('kv', 'readwrite', s => req(s.put(v, k)));
  if (SYNC_KV.includes(k)) await put('_kv', { id: 'kv:' + k, key: k, value: v ?? null });
}
export async function kvSetRaw(k, v) { return tx('kv', 'readwrite', s => req(s.put(v, k))); }

// 전체 백업/복원 (사진·영상 원본은 용량 때문에 선택)
export async function exportAll({ withBlobs = false } = {}) {
  const items = await allItems();
  const kv = {};
  await tx('kv', 'readonly', s => new Promise(res => {
    const c = s.openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { if (!/^(secret:|sync:|me:)/.test(String(cur.key))) kv[cur.key] = cur.value; cur.continue(); } else res(); };
  }));
  const out = { app: 'hajin-assistant', version: 1, exportedAt: now(), items, kv };
  if (withBlobs) {
    out.blobs = {};
    const keys = await tx('blobs', 'readonly', s => req(s.getAllKeys()));
    for (const k of keys) {
      const b = await getBlob(k);
      out.blobs[k] = { type: b.type, data: await blobToDataURL(b) };
    }
  }
  return out;
}
// 밖에서 들어오는 기록(동기화·백업 파일)을 화면이 깨지지 않는 모양으로 다듬음. 못 쓰는 건 null
export function clean(it) {
  if (!it || typeof it !== 'object' || typeof it.id !== 'string' || typeof it.col !== 'string') return null;
  const o = { ...it }; const str = k => { if (o[k] != null && typeof o[k] !== 'string') o[k] = String(o[k]); };
  for (const k of ['title', 'name', 'memo', 'body', 'who', 'place', 'project', 'date', 'due', 'start', 'end', 'time', 'text', 'attendees']) str(k);
  for (const k of ['tags', 'members', 'prices', 'krs', 'handoffs', 'skip']) if (o[k] != null && !Array.isArray(o[k])) o[k] = [];
  for (const k of ['url', 'link', 'embed', 'mapUrl', 'image', 'thumb', 'src', 'href']) if (o[k] != null && (typeof o[k] !== 'string' || /^\s*(javascript|vbscript|data:(?!image\/))/i.test(o[k]))) o[k] = ''; // javascript: 같은 주소는 버림
  if (o.embed && !/^https:\/\//i.test(o.embed)) o.embed = '';
  if (o.col === 'bnodes') { o.x = Number(o.x) || 0; o.y = Number(o.y) || 0; }
  if (o.col === 'contacts' && !o.name) o.name = '(이름 없음)';
  if (o.col === 'leads' && !o.title) o.title = '(제목 없음)';
  if (o.col === 'polls') { if (typeof o.from !== 'string') o.from = '09:00'; if (typeof o.to !== 'string') o.to = '18:00'; }
  return o;
}
export async function importAll(json) {
  if (json.app !== 'hajin-assistant') throw new Error('하진 비서 백업 파일이 아니에요');
  for (const raw of json.items || []) {
    const it = clean(raw); if (!it || it.col === '_kv' && !SYNC_KV.includes(it.key)) continue;
    const cur = await get(it.id);
    if (!cur || cur.updatedAt < it.updatedAt) await putRaw({ ...it, dirty: true });
  }
  // 로그인 정보와 서버 주소는 파일에서 받지 않음 (남의 파일로 관리자 표시나 서버가 바뀌지 않게)
  for (const [k, v] of Object.entries(json.kv || {})) if (!/^(sync:|me:|secret:)/.test(k)) await kvSetRaw(k, v);
  for (const [k, v] of Object.entries(json.blobs || {})) await putBlob(await (await fetch(v.data)).blob(), k);
}
export function blobToDataURL(b) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
}
export async function persist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
