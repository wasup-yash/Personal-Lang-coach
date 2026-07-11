const FRAME_MS = 30;
const HOP_MS = 15;
const MIN_DURATION = 15;
const MAX_DURATION = 45;

export function validateDuration(duration) {
  return {
    valid: duration >= MIN_DURATION && duration <= MAX_DURATION,
    min: MIN_DURATION,
    max: MAX_DURATION,
    duration
  };
}

export function analyzePronunciation({ channelData, sampleRate, duration, transcript = "" }) {
  if (!channelData || !sampleRate || !duration) {
    throw new Error("Audio data, sample rate, and duration are required.");
  }

  const durationCheck = validateDuration(duration);
  const frames = frameSignal(channelData, sampleRate);
  const threshold = getVoicingThreshold(frames);
  const voicedFrames = frames.map((frame) => ({ ...frame, voiced: frame.rms >= threshold }));
  const voicedSegments = mergeSegments(framesToSegments(voicedFrames), 0.18);
  const pauses = detectLongPauses(voicedSegments, duration);
  const voicedDuration = voicedSegments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const issues = detectIssues(voicedSegments, pauses, duration, voicedDuration);
  const componentScores = scoreComponents({
    duration,
    durationCheck,
    voicedDuration,
    voicedSegments,
    pauses,
    issues,
    transcript
  });
  const overall = clamp(Math.round(
    componentScores.clarity * 0.48 +
    componentScores.rhythm * 0.27 +
    componentScores.pace * 0.20 +
    componentScores.duration * 0.05
  ), 0, 100);

  return {
    duration,
    durationCheck,
    frames: voicedFrames,
    threshold,
    voicedSegments,
    issues: rankIssues(issues, duration),
    componentScores,
    overall,
    words: buildWordHighlights(transcript, voicedSegments, issues, duration),
    summary: summarize(overall, issues, transcript)
  };
}

export function tokenizeTranscript(transcript) {
  return transcript
    .trim()
    .split(/\s+/)
    .map((raw) => ({
      raw,
      normalized: raw.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "")
    }))
    .filter((word) => word.normalized.length > 0);
}

function frameSignal(data, sampleRate) {
  const frameSize = Math.max(1, Math.round(sampleRate * FRAME_MS / 1000));
  const hopSize = Math.max(1, Math.round(sampleRate * HOP_MS / 1000));
  const frames = [];

  for (let start = 0; start + frameSize <= data.length; start += hopSize) {
    let energy = 0;
    let crossings = 0;
    let previous = data[start];
    let peak = 0;

    for (let i = start; i < start + frameSize; i += 1) {
      const sample = data[i];
      energy += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
      if ((sample >= 0 && previous < 0) || (sample < 0 && previous >= 0)) {
        crossings += 1;
      }
      previous = sample;
    }

    frames.push({
      start: start / sampleRate,
      end: (start + frameSize) / sampleRate,
      rms: Math.sqrt(energy / frameSize),
      peak,
      zcr: crossings / frameSize
    });
  }

  return frames;
}

function getVoicingThreshold(frames) {
  if (frames.length === 0) return 0.01;
  const sorted = frames.map((frame) => frame.rms).sort((a, b) => a - b);
  const noise = percentile(sorted, 0.1);
  const active = percentile(sorted, 0.85);
  const adaptive = noise + Math.max(0, active - noise) * 0.24;
  return clamp(Math.min(Math.max(0.008, adaptive, active * 0.12), active * 0.55), 0.006, 0.08);
}

function framesToSegments(frames) {
  const segments = [];
  let current = null;

  for (const frame of frames) {
    if (frame.voiced && !current) {
      current = {
        start: frame.start,
        end: frame.end,
        frames: [frame]
      };
    } else if (frame.voiced && current) {
      current.end = frame.end;
      current.frames.push(frame);
    } else if (!frame.voiced && current) {
      if (current.end - current.start >= 0.09) {
        segments.push(finalizeSegment(current));
      }
      current = null;
    }
  }

  if (current && current.end - current.start >= 0.09) {
    segments.push(finalizeSegment(current));
  }

  return segments;
}

function mergeSegments(segments, maxGap) {
  const merged = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (previous && segment.start - previous.end <= maxGap) {
      previous.end = segment.end;
      previous.frames.push(...segment.frames);
      Object.assign(previous, finalizeSegment(previous));
    } else {
      merged.push({ ...segment, frames: [...segment.frames] });
    }
  }
  return merged;
}

function finalizeSegment(segment) {
  const rmsValues = segment.frames.map((frame) => frame.rms);
  const zcrValues = segment.frames.map((frame) => frame.zcr);
  const avgRms = average(rmsValues);
  const variability = standardDeviation(rmsValues) / Math.max(avgRms, 0.001);
  return {
    ...segment,
    avgRms,
    avgZcr: average(zcrValues),
    variability
  };
}

