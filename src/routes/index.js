const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/mariadb');
const authController = require('../controllers/auth.controller');
const ddb = require('../services/dynamo.service');
const cache = require('../services/cache.service');
const { getAnalyticsSummary, logDynamoDegraded } = require('../services/analytics.service');
const { emitInteractionChange } = require('../services/realtime.service');
const auth = require('../middlewares/auth.middleware');
const adminOnly = require('../middlewares/rbac.middleware');
const loginLimit = require('../middlewares/rateLimit.middleware');
const validate = require('../middlewares/validate.middleware');
const S = require('../validators/schemas');
const { DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { interactionsTable, quarantineTable } = require('../config/dynamodb');

const router = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const userCols = [
  'id_usuario', 'alias', 'fecha_ingreso', 'ciudad_id', 'latitud', 'longitud',
  'rango_edad', 'especie_fursona', 'interes_principal', 'plataforma_principal',
  'es_artista', 'mensajes_30d', 'reacciones_30d', 'eventos_asistidos',
  'comisiones_compradas', 'sentimiento_promedio', 'ultima_actividad', 'estatus',
  'consentimiento_datos',
];
const privateLocationCols = new Set(['ciudad_id', 'latitud', 'longitud']);

function safeUserSelect(alias = 'u') {
  return userCols
    .map((col) =>
      privateLocationCols.has(col)
        ? `CASE WHEN ${alias}.consentimiento_datos='si' THEN ${alias}.${col} ELSE NULL END AS ${col}`
        : `${alias}.${col}`
    )
    .join(',');
}

const insertUserSql = `INSERT INTO usuarios (${userCols.join(',')}) VALUES (${userCols.map(() => '?').join(',')})`;
function userValues(u) {
  return userCols.map((k) => (u[k] === undefined ? null : u[k]));
}

function integerQuery(value, fallback, key) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || (key === 'page' && n > 1000000)) {
    const e = new Error(`${key} debe ser un entero positivo${key === 'page' ? ' menor o igual a 1000000' : ''}.`);
    e.status = 400;
    throw e;
  }
  return n;
}

function pageArgs(req) {
  return {
    page: integerQuery(req.query.page, 1, 'page'),
    limit: Math.min(100, integerQuery(req.query.limit, 20, 'limit')),
  };
}

function ddbPageArgs(req) {
  return {
    limit: Math.min(100, integerQuery(req.query.limit, 20, 'limit')),
    cursor: req.query.cursor,
  };
}

function interactionFilters(q) {
  const date = (value, key, isEnd) => {
    if (value === undefined || value === '') return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const d = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
        throw Object.assign(new Error(`${key} debe ser una fecha ISO válida.`), { status: 400 });
      }
      return isEnd ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
    }
    if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || Number.isNaN(Date.parse(value))) {
      throw Object.assign(new Error(`${key} debe usar formato ISO-8601 UTC.`), { status: 400 });
    }
    return new Date(value).toISOString();
  };
  const desde = date(q.desde, 'desde', false);
  const hasta = date(q.hasta, 'hasta', true);
  if (desde && hasta && desde > hasta) {
    throw Object.assign(new Error('La fecha inicial no puede ser posterior a la fecha final.'), { status: 400 });
  }
  if (q.ubicacion_autorizada !== undefined && !['true', 'false'].includes(q.ubicacion_autorizada)) {
    throw Object.assign(new Error('ubicacion_autorizada debe ser true o false.'), { status: 400 });
  }
  return {
    canal: q.canal,
    tipo: q.tipo,
    tema: q.tema,
    ubicacion_autorizada: q.ubicacion_autorizada === undefined ? undefined : q.ubicacion_autorizada === 'true',
    desde,
    hasta,
  };
}

function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function withoutLocation(item) {
  const safe = { ...item, ubicacion_autorizada: false };
  delete safe.ubicacion;
  return safe;
}

function normalizeInteractionForSave(input, hasConsent) {
  const clean = {
    ...input,
    tipo: String(input.tipo || '').toLowerCase(),
    etiquetas: [...new Set((input.etiquetas || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean))],
  };

  if (clean.tipo === 'reaccion' || !clean.texto || !String(clean.texto).trim()) {
    clean.longitud_texto = 0;
    delete clean.texto;
  } else {
    clean.texto = String(clean.texto).trim();
    clean.longitud_texto = clean.texto.length;
  }

  clean.ubicacion_autorizada = Boolean(hasConsent) && input.ubicacion_autorizada === true;
  if (!clean.ubicacion_autorizada || !clean.ubicacion) {
    delete clean.ubicacion;
  }
  return clean;
}

