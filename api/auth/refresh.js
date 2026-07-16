import { noStore, requireMethod, parseCookies } from "../_lib/http.js";
import { clearSessionCookies, setSessionCookies } from "../_lib/supabase.js";
import { hasTrustedOrigin } from "../_lib/security.js";

export default async function handler(request, response) {
  noStore(response);
  if (!requireMethod(request, response, "POST")) return;
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  const refreshToken = parseCookies(request.headers?.cookie).plc_refresh;
  if (!refreshToken || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    clearSessionCookies(response);
    return response.status(401).json({ error: "Session expired." });
  }
  const upstream = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const session = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    clearSessionCookies(response);
    return response.status(401).json({ error: "Session expired." });
  }
  setSessionCookies(response, session);
  return response.status(200).json({ user: { id: session.user.id, email: session.user.email } });
}
