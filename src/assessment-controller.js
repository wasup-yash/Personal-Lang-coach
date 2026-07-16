import { analyzePronunciation } from "./analyzer.js";

export function analyzeLocalRecording({ audioBuffer, transcript, language }) {
  return analyzePronunciation({
    channelData: downmixAudio(audioBuffer),
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
    transcript,
    language
  });
}

export function downmixAudio(audioBuffer) {
  const output = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      output[index] += data[index] / audioBuffer.numberOfChannels;
    }
  }
  return output;
}
