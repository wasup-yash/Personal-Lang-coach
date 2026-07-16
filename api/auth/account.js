import { noStore, requireMethod } from "../_lib/http.js";
import { adminRequest, clearSessionCookies, requireUser } from "../_lib/supabase.js";
import { deleteUserObjects } from "../_lib/storage.js";
import { captureError } from "../_lib/telemetry.js";
import { hasTrustedOrigin } from "../_lib/security.js";

export default async function handler(request, response) {
  noStore(response);
  if (!requireMethod(request, response, "DELETE")) return;
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  const session = await requireUser(request, response);
  if (!session) return;
  try {
    const deletedAudioObjects = await deleteUserObjects(session.user.id);
    const deleted = await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(session.user.id)}`, { method: "DELETE" });
    if (!deleted.ok) throw new Error("Supabase rejected account deletion.");
    clearSessionCookies(response);
    return response.status(200).json({ deleted: true, deleted_audio_objects: deletedAudioObjects });
  } catch (error) {
    await captureError(error, { route: "auth/account", user_id: session.user.id });
    return response.status(503).json({ error: "Account deletion could not be completed. No deletion confirmation was issued." });
  }
}
