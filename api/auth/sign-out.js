import { noStore, requireMethod } from "../_lib/http.js";
import { clearSessionCookies } from "../_lib/supabase.js";
import { hasTrustedOrigin } from "../_lib/security.js";

export default async function handler(request, response) {
  noStore(response);
  if (!requireMethod(request, response, "POST")) return;
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  clearSessionCookies(response);
  return response.status(204).end();
}
