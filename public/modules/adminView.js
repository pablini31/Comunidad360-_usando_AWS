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
import {
  openChangePasswordModal,
  openLinkPendingModal,
  openMemberDetailModal,
  openMemberFormModal,
  openNewAccountModal,
  openPendingDetailModal,
} from './modals.js';

export function mountAdminView(root, { api, profile, onSwitchAccount, toast }) {
  let activeView = 'overview';
  let locations = [];
  let page = 1;
  let totalPages = 1;
  let activityCursor = null;
  let reviewCursor = null;
  let summaryCache = null;
  let mapPointsCache = [];
  let mapLayerMode = 'both';
  let mapBasemap = 'light';

  root.innerHTML = `
    <div class="studio-shell" data-experience="admin">
      <!-- BARRA EDITORIAL SUPERIOR DE MANDO (INSPIRADA EN SPIINOFF + EDSPORTLINE) -->
      <header class="studio-header">
        <div class="studio-header-inner">
          <button type="button" class="studio-brand" id="studio-brand-home">
            <span class="wordmark-dot"></span>
            <strong>COMMUNITY 360</strong>
            <em>ESTUDIO</em>
          </button>

          <nav class="studio-nav" id="admin-nav" aria-label="Navegación operativa">
            <button type="button" data-view="overview" class="active">CONTROL</button>
            <button type="button" data-view="users">MIEMBROS</button>
            <button type="button" data-view="activity">ACTIVIDAD</button>
            <button type="button" data-view="map">MAPA</button>
            <button type="button" data-view="review">REVISIÓN</button>
            <button type="button" data-view="accounts">ACCESOS</button>
          </nav>

          <div class="studio-actions">
            <span class="live-pill dark-live connecting" id="admin-live-status" title="Estado de actualización en vivo">
              <i class="live-dot"></i><span>Conectando</span>
            </span>
            <div class="studio-user-chip">
              ${avatarHtml(profile.username, 'xs')}
              <span>${escapeHtml(profile.username)}</span>
            </div>
            <button type="button" class="btn btn-studio-ghost btn-sm" id="admin-change-pwd">Clave</button>
            <button type="button" class="btn btn-gold btn-sm" id="admin-top-switch">Cambiar de cuenta</button>
          </div>
        </div>
      </header>

      <main class="studio-main">
        <!-- VISTA 1: CONTROL (SWISS BROADCAST GRID) -->
        <section class="view-section" id="admin-view-overview">
          <div class="studio-hero-grid">
            <div class="studio-hero-statement">
              <div class="studio-hero-bg" aria-hidden="true"></div>
              <div class="studio-hero-content">
                <div class="studio-kicker-row">
                  <span class="studio-index">01 / CENTRO DE MANDO</span>
                  <span class="studio-role-tag">ADMINISTRADOR</span>
                </div>
                <h1>
                  El control real de la comunidad,<br>
                  <span>medido en vivo.</span>
                </h1>
                <div class="studio-plus-note">
                  <span class="gold-plus">+</span>
                  <p>
                    Cada publicación, reacción o cambio de perfil se refleja al instante en los indicadores y en el mapa interactivo con privacidad garantizada.
                  </p>
                </div>
                <div class="studio-hero-shortcuts">
                  <button type="button" class="btn btn-gold btn-sm" data-admin-jump="map">Abrir mapa interactivo</button>
                  <button type="button" class="btn btn-studio-outline btn-sm" data-admin-jump="users">Gestionar miembros</button>
                  <button type="button" class="btn btn-studio-outline btn-sm" data-admin-jump="activity">Ver pulso en vivo</button>
                </div>
              </div>
            </div>

            <div class="studio-kpi-matrix" id="admin-kpis">
              <article class="studio-kpi-cell">
                <div class="studio-kpi-meta">
                  <span>01 · MIEMBROS</span>
                  <em id="kpi-active-pct">—</em>
                </div>
                <strong id="kpi-total">—</strong>
                <p id="kpi-total-sub">Cargando comunidad…</p>
              </article>

              <article class="studio-kpi-cell">
                <div class="studio-kpi-meta">
                  <span>02 · ACTIVOS</span>
                  <em class="emerald">VIGENTES</em>
                </div>
                <strong id="kpi-active">—</strong>
                <p id="kpi-active-sub">Participación reciente</p>
              </article>

              <article class="studio-kpi-cell accent-cell" id="kpi-activity-card">
                <div class="studio-kpi-meta">
                  <span>03 · ACTIVIDAD EN VIVO</span>
                  <em id="kpi-act-tag">CANALES</em>
                </div>
                <strong id="kpi-activity">—</strong>
                <p id="kpi-activity-sub">Publicaciones y reacciones</p>
              </article>

              <article class="studio-kpi-cell" id="kpi-sentiment-card">
                <div class="studio-kpi-meta">
                  <span>04 · ÁNIMO DINÁMICO</span>
                  <em id="kpi-sent-badge">—</em>
                </div>
                <strong id="kpi-sentiment">—</strong>
                <p id="kpi-sent-sub">Escala −1 a +1</p>
              </article>
            </div>
          </div>

          <!-- CINTA DORADA ANIMADA CON MÉTRICAS REALES EN VIVO -->
          <div class="pulse-strip">
            <span class="pulse-strip-label">Pulso de hoy</span>
            <div class="pulse-chips" id="admin-marquee-track">
              <span class="pulse-chip static">Sincronizando datos de la comunidad…</span>
            </div>
          </div>

          <!-- BANDA SECUNDARIA SWISS HAIRLINE -->
          <div class="studio-strip-grid" id="admin-secondary-strip"></div>

          <!-- ESCENARIO OSCURO DE GRÁFICAS (BARRAS + DONAS) -->
          <div class="studio-chart-grid">
            <article class="studio-panel" id="admin-channel-card">
              <div class="studio-panel-head">
                <div>
                  <span class="studio-panel-num">A1</span>
                  <h2>Canales de actividad</h2>
                  <p>Participación por canal actualizada al instante</p>
                </div>
              </div>
              <div class="chart-box tall" id="admin-channel-wrap"><canvas id="admin-channel-chart"></canvas></div>
            </article>

            <article class="studio-panel">
              <div class="studio-panel-head">
                <div>
                  <span class="studio-panel-num">A2</span>
                  <h2>Ánimo por país</h2>
                  <p>Calculado exclusivamente con ubicaciones autorizadas</p>
                </div>
              </div>
              <div class="chart-box tall"><canvas id="admin-country-chart"></canvas></div>
            </article>

            <article class="studio-panel">
              <div class="studio-panel-head">
                <div>
                  <span class="studio-panel-num">B1</span>
                  <h2>Estado de los miembros</h2>
                  <p>Activos, en riesgo e inactivos</p>
                </div>
              </div>
              <div class="chart-box"><canvas id="admin-status-chart"></canvas></div>
            </article>

            <article class="studio-panel">
              <div class="studio-panel-head">
                <div>
                  <span class="studio-panel-num">B2</span>
                  <h2>Privacidad y consentimiento</h2>
                  <p>Ubicación autorizada frente a protegida</p>
                </div>
              </div>
              <div class="chart-box"><canvas id="admin-consent-chart"></canvas></div>
            </article>
          </div>
        </section>

        <!-- VISTA 2: DIRECTORIO DE MIEMBROS -->
        <section class="view-section hidden" id="admin-view-users">
          <div class="studio-section-banner">
            <div>
              <span class="studio-index">02 / DIRECTORIO</span>
              <h1>Miembros de la comunidad</h1>
              <p>Filtra segmentos, consulta historiales individuales y administra altas o actualizaciones.</p>
            </div>
            <div class="action-row">
              <button type="button" class="btn btn-studio-outline btn-sm" id="admin-export-csv">Exportar CSV</button>
              <button type="button" class="btn btn-gold btn-sm" id="admin-new-member">+ Nuevo miembro</button>
            </div>
          </div>

          <div class="studio-paper-sheet">
            <div class="filter-bar">
              <div class="filter-search">
                <input id="admin-user-search" type="search" placeholder="Buscar por alias o ID de miembro…">
              </div>
              <div class="filter-group">
                <select id="admin-filter-status">
                  <option value="">Todos los estados</option>
                  <option value="activo">Activo</option>
                  <option value="en_riesgo">En riesgo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
                <select id="admin-filter-platform">
                  <option value="">Todas las plataformas</option>
                  <option>Discord</option>
                  <option>Facebook</option>
                  <option>Instagram</option>
                  <option>Telegram</option>
                  <option>TikTok</option>
                  <option>Twitter/X</option>
                </select>
                <select id="admin-filter-age">
                  <option value="">Todas las edades</option>
                  <option>18-24</option>
                  <option>25-31</option>
                  <option>32-38</option>
                  <option>39+</option>
                </select>
                <select id="admin-filter-artist">
                  <option value="">Artista: todos</option>
                  <option value="1">Sí, es artista</option>
                  <option value="0">No es artista</option>
                </select>
                <select id="admin-filter-consent">
                  <option value="">Ubicación: todas</option>
                  <option value="si">Autorizada</option>
                  <option value="no">Protegida</option>
                </select>
                <select id="admin-filter-country">
                  <option value="">Todos los países</option>
                </select>
                <button type="button" class="btn btn-subtle btn-sm" id="admin-clear-filters">Limpiar</button>
              </div>
            </div>

            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Miembro</th>
                    <th>Plataforma</th>
                    <th>Interés</th>
                    <th>Estado</th>
                    <th>Ubicación</th>
                    <th>Última actividad</th>
                    <th class="col-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody id="admin-users-tbody"></tbody>
              </table>
            </div>

            <div class="table-footer">
              <span id="admin-users-count">—</span>
              <div class="action-row">
                <button type="button" class="btn btn-outline btn-sm" id="admin-prev-page">Anterior</button>
                <button type="button" class="btn btn-outline btn-sm" id="admin-next-page">Siguiente</button>
              </div>
            </div>
          </div>
        </section>

        <!-- VISTA 3: ACTIVIDAD EN VIVO (SIN BOTONES DE ALTA/EDICIÓN/BORRADO EN UI) -->
        <section class="view-section hidden" id="admin-view-activity">
          <div class="studio-section-banner">
            <div>
              <span class="studio-index">03 / FLUJO EN TIEMPO REAL</span>
              <h1>Actividad de la comunidad</h1>
              <p>Publicaciones, comentarios y reacciones sincronizados al instante sin recargar la pantalla.</p>
            </div>
            <span class="pill pill-success">Actualización automática en vivo</span>
          </div>

          <div class="studio-paper-sheet">
            <div class="filter-bar">
              <div class="filter-group">
                <input id="admin-act-user" placeholder="ID de miembro (ej. U000001)">
                <select id="admin-act-channel">
                  <option value="">Todos los canales</option>
                  <option>Discord</option>
                  <option>Instagram</option>
                  <option>Twitter/X</option>
                  <option>Telegram</option>
                  <option>TikTok</option>
                  <option>Facebook</option>
                </select>
                <select id="admin-act-type">
                  <option value="">Todos los tipos</option>
                  <option value="publicacion">Publicación</option>
                  <option value="comentario">Comentario</option>
                  <option value="mensaje">Mensaje</option>
                  <option value="reaccion">Reacción</option>
                </select>
                <button type="button" class="btn btn-primary btn-sm" id="admin-act-search">Aplicar filtros</button>
              </div>
            </div>

            <div id="admin-activity-list" class="activity-stream"></div>

            <div class="table-footer">
              <span id="admin-activity-meta"></span>
              <button type="button" class="btn btn-outline btn-sm" id="admin-more-activity" disabled>Cargar más</button>
            </div>
          </div>
        </section>

        <!-- VISTA 4: MAPA REAL INTERACTIVO (SATÉLITE / CALLES / NOCTURNO + HEATMAP + FLYTO) -->
        <section class="view-section hidden" id="admin-view-map">
          <div class="studio-section-banner">
            <div>
              <span class="studio-index">04 / ATLAS INTERACTIVO</span>
              <h1>Mapa real y densidad de calor</h1>
              <p>Arrastra, haz zoom con la rueda, cambia a vista satelital o haz clic en cualquier región para volar hacia ella.</p>
            </div>
            <div class="action-row">
              <div class="map-mode-toggle dark-toggle" id="admin-basemap-mode">
                <button type="button" data-basemap="light" class="active">Claro</button>
                <button type="button" data-basemap="satellite">Satélite</button>
                <button type="button" data-basemap="streets">Calles</button>
                <button type="button" data-basemap="topo">Relieve</button>
              </div>
              <div class="map-mode-toggle dark-toggle" id="admin-map-mode">
                <button type="button" data-mode="heat">Calor</button>
                <button type="button" data-mode="both" class="active">Combinado</button>
                <button type="button" data-mode="markers">Marcadores</button>
              </div>
              <button type="button" class="btn btn-gold btn-sm" id="admin-map-reset">Vista global</button>
            </div>
          </div>

          <div class="studio-map-workspace">
            <div class="studio-map-stage">
              <div id="admin-privacy-banner" class="studio-privacy-strip">Verificando protección de ubicaciones…</div>
              <div id="admin-map-canvas" class="map-canvas studio-map-canvas"></div>
              <div class="studio-map-footer">
                <div class="map-legend dark-legend">
                  <span><i class="dot emerald"></i> Activo</span>
                  <span><i class="dot amber"></i> En riesgo</span>
                  <span><i class="dot rose"></i> Inactivo</span>
                  <span class="heat-legend-bar"><i class="heat-swatch"></i> Densidad de calor</span>
                </div>
                <span class="map-tip">Tip: arrastra para recorrer el planeta · doble clic o scroll para acercar</span>
              </div>
            </div>

            <aside class="studio-map-rail">
              <div class="rail-head">
                <h3>Volar a región</h3>
                <p>Selecciona un destino autorizado</p>
              </div>
              <div id="admin-map-summary" class="studio-geo-list">
                <div class="empty-state compact">Cargando ubicaciones…</div>
              </div>
            </aside>
          </div>
        </section>

        <!-- VISTA 5: REVISIÓN E HISTORIAL -->
        <section class="view-section hidden" id="admin-view-review">
          <div class="studio-section-banner">
            <div>
              <span class="studio-index">05 / CONTROL DE CALIDAD</span>
              <h1>Revisión e historial de importaciones</h1>
              <p>Asocia actividad pendiente con miembros vigentes y consulta las actualizaciones integradas.</p>
            </div>
            <button type="button" class="btn btn-gold btn-sm" id="admin-reload-review">Actualizar</button>
          </div>

          <div class="review-split-grid">
            <article class="studio-paper-sheet">
              <div class="card-head">
                <div>
                  <h2>Registros por revisar</h2>
                  <p>Actividad pendiente de vincular con un perfil vigente</p>
                </div>
              </div>
              <div id="admin-pending-list" class="activity-stream"></div>
              <div class="table-footer">
                <span id="admin-pending-meta"></span>
                <button type="button" class="btn btn-outline btn-sm" id="admin-more-pending" disabled>Cargar más</button>
              </div>
            </article>

            <article class="studio-paper-sheet">
              <div class="card-head">
                <div>
                  <h2>Historial de importaciones</h2>
                  <p>Seguimiento de calidad y actualización de la comunidad</p>
                </div>
              </div>
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Sección</th>
                      <th>Recibidos</th>
                      <th>Integrados</th>
                      <th>Pendientes</th>
                    </tr>
                  </thead>
                  <tbody id="admin-imports-tbody"></tbody>
                </table>
              </div>
            </article>
          </div>
        </section>

        <!-- VISTA 6: CUENTAS DE ACCESO -->
        <section class="view-section hidden" id="admin-view-accounts">
          <div class="studio-section-banner">
            <div>
              <span class="studio-index">06 / EQUIPO Y PERMISOS</span>
              <h1>Cuentas de acceso</h1>
              <p>Administra perfiles de administradores y analistas del equipo.</p>
            </div>
            <button type="button" class="btn btn-gold btn-sm" id="admin-new-account">+ Nueva cuenta</button>
          </div>

          <div class="studio-paper-sheet">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Correo</th>
                    <th>Perfil</th>
                    <th>Estado</th>
                    <th class="col-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody id="admin-accounts-tbody"></tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);

  function flashElement(el) {
    if (!el) return;
    el.classList.remove('live-flash');
    void el.offsetWidth;
    el.classList.add('live-flash');
  }

  function renderActivityCard(item, isLiveNew = false) {
    const sent = formatSentiment(item.sentimiento);
    return `
      <article class="activity-card ${isLiveNew ? 'live-flash' : ''}" data-activity-id="${escapeHtml(item.id_interaccion)}">
        <div class="activity-card-head">
          <div class="activity-badges">
            <strong>${escapeHtml(item.canal || 'Canal')}</strong>
            ${activityTypeBadge(item.tipo)}
            <span class="pill pill-${sent.tone}">Ánimo ${escapeHtml(sent.score)}</span>
            ${isLiveNew ? '<span class="pill pill-success">En vivo</span>' : ''}
          </div>
          <time>${escapeHtml(formatDateTime(item.timestamp))}</time>
        </div>
        ${item.texto ? `<p class="activity-body">${escapeHtml(item.texto)}</p>` : ''}
        <div class="activity-footer">
          <span>Miembro <b>${escapeHtml(item.id_usuario)}</b> · Tema: <b>${escapeHtml(item.tema || 'General')}</b> · Reacciones: <b>${formatNumber(item.reacciones_recibidas ?? 0)}</b></span>
          <div class="chip-row">
            ${(item.etiquetas || []).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}
            <span class="tag-chip privacy">${item.ubicacion_autorizada ? 'Ubicación autorizada' : 'Ubicación protegida'}</span>
          </div>
        </div>
      </article>
    `;
  }

  function switchView(view) {
    activeView = view;
    root.querySelectorAll('#admin-nav button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    root.querySelectorAll('.view-section').forEach((sec) => {
      sec.classList.toggle('hidden', sec.id !== `admin-view-${view}`);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (view === 'overview') loadOverview();
    if (view === 'users') loadUsers();
    if (view === 'activity') {
      activityCursor = null;
      loadActivity(true);
    }
    if (view === 'map') loadMap();
    if (view === 'review') {
      reviewCursor = null;
      loadReviewSection(true);
    }
    if (view === 'accounts') loadAccounts();
  }

  $('#admin-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    switchView(btn.dataset.view);
  });
  $('#studio-brand-home').addEventListener('click', () => switchView('overview'));
  root.querySelectorAll('[data-admin-jump]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.adminJump));
  });

  $('#admin-map-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    mapLayerMode = btn.dataset.mode;
    root.querySelectorAll('#admin-map-mode button').forEach((b) => b.classList.toggle('active', b === btn));
    setMapLayerMode(mapLayerMode);
  });

  $('#admin-basemap-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-basemap]');
    if (!btn) return;
    mapBasemap = btn.dataset.basemap;
    root.querySelectorAll('#admin-basemap-mode button').forEach((b) => b.classList.toggle('active', b === btn));
    setMapBasemap(mapBasemap);
  });

  $('#admin-map-reset').addEventListener('click', () => resetMapBounds());
  $('#admin-top-switch').addEventListener('click', onSwitchAccount);
  $('#admin-change-pwd').addEventListener('click', () => openChangePasswordModal({ api, toast }));

  async function loadCatalogs() {
    try {
      locations = await api('/api/catalogos/ubicaciones');
      const sel = $('#admin-filter-country');
      sel.innerHTML =
        '<option value="">Todos los países</option>' +
        locations.map((p) => `<option value="${p.pais_id}">${escapeHtml(p.nombre)}</option>`).join('');
    } catch {}
  }

  function updateMarquee(d) {
    const track = $('#admin-marquee-track');
    if (!track) return;
    const sent = formatSentiment(
      d.actividad_disponible && d.sentimiento_interacciones_promedio !== null
        ? d.sentimiento_interacciones_promedio
        : d.sentimiento_promedio
    );
    const topChannel = d.canales?.[0];
    const items = [
      `${formatNumber(d.total_usuarios)} MIEMBROS REGISTRADOS`,
      `${formatNumber(d.activos)} ACTIVOS HOY`,
      d.actividad_disponible && d.total_interacciones_validas !== null
        ? `${formatNumber(d.total_interacciones_validas)} ACTIVIDADES EN VIVO`
        : 'SINCRONIZACIÓN EN VIVO ACTIVA',
      `ÁNIMO PROMEDIO ${sent.score} (${sent.label.toUpperCase()})`,
      topChannel ? `CANAL LÍDER: ${topChannel.canal.toUpperCase()} ${topChannel.tasa_participacion}%` : 'CANALES ACTIVOS',
      `${formatNumber(d.consentimiento_si)} UBICACIONES EN MAPA · ${formatNumber(d.consentimiento_no)} PROTEGIDOS`,
    ];
    const views = ['users', 'users', 'activity', 'overview', 'activity', 'map'];
    track.innerHTML = items
      .map(
        (t, i) =>
          `<button type="button" class="pulse-chip" data-admin-jump="${views[i] || 'overview'}" title="Ir a esta sección">${escapeHtml(t)}<em>→</em></button>`
      )
      .join('');
  }

  function applySummaryToOverview(d, highlightLive = false) {
    summaryCache = d;
    const total = Number(d.total_usuarios || 0);
    const active = Number(d.activos || 0);
    const atRisk = Number(d.en_riesgo || 0);
    const inactive = Number(d.inactivos || 0);
    const consentSi = Number(d.consentimiento_si || 0);
    const consentNo = Number(d.consentimiento_no || 0);
    const artists = Number(d.artistas || 0);

    const activeSentimentRaw =
      d.actividad_disponible && d.sentimiento_interacciones_promedio !== null
        ? d.sentimiento_interacciones_promedio
        : d.sentimiento_promedio;
    const sent = formatSentiment(activeSentimentRaw);

    $('#kpi-total').textContent = formatNumber(total);
    $('#kpi-active-pct').textContent = `${formatPercent(active, total)} ACTIVOS`;
    $('#kpi-total-sub').textContent = `${formatNumber(artists)} creadores · ${formatPercent(consentSi, total)} con ubicación autorizada`;

    $('#kpi-active').textContent = formatNumber(active);
    $('#kpi-active-sub').textContent = `${formatNumber(atRisk)} en riesgo · ${formatNumber(inactive)} inactivos`;

    if (d.actividad_disponible && d.total_interacciones_validas !== null) {
      $('#kpi-activity').textContent = formatNumber(d.total_interacciones_validas);
      $('#kpi-act-tag').textContent = `${(d.canales || []).length} CANALES`;
      const avgReact = d.promedio_reacciones !== null ? Number(d.promedio_reacciones).toFixed(2) : '0.00';
      $('#kpi-activity-sub').textContent = `Promedio de ${avgReact} reacciones · ${formatNumber(d.total_en_cuarentena ?? 0)} por revisar`;
    } else {
      $('#kpi-activity').textContent = 'En pausa';
      $('#kpi-act-tag').textContent = 'SIN CONEXIÓN';
      $('#kpi-activity-sub').textContent = 'Servicio de actividad temporalmente sin respuesta';
    }

    $('#kpi-sentiment').textContent = sent.score;
    $('#kpi-sent-badge').textContent = sent.label.toUpperCase();
    $('#kpi-sent-sub').textContent =
      d.actividad_disponible && d.tasa_positividad_actividad !== null
        ? `${d.tasa_positividad_actividad}% de actividad con tono positivo`
        : 'Promedio general de comunidad';

    updateMarquee(d);

    const topChannel = d.canales?.[0];
    const topInterest = d.top_intereses?.[0];
    const topCountry = d.por_pais?.[0];
    const avgReactText =
      d.actividad_disponible && d.promedio_reacciones !== null ? Number(d.promedio_reacciones).toFixed(2) : '—';

    $('#admin-secondary-strip').innerHTML = `
      <div class="studio-strip-cell">
        <span>CANAL CON MAYOR PARTICIPACIÓN</span>
        <strong>${escapeHtml(topChannel?.canal || d.plataformas?.[0]?.nombre || '—')}</strong>
        <small>${topChannel ? `${topChannel.tasa_participacion}% del total (${formatNumber(topChannel.total)})` : `${formatNumber(d.plataformas?.[0]?.total)} miembros`}</small>
      </div>
      <div class="studio-strip-cell">
        <span>PROMEDIO DE REACCIONES</span>
        <strong>${escapeHtml(avgReactText)}</strong>
        <small>${d.total_reacciones !== null ? `${formatNumber(d.total_reacciones)} reacciones acumuladas` : 'Por publicación'}</small>
      </div>
      <div class="studio-strip-cell">
        <span>INTERÉS PRINCIPAL</span>
        <strong>${escapeHtml(topInterest?.nombre || '—')}</strong>
        <small>${formatNumber(topInterest?.total)} miembros · líder ${escapeHtml(topCountry?.pais || '—')}</small>
      </div>
      <div class="studio-strip-cell">
        <span>PRIVACIDAD PROTEGIDA</span>
        <strong>${formatNumber(consentNo)}</strong>
        <small>Excluidos automáticamente de los mapas</small>
      </div>
    `;

    if (highlightLive) {
      flashElement($('#kpi-activity-card'));
      flashElement($('#kpi-sentiment-card'));
      flashElement($('#admin-channel-card'));
    }

    renderChart(
      'admin-status-chart',
      buildDoughnutConfig({
        labels: ['Activos', 'En riesgo', 'Inactivos'],
        data: [active, atRisk, inactive],
        colors: ['#16a37a', '#f2a900', '#e5566d'],
      })
    );

    const channelWrap = $('#admin-channel-wrap');
    if (d.actividad_disponible && (d.canales || []).length) {
      channelWrap.innerHTML = '<canvas id="admin-channel-chart"></canvas>';
      renderChart(
        'admin-channel-chart',
        buildBarConfig({
          labels: d.canales.map((x) => `${x.canal} (${x.tasa_participacion}%)`),
          data: d.canales.map((x) => x.total),
          color: '#ee6c4d',
          valueSuffix: ' registros',
        })
      );
    } else {
      channelWrap.innerHTML = `<div class="empty-state">${
        d.actividad_disponible
          ? 'Aún no hay actividad registrada por canal.'
          : 'La actividad por canales no está disponible temporalmente.'
      }</div>`;
    }

    renderChart(
      'admin-consent-chart',
      buildDoughnutConfig({
        labels: ['Ubicación autorizada', 'Ubicación protegida'],
        data: [consentSi, consentNo],
        colors: ['#0f5e6b', '#d9d2c5'],
      })
    );

    const countries = (d.por_pais || []).slice(0, 8);
    renderChart(
      'admin-country-chart',
      buildBarConfig({
        labels: countries.map((x) => x.pais),
        data: countries.map((x) => Number(Number(x.sentimiento_promedio || 0).toFixed(2))),
        color: '#0f5e6b',
        yFormat: (v) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}`,
      })
    );
  }

  async function loadOverview() {
    try {
      const d = await api('/api/analytics/resumen');
      applySummaryToOverview(d, false);
    } catch (err) {
      toast(err.message, true);
    }
  }

  function buildUserParams(includePage = true) {
    const q = new URLSearchParams();
    if (includePage) {
      q.set('page', String(page));
      q.set('limit', '20');
    }
    const search = $('#admin-user-search').value.trim();
    if (search) q.set('q', search);
    if ($('#admin-filter-status').value) q.set('estatus', $('#admin-filter-status').value);
    if ($('#admin-filter-platform').value) q.set('plataforma_principal', $('#admin-filter-platform').value);
    if ($('#admin-filter-age').value) q.set('rango_edad', $('#admin-filter-age').value);
    if ($('#admin-filter-artist').value !== '') q.set('es_artista', $('#admin-filter-artist').value);
    if ($('#admin-filter-consent').value) q.set('consentimiento_datos', $('#admin-filter-consent').value);
    if ($('#admin-filter-country').value) q.set('pais_id', $('#admin-filter-country').value);
    return q;
  }

  async function loadUsers() {
    const tbody = $('#admin-users-tbody');
    tbody.innerHTML = '<tr><td colspan="7"><div class="loading-row">Cargando miembros de la comunidad…</div></td></tr>';
    try {
      const data = await api(`/api/usuarios?${buildUserParams(true)}`);
      totalPages = Math.max(1, data.totalPages || 1);
      $('#admin-users-count').textContent = `${formatNumber(data.total)} miembros · Página ${data.page} de ${totalPages}`;
      $('#admin-prev-page').disabled = page <= 1;
      $('#admin-next-page').disabled = page >= totalPages;

      if (!data.items.length) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state compact">No hay miembros que coincidan con estos filtros.</div></td></tr>';
        return;
      }

      tbody.innerHTML = data.items
        .map(
          (u) => `
            <tr>
              <td>
                <div class="member-cell">
                  ${avatarHtml(u.alias, 'sm')}
                  <div>
                    <strong>${escapeHtml(u.alias)}</strong>
                    <small>${escapeHtml(u.id_usuario)}${Number(u.es_artista) === 1 ? ' · Artista' : ''}</small>
                  </div>
                </div>
              </td>
              <td><span class="platform-tag">${escapeHtml(u.plataforma_principal)}</span></td>
              <td>${escapeHtml(u.interes_principal || '—')}</td>
              <td>${statusBadge(u.estatus)}</td>
              <td><span class="consent-label ${u.consentimiento_datos === 'si' ? 'yes' : 'no'}">${escapeHtml(formatConsent(u.consentimiento_datos))}</span></td>
              <td>${escapeHtml(formatDate(u.ultima_actividad))}</td>
              <td class="col-actions">
                <div class="row-actions">
                  <button type="button" class="btn btn-subtle btn-xs row-view" data-id="${escapeHtml(u.id_usuario)}">Perfil</button>
                  <button type="button" class="btn btn-outline btn-xs row-edit" data-id="${escapeHtml(u.id_usuario)}">Editar</button>
                  <button type="button" class="btn btn-danger-ghost btn-xs row-delete" data-id="${escapeHtml(u.id_usuario)}" data-alias="${escapeHtml(u.alias)}">Eliminar</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state compact">No fue posible cargar el directorio.</div></td></tr>';
      toast(err.message, true);
    }
  }

  let searchTimer;
  const resetAndLoadUsers = () => {
    page = 1;
    loadUsers();
  };
  $('#admin-user-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(resetAndLoadUsers, 260);
  });
  [
    '#admin-filter-status',
    '#admin-filter-platform',
    '#admin-filter-age',
    '#admin-filter-artist',
    '#admin-filter-consent',
    '#admin-filter-country',
  ].forEach((sel) => $(sel).addEventListener('change', resetAndLoadUsers));

  $('#admin-clear-filters').addEventListener('click', () => {
    $('#admin-user-search').value = '';
    [
      '#admin-filter-status',
      '#admin-filter-platform',
      '#admin-filter-age',
      '#admin-filter-artist',
      '#admin-filter-consent',
      '#admin-filter-country',
    ].forEach((sel) => ($(sel).value = ''));
    resetAndLoadUsers();
  });

  $('#admin-prev-page').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadUsers();
    }
  });
  $('#admin-next-page').addEventListener('click', () => {
    if (page < totalPages) {
      page++;
      loadUsers();
    }
  });

  $('#admin-new-member').addEventListener('click', () =>
    openMemberFormModal({
      api,
      locations,
      toast,
      onSaved: () => {
        loadUsers();
        summaryCache = null;
      },
    })
  );

  $('#admin-export-csv').addEventListener('click', async () => {
    try {
      const csv = await api(`/api/usuarios/export/csv?${buildUserParams(false)}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'community360-miembros.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Listado exportado en formato CSV.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  $('#admin-users-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('row-view')) {
      try {
        const detail = await api(`/api/usuarios/${encodeURIComponent(id)}`);
        openMemberDetailModal(detail, {
          isAdmin: true,
          onEdit: (editId) => openMemberFormModal({ id: editId, api, locations, toast, onSaved: loadUsers }),
        });
      } catch (err) {
        toast(err.message, true);
      }
    } else if (btn.classList.contains('row-edit')) {
      openMemberFormModal({ id, api, locations, toast, onSaved: loadUsers });
    } else if (btn.classList.contains('row-delete')) {
      const alias = btn.dataset.alias || id;
      if (!confirm(`¿Seguro que deseas eliminar a ${alias} (${id})?`)) return;
      try {
        await api(`/api/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
        toast('Miembro eliminado del directorio.');
        loadUsers();
      } catch (err) {
        if (
          err.message.toLowerCase().includes('actividad') &&
          confirm(`${err.message}\n\n¿Deseas continuar y mover su actividad a Registros por revisar?`)
        ) {
          try {
            await api(`/api/usuarios/${encodeURIComponent(id)}?cascade=quarantine`, { method: 'DELETE' });
            toast('Miembro eliminado y actividad respaldada en Revisión.');
            loadUsers();
          } catch (ex) {
            toast(ex.message, true);
          }
        } else {
          toast(err.message, true);
        }
      }
    }
  });

  async function loadActivity(reset = false) {
    const list = $('#admin-activity-list');
    if (reset) list.innerHTML = '<div class="loading-row">Cargando actividad de la comunidad…</div>';
    try {
      const q = new URLSearchParams({ limit: '20' });
      const uid = $('#admin-act-user').value.trim();
      const ch = $('#admin-act-channel').value;
      const type = $('#admin-act-type').value;
      if (uid) q.set('id_usuario', uid);
      if (ch) q.set('canal', ch);
      if (type) q.set('tipo', type);
      if (!reset && activityCursor) q.set('cursor', activityCursor);

      const data = await api(`/api/interacciones?${q}`);
      if (reset) list.innerHTML = '';
      activityCursor = data.nextCursor;
      $('#admin-more-activity').disabled = !activityCursor;

      const html = (data.items || []).map((item) => renderActivityCard(item, false)).join('');
      if (html) list.insertAdjacentHTML('beforeend', html);
      else if (reset) list.innerHTML = '<div class="empty-state">No se encontró actividad con estos filtros.</div>';
      $('#admin-activity-meta').textContent = `${formatNumber(list.querySelectorAll('.activity-card').length)} actividades mostradas`;
    } catch (err) {
      if (reset) list.innerHTML = `<div class="inline-notice warning">${escapeHtml(err.message)}</div>`;
      $('#admin-more-activity').disabled = true;
      toast(err.message, true);
    }
  }

  $('#admin-act-search').addEventListener('click', () => {
    activityCursor = null;
    loadActivity(true);
  });
  $('#admin-more-activity').addEventListener('click', () => {
    if (activityCursor) loadActivity(false);
  });

  function buildCityCentroids(points) {
    const map = new Map();
    for (const p of points) {
      if (p.latitud == null || p.longitud == null) continue;
      const key = `${p.ciudad}|${p.pais}`;
      if (!map.has(key)) map.set(key, { ciudad: p.ciudad, pais: p.pais, latSum: 0, lngSum: 0, count: 0, sentSum: 0 });
      const entry = map.get(key);
      entry.latSum += Number(p.latitud);
      entry.lngSum += Number(p.longitud);
      entry.sentSum += Number(p.sentimiento_promedio || 0);
      entry.count += 1;
    }
    return [...map.values()]
      .map((c) => ({
        ciudad: c.ciudad,
        pais: c.pais,
        lat: c.latSum / c.count,
        lng: c.lngSum / c.count,
        usuarios: c.count,
        sentimiento: c.sentSum / c.count,
      }))
      .sort((a, b) => b.usuarios - a.usuarios);
  }

  async function loadMap() {
    const banner = $('#admin-privacy-banner');
    const summaryEl = $('#admin-map-summary');
    banner.textContent = 'Consultando ubicaciones autorizadas…';
    try {
      const [points, protectedRes] = await Promise.all([
        api('/api/analytics/mapa'),
        api('/api/usuarios?consentimiento_datos=no&limit=1'),
      ]);
      mapPointsCache = points || [];

      banner.innerHTML = `<strong>${formatNumber(protectedRes.total)} miembros protegidos</strong> excluidos por privacidad · <b>${formatNumber(mapPointsCache.length)}</b> ubicaciones reales autorizadas en el mapa.`;
      renderCommunityMap('admin-map-canvas', mapPointsCache, { theme: mapBasemap, mode: mapLayerMode });

      const cities = buildCityCentroids(mapPointsCache).slice(0, 12);
      summaryEl.innerHTML = cities.length
        ? cities
            .map((c) => {
              const s = formatSentiment(c.sentimiento);
              return `
                <button type="button" class="geo-fly-item" data-lat="${c.lat}" data-lng="${c.lng}">
                  <div>
                    <strong>${escapeHtml(c.ciudad)}</strong>
                    <small>${escapeHtml(c.pais)} · ${formatNumber(c.usuarios)} miembros</small>
                  </div>
                  <span class="pill pill-${s.tone}">${escapeHtml(s.score)}</span>
                </button>
              `;
            })
            .join('')
        : '<div class="empty-state compact">Sin ubicaciones autorizadas.</div>';
    } catch (err) {
      banner.textContent = 'No fue posible cargar el mapa en este momento.';
      toast(err.message, true);
    }
  }

  $('#admin-map-summary').addEventListener('click', (e) => {
    const btn = e.target.closest('.geo-fly-item');
    if (!btn) return;
    flyToLocation(btn.dataset.lat, btn.dataset.lng, 10);
  });

  async function loadReviewSection(reset = true) {
    const pendingList = $('#admin-pending-list');
    const importsBody = $('#admin-imports-tbody');
    if (reset) {
      reviewCursor = null;
      pendingList.innerHTML = '<div class="loading-row">Cargando registros por revisar…</div>';
      importsBody.innerHTML = '<tr><td colspan="5"><div class="loading-row">Cargando historial de importaciones…</div></td></tr>';
    }

    const pendingUrl = `/api/cuarentena?limit=20${!reset && reviewCursor ? `&cursor=${encodeURIComponent(reviewCursor)}` : ''}`;
    const tasks = [api(pendingUrl)];
    if (reset) tasks.push(api('/api/bitacora'));

    const results = await Promise.allSettled(tasks);
    const pendingRes = results[0];
    const importsRes = reset ? results[1] : null;

    if (pendingRes.status === 'fulfilled') {
      const q = pendingRes.value;
      if (reset) pendingList.innerHTML = '';
      reviewCursor = q.nextCursor;
      $('#admin-more-pending').disabled = !reviewCursor;
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
              <p class="activity-sub">Miembro referenciado: <b>${escapeHtml(item.id_usuario_referenciado || 'Desconocido')}</b></p>
              <div class="action-row" style="margin-top:10px">
                <button type="button" class="btn btn-subtle btn-xs pending-inspect" data-id="${escapeHtml(item.id_interaccion)}">Ver detalle</button>
                <button type="button" class="btn btn-primary btn-xs pending-link" data-id="${escapeHtml(item.id_interaccion)}" data-uid="${escapeHtml(item.id_usuario_referenciado || '')}">Vincular a miembro</button>
              </div>
            </article>
          `
        )
        .join('');
      if (html) pendingList.insertAdjacentHTML('beforeend', html);
      else if (reset) pendingList.innerHTML = '<div class="empty-state compact">No hay registros pendientes por revisar.</div>';
      $('#admin-pending-meta').textContent = `${pendingList.querySelectorAll('.activity-card').length} registros mostrados`;
    } else {
      if (reset) {
        pendingList.innerHTML = `<div class="inline-notice warning">${escapeHtml(pendingRes.reason?.message || 'No fue posible consultar los registros pendientes.')}</div>`;
      }
      $('#admin-more-pending').disabled = true;
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
          : '<tr><td colspan="5"><div class="empty-state compact">Aún no hay importaciones registradas.</div></td></tr>';
      } else {
        importsBody.innerHTML = `<tr><td colspan="5"><div class="inline-notice warning">${escapeHtml(importsRes.reason?.message || 'No se pudo cargar el historial.')}</div></td></tr>`;
      }
    }
  }

  $('#admin-reload-review').addEventListener('click', () => loadReviewSection(true));
  $('#admin-more-pending').addEventListener('click', () => {
    if (reviewCursor) loadReviewSection(false);
  });

  $('#admin-pending-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('pending-inspect')) {
      try {
        const res = await api(`/api/cuarentena/${encodeURIComponent(id)}`);
        openPendingDetailModal(res.item);
      } catch (err) {
        toast(err.message, true);
      }
    } else if (btn.classList.contains('pending-link')) {
      openLinkPendingModal({
        id,
        suggestedUserId: btn.dataset.uid,
        api,
        toast,
        onLinked: () => loadReviewSection(true),
      });
    }
  });

  async function loadAccounts() {
    const tbody = $('#admin-accounts-tbody');
    tbody.innerHTML = '<tr><td colspan="5"><div class="loading-row">Cargando cuentas de acceso…</div></td></tr>';
    try {
      const list = await api('/api/admins');
      tbody.innerHTML = list.length
        ? list
            .map(
              (acc) => `
                <tr>
                  <td>
                    <div class="member-cell">
                      ${avatarHtml(acc.username, 'sm')}
                      <div>
                        <strong>${escapeHtml(acc.username)}</strong>
                        <small>Creada el ${escapeHtml(formatDate(acc.creado_en))}</small>
                      </div>
                    </div>
                  </td>
                  <td>${escapeHtml(acc.email)}</td>
                  <td><span class="pill ${acc.rol === 'admin' ? 'pill-indigo' : 'pill-teal'}">${escapeHtml(formatRole(acc.rol))}</span></td>
                  <td><span class="pill ${acc.activo ? 'pill-success' : 'pill-danger'}">${acc.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td class="col-actions">
                    <div class="row-actions">
                      ${
                        acc.admin_id === profile.admin_id
                          ? '<span class="muted-label">Cuenta actual</span>'
                          : `<button type="button" class="btn btn-outline btn-xs acc-toggle" data-id="${acc.admin_id}" data-active="${acc.activo}">${acc.activo ? 'Desactivar' : 'Activar'}</button>
                             <button type="button" class="btn btn-danger-ghost btn-xs acc-delete" data-id="${acc.admin_id}" data-name="${escapeHtml(acc.username)}">Eliminar</button>`
                      }
                    </div>
                  </td>
                </tr>
              `
            )
            .join('')
        : '<tr><td colspan="5"><div class="empty-state compact">No hay cuentas configuradas.</div></td></tr>';
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state compact">No se pudieron cargar las cuentas.</div></td></tr>';
      toast(err.message, true);
    }
  }

  $('#admin-new-account').addEventListener('click', () =>
    openNewAccountModal({ api, toast, onCreated: loadAccounts })
  );

  $('#admin-accounts-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    try {
      if (btn.classList.contains('acc-toggle')) {
        const nextActive = Number(btn.dataset.active) ? 0 : 1;
        await api(`/api/admins/${btn.dataset.id}/activo`, {
          method: 'PATCH',
          body: JSON.stringify({ activo: nextActive }),
        });
        toast(nextActive ? 'Cuenta activada.' : 'Cuenta desactivada.');
        loadAccounts();
      } else if (btn.classList.contains('acc-delete')) {
        if (!confirm(`¿Eliminar permanentemente la cuenta "${btn.dataset.name}"?`)) return;
        await api(`/api/admins/${btn.dataset.id}`, { method: 'DELETE' });
        toast('Cuenta eliminada.');
        loadAccounts();
      }
    } catch (err) {
      toast(err.message, true);
    }
  });

  function onRealtimeStatus(status) {
    const badge = $('#admin-live-status');
    if (!badge) return;
    badge.className = `live-pill dark-live ${status}`;
    const label =
      status === 'live' ? 'En vivo' : status === 'reconnecting' ? 'Reconectando' : status === 'connecting' ? 'Conectando' : 'Sin señal';
    badge.innerHTML = `<i class="live-dot"></i><span>${label}</span>`;
  }

  function onRealtimeEvent(eventName, payload) {
    if (eventName === 'analytics:actualizado' && payload) {
      applySummaryToOverview(payload, activeView === 'overview');
      if (activeView === 'map') loadMap();
      return;
    }

    const list = $('#admin-activity-list');
    if (eventName === 'interaccion:creada' && payload?.item) {
      toast(`Nueva actividad recibida en vivo · ${payload.item.canal || 'Comunidad'}`);
      if (activeView === 'activity' && list) {
        const empty = list.querySelector('.empty-state, .inline-notice');
        if (empty) list.innerHTML = '';
        const existing = list.querySelector(`[data-activity-id="${CSS.escape(payload.item.id_interaccion)}"]`);
        if (existing) existing.remove();
        list.insertAdjacentHTML('afterbegin', renderActivityCard(payload.item, true));
        $('#admin-activity-meta').textContent = `${formatNumber(list.querySelectorAll('.activity-card').length)} actividades mostradas`;
      }
    } else if (eventName === 'interaccion:actualizada' && payload?.item) {
      toast(`Actividad actualizada en vivo · ${payload.item.canal || 'Comunidad'}`);
      if (activeView === 'activity' && list) {
        const card = list.querySelector(`[data-activity-id="${CSS.escape(payload.item.id_interaccion)}"]`);
        if (card) card.outerHTML = renderActivityCard(payload.item, true);
      }
    } else if (eventName === 'interaccion:eliminada' && payload?.id_interaccion) {
      toast(`Actividad eliminada en vivo · ${payload.id_interaccion}`);
      if (activeView === 'activity' && list) {
        const card = list.querySelector(`[data-activity-id="${CSS.escape(payload.id_interaccion)}"]`);
        if (card) card.remove();
        $('#admin-activity-meta').textContent = `${formatNumber(list.querySelectorAll('.activity-card').length)} actividades mostradas`;
      }
    }
  }

  $('#admin-marquee-track').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-admin-jump]');
    if (chip) switchView(chip.dataset.adminJump);
  });

  loadCatalogs();
  loadOverview();

  return {
    onRealtimeStatus,
    onRealtimeEvent,
    unmount() {
      destroyAllCharts();
      destroyMap();
    },
  };
}
