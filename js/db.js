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
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
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

function emit(col, item) { listeners.forEach(fn => { try { fn(col, item); } catch (e) { console.error(e); } }); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function list(col, { includeDeleted = false } = {}) {
  const all = await tx('items', 'readonly', s => req(s.index('col').getAll(col)));
  return all.filter(x => includeDeleted || !x.deleted);
}
export async function get(id) { return tx('items', 'readonly', s => req(s.get(id))); }

export async function put(col, data) {
  const prev = data.id ? await get(data.id) : null;
  const item = { ...(prev || {}), ...data, id: data.id || uid(), col, updatedAt: now(), dirty: true };
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
export const SYNC_KV = ['name', 'focusGoal', 'brain:learned', 'accent', 'theme'];
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
    c.onsuccess = () => { const cur = c.result; if (cur) { if (!String(cur.key).startsWith('secret:')) kv[cur.key] = cur.value; cur.continue(); } else res(); };
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
export async function importAll(json) {
  if (json.app !== 'hajin-assistant') throw new Error('하진 비서 백업 파일이 아니에요');
  for (const it of json.items || []) {
    const cur = await get(it.id);
    if (!cur || cur.updatedAt < it.updatedAt) await putRaw({ ...it, dirty: true });
  }
  for (const [k, v] of Object.entries(json.kv || {})) await kvSetRaw(k, v);
  for (const [k, v] of Object.entries(json.blobs || {})) await putBlob(await (await fetch(v.data)).blob(), k);
}
export function blobToDataURL(b) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
}
export async function persist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
