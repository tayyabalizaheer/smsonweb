const APP_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const ASSET_VERSION = encodeURIComponent(APP_VERSION);
const CACHE_NAME = `sms-sync-${APP_VERSION}`;
const STATIC_ASSETS = [
  '/offline.html',
  `/css/styles.css?v=${ASSET_VERSION}`,
  `/js/app.js?v=${ASSET_VERSION}`,
  `/js/pair.js?v=${ASSET_VERSION}`,
  `/manifest.webmanifest?v=${ASSET_VERSION}`,
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => {
          return caches.match('/').then((cached) => {
            return cached || caches.match('/offline.html');
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {
      title: 'New SMS message',
      body: event.data ? event.data.text() : ''
    };
  }

  const title = payload.title || 'New SMS message';
  const url = payload.url || '/?refresh=1';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'Open SMS Sync to view the latest messages.',
      icon: '/icons/icon-192.png',
      badge: '/icons/maskable-512.png',
      tag: payload.tag || 'sms-sync-message',
      renotify: true,
      data: {
        url
      }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/?refresh=1';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.navigate(targetUrl).then((focusedClient) => {
            const targetClient = focusedClient || client;

            targetClient.postMessage({
              type: 'SMS_SYNC_REFRESH',
              url: targetUrl
            });

            return targetClient.focus();
          });
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
