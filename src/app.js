import { analyzePronunciation, validateDuration } from "./analyzer.js";
import { COACH_MODELS, createCoachRequest, requestAICoaching } from "./ai-coach.js";

const state = {
  file: null,
  audioBuffer: null,
  objectUrl: null,
  result: null
};

const elements = {
  file: document.querySelector("#audio-file"),
  dropzone: document.querySelector("#dropzone"),
  transcript: document.querySelector("#transcript"),
  coachModel: document.querySelector("#coach-model"),
  modelConsent: document.querySelector("#model-consent"),
  modelConsentRow: document.querySelector("#model-consent-row"),
  modelNotice: document.querySelector("#model-notice"),
  consent: document.querySelector("#consent"),
  analyze: document.querySelector("#analyze"),
  reset: document.querySelector("#reset"),
  error: document.querySelector("#error"),
  durationBadge: document.querySelector("#duration-badge"),
  score: document.querySelector("#score"),
  summary: document.querySelector("#result-summary"),
  clarityBar: document.querySelector("#clarity-bar"),
  rhythmBar: document.querySelector("#rhythm-bar"),
  paceBar: document.querySelector("#pace-bar"),
  clarityScore: document.querySelector("#clarity-score"),
  rhythmScore: document.querySelector("#rhythm-score"),
  paceScore: document.querySelector("#pace-score"),
  canvas: document.querySelector("#waveform"),
  words: document.querySelector("#word-feedback"),
  issues: document.querySelector("#issue-list"),
  aiCoaching: document.querySelector("#ai-coaching"),
  aiCoachingTitle: document.querySelector("#ai-coaching-title"),
  aiCoachingSummary: document.querySelector("#ai-coaching-summary"),
  aiCoachingPractice: document.querySelector("#ai-coaching-practice")
};

elements.file.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (file) await loadFile(file);
});

elements.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropzone.classList.add("is-dragging");
});

elements.dropzone.addEventListener("dragleave", () => {
  elements.dropzone.classList.remove("is-dragging");
});

elements.dropzone.addEventListener("drop", async (event) => {
  event.preventDefault();
  elements.dropzone.classList.remove("is-dragging");
  const [file] = event.dataTransfer.files;
  if (file) await loadFile(file);
});

elements.consent.addEventListener("change", updateAnalyzeState);
elements.modelConsent.addEventListener("change", updateAnalyzeState);
elements.coachModel.addEventListener("change", updateModelControls);
elements.transcript.addEventListener("input", () => {
  if (state.result) renderResult(state.result);
});
elements.analyze.addEventListener("click", analyzeCurrentFile);
elements.reset.addEventListener("click", reset);

drawEmptyWaveform();

async function loadFile(file) {
  clearError();
  resetResultOnly();

  if (!file.type.startsWith("audio/")) {
    setError("Please choose an audio file.");
    return;
  }

  revokeObjectUrl();
  state.file = file;
  state.objectUrl = URL.createObjectURL(file);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    state.audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    await audioContext.close();

    const durationCheck = validateDuration(state.audioBuffer.duration);
    elements.durationBadge.textContent = `${formatTime(state.audioBuffer.duration)} duration`;
    elements.durationBadge.className = durationCheck.valid ? "badge good" : "badge bad";

    if (!durationCheck.valid) {
      setError(`Audio must be between ${durationCheck.min} and ${durationCheck.max} seconds. This file is ${formatTime(durationCheck.duration)}.`);
    }

    drawWaveform(state.audioBuffer, []);
  } catch (error) {
    setError("This audio file could not be decoded in the browser. Try WAV, MP3, M4A, OGG, or WEBM.");
    state.audioBuffer = null;
  } finally {
    updateAnalyzeState();
  }
}

