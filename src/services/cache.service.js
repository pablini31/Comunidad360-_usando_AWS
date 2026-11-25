const cache = new Map();
const inflight = new Map();

function get(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function set(key, value, ttl = 60000) {
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}

function del(key) {
  cache.delete(key);
}

function clear() {
  cache.clear();
}

async function getOrLoad(key, ttl, loader, shouldCache = () => true) {
  const hit = get(key);
  if (hit !== null) return hit;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = Promise.resolve()
    .then(loader)
    .then((result) => {
      if (shouldCache(result)) {
        set(key, result, ttl);
      }
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

module.exports = { get, set, del, clear, getOrLoad };
