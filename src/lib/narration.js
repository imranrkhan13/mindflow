import { API_BASE, apiErrorMessage } from "./apiConfig.js";

// Turn display markdown into a readable script without speaking citation IDs,
// code fences, formatting punctuation, or long URLs.
export function narrationText(text) {
  return text
    .replace(/```[\s\S]*?```/g, '\nCode example omitted from narration.\n')
    .replace(/\[S\d+\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Gentle offline dynamics processing and peak normalization. This improves
// level consistency, not the underlying model's pronunciation or fidelity.
export async function masterNarration(blob) {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) return blob;
  const decoder = new OfflineContext(1, 1, 24000);
  const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  const context = new OfflineContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
  const source = context.createBufferSource();
  source.buffer = decoded;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 16;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.18;
  source.connect(compressor);
  compressor.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, i) => rendered.getChannelData(i));
  let peak = 0;
  for (const channel of channels) for (const value of channel) peak = Math.max(peak, Math.abs(value));
  if (peak < 0.0001) throw new Error('The voice service returned silent audio. Please try again.');
  const gain = Math.min(2, 0.89 / peak);
  const buffer = new ArrayBuffer(44 + rendered.length * channels.length * 2);
  const view = new DataView(buffer);
  const string = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  string(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); string(8, 'WAVE');
  string(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true); view.setUint32(24, rendered.sampleRate, true);
  view.setUint32(28, rendered.sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true);
  string(36, 'data'); view.setUint32(40, buffer.byteLength - 44, true);
  let offset = 44;
  for (let frame = 0; frame < rendered.length; frame++) for (const channel of channels) {
    const sample = Math.max(-1, Math.min(1, channel[frame] * gain));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function requestNarration(text, voice, signal) {
  const response = await fetch(`${API_BASE}/voice/speak`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: narrationText(text), voice }), signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(response.status, data.detail, "/api/voice/speak"));
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('The voice service returned an empty recording.');
  return masterNarration(blob);
}
