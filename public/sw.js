// Minimal service worker — enables installability and an offline app shell.
const CACHE = 'nexus-v1'
const SHELL = ['/', '/dashboard', '/players', '/trade']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  // Network-first for navigations (fresh data), falling back to cache offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put(req, res.clone())); return res }).catch(() => caches.match(req).then((m) => m || caches.match('/dashboard'))))
    return
  }
  // Cache-first for static assets.
  if (/\.(?:css|js|png|svg|jpg|jpeg|webp|woff2?)$/.test(new URL(req.url).pathname)) {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put(req, res.clone())); return res })))
  }
})