async function analyzeCurrentFile() {
  clearError();
  if (!state.audioBuffer) {
    setError("Choose an audio file first.");
    return;
  }
  if (!elements.consent.checked) {
    setError("Consent is required before browser-side audio processing.");
    return;
  }
  if (elements.coachModel.value && !elements.modelConsent.checked) {
    setError("Consent is required before sending derived assessment data to AI coaching.");
    return;
  }

  const durationCheck = validateDuration(state.audioBuffer.duration);
  if (!durationCheck.valid) {
    setError(`Audio must be between ${durationCheck.min} and ${durationCheck.max} seconds.`);
    return;
  }

  const merged = downmix(state.audioBuffer);
  state.result = analyzePronunciation({
    channelData: merged,
    sampleRate: state.audioBuffer.sampleRate,
    duration: state.audioBuffer.duration,
    transcript: elements.transcript.value
  });
  renderResult(state.result);

  if (elements.coachModel.value) await addAICoaching(state.result);
}

async function addAICoaching(result) {
  const model = elements.coachModel.value;
  elements.analyze.disabled = true;
  elements.aiCoaching.hidden = false;
  elements.aiCoachingTitle.textContent = `${COACH_MODELS[model].label} coaching`;
  elements.aiCoachingSummary.textContent = "Generating coaching from your transcript and derived assessment...";
  elements.aiCoachingPractice.replaceChildren();
  try {
    const coaching = await requestAICoaching(createCoachRequest({ model, transcript: elements.transcript.value, result }));
    elements.aiCoachingSummary.textContent = coaching.summary;
    for (const item of coaching.practice) {
      const practice = document.createElement("li");
      practice.textContent = item;
      elements.aiCoachingPractice.append(practice);
    }
  } catch (error) {
    elements.aiCoachingSummary.textContent = error.message;
  } finally {
    updateAnalyzeState();
  }
}

function renderResult(result) {
  elements.score.textContent = String(result.overall);
  elements.score.dataset.level = result.overall >= 85 ? "good" : result.overall >= 70 ? "warn" : "bad";
  elements.summary.textContent = result.summary;
  setMeter(elements.clarityBar, elements.clarityScore, result.componentScores.clarity);
  setMeter(elements.rhythmBar, elements.rhythmScore, result.componentScores.rhythm);
  setMeter(elements.paceBar, elements.paceScore, result.componentScores.pace);
  drawWaveform(state.audioBuffer, result.issues);
  renderWords(result);
  renderIssues(result);
}

function renderWords(result) {
  elements.words.replaceChildren();
  if (result.words.length === 0) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "Add an expected transcript before analysis to map highlighted segments onto words.";
    elements.words.append(note);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const word of result.words) {
    const span = document.createElement("span");
    span.className = word.issue ? "word issue-word" : "word";
    span.textContent = word.raw;
    if (word.issue) span.title = word.issue;
    fragment.append(span);
  }
  elements.words.append(fragment);
}

function renderIssues(result) {
  elements.issues.replaceChildren();
  if (result.issues.length === 0) {
    const item = document.createElement("article");
    item.className = "issue-card";
    item.innerHTML = "<h3>No major pronunciation issues detected</h3><p>Keep practicing consistent stress and clear final consonants.</p>";
    elements.issues.append(item);
    return;
  }

  for (const issue of result.issues) {
    const card = document.createElement("article");
    card.className = "issue-card";

    const title = document.createElement("h3");
    title.textContent = titleCase(issue.type);
    const time = document.createElement("span");
    time.textContent = `${formatTime(issue.start)}-${formatTime(issue.end)}`;
    title.append(time);

    const detail = document.createElement("p");
    detail.textContent = issue.detail;

    const action = document.createElement("p");
    action.className = "coach";
    action.textContent = coachingAction(issue.type);

    card.append(title, detail, action);
    elements.issues.append(card);
  }
}