async function filterUnauthorizedLocations(items) {
  if (!items.length) return items;
  const ids = [...new Set(items.map((item) => item.id_usuario).filter(Boolean))];
  if (!ids.length) return items.map((item) => withoutLocation(item));
  const [userRows] = await pool.query(
    `SELECT id_usuario, alias, consentimiento_datos FROM usuarios WHERE id_usuario IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const allowed = new Set();
  const aliasMap = new Map();
  for (const row of userRows) {
    aliasMap.set(row.id_usuario, row.alias);
    if (row.consentimiento_datos === 'si') allowed.add(row.id_usuario);
  }
  return items.map((item) => {
    const base = allowed.has(item.id_usuario) ? { ...item } : withoutLocation(item);
    if (aliasMap.has(item.id_usuario)) base.alias_usuario = aliasMap.get(item.id_usuario);
    return base;
  });
}

async function filterQuarantinePrivacy(items) {
  if (!items.length) return items;
  const ids = [
    ...new Set(items.map((item) => item.id_usuario_referenciado).filter((id) => /^U\d{6}$/.test(String(id || '')))),
  ];
  const [allowedRows] = ids.length
    ? await pool.query(
        `SELECT id_usuario FROM usuarios WHERE consentimiento_datos='si' AND id_usuario IN (${ids.map(() => '?').join(',')})`,
        ids
      )
    : [[]];
  const allowed = new Set(allowedRows.map((row) => row.id_usuario));
  return items.map((item) => {
    const original = { ...(item.registro_original || {}) };
    if (!allowed.has(item.id_usuario_referenciado)) {
      delete original.ubicacion;
      delete original.ubicacion_autorizada;
      delete original.pais;
      delete original.estado;
      delete original.ciudad;
    }
    return { ...item, registro_original: original };
  });
}

async function saveQuarantine(item, allowSameDeletion = false) {
  try {
    await ddb.quarantineItem(item);
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
    if (allowSameDeletion && item.motivo_rechazo === 'USUARIO_ELIMINADO_POR_ADMIN') {
      const { Item } = await ddb.send(
        new GetCommand({ TableName: quarantineTable, Key: { id_interaccion: item.id_interaccion } })
      );
      if (
        Item?.motivo_rechazo === item.motivo_rechazo &&
        Item?.id_usuario_referenciado === item.id_usuario_referenciado
      ) {
        return;
      }
    }
    const conflict = new Error('Ya existe un registro pendiente con ese identificador.');
    conflict.status = 409;
    throw conflict;
  }
}

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'community360', timestamp: new Date().toISOString() });
});

router.post('/auth/login', loginLimit, validate(S.login), authController.login);
router.post('/auth/register', loginLimit, validate(S.admin), authController.register);
router.use(auth);
router.get('/auth/me', authController.me);
router.post('/auth/change-password', validate(S.changePassword), authController.changePassword);

router.get(
  '/admins',
  adminOnly('admin'),
  asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(
      'SELECT admin_id,username,email,rol,activo,creado_en FROM administradores_auth ORDER BY admin_id'
    );
    res.json(rows);
  })
);

router.post(
  '/admins',
  adminOnly('admin'),
  validate(S.admin),
  asyncRoute(async (req, res) => {
    const hash = await bcrypt.hash(req.body.password, 10);
    try {
      const [r] = await pool.execute(
        'INSERT INTO administradores_auth(username,email,password_hash,rol,activo) VALUES(?,?,?,?,1)',
        [req.body.username, req.body.email, hash, req.body.rol]
      );
      res.status(201).json({
        admin_id: r.insertId,
        username: req.body.username,
        email: req.body.email,
        rol: req.body.rol,
        activo: 1,
      });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'El nombre de usuario o correo ya está registrado.' });
      }
      throw e;
    }
  })
);

router.patch(
  '/admins/:id/activo',
  adminOnly('admin'),
  validate(S.adminActive),
  asyncRoute(async (req, res) => {
    const active = req.body.activo;
    if (Number(req.params.id) === req.user.admin_id && active === 0) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    const [r] = await pool.execute('UPDATE administradores_auth SET activo=? WHERE admin_id=?', [
      active,
      req.params.id,
    ]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    res.json({ message: 'Estado actualizado.' });
  })
);

router.delete(
  '/admins/:id',
  adminOnly('admin'),
  asyncRoute(async (req, res) => {
    if (Number(req.params.id) === req.user.admin_id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    }
    const [r] = await pool.execute('DELETE FROM administradores_auth WHERE admin_id=?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    res.status(204).end();
  })
);

router.get(
  '/catalogos/ubicaciones',
  asyncRoute(async (req, res) => {
    const result = await cache.getOrLoad('ubicaciones', 300000, async () => {
      const [rows] = await pool.execute(
        'SELECT p.pais_id,p.nombre AS pais,e.estado_id,e.nombre AS estado,c.ciudad_id,c.nombre AS ciudad,c.zona_horaria FROM paises p LEFT JOIN estados e ON e.pais_id=p.pais_id LEFT JOIN ciudades c ON c.estado_id=e.estado_id ORDER BY p.nombre,e.nombre,c.nombre'
      );
      const map = new Map();
      for (const r of rows) {
        if (!map.has(r.pais_id)) map.set(r.pais_id, { pais_id: r.pais_id, nombre: r.pais, estados: [] });
        const p = map.get(r.pais_id);
        if (r.estado_id) {
          let e = p.estados.find((x) => x.estado_id === r.estado_id);
          if (!e) {
            e = { estado_id: r.estado_id, nombre: r.estado, ciudades: [] };
            p.estados.push(e);
          }
          if (r.ciudad_id) e.ciudades.push({ ciudad_id: r.ciudad_id, nombre: r.ciudad, zona_horaria: r.zona_horaria });
        }
      }
      return [...map.values()];
    });
    res.json(result);
  })
);

function buildUserFilter(q) {
  const conditions = [];
  const values = [];
  const add = (col, key) => {
    if (q[key] !== undefined && q[key] !== '') {
      conditions.push(`u.${col} = ?`);
      values.push(q[key]);
    }
  };
  if (q.q) {
    conditions.push('(u.id_usuario LIKE ? OR u.alias LIKE ?)');
    values.push(`%${q.q}%`, `%${q.q}%`);
  }
  add('id_usuario', 'id_usuario');
  if (q.alias) {
    conditions.push('u.alias LIKE ?');
    values.push(`%${q.alias}%`);
  }
  add('estatus', 'estatus');
  add('plataforma_principal', 'plataforma_principal');
  add('rango_edad', 'rango_edad');
  add('es_artista', 'es_artista');
  add('consentimiento_datos', 'consentimiento_datos');
  add('ciudad_id', 'ciudad_id');
  if (q.ciudad_nombre) {
    conditions.push('c.nombre = ?');
    values.push(q.ciudad_nombre);
  }
  if (q.pais_id) {
    conditions.push('c.estado_id IN (SELECT estado_id FROM estados WHERE pais_id = ?)');
    values.push(q.pais_id);
  }
  return {
    where: `LEFT JOIN ciudades c ON c.ciudad_id=u.ciudad_id AND u.consentimiento_datos='si' ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}`,
    values,
  };
}

router.get(
  '/usuarios/export/csv',
  asyncRoute(async (req, res) => {
    const { where, values } = buildUserFilter(req.query);
    const [rows] = await pool.execute(`SELECT ${safeUserSelect()} FROM usuarios u ${where} ORDER BY u.id_usuario`, values);
    const csv = [userCols.join(','), ...rows.map((r) => userCols.map((k) => csvCell(r[k])).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="community360-miembros.csv"');
    res.send('\uFEFF' + csv);
  })
);

router.get(
  '/usuarios',
  asyncRoute(async (req, res) => {
    const { page, limit } = pageArgs(req);
    const sortAllow = new Set(['id_usuario', 'alias', 'fecha_ingreso', 'ultima_actividad', 'estatus', 'sentimiento_promedio']);
    const sort = sortAllow.has(req.query.sort) ? req.query.sort : 'id_usuario';
    const dir = String(req.query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const { where, values } = buildUserFilter(req.query);
    const [[count]] = await pool.execute(`SELECT COUNT(*) total FROM usuarios u ${where}`, values);
    const [rows] = await pool.execute(
      `SELECT ${safeUserSelect()} FROM usuarios u ${where} ORDER BY u.${sort} ${dir} LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit]
    );
    res.json({ items: rows, page, limit, total: count.total, totalPages: Math.ceil(count.total / limit) });
  })
);

