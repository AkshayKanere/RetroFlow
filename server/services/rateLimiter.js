export function createRateLimiter(windowMs, maxRequests) {
  const requests = new Map();

  function cleanup(key, now) {
    const timestamps = requests.get(key);
    if (!timestamps) return;
    const cutoff = now - windowMs;
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }
    if (timestamps.length === 0) {
      requests.delete(key);
    }
  }

  return function isAllowed(key) {
    const now = Date.now();
    cleanup(key, now);
    const timestamps = requests.get(key) || [];
    if (timestamps.length >= maxRequests) {
      return false;
    }
    timestamps.push(now);
    requests.set(key, timestamps);
    return true;
  };
}

export function rateLimitMiddleware(limiter) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    if (!limiter(key)) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}

export function checkSocketRate(limiter, socket, callback) {
  if (!limiter(socket.id)) {
    if (callback) callback({ error: 'Too many requests' });
    return false;
  }
  return true;
}
