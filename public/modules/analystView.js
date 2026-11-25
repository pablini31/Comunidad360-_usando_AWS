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
import { destroyMap, renderCommunityMap, setMapLayerMode } from './map.js';
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

  root.innerHTML = `
    <div class="analyst-shell" data-experience="analyst">
      <!-- BARRA DE NAVEGACIÓN SUPERIOR HORIZONTAL (ESTILO PORTAL EDITORIAL) -->
      <header class="portal-navbar">
        <div class="portal-navbar-inner">
          <a href="#inicio" class="portal-brand" id="portal-brand-home">
            <div class="brand-emblem editorial"><span>C</span><em>360</em></div>
            <div>
              <strong>Community 360</strong>
              <small>Portal de Comunidad</small>
            </div>
          </a>

          <nav class="portal-nav" id="analyst-nav" aria-label="Secciones del portal">
            <button type="button" data-section="home" class="active">Inicio</button>
            <button type="button" data-section="trends">Tendencias</button>
            <button type="button" data-section="map">Mapa de calor</button>
            <button type="button" data-section="members">Miembros</button>
            <button type="button" data-section="conversations">Conversaciones</button>
          </nav>

          <div class="portal-user-actions">
            <span class="live-pill connecting" id="analyst-live-status" title="Actualización automática en vivo">
              <i class="live-dot"></i><span>Conectando…</span>
            </span>
            <div class="portal-profile-pill">
              ${avatarHtml(profile.username, 'xs')}
              <div>
                <strong>${escapeHtml(profile.username)}</strong>
                <small>${escapeHtml(formatRole(profile.rol))}</small>
              </div>
            </div>
            <button type="button" class="btn btn-portal-ghost btn-sm" id="analyst-pwd-btn" title="Cambiar contraseña">Clave</button>
            <button type="button" class="btn btn-portal-outline btn-sm" id="analyst-switch-btn">Cambiar de cuenta</button>
          </div>
        </div>
      </header>

      <main class="portal-main">
        <!-- SECCIÓN 1: HERO EDITORIAL & PULSO VIVO -->
        <section class="portal-section" id="analyst-sec-home">
          <div class="portal-hero">
            <div class="portal-hero-copy">
              <span class="editorial-kicker">Pulso de la comunidad · Vista de exploración en vivo</span>
              <h1>Descubre cómo vibra y crece nuestra comunidad hoy.</h1>
              <p>
                Explora los temas que inspiran conversaciones, visualiza el mapa de calor regional y acompaña el pulso en tiempo real sin recargar la página.
              </p>
              <div class="hero-cta-row">
                <button type="button" class="btn btn-editorial-primary" data-jump="trends">Explorar tendencias</button>
                <button type="button" class="btn btn-portal-outline" data-jump="map">Ver mapa de calor</button>
                <button type="button" class="btn btn-portal-ghost" data-jump="members">Conocer miembros</button>
              </div>
            </div>

            <div class="portal-pulse-card" id="portal-pulse-card">
              <div class="pulse-header">
                <span class="pulse-live-dot"></span>
                <span>Pulso en tiempo real</span>
              </div>
              <div class="pulse-metrics">
                <div class="pulse-metric">
                  <span class="pulse-label">Miembros de la comunidad</span>
                  <strong id="portal-kpi-users">—</strong>
                  <small id="portal-kpi-artists">Cargando datos reales…</small>
                </div>
                <div class="pulse-metric">
                  <span class="pulse-label">Publicaciones y reacciones</span>
                  <strong id="portal-kpi-activity">—</strong>
                  <small id="portal-kpi-channels">Canales de actividad</small>
                </div>
                <div class="pulse-metric">
                  <span class="pulse-label">Ánimo de actividad</span>
                  <strong id="portal-kpi-sentiment">—</strong>
                  <small id="portal-kpi-sentiment-label">Clima comunitario</small>
                </div>
                <div class="pulse-metric">
                  <span class="pulse-label">Promedio de reacciones</span>
                  <strong id="portal-kpi-reactions">—</strong>
                  <small id="portal-kpi-reactions-sub">Por publicación</small>
                </div>
              </div>
            </div>
          </div>

          <!-- TARJETAS SHOWCASE DESTACADAS -->
          <div class="portal-section-heading">
            <div>
              <h2>Destacados de la comunidad</h2>
              <p>Los canales, intereses y regiones que marcan el ritmo actual.</p>
            </div>
          </div>
          <div class="showcase-grid" id="portal-showcase-grid">
            <article class="showcase-card"><div class="loading-row">Preparando destacados…</div></article>
            <article class="showcase-card"><div class="loading-row">Preparando destacados…</div></article>
            <article class="showcase-card"><div class="loading-row">Preparando destacados…</div></article>
          </div>
        </section>

        <!-- SECCIÓN 2: TENDENCIAS E INSIGHTS -->
        <section class="portal-section hidden" id="analyst-sec-trends">
          <div class="portal-section-heading">
            <div>
              <span class="editorial-kicker">Análisis visual en vivo</span>
              <h1>Tendencias y clima comunitario</h1>
              <p>Compara el ánimo por país, la participación en cada canal y la composición de la comunidad.</p>
            </div>
          </div>

          <div class="editorial-charts-wide">
            <article class="editorial-card span-2">
              <div class="card-head">
                <div>
                  <h2>Ánimo promedio por país</h2>
                  <p>Indicador de clima comunitario basado exclusivamente en ubicaciones autorizadas</p>
                </div>
              </div>
              <div class="chart-box tall"><canvas id="analyst-country-chart"></canvas></div>
            </article>

            <article class="editorial-card" id="analyst-channel-card">
              <div class="card-head">
                <div>
                  <h2>Canales más activos</h2>
                  <p>Participación por canal actualizada en tiempo real</p>
                </div>
              </div>
              <div class="chart-box tall" id="analyst-channel-wrap"><canvas id="analyst-channel-chart"></canvas></div>
            </article>

            <article class="editorial-card">
              <div class="card-head">
                <div>
                  <h2>Participación de miembros</h2>
                  <p>Distribución actual de la comunidad por estado</p>
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
                  <p>Temáticas principales elegidas por los miembros</p>
                </div>
              </div>
              <div id="analyst-interests-bars" class="ranked-bars"></div>
            </article>

            <article class="editorial-card">
              <div class="card-head">
                <div>
                  <h2>Comunidad por especie y afinidad</h2>
                  <p>Top 8 perfiles más representados</p>
                </div>
              </div>
              <div id="analyst-species-bars" class="ranked-bars"></div>
            </article>
          </div>
        </section>

        <!-- SECCIÓN 3: MAPA DE CALOR COMUNITARIO A GRAN FORMATO -->
        <section class="portal-section hidden" id="analyst-sec-map">
          <div class="portal-section-heading">
            <div>
              <span class="editorial-kicker">Presencia global</span>
              <h1>Mapa de calor comunitario</h1>
              <p>Explora las zonas con mayor concentración de miembros que comparten su ubicación de forma voluntaria.</p>
            </div>
            <div class="map-mode-toggle editorial-toggle" id="analyst-map-mode">
              <button type="button" data-mode="heat">Calor</button>
              <button type="button" data-mode="both" class="active">Combinado</button>
              <button type="button" data-mode="markers">Marcadores</button>
            </div>
          </div>

          <div class="portal-map-layout">
            <article class="editorial-card map-card-large">
              <div id="analyst-map-canvas" class="map-canvas large"></div>
              <div class="map-legend">
                <span><i class="dot emerald"></i> Activo</span>
                <span><i class="dot amber"></i> En riesgo</span>
                <span><i class="dot rose"></i> Inactivo</span>
                <span class="heat-legend-bar"><i class="heat-swatch"></i> Densidad de calor</span>
              </div>
            </article>

            <aside class="editorial-card geo-summary-card">
              <div class="privacy-callout" id="analyst-privacy-callout">
                Verificando privacidad de miembros…
              </div>
              <h3>Principales países</h3>
              <div id="analyst-geo-countries" class="geo-rank-list"></div>
              <h3 style="margin-top:20px">Ciudades destacadas</h3>
              <div id="analyst-geo-cities" class="geo-rank-list compact"></div>
            </aside>
          </div>
        </section>

        <!-- SECCIÓN 4: EXPLORADOR DE MIEMBROS (TARJETAS + LISTA) -->
        <section class="portal-section hidden" id="analyst-sec-members">
          <div class="portal-section-heading">
            <div>
              <span class="editorial-kicker">Comunidad</span>
              <h1>Explorador de miembros</h1>
              <p>Descubre perfiles, intereses creativos y actividad reciente. Haz clic en cualquier miembro para ver su historia.</p>
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
        </section>

        <!-- SECCIÓN 5: CONVERSACIONES (FEED LIMPIO EN VIVO + TRANSPARENCIA DE CALIDAD) -->
        <section class="portal-section hidden" id="analyst-sec-conversations">
          <div class="portal-section-heading">
            <div>
              <span class="editorial-kicker">Actividad en vivo</span>
              <h1>Conversaciones y pulso en canales</h1>
              <p>Explora las publicaciones, comentarios y reacciones actualizadas al instante.</p>
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
            <div class="portal-section-heading compact">
              <div>
                <h2>Transparencia e historial de actualizaciones</h2>
                <p>Resumen de actividad pendiente de vincular y registro de importaciones de la comunidad.</p>
              </div>
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
                    <p>Actualizaciones recientes integradas a la plataforma</p>
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
    root.querySelectorAll('#analyst-nav button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.section === section);
    });
    root.querySelectorAll('.portal-section').forEach((sec) => {
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

  $('#analyst-map-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    mapLayerMode = btn.dataset.mode;
    root.querySelectorAll('#analyst-map-mode button').forEach((b) => b.classList.toggle('active', b === btn));
    setMapLayerMode(mapLayerMode);
  });

  $('#portal-brand-home').addEventListener('click', (e) => {
    e.preventDefault();
    goToSection('home');
  });

  root.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => goToSection(btn.dataset.jump));
  });

  $('#analyst-switch-btn').addEventListener('click', onSwitchAccount);
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
    $('#portal-kpi-artists').textContent = `${formatNumber(active)} activos (${formatPercent(active, total)}) · ${formatNumber(artists)} artistas`;

    if (d.actividad_disponible && d.total_interacciones_validas !== null) {
      $('#portal-kpi-activity').textContent = formatNumber(d.total_interacciones_validas);
      $('#portal-kpi-channels').textContent = `Activa en ${(d.canales || []).length} canales`;
      $('#portal-kpi-reactions').textContent =
        d.promedio_reacciones !== null ? Number(d.promedio_reacciones).toFixed(2) : '0.00';
      $('#portal-kpi-reactions-sub').textContent = `${formatNumber(d.total_reacciones ?? 0)} reacciones totales`;
    } else {
      $('#portal-kpi-activity').textContent = 'En pausa';
      $('#portal-kpi-channels').textContent = 'Actividad temporalmente no disponible';
      $('#portal-kpi-reactions').textContent = '—';
      $('#portal-kpi-reactions-sub').textContent = 'Por publicación';
    }

    $('#portal-kpi-sentiment').textContent = sent.score;
    $('#portal-kpi-sentiment-label').textContent =
      d.actividad_disponible && d.tasa_positividad_actividad !== null
        ? `${sent.label} · ${d.tasa_positividad_actividad}% positivo`
        : sent.label;

    const topInterests = (d.top_intereses || []).slice(0, 4);
    const topChannels = (d.canales || []).slice(0, 4);
    const topPlatforms = (d.plataformas || []).slice(0, 4);
    const topCountries = (d.por_pais || []).slice(0, 4);

    $('#portal-showcase-grid').innerHTML = `
      <article class="showcase-card">
        <div class="showcase-kicker violet">Intereses destacados</div>
        <h3>Lo que más reúne a la comunidad</h3>
        <div class="showcase-list">
          ${topInterests
            .map(
              (item) => `
                <div class="showcase-row">
                  <span>${escapeHtml(item.nombre)}</span>
                  <b>${formatNumber(item.total)}</b>
                </div>
              `
            )
            .join('')}
        </div>
      </article>

      <article class="showcase-card">
        <div class="showcase-kicker teal">Canales con mayor pulso</div>
        <h3>${topChannels.length ? 'Participación por canal en vivo' : 'Plataformas favoritas'}</h3>
        <div class="showcase-list">
          ${
            topChannels.length
              ? topChannels
                  .map(
                    (item) => `
                      <div class="showcase-row">
                        <span>${escapeHtml(item.canal)}</span>
                        <b>${item.tasa_participacion}% (${formatNumber(item.total)})</b>
                      </div>
                    `
                  )
                  .join('')
              : topPlatforms
                  .map(
                    (item) => `
                      <div class="showcase-row">
                        <span>${escapeHtml(item.nombre)}</span>
                        <b>${formatPercent(item.total, total)}</b>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>
      </article>

      <article class="showcase-card">
        <div class="showcase-kicker amber">Comunidades regionales</div>
        <h3>Países con mayor presencia</h3>
        <div class="showcase-list">
          ${topCountries
            .map((item) => {
              const s = formatSentiment(item.sentimiento_promedio);
              return `
                <div class="showcase-row">
                  <span>${escapeHtml(item.pais)}</span>
                  <span class="pill pill-${s.tone}">${formatNumber(item.usuarios)} · ${escapeHtml(s.score)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </article>
    `;

    if (highlightLive) {
      flashElement($('#portal-pulse-card'));
    }
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
        color: '#5b46f6',
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
          color: '#0d9488',
          horizontal: true,
          valueSuffix: ' registros',
        })
      );
    } else {
      channelWrap.innerHTML = `<div class="empty-state">${
        d.actividad_disponible
          ? 'Aún no hay actividad registrada por canal.'
          : 'Los datos de canales no están disponibles en este momento.'
      }</div>`;
    }

    renderChart(
      'analyst-status-chart',
      buildDoughnutConfig({
        labels: ['Activos', 'En riesgo', 'Inactivos'],
        data: [Number(d.activos || 0), Number(d.en_riesgo || 0), Number(d.inactivos || 0)],
        colors: ['#0d9488', '#f59e0b', '#e11d48'],
      })
    );

    renderRankedBars('analyst-interests-bars', d.top_intereses, 'total', 'nombre', 'violet');
    renderRankedBars('analyst-species-bars', d.top_especies, 'total', 'nombre', 'teal');

    if (highlightLive) {
      flashElement($('#analyst-channel-card'));
    }
  }

  async function loadTrends() {
    try {
      const d = await ensureSummary();
      applySummaryToTrends(d, false);
    } catch (err) {
      toast(err.message, true);
    }
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
        <p>${formatNumber(protectedRes.total)} miembros eligieron mantener su ubicación privada y están excluidos de este mapa de calor (${formatNumber(points.length)} ubicaciones autorizadas visibles).</p>
      `;
      renderCommunityMap('analyst-map-canvas', points, { theme: 'voyager', mode: mapLayerMode });

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

      const cities = (summary?.por_ciudad || []).slice(0, 6);
      $('#analyst-geo-cities').innerHTML = cities.length
        ? cities
            .map(
              (c) => `
                <div class="geo-rank-item">
                  <div>
                    <strong>${escapeHtml(c.ciudad)}</strong>
                    <small>${escapeHtml(c.pais)}</small>
                  </div>
                  <b>${formatNumber(c.usuarios)}</b>
                </div>
              `
            )
            .join('')
        : '<div class="empty-state compact">Sin ciudades destacadas.</div>';
    } catch (err) {
      callout.textContent = 'No fue posible cargar el mapa comunitario.';
      toast(err.message, true);
    }
  }

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
            .map((u) => {
              const sent = formatSentiment(u.sentimiento_promedio);
              return `
                <article class="member-profile-card" data-member-id="${escapeHtml(u.id_usuario)}" tabindex="0" role="button">
                  <div class="member-card-top">
                    ${avatarHtml(u.alias, 'md')}
                    <div class="member-card-badges">
                      ${statusBadge(u.estatus)}
                      ${Number(u.es_artista) === 1 ? '<span class="pill pill-violet">Artista</span>' : ''}
                    </div>
                  </div>
                  <div class="member-card-identity">
                    <h3>${escapeHtml(u.alias)}</h3>
                    <span>${escapeHtml(u.especie_fursona || 'Comunidad')} · ${escapeHtml(u.plataforma_principal)}</span>
                  </div>
                  <div class="member-card-tags">
                    <span class="tag-chip">${escapeHtml(u.interes_principal || 'General')}</span>
                    <span class="tag-chip">${escapeHtml(u.rango_edad)} años</span>
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
    host.innerHTML = '<div class="editorial-card"><div class="loading-row">Cargando perfiles de la comunidad…</div></div>';
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
    if (reset) {
      list.innerHTML = '<div class="editorial-card"><div class="loading-row">Cargando conversaciones de la comunidad…</div></div>';
    }
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

      if (html) {
        list.insertAdjacentHTML('beforeend', html);
      } else if (reset) {
        list.innerHTML = '<div class="editorial-card"><div class="empty-state">No hay conversaciones que coincidan con los filtros.</div></div>';
      }
      $('#analyst-feed-meta').textContent = `${list.querySelectorAll('.feed-post-card').length} publicaciones cargadas`;
    } catch (err) {
      if (reset) {
        list.innerHTML = `<div class="editorial-card"><div class="inline-notice warning">${escapeHtml(err.message)}</div></div>`;
      }
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
      if (reset) {
        pendingList.innerHTML = `<div class="inline-notice warning">${escapeHtml(pendingRes.reason?.message || 'No fue posible consultar la actividad pendiente en este momento.')}</div>`;
      }
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
    const badge = $('#analyst-live-status');
    if (!badge) return;
    badge.className = `live-pill ${status}`;
    const label =
      status === 'live' ? 'En vivo' : status === 'reconnecting' ? 'Reconectando…' : status === 'connecting' ? 'Conectando…' : 'Sin conexión';
    badge.innerHTML = `<i class="live-dot"></i><span>${label}</span>`;
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
