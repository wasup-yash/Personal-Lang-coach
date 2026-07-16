import { createHash } from "node:crypto";

let sentryClient;

async function getSentry() {
  if (!process.env.SENTRY_DSN) return null;
  if (sentryClient) return sentryClient;
  sentryClient = await import("@sentry/node");
  sentryClient.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  return sentryClient;
}

export async function captureError(error, context = {}) {
  const safeContext = { ...context };
  if (safeContext.user_id) safeContext.user_id = createHash("sha256").update(String(safeContext.user_id)).digest("hex");
  console.error(JSON.stringify({ level: "error", message: error?.name || "Error", ...safeContext }));
  const Sentry = await getSentry();
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    scope.setContext("personal_lang_coach", safeContext);
    Sentry.captureException(error);
  });
}

export function timing(name, startedAt, fields = {}) {
  const durationMs = Math.round(performance.now() - startedAt);
  console.log(JSON.stringify({ metric: name, duration_ms: durationMs, ...fields }));
  return durationMs;
}
