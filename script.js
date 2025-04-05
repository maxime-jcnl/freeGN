// Initialiser la carte
var map = L.map("map").setView([45.5, 6.0], 12);


function startLocationTracking() {
  if (!navigator.geolocation) {
    console.warn("Géolocalisation non supportée.");
    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      const latlng = L.latLng(lat, lng);

      if (userLocationMarker) {
        userLocationMarker.setLatLng(latlng);
        userLocationCircle.setLatLng(latlng).setRadius(accuracy);
      } else {
        userLocationMarker = L.circleMarker(latlng, {
          radius: 6,
          color: '#136AEC',
          fillColor: '#2A93EE',
          fillOpacity: 1
        }).addTo(map);

        userLocationCircle = L.circle(latlng, {
          radius: accuracy,
          color: '#136AEC',
          fillColor: '#2A93EE',
          fillOpacity: 0.15
        }).addTo(map);

        map.setView(latlng, 15);
      }
    },
    (error) => {
      console.warn("Erreur de géolocalisation : " + error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    }
  );
}

// Lancer automatiquement la localisation dès le chargement
startLocationTracking();

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

  for (let z = 10; z <= 18; z++) {
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
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log("✅ Service Worker enregistré"))
    .catch(err => console.error("❌ Service Worker échec", err));
}

// Variable globale pour stocker temporairement les GPX importés pour la randonnée en cours
let currentHikeGPXs = [];

// Lors de l'import de GPX (ton écouteur sur fileInput)
document.getElementById('fileInput').addEventListener('change', function(event) {
  const files = event.target.files;
  
  // Réinitialiser la randonnée en cours
  currentHikeGPXs = [];
  document.getElementById('saveHike').style.display = 'none';
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const gpxData = e.target.result;
      // Stocker le contenu GPX dans le tableau
      currentHikeGPXs.push(gpxData);
      
      // Afficher la trace sur la carte
      const gpxLayer = new L.GPX(gpxData, {
        async: true,
        marker_options: {
          startIconUrl: null,
          endIconUrl: null,
          shadowUrl: null
        }
      }).on('loaded', function(e) {
        map.fitBounds(e.target.getBounds());
      });
      gpxLayer.addTo(map);
      
      // Dès qu'au moins un GPX est importé, afficher le bouton de sauvegarde
      document.getElementById('saveHike').style.display = 'block';
    };
    
    reader.readAsText(file);
  }
});

// Fonction pour charger les randonnées sauvegardées depuis localForage
async function loadSavedHikes() {
  let hikes = await localforage.getItem('savedHikes');
  return hikes || [];
}

// Fonction pour mettre à jour le menu des randonnées sauvegardées
async function updateSavedHikesUI() {
  const hikes = await loadSavedHikes();
  const listContainer = document.getElementById('savedHikesList');
  listContainer.innerHTML = '';
  
  hikes.forEach(hike => {
    const li = document.createElement('li');
    li.textContent = hike.name + ' (' + new Date(hike.date).toLocaleString() + ') ';
    
    // Bouton pour charger la randonnée sauvegardée
    const loadButton = document.createElement('button');
    loadButton.textContent = 'Charger';
    loadButton.addEventListener('click', () => {
      // Effacer éventuellement les couches GPX actuelles si besoin
      // Puis charger chacune des traces sauvegardées
      hike.gpxData.forEach(gpxStr => {
        const gpxLayer = new L.GPX(gpxStr, {
          async: true,
          marker_options: {
            startIconUrl: null,
            endIconUrl: null,
            shadowUrl: null
          }
        }).on('loaded', function(e) {
          map.fitBounds(e.target.getBounds());
        });
        gpxLayer.addTo(map);
      });
    });
    
    li.appendChild(loadButton);
    listContainer.appendChild(li);
  });
}

// Bouton pour sauvegarder la randonnée en cours
document.getElementById('saveHike').addEventListener('click', async () => {
  if (currentHikeGPXs.length === 0) {
    alert("Aucune trace GPX à sauvegarder !");
    return;
  }
  
  const name = prompt("Donne un nom à ta randonnée :");
  if (!name) return;
  
  // Créer l'objet randonnée
  const hike = {
    id: Date.now(), // identifiant unique basé sur le timestamp
    name: name,
    date: new Date().toISOString(),
    gpxData: currentHikeGPXs  // tableau contenant les données GPX
  };
  
  // Récupérer les randonnées existantes
  let hikes = await localforage.getItem('savedHikes');
  if (!hikes) hikes = [];
  hikes.push(hike);
  await localforage.setItem('savedHikes', hikes);
  
  alert("Randonnée sauvegardée !");
  updateSavedHikesUI();
  
  // On peut ensuite déclencher le téléchargement des tuiles pour cette zone
  // Par exemple, on peut calculer les bounds à partir d'une des traces et lancer cacheTile() pour chaque tuile.
});
  
// Au chargement de la page, mettre à jour l'interface avec les randonnées sauvegardées
updateSavedHikesUI();

let userLocationMarker = null;
let userLocationCircle = null;

// Fonction pour afficher la localisation
function locateUser() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée par votre navigateur.");
    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      const latlng = L.latLng(lat, lng);

      if (userLocationMarker) {
        userLocationMarker.setLatLng(latlng);
        userLocationCircle.setLatLng(latlng).setRadius(accuracy);
      } else {
        userLocationMarker = L.circleMarker(latlng, {
          radius: 6,
          color: '#136AEC',
          fillColor: '#2A93EE',
          fillOpacity: 1
        }).addTo(map);

        userLocationCircle = L.circle(latlng, {
          radius: accuracy,
          color: '#136AEC',
          fillColor: '#2A93EE',
          fillOpacity: 0.15
        }).addTo(map);

        // Centrer la carte sur la première position
        map.setView(latlng, 15);
      }
    },
    (error) => {
      alert("Erreur de géolocalisation : " + error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    }
  );
}

// Associer au bouton
document.getElementById('locateMe').addEventListener('click', locateUser);

// Déclenchement de l'import des GPX via le bouton de l'en-tête
document.getElementById("importGPX").addEventListener("click", function() {
  document.getElementById("fileInput").click();
});

// Toggle de la sidebar des randonnées sauvegardées
document.getElementById("toggleSavedHikes").addEventListener("click", function() {
  document.getElementById("savedHikesSidebar").classList.toggle("active");
});
