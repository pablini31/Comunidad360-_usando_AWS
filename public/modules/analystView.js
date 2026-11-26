import { buildBarConfig, buildDoughnutConfig, destroyAllCharts, renderChart } from './charts.js';
import {
  activityTypeBadge,
  avatarHtml,
  escapeHtml,
  formatConsent,
  formatDate,
  formatDateTime,
  formatImportEntity,
  formatNumber,
  formatPercent,
  formatReviewReason,
  formatRole,
  formatSentiment,
  statusBadge,
} from './format.js';
import {
  destroyMap,
  flyToLocation,
  renderCommunityMap,
  resetMapBounds,
  setMapBasemap,
  setMapLayerMode,
} from './map.js';
import { openChangePasswordModal, openMemberDetailModal, openPendingDetailModal } from './modals.js';

export function mountAnalystView(root, { api, profile, onSwitchAccount, toast }) {
  let activeSection = 'home';
  let locations = [];
  let summaryCache = null;
  let memberPage = 1;
  let memberTotalPages = 1;
  let memberDisplayMode = 'grid';
  let feedCursor = null;
  let pendingCursor = null;
  let mapLayerMode = 'both';
  let mapBasemap = 'streets';

  root.innerHTML = `
    <div class="magazine-shell" data-experience="analyst">
      <!-- CÁPSULA FLOTANTE DE VIDRIO CON MEDALLÓN CENTRAL (INSPIRADA EN RADHIYOGA) -->
      <header class="glass-nav-wrap">
        <nav class="glass-pill-nav" id="analyst-nav" aria-label="Navegación del portal">
          <div class="glass-nav-side left">
            <button type="button" data-section="home" class="active">Inicio</button>
            <button type="button" data-section="trends">Tendencias</button>
            <button type="button" data-section="map">Atlas</button>
          </div>

          <button type="button" class="glass-medallion" id="portal-brand-home" title="Volver a Inicio">
            <span>C</span><em>360</em>
          </button>

          <div class="glass-nav-side right">
            <button type="button" data-section="members">Miembros</button>
            <button type="button" data-section="conversations">Conversaciones</button>
            <button type="button" class="glass-switch-pill" id="analyst-switch-btn">Cambiar cuenta</button>
          </div>
        </nav>
      </header>

      <!-- RIEL FLOTANTE VERTICAL LATERAL (INSPIRADO EN EDSPORTLINE) -->
      <aside class="floating-edge-rail" aria-label="Acciones rápidas">
        <div class="rail-live-indicator connecting" id="analyst-live-status" title="Conexión en vivo">
          <i class="live-dot"></i>
        </div>
        <button type="button" class="rail-icon-btn" id="analyst-pwd-btn" title="Cambiar contraseña" aria-label="Cambiar contraseña">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </button>
        <button type="button" class="rail-icon-btn" id="analyst-rail-switch" title="Cambiar de cuenta (${escapeHtml(profile.username)})" aria-label="Cambiar de cuenta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
        </button>
      </aside>

      <!-- SECCIÓN 1: HERO INMERSIVO EDITORIAL + PULSO EN VIVO -->
      <section class="mag-section" id="analyst-sec-home">
        <div class="mag-hero">
          <div class="mag-hero-photo" aria-hidden="true"></div>
          <div class="mag-hero-scrim" aria-hidden="true"></div>
          <div class="mag-hero-inner">
            <div class="mag-hero-copy">
              <div class="mag-live-chip">
                <span class="pulse-live-dot"></span>
                <span>Portal editorial · ${escapeHtml(profile.username)} (${escapeHtml(formatRole(profile.rol))})</span>
              </div>
              <h1>
                Bienvenida/o<br>
                <em>Aquí exploras el pulso vivo de la comunidad.</em>
              </h1>
              <p>
                Recorre las conversaciones, observa las tendencias en tiempo real y navega el atlas interactivo construido con privacidad desde el origen.
              </p>
              <div class="hero-cta-row">
                <button type="button" class="btn btn-gold" data-jump="map">Explorar atlas real</button>
                <button type="button" class="btn btn-glass-light" data-jump="trends">Ver tendencias</button>
                <button type="button" class="btn btn-glass-light" data-jump="members">Galería de miembros</button>
              </div>
            </div>

            <div class="mag-pulse-dock" id="portal-pulse-card">
              <div class="dock-stat">
                <span>MIEMBROS</span>
                <strong id="portal-kpi-users">—</strong>
                <small id="portal-kpi-artists">Cargando…</small>
              </div>
              <div class="dock-stat">
                <span>ACTIVIDAD EN VIVO</span>
                <strong id="portal-kpi-activity">—</strong>
                <small id="portal-kpi-channels">Canales activos</small>
              </div>
              <div class="dock-stat">
                <span>CLIMA GENERAL</span>
                <strong id="portal-kpi-sentiment">—</strong>
                <small id="portal-kpi-sentiment-label">Ánimo de actividad</small>
              </div>
              <div class="dock-stat">
                <span>REACCIONES / PUB.</span>
                <strong id="portal-kpi-reactions">—</strong>
                <small id="portal-kpi-reactions-sub">Promedio dinámico</small>
              </div>
            </div>
          </div>
        </div>

        <div class="pulse-strip mag-pulse-strip">
          <span class="pulse-strip-label">Pulso de hoy</span>
          <div class="pulse-chips" id="analyst-marquee-track">
            <span class="pulse-chip static">Cargando datos de la comunidad…</span>
          </div>
        </div>

        <div class="mag-container">
          <div class="mag-chapter-head">
            <span class="mag-chapter-num">01 / CURADURÍA EN VIVO</span>
            <h2>Lo que mueve a la comunidad hoy</h2>
          </div>
          <div class="mag-showcase-grid" id="portal-showcase-grid">
            <article class="mag-feature-card"><div class="loading-row">Cargando destacados…</div></article>
            <article class="mag-feature-card"><div class="loading-row">Cargando destacados…</div></article>
            <article class="mag-feature-card"><div class="loading-row">Cargando destacados…</div></article>
          </div>
        </div>
      </section>

      <!-- SECCIÓN 2: TENDENCIAS EDITORIALES -->
      <section class="mag-section hidden" id="analyst-sec-trends">
        <div class="mag-container mag-page-top">
          <div class="mag-chapter-head">
            <span class="mag-chapter-num">02 / TENDENCIAS E INSIGHTS</span>
            <h1>Clima comunitario y canales activos</h1>
            <p>Visualizaciones amplias recalculadas automáticamente cuando llegan nuevas publicaciones o reacciones.</p>
          </div>

          <div class="editorial-charts-wide">
            <article class="editorial-card span-2">
              <div class="card-head">
                <div>
                  <h2>Ánimo promedio por país</h2>
                  <p>Basado exclusivamente en miembros que autorizaron compartir su ubicación</p>
                </div>
              </div>
              <div class="chart-box tall"><canvas id="analyst-country-chart"></canvas></div>
            </article>

            <article class="editorial-card" id="analyst-channel-card">
              <div class="card-head">
                <div>
                  <h2>Canales más activos</h2>
                  <p>Participación porcentual en tiempo real</p>
                </div>
              </div>
              <div class="chart-box tall" id="analyst-channel-wrap"><canvas id="analyst-channel-chart"></canvas></div>
            </article>

            <article class="editorial-card">
              <div class="card-head">
                <div>
                  <h2>Estado de participación</h2>
                  <p>Distribución actual de la comunidad</p>
                </div>
              </div>
              <div class="chart-box tall"><canvas id="analyst-status-chart"></canvas></div>
            </article>
          </div>

          <div class="editorial-rank-grid">
            <article class="editorial-card">
              <div class="card-head">
                <div>
                  <h2>Intereses más populares</h2>
                  <p>Temáticas favoritas de la comunidad</p>
                </div>
              </div>
              <div id="analyst-interests-bars" class="ranked-bars"></div>
            </article>

            <article class="editorial-card">
              <div class="card-head">
                <div>
                  <h2>Afinidades y especies</h2>
                  <p>Top 8 perfiles más representados</p>
                </div>
              </div>
              <div id="analyst-species-bars" class="ranked-bars"></div>
            </article>
          </div>
        </div>
      </section>

      <!-- SECCIÓN 3: ATLAS INTERACTIVO REAL (CALLES / SATÉLITE / NOCTURNO + HEATMAP + FLYTO) -->
      <section class="mag-section hidden" id="analyst-sec-map">
        <div class="mag-container mag-page-top">
          <div class="mag-chapter-head with-actions">
            <div>
              <span class="mag-chapter-num">03 / ATLAS DE CALOR INTERACTIVO</span>
              <h1>Recorre la comunidad en el mapa real</h1>
              <p>Muévete libremente por el mundo, cambia entre calles y satélite, y haz clic en cualquier ciudad para volar directo.</p>
            </div>
            <div class="action-row">
              <div class="map-mode-toggle editorial-toggle" id="analyst-basemap-mode">
                <button type="button" data-basemap="streets" class="active">Calles</button>
                <button type="button" data-basemap="satellite">Satélite</button>
                <button type="button" data-basemap="topo">Relieve</button>
                <button type="button" data-basemap="light">Claro</button>
              </div>
              <div class="map-mode-toggle editorial-toggle" id="analyst-map-mode">
                <button type="button" data-mode="heat">Calor</button>
                <button type="button" data-mode="both" class="active">Combinado</button>
                <button type="button" data-mode="markers">Marcadores</button>
              </div>
              <button type="button" class="btn btn-editorial-primary btn-sm" id="analyst-map-reset">Vista global</button>
            </div>
          </div>

          <div class="portal-map-layout">
            <article class="editorial-card map-card-large">
              <div id="analyst-map-canvas" class="map-canvas large"></div>
              <div class="studio-map-footer light-footer">
                <div class="map-legend">
                  <span><i class="dot emerald"></i> Activo</span>
                  <span><i class="dot amber"></i> En riesgo</span>
                  <span><i class="dot rose"></i> Inactivo</span>
                  <span class="heat-legend-bar"><i class="heat-swatch"></i> Densidad de calor</span>
                </div>
                <span class="map-tip light-tip">Arrastra el mapa o usa scroll para explorar cualquier ciudad</span>
              </div>
            </article>

            <aside class="editorial-card geo-summary-card">
              <div class="privacy-callout" id="analyst-privacy-callout">
                Verificando privacidad de miembros…
              </div>
              <h3>Volar a ciudades destacadas</h3>
              <div id="analyst-geo-cities" class="geo-rank-list compact"></div>
              <h3 style="margin-top:20px">Resumen por país</h3>
              <div id="analyst-geo-countries" class="geo-rank-list"></div>
            </aside>
          </div>
        </div>
      </section>

      <!-- SECCIÓN 4: GALERÍA VISUAL DE MIEMBROS -->
      <section class="mag-section hidden" id="analyst-sec-members">
        <div class="mag-container mag-page-top">
          <div class="mag-chapter-head with-actions">
            <div>
              <span class="mag-chapter-num">04 / COMUNIDAD</span>
              <h1>Galería de miembros</h1>
              <p>Explora perfiles creativos, intereses y actividad reciente. Haz clic en cualquier tarjeta para abrir su historia.</p>
            </div>
            <div class="action-row">
              <div class="view-toggle" role="group" aria-label="Cambiar vista">
                <button type="button" class="active" data-mode="grid" id="mode-grid-btn">Tarjetas</button>
                <button type="button" data-mode="list" id="mode-list-btn">Lista</button>
              </div>
              <button type="button" class="btn btn-portal-outline btn-sm" id="analyst-export-csv">Exportar CSV</button>
            </div>
          </div>

          <div class="editorial-filter-bar">
            <input id="analyst-member-search" type="search" placeholder="Buscar miembro por alias o ID…">
            <select id="analyst-filter-status">
              <option value="">Todos los estados</option>
              <option value="activo">Activo</option>
              <option value="en_riesgo">En riesgo</option>
              <option value="inactivo">Inactivo</option>
            </select>
            <select id="analyst-filter-platform">
              <option value="">Todas las plataformas</option>
              <option>Discord</option>
              <option>Facebook</option>
              <option>Instagram</option>
              <option>Telegram</option>
              <option>TikTok</option>
              <option>Twitter/X</option>
            </select>
            <select id="analyst-filter-artist">
              <option value="">Todos los perfiles</option>
              <option value="1">Solo artistas</option>
              <option value="0">No artistas</option>
            </select>
            <select id="analyst-filter-country">
              <option value="">Todos los países</option>
            </select>
            <button type="button" class="btn btn-portal-ghost btn-sm" id="analyst-clear-members">Limpiar</button>
          </div>

          <div id="analyst-members-host"></div>

          <div class="table-footer">
            <span id="analyst-members-count">—</span>
            <div class="action-row">
              <button type="button" class="btn btn-portal-outline btn-sm" id="analyst-prev-page">Anterior</button>
              <button type="button" class="btn btn-portal-outline btn-sm" id="analyst-next-page">Siguiente</button>
            </div>
          </div>
        </div>
      </section>

      <!-- SECCIÓN 5: CONVERSACIONES EN VIVO + TRANSPARENCIA -->
      <section class="mag-section hidden" id="analyst-sec-conversations">
        <div class="mag-container mag-page-top">
          <div class="mag-chapter-head with-actions">
            <div>
              <span class="mag-chapter-num">05 / CONVERSACIONES EN VIVO</span>
              <h1>Voces y reacciones en canales</h1>
              <p>Stream actualizado automáticamente con cada nueva publicación, edición o eliminación.</p>
            </div>
            <span class="pill pill-success">Sincronizado en vivo</span>
          </div>

          <div class="editorial-filter-bar">
            <input id="analyst-feed-user" placeholder="Filtrar por ID de miembro (ej. U000001)">
            <select id="analyst-feed-channel">
              <option value="">Todos los canales</option>
              <option>Discord</option>
              <option>Instagram</option>
              <option>Twitter/X</option>
              <option>Telegram</option>
              <option>TikTok</option>
              <option>Facebook</option>
            </select>
            <select id="analyst-feed-type">
              <option value="">Todos los formatos</option>
              <option value="publicacion">Publicación</option>
              <option value="comentario">Comentario</option>
              <option value="mensaje">Mensaje</option>
              <option value="reaccion">Reacción</option>
            </select>
            <button type="button" class="btn btn-editorial-primary btn-sm" id="analyst-feed-apply">Explorar</button>
          </div>

          <div id="analyst-feed-list" class="editorial-feed"></div>

          <div class="table-footer">
            <span id="analyst-feed-meta"></span>
            <button type="button" class="btn btn-portal-outline btn-sm" id="analyst-feed-more" disabled>Ver más conversaciones</button>
          </div>

          <div class="portal-quality-block">
            <div class="mag-chapter-head compact">
              <span class="mag-chapter-num">TRANSPARENCIA DE DATOS</span>
              <h2>Actividad pendiente e historial de importaciones</h2>
            </div>
            <div class="review-split-grid">
              <article class="editorial-card">
                <div class="card-head">
                  <div>
                    <h3>Actividad pendiente de vincular</h3>
                    <p>Registros en espera de asociación con un perfil</p>
                  </div>
                </div>
                <div id="analyst-pending-list" class="activity-stream"></div>
                <div class="table-footer">
                  <span id="analyst-pending-meta"></span>
                  <button type="button" class="btn btn-portal-outline btn-sm" id="analyst-more-pending" disabled>Cargar más</button>
                </div>
              </article>

              <article class="editorial-card">
                <div class="card-head">
                  <div>
                    <h3>Historial de importaciones</h3>
                    <p>Actualizaciones integradas en la plataforma</p>
                  </div>
                </div>
                <div class="table-container">
                  <table class="data-table editorial-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Sección</th>
                        <th>Recibidos</th>
                        <th>Integrados</th>
                        <th>Pendientes</th>
                      </tr>
                    </thead>
                    <tbody id="analyst-imports-tbody"></tbody>
                  </table>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);

  function flashElement(el) {
    if (!el) return;
    el.classList.remove('live-flash');
    void el.offsetWidth;
    el.classList.add('live-flash');
  }

  function renderFeedCard(item, isLiveNew = false) {
    const sent = formatSentiment(item.sentimiento);
    return `
      <article class="feed-post-card ${isLiveNew ? 'live-flash' : ''}" data-feed-id="${escapeHtml(item.id_interaccion)}">
        <div class="feed-post-head">
          <div class="feed-author">
            ${avatarHtml(item.id_usuario, 'sm')}
            <div>
              <strong>Miembro ${escapeHtml(item.id_usuario)}</strong>
              <small>${escapeHtml(item.canal || 'Comunidad')} · ${escapeHtml(formatDateTime(item.timestamp))}</small>
            </div>
          </div>
          <div class="activity-badges">
            ${activityTypeBadge(item.tipo)}
            <span class="pill pill-${sent.tone}">${escapeHtml(sent.label)} (${escapeHtml(sent.score)})</span>
            ${isLiveNew ? '<span class="pill pill-success">En vivo</span>' : ''}
          </div>
        </div>
        ${
          item.texto
            ? `<p class="feed-post-quote">${escapeHtml(item.texto)}</p>`
            : `<p class="feed-post-muted">Participación sin texto en el tema <b>${escapeHtml(item.tema || 'comunidad')}</b>.</p>`
        }
        <div class="feed-post-foot">
          <div class="chip-row">
            <span class="tag-chip accent">${escapeHtml(item.tema || 'General')}</span>
            ${(item.etiquetas || []).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}
          </div>
          <span class="feed-reactions">${formatNumber(item.reacciones_recibidas ?? 0)} reacciones</span>
        </div>
      </article>
    `;
  }

  function goToSection(section) {
    activeSection = section;
    root.querySelectorAll('#analyst-nav button[data-section]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.section === section);
    });
    root.querySelectorAll('.mag-section').forEach((sec) => {
      sec.classList.toggle('hidden', sec.id !== `analyst-sec-${section}`);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (section === 'home') loadHomeAndSummary();
    if (section === 'trends') loadTrends();
    if (section === 'map') loadMap();
    if (section === 'members') loadMembers();
    if (section === 'conversations') {
      feedCursor = null;
      loadFeed(true);
      loadQualityBlock(true);
    }
  }

  $('#analyst-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-section]');
    if (!btn) return;
    goToSection(btn.dataset.section);
  });

  $('#portal-brand-home').addEventListener('click', () => goToSection('home'));
  root.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => goToSection(btn.dataset.jump));
  });

  $('#analyst-map-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    mapLayerMode = btn.dataset.mode;
    root.querySelectorAll('#analyst-map-mode button').forEach((b) => b.classList.toggle('active', b === btn));
    setMapLayerMode(mapLayerMode);
  });

  $('#analyst-basemap-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-basemap]');
    if (!btn) return;
    mapBasemap = btn.dataset.basemap;
    root.querySelectorAll('#analyst-basemap-mode button').forEach((b) => b.classList.toggle('active', b === btn));
    setMapBasemap(mapBasemap);
  });

  $('#analyst-map-reset').addEventListener('click', () => resetMapBounds());
  $('#analyst-switch-btn').addEventListener('click', onSwitchAccount);
  $('#analyst-rail-switch').addEventListener('click', onSwitchAccount);
  $('#analyst-pwd-btn').addEventListener('click', () => openChangePasswordModal({ api, toast }));

  async function loadCatalogs() {
    try {
      locations = await api('/api/catalogos/ubicaciones');
      const sel = $('#analyst-filter-country');
      sel.innerHTML =
        '<option value="">Todos los países</option>' +
        locations.map((p) => `<option value="${p.pais_id}">${escapeHtml(p.nombre)}</option>`).join('');
    } catch {}
  }

  async function ensureSummary() {
    if (summaryCache) return summaryCache;
    summaryCache = await api('/api/analytics/resumen');
    return summaryCache;
  }

  function updateAnalystMarquee(d) {
    const track = $('#analyst-marquee-track');
    if (!track) return;
    const topInterest = d.top_intereses?.[0]?.nombre || 'Comunidad';
    const topCountry = d.por_pais?.[0]?.pais || 'Global';
    const items = [
      `${formatNumber(d.total_usuarios)} MIEMBROS`,
      `${formatNumber(d.artistas)} ARTISTAS Y CREADORES`,
      d.actividad_disponible && d.total_interacciones_validas !== null
        ? `${formatNumber(d.total_interacciones_validas)} PUBLICACIONES Y REACCIONES`
        : 'EXPLORACIÓN EN VIVO',
      `INTERÉS LÍDER: ${topInterest.toUpperCase()}`,
      `MAYOR PRESENCIA: ${topCountry.toUpperCase()}`,
      `PRIVACIDAD ACTIVA · ${formatNumber(d.consentimiento_no)} PROTEGIDOS`,
    ];
    const sections = ['members', 'members', 'conversations', 'trends', 'map', 'map'];
    track.innerHTML = items
      .map(
        (t, i) =>
          `<button type="button" class="pulse-chip" data-jump="${sections[i] || 'home'}" title="Ir a esta sección">${escapeHtml(t)}<em>→</em></button>`
      )
      .join('');
  }

  function applySummaryToHome(d, highlightLive = false) {
    summaryCache = d;
    const total = Number(d.total_usuarios || 0);
    const active = Number(d.activos || 0);
    const artists = Number(d.artistas || 0);
    const activeSentimentRaw =
      d.actividad_disponible && d.sentimiento_interacciones_promedio !== null
        ? d.sentimiento_interacciones_promedio
        : d.sentimiento_promedio;
    const sent = formatSentiment(activeSentimentRaw);

    $('#portal-kpi-users').textContent = formatNumber(total);
    $('#portal-kpi-artists').textContent = `${formatPercent(active, total)} activos · ${formatNumber(artists)} artistas`;

    if (d.actividad_disponible && d.total_interacciones_validas !== null) {
      $('#portal-kpi-activity').textContent = formatNumber(d.total_interacciones_validas);
      $('#portal-kpi-channels').textContent = `En ${(d.canales || []).length} canales`;
      $('#portal-kpi-reactions').textContent =
        d.promedio_reacciones !== null ? Number(d.promedio_reacciones).toFixed(2) : '0.00';
      $('#portal-kpi-reactions-sub').textContent = `${formatNumber(d.total_reacciones ?? 0)} totales`;
    } else {
      $('#portal-kpi-activity').textContent = 'En pausa';
      $('#portal-kpi-channels').textContent = 'Sin conexión temporal';
      $('#portal-kpi-reactions').textContent = '—';
      $('#portal-kpi-reactions-sub').textContent = 'Por publicación';
    }

    $('#portal-kpi-sentiment').textContent = sent.score;
    $('#portal-kpi-sentiment-label').textContent =
      d.actividad_disponible && d.tasa_positividad_actividad !== null
        ? `${sent.label} · ${d.tasa_positividad_actividad}% +`
        : sent.label;

    updateAnalystMarquee(d);

    const topInterests = (d.top_intereses || []).slice(0, 4);
    const topChannels = (d.canales || []).slice(0, 4);
    const topPlatforms = (d.plataformas || []).slice(0, 4);
    const topCountries = (d.por_pais || []).slice(0, 4);

    $('#portal-showcase-grid').innerHTML = `
      <article class="mag-feature-card">
        <span class="mag-feature-tag">01 · INTERESES</span>
        <h3>Lo que más reúne a la comunidad</h3>
        <div class="showcase-list">
          ${topInterests.map((item) => `<div class="showcase-row"><span>${escapeHtml(item.nombre)}</span><b>${formatNumber(item.total)}</b></div>`).join('')}
        </div>
      </article>

      <article class="mag-feature-card featured-dark">
        <span class="mag-feature-tag gold">02 · CANALES EN VIVO</span>
        <h3>${topChannels.length ? 'Participación por canal' : 'Espacios favoritos'}</h3>
        <div class="showcase-list">
          ${
            topChannels.length
              ? topChannels
                  .map(
                    (item) => `<div class="showcase-row dark-row"><span>${escapeHtml(item.canal)}</span><b>${item.tasa_participacion}% (${formatNumber(item.total)})</b></div>`
                  )
                  .join('')
              : topPlatforms
                  .map(
                    (item) => `<div class="showcase-row dark-row"><span>${escapeHtml(item.nombre)}</span><b>${formatPercent(item.total, total)}</b></div>`
                  )
                  .join('')
          }
        </div>
      </article>

      <article class="mag-feature-card">
        <span class="mag-feature-tag">03 · REGIONES</span>
        <h3>Países con mayor presencia</h3>
        <div class="showcase-list">
          ${topCountries
            .map((item) => {
              const s = formatSentiment(item.sentimiento_promedio);
              return `<div class="showcase-row"><span>${escapeHtml(item.pais)}</span><span class="pill pill-${s.tone}">${formatNumber(item.usuarios)} · ${escapeHtml(s.score)}</span></div>`;
            })
            .join('')}
        </div>
      </article>
    `;

    if (highlightLive) flashElement($('#portal-pulse-card'));
  }

  async function loadHomeAndSummary() {
    try {
      const d = await ensureSummary();
      applySummaryToHome(d, false);
    } catch (err) {
      toast(err.message, true);
    }
  }

  function renderRankedBars(containerId, items, totalKey, labelKey, toneClass) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const list = (items || []).slice(0, 8);
    if (!list.length) {
      el.innerHTML = '<div class="empty-state compact">Sin datos disponibles.</div>';
      return;
    }
    const maxVal = Math.max(...list.map((x) => Number(x[totalKey] || 0)), 1);
    el.innerHTML = list
      .map((item) => {
        const val = Number(item[totalKey] || 0);
        const pct = Math.max(6, Math.round((val / maxVal) * 100));
        return `
          <div class="rank-bar-item">
            <div class="rank-bar-head">
              <span>${escapeHtml(item[labelKey])}</span>
              <strong>${formatNumber(val)}</strong>
            </div>
            <div class="rank-track"><div class="rank-fill ${toneClass}" style="width:${pct}%"></div></div>
          </div>
        `;
      })
      .join('');
  }

  function applySummaryToTrends(d, highlightLive = false) {
    const countries = (d.por_pais || []).slice(0, 10);
    renderChart(
      'analyst-country-chart',
      buildBarConfig({
        labels: countries.map((x) => x.pais),
        data: countries.map((x) => Number(Number(x.sentimiento_promedio || 0).toFixed(2))),
        color: '#2d4a3e',
        yFormat: (v) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}`,
      })
    );

    const channelWrap = $('#analyst-channel-wrap');
    if (d.actividad_disponible && (d.canales || []).length) {
      channelWrap.innerHTML = '<canvas id="analyst-channel-chart"></canvas>';
      renderChart(
        'analyst-channel-chart',
        buildBarConfig({
          labels: d.canales.map((x) => `${x.canal} (${x.tasa_participacion}%)`),
          data: d.canales.map((x) => x.total),
          color: '#c98a2c',
          horizontal: true,
          valueSuffix: ' registros',
        })
      );
    } else {
      channelWrap.innerHTML = `<div class="empty-state">${
        d.actividad_disponible ? 'Aún no hay actividad registrada por canal.' : 'Los datos de canales no están disponibles en este momento.'
      }</div>`;
    }

    renderChart(
      'analyst-status-chart',
      buildDoughnutConfig({
        labels: ['Activos', 'En riesgo', 'Inactivos'],
        data: [Number(d.activos || 0), Number(d.en_riesgo || 0), Number(d.inactivos || 0)],
        colors: ['#2d6a4f', '#e09f3e', '#bc4749'],
      })
    );

    renderRankedBars('analyst-interests-bars', d.top_intereses, 'total', 'nombre', 'forest');
    renderRankedBars('analyst-species-bars', d.top_especies, 'total', 'nombre', 'gold');

    if (highlightLive) flashElement($('#analyst-channel-card'));
  }

  async function loadTrends() {
    try {
      const d = await ensureSummary();
      applySummaryToTrends(d, false);
    } catch (err) {
      toast(err.message, true);
    }
  }

  function buildCityCentroids(points) {
    const map = new Map();
    for (const p of points) {
      if (p.latitud == null || p.longitud == null) continue;
      const key = `${p.ciudad}|${p.pais}`;
      if (!map.has(key)) map.set(key, { ciudad: p.ciudad, pais: p.pais, latSum: 0, lngSum: 0, count: 0 });
      const entry = map.get(key);
      entry.latSum += Number(p.latitud);
      entry.lngSum += Number(p.longitud);
      entry.count += 1;
    }
    return [...map.values()]
      .map((c) => ({ ciudad: c.ciudad, pais: c.pais, lat: c.latSum / c.count, lng: c.lngSum / c.count, usuarios: c.count }))
      .sort((a, b) => b.usuarios - a.usuarios);
  }

  async function loadMap() {
    const callout = $('#analyst-privacy-callout');
    callout.textContent = 'Consultando cobertura comunitaria…';
    try {
      const [points, protectedRes, summary] = await Promise.all([
        api('/api/analytics/mapa'),
        api('/api/usuarios?consentimiento_datos=no&limit=1'),
        ensureSummary().catch(() => null),
      ]);

      callout.innerHTML = `
        <strong>Privacidad primero</strong>
        <p>${formatNumber(protectedRes.total)} miembros eligieron mantener su ubicación privada y están excluidos de este atlas (${formatNumber(points.length)} ubicaciones autorizadas visibles).</p>
      `;
      renderCommunityMap('analyst-map-canvas', points, { theme: mapBasemap, mode: mapLayerMode });

      const cities = buildCityCentroids(points).slice(0, 7);
      $('#analyst-geo-cities').innerHTML = cities.length
        ? cities
            .map(
              (c) => `
                <button type="button" class="geo-fly-item light-fly" data-lat="${c.lat}" data-lng="${c.lng}">
                  <div>
                    <strong>${escapeHtml(c.ciudad)}</strong>
                    <small>${escapeHtml(c.pais)}</small>
                  </div>
                  <b>${formatNumber(c.usuarios)} →</b>
                </button>
              `
            )
            .join('')
        : '<div class="empty-state compact">Sin ciudades destacadas.</div>';

      const countries = (summary?.por_pais || []).slice(0, 6);
      $('#analyst-geo-countries').innerHTML = countries.length
        ? countries
            .map((c) => {
              const s = formatSentiment(c.sentimiento_promedio);
              return `
                <div class="geo-rank-item">
                  <div>
                    <strong>${escapeHtml(c.pais)}</strong>
                    <small>${formatNumber(c.usuarios)} miembros</small>
                  </div>
                  <span class="pill pill-${s.tone}">${escapeHtml(s.score)}</span>
                </div>
              `;
            })
            .join('')
        : '<div class="empty-state compact">Sin resumen regional.</div>';
    } catch (err) {
      callout.textContent = 'No fue posible cargar el atlas comunitario.';
      toast(err.message, true);
    }
  }

  $('#analyst-geo-cities').addEventListener('click', (e) => {
    const btn = e.target.closest('.geo-fly-item');
    if (!btn) return;
    flyToLocation(btn.dataset.lat, btn.dataset.lng, 10);
  });

  function buildMemberParams(includePage = true) {
    const q = new URLSearchParams();
    if (includePage) {
      q.set('page', String(memberPage));
      q.set('limit', '18');
    }
    const search = $('#analyst-member-search').value.trim();
    if (search) q.set('q', search);
    if ($('#analyst-filter-status').value) q.set('estatus', $('#analyst-filter-status').value);
    if ($('#analyst-filter-platform').value) q.set('plataforma_principal', $('#analyst-filter-platform').value);
    if ($('#analyst-filter-artist').value !== '') q.set('es_artista', $('#analyst-filter-artist').value);
    if ($('#analyst-filter-country').value) q.set('pais_id', $('#analyst-filter-country').value);
    return q;
  }

  let latestMembers = [];

  function renderMembersView() {
    const host = $('#analyst-members-host');
    if (!latestMembers.length) {
      host.innerHTML = '<div class="editorial-card"><div class="empty-state">No encontramos miembros con esos criterios.</div></div>';
      return;
    }

    if (memberDisplayMode === 'grid') {
      host.innerHTML = `
        <div class="member-cards-grid">
          ${latestMembers
            .map((u, idx) => {
              const sent = formatSentiment(u.sentimiento_promedio);
              const coverTone = `tone-${idx % 4}`;
              return `
                <article class="member-profile-card portrait-card" data-member-id="${escapeHtml(u.id_usuario)}" tabindex="0" role="button">
                  <div class="portrait-ribbon ${coverTone}">
                    ${statusBadge(u.estatus)}
                    ${Number(u.es_artista) === 1 ? '<span class="pill pill-amber">Artista</span>' : ''}
                  </div>
                  <div class="portrait-body">
                    <div class="portrait-avatar-lift">${avatarHtml(u.alias, 'md')}</div>
                    <h3>${escapeHtml(u.alias)}</h3>
                    <span class="portrait-sub">${escapeHtml(u.especie_fursona || 'Comunidad')} · ${escapeHtml(u.plataforma_principal)}</span>
                    <div class="member-card-tags">
                      <span class="tag-chip">${escapeHtml(u.interes_principal || 'General')}</span>
                      <span class="tag-chip">${escapeHtml(u.rango_edad)} años</span>
                    </div>
                  </div>
                  <div class="member-card-foot">
                    <span>Activo: <b>${escapeHtml(formatDate(u.ultima_actividad))}</b></span>
                    <span class="pill pill-${sent.tone}">${escapeHtml(sent.score)}</span>
                  </div>
                </article>
              `;
            })
            .join('')}
        </div>
      `;
    } else {
      host.innerHTML = `
        <article class="editorial-card">
          <div class="table-container">
            <table class="data-table editorial-table">
              <thead>
                <tr>
                  <th>Miembro</th>
                  <th>Interés</th>
                  <th>Plataforma</th>
                  <th>Estado</th>
                  <th>Ubicación</th>
                  <th>Última actividad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${latestMembers
                  .map(
                    (u) => `
                      <tr>
                        <td>
                          <div class="member-cell">
                            ${avatarHtml(u.alias, 'sm')}
                            <div>
                              <strong>${escapeHtml(u.alias)}</strong>
                              <small>${escapeHtml(u.especie_fursona || 'Miembro')}</small>
                            </div>
                          </div>
                        </td>
                        <td>${escapeHtml(u.interes_principal || '—')}</td>
                        <td><span class="platform-tag">${escapeHtml(u.plataforma_principal)}</span></td>
                        <td>${statusBadge(u.estatus)}</td>
                        <td>${escapeHtml(formatConsent(u.consentimiento_datos))}</td>
                        <td>${escapeHtml(formatDate(u.ultima_actividad))}</td>
                        <td><button type="button" class="btn btn-portal-outline btn-xs" data-member-id="${escapeHtml(u.id_usuario)}">Ver perfil</button></td>
                      </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </article>
      `;
    }
  }

  async function loadMembers() {
    const host = $('#analyst-members-host');
    host.innerHTML = '<div class="editorial-card"><div class="loading-row">Cargando galería de miembros…</div></div>';
    try {
      const data = await api(`/api/usuarios?${buildMemberParams(true)}`);
      latestMembers = data.items || [];
      memberTotalPages = Math.max(1, data.totalPages || 1);
      $('#analyst-members-count').textContent = `${formatNumber(data.total)} miembros · Página ${data.page} de ${memberTotalPages}`;
      $('#analyst-prev-page').disabled = memberPage <= 1;
      $('#analyst-next-page').disabled = memberPage >= memberTotalPages;
      renderMembersView();
    } catch (err) {
      host.innerHTML = '<div class="editorial-card"><div class="empty-state">No fue posible cargar los miembros.</div></div>';
      toast(err.message, true);
    }
  }

  $('#mode-grid-btn').addEventListener('click', () => {
    memberDisplayMode = 'grid';
    $('#mode-grid-btn').classList.add('active');
    $('#mode-list-btn').classList.remove('active');
    renderMembersView();
  });
  $('#mode-list-btn').addEventListener('click', () => {
    memberDisplayMode = 'list';
    $('#mode-list-btn').classList.add('active');
    $('#mode-grid-btn').classList.remove('active');
    renderMembersView();
  });

  async function openMemberProfile(id) {
    try {
      const detail = await api(`/api/usuarios/${encodeURIComponent(id)}`);
      openMemberDetailModal(detail, { isAdmin: false });
    } catch (err) {
      toast(err.message, true);
    }
  }

  $('#analyst-members-host').addEventListener('click', (e) => {
    const target = e.target.closest('[data-member-id]');
    if (!target) return;
    openMemberProfile(target.dataset.memberId);
  });
  $('#analyst-members-host').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest('[data-member-id]');
    if (!target) return;
    e.preventDefault();
    openMemberProfile(target.dataset.memberId);
  });

  let memberSearchTimer;
  const resetMembers = () => {
    memberPage = 1;
    loadMembers();
  };
  $('#analyst-member-search').addEventListener('input', () => {
    clearTimeout(memberSearchTimer);
    memberSearchTimer = setTimeout(resetMembers, 260);
  });
  ['#analyst-filter-status', '#analyst-filter-platform', '#analyst-filter-artist', '#analyst-filter-country'].forEach((sel) =>
    $(sel).addEventListener('change', resetMembers)
  );
  $('#analyst-clear-members').addEventListener('click', () => {
    $('#analyst-member-search').value = '';
    ['#analyst-filter-status', '#analyst-filter-platform', '#analyst-filter-artist', '#analyst-filter-country'].forEach(
      (sel) => ($(sel).value = '')
    );
    resetMembers();
  });

  $('#analyst-prev-page').addEventListener('click', () => {
    if (memberPage > 1) {
      memberPage--;
      loadMembers();
    }
  });
  $('#analyst-next-page').addEventListener('click', () => {
    if (memberPage < memberTotalPages) {
      memberPage++;
      loadMembers();
    }
  });

  $('#analyst-export-csv').addEventListener('click', async () => {
    try {
      const csv = await api(`/api/usuarios/export/csv?${buildMemberParams(false)}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'community360-miembros.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Directorio exportado en CSV.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  async function loadFeed(reset = false) {
    const list = $('#analyst-feed-list');
    if (reset) list.innerHTML = '<div class="editorial-card"><div class="loading-row">Cargando conversaciones de la comunidad…</div></div>';
    try {
      const q = new URLSearchParams({ limit: '18' });
      const uid = $('#analyst-feed-user').value.trim();
      const ch = $('#analyst-feed-channel').value;
      const type = $('#analyst-feed-type').value;
      if (uid) q.set('id_usuario', uid);
      if (ch) q.set('canal', ch);
      if (type) q.set('tipo', type);
      if (!reset && feedCursor) q.set('cursor', feedCursor);

      const data = await api(`/api/interacciones?${q}`);
      if (reset) list.innerHTML = '';
      feedCursor = data.nextCursor;
      $('#analyst-feed-more').disabled = !feedCursor;

      const html = (data.items || []).map((item) => renderFeedCard(item, false)).join('');
      if (html) list.insertAdjacentHTML('beforeend', html);
      else if (reset) list.innerHTML = '<div class="editorial-card"><div class="empty-state">No hay conversaciones que coincidan con los filtros.</div></div>';
      $('#analyst-feed-meta').textContent = `${list.querySelectorAll('.feed-post-card').length} publicaciones cargadas`;
    } catch (err) {
      if (reset) list.innerHTML = `<div class="editorial-card"><div class="inline-notice warning">${escapeHtml(err.message)}</div></div>`;
      $('#analyst-feed-more').disabled = true;
    }
  }

  $('#analyst-feed-apply').addEventListener('click', () => {
    feedCursor = null;
    loadFeed(true);
  });
  $('#analyst-feed-more').addEventListener('click', () => {
    if (feedCursor) loadFeed(false);
  });

  async function loadQualityBlock(reset = true) {
    const pendingList = $('#analyst-pending-list');
    const importsBody = $('#analyst-imports-tbody');
    if (reset) {
      pendingCursor = null;
      pendingList.innerHTML = '<div class="loading-row">Cargando actividad pendiente…</div>';
      importsBody.innerHTML = '<tr><td colspan="5"><div class="loading-row">Cargando historial de importaciones…</div></td></tr>';
    }

    const pendingUrl = `/api/cuarentena?limit=15${!reset && pendingCursor ? `&cursor=${encodeURIComponent(pendingCursor)}` : ''}`;
    const calls = [api(pendingUrl)];
    if (reset) calls.push(api('/api/bitacora'));

    const results = await Promise.allSettled(calls);
    const pendingRes = results[0];
    const importsRes = reset ? results[1] : null;

    if (pendingRes.status === 'fulfilled') {
      const q = pendingRes.value;
      if (reset) pendingList.innerHTML = '';
      pendingCursor = q.nextCursor;
      $('#analyst-more-pending').disabled = !pendingCursor;
      const html = (q.items || [])
        .map(
          (item) => `
            <article class="activity-card">
              <div class="activity-card-head">
                <div class="activity-badges">
                  <strong>${escapeHtml(item.id_interaccion)}</strong>
                  <span class="pill pill-warning">${escapeHtml(formatReviewReason(item.motivo_rechazo))}</span>
                </div>
                <time>${escapeHtml(formatDateTime(item.fecha_cuarentena))}</time>
              </div>
              <p class="activity-sub">Referencia: <b>${escapeHtml(item.id_usuario_referenciado || 'Desconocido')}</b></p>
              <div class="action-row" style="margin-top:8px">
                <button type="button" class="btn btn-portal-outline btn-xs analyst-inspect-pending" data-id="${escapeHtml(item.id_interaccion)}">Ver detalle</button>
              </div>
            </article>
          `
        )
        .join('');
      if (html) pendingList.insertAdjacentHTML('beforeend', html);
      else if (reset) pendingList.innerHTML = '<div class="empty-state compact">No hay actividad pendiente de vincular.</div>';
      $('#analyst-pending-meta').textContent = `${pendingList.querySelectorAll('.activity-card').length} registros`;
    } else {
      if (reset) pendingList.innerHTML = `<div class="inline-notice warning">${escapeHtml(pendingRes.reason?.message || 'No fue posible consultar la actividad pendiente.')}</div>`;
      $('#analyst-more-pending').disabled = true;
    }

    if (importsRes) {
      if (importsRes.status === 'fulfilled') {
        const rows = importsRes.value || [];
        importsBody.innerHTML = rows.length
          ? rows
              .map(
                (r) => `
                  <tr>
                    <td>${escapeHtml(formatDateTime(r.fecha_ejecucion))}</td>
                    <td><strong>${escapeHtml(formatImportEntity(r.entidad_procesada))}</strong></td>
                    <td>${formatNumber(r.registros_recibidos)}</td>
                    <td><span class="pill pill-success">${formatNumber(r.registros_aceptados)}</span></td>
                    <td>${formatNumber(r.registros_rechazados)}</td>
                  </tr>
                `
              )
              .join('')
          : '<tr><td colspan="5"><div class="empty-state compact">Sin importaciones registradas.</div></td></tr>';
      } else {
        importsBody.innerHTML = `<tr><td colspan="5"><div class="inline-notice warning">${escapeHtml(importsRes.reason?.message || 'No se pudo cargar el historial.')}</div></td></tr>`;
      }
    }
  }

  $('#analyst-more-pending').addEventListener('click', () => {
    if (pendingCursor) loadQualityBlock(false);
  });

  $('#analyst-pending-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.analyst-inspect-pending');
    if (!btn) return;
    try {
      const res = await api(`/api/cuarentena/${encodeURIComponent(btn.dataset.id)}`);
      openPendingDetailModal(res.item);
    } catch (err) {
      toast(err.message, true);
    }
  });

  function onRealtimeStatus(status) {
    const dot = $('#analyst-live-status');
    if (!dot) return;
    dot.className = `rail-live-indicator ${status}`;
    dot.title =
      status === 'live' ? 'Conectado en vivo' : status === 'reconnecting' ? 'Reconectando…' : status === 'connecting' ? 'Conectando…' : 'Sin conexión';
  }

  function onRealtimeEvent(eventName, payload) {
    if (eventName === 'analytics:actualizado' && payload) {
      summaryCache = payload;
      applySummaryToHome(payload, activeSection === 'home');
      if (activeSection === 'trends') applySummaryToTrends(payload, true);
      if (activeSection === 'map') loadMap();
      return;
    }

    const list = $('#analyst-feed-list');
    if (eventName === 'interaccion:creada' && payload?.item) {
      toast(`Nueva conversación en vivo · ${payload.item.canal || 'Comunidad'}`);
      if (activeSection === 'conversations' && list) {
        const empty = list.querySelector('.empty-state, .inline-notice');
        if (empty) list.innerHTML = '';
        const existing = list.querySelector(`[data-feed-id="${CSS.escape(payload.item.id_interaccion)}"]`);
        if (existing) existing.remove();
        list.insertAdjacentHTML('afterbegin', renderFeedCard(payload.item, true));
        $('#analyst-feed-meta').textContent = `${list.querySelectorAll('.feed-post-card').length} publicaciones cargadas`;
      }
    } else if (eventName === 'interaccion:actualizada' && payload?.item) {
      toast(`Publicación actualizada en vivo · ${payload.item.canal || 'Comunidad'}`);
      if (activeSection === 'conversations' && list) {
        const card = list.querySelector(`[data-feed-id="${CSS.escape(payload.item.id_interaccion)}"]`);
        if (card) card.outerHTML = renderFeedCard(payload.item, true);
      }
    } else if (eventName === 'interaccion:eliminada' && payload?.id_interaccion) {
      toast(`Publicación eliminada en vivo · ${payload.id_interaccion}`);
      if (activeSection === 'conversations' && list) {
        const card = list.querySelector(`[data-feed-id="${CSS.escape(payload.id_interaccion)}"]`);
        if (card) card.remove();
        $('#analyst-feed-meta').textContent = `${list.querySelectorAll('.feed-post-card').length} publicaciones cargadas`;
      }
    }
  }

  $('#analyst-marquee-track').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-jump]');
    if (chip) goToSection(chip.dataset.jump);
  });

  loadCatalogs();
  loadHomeAndSummary();

  return {
    onRealtimeStatus,
    onRealtimeEvent,
    unmount() {
      destroyAllCharts();
      destroyMap();
    },
  };
}
