import { validateDuration } from "./analyzer.js";
import { analyzeLocalRecording, downmixAudio } from "./assessment-controller.js";
import { COACH_MODELS, createCoachRequest, requestAICoaching } from "./ai-coach.js";
import { getLanguage, getTranscriptLanguageWarning } from "./language.js";
import { initializeAuth } from "./auth.js";
import { requestDetailedFeedback } from "./detailed-feedback.js";
import { initializeFrontendMonitoring } from "./monitoring.js";

const state = {
  file: null,
  audioBuffer: null,
  objectUrl: null,
  result: null,
  user: null
};

const elements = {
  file: document.querySelector("#audio-file"),
  dropzone: document.querySelector("#dropzone"),
  transcript: document.querySelector("#transcript"),
  language: document.querySelector("#language"),
  languageNote: document.querySelector("#language-note"),
  transcriptNote: document.querySelector("#transcript-note"),
  coachModel: document.querySelector("#coach-model"),
  modelConsent: document.querySelector("#model-consent"),
  modelConsentRow: document.querySelector("#model-consent-row"),
  modelNotice: document.querySelector("#model-notice"),
  detailedFeedback: document.querySelector("#detailed-feedback"),
  detailedNote: document.querySelector("#detailed-note"),
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
  aiCoachingPractice: document.querySelector("#ai-coaching-practice"),
  phonemeFeedback: document.querySelector("#phoneme-feedback"),
  phonemeNote: document.querySelector("#phoneme-note"),
  alignmentBadge: document.querySelector("#alignment-badge"),
  phonemeList: document.querySelector("#phoneme-list")
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
elements.detailedFeedback.addEventListener("change", updateDetailedFeedbackState);
elements.language.addEventListener("change", updateLanguageControls);
elements.transcript.addEventListener("input", () => {
  updateTranscriptNote();
  if (state.result) renderResult(state.result);
});
elements.analyze.addEventListener("click", analyzeCurrentFile);
elements.reset.addEventListener("click", reset);

drawEmptyWaveform();
updateLanguageControls();
initializeFrontendMonitoring();
initializeAuth((user) => {
  state.user = user;
  updateDetailedFeedbackState();
});

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

  state.result = analyzeLocalRecording({
    audioBuffer: state.audioBuffer,
    transcript: elements.transcript.value,
    language: elements.language.value
  });
  renderResult(state.result);

  if (elements.coachModel.value) await addAICoaching(state.result);
  if (elements.detailedFeedback.checked) await addDetailedFeedback();
}

async function addDetailedFeedback() {
  elements.analyze.disabled = true;
  elements.phonemeFeedback.hidden = false;
  elements.phonemeNote.textContent = "Uploading directly to transient encrypted storage and running ASR alignment...";
  elements.phonemeList.replaceChildren();
  elements.alignmentBadge.textContent = "Processing";
  elements.alignmentBadge.className = "badge muted";
  try {
    const detailed = await requestDetailedFeedback({
      file: state.file,
      transcript: elements.transcript.value,
      language: elements.language.value === "hindi" ? "hi" : "en"
    });
    renderPhonemeFeedback(detailed);
  } catch (error) {
    elements.phonemeNote.textContent = error.message;
    elements.alignmentBadge.textContent = "Unavailable";
    elements.alignmentBadge.className = "badge bad";
  } finally {
    updateAnalyzeState();
  }
}

async function addAICoaching(result) {
  const model = elements.coachModel.value;
  elements.analyze.disabled = true;
  elements.aiCoaching.hidden = false;
  elements.aiCoachingTitle.textContent = `${COACH_MODELS[model].label} coaching`;
  elements.aiCoachingSummary.textContent = "Generating coaching from your transcript and derived assessment...";
  elements.aiCoachingPractice.replaceChildren();
  try {
    const coaching = await requestAICoaching(createCoachRequest({ model, transcript: elements.transcript.value, language: elements.language.value, result }));
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
    const advice = result.language === "hindi"
      ? "Keep practicing clear matras, vowels, and consonant separation."
      : "Keep practicing consistent stress and clear final consonants.";
    item.innerHTML = `<h3>No major pronunciation issues detected</h3><p>${advice}</p>`;
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
    action.textContent = coachingAction(issue.type, state.result?.language || elements.language.value);

    card.append(title, detail, action);
    elements.issues.append(card);
  }
}

