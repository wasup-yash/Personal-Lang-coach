import { noStore, requireMethod } from "../_lib/http.js";
import { adminRequest, requireUser } from "../_lib/supabase.js";
import { captureError } from "../_lib/telemetry.js";

export default async function handler(request, response) {
  noStore(response);
  if (!requireMethod(request, response, "GET")) return;
  const session = await requireUser(request, response);
  if (!session) return;
  try {
    const historyResponse = await adminRequest(`/rest/v1/pronunciation_history?user_id=eq.${encodeURIComponent(session.user.id)}&select=*`);
    const history = historyResponse.ok ? await historyResponse.json() : [];
    response.setHeader("Content-Disposition", "attachment; filename=personal-lang-coach-data.json");
    return response.status(200).json({ exported_at: new Date().toISOString(), profile: { id: session.user.id, email: session.user.email }, history });
  } catch (error) {
    await captureError(error, { route: "auth/export", user_id: session.user.id });
    return response.status(503).json({ error: "Data export is temporarily unavailable." });
  }
}
