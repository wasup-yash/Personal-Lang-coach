import { requireMethod } from "../_lib/http.js";
import { deleteObject } from "../_lib/storage.js";
import { requireUser } from "../_lib/supabase.js";
import { hasTrustedOrigin } from "../_lib/security.js";

export default async function handler(request, response) {
  if (!requireMethod(request, response, "POST")) return;
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  const session = await requireUser(request, response);
  if (!session) return;
  const { job_id: jobId, object_key: objectKey } = request.body || {};
  if (typeof jobId !== "string" || typeof objectKey !== "string" || !objectKey.startsWith(`jobs/${session.user.id}/${jobId}/`)) {
    return response.status(400).json({ error: "Invalid cancellation request." });
  }
  try {
    await deleteObject(objectKey);
    return response.status(204).end();
  } catch {
    return response.status(503).json({ error: "Transient audio cleanup failed." });
  }
}
