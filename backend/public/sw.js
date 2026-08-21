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

const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = self.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
};

const repairPushSubscription = async () => {
  const keyResponse = await fetch('/api/push/public-key?ts=' + Date.now(), {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!keyResponse.ok) {
    return;
  }

  const keyData = await keyResponse.json();

  if (!keyData.enabled || !keyData.publicKey) {
    return;
  }

  const subscription = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
  });

  await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subscription: subscription.toJSON()
    })
  });
};

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

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(repairPushSubscription());
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {
      title: 'SMS Sync',
      body: event.data ? event.data.text() : ''
    };
  }

  const title = payload.title || 'SMS Sync';
  const url = payload.url || '/?refresh=1';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'Open SMS Sync to view the latest messages.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
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
