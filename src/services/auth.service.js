const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/mariadb');
const env = require('../config/env');
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

async function authenticate(username, password) {
  const [rows] = await pool.execute('SELECT admin_id, username, email, password_hash, rol, activo, creado_en FROM administradores_auth WHERE username = ? LIMIT 1', [username]);
  const account = rows[0];
  const passwordMatches = await bcrypt.compare(password, account?.password_hash || dummyHash);
  if (!account || account.activo !== 1 || !passwordMatches) return null;
  const token = jwt.sign({ sub: String(account.admin_id) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  const { password_hash, ...profile } = account;
  return { token, user: profile };
}

async function changePassword(adminId, currentPassword, newPassword) {
  const [rows] = await pool.execute('SELECT password_hash FROM administradores_auth WHERE admin_id=?', [adminId]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) return false;
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.execute('UPDATE administradores_auth SET password_hash=? WHERE admin_id=?', [hash, adminId]);
  return true;
}

module.exports = { authenticate, changePassword };
