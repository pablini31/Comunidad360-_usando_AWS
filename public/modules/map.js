import { escapeHtml, formatSentiment, formatStatus } from './format.js';

let mapInstance = null;
let markerLayer = null;
let heatLayer = null;
let currentContainerId = null;
let currentMode = 'both';
let latestPoints = [];

const TILE_THEMES = {
  positron: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
};

const MARKER_STYLES = {
  activo: { color: '#047857', fillColor: '#10b981' },
  en_riesgo: { color: '#b45309', fillColor: '#f59e0b' },
  inactivo: { color: '#be123c', fillColor: '#f43f5e' },
};

export function destroyMap() {
  if (mapInstance) {
    try {
      mapInstance.remove();
    } catch {}
    mapInstance = null;
    markerLayer = null;
    heatLayer = null;
    currentContainerId = null;
    latestPoints = [];
  }
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

export function renderCommunityMap(containerId, points, { theme = 'voyager', mode = currentMode || 'both' } = {}) {
  const container = document.getElementById(containerId);
  if (!container || typeof window.L === 'undefined') return;

  if (mapInstance && currentContainerId !== containerId) {
    destroyMap();
  }

  latestPoints = Array.isArray(points) ? points : [];

  if (!mapInstance) {
    mapInstance = window.L.map(containerId, {
      zoomControl: true,
      scrollWheelZoom: true,
      minZoom: 2,
      maxZoom: 18,
    }).setView([20, -40], 2);

    const tile = TILE_THEMES[theme] || TILE_THEMES.voyager;
    window.L.tileLayer(tile.url, {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: tile.attribution,
    }).addTo(mapInstance);

    markerLayer = window.L.layerGroup();
    currentContainerId = containerId;
  }

  markerLayer.clearLayers();
  if (heatLayer && mapInstance.hasLayer(heatLayer)) {
    mapInstance.removeLayer(heatLayer);
  }
  heatLayer = null;

  const bounds = [];
  const heatCoords = [];

  for (const point of latestPoints) {
    if (point.latitud == null || point.longitud == null) continue;
    const lat = Number(point.latitud);
    const lng = Number(point.longitud);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    bounds.push([lat, lng]);
    const sentNorm = Math.max(0.28, Math.min(1, (Number(point.sentimiento_promedio ?? 0) + 1) / 2));
    heatCoords.push([lat, lng, sentNorm]);

    const style = MARKER_STYLES[point.estatus] || { color: '#4338ca', fillColor: '#6366f1' };
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
      fillOpacity: 0.9,
    })
      .bindPopup(popupHtml, { maxWidth: 260, className: 'c360-popup' })
      .addTo(markerLayer);
  }

  if (typeof window.L.heatLayer === 'function' && heatCoords.length > 0) {
    heatLayer = window.L.heatLayer(heatCoords, {
      radius: 26,
      blur: 20,
      maxZoom: 11,
      minOpacity: 0.38,
      gradient: {
        0.2: '#38bdf8',
        0.45: '#34d399',
        0.7: '#f59e0b',
        1.0: '#ef4444',
      },
    });
  }

  applyLayerVisibility(mode);

  setTimeout(() => {
    if (!mapInstance) return;
    mapInstance.invalidateSize();
    if (bounds.length > 0) {
      mapInstance.fitBounds(bounds, { padding: [36, 36], maxZoom: 6 });
    }
  }, 100);
}
