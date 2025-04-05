// Initialiser la carte
var map = L.map("map").setView([45.5, 6.0], 12);

document.getElementById("clearCache").addEventListener("click", async () => {
  if (confirm("Voulez-vous vraiment vider le cache des tuiles ?")) {
    await localforage.clear();
    alert("Cache vidé !");
  }
});

// Ajouter la couche WMS IGN
var ignLayer = L.tileLayer.wms("https://data.geopf.fr/private/wms-r?", {
  layers: "SCAN25TOUR_PYR-JPEG_WLD_WM",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "IGN Scan 25",
  apikey: "ign_scan_ws",
});
ignLayer.addTo(map);



// Import de fichiers GPX
document
  .getElementById("fileInput")
  .addEventListener("change", function (event) {
    const files = event.target.files;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();

      reader.onload = function (e) {
        const gpxData = e.target.result;

        const gpxLayer = new L.GPX(gpxData, {
          async: true,
          marker_options: {
            startIconUrl: null,
            endIconUrl: null,
            shadowUrl: null,
          },
        }).on("loaded", function (e) {
          map.fitBounds(e.target.getBounds());
        });

        gpxLayer.addTo(map);
      };

      reader.readAsText(file);
    }
  });

// Calculer la liste des tuiles à télécharger pour un tracé GPX
function getTilesFromBounds(bounds, zoom) {
  const tiles = [];
  const tileSize = 256;

  function latLngToTile(lat, lng, zoom) {
    const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
    const y = Math.floor(
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
        ) /
          Math.PI) /
        2) *
        Math.pow(2, zoom)
    );
    return { x, y };
  }

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const t1 = latLngToTile(sw.lat, sw.lng, zoom);
  const t2 = latLngToTile(ne.lat, ne.lng, zoom);

  for (let x = t1.x; x <= t2.x; x++) {
    for (let y = t2.y; y <= t1.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

// Télécharger une tuile et la stocker dans localforage
async function cacheTile(x, y, z) {
  const url = `https://data.geopf.fr/private/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=SCAN25TOUR_PYR-JPEG_WLD_WM&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX=${tile2bbox(
    x,
    y,
    z
  )}&apikey=ign_scan_ws`;

  const key = `${z}/${x}/${y}`;

  try {
    const response = await fetch(url, { mode: "cors" });
    const blob = await response.blob();
    await localforage.setItem(key, blob);
    console.log(`✔ Tuile ${key} enregistrée`);
  } catch (err) {
    console.warn(`⚠ Tuile ${key} non chargée`, err);
  }
}

// Convertir une tuile en BBOX pour WMS
function tile2bbox(x, y, z) {
    const tileSize = 256;
    const initialResolution = 2 * Math.PI * 6378137 / tileSize;
    const originShift = 2 * Math.PI * 6378137 / 2.0;
  
    const resolution = initialResolution / Math.pow(2, z);
  
    const minx = x * tileSize * resolution - originShift;
    const maxx = (x + 1) * tileSize * resolution - originShift;
    const miny = originShift - (y + 1) * tileSize * resolution;
    const maxy = originShift - y * tileSize * resolution;
  
    return `${minx},${miny},${maxx},${maxy}`;
  }
  

function tile2lat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Quand on clique sur "Télécharger"
document.getElementById("downloadTiles").addEventListener("click", async () => {
  const layers = map._layers;
  const gpxBounds = [];

  for (let id in layers) {
    if (layers[id] instanceof L.GPX) {
      const bounds = layers[id].getBounds();
      gpxBounds.push(bounds);
    }
  }

  if (gpxBounds.length === 0) {
    alert("Aucune trace GPX chargée !");
    return;
  }

  const allTiles = [];

  for (let z = 12; z <= 16; z++) {
    for (let bounds of gpxBounds) {
      const tiles = getTilesFromBounds(bounds, z);
      allTiles.push(...tiles);
    }
  }

  const total = allTiles.length;
  let completed = 0;

  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  progressContainer.style.display = "block";
  progressBar.max = total;
  progressBar.value = 0;
  progressText.textContent = `0 / ${total}`;

  for (let tile of allTiles) {
    await cacheTile(tile.x, tile.y, tile.z);
    completed++;
    progressBar.value = completed;
    progressText.textContent = `${completed} / ${total}`;
  }

  progressContainer.style.display = "none";
  alert("Téléchargement des tuiles terminé !");
});

L.TileLayer.LocalCached = L.TileLayer.extend({
  createTile: function (coords, done) {
    const tile = document.createElement("img");

    const key = `${coords.z}/${coords.x}/${coords.y}`;
    const self = this;

    tile.setAttribute("role", "presentation");
    tile.alt = "";

    localforage.getItem(key).then((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        tile.src = url;
        tile.onload = () => {
          URL.revokeObjectURL(url);
          done(null, tile);
        };
        tile.onerror = () => done(new Error("Erreur chargement cache"), tile);
      } else {
        const url = self.getTileUrl(coords);
        fetch(url, { mode: "cors" })
          .then((res) => res.blob())
          .then((blob) => {
            localforage.setItem(key, blob);
            const blobUrl = URL.createObjectURL(blob);
            tile.src = blobUrl;
            tile.onload = () => {
              URL.revokeObjectURL(blobUrl);
              done(null, tile);
            };
          })
          .catch((err) => {
            console.warn(`Tuile manquante : ${key}`, err);
            tile.src = ""; // tu peux afficher une image "no tile" si tu veux
            done(err, tile);
          });
      }
    });

    return tile;
  },
});

var offlineLayer = new L.TileLayer.LocalCached("", {
  minZoom: 12,
  maxZoom: 16,
  tileSize: 256,
  attribution: "IGN Scan 25",
  getTileUrl: function (coords) {
    const bbox = tile2bbox(coords.x, coords.y, coords.z);
    return `https://data.geopf.fr/private/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=SCAN25TOUR_PYR-JPEG_WLD_WM&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX=${bbox}&apikey=ign_scan_ws`;
  },
});

offlineLayer.addTo(map);


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log("✅ Service Worker enregistré"))
    .catch(err => console.error("❌ Service Worker échec", err));
}
