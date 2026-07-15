import assert from "node:assert/strict";
import { analyzePronunciation, tokenizeTranscript, validateDuration } from "../src/analyzer.js";
import { COACH_MODELS, createCoachRequest } from "../src/ai-coach.js";

const sampleRate = 16000;

function syntheticSpeech(duration, { pauses = [], noisy = false } = {}) {
  const total = Math.floor(duration * sampleRate);
  const data = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    const time = i / sampleRate;
    const isPaused = pauses.some(([start, end]) => time >= start && time <= end);
    if (isPaused) continue;
    const envelope = 0.18 + 0.08 * Math.sin(2 * Math.PI * 3.2 * time);
    const speechLike = Math.sin(2 * Math.PI * 180 * time) + 0.45 * Math.sin(2 * Math.PI * 620 * time);
    const noise = noisy ? 0.08 * Math.sin(2 * Math.PI * 4100 * time) : 0;
    data[i] = (speechLike * envelope + noise) * 0.35;
  }
  return data;
}

assert.equal(validateDuration(14.9).valid, false);
assert.equal(validateDuration(15).valid, true);
assert.equal(validateDuration(45).valid, true);
assert.equal(validateDuration(45.1).valid, false);
assert.equal(COACH_MODELS.qwen3.fallback, "Qwen/Qwen3-4B");
assert.equal(COACH_MODELS.gemma3.fallback, "google/gemma-3-4b-it");

assert.deepEqual(
  tokenizeTranscript("Hello, world! It's me.").map((word) => word.normalized),
  ["hello", "world", "it's", "me"]
);

const clean = analyzePronunciation({
  channelData: syntheticSpeech(35),
  sampleRate,
  duration: 35,
  transcript: "The learner reads a short English paragraph with steady pacing and clear consonants."
});

assert.equal(clean.durationCheck.valid, true);

const coachRequest = createCoachRequest({ model: "qwen3", transcript: "A short English sample.", result: clean });
assert.equal(coachRequest.model, "qwen3");
assert.equal(coachRequest.assessment.overall, clean.overall);
assert.throws(() => createCoachRequest({ model: "unknown", transcript: "", result: clean }));
assert.ok(clean.overall >= 65, `expected usable score, got ${clean.overall}`);
assert.equal(clean.words.length, 13);

const paused = analyzePronunciation({
  channelData: syntheticSpeech(35, { pauses: [[8, 10.2], [22, 24.4]] }),
  sampleRate,
  duration: 35,
  transcript: ""
});

assert.ok(paused.issues.some((issue) => issue.type === "long pause"));
assert.ok(paused.componentScores.rhythm < clean.componentScores.rhythm);

console.log("Analyzer tests passed.");
