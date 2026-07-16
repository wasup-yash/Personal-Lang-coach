import { noStore, requireMethod } from "../_lib/http.js";
import { setSessionCookies } from "../_lib/supabase.js";
import { captureError } from "../_lib/telemetry.js";
import { enforceRateLimit } from "../_lib/rate-limit.js";
import { clientFingerprint, hasTrustedOrigin } from "../_lib/security.js";

export default async function handler(request, response) {
  noStore(response);
  if (!requireMethod(request, response, "POST")) return;
  const { email, password } = request.body || {};
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  if (!await enforceRateLimit({ namespace: "sign-in", subject: clientFingerprint(request, String(email || "").toLowerCase()), limit: 5, windowSeconds: 600 })) {
    return response.status(429).json({ error: "Too many sign-in attempts. Try again later." });
  }
  if (!email || !password || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return response.status(400).json({ error: "Email, password, and Supabase configuration are required." });
  }
  try {
    const upstream = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const body = await upstream.json();
    if (!upstream.ok) return response.status(401).json({ error: "Invalid email or password." });
    setSessionCookies(response, body);
    return response.status(200).json({ user: { id: body.user.id, email: body.user.email } });
  } catch (error) {
    await captureError(error, { route: "auth/sign-in" });
    return response.status(502).json({ error: "Authentication service is unavailable." });
  }
}
