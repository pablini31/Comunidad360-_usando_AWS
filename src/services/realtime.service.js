const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const pool = require('../config/mariadb');
const cache = require('./cache.service');
const { getAnalyticsSummary } = require('./analytics.service');

let io = null;

function initRealtime(httpServer) {
  const allowedOrigins = env.corsOrigin
    ? env.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
    : true;

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
      if (!rawToken) {
        return next(new Error('Autenticación requerida.'));
      }
      const payload = jwt.verify(rawToken, env.jwtSecret);
      const [rows] = await pool.execute(
        'SELECT admin_id, username, email, rol, activo FROM administradores_auth WHERE admin_id = ? LIMIT 1',
        [payload.sub]
      );
      if (!rows.length || rows[0].activo !== 1) {
        return next(new Error('Sesión no válida o cuenta desactivada.'));
      }
      socket.user = rows[0];
      return next();
    } catch {
      return next(new Error('Sesión no válida o expirada.'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('realtime:conectado', {
      status: 'connected',
      rol: socket.user?.rol || 'analista',
      timestamp: new Date().toISOString(),
    });
  });

  return io;
}

async function emitInteractionChange(eventName, payload) {
  cache.clear();
  if (!io) return;

  const eventPayload = {
    ...payload,
    timestamp: new Date().toISOString(),
  };

  io.emit(eventName, eventPayload);

  try {
    const summary = await getAnalyticsSummary({ forceRefresh: true });
    io.emit('analytics:actualizado', summary);
  } catch (err) {
    console.error(`[Realtime] Error recalculando resumen tras ${eventName}:`, err?.message || err);
  }
}

function getIo() {
  return io;
}

async function closeRealtime() {
  if (!io) return;
  const current = io;
  io = null;
  await new Promise((resolve) => current.close(() => resolve()));
}

module.exports = { initRealtime, emitInteractionChange, getIo, closeRealtime };
