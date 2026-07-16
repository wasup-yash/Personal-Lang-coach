import { requireMethod } from "./_lib/http.js";
import { captureError } from "./_lib/telemetry.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";
import { clientFingerprint, hasTrustedOrigin } from "./_lib/security.js";

export default async function handler(request, response) {
  if (!requireMethod(request, response, "POST")) return;
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  if (!await enforceRateLimit({ namespace: "telemetry", subject: clientFingerprint(request), limit: 30, windowSeconds: 60 })) {
    return response.status(429).end();
  }
  const { kind, path } = request.body || {};
  if (!["error", "unhandledrejection"].includes(kind)) return response.status(400).json({ error: "Invalid telemetry event." });
  await captureError(new Error("Client application error"), { source: "frontend", kind, path: String(path || "").slice(0, 200) });
  return response.status(204).end();
}
