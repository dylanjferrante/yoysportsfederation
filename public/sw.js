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

// Web push: show the notification the server sent.
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = {} }
  const title = data.title || 'Nexus Federation'
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { link: data.link || '/' },
    tag: data.tag,
  }))
})

// Focus an existing tab (or open one) at the notification's link on click.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const link = (e.notification.data && e.notification.data.link) || '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
    for (const c of cls) { if ('focus' in c) { c.navigate(link); return c.focus() } }
    return self.clients.openWindow(link)
  }))
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
