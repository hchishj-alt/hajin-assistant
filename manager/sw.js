// 매니저 앱 오프라인 + 자동 업데이트. app.js의 VERSION과 같이 올릴 것
const VERSION = '1.4.2';
const CACHE = 'mgr-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'app.css', 'app.js', 'store.js', 'analyze.js', 'ai.js', 'ig.js', 'importers.js', 'video.js', 'demo.js', 'ui.js', 'strategy.js', 'explore.js', 'web.js', 'fields.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable.png', '../js/db.js', '../js/icons.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith('mgr-') && k !== CACHE) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE); const hit = await c.match(e.request, { ignoreSearch: true }); if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok && url.pathname.includes('/manager/')) c.put(e.request, r.clone()); return r; }
      catch { return e.request.mode === 'navigate' ? (await c.match('index.html')) || Response.error() : Response.error(); }
    })());
  } else if (/pretendard/.test(url.href)) {
    e.respondWith((async () => { const c = await caches.open('mgr-fonts'); const hit = await c.match(e.request); if (hit) return hit; const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; })());
  }
});
