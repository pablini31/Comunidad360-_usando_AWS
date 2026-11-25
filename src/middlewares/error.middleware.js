function notFound(req, res, next) {
  const e = new Error(`Ruta no encontrada: ${req.method} ${req.path}`);
  e.status = 404;
  next(e);
}

function classifyError(err) {
  const name = err?.name || '';
  const code = err?.code || '';

  if (err?.status) {
    return { status: err.status, clientMessage: err.message, reason: name || 'HttpError' };
  }

  if (name === 'ZodError') {
    return { status: 400, clientMessage: 'Los datos enviados no son válidos.', reason: 'ZodError' };
  }

  if (name === 'InvalidSignatureException' || name === 'UnrecognizedClientException' || name === 'CredentialsProviderError') {
    return {
      status: 503,
      clientMessage: 'El servicio de actividad comunitaria no pudo autenticarse. Contacta al administrador del sistema.',
      reason: `${name} (revisa AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY y AWS_REGION en .env)`,
    };
  }

  if (name === 'AccessDeniedException') {
    return {
      status: 503,
      clientMessage: 'El servicio de actividad comunitaria no tiene permisos suficientes en este momento.',
      reason: `${name} (permisos IAM insuficientes para DynamoDB)`,
    };
  }

  if (name === 'ResourceNotFoundException') {
    return {
      status: 503,
      clientMessage: 'El origen de actividad comunitaria no está disponible temporalmente.',
      reason: `${name} (tabla o región DynamoDB no encontrada)`,
    };
  }

  if (/Throttling|ProvisionedThroughputExceeded|RequestLimitExceeded/i.test(name)) {
    return {
      status: 503,
      clientMessage: 'Alta demanda temporal al consultar la actividad. Intenta de nuevo en unos segundos.',
      reason: `${name} (límite de capacidad excedido)`,
    };
  }

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || name === 'TimeoutError') {
    return {
      status: 503,
      clientMessage: 'No fue posible conectar con el servicio de datos en este momento. Intenta nuevamente.',
      reason: `${code || name} (error de conectividad)`,
    };
  }

  return {
    status: 500,
    clientMessage: 'Ocurrió un error inesperado al procesar tu solicitud.',
    reason: name || code || 'UnhandledError',
  };
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const { status, clientMessage, reason } = classifyError(err);

  if (status >= 500) {
    const awsMeta = err?.$metadata?.httpStatusCode
      ? ` [AWS HTTP ${err.$metadata.httpStatusCode}${err.$metadata.requestId ? ` reqId=${err.$metadata.requestId}` : ''}]`
      : '';
    const firstLine = String(err?.message || '').split('\n')[0];
    console.error(`[ERROR ${status}] ${req.method} ${req.originalUrl} -> ${reason}${awsMeta}: ${firstLine}`);
  } else if (status >= 400 && status !== 404 && status !== 401) {
    console.warn(`[WARN ${status}] ${req.method} ${req.originalUrl}: ${err?.message || reason}`);
  }

  res.status(status).json({
    error: clientMessage,
    ...(err?.details ? { details: err.details } : {}),
  });
}

module.exports = { notFound, errorHandler, classifyError };
