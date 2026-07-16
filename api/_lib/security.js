import { createHash } from "node:crypto";

export function hasTrustedOrigin(request) {
  if (process.env.NODE_ENV !== "production") return true;
  const origin = request.headers?.origin;
  return Boolean(origin && process.env.APP_ORIGIN && origin === process.env.APP_ORIGIN);
}

export function clientFingerprint(request, suffix = "") {
  const forwarded = request.headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded || request.socket?.remoteAddress || "unknown";
  const ip = String(value).split(",")[0].trim();
  return createHash("sha256").update(`${ip}:${suffix}`).digest("hex");
}
