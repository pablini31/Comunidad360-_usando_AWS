module.exports = (schema, source = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos.', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  req[source] = parsed.data; next();
};