function detectLongPauses(segments, duration) {
  const pauses = [];
  let lastEnd = 0;

  for (const segment of segments) {
    if (segment.start - lastEnd >= 0.65 && lastEnd > 0.2) {
      pauses.push({ start: lastEnd, end: segment.start, duration: segment.start - lastEnd });
    }
    lastEnd = segment.end;
  }

  if (duration - lastEnd >= 0.9 && lastEnd > 0) {
    pauses.push({ start: lastEnd, end: duration, duration: duration - lastEnd });
  }

  return pauses;
}

function detectIssues(segments, pauses, duration, voicedDuration) {
  const issues = [];
  const rmsSorted = segments.map((segment) => segment.avgRms).sort((a, b) => a - b);
  const medianRms = percentile(rmsSorted, 0.5) || 0.01;

  for (const segment of segments) {
    const lowEnergy = segment.avgRms < medianRms * 0.62;
    const noisy = segment.avgZcr > 0.18;
    const unstable = segment.variability > 0.95 && segment.end - segment.start > 0.35;

    if (lowEnergy || noisy || unstable) {
      issues.push({
        type: lowEnergy ? "unclear segment" : noisy ? "noisy articulation" : "uneven stress",
        start: segment.start,
        end: segment.end,
        severity: lowEnergy ? 0.68 : noisy ? 0.55 : 0.48,
        detail: lowEnergy
          ? "Low speech energy made this part harder to understand."
          : noisy
            ? "High fricative/noise content may indicate unclear consonants or background noise."
            : "Energy changed abruptly, which can sound like broken stress or hesitation."
      });
    }
  }

  for (const pause of pauses) {
    issues.push({
      type: "long pause",
      start: pause.start,
      end: pause.end,
      severity: clamp(pause.duration / 1.8, 0.35, 0.85),
      detail: "Long silence interrupts sentence rhythm."
    });
  }

  const voicedRatio = voicedDuration / duration;
  if (voicedRatio < 0.38) {
    issues.push({
      type: "low speech density",
      start: 0,
      end: duration,
      severity: 0.7,
      detail: "The recording contains too much silence for a fluent 15-45 second response."
    });
  }

  return issues;
}

function scoreComponents({ duration, durationCheck, voicedDuration, voicedSegments, pauses, issues, transcript }) {
  const pauseSeconds = pauses.reduce((sum, pause) => sum + pause.duration, 0);
  const issuePenalty = issues.reduce((sum, issue) => sum + issue.severity * 9, 0);
  const clarity = clamp(96 - issuePenalty - Math.max(0, pauses.length - 1) * 4, 35, 99);
  const rhythm = clamp(94 - pauseSeconds * 6 - Math.abs((voicedDuration / duration) - 0.58) * 85, 30, 98);

  const wordCount = tokenizeTranscript(transcript).length;
  let pace = 82;
  if (wordCount >= 5 && voicedDuration > 0) {
    const wordsPerMinute = wordCount / (voicedDuration / 60);
    const distance = wordsPerMinute < 120
      ? 120 - wordsPerMinute
      : wordsPerMinute > 175
        ? wordsPerMinute - 175
        : 0;
    pace = clamp(96 - distance * 0.55, 30, 99);
  } else {
    const segmentRate = voicedSegments.length / Math.max(voicedDuration, 1);
    pace = clamp(88 - Math.abs(segmentRate - 1.9) * 18, 45, 95);
  }

  const durationScore = durationCheck.valid
    ? 100
    : clamp(100 - Math.min(Math.abs(duration - durationCheck.min), Math.abs(duration - durationCheck.max)) * 8, 0, 70);

  return {
    clarity: Math.round(clarity),
    rhythm: Math.round(rhythm),
    pace: Math.round(pace),
    duration: Math.round(durationScore)
  };
}

function buildWordHighlights(transcript, segments, issues, duration) {
  const words = tokenizeTranscript(transcript);
  if (words.length === 0) return [];

  const activeStart = segments[0]?.start ?? 0;
  const activeEnd = segments.at(-1)?.end ?? duration;
  const span = Math.max(activeEnd - activeStart, duration * 0.8);

  return words.map((word, index) => {
    const start = activeStart + span * (index / words.length);
    const end = activeStart + span * ((index + 1) / words.length);
    const overlap = issues.find((issue) => rangesOverlap(start, end, issue.start, issue.end));
    return {
      ...word,
      start,
      end,
      issue: overlap ? overlap.type : null
    };
  });
}

function rankIssues(issues, duration) {
  return issues
    .filter((issue) => issue.end > issue.start && issue.start >= 0 && issue.end <= duration + 0.05)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 8)
    .sort((a, b) => a.start - b.start);
}

function summarize(score, issues, transcript) {
  const mode = tokenizeTranscript(transcript).length ? "word-level" : "segment-level";
  if (score >= 85 && issues.length <= 2) {
    return `Strong ${mode} result with only minor watch points.`;
  }
  if (score >= 70) {
    return `Usable ${mode} result; focus on the highlighted clarity and rhythm issues.`;
  }
  return `Needs practice; the highlighted ${mode} issues are likely to affect listener understanding.`;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
