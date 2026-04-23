// Super Deal Pizza — Service Worker v2
// Responsibilities:
//  · Cache the shell so menu loads instantly on return visits (offline-friendly)
//  · Serve as PWA install target
//  · Handle web push notifications (order status, ready alerts, delivery arrivals)
//  · Click-through on push → opens tracker page

const CACHE = 'sdp-v2-shell-2026-04-21';
const SHELL = [
  './',
  './index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// ─── Fetch strategy ───
// · HTML / app shell: network-first, fall back to cache (so new deploys go live fast)
// · Fonts + static: cache-first
// · Supabase / Stripe: always network (never cache user data)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === 'https://qllrjizfyuxotgnybrzt.supabase.co' || url.origin === 'https://api.stripe.com' || url.origin === 'https://js.stripe.com') {
    return; // passthrough
  }
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone));
        return res;
      }))
    );
  }
});

// ─── Push notifications ───
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Super Deal Pizza', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Super Deal Pizza';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'sdp-order',
    data: { url: data.url || '/', order_id: data.order_id },
    vibrate: [120, 60, 120],
    requireInteraction: data.requireInteraction || false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ─── Background sync (future: cart abandonment recovery) ───
self.addEventListener('sync', (event) => {
  if (event.tag === 'sdp-cart-recover') {
    event.waitUntil(Promise.resolve()); // hook for later
  }
});
