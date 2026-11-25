module.exports = (...roles) => (req, res, next) => req.user && roles.includes(req.user.rol) ? next() : res.status(403).json({ error: 'No tienes permisos para esta operación.' });
