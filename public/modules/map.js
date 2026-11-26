import { escapeHtml, formatSentiment, formatStatus } from './format.js';

let mapInstance = null;
let tileLayer = null;
let markerLayer = null;
let heatLayer = null;
let resizeObserver = null;
let currentContainerId = null;
let currentMode = 'both';
let currentTheme = 'light';
let latestBounds = [];

// Mapas base reales de Esri: no requieren llave de acceso.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

export const BASEMAP_THEMES = {
  light: {
    label: 'Claro',
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors',
    maxZoom: 18,
    maxNativeZoom: 16,
  },
  streets: {
    label: 'Calles',
    url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors',
    maxZoom: 18,
    maxNativeZoom: 18,
  },
  satellite: {
    label: 'Satélite',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
    maxNativeZoom: 18,
  },
  topo: {
    label: 'Relieve',
    url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, OpenStreetMap contributors',
    maxZoom: 18,
    maxNativeZoom: 18,
  },
};

const MARKER_STYLES = {
  activo: { fillColor: '#16a37a' },
  en_riesgo: { fillColor: '#f2a900' },
  inactivo: { fillColor: '#e5566d' },
};

export function destroyMap() {
  if (resizeObserver) {
    try {
      resizeObserver.disconnect();
    } catch {}
    resizeObserver = null;
  }
  if (mapInstance) {
    try {
      mapInstance.remove();
    } catch {}
    mapInstance = null;
    tileLayer = null;
    markerLayer = null;
    heatLayer = null;
    currentContainerId = null;
    latestBounds = [];
  }
}

export function setMapBasemap(themeKey) {
  currentTheme = BASEMAP_THEMES[themeKey] ? themeKey : 'light';
  if (!mapInstance || typeof window.L === 'undefined') return;
  const spec = BASEMAP_THEMES[currentTheme];

  if (tileLayer && mapInstance.hasLayer(tileLayer)) {
    mapInstance.removeLayer(tileLayer);
  }
  tileLayer = window.L.tileLayer(spec.url, {
    maxZoom: spec.maxZoom,
    maxNativeZoom: spec.maxNativeZoom,
    attribution: spec.attribution,
  }).addTo(mapInstance);
  tileLayer.bringToBack();
}

function applyLayerVisibility(mode) {
  currentMode = mode;
  if (!mapInstance) return;

  const showHeat = mode === 'heat' || mode === 'both';
  const showMarkers = mode === 'markers' || mode === 'both';

  if (heatLayer) {
    if (showHeat && !mapInstance.hasLayer(heatLayer)) heatLayer.addTo(mapInstance);
    if (!showHeat && mapInstance.hasLayer(heatLayer)) mapInstance.removeLayer(heatLayer);
  }

  if (markerLayer) {
    if (showMarkers && !mapInstance.hasLayer(markerLayer)) markerLayer.addTo(mapInstance);
    if (!showMarkers && mapInstance.hasLayer(markerLayer)) mapInstance.removeLayer(markerLayer);
  }
}

export function setMapLayerMode(mode) {
  applyLayerVisibility(mode);
}

export function flyToLocation(lat, lng, zoom = 8) {
  if (!mapInstance) return;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (Number.isNaN(nLat) || Number.isNaN(nLng)) return;
  mapInstance.flyTo([nLat, nLng], zoom, { duration: 1.35, easeLinearity: 0.25 });
}

export function resetMapBounds() {
  if (!mapInstance) return;
  if (latestBounds.length > 0) {
    mapInstance.flyToBounds(latestBounds, { padding: [42, 42], maxZoom: 5, duration: 1.1 });
  } else {
    mapInstance.flyTo([20, -45], 2.5, { duration: 1.1 });
  }
}

export function renderCommunityMap(containerId, points, { theme = 'light', mode = currentMode || 'both' } = {}) {
  const container = document.getElementById(containerId);
  if (!container || typeof window.L === 'undefined') return;

  if (mapInstance && currentContainerId !== containerId) {
    destroyMap();
  }

  const validPoints = Array.isArray(points) ? points : [];

  if (!mapInstance) {
    mapInstance = window.L.map(containerId, {
      zoomControl: true,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
      inertia: true,
      inertiaDeceleration: 2400,
      worldCopyJump: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      minZoom: 2,
      maxZoom: 18,
    }).setView([20, -45], 2.5);

    window.L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapInstance);
    setMapBasemap(theme);
    markerLayer = window.L.layerGroup();
    currentContainerId = containerId;

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstance) mapInstance.invalidateSize(false);
      });
      resizeObserver.observe(container);
    }
  } else if (theme && theme !== currentTheme) {
    setMapBasemap(theme);
  }

  markerLayer.clearLayers();
  if (heatLayer && mapInstance.hasLayer(heatLayer)) {
    mapInstance.removeLayer(heatLayer);
  }
  heatLayer = null;

  const bounds = [];
  const heatCoords = [];

  for (const point of validPoints) {
    if (point.latitud == null || point.longitud == null) continue;
    const lat = Number(point.latitud);
    const lng = Number(point.longitud);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    bounds.push([lat, lng]);
    const sentNorm = Math.max(0.28, Math.min(1, (Number(point.sentimiento_promedio ?? 0) + 1) / 2));
    heatCoords.push([lat, lng, sentNorm]);

    const style = MARKER_STYLES[point.estatus] || { fillColor: '#0f5e6b' };
    const status = formatStatus(point.estatus);
    const sentiment = formatSentiment(point.sentimiento_promedio);

    const popupHtml = `
      <div class="map-popup">
        <div class="map-popup-head">
          <strong>${escapeHtml(point.ciudad)}</strong>
          <span>${escapeHtml(point.pais)}</span>
        </div>
        <div class="map-popup-meta">
          <span class="pill pill-${status.tone}">${escapeHtml(status.label)}</span>
          <span class="map-popup-sent">Ánimo: <b>${escapeHtml(sentiment.score)}</b> (${escapeHtml(sentiment.label)})</span>
        </div>
      </div>
    `;

    window.L.circleMarker([lat, lng], {
      radius: 6.5,
      weight: 2,
      color: '#ffffff',
      fillColor: style.fillColor,
      fillOpacity: 0.95,
    })
      .bindPopup(popupHtml, { maxWidth: 260, className: 'c360-popup' })
      .addTo(markerLayer);
  }

  latestBounds = bounds;

  if (typeof window.L.heatLayer === 'function' && heatCoords.length > 0) {
    heatLayer = window.L.heatLayer(heatCoords, {
      radius: 28,
      blur: 22,
      maxZoom: 11,
      minOpacity: 0.45,
      gradient: {
        0.2: '#38bdf8',
        0.45: '#34d399',
        0.72: '#f2a900',
        1.0: '#e5484d',
      },
    });
  }

  applyLayerVisibility(mode);

  setTimeout(() => {
    if (!mapInstance) return;
    mapInstance.invalidateSize(true);
    if (bounds.length > 0) {
      mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
    }
  }, 120);
}
