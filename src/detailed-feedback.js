async function api(path, options) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Detailed feedback is unavailable.");
  return data;
}

export async function requestDetailedFeedback({ file, transcript, language }) {
  if (!transcript.trim()) throw new Error("Add the expected transcript for detailed phoneme feedback.");
  const upload = await api("/api/jobs/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, content_type: file.type, size: file.size })
  });
  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.upload_fields)) form.append(key, value);
    form.append("file", file);
    const uploaded = await fetch(upload.upload_url, { method: upload.upload_method, body: form });
    if (!uploaded.ok) throw new Error("Secure audio upload failed.");
    return await api("/api/jobs/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: upload.job_id, object_key: upload.object_key, transcript, language })
    });
  } catch (error) {
    await fetch("/api/jobs/cancel", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: upload.job_id, object_key: upload.object_key })
    }).catch(() => {});
    throw error;
  }
}
