import { COACH_MODELS } from "../src/ai-coach.js";
import { getLanguage, LANGUAGES } from "../src/language.js";

const MAX_TRANSCRIPT_CHARS = 2_500;
const MAX_ISSUES = 5;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const { model, language = "english", transcript = "", assessment } = request.body || {};
  if (!COACH_MODELS[model] || !LANGUAGES[language] || !assessment || !Number.isFinite(assessment.overall)) {
    return response.status(400).json({ error: "Invalid coaching request." });
  }

  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY;
  const modelName = process.env[COACH_MODELS[model].envKey] || COACH_MODELS[model].fallback;
  if (!baseUrl || !apiKey) {
    return response.status(503).json({ error: "AI coaching has not been configured for this deployment." });
  }

  const safeAssessment = {
    overall: assessment.overall,
    componentScores: assessment.componentScores,
    summary: String(assessment.summary || "").slice(0, 500),
    issues: Array.isArray(assessment.issues) ? assessment.issues.slice(0, MAX_ISSUES) : []
  };
  const languageLabel = getLanguage(language).label;

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.2,
        max_tokens: 260,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a ${languageLabel} pronunciation coach. Use only the provided derived acoustic assessment and optional expected transcript. Do not claim you heard the audio, diagnose a condition, invent errors, or mention model/provider details. Give feedback in ${languageLabel}; Hindi feedback may use Devanagari. Return strict JSON: {\"summary\": string, \"practice\": [string, string, string]}. Keep each practice item concrete and under 24 words.`
          },
          {
            role: "user",
            content: JSON.stringify({ language: languageLabel, transcript: String(transcript).slice(0, MAX_TRANSCRIPT_CHARS), assessment: safeAssessment })
          }
        ]
      })
    });

    if (!upstream.ok) {
      return response.status(502).json({ error: "The configured model did not return coaching." });
    }

    const completion = await upstream.json();
    const content = completion?.choices?.[0]?.message?.content;
    const coaching = parseCoaching(content);
    if (!coaching) return response.status(502).json({ error: "The configured model returned an invalid coaching response." });
    return response.status(200).json({ coaching });
  } catch {
    return response.status(502).json({ error: "Could not reach the configured model endpoint." });
  }
}

function parseCoaching(content) {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    if (!parsed || typeof parsed.summary !== "string" || !Array.isArray(parsed.practice)) return null;
    const practice = parsed.practice.filter((item) => typeof item === "string").slice(0, 3);
    if (practice.length === 0) return null;
    return { summary: parsed.summary.slice(0, 500), practice: practice.map((item) => item.slice(0, 180)) };
  } catch {
    return null;
  }
}
