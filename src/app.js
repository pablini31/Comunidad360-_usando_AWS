const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
        'style-src': [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://unpkg.com',
          'https://fonts.googleapis.com',
        ],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://*.basemaps.cartocdn.com',
          'https://*.cartocdn.com',
          'https://server.arcgisonline.com',
          'https://services.arcgisonline.com',
          'https://unpkg.com',
        ],
        'connect-src': [
          "'self'",
          'ws:',
          'wss:',
          'https://*.basemaps.cartocdn.com',
          'https://*.cartocdn.com',
          'https://server.arcgisonline.com',
          'https://services.arcgisonline.com',
          'https://cdn.jsdelivr.net',
          'https://unpkg.com',
        ],
      },
    },
  })
);

app.use(cors({ origin: env.corsOrigin ? env.corsOrigin.split(',').map((s) => s.trim()) : false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { skip: (req) => req.path.startsWith('/api/') }));
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'community360', timestamp: new Date().toISOString() });
});

app.use(
  '/api',
  (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  },
  routes
);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
