// script.js

// Variables globales
var map;
var userLocationMarker = null;
var userLocationCircle = null;
var currentHikeGPXs = [];

/* ---------------------------
   Fonctions de gestion des tuiles
------------------------------*/
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

// Calculer la liste des tuiles à télécharger pour un tracé GPX
function getTilesFromBounds(bounds, zoom) {
  const tiles = [];
  function latLngToTile(lat, lng, zoom) {
    const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
    const y = Math.floor(
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
        ) / Math.PI) /
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
  const url = `https://data.geopf.fr/private/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=SCAN25TOUR_PYR-JPEG_WLD_WM&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX=${tile2bbox(x,y,z)}&apikey=ign_scan_ws`;
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

/* ---------------------------
   Initialisation de la carte
------------------------------*/
function initMap() {
  map = L.map("map").setView([45.5, 6.0], 12);
  // Ajouter la couche WMS IGN
  var ignLayer = L.tileLayer.wms("https://data.geopf.fr/private/wms-r?", {
    layers: "SCAN25TOUR_PYR-JPEG_WLD_WM",
    format: "image/png",
    transparent: true,
    version: "1.3.0",
    attribution: "IGN Scan 25",
    apikey: "ign_scan_ws"
  });
  ignLayer.addTo(map);
  startLocationTracking();
}

/* ---------------------------
   Géolocalisation
------------------------------*/
function startLocationTracking() {
  if (!navigator.geolocation) {
    console.warn("Géolocalisation non supportée.");
    return;
  }
  navigator.geolocation.watchPosition(
    function (position) {
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
          color: "#136AEC",
          fillColor: "#2A93EE",
          fillOpacity: 1
        }).addTo(map);
        userLocationCircle = L.circle(latlng, {
          radius: accuracy,
          color: "#136AEC",
          fillColor: "#2A93EE",
          fillOpacity: 0.15
        }).addTo(map);
        map.setView(latlng, 15);
      }
    },
    function (error) {
      console.warn("Erreur de géolocalisation : " + error.message);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );
}

/* ---------------------------
   Fonctionnalité de téléchargement des tuiles
------------------------------*/
if (document.getElementById("downloadTiles")) {
  document.getElementById("downloadTiles").addEventListener("click", async () => {
    // Récupérer les bounds de toutes les traces GPX sur la carte
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
    for (let z = 12; z <= 17; z++) {
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
    if (progressContainer && progressBar && progressText) {
      progressContainer.style.display = "block";
      progressBar.max = total;
      progressBar.value = 0;
      progressText.textContent = `0 / ${total}`;
    }
    for (let tile of allTiles) {
      await cacheTile(tile.x, tile.y, tile.z);
      completed++;
      if (progressBar) progressBar.value = completed;
      if (progressText) progressText.textContent = `${completed} / ${total}`;
    }
    if (progressContainer) progressContainer.style.display = "none";
    alert("Téléchargement des tuiles terminé !");
  });
}

/* ---------------------------
   Fonctionnalité d'import et de sauvegarde GPX (pour creer.html)
------------------------------*/
function initGPXImport() {
  const fileInput = document.getElementById("fileInput");
  const importBtn = document.getElementById("importGPX");
  const saveHikeBtn = document.getElementById("saveHike");
  if (!fileInput || !importBtn || !saveHikeBtn) return;
  importBtn.addEventListener("click", () => {
    fileInput.click();
  });
  fileInput.addEventListener("change", function(event) {
    const files = event.target.files;
    currentHikeGPXs = [];
    saveHikeBtn.style.display = 'none';
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = function(e) {
        const gpxData = e.target.result;
        currentHikeGPXs.push(gpxData);
        const gpxLayer = new L.GPX(gpxData, {
          async: true,
          marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null }
        }).on("loaded", function(e) {
          map.fitBounds(e.target.getBounds());
        });
        gpxLayer.addTo(map);
        saveHikeBtn.style.display = 'block';
      };
      reader.readAsText(file);
    }
  });
  saveHikeBtn.addEventListener("click", async () => {
    if (currentHikeGPXs.length === 0) {
      alert("Aucune trace GPX à sauvegarder !");
      return;
    }
    const name = prompt("Donne un nom à ta randonnée :");
    if (!name) return;
    const hike = {
      id: Date.now(),
      name: name,
      date: new Date().toISOString(),
      gpxData: currentHikeGPXs
    };
    let hikes = await localforage.getItem('savedHikes');
    if (!hikes) hikes = [];
    hikes.push(hike);
    await localforage.setItem('savedHikes', hikes);
    alert("Randonnée sauvegardée !");
    updateSavedHikesUI();
  });
}

