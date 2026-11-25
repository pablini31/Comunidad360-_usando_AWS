export function createApi(getToken, onUnauthorized) {
  return async function api(path, options = {}) {
    const controller = new AbortController();
    const timeoutMs = path === '/api/analytics/resumen' ? 120000 : 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers || {}),
    };

    let response;
    try {
      response = await fetch(path, { ...options, headers, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('La solicitud tardó demasiado en responder. Intenta de nuevo.');
      }
      throw new Error('No fue posible conectar con el servidor. Verifica tu conexión.');
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401) {
      const isLogin = path === '/api/auth/login';
      if (!isLogin) {
        onUnauthorized('Tu sesión terminó. Inicia sesión nuevamente.');
      }
      let data = {};
      try {
        data = await response.json();
      } catch {}
      throw new Error(data.error || 'Usuario o contraseña incorrectos.');
    }

    if (!response.ok) {
      let data = {};
      try {
        data = await response.json();
      } catch {}
      const detailText = Array.isArray(data.details) && data.details.length
        ? ` (${data.details.map((d) => d.message).slice(0, 2).join(' · ')})`
        : '';
      throw new Error((data.error || `No se pudo completar la operación (${response.status}).`) + detailText);
    }

    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    return type.includes('json') ? response.json() : response.text();
  };
}