router.get(
  '/usuarios/:id',
  asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT ${safeUserSelect()},c.nombre ciudad,e.nombre estado,p.nombre pais FROM usuarios u LEFT JOIN ciudades c ON c.ciudad_id=u.ciudad_id AND u.consentimiento_datos='si' LEFT JOIN estados e ON e.estado_id=c.estado_id LEFT JOIN paises p ON p.pais_id=e.pais_id WHERE u.id_usuario=?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Miembro no encontrado.' });

    let interacciones = [];
    let nextCursor = null;
    let interacciones_disponibles = true;
    try {
      const result = await ddb.queryByUser(
        req.params.id,
        Math.min(100, integerQuery(req.query.limit, 20, 'limit')),
        req.query.cursor
      );
      interacciones = await filterUnauthorizedLocations(result.items);
      nextCursor = result.nextCursor;
    } catch (err) {
      interacciones_disponibles = false;
      logDynamoDegraded(`GET /api/usuarios/${req.params.id}`, err);
    }

    res.json({ user: rows[0], interacciones, nextCursor, interacciones_disponibles });
  })
);

router.post(
  '/usuarios',
  adminOnly('admin'),
  validate(S.user),
  asyncRoute(async (req, res) => {
    const u = { ...req.body };
    if (u.consentimiento_datos === 'no') {
      u.ciudad_id = u.latitud = u.longitud = null;
    } else if (u.ciudad_id) {
      const [c] = await pool.execute('SELECT ciudad_id FROM ciudades WHERE ciudad_id=?', [u.ciudad_id]);
      if (!c.length) return res.status(400).json({ error: 'La ciudad seleccionada no existe.' });
    }
    try {
      await pool.execute(insertUserSql, userValues(u));
      cache.clear();
      res.status(201).json({ user: u });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: String(e.message).includes('alias') ? 'El alias ya está registrado.' : 'El ID de miembro ya está registrado.',
        });
      }
      throw e;
    }
  })
);

