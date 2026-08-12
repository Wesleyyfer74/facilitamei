const counters = new Map();
const startedAt = Date.now();

function increment(name, labels = {}) {
  const labelKey = Object.entries(labels).sort().map(([key, value]) => `${key}=${value}`).join(",");
  const key = `${name}{${labelKey}}`;
  counters.set(key, (counters.get(key) || 0) + 1);
}

function metricsMiddleware(request, response, next) {
  response.on("finish", () => increment("http_requests_total", {
    method: request.method,
    status: String(response.statusCode),
  }));
  next();
}

function snapshotMetrics() {
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    counters: Object.fromEntries(counters),
  };
}

export { increment, metricsMiddleware, snapshotMetrics };
