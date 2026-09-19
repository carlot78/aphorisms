// Service worker: makes the app shell work offline and receives Web Push.
// Quote data lives in localStorage, so only the static files need caching.
// Wikiquote API calls are never cached here.

const VERSION = 'aphorisms-v5';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'src/sources.js', 'src/wikiquote.js', 'src/translate.js', 'src/flags.js', 'src/push.js', 'src/push-config.js', 'manifest.webmanifest', 'icon.svg'];
const PUSH_CACHE = 'aph-push'; // survives VERSION bumps: holds the last pushed quote
const PUSH_LATEST = 'push/latest';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== PUSH_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  // Stale-while-revalidate for everything same-origin (shell + data snapshots).
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ---------- Web Push ----------

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Aphorisms', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Thought for today';
  const body = payload.translation ? `${payload.body}\n\n${payload.translation}` : payload.body || '';
  event.waitUntil(
    Promise.all([
      // Remember it so the app can show this exact quote when opened.
      payload.quote
        ? caches.open(PUSH_CACHE).then((c) => c.put(PUSH_LATEST, new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })))
        : Promise.resolve(),
      self.registration.showNotification(title, {
        body,
        icon: 'icon.svg',
        badge: 'icon.svg',
        tag: 'daily-thought', // a new day's push replaces yesterday's
        renotify: true,
        data: { url: payload.url || './', date: payload.date || '' },
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (open) return open.focus().then((w) => w.navigate?.(target) || w);
      return self.clients.openWindow(target);
    })
  );
});

// If the push service rotates the subscription, the app will notice the
// change on next open and ask the user to copy the new config.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    caches.open(PUSH_CACHE).then((c) => c.put('push/subscription-changed', new Response(String(Date.now()))))
  );
});
