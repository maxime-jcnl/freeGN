const CACHE_NAME = 'carte-ign-cache-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './creer.html',
  './carte.html',
  './style.css',
  './script.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
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
          console.warn(`Échec du cache pour : ${asset}`, err);
        }
      }
    })()
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Si c'est une requête de tuiles WMS (vérifie que REQUEST=GetMap est présent)
  if (requestUrl.searchParams.get("REQUEST") === "GetMap") {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          return (
            response ||
            fetch(event.request).then(networkResponse => {
              // Mettre en cache la réponse pour les futures requêtes
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            })
          );
        });
      })
    );
    return;
  }

  // Pour les autres requêtes, utiliser la stratégie standard
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    }).catch(() => {
      return new Response('', { status: 404 });
    })
  );
});
