import {
  activityTypeBadge,
  avatarHtml,
  escapeHtml,
  formatConsent,
  formatDate,
  formatDateTime,
  formatNumber,
  formatReviewReason,
  formatSentiment,
  statusBadge,
} from './format.js';

const modalEl = () => document.getElementById('modal');
const modalContentEl = () => document.getElementById('modal-content');

export function initModalChrome() {
  const dlg = modalEl();
  if (!dlg) return;
  dlg.querySelector('.modal-close')?.addEventListener('click', closeModal);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeModal();
  });
}

export function openModal(html, { wide = false } = {}) {
  const dlg = modalEl();
  const body = modalContentEl();
  if (!dlg || !body) return;
  dlg.classList.toggle('modal-wide', wide);
  body.innerHTML = html;
  body.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });
  if (!dlg.open) dlg.showModal();
}

export function closeModal() {
  const dlg = modalEl();
  if (dlg?.open) dlg.close();
}

export function openMemberDetailModal(data, { isAdmin = false, onEdit } = {}) {
  const u = data.user;
  const sent = formatSentiment(u.sentimiento_promedio);
  const locationText =
    u.consentimiento_datos === 'si'
      ? [u.ciudad, u.estado, u.pais].filter(Boolean).join(', ') || 'Sin ubicación registrada'
      : 'Ubicación protegida por preferencia del miembro';

  const items = Array.isArray(data.interacciones) ? data.interacciones : [];
  const timelineHtml =
    data.interacciones_disponibles === false
      ? `<div class="inline-notice warning">El historial reciente de actividad no está disponible temporalmente.</div>`
      : items.length
        ? `<div class="timeline-list">
            ${items
              .map((item) => {
                const iSent = formatSentiment(item.sentimiento);
                return `
                  <article class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-card">
                      <div class="timeline-head">
                        <div class="timeline-badges">
                          <strong>${escapeHtml(item.canal || 'Canal')}</strong>
                          ${activityTypeBadge(item.tipo)}
                          <span class="pill pill-${iSent.tone}">Ánimo ${escapeHtml(iSent.score)}</span>
                        </div>
                        <time>${escapeHtml(formatDateTime(item.timestamp))}</time>
                      </div>
                      ${item.texto ? `<p class="timeline-quote">“${escapeHtml(item.texto)}”</p>` : ''}
                      <div class="timeline-meta">
                        <span>Tema: <b>${escapeHtml(item.tema || 'General')}</b></span>
                        <span>Reacciones: <b>${formatNumber(item.reacciones_recibidas ?? 0)}</b></span>
                        <span>${item.ubicacion_autorizada ? 'Ubicación autorizada' : 'Ubicación protegida'}</span>
                      </div>
                      ${
                        Array.isArray(item.etiquetas) && item.etiquetas.length
                          ? `<div class="chip-row">${item.etiquetas.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div>`
                          : ''
                      }
                    </div>
                  </article>
                `;
              })
              .join('')}
          </div>`
        : `<div class="empty-state compact">Este miembro aún no registra actividad reciente.</div>`;

  openModal(
    `
      <div class="profile-modal-head">
        <div class="profile-modal-identity">
          ${avatarHtml(u.alias, 'lg')}
          <div>
            <div class="profile-title-row">
              <h2>${escapeHtml(u.alias)}</h2>
              ${statusBadge(u.estatus)}
              ${Number(u.es_artista) === 1 ? '<span class="pill pill-violet">Artista</span>' : ''}
            </div>
            <p class="modal-sub">ID ${escapeHtml(u.id_usuario)} · Miembro desde ${escapeHtml(formatDate(u.fecha_ingreso))}</p>
          </div>
        </div>
        ${isAdmin ? `<button type="button" class="btn btn-outline btn-sm" id="modal-edit-member">Editar perfil</button>` : ''}
      </div>

      <div class="profile-mini-kpis">
        <div class="mini-stat">
          <span>Mensajes (30 días)</span>
          <strong>${formatNumber(u.mensajes_30d)}</strong>
        </div>
        <div class="mini-stat">
          <span>Reacciones (30 días)</span>
          <strong>${formatNumber(u.reacciones_30d)}</strong>
        </div>
        <div class="mini-stat">
          <span>Eventos asistidos</span>
          <strong>${formatNumber(u.eventos_asistidos)}</strong>
        </div>
        <div class="mini-stat">
          <span>Ánimo promedio</span>
          <strong>${escapeHtml(sent.score)} <small>(${escapeHtml(sent.label)})</small></strong>
        </div>
      </div>

      <div class="detail-section">
        <h3>Información del perfil</h3>
        <div class="detail-grid">
          <div class="detail-cell"><span>Plataforma principal</span><strong>${escapeHtml(u.plataforma_principal || '—')}</strong></div>
          <div class="detail-cell"><span>Interés principal</span><strong>${escapeHtml(u.interes_principal || '—')}</strong></div>
          <div class="detail-cell"><span>Especie / Personaje</span><strong>${escapeHtml(u.especie_fursona || '—')}</strong></div>
          <div class="detail-cell"><span>Rango de edad</span><strong>${escapeHtml(u.rango_edad || '—')} años</strong></div>
          <div class="detail-cell"><span>Comisiones adquiridas</span><strong>${formatNumber(u.comisiones_compradas)}</strong></div>
          <div class="detail-cell"><span>Última actividad</span><strong>${escapeHtml(formatDate(u.ultima_actividad))}</strong></div>
          <div class="detail-cell"><span>Privacidad de ubicación</span><strong>${escapeHtml(formatConsent(u.consentimiento_datos))}</strong></div>
          <div class="detail-cell"><span>Ubicación</span><strong>${escapeHtml(locationText)}</strong></div>
        </div>
      </div>

      <div class="detail-section">
        <div class="section-inline-head">
          <h3>Línea de tiempo de actividad</h3>
          <span class="muted-label">${items.length} registros mostrados</span>
        </div>
        ${timelineHtml}
      </div>
    `,
    { wide: true }
  );

  if (isAdmin && onEdit) {
    document.getElementById('modal-edit-member')?.addEventListener('click', () => {
      onEdit(u.id_usuario);
    });
  }
}

