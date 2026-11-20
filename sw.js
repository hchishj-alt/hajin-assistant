// 오프라인 실행 + 자동 업데이트. 배포 때 VERSION을 js/version.js와 같이 올리면 새 버전이 설치돼요.
const VERSION = '1.36.0';
const CACHE = 'hajin-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable.png', 'supabase/setup.sql',
  'js/app.js', 'js/install.js', 'js/alarm.js', 'js/alarmui.js', 'js/push.js', 'js/widget.js', 'js/prompts.js', 'js/helper.js', 'modules/prompts.js', 'js/ui.js', 'js/db.js', 'js/icons.js', 'js/brain.js', 'js/store.js', 'js/fields.js', 'js/draftcard.js', 'js/where.js', 'js/context.js', 'js/query.js', 'js/voice.js', 'js/video.js', 'js/ext.js', 'js/seed.js', 'js/selftest.js', 'js/version.js', 'js/sync.js', 'js/config.js', 'js/figma-api.js', 'js/linkpreview.js', 'js/theme.js', 'js/admin.js', 'js/look.js', 'js/labels.js', 'js/auto.js', 'js/feedback.js', 'js/dm.js', 'js/gcal.js', 'js/codex.js', 'js/chat.js', 'js/outline.js', 'js/taste.js', 'js/place.js', 'js/scope.js', 'js/queue.js', 'js/ai.js', 'js/keyshare.js', 'js/vendor-qr.js', 'js/vendor-jsqr.js', 'js/act.js', 'js/ask.js', 'js/follow.js', 'js/xlsx.js', 'js/product.js', 'js/vendor-supabase.js',
  ...['today', 'assistant', 'inbox', 'calendar', 'tasks', 'meetings', 'plan', 'studio', 'figma', 'archive', 'radar', 'admin', 'look', 'shop', 'board', 'talk', 'feed', 'vendors', 'dev', 'people', 'team', 'money', 'startup', 'settings', 'health', 'menu'].map(m => `modules/${m}.js`)];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('hajin-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 같은 출처: 캐시 먼저 (쿼리스트링 무시), 없으면 네트워크
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      // 매일 바뀌는 자료(data/)는 새 것 먼저, 인터넷 없으면 받아 둔 것
      if (url.pathname.includes('/data/')) { try { const r = await fetch(e.request, { cache: 'no-store' }); if (r.ok) c.put(e.request, r.clone()); return r; } catch { return (await c.match(e.request, { ignoreSearch: true })) || Response.error(); } }
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
      catch { return e.request.mode === 'navigate' ? ((await c.match('index.html')) || Response.error()) : Response.error(); }
    })());
    return;
  }
  // 글꼴 CDN: 받아 두고 재사용
  if (/cdn\.jsdelivr\.net\/gh\/orioncactus|fonts\.(googleapis|gstatic)\.com/.test(url.href)) {
    e.respondWith((async () => { const c = await caches.open('hajin-fonts'); const hit = await c.match(e.request); if (hit) return hit; const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; })());
  }
});
// ── 푸시 알림 ──
// 서버는 내용 없는 신호만 보냄. 알림 글은 ① 서버(push_due: 이 기기의 푸시 주소를 아는 쪽에만 돌려줌) ② 기기에 적어 둔 알림 목록 ③ 그래도 없으면 한 줄 안내 순서로 찾음.
function kvOpen() { return new Promise((res, rej) => { const r = indexedDB.open('hajin-assistant'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kvRead(key) { const d = await kvOpen(); try { if (!d.objectStoreNames.contains('kv')) return undefined; return await new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } finally { d.close(); } }
async function kvWrite(key, v) { const d = await kvOpen(); try { if (!d.objectStoreNames.contains('kv')) return; await new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); } finally { d.close(); } }
async function dueFromServer() {
  const cfg = await kvRead('me:pushcfg'); const sub = await self.registration.pushManager.getSubscription();
  if (!cfg || !cfg.url || !sub) return [];
  const r = await fetch(cfg.url + '/rest/v1/rpc/push_due', { method: 'POST', headers: { 'content-type': 'application/json', apikey: cfg.key, authorization: 'Bearer ' + cfg.key }, body: JSON.stringify({ p_endpoint: sub.endpoint }) });
  if (!r.ok) return []; const j = await r.json(); return Array.isArray(j) ? j : [];
}
async function onPush(e) {
  let list = [];
  try { if (e.data) { const d = e.data.json(); list = [].concat(d).filter(x => x && x.title); } } catch { }
  if (!list.length) list = await dueFromServer().catch(() => []);
  /* 조금 전에 이미 띄운 것은 빼고 새것만. 새것이 없으면 같은 것을 조용히 다시(같은 자리에) 띄움. 신호를 받으면 꼭 하나는 보여야 폰이 알림을 끊지 않음 */
  const shown = (await kvRead('me:pushshown').catch(() => null)) || {};
  const fresh = list.filter(a => !shown[a.id]); if (fresh.length) list = fresh;
  if (!list.length) list = [{ id: 'ping', title: '하진 비서', body: '확인할 알림이 있어요.', url: '#/today' }];
  const fired = (await kvRead('me:alarmfired').catch(() => null)) || {}; const keep = Date.now() - 3 * 864e5;
  for (const k of Object.keys(shown)) if (shown[k] < keep) delete shown[k];
  for (const a of list) { fired[a.id] = shown[a.id] = Date.now(); await self.registration.showNotification(a.title, { body: a.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: a.id || 'hajin', renotify: !!fresh.length, data: { url: a.url || '#/today' } }); }
  await kvWrite('me:alarmfired', fired).catch(() => { });   /* 앱이 열릴 때 같은 알림을 또 울리지 않게 */
  await kvWrite('me:pushshown', shown).catch(() => { });
}
self.addEventListener('push', e => { e.waitUntil(onPush(e)); });
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '#/calendar';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { if (cs[0]) { cs[0].postMessage({ go: url }); return cs[0].focus(); } return self.clients.openWindow('./' + url); }));
});
