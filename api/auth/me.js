import { noStore, requireMethod } from "../_lib/http.js";
import { getUser } from "../_lib/supabase.js";

export default async function handler(request, response) {
  noStore(response);
  if (!requireMethod(request, response, "GET")) return;
  const session = await getUser(request);
  if (!session) return response.status(200).json({ user: null });
  return response.status(200).json({ user: { id: session.user.id, email: session.user.email } });
}