export async function openMemberFormModal({ id = null, api, locations = [], onSaved, toast }) {
  let u = {
    id_usuario: '',
    alias: '',
    fecha_ingreso: new Date().toISOString().slice(0, 10),
    ciudad_id: null,
    latitud: null,
    longitud: null,
    rango_edad: '25-31',
    especie_fursona: '',
    interes_principal: '',
    plataforma_principal: 'Discord',
    es_artista: 0,
    mensajes_30d: 0,
    reacciones_30d: 0,
    eventos_asistidos: 0,
    comisiones_compradas: 0,
    sentimiento_promedio: 0,
    ultima_actividad: new Date().toISOString().slice(0, 10),
    estatus: 'activo',
    consentimiento_datos: 'no',
  };

  if (id) {
    try {
      const detail = await api(`/api/usuarios/${encodeURIComponent(id)}`);
      u = detail.user;
    } catch (err) {
      toast(err.message, true);
      return;
    }
  }

  let catalog = locations;
  if (!catalog.length) {
    try {
      catalog = await api('/api/catalogos/ubicaciones');
    } catch {}
  }

  const optList = (items, current) =>
    items
      .map((item) => {
        const val = Array.isArray(item) ? item[0] : item;
        const label = Array.isArray(item) ? item[1] : item;
        return `<option value="${escapeHtml(val)}" ${String(current) === String(val) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      })
      .join('');

  openModal(
    `
      <div class="modal-header-block">
        <h2>${id ? `Editar miembro · ${escapeHtml(u.alias)}` : 'Registrar nuevo miembro'}</h2>
        <p class="modal-sub">Completa la información del perfil. Las reglas de privacidad y consistencia se validan en tiempo real.</p>
      </div>
      <form id="member-crud-form" novalidate>
        <div class="form-section-title">Identidad y perfil</div>
        <div class="form-grid">
          <label class="field-group">
            <span>ID de miembro</span>
            <input name="id_usuario" value="${escapeHtml(u.id_usuario)}" placeholder="U001500" ${id ? 'readonly' : ''} required>
            <small class="field-hint">Formato: letra U seguida de 6 dígitos.</small>
          </label>
          <label class="field-group">
            <span>Alias</span>
            <input name="alias" value="${escapeHtml(u.alias)}" placeholder="Nombre público en la comunidad" minlength="3" maxlength="50" required>
            <small class="field-hint">Mínimo 3 caracteres y único.</small>
          </label>
          <label class="field-group">
            <span>Fecha de ingreso</span>
            <input name="fecha_ingreso" type="date" value="${escapeHtml(u.fecha_ingreso)}" required>
          </label>
          <label class="field-group">
            <span>Última actividad</span>
            <input name="ultima_actividad" type="date" value="${escapeHtml(u.ultima_actividad)}" required>
          </label>
          <label class="field-group">
            <span>Rango de edad</span>
            <select name="rango_edad" required>${optList(['18-24', '25-31', '32-38', '39+'], u.rango_edad)}</select>
          </label>
          <label class="field-group">
            <span>Plataforma principal</span>
            <select name="plataforma_principal" required>${optList(['Discord', 'Facebook', 'Instagram', 'Telegram', 'TikTok', 'Twitter/X'], u.plataforma_principal)}</select>
          </label>
          <label class="field-group">
            <span>Especie / Personaje</span>
            <input name="especie_fursona" value="${escapeHtml(u.especie_fursona)}" placeholder="Ej. Zorro, Lobo, Dragón" maxlength="40" required>
          </label>
          <label class="field-group">
            <span>Interés principal</span>
            <input name="interes_principal" value="${escapeHtml(u.interes_principal)}" placeholder="Ej. Ilustración, Música, Eventos" maxlength="50" required>
          </label>
          <label class="field-group">
            <span>Estado en comunidad</span>
            <select name="estatus" required>
              ${optList([['activo', 'Activo'], ['en_riesgo', 'En riesgo'], ['inactivo', 'Inactivo']], u.estatus)}
            </select>
          </label>
          <label class="field-group">
            <span>Perfil creativo (Artista)</span>
            <select name="es_artista" required>
              ${optList([['0', 'No'], ['1', 'Sí']], String(u.es_artista))}
            </select>
          </label>
        </div>

        <div class="form-section-title">Privacidad y ubicación</div>
        <div class="inline-notice info" id="member-privacy-banner">
          Si el miembro no autoriza compartir su ubicación, los datos de ciudad y coordenadas se mantienen protegidos y vacíos automáticamente.
        </div>
        <div class="form-grid">
          <label class="field-group">
            <span>Autorización de ubicación</span>
            <select name="consentimiento_datos" required>
              ${optList([['si', 'Sí, ubicación autorizada'], ['no', 'No, mantener ubicación protegida']], u.consentimiento_datos)}
            </select>
          </label>
          <label class="field-group">
            <span>País</span>
            <select name="pais_id"><option value="">Selecciona país</option>${optList(catalog.map((p) => [p.pais_id, p.nombre]), '')}</select>
          </label>
          <label class="field-group">
            <span>Estado o región</span>
            <select name="estado_id"><option value="">Selecciona estado</option></select>
          </label>
          <label class="field-group">
            <span>Ciudad</span>
            <select name="ciudad_id"><option value="">Selecciona ciudad</option></select>
          </label>
          <label class="field-group">
            <span>Latitud</span>
            <input name="latitud" type="number" step="0.000001" min="-90" max="90" value="${escapeHtml(u.latitud ?? '')}" placeholder="-90 a 90">
          </label>
          <label class="field-group">
            <span>Longitud</span>
            <input name="longitud" type="number" step="0.000001" min="-180" max="180" value="${escapeHtml(u.longitud ?? '')}" placeholder="-180 a 180">
          </label>
        </div>

        <div class="form-section-title">Participación y métricas</div>
        <div class="form-grid">
          <label class="field-group">
            <span>Mensajes (últimos 30 días)</span>
            <input name="mensajes_30d" type="number" min="0" value="${escapeHtml(u.mensajes_30d)}" required>
          </label>
          <label class="field-group">
            <span>Reacciones (últimos 30 días)</span>
            <input name="reacciones_30d" type="number" min="0" value="${escapeHtml(u.reacciones_30d)}" required>
          </label>
          <label class="field-group">
            <span>Eventos asistidos</span>
            <input name="eventos_asistidos" type="number" min="0" value="${escapeHtml(u.eventos_asistidos)}" required>
          </label>
          <label class="field-group">
            <span>Comisiones adquiridas</span>
            <input name="comisiones_compradas" type="number" min="0" value="${escapeHtml(u.comisiones_compradas)}" required>
          </label>
          <label class="field-group">
            <span>Ánimo promedio (−1 a +1)</span>
            <input name="sentimiento_promedio" type="number" step="0.001" min="-1" max="1" value="${escapeHtml(u.sentimiento_promedio)}" required>
          </label>
        </div>

        <div id="member-form-error" class="form-alert error hidden" role="alert"></div>

        <div class="form-actions">
          <button type="button" class="btn btn-outline" data-close-modal>Cancelar</button>
          <button type="submit" class="btn btn-primary" id="member-form-submit">${id ? 'Guardar cambios' : 'Crear miembro'}</button>
        </div>
      </form>
    `,
    { wide: true }
  );

  const form = document.getElementById('member-crud-form');
  const errorBox = document.getElementById('member-form-error');
  const submitBtn = document.getElementById('member-form-submit');
  const selCountry = form.elements.pais_id;
  const selState = form.elements.estado_id;
  const selCity = form.elements.ciudad_id;

  function fillStates() {
    const country = catalog.find((x) => String(x.pais_id) === selCountry.value);
    selState.innerHTML =
      '<option value="">Selecciona estado</option>' +
      (country?.estados || []).map((st) => `<option value="${st.estado_id}">${escapeHtml(st.nombre)}</option>`).join('');
    fillCities();
  }

  function fillCities() {
    const country = catalog.find((x) => String(x.pais_id) === selCountry.value);
    const state = country?.estados?.find((x) => String(x.estado_id) === selState.value);
    selCity.innerHTML =
      '<option value="">Selecciona ciudad</option>' +
      (state?.ciudades || []).map((c) => `<option value="${c.ciudad_id}">${escapeHtml(c.nombre)}</option>`).join('');
  }

  selCountry.addEventListener('change', fillStates);
  selState.addEventListener('change', fillCities);

  if (u.ciudad_id) {
    for (const p of catalog) {
      for (const st of p.estados || []) {
        if ((st.ciudades || []).some((c) => c.ciudad_id === u.ciudad_id)) {
          selCountry.value = String(p.pais_id);
          fillStates();
          selState.value = String(st.estado_id);
          fillCities();
          selCity.value = String(u.ciudad_id);
        }
      }
    }
  }

  function syncPrivacy() {
    const lock = form.elements.consentimiento_datos.value === 'no';
    for (const name of ['pais_id', 'estado_id', 'ciudad_id', 'latitud', 'longitud']) {
      form.elements[name].disabled = lock;
      if (lock) form.elements[name].value = '';
    }
  }

  function syncInactive() {
    const inactive = form.elements.estatus.value === 'inactivo';
    for (const name of ['mensajes_30d', 'reacciones_30d']) {
      form.elements[name].disabled = inactive;
      if (inactive) form.elements[name].value = '0';
    }
  }

  function validateLive() {
    const errors = [];
    const uid = form.elements.id_usuario.value.trim();
    const alias = form.elements.alias.value.trim();
    const joined = form.elements.fecha_ingreso.value;
    const lastAct = form.elements.ultima_actividad.value;
    const lat = form.elements.latitud.value.trim();
    const lng = form.elements.longitud.value.trim();
    const sentVal = Number(form.elements.sentimiento_promedio.value);

    if (!/^U\d{6}$/.test(uid)) errors.push('El ID de miembro debe seguir el formato U seguido de 6 dígitos (ej. U001234).');
    if (alias.length < 3) errors.push('El alias debe tener al menos 3 caracteres.');
    if (joined && lastAct && lastAct < joined) errors.push('La última actividad no puede ser anterior a la fecha de ingreso.');
    if (form.elements.consentimiento_datos.value === 'si' && Boolean(lat) !== Boolean(lng)) {
      errors.push('Latitud y longitud deben capturarse juntas.');
    }
    if (Number.isNaN(sentVal) || sentVal < -1 || sentVal > 1) {
      errors.push('El ánimo promedio debe estar entre -1 y +1.');
    }

    if (errors.length) {
      errorBox.textContent = errors[0];
      errorBox.classList.remove('hidden');
      return false;
    }
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return true;
  }

  form.elements.consentimiento_datos.addEventListener('change', () => {
    syncPrivacy();
    validateLive();
  });
  form.elements.estatus.addEventListener('change', () => {
    syncInactive();
    validateLive();
  });
  form.addEventListener('input', validateLive);
  syncPrivacy();
  syncInactive();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateLive()) return;

    const fd = Object.fromEntries(new FormData(form));
    const numeric = [
      'ciudad_id',
      'latitud',
      'longitud',
      'es_artista',
      'mensajes_30d',
      'reacciones_30d',
      'eventos_asistidos',
      'comisiones_compradas',
      'sentimiento_promedio',
    ];
    for (const key of numeric) {
      if (fd[key] !== undefined && fd[key] !== '') {
        fd[key] = Number(fd[key]);
      } else if (['ciudad_id', 'latitud', 'longitud'].includes(key)) {
        fd[key] = null;
      }
    }
    if (fd.consentimiento_datos === 'no') {
      fd.ciudad_id = null;
      fd.latitud = null;
      fd.longitud = null;
    }
    if (fd.estatus === 'inactivo') {
      fd.mensajes_30d = 0;
      fd.reacciones_30d = 0;
    }
    delete fd.pais_id;
    delete fd.estado_id;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';
    try {
      await api(id ? `/api/usuarios/${encodeURIComponent(id)}` : '/api/usuarios', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(fd),
      });
      closeModal();
      toast(id ? 'Perfil actualizado correctamente.' : 'Nuevo miembro registrado.');
      onSaved?.();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = id ? 'Guardar cambios' : 'Crear miembro';
    }
  });
}

export function openPendingDetailModal(item) {
  const orig = item.registro_original || {};
  const sent = formatSentiment(orig.sentimiento);
  const rawTags = Array.isArray(orig.etiquetas)
    ? orig.etiquetas
    : typeof orig.etiquetas_raw === 'string'
      ? orig.etiquetas_raw.split('|').filter(Boolean)
      : [];

  openModal(
    `
      <div class="modal-header-block">
        <h2>Detalle del registro por revisar</h2>
        <p class="modal-sub">Referencia ${escapeHtml(item.id_interaccion)} · ${escapeHtml(formatReviewReason(item.motivo_rechazo))}</p>
      </div>
      <div class="detail-grid">
        <div class="detail-cell"><span>ID referenciado</span><strong>${escapeHtml(item.id_usuario_referenciado || '—')}</strong></div>
        <div class="detail-cell"><span>Fecha de detección</span><strong>${escapeHtml(formatDateTime(item.fecha_cuarentena))}</strong></div>
        <div class="detail-cell"><span>Canal</span><strong>${escapeHtml(orig.canal || '—')}</strong></div>
        <div class="detail-cell"><span>Tipo de actividad</span><strong>${activityTypeBadge(orig.tipo)}</strong></div>
        <div class="detail-cell"><span>Tema</span><strong>${escapeHtml(orig.tema || 'General')}</strong></div>
        <div class="detail-cell"><span>Ánimo estimado</span><strong>${escapeHtml(sent.score)} (${escapeHtml(sent.label)})</strong></div>
        <div class="detail-cell"><span>Idioma</span><strong>${escapeHtml(orig.idioma || '—')}</strong></div>
        <div class="detail-cell"><span>Dispositivo</span><strong>${escapeHtml(orig.dispositivo || '—')}</strong></div>
        <div class="detail-cell"><span>Fecha original</span><strong>${escapeHtml(formatDateTime(orig.timestamp))}</strong></div>
        <div class="detail-cell"><span>Reacciones recibidas</span><strong>${formatNumber(orig.reacciones_recibidas ?? 0)}</strong></div>
      </div>
      ${
        orig.texto
          ? `<div class="detail-section"><h3>Contenido capturado</h3><blockquote class="review-quote">${escapeHtml(orig.texto)}</blockquote></div>`
          : ''
      }
      ${
        rawTags.length
          ? `<div class="detail-section"><h3>Etiquetas</h3><div class="chip-row">${rawTags.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div></div>`
          : ''
      }
      <div class="form-actions">
        <button type="button" class="btn btn-primary" data-close-modal>Cerrar</button>
      </div>
    `,
    { wide: true }
  );
}

export function openLinkPendingModal({ id, suggestedUserId = '', api, onLinked, toast }) {
  openModal(`
    <div class="modal-header-block">
      <h2>Vincular actividad a un miembro</h2>
      <p class="modal-sub">Asigna el registro <b>${escapeHtml(id)}</b> a un miembro activo de la comunidad para integrarlo al historial.</p>
    </div>
    <form id="link-pending-form" novalidate>
      <label class="field-group">
        <span>ID del miembro destino</span>
        <input name="id_usuario" value="${escapeHtml(/^U\d{6}$/.test(suggestedUserId) ? suggestedUserId : '')}" placeholder="Ej. U000001" required>
        <small class="field-hint">Debe corresponder a un miembro registrado (formato U000000).</small>
      </label>
      <div id="link-pending-error" class="form-alert error hidden" role="alert"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-close-modal>Cancelar</button>
        <button type="submit" class="btn btn-primary" id="link-pending-submit">Vincular actividad</button>
      </div>
    </form>
  `);

  const form = document.getElementById('link-pending-form');
  const errBox = document.getElementById('link-pending-error');
  const submitBtn = document.getElementById('link-pending-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const userId = form.elements.id_usuario.value.trim();
    if (!/^U\d{6}$/.test(userId)) {
      errBox.textContent = 'Ingresa un identificador válido (ej. U000120).';
      errBox.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Vinculando…';
    try {
      await api(`/api/cuarentena/${encodeURIComponent(id)}/reprocesar`, {
        method: 'POST',
        body: JSON.stringify({ id_usuario: userId }),
      });
      closeModal();
      toast('Actividad vinculada correctamente al miembro.');
      onLinked?.();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Vincular actividad';
    }
  });
}

export function openNewAccountModal({ api, onCreated, toast }) {
  openModal(`
    <div class="modal-header-block">
      <h2>Nueva cuenta de acceso</h2>
      <p class="modal-sub">Crea un perfil para un administrador de operaciones o un analista de comunidad.</p>
    </div>
    <form id="account-create-form" novalidate>
      <div class="form-grid">
        <label class="field-group">
          <span>Usuario</span>
          <input name="username" placeholder="Ej. sofia_analista" minlength="4" maxlength="40" required>
        </label>
        <label class="field-group">
          <span>Correo electrónico</span>
          <input name="email" type="email" placeholder="nombre@organizacion.com" required>
        </label>
        <label class="field-group">
          <span>Contraseña inicial</span>
          <input name="password" type="password" minlength="8" placeholder="Mínimo 8 caracteres" required>
          <small class="field-hint">Incluye mayúscula, minúscula y número.</small>
        </label>
        <label class="field-group">
          <span>Perfil de acceso</span>
          <select name="rol" required>
            <option value="analista">Analista (Portal de Insights)</option>
            <option value="admin">Administrador (Gestión completa)</option>
          </select>
        </label>
      </div>
      <div id="account-form-error" class="form-alert error hidden" role="alert"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-close-modal>Cancelar</button>
        <button type="submit" class="btn btn-primary" id="account-submit">Crear cuenta</button>
      </div>
    </form>
  `);

  const form = document.getElementById('account-create-form');
  const errBox = document.getElementById('account-form-error');
  const submitBtn = document.getElementById('account-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const payload = Object.fromEntries(new FormData(form));
    if (payload.username.trim().length < 4) {
      errBox.textContent = 'El nombre de usuario debe tener al menos 4 caracteres.';
      errBox.classList.remove('hidden');
      return;
    }
    if (!/^(?=.{8,}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/.test(payload.password)) {
      errBox.textContent = 'La contraseña debe tener 8+ caracteres con mayúscula, minúscula y número.';
      errBox.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando…';
    try {
      await api('/api/admins', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      toast('Cuenta de acceso creada.');
      onCreated?.();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear cuenta';
    }
  });
}

export function openChangePasswordModal({ api, toast }) {
  openModal(`
    <div class="modal-header-block">
      <h2>Actualizar contraseña</h2>
      <p class="modal-sub">Usa al menos 8 caracteres combinando mayúsculas, minúsculas y números.</p>
    </div>
    <form id="change-password-form" novalidate>
      <div class="form-grid">
        <label class="field-group">
          <span>Contraseña actual</span>
          <input name="currentPassword" type="password" required autocomplete="current-password">
        </label>
        <label class="field-group">
          <span>Nueva contraseña</span>
          <input name="newPassword" type="password" minlength="8" required autocomplete="new-password">
        </label>
      </div>
      <div id="password-form-error" class="form-alert error hidden" role="alert"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" data-close-modal>Cancelar</button>
        <button type="submit" class="btn btn-primary" id="password-submit">Guardar contraseña</button>
      </div>
    </form>
  `);

  const form = document.getElementById('change-password-form');
  const errBox = document.getElementById('password-form-error');
  const submitBtn = document.getElementById('password-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const payload = Object.fromEntries(new FormData(form));
    if (!/^(?=.{8,}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/.test(payload.newPassword || '')) {
      errBox.textContent = 'La nueva contraseña debe incluir mayúscula, minúscula, número y 8+ caracteres.';
      errBox.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Actualizando…';
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      toast('Contraseña actualizada correctamente.');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar contraseña';
    }
  });
}
