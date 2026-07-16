export const LANGUAGES = {
  english: {
    label: "English",
    locale: "en-US",
    transcriptPlaceholder: "Paste the English passage the learner intended to read for word-level feedback.",
    targetPace: [120, 175],
    scriptLabel: "English text",
    tips: {
      unclear: "Replay this phrase and make vowel sounds steady, then release final consonants clearly.",
      noisy: "Slow down and separate consonants, especially at word endings.",
      stress: "Mark the stressed syllable and keep the stressed vowel slightly longer."
    }
  },
  hindi: {
    label: "Hindi",
    locale: "hi-IN",
    transcriptPlaceholder: "शब्द-स्तर के फीडबैक के लिए वह हिंदी वाक्य लिखें जो सीखने वाले ने पढ़ा।",
    targetPace: [105, 155],
    scriptLabel: "Hindi (Devanagari) text",
    tips: {
      unclear: "स्वरों और मात्राओं को साफ़ रखें, फिर शब्द के अंत को पूरा बोलें।",
      noisy: "व्यंजनों को अलग-अलग बोलने का अभ्यास करें, खासकर ट/त और ड/द की ध्वनियों में।",
      stress: "शब्दों को समान लय में बोलें और हर मात्रा को पूरा समय दें।"
    }
  }
};

export function getLanguage(language) {
  return LANGUAGES[language] || LANGUAGES.english;
}

export function tokenizeForLanguage(transcript, language = "english") {
  const locale = getLanguage(language).locale;
  return (transcript.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)?/gu) || [])
    .map((raw) => ({ raw, normalized: raw.normalize("NFC").toLocaleLowerCase(locale) }));
}

export function getTranscriptLanguageWarning(transcript, language = "english") {
  if (!transcript.trim()) return "";
  const devanagari = (transcript.match(/[\u0900-\u097F]/g) || []).length;
  const latin = (transcript.match(/[A-Za-z]/g) || []).length;
  if (language === "hindi" && latin > devanagari * 2) {
    return "Hindi feedback is most reliable when the expected transcript is written in Devanagari.";
  }
  if (language === "english" && devanagari > latin) {
    return "Choose Hindi to assess a Devanagari transcript.";
  }
  return "";
}
