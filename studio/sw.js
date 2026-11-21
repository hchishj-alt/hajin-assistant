// 프롬프트 스튜디오 전용 서비스 워커. 범위를 /studio/로 좁혀서, 같은 주소 아래 팀 앱의 서비스 워커가
// 이 화면을 옛 캐시로 내주지 않게 함. 늘 새 것 먼저, 인터넷이 없을 때만 받아 둔 것.
const CACHE = 'ps-v5';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('ps-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try { const r = await fetch(e.request, { cache: 'no-cache' }); if (r.ok) c.put(e.request, r.clone()); return r; }
    catch { return (await c.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' && await c.match('./')) || Response.error(); }
  })());
});
