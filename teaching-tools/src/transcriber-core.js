import { PitchDetector } from "pitchy";

export const MAX_TRANSCRIPTION_SECONDS = 60;
export const SLOTS_PER_BAR = 8; // Eighth-note grid in 4/4.

export function noteName(midi) {
  if (midi == null) return "R";
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function parseScore(text) {
  const tokens = text.trim().split(/[\s,|]+/).filter(Boolean);
  if (!tokens.length || tokens.length > 512) throw new Error("Enter between 1 and 512 notes or rests.");
  const durationSlots = { "8": 1, q: 2, h: 4, w: 8 };
  const events = tokens.map(token => {
    const match = /^(R|[A-G](?:#|b)?[2-6]):(8|q|h|w)$/i.exec(token);
    if (!match) throw new Error(`“${token}” is invalid. Try C4:q, F#4:8, or R:8.`);
    const pitch = match[1].toUpperCase();
    let midi = null;
    if (pitch !== "R") {
      const [, letter, accidental, octave] = /^([A-G])([#B]?)([2-6])$/.exec(pitch);
      const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
      midi = (Number(octave) + 1) * 12 + semitone + (accidental === "#" ? 1 : accidental === "B" ? -1 : 0);
    }
    return { midi, slots: durationSlots[match[2].toLowerCase()] };
  });
  if (events.reduce((sum, event) => sum + event.slots, 0) > 512) throw new Error("This score is too long (maximum 64 bars).");
  return events;
}

export function scoreText(events) {
  const durations = { 1: "8", 2: "q", 4: "h", 8: "w" };
  return events.map(event => `${noteName(event.midi)}:${durations[event.slots]}`).join(" ");
}

export function splitIntoBars(events) {
  const bars = [];
  let bar = [];
  let used = 0;
  for (const event of events) {
    let remaining = event.slots;
    let consumed = 0;
    while (remaining) {
      const available = Math.min(remaining, SLOTS_PER_BAR - used);
      const length = [8, 4, 2, 1].find(value => value <= available);
      bar.push({ midi: event.midi, slots: length, tieStop: event.midi != null && (Boolean(event.tieStop) || consumed > 0), tieStart: event.midi != null && (Boolean(event.tieStart) || remaining > length) });
      consumed += length;
      used += length;
      remaining -= length;
      if (used === SLOTS_PER_BAR) {
        bars.push(bar);
        bar = [];
        used = 0;
      }
    }
  }
  if (bar.length) bars.push(bar);
  return bars;
}

export function slotsToEvents(slots) {
  const events = [];
  for (let start = 0; start < slots.length;) {
    const pitch = slots[start];
    const barRemaining = SLOTS_PER_BAR - (start % SLOTS_PER_BAR);
    let run = 1;
    while (run < barRemaining && start + run < slots.length && slots[start + run] === pitch) run++;
    let remaining = run;
    while (remaining) {
      const length = [8, 4, 2, 1].find(value => value <= remaining);
      events.push({ midi: pitch, slots: length });
      remaining -= length;
    }
    start += run;
  }
  return events;
}

export async function transcribeSamples(samples, sampleRate, bpm, onProgress = () => {}, isCancelled = () => false) {
  if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate < 8000) throw new Error("Could not read this audio.");
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error("Choose a tempo between 40 and 240 BPM.");
  if (samples.length / sampleRate > MAX_TRANSCRIPTION_SECONDS) throw new Error(`Use a clip of ${MAX_TRANSCRIPTION_SECONDS} seconds or less.`);
  const frameSize = 4096;
  const hop = 1024;
  if (samples.length < frameSize) throw new Error("Play or upload at least a short note.");
  const detector = PitchDetector.forFloat32Array(frameSize);
  const frame = new Float32Array(frameSize);
  const observations = [];
  for (let start = 0; start + frameSize <= samples.length; start += hop) {
    if (isCancelled()) throw new Error("Transcription cancelled.");
    frame.set(samples.subarray(start, start + frameSize));
    let energy = 0;
    for (let i = 0; i < frameSize; i++) energy += frame[i] * frame[i];
    const rms = Math.sqrt(energy / frameSize);
    let midi = null;
    if (rms > 0.012) {
      const [frequency, clarity] = detector.findPitch(frame, sampleRate);
      if (clarity >= 0.82 && frequency >= 65 && frequency <= 1800) {
        const value = Math.round(69 + 12 * Math.log2(frequency / 440));
        if (value >= 36 && value <= 96) midi = value;
      }
    }
    observations.push({ time: (start + frameSize / 2) / sampleRate, midi });
    if (observations.length % 80 === 0) {
      onProgress(Math.min(95, Math.round(95 * (start + frameSize) / samples.length)));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  // Remove isolated one-frame pitch jumps before quantising onto the beat grid.
  for (let i = 1; i < observations.length - 1; i++) {
    if (observations[i - 1].midi === observations[i + 1].midi && observations[i].midi !== observations[i - 1].midi) {
      observations[i].midi = observations[i - 1].midi;
    }
  }
  const slotSeconds = 30 / bpm;
  const count = Math.ceil((samples.length / sampleRate) / slotSeconds);
  if (count > 512) throw new Error("This clip is too long at the chosen tempo. Shorten it or select a slower BPM.");
  const slots = [];
  let cursor = 0;
  for (let index = 0; index < count; index++) {
    const from = index * slotSeconds;
    const to = from + slotSeconds;
    while (cursor < observations.length && observations[cursor].time < from) cursor++;
    const votes = new Map();
    let total = 0;
    for (let at = cursor; at < observations.length && observations[at].time < to; at++) {
      total++;
      if (observations[at].midi != null) votes.set(observations[at].midi, (votes.get(observations[at].midi) || 0) + 1);
    }
    const [pitch, votesForPitch] = [...votes].sort((a, b) => b[1] - a[1])[0] || [null, 0];
    slots.push(total && votesForPitch / total >= 0.45 ? pitch : null);
  }
  const first = slots.findIndex(value => value != null);
  if (first < 0) throw new Error("No clear melody found. Try a single instrument or voice close to the microphone.");
  const last = slots.findLastIndex(value => value != null);
  const events = slotsToEvents(slots.slice(first, last + 1));
  onProgress(100);
  return events;
}
