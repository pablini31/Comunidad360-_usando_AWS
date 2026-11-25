const http = require('http');
const app = require('./app');
const env = require('./config/env');
const pool = require('./config/mariadb');
const { client } = require('./config/dynamodb');
const { initRealtime, closeRealtime } = require('./services/realtime.service');

let server = null;
let closing = false;

async function start() {
  try {
    await pool.query('SELECT 1');
    server = http.createServer(app);
    initRealtime(server);
    server.listen(env.port, () =>
      console.log(`Community 360 (REST + WebSockets) disponible en http://localhost:${env.port}`)
    );
    server.on('error', async (err) => {
      console.error(`No se pudo iniciar el servidor (${err.code || 'ERROR'}).`);
      await closeRealtime().catch(() => {});
      await pool.end().catch(() => {});
      client.destroy();
      process.exit(1);
    });
  } catch (err) {
    console.error(
      `No se pudo conectar a MariaDB para iniciar (${err.code || err.name || 'ERROR'}). Revisa la configuración y la conectividad.`
    );
    await pool.end().catch(() => {});
    client.destroy();
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: cerrando servicios...`);
  const close = async () => {
    try {
      await closeRealtime();
      await pool.end();
      client.destroy();
      process.exit(0);
    } catch (err) {
      console.error('Error al cerrar servicios:', err.name || 'ERROR');
      process.exit(1);
    }
  };
  if (server) server.close(close);
  else await close();
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
start();