function drawWaveform(audioBuffer, issues) {
  if (!audioBuffer) {
    drawEmptyWaveform();
    return;
  }

  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const data = downmix(audioBuffer);
  const step = Math.max(1, Math.floor(data.length / width));
  const middle = height * 0.52;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f8faf8";
  context.fillRect(0, 0, width, height);

  for (const issue of issues) {
    const startX = (issue.start / audioBuffer.duration) * width;
    const issueWidth = Math.max(3, ((issue.end - issue.start) / audioBuffer.duration) * width);
    context.fillStyle = issue.type === "long pause" ? "rgba(184, 113, 0, 0.22)" : "rgba(172, 48, 48, 0.20)";
    context.fillRect(startX, 0, issueWidth, height);
  }

  context.strokeStyle = "#23595b";
  context.lineWidth = 2;
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    let min = 1;
    let max = -1;
    const start = x * step;
    for (let i = 0; i < step && start + i < data.length; i += 1) {
      const value = data[start + i];
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    context.moveTo(x, middle + min * middle * 0.86);
    context.lineTo(x, middle + max * middle * 0.86);
  }
  context.stroke();

  context.strokeStyle = "#c8d0ce";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, middle);
  context.lineTo(width, middle);
  context.stroke();
}

function drawEmptyWaveform() {
  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8faf8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#d5dcda";
  context.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
}

function downmix(audioBuffer) {
  const output = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      output[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  return output;
}

function updateAnalyzeState() {
  const durationValid = state.audioBuffer ? validateDuration(state.audioBuffer.duration).valid : false;
  const modelReady = !elements.coachModel.value || elements.modelConsent.checked;
  elements.analyze.disabled = !state.audioBuffer || !durationValid || !elements.consent.checked || !modelReady;
}

function updateModelControls() {
  const model = elements.coachModel.value;
  const selected = COACH_MODELS[model];
  elements.modelConsentRow.hidden = !selected;
  if (!selected) elements.modelConsent.checked = false;
  elements.modelNotice.textContent = selected
    ? `${selected.label} receives only your transcript and derived assessment through this deployment's configured AI endpoint. Audio is not sent.`
    : "Browser-only analysis keeps the recording and feedback on this device.";
  updateAnalyzeState();
}

function setMeter(bar, label, value) {
  bar.style.width = `${value}%`;
  label.textContent = String(value);
}

function setError(message) {
  elements.error.textContent = message;
}

function clearError() {
  elements.error.textContent = "";
}

function reset() {
  state.file = null;
  state.audioBuffer = null;
  elements.file.value = "";
  elements.transcript.value = "";
  elements.consent.checked = false;
  elements.coachModel.value = "";
  elements.modelConsent.checked = false;
  updateModelControls();
  elements.durationBadge.textContent = "No file";
  elements.durationBadge.className = "badge muted";
  clearError();
  resetResultOnly();
  revokeObjectUrl();
  updateAnalyzeState();
}

function resetResultOnly() {
  state.result = null;
  elements.score.textContent = "--";
  elements.score.removeAttribute("data-level");
  elements.summary.textContent = "Results appear after analysis.";
  setMeter(elements.clarityBar, elements.clarityScore, 0);
  setMeter(elements.rhythmBar, elements.rhythmScore, 0);
  setMeter(elements.paceBar, elements.paceScore, 0);
  elements.words.replaceChildren();
  elements.issues.replaceChildren();
  elements.aiCoaching.hidden = true;
  elements.aiCoachingSummary.textContent = "";
  elements.aiCoachingPractice.replaceChildren();
  drawEmptyWaveform();
}

function revokeObjectUrl() {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function coachingAction(type) {
  if (type === "long pause") return "Practice the phrase in one breath, then add a shorter intentional pause.";
  if (type === "noisy articulation") return "Repeat the line slowly and over-articulate consonants before returning to normal speed.";
  if (type === "uneven stress") return "Mark the stressed syllable in the phrase and keep the vowel length steady.";
  if (type === "low speech density") return "Use a shorter sentence plan and reduce silent planning time.";
  return "Replay this span and aim for a louder, more stable vowel and a clean final consonant.";
}
