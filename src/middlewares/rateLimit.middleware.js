const { rateLimit } = require('express-rate-limit');
module.exports = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiados intentos. Intenta más tarde.' } });
