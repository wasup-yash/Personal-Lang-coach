import { parseCookies, serializeCookie } from "./http.js";

const ACCESS_COOKIE = "plc_access";
const REFRESH_COOKIE = "plc_refresh";

export async function getUser(request) {
  const accessToken = parseCookies(request.headers?.cookie)[ACCESS_COOKIE];
  if (!accessToken || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;

  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  return { user: await response.json(), accessToken };
}

export function setSessionCookies(response, session) {
  response.setHeader("Set-Cookie", [
    serializeCookie(ACCESS_COOKIE, session.access_token, { maxAge: session.expires_in || 3600 }),
    serializeCookie(REFRESH_COOKIE, session.refresh_token, { maxAge: 60 * 60 * 24 * 14 })
  ]);
}

export function clearSessionCookies(response) {
  response.setHeader("Set-Cookie", [
    serializeCookie(ACCESS_COOKIE, "", { maxAge: 0 }),
    serializeCookie(REFRESH_COOKIE, "", { maxAge: 0 })
  ]);
}

export async function requireUser(request, response) {
  const session = await getUser(request);
  if (session) return session;
  response.status(401).json({ error: "Sign in is required for detailed phoneme feedback." });
  return null;
}

export async function adminRequest(path, options = {}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase admin credentials are not configured.");
  }
  return fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    }
  });
}
