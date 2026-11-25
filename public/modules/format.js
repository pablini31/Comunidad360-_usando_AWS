export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

const numberFmt = new Intl.NumberFormat('es-MX');
const shortDateFmt = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatNumber(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return numberFmt.format(Number(value));
}

export function formatPercent(part, total) {
  const nPart = Number(part || 0);
  const nTotal = Number(total || 0);
  if (!nTotal) return '0%';
  return `${Math.round((nPart / nTotal) * 100)}%`;
}

export function formatDate(value) {
  if (!value) return '—';
  const str = String(value).trim();
  const isoDateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = isoDateOnly
    ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
    : new Date(str);
  if (Number.isNaN(date.getTime())) return str;
  return shortDateFmt.format(date).replace(/\.$/, '');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return dateTimeFmt.format(date);
}

const STATUS_MAP = {
  activo: { label: 'Activo', tone: 'success' },
  en_riesgo: { label: 'En riesgo', tone: 'warning' },
  inactivo: { label: 'Inactivo', tone: 'danger' },
};

export function formatStatus(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_MAP[key] || { label: capitalize(key.replaceAll('_', ' ')) || 'Sin estado', tone: 'neutral' };
}

export function statusBadge(status) {
  const { label, tone } = formatStatus(status);
  return `<span class="pill pill-${tone}">${escapeHtml(label)}</span>`;
}

const ROLE_MAP = {
  admin: 'Administrador',
  analista: 'Analista',
};

export function formatRole(role) {
  return ROLE_MAP[String(role || '').toLowerCase()] || capitalize(role);
}

const TYPE_MAP = {
  reaccion: { label: 'Reacción', tone: 'amber' },
  comentario: { label: 'Comentario', tone: 'indigo' },
  publicacion: { label: 'Publicación', tone: 'emerald' },
  mensaje: { label: 'Mensaje', tone: 'indigo' },
  respuesta: { label: 'Respuesta', tone: 'teal' },
  compartido: { label: 'Compartido', tone: 'violet' },
};

export function formatActivityType(type) {
  const key = String(type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return TYPE_MAP[key] || { label: capitalize(type || 'Actividad'), tone: 'neutral' };
}

export function activityTypeBadge(type) {
  const { label, tone } = formatActivityType(type);
  return `<span class="pill pill-${tone}">${escapeHtml(label)}</span>`;
}

const REASON_MAP = {
  USUARIO_NO_EXISTE_EN_PADRON: 'Miembro no encontrado',
  USUARIO_ELIMINADO_POR_ADMIN: 'Miembro dado de baja',
};

export function formatReviewReason(reason) {
  return REASON_MAP[reason] || capitalize(String(reason || 'Pendiente de revisión').toLowerCase().replaceAll('_', ' '));
}

const ENTITY_MAP = {
  usuarios: 'Miembros de la comunidad',
  interacciones: 'Actividad de la comunidad',
};

export function formatImportEntity(entity) {
  return ENTITY_MAP[String(entity || '').toLowerCase()] || capitalize(entity || 'Registro');
}

export function formatConsent(consent) {
  return consent === 'si' ? 'Autorizada' : 'Protegida';
}

export function formatSentiment(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return { score: '—', label: 'Sin dato', tone: 'neutral' };
  }
  const n = Number(value);
  const score = `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
  if (n >= 0.35) return { score, label: 'Muy positivo', tone: 'success' };
  if (n >= 0.05) return { score, label: 'Positivo', tone: 'teal' };
  if (n > -0.15) return { score, label: 'Neutral', tone: 'neutral' };
  return { score, label: 'En alerta', tone: 'danger' };
}

export function capitalize(str) {
  const s = String(str || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const AVATAR_PALETTES = [
  { bg: '#e0e7ff', fg: '#3730a3' },
  { bg: '#d1fae5', fg: '#065f46' },
  { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#e0f2fe', fg: '#075985' },
  { bg: '#ede9fe', fg: '#5b21b6' },
  { bg: '#ffedd5', fg: '#9a3412' },
  { bg: '#ccfbf1', fg: '#115e59' },
];

export function getAvatarProps(name) {
  const clean = String(name || 'M').trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : clean.slice(0, 2).toUpperCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  const palette = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  return { initials, ...palette };
}

export function avatarHtml(name, size = '') {
  const { initials, bg, fg } = getAvatarProps(name);
  return `<span class="member-avatar ${size}" style="background:${bg};color:${fg}" aria-hidden="true">${escapeHtml(initials)}</span>`;
}
