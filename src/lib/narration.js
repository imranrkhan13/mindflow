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

// Kokoro reads short input more evenly than long paragraphs, and every call
// warms the same model anyway. Long scripts are split on sentence boundaries so
// one slow request no longer blocks the whole preview.
export function narrationChunks(text, limit = 420) {
  const clean = narrationText(text);
  if (clean.length <= limit) return clean ? [clean] : [];
  const sentences = clean.match(/[^.!?]+[.!?]*\s*/g) || [clean];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + sentence).length > limit) {
      chunks.push(current.trim());
      current = '';
    }
    // A single sentence over the limit is hard-split at a comma or space.
    if (sentence.length > limit) {
      const words = sentence.split(/(?<=,)\s+|\s+/);
      for (const word of words) {
        if ((current + ' ' + word).length > limit && current) {
          chunks.push(current.trim());
          current = '';
        }
        current += (current ? ' ' : '') + word;
      }
      continue;
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
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

/* ── Preview speed ────────────────────────────────────────────────────────
   A voice sample is only useful if you can hear it immediately. Samples are
   cached per voice (so switching back is instant) and small samples are fetched
   ahead, two at a time, so a click plays instead of waiting ~3 s. */
const previewCache = new Map(); // `${voice}` → Promise<Blob>
const warmInFlight = new Set();

export function cachedNarration(text, voice) {
  const key = `${voice}::${text}`;
  if (!previewCache.has(key)) {
    const promise = requestNarration(text, voice);
    promise.catch(() => previewCache.delete(key)); // never cache a failure
    previewCache.set(key, promise);
  }
  return previewCache.get(key);
}

export function warmNarration(text, voices = []) {
  for (const voice of voices) {
    const key = `${voice}::${text}`;
    if (previewCache.has(key) || warmInFlight.has(key)) continue;
    warmInFlight.add(key);
    cachedNarration(text, voice).finally(() => warmInFlight.delete(key));
  }
}

// Sequential fallback for long text: chunk, speak, and concatenate the WAVs by
// decoding each part and joining the PCM. Keeps long answers available when a
// single request hits the server's 6,000-character limit.
export async function requestNarrationLong(text, voice, signal, onChunk) {
  const chunks = narrationChunks(text);
  if (!chunks.length) throw new Error('There is nothing to read aloud.');
  if (chunks.length === 1) return requestNarration(chunks[0], voice, signal);
  // Decode while the next part is still being generated, so the join at the end
  // is instant rather than another wait.
  const decode = async (index) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    onChunk?.(index + 1, chunks.length);
    const part = await requestNarration(chunks[index], voice, signal);
    const buffer = await part.arrayBuffer();
    return new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 24000).decodeAudioData(buffer);
  };
  const decoded = [];
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const index = next++;
      decoded[index] = await decode(index);
    }
  };
  await Promise.all([worker(), worker()]);
  return joinAudio(decoded);
}

async function joinAudio(buffers) {
  const rate = buffers[0].sampleRate;
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const gap = Math.round(rate * 0.28); // a breath between sections
  const length = buffers.reduce((total, b) => total + b.length + gap, 0);
  const context = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(channels, length, rate);
  const output = context.createBuffer(channels, length, rate);
  let cursor = 0;
  for (const buffer of buffers) {
    for (let c = 0; c < channels; c++) {
      output.copyToChannel(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)), c, cursor);
    }
    cursor += buffer.length + gap;
  }
  return encodeWav(output);
}

function encodeWav(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  let peak = 0;
  for (const channel of channels) for (const value of channel) peak = Math.max(peak, Math.abs(value));
  const gain = peak > 0 ? Math.min(2, 0.89 / peak) : 1;
  const bytes = new ArrayBuffer(44 + buffer.length * channels.length * 2);
  const view = new DataView(bytes);
  const string = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  string(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); string(8, 'WAVE');
  string(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true);
  string(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
  let offset = 44;
  for (let frame = 0; frame < buffer.length; frame++) for (const channel of channels) {
    const sample = Math.max(-1, Math.min(1, channel[frame] * gain));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