router.put(
  '/usuarios/:id',
  adminOnly('admin'),
  validate(S.user),
  asyncRoute(async (req, res) => {
    if (req.params.id !== req.body.id_usuario) {
      return res.status(400).json({ error: 'El identificador del miembro no coincide con la ruta.' });
    }
    const [prev] = await pool.execute('SELECT consentimiento_datos FROM usuarios WHERE id_usuario=?', [req.params.id]);
    if (!prev.length) return res.status(404).json({ error: 'Miembro no encontrado.' });
    const u = { ...req.body };
    if (u.consentimiento_datos === 'no') {
      u.ciudad_id = u.latitud = u.longitud = null;
    } else if (u.ciudad_id) {
      const [c] = await pool.execute('SELECT ciudad_id FROM ciudades WHERE ciudad_id=?', [u.ciudad_id]);
      if (!c.length) return res.status(400).json({ error: 'La ciudad seleccionada no existe.' });
    }
    const sets = userCols.slice(1).map((c) => `${c}=?`).join(',');
    try {
      await pool.execute(`UPDATE usuarios SET ${sets} WHERE id_usuario=?`, [
        ...userCols.slice(1).map((c) => u[c] ?? null),
        req.params.id,
      ]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El alias ya está registrado.' });
      if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'La ciudad seleccionada no existe.' });
      throw e;
    }
    cache.clear();
    if (u.consentimiento_datos === 'no') {
      try {
        await ddb.redactUserLocation(req.params.id);
      } catch (err) {
        logDynamoDegraded(`PUT /api/usuarios/${req.params.id} redactUserLocation`, err);
      }
    }
    res.json({ user: u });
  })
);

