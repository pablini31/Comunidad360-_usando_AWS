import { escapeHtml, formatNumber, formatSentiment } from './format.js';

let mapInstance = null;
let tileLayer = null;
let markerLayer = null;
let heatLayer = null;
let resizeObserver = null;
let currentContainerId = null;
let currentMode = 'both';
let currentTheme = 'light';
let latestBounds = [];
let latestCities = [];
let currentOnSelectCity = null;

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
    latestCities = [];
    currentOnSelectCity = null;
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

  if (heatLayer) {
    if (showHeat && !mapInstance.hasLayer(heatLayer)) heatLayer.addTo(mapInstance);
    if (!showHeat && mapInstance.hasLayer(heatLayer)) mapInstance.removeLayer(heatLayer);
  }

  // Always keep markerLayer mounted so clicking hotspots works even in 'heat' mode;
  // in 'heat' mode we make the circle markers subtle translucent interactive targets.
  if (markerLayer) {
    if (!mapInstance.hasLayer(markerLayer)) markerLayer.addTo(mapInstance);
    markerLayer.eachLayer((layer) => {
      if (typeof layer.setStyle === 'function') {
        if (mode === 'heat') {
          layer.setStyle({ fillOpacity: 0.18, opacity: 0.35, weight: 1.5 });
        } else {
          layer.setStyle({ fillOpacity: 0.9, opacity: 1, weight: 2.5 });
        }
      }
    });
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
  mapInstance.flyTo([nLat, nLng], zoom, { duration: 1.25, easeLinearity: 0.25 });

  // Also trigger selection for the matching city if found
  const match = findNearestCity(nLat, nLng, 1.5);
  if (match && currentOnSelectCity) {
    currentOnSelectCity(match);
  }
}

export function resetMapBounds() {
  if (!mapInstance) return;
  mapInstance.closePopup();
  if (latestBounds.length > 0) {
    mapInstance.flyToBounds(latestBounds, { padding: [42, 42], maxZoom: 5, duration: 1.1 });
  } else {
    mapInstance.flyTo([20, -45], 2.5, { duration: 1.1 });
  }
}

function findNearestCity(lat, lng, maxDeg = 4.0) {
  let best = null;
  let bestDist = Infinity;
  for (const city of latestCities) {
    const dLat = city.lat - lat;
    const dLng = city.lng - lng;
    const dist = Math.hypot(dLat, dLng);
    if (dist < bestDist && dist <= maxDeg) {
      bestDist = dist;
      best = city;
    }
  }
  return best;
}

