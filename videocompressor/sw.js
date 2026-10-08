const PREFIX = 'framefit-' + self.registration.scope + '-';
const CACHE = PREFIX + '1791469521767';
const ASSETS = ["./assets/index-BJsS9O56.css","./assets/index-QeAHYRsu.js","./assets/worker-DYSz7Krg.js","./ffmpeg/ffmpeg-core.js","./ffmpeg/ffmpeg-core.wasm","./icons/icon-192.png","./icons/icon-512.png","./icons/icon.svg","./index.html","./manifest.webmanifest"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' && url.origin === self.location.origin && url.pathname === new URL(self.registration.scope).pathname) { event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(new URL('./index.html', self.registration.scope).href)) || fetch(event.request))); return; }
  if (url.origin !== self.location.origin || !ASSETS.some(path => new URL(path, self.registration.scope).href === url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
