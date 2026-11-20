// 대본·테이크 저장 (이 기기 IndexedDB). 서버 없음.
const DB = 'hajin-prompter';
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('scripts', { keyPath: 'id' });
      const t = d.createObjectStore('takes', { keyPath: 'id' });
      t.createIndex('script', 'scriptId');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return open().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
  }));
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const scripts = {
  all: () => tx('scripts', 'readonly', s => s.getAll()).then(a => a.sort((x, y) => y.updatedAt - x.updatedAt)),
  get: id => tx('scripts', 'readonly', s => s.get(id)),
  put: v => tx('scripts', 'readwrite', s => { s.put(v); }),
  remove: async id => {
    for (const t of await takes.of(id)) await takes.remove(t.id);
    return tx('scripts', 'readwrite', s => { s.delete(id); });
  },
};
export const takes = {
  of: id => tx('takes', 'readonly', s => s.index('script').getAll(id)).then(a => a.sort((x, y) => y.createdAt - x.createdAt)),
  count: () => tx('takes', 'readonly', s => s.count()),
  // 대본별 테이크 수 (영상 본문은 읽지 않음)
  countBy: () => open().then(d => new Promise((res, rej) => {
    const m = {}; const c = d.transaction('takes').objectStore('takes').index('script').openKeyCursor();
    c.onsuccess = () => { const k = c.result; if (!k) return res(m); m[k.key] = (m[k.key] || 0) + 1; k.continue(); };
    c.onerror = () => rej(c.error);
  })),
  put: v => tx('takes', 'readwrite', s => { s.put(v); }),
  remove: id => tx('takes', 'readwrite', s => { s.delete(id); }),
};

// 설정은 작아서 localStorage
const KEY = 'prompter:set';
export const DEFAULTS = { cpm: 320, fs: 34, band: 44, mirrorText: false, center: false, cam: true, facing: 'user', voice: false, countdown: 3 };
export function getSet() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function saveSet(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }
export function flag(k, v) { try { if (v === undefined) return localStorage.getItem('prompter:' + k); localStorage.setItem('prompter:' + k, v); } catch {} }