function renderPhonemeFeedback(detailed) {
  elements.phonemeNote.textContent = detailed.calibration_note;
  elements.alignmentBadge.textContent = detailed.alignment_source === "whisperx" ? "Forced aligned" : "Estimated timing";
  elements.alignmentBadge.className = detailed.alignment_source === "whisperx" ? "badge good" : "badge muted";
  elements.phonemeList.replaceChildren();
  if (!detailed.phonemes?.length) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "No phoneme scores were returned. Add an expected transcript and try again.";
    elements.phonemeList.append(note);
    return;
  }
  for (const phoneme of detailed.phonemes) {
    const item = document.createElement("article");
    item.className = "phoneme-item";
    const score = phoneme.calibrated ? `${phoneme.calibrated_score}/100` : `GOP ${phoneme.gop_score}`;
    item.textContent = `${phoneme.phoneme} ${formatTime(phoneme.start)}-${formatTime(phoneme.end)} ${score}`;
    if (phoneme.calibrated && phoneme.calibrated_score < 55) item.classList.add("needs-work");
    elements.phonemeList.append(item);
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
  const data = downmixAudio(audioBuffer);
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

function updateAnalyzeState() {
  const durationValid = state.audioBuffer ? validateDuration(state.audioBuffer.duration).valid : false;
  const modelReady = !elements.coachModel.value || elements.modelConsent.checked;
  elements.analyze.disabled = !state.audioBuffer || !durationValid || !elements.consent.checked || !modelReady;
}

function updateDetailedFeedbackState() {
  const signedIn = Boolean(state.user);
  elements.detailedFeedback.disabled = !signedIn;
  if (!signedIn) elements.detailedFeedback.checked = false;
  elements.detailedNote.textContent = signedIn
    ? "Detailed feedback uploads directly to transient encrypted storage, then the ASR service explicitly deletes it after processing."
    : "Sign in to enable detailed phoneme feedback. Browser-only scoring remains available without an account.";
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

function updateLanguageControls() {
  const language = getLanguage(elements.language.value);
  const isHindi = elements.language.value === "hindi";
  elements.transcript.placeholder = language.transcriptPlaceholder;
  elements.languageNote.textContent = isHindi
    ? "Hindi scoring emphasizes clear vowels and matras, consonant separation, rhythm, and pace."
    : "English scoring emphasizes steady vowels, clear final consonants, rhythm, and pace.";
  updateTranscriptNote();
  if (state.result) resetResultOnly();
}

function updateTranscriptNote() {
  const warning = getTranscriptLanguageWarning(elements.transcript.value, elements.language.value);
  elements.transcriptNote.textContent = warning || "The transcript improves pace and word-level feedback; it is not used to transcribe the recording.";
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
  elements.language.value = "english";
  elements.consent.checked = false;
  elements.coachModel.value = "";
  elements.modelConsent.checked = false;
  elements.detailedFeedback.checked = false;
  updateModelControls();
  updateLanguageControls();
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
  elements.phonemeFeedback.hidden = true;
  elements.phonemeNote.textContent = "";
  elements.phonemeList.replaceChildren();
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

function coachingAction(type, language) {
  const tips = getLanguage(language).tips;
  if (type === "long pause") return "Practice the phrase in one breath, then add a shorter intentional pause.";
  if (type === "noisy articulation") return tips.noisy;
  if (type === "uneven stress") return tips.stress;
  if (type === "low speech density") return "Use a shorter sentence plan and reduce silent planning time.";
  return tips.unclear;
}
