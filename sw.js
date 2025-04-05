const CACHE_NAME = 'carte-ign-cache-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet/dist/leaflet.css',
  'https://unpkg.com/leaflet/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.4.0/gpx.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        for (const asset of STATIC_ASSETS) {
          try {
            await cache.add(asset);
          } catch (err) {
            console.warn(`⚠️ Échec cache pour : ${asset}`, err);
          }
        }
      })()
    );
  });
  

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Si c'est une requête de navigation (index.html), retourne toujours l'app shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(response => {
        return response || fetch('./index.html');
      })
    );
    return;
  }

  // Sinon, essaie de retourner depuis le cache
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    }).catch(() => {
      // En dernier recours : rien
      return new Response('', { status: 404 });
    })
  );
});
