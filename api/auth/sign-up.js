import { noStore, requireMethod } from "../_lib/http.js";
import { captureError } from "../_lib/telemetry.js";
import { enforceRateLimit } from "../_lib/rate-limit.js";
import { clientFingerprint, hasTrustedOrigin } from "../_lib/security.js";

export default async function handler(request, response) {
  noStore(response);
  if (!requireMethod(request, response, "POST")) return;
  const { email, password } = request.body || {};
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  if (!await enforceRateLimit({ namespace: "sign-up", subject: clientFingerprint(request, String(email || "").toLowerCase()), limit: 3, windowSeconds: 3600 })) {
    return response.status(429).json({ error: "Too many sign-up attempts. Try again later." });
  }
  if (!email || !password || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return response.status(400).json({ error: "Email, password, and Supabase configuration are required." });
  }
  try {
    const upstream = await fetch(`${process.env.SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!upstream.ok) return response.status(400).json({ error: "Could not create the account." });
    return response.status(201).json({ message: "Check your email to confirm the account, then sign in." });
  } catch (error) {
    await captureError(error, { route: "auth/sign-up" });
    return response.status(502).json({ error: "Authentication service is unavailable." });
  }
}