router.delete(
  '/usuarios/:id',
  adminOnly('admin'),
  asyncRoute(async (req, res) => {
    const [users] = await pool.execute('SELECT consentimiento_datos FROM usuarios WHERE id_usuario=?', [req.params.id]);
    if (!users.length) return res.status(404).json({ error: 'Miembro no encontrado.' });
    const items = await ddb.allByUser(req.params.id);
    if (items.length && req.query.cascade !== 'quarantine') {
      return res.status(409).json({
        error: 'Este miembro tiene actividad asociada. Confirma la acción para conservar sus registros en la bandeja de revisión.',
      });
    }
    if (items.length) {
      for (const i of items) {
        const original = users[0].consentimiento_datos === 'si' ? i : withoutLocation(i);
        await saveQuarantine(
          {
            id_interaccion: i.id_interaccion,
            id_usuario_referenciado: req.params.id,
            motivo_rechazo: 'USUARIO_ELIMINADO_POR_ADMIN',
            regla_violada: 'ELIMINACION_CONTROLADA',
            fecha_cuarentena: new Date().toISOString(),
            archivo_origen: 'admin-api',
            registro_original: original,
          },
          true
        );
        cache.clear();
        await ddb.removeInteraction(i.id_interaccion);
        cache.clear();
      }
    }
    const [r] = await pool.execute('DELETE FROM usuarios WHERE id_usuario=?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Miembro no encontrado.' });
    cache.clear();
    res.status(204).end();
  })
);

// =========================================================================
// FASE 4 & 5: API REST COMPLETA DE INTERACCIONES + EVENTOS WEBSOCKET
// =========================================================================
router.get(
  '/interacciones',
  asyncRoute(async (req, res) => {
    const pageOpts = ddbPageArgs(req);
    const filters = interactionFilters(req.query);
    const isUnfilteredFirstPage =
      !req.query.id_usuario &&
      !req.query.canal &&
      !pageOpts.cursor &&
      !filters.tipo &&
      !filters.tema &&
      filters.ubicacion_autorizada === undefined &&
      !filters.desde &&
      !filters.hasta;

    const load = async () => {
      const data = await ddb.listInteractions({
        userId: req.query.id_usuario,
        channel: req.query.canal,
        ...pageOpts,
        filters,
      });
      data.items = await filterUnauthorizedLocations(data.items);
      return data;
    };

    const data = isUnfilteredFirstPage
      ? await cache.getOrLoad(`interacciones:p1:${pageOpts.limit}`, 30000, load)
      : await load();
    res.json(data);
  })
);

router.get(
  '/interacciones/:id',
  asyncRoute(async (req, res) => {
    const item = await ddb.getInteraction(req.params.id);
    if (!item) return res.status(404).json({ error: 'Interacción no encontrada.' });
    const [safeItem] = await filterUnauthorizedLocations([item]);
    res.json({ item: safeItem });
  })
);

router.post(
  '/interacciones',
  adminOnly('admin'),
  validate(S.interaction),
  asyncRoute(async (req, res) => {
    const input = req.body;
    const [users] = await pool.execute('SELECT alias, consentimiento_datos FROM usuarios WHERE id_usuario=?', [input.id_usuario]);
    if (!users.length) {
      if (req.query.allowQuarantine !== 'true') {
        return res.status(422).json({ error: 'El identificador de miembro indicado no existe.' });
      }
      const existingInteraction = await ddb.getInteraction(input.id_interaccion);
      if (existingInteraction) return res.status(409).json({ error: 'Ya existe una publicación o reacción con ese ID.' });
      const original = { ...input };
      delete original.ubicacion;
      delete original.ubicacion_autorizada;
      try {
        await saveQuarantine({
          id_interaccion: input.id_interaccion,
          id_usuario_referenciado: input.id_usuario,
          motivo_rechazo: 'USUARIO_NO_EXISTE_EN_PADRON',
          regla_violada: 'INTEGRIDAD_REFERENCIAL_ID_USUARIO',
          fecha_cuarentena: new Date().toISOString(),
          archivo_origen: 'admin-api',
          registro_original: original,
        });
        cache.clear();
      } catch (err) {
        if (err.status === 409) return res.status(409).json({ error: err.message });
        throw err;
      }
      return res.status(202).json({ message: 'Actividad enviada a la bandeja de revisión.' });
    }

    const clean = normalizeInteractionForSave(input, users[0].consentimiento_datos === 'si');
    try {
      await ddb.putInteraction(clean);
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        return res.status(409).json({ error: 'Ya existe una actividad con ese identificador.' });
      }
      throw err;
    }

    const [latest] = await pool.execute('SELECT alias, consentimiento_datos FROM usuarios WHERE id_usuario=?', [input.id_usuario]);
    if (!latest.length || latest[0].consentimiento_datos === 'no') {
      await ddb.redactInteraction(clean.id_interaccion);
      clean.ubicacion_autorizada = false;
      delete clean.ubicacion;
    }
    const enriched = { ...clean, alias_usuario: latest[0]?.alias || users[0]?.alias };

    await emitInteractionChange('interaccion:creada', { item: enriched });
    res.status(201).json({ message: 'Interacción creada correctamente.', item: enriched });
  })
);

