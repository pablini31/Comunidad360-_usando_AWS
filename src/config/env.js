const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const isDevelopment = process.env.NODE_ENV === 'development';
const secret = process.env.JWT_SECRET || (isDevelopment ? require('crypto').randomBytes(32).toString('hex') : '');
if (!secret) throw new Error('JWT_SECRET es obligatorio para iniciar fuera de NODE_ENV=development.');
if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JWT_SECRET debe contener al menos 32 bytes.');
if (/^(REEMPLAZA|CHANGE_ME|CAMBIAR)/i.test(secret)) throw new Error('Reemplaza el valor de ejemplo de JWT_SECRET antes de iniciar.');

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un entero entre 1 y 65535.');

module.exports = Object.freeze({
  port,
  jwtSecret: secret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || '',
  nodeEnv: process.env.NODE_ENV || 'production',
});