/* ---------------------------
   Affichage des randonnées sauvegardées (pour index.html)
------------------------------*/
async function updateSavedHikesUI() {
  const listContainer = document.getElementById("savedHikesList");
  if (!listContainer) return;
  let hikes = await localforage.getItem('savedHikes');
  if (!hikes) hikes = [];
  listContainer.innerHTML = "";
  hikes.forEach(hike => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${hike.name} (${new Date(hike.date).toLocaleString()})</span>`;
    const loadBtn = document.createElement("button");
    loadBtn.className = "btn";
    loadBtn.textContent = "Charger";
    loadBtn.addEventListener("click", () => {
      window.location.href = `creer.html?hike=${hike.id}`;
    });
    li.appendChild(loadBtn);
    listContainer.appendChild(li);
  });
}

/* ---------------------------
   Affichage des métriques lors du chargement d'une trace enregistrée
------------------------------*/
function displayHikeMetrics(totalDistance, totalElevationGain) {
  // Conversion en km (distance) et arrondi (dénivelé)
  const km = (totalDistance / 1000).toFixed(2);
  const elev = Math.round(totalElevationGain);
  const detailsDiv = document.getElementById("hikeDetails");
  if (detailsDiv) {
    detailsDiv.innerHTML = `<p>Distance totale : ${km} km</p>
                            <p>Dénivelé positif : ${elev} m</p>`;
  }
}

// Charger une randonnée sauvegardée (pour creer.html)
async function loadSavedHike(hikeId) {
  let hikes = await localforage.getItem('savedHikes');
  if (!hikes) return;
  const hike = hikes.find(h => h.id == hikeId);
  if (!hike) return;
  
  let totalDistance = 0;
  let totalElevationGain = 0;
  
  hike.gpxData.forEach(gpxStr => {
    const gpxLayer = new L.GPX(gpxStr, {
      async: true,
      marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null }
    }).on("loaded", function(e) {
      map.fitBounds(e.target.getBounds());
      // Si la méthode existe, récupérer la distance (en mètres)
      if (typeof e.target.get_distance === "function") {
        totalDistance += e.target.get_distance();
      }
      // Si la méthode existe, récupérer le dénivelé positif (en mètres)
      if (typeof e.target.get_elevation_gain === "function") {
        totalElevationGain += e.target.get_elevation_gain();
      }
      displayHikeMetrics(totalDistance, totalElevationGain);
    });
    gpxLayer.addTo(map);
  });
}

/* ---------------------------
   Localiser l'utilisateur (pour carte.html)
------------------------------*/
function locateUser() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée par votre navigateur.");
    return;
  }
  navigator.geolocation.watchPosition(
    function(position) {
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
          color: "#136AEC",
          fillColor: "#2A93EE",
          fillOpacity: 1
        }).addTo(map);
        userLocationCircle = L.circle(latlng, {
          radius: accuracy,
          color: "#136AEC",
          fillColor: "#2A93EE",
          fillOpacity: 0.15
        }).addTo(map);
        map.setView(latlng, 15);
      }
    },
    function(error) {
      alert("Erreur de géolocalisation : " + error.message);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );
}

/* ---------------------------
   Initialisation selon la page
------------------------------*/
document.addEventListener("DOMContentLoaded", function() {
  // Bouton clearCache (si présent)
  const clearCacheBtn = document.getElementById("clearCache");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", async function() {
      if (confirm("Voulez-vous vraiment vider le cache des tuiles ?")) {
        await localforage.clear();
        alert("Cache vidé !");
      }
    });
  }
  
  // Mise à jour des randonnées sauvegardées (sur index.html)
  if (document.getElementById("savedHikesList")) {
    updateSavedHikesUI();
  }
  
  // Initialiser la carte si l'élément "map" existe
  if (document.getElementById("map")) {
    initMap();
    // Pour creer.html : initialiser l'import GPX et charger une trace sauvegardée si demandée
    if (document.getElementById("fileInput")) {
      initGPXImport();
      const params = new URLSearchParams(window.location.search);
      const hikeId = params.get("hike");
      if (hikeId) {
        loadSavedHike(hikeId);
      }
    }
    // Pour carte.html : attacher le bouton de géolocalisation
    if (document.getElementById("locateMe")) {
      document.getElementById("locateMe").addEventListener("click", locateUser);
    }
  }
});

// Enregistrement du Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .then(() => console.log("Service Worker enregistré"))
    .catch(err => console.error("Erreur d'enregistrement du Service Worker", err));
};