async function handleUpdateInteraction(req, res) {
  const id = req.params.id;
  if (req.body.id_interaccion && req.body.id_interaccion !== id) {
    return res.status(400).json({ error: 'id_interaccion en el cuerpo debe coincidir con el parámetro de la ruta.' });
  }

  const existing = await ddb.getInteraction(id);
  if (!existing) {
    return res.status(404).json({ error: 'Interacción no encontrada.' });
  }

  const mergedCandidate = {
    ...existing,
    ...req.body,
    id_interaccion: id,
  };

  if (req.body.texto === null) {
    delete mergedCandidate.texto;
  }
  if (req.body.ubicacion === null) {
    delete mergedCandidate.ubicacion;
  }

  const validated = S.interaction.safeParse(mergedCandidate);
  if (!validated.success) {
    return res.status(400).json({
      error: 'Datos inválidos para actualizar la interacción.',
      details: validated.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const [users] = await pool.execute('SELECT alias, consentimiento_datos FROM usuarios WHERE id_usuario=?', [
    validated.data.id_usuario,
  ]);
  if (!users.length) {
    return res.status(422).json({ error: 'El identificador de miembro indicado no existe.' });
  }

  const clean = normalizeInteractionForSave(validated.data, users[0].consentimiento_datos === 'si');
  try {
    await ddb.replaceInteraction(clean);
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return res.status(404).json({ error: 'Interacción no encontrada.' });
    }
    throw err;
  }

  const [latest] = await pool.execute('SELECT alias, consentimiento_datos FROM usuarios WHERE id_usuario=?', [clean.id_usuario]);
  if (!latest.length || latest[0].consentimiento_datos === 'no') {
    await ddb.redactInteraction(clean.id_interaccion);
    clean.ubicacion_autorizada = false;
    delete clean.ubicacion;
  }
  const enriched = { ...clean, alias_usuario: latest[0]?.alias || users[0]?.alias };

  await emitInteractionChange('interaccion:actualizada', { item: enriched });
  res.status(200).json({ message: 'Interacción actualizada correctamente.', item: enriched });
}

router.put('/interacciones/:id', adminOnly('admin'), validate(S.interactionPatch), asyncRoute(handleUpdateInteraction));
router.patch('/interacciones/:id', adminOnly('admin'), validate(S.interactionPatch), asyncRoute(handleUpdateInteraction));

router.delete(
  '/interacciones/:id',
  adminOnly('admin'),
  asyncRoute(async (req, res) => {
    const id = req.params.id;
    let deletedItem;
    try {
      deletedItem = await ddb.deleteInteractionIfExists(id);
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        return res.status(404).json({ error: 'Interacción no encontrada.' });
      }
      throw err;
    }

    await emitInteractionChange('interaccion:eliminada', {
      id_interaccion: id,
      item: deletedItem ? withoutLocation(deletedItem) : null,
    });
    res.status(200).json({ message: 'Interacción eliminada correctamente.', id_interaccion: id });
  })
);

router.get(
  '/cuarentena',
  asyncRoute(async (req, res) => {
    const pageOpts = ddbPageArgs(req);
    const isUnfilteredFirstPage =
      !req.query.motivo_rechazo && !req.query.id_usuario_referenciado && !pageOpts.cursor;

    const load = async () => {
      const data = await ddb.listQuarantine({
        reason: req.query.motivo_rechazo,
        userId: req.query.id_usuario_referenciado,
        ...pageOpts,
      });
      data.items = await filterQuarantinePrivacy(data.items);
      return data;
    };

    const data = isUnfilteredFirstPage
      ? await cache.getOrLoad(`cuarentena:p1:${pageOpts.limit}`, 30000, load)
      : await load();
    res.json(data);
  })
);

router.get(
  '/cuarentena/:id',
  asyncRoute(async (req, res) => {
    const { Item } = await ddb.send(
      new GetCommand({ TableName: quarantineTable, Key: { id_interaccion: req.params.id } })
    );
    if (!Item) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ item: (await filterQuarantinePrivacy([Item]))[0] });
  })
);

