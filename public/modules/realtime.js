export function connectRealtime(token, { onStatus, onEvent } = {}) {
  if (typeof window.io !== 'function' || !token) {
    onStatus?.('offline');
    return { disconnect() {} };
  }

  onStatus?.('connecting');

  const socket = window.io({
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 8000,
  });

  socket.on('connect', () => onStatus?.('live'));
  socket.on('disconnect', () => onStatus?.('reconnecting'));
  socket.on('connect_error', () => onStatus?.('offline'));

  const events = [
    'interaccion:creada',
    'interaccion:actualizada',
    'interaccion:eliminada',
    'analytics:actualizado',
  ];

  for (const name of events) {
    socket.on(name, (payload) => {
      onEvent?.(name, payload);
    });
  }

  return {
    disconnect() {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch {}
    },
  };
}
