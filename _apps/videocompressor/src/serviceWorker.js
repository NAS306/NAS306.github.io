const PREFIX = 'framefit-' + self.registration.scope + '-';
const CACHE = PREFIX + '__VERSION__';
const ASSETS = __ASSETS__;
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.filter(path => !path.startsWith('./ffmpeg-mt/'))))));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
function isolate(response) {
  if (!response || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy','same-origin');
  headers.set('Cross-Origin-Embedder-Policy','require-corp');
  headers.set('Cross-Origin-Resource-Policy','same-origin');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' && url.origin === self.location.origin && url.pathname === new URL(self.registration.scope).pathname) { event.respondWith(caches.open(CACHE).then(async cache => isolate((await cache.match(new URL('./index.html', self.registration.scope).href)) || await fetch(event.request)))); return; }
  if (url.origin !== self.location.origin || !ASSETS.some(path => new URL(path, self.registration.scope).href === url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return isolate(cached);
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return isolate(response);
  }));
});
