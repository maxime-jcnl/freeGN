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
  const url = new URL(event.request.url);

  // Intercepter uniquement les requêtes de tuiles WMS IGN
  if (url.searchParams.get("REQUEST") === "GetMap") {
    event.respondWith(
      caches.open('carte-ign-cache-v1').then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // ✅ Ajouter un header personnalisé pour indiquer que ça vient du cache
          const newHeaders = new Headers(cachedResponse.headers);
          newHeaders.set("X-Tile-Source", "offline");

          const modifiedResponse = new Response(await cachedResponse.blob(), {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: newHeaders
          });

          return modifiedResponse;
        } else {
          return fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }
      })
    );
    return;
  }

  // Autres ressources : stratégie cache-first
  event.respondWith(
    caches.match(event.request).then(resp => {
      return resp || fetch(event.request);
    })
  );
});