export function aggregateCitiesFromPoints(points, cityActivity = []) {
  const cityActLookup = new Map();
  if (Array.isArray(cityActivity)) {
    for (const row of cityActivity) {
      if (row?.ciudad) {
        cityActLookup.set(`${row.pais}|${row.ciudad}`, Number(row.interacciones || 0));
        cityActLookup.set(row.ciudad, Number(row.interacciones || 0));
      }
    }
  }

  const groups = new Map();
  for (const p of Array.isArray(points) ? points : []) {
    if (p.latitud == null || p.longitud == null) continue;
    const lat = Number(p.latitud);
    const lng = Number(p.longitud);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    const key = `${p.ciudad}|${p.pais}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ciudad: p.ciudad || 'Ciudad',
        pais: p.pais || 'País',
        latSum: 0,
        lngSum: 0,
        usuarios: 0,
        activos: 0,
        en_riesgo: 0,
        inactivos: 0,
        sentSum: 0,
        interacciones: cityActLookup.get(`${p.pais}|${p.ciudad}`) ?? cityActLookup.get(p.ciudad) ?? 0,
      });
    }
    const g = groups.get(key);
    g.latSum += lat;
    g.lngSum += lng;
    g.usuarios += 1;
    if (p.estatus === 'activo') g.activos += 1;
    else if (p.estatus === 'en_riesgo') g.en_riesgo += 1;
    else g.inactivos += 1;
    g.sentSum += Number(p.sentimiento_promedio || 0);
  }

  return [...groups.values()]
    .map((g) => ({
      ciudad: g.ciudad,
      pais: g.pais,
      lat: g.latSum / g.usuarios,
      lng: g.lngSum / g.usuarios,
      usuarios: g.usuarios,
      activos: g.activos,
      en_riesgo: g.en_riesgo,
      inactivos: g.inactivos,
      sentimiento: g.usuarios ? g.sentSum / g.usuarios : 0,
      interacciones: g.interacciones,
    }))
    .sort((a, b) => b.usuarios - a.usuarios);
}

function buildCityPopupHtml(city) {
  const sent = formatSentiment(city.sentimiento);
  const actPct = city.usuarios ? Math.round((city.activos / city.usuarios) * 100) : 0;
  return `
    <div class="map-popup">
      <div class="map-popup-head">
        <strong>${escapeHtml(city.ciudad)}</strong>
        <span>${escapeHtml(city.pais)} · ${formatNumber(city.usuarios)} miembros</span>
      </div>
      <div class="map-popup-stats">
        <div><span>Activos</span><b>${formatNumber(city.activos)} (${actPct}%)</b></div>
        <div><span>En riesgo</span><b>${formatNumber(city.en_riesgo)}</b></div>
        <div><span>Inactivos</span><b>${formatNumber(city.inactivos)}</b></div>
        <div><span>Ánimo local</span><b class="pill pill-${sent.tone}">${escapeHtml(sent.score)}</b></div>
      </div>
      <button type="button" class="btn btn-gold btn-xs map-popup-action" data-popup-city="${escapeHtml(city.ciudad)}" data-popup-country="${escapeHtml(city.pais)}">
        Ver miembros de ${escapeHtml(city.ciudad)} →
      </button>
    </div>
  `;
}

export function renderCommunityMap(
  containerId,
  points,
  { theme = 'light', mode = currentMode || 'both', cityActivity = [], preserveView = false, onSelectCity = null, onExploreCityMembers = null } = {}
) {
  const container = document.getElementById(containerId);
  if (!container || typeof window.L === 'undefined') return;

  if (mapInstance && currentContainerId !== containerId) {
    destroyMap();
  }

  currentOnSelectCity = onSelectCity;
  const validPoints = Array.isArray(points) ? points : [];
  latestCities = aggregateCitiesFromPoints(validPoints, cityActivity);

  const isFirstRender = !mapInstance;
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

    // Clicking anywhere on the map finds the nearest city hotspot if the user clicked near a heat zone
    mapInstance.on('click', (ev) => {
      if (!ev?.latlng) return;
      const nearest = findNearestCity(ev.latlng.lat, ev.latlng.lng, 3.5);
      if (nearest) {
        currentOnSelectCity?.(nearest);
      }
    });

    // Delegate click on "Ver miembros de [Ciudad]" button inside Leaflet popup
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-popup-city]');
      if (!btn) return;
      onExploreCityMembers?.(btn.dataset.popupCity, btn.dataset.popupCountry);
    });

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
    const sentNorm = Math.max(0.3, Math.min(1, (Number(point.sentimiento_promedio ?? 0) + 1) / 2));
    heatCoords.push([lat, lng, sentNorm]);
  }

  // Render interactive proportional city hotspots so clicking ANY city shows full aggregated metrics
  for (const city of latestCities) {
    const dominantColor =
      city.activos >= city.en_riesgo && city.activos >= city.inactivos
        ? '#16a37a'
        : city.en_riesgo >= city.inactivos
          ? '#f2a900'
          : '#e5566d';
    const radius = Math.min(22, Math.max(8, 6 + Math.sqrt(city.usuarios) * 1.45));

    const marker = window.L.circleMarker([city.lat, city.lng], {
      radius,
      weight: 2.5,
      color: '#ffffff',
      fillColor: dominantColor,
      fillOpacity: 0.9,
    });

    marker.bindTooltip(
      `<strong>${escapeHtml(city.ciudad)}</strong> · ${formatNumber(city.usuarios)} miembros`,
      { direction: 'top', offset: [0, -6] }
    );
    marker.bindPopup(buildCityPopupHtml(city), { maxWidth: 280, className: 'c360-popup' });

    marker.on('click', (ev) => {
      window.L.DomEvent.stopPropagation(ev);
      currentOnSelectCity?.(city);
    });

    marker.addTo(markerLayer);
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

  // Select top city by default so the inspector panel is immediately populated
  if (latestCities.length > 0 && currentOnSelectCity) {
    currentOnSelectCity(latestCities[0]);
  }

  setTimeout(() => {
    if (!mapInstance) return;
    mapInstance.invalidateSize(true);
    if ((isFirstRender || !preserveView) && bounds.length > 0) {
      mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
    }
  }, 120);
}
