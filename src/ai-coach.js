export const COACH_MODELS = {
  qwen3: {
    label: "Qwen3 4B",
    envKey: "QWEN3_MODEL",
    fallback: "Qwen/Qwen3-4B"
  },
  gemma3: {
    label: "Gemma 3 4B",
    envKey: "GEMMA3_MODEL",
    fallback: "google/gemma-3-4b-it"
  }
};

export function createCoachRequest({ model, transcript, language, result }) {
  if (!COACH_MODELS[model]) throw new Error("Choose a supported coaching model.");

  return {
    model,
    language,
    transcript: transcript.trim(),
    assessment: {
      overall: result.overall,
      componentScores: result.componentScores,
      summary: result.summary,
      issues: result.issues.slice(0, 5).map(({ type, start, end, detail }) => ({ type, start, end, detail }))
    }
  };
}

export async function requestAICoaching(payload) {
  const response = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "AI coaching is unavailable right now.");
  return data.coaching;
}
