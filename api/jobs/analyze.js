import { requireMethod } from "../_lib/http.js";
import { requireUser } from "../_lib/supabase.js";
import { captureError, timing } from "../_lib/telemetry.js";
import { assertAudioObject, deleteObject } from "../_lib/storage.js";
import { hasTrustedOrigin } from "../_lib/security.js";

export default async function handler(request, response) {
  const startedAt = performance.now();
  if (!requireMethod(request, response, "POST")) return;
  if (!hasTrustedOrigin(request)) return response.status(403).json({ error: "Invalid origin." });
  const session = await requireUser(request, response);
  if (!session) return;
  const { job_id: jobId, object_key: objectKey, transcript = "", language } = request.body || {};
  if (typeof jobId !== "string" || typeof objectKey !== "string" || typeof transcript !== "string" || transcript.length > 2_500 || !["en", "hi"].includes(language) || !objectKey.startsWith(`jobs/${session.user.id}/${jobId}/`)) {
    return response.status(400).json({ error: "Invalid detailed-feedback job." });
  }
  if (!process.env.ASR_SERVICE_URL || !process.env.ASR_SERVICE_TOKEN) {
    return response.status(503).json({ error: "Detailed phoneme feedback is not configured." });
  }
  try {
    await assertAudioObject(objectKey);
    const upstream = await fetch(`${process.env.ASR_SERVICE_URL.replace(/\/$/, "")}/asr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ASR_SERVICE_TOKEN}` },
      body: JSON.stringify({ job_id: jobId, object_key: objectKey, transcript, language, user_id: session.user.id })
    });
    const body = await upstream.json().catch(() => ({}));
    timing("asr_job_total", startedAt, { user_id: session.user.id, status: upstream.status });
    if (!upstream.ok) await deleteObject(objectKey).catch(() => {});
    return response.status(upstream.ok ? 200 : 502).json(upstream.ok ? body : { error: body.detail || "Detailed feedback service failed." });
  } catch (error) {
    await deleteObject(objectKey).catch(() => {});
    await captureError(error, { route: "jobs/analyze", user_id: session.user.id });
    return response.status(502).json({ error: "Detailed feedback service is unavailable." });
  }
}
