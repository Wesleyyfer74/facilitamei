import { maskSensitive, writeLog } from "./structuredLogger.js";

async function sendOperationalAlert(event, details = {}) {
  writeLog("error", event, details);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return { delivered: false, reason: "not-configured" };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), details: maskSensitive(details) }),
      signal: AbortSignal.timeout(5000),
    });
    return { delivered: response.ok, status: response.status };
  } catch (error) {
    writeLog("error", "alert_delivery_failed", { message: error.message });
    return { delivered: false, reason: "request-failed" };
  }
}

export { sendOperationalAlert };
