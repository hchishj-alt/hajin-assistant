// 오프라인 실행 + 자동 업데이트. 배포 때 VERSION을 js/version.js와 같이 올리면 새 버전이 설치돼요.
const VERSION = '1.13.6';
const CACHE = 'hajin-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/ui.js', 'js/db.js', 'js/icons.js', 'js/brain.js', 'js/store.js', 'js/fields.js', 'js/draftcard.js', 'js/query.js', 'js/voice.js', 'js/video.js', 'js/ext.js', 'js/seed.js', 'js/selftest.js', 'js/version.js', 'js/sync.js', 'js/config.js', 'js/figma-api.js', 'js/linkpreview.js', 'js/theme.js', 'js/admin.js', 'js/look.js', 'js/labels.js', 'js/auto.js', 'js/feedback.js', 'js/dm.js', 'js/gcal.js', 'js/codex.js', 'js/chat.js', 'js/outline.js', 'js/taste.js', 'js/place.js', 'js/scope.js', 'js/queue.js', 'js/ai.js', 'js/keyshare.js', 'js/vendor-qr.js', 'js/vendor-jsqr.js', 'js/act.js', 'js/ask.js', 'js/xlsx.js', 'js/product.js', 'js/vendor-supabase.js',
  ...['today', 'assistant', 'inbox', 'calendar', 'tasks', 'meetings', 'plan', 'studio', 'figma', 'archive', 'radar', 'admin', 'look', 'shop', 'board', 'talk', 'feed', 'vendors', 'dev', 'people', 'team', 'money', 'startup', 'settings', 'health', 'menu'].map(m => `modules/${m}.js`)];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { })))));
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
      catch { return (await c.match('index.html')) || Response.error(); }
    })());
    return;
  }
  // 글꼴 CDN: 받아 두고 재사용
  if (/cdn\.jsdelivr\.net\/gh\/orioncactus|fonts\.(googleapis|gstatic)\.com/.test(url.href)) {
    e.respondWith((async () => { const c = await caches.open('hajin-fonts'); const hit = await c.match(e.request); if (hit) return hit; const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; })());
  }
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs[0] ? cs[0].focus() : self.clients.openWindow('./#/calendar'))); });
