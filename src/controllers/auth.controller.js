const authService = require('../services/auth.service');

exports.login = async (req, res, next) => {
  try {
    const result = await authService.authenticate(req.body.username, req.body.password);
    if (!result) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

exports.me = (req, res) => res.json({ user: req.user });

exports.changePassword = async (req, res, next) => {
  try {
    const changed = await authService.changePassword(
      req.user.admin_id,
      req.body.currentPassword,
      req.body.newPassword
    );
    if (!changed) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    res.json({ message: 'Contraseña actualizada.' });
  } catch (err) {
    next(err);
  }
};
