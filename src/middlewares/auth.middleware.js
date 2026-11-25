const jwt = require('jsonwebtoken');
const env = require('../config/env');
const pool = require('../config/mariadb');
async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Autenticación requerida.' });
    const payload = jwt.verify(token, env.jwtSecret);
    const [rows] = await pool.execute('SELECT admin_id, username, email, rol, activo, creado_en FROM administradores_auth WHERE admin_id = ? LIMIT 1', [payload.sub]);
    if (!rows.length || rows[0].activo !== 1) return res.status(401).json({ error: 'Sesión no válida o cuenta desactivada.' });
    req.user = rows[0]; next();
  } catch (err) { if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Sesión no válida o expirada.' }); next(err); }
}
module.exports = auth;
