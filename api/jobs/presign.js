import { randomUUID } from "node:crypto";
import { requireMethod } from "../_lib/http.js";
import { enforceAsrRateLimit } from "../_lib/rate-limit.js";
import { objectKey, createUploadUrl } from "../_lib/storage.js";
import { requireUser } from "../_lib/supabase.js";
import { captureError } from "../_lib/telemetry.js";
import { hasTrustedOrigin } from "../_lib/security.js";

export default async function handler(request, response) {
  if (!requireMethod(request, response, "POST")) return;
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  const session = await requireUser(request, response);
  if (!session) return;
  const { filename, content_type: contentType, size } = request.body || {};
  if (!String(contentType || "").startsWith("audio/") || !Number.isFinite(size) || size <= 0 || size > 25_000_000) {
    return response.status(400).json({ error: "Use an audio file up to 25 MB." });
  }
  if (!await enforceAsrRateLimit(session.user.id)) {
    return response.status(429).json({ error: "Detailed feedback limit reached. Try again later." });
  }
  try {
    const jobId = randomUUID();
    const key = objectKey(session.user.id, jobId, filename);
    const upload = await createUploadUrl({ key, contentType });
    return response.status(200).json({ job_id: jobId, object_key: key, upload_url: upload.url, upload_method: upload.method, upload_fields: upload.fields, expires_in_seconds: 300 });
  } catch (error) {
    await captureError(error, { route: "jobs/presign", user_id: session.user.id });
    return response.status(503).json({ error: "Transient audio storage is not configured." });
  }
}