router.post(
  '/cuarentena/:id/reprocesar',
  adminOnly('admin'),
  validate(S.reprocess),
  asyncRoute(async (req, res) => {
    const { Item: q } = await ddb.send(
      new GetCommand({ TableName: quarantineTable, Key: { id_interaccion: req.params.id } })
    );
    if (!q) return res.status(404).json({ error: 'Registro no encontrado.' });
    const userId = req.body.id_usuario;
    const [us] = await pool.execute('SELECT consentimiento_datos FROM usuarios WHERE id_usuario=?', [userId]);
    if (!us.length) return res.status(422).json({ error: 'El miembro seleccionado no existe.' });
    const o = q.registro_original || {};
    const rawTags = Array.isArray(o.etiquetas)
      ? o.etiquetas
      : typeof o.etiquetas_raw === 'string'
        ? o.etiquetas_raw.split('|')
        : [];
    const item = {
      id_interaccion: q.id_interaccion,
      id_usuario: userId,
      timestamp: o.timestamp || q.fecha_cuarentena,
      canal: o.canal || 'desconocido',
      tipo: String(o.tipo || 'mensaje').toLowerCase(),
      tema: o.tema || 'sin_clasificar',
      sentimiento: Number(o.sentimiento) || 0,
      idioma: o.idioma || 'es',
      dispositivo: o.dispositivo || 'desconocido',
      longitud_texto: o.tipo === 'reaccion' || !o.texto ? 0 : String(o.texto).length,
      reacciones_recibidas: Math.max(0, Number(o.reacciones_recibidas) || 0),
      etiquetas: [...new Set(rawTags.map((x) => String(x).trim().toLowerCase()).filter(Boolean))],
      ubicacion_autorizada: us[0].consentimiento_datos === 'si' && Boolean(o.ubicacion_autorizada),
    };
    if (o.texto && item.longitud_texto) item.texto = String(o.texto).trim();
    if (item.ubicacion_autorizada && o.ubicacion) item.ubicacion = o.ubicacion;
    const checked = S.interaction.safeParse(item);
    if (!checked.success) {
      return res.status(422).json({
        error: 'El registro necesita correcciones antes de vincularse.',
        details: checked.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    try {
      await ddb.putInteraction(checked.data);
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
      const existing = await ddb.getInteraction(checked.data.id_interaccion);
      const sameRetry =
        existing?.id_usuario === userId &&
        existing?.timestamp === checked.data.timestamp &&
        existing?.canal === checked.data.canal;
      if (!sameRetry) return res.status(409).json({ error: 'Ya existe una actividad con ese identificador.' });
    }
    const [latest] = await pool.execute('SELECT consentimiento_datos FROM usuarios WHERE id_usuario=?', [userId]);
    const privateNow = !latest.length || latest[0].consentimiento_datos === 'no';
    if (privateNow) await ddb.redactInteraction(checked.data.id_interaccion);
    await ddb.send(new DeleteCommand({ TableName: quarantineTable, Key: { id_interaccion: q.id_interaccion } }));

    const finalItem = privateNow ? withoutLocation(checked.data) : checked.data;
    await emitInteractionChange('interaccion:creada', { item: finalItem, source: 'reproceso' });
    res.json({ message: 'Registro vinculado correctamente.', item: finalItem });
  })
);

router.get(
  '/bitacora',
  asyncRoute(async (req, res) => {
    const [r] = await pool.execute(
      'SELECT ejecucion_id,fecha_ejecucion,entidad_procesada,registros_recibidos,registros_aceptados,registros_transformados,registros_anonimizados,registros_rechazados,observaciones FROM bitacora_etl ORDER BY fecha_ejecucion DESC,ejecucion_id DESC'
    );
    res.json(r);
  })
);

router.get(
  '/analytics/mapa',
  asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(
      "SELECT c.nombre ciudad,p.nombre pais,u.latitud,u.longitud,u.estatus,u.sentimiento_promedio FROM usuarios u JOIN ciudades c ON c.ciudad_id=u.ciudad_id JOIN estados e ON e.estado_id=c.estado_id JOIN paises p ON p.pais_id=e.pais_id WHERE u.consentimiento_datos='si' AND u.latitud IS NOT NULL AND u.longitud IS NOT NULL"
    );
    res.json(rows);
  })
);

router.get(
  '/analytics/resumen',
  asyncRoute(async (req, res) => {
    const data = await getAnalyticsSummary();
    res.json(data);
  })
);

module.exports = router;
