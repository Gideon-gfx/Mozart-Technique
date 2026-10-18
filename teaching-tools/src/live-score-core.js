import { PitchDetector } from 'pitchy';
import { noteName } from './transcriber-core.js';

export const MAX_LIVE_SECONDS = 300;
export const MAX_SCORE_SLOTS = 512;
export const KEY_SIGNATURES = [
  ['C', 'C major', 0], ['G', 'G major', 1], ['D', 'D major', 2],
  ['A', 'A major', 3], ['E', 'E major', 4], ['B', 'B major', 5],
  ['F#', 'F♯ major', 6], ['F', 'F major', -1], ['Bb', 'B♭ major', -2],
  ['Eb', 'E♭ major', -3], ['Ab', 'A♭ major', -4], ['Db', 'D♭ major', -5],
  ['Am', 'A minor', 0], ['Em', 'E minor', 1], ['Bm', 'B minor', 2],
  ['F#m', 'F♯ minor', 3], ['C#m', 'C♯ minor', 4], ['G#m', 'G♯ minor', 5],
  ['D#m', 'D♯ minor', 6], ['Dm', 'D minor', -1], ['Gm', 'G minor', -2],
  ['Cm', 'C minor', -3], ['Fm', 'F minor', -4], ['Bbm', 'B♭ minor', -5],
].map(([id, label, fifths]) => ({id, label, fifths}));

const pitchHistory = new WeakMap();
export function analysePitch(detector, frame, sampleRate) {
  let energy = 0;
  for (const sample of frame) energy += sample * sample;
  const rms = Math.sqrt(energy / frame.length);
  if (rms < .012) { pitchHistory.delete(detector); return {midi: null, rms}; }
  const [frequency, clarity] = detector.findPitch(frame, sampleRate);
  const pitch = 69 + 12 * Math.log2(frequency / 440);
  if (clarity < .93 || !Number.isFinite(pitch) || frequency < 65 || pitch < 35.5 || pitch > 95.5) {
    pitchHistory.delete(detector);return {midi:null,rms};
  }
  // Median filtering rejects short harmonic jumps. Hysteresis keeps vibrato
  // around a semitone boundary from becoming alternating written notes.
  const history=pitchHistory.get(detector)||{values:[],midi:null};
  history.values.push(pitch);if(history.values.length>3)history.values.shift();
  const sorted=[...history.values].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
  if(history.midi===null||Math.abs(median-history.midi)>.72)history.midi=Math.round(median);
  pitchHistory.set(detector,history);
  return {midi:history.midi,rms,frequency,clarity};
}

// Debounce pitch changes rather than turning vibrato/noise into extra notes.
export class LiveScoreTracker {
  constructor() { this.completed = []; this.current = null; this.candidate = undefined; this.count = 0; this.lastTime = 0; this.lastLevel = 0; }
  push(midi, time, rms = 0) {
    if (!Number.isFinite(time) || time < this.lastTime) return;
    this.lastTime = time;
    if (!Number.isInteger(midi) || midi < 36 || midi > 95) midi = null;
    if (midi !== this.candidate) { this.candidate = midi; this.candidateAt = time; this.count = 1; }
    else this.count++;
    // Loudness changes alone are not reliable sung-note onsets (vibrato and
    // microphone gain can cause them). Require a stable pitch or silence.
    if (this.count >= 2 && midi !== this.current?.midi) {
      const boundary = this.candidateAt;
      if (this.current && boundary - this.current.start >= .07) this.completed.push({...this.current, end: boundary});
      if (this.current || midi != null) this.current = {midi, start: boundary};
    }
    this.lastLevel = rms;
  }
  snapshot(time = this.lastTime) {
    return this.current ? [...this.completed, {...this.current, end: Math.max(time, this.current.start + .04)}] : [...this.completed];
  }
}

export function estimateTempo(segments, fallback = 120) {
  const onsets = segments.filter(segment => segment.midi != null && segment.end - segment.start >= .09).map(segment => segment.start).slice(-25);
  const intervals = onsets.slice(1).map((time, i) => time - onsets[i]).filter(value => value >= .16 && value <= 2);
  if (intervals.length < 3) return {bpm: fallback, estimated: false};
  intervals.sort((a,b) => a-b);
  const median = intervals[Math.floor(intervals.length/2)];
  // Average the nearby intervals to remove frame-boundary jitter while
  // excluding clearly different note values (for example eighths vs quarters).
  const near=intervals.filter(value=>Math.abs(value-median)<=median*.2);
  const period=near.reduce((sum,value)=>sum+value,0)/near.length;
  let bpm = 60 / period;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return {bpm: Math.round(bpm), estimated: true};
}

export function estimateKey(segments) {
  const pitched = segments.filter(segment => segment.midi != null);
  const histogram = Array(12).fill(0);
  for (const note of pitched) histogram[note.midi % 12] += Math.max(.08, note.end - note.start);
  if (pitched.length < 5 || histogram.filter(Boolean).length < 4) return null;
  // Duration-weighted major/minor pitch-class templates; this is an estimate,
  // not harmonic analysis of chords or a guarantee of the composer's key.
  const profiles = [[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88], [6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17]];
  const major = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const minor = ['Cm','C#m','Dm','D#m','Em','Fm','F#m','Gm','G#m','Am','Bbm','Bm'];
  const mean = histogram.reduce((a,b)=>a+b,0)/12;
  let best = null;
  for (let mode = 0; mode < 2; mode++) {
    const profile = profiles[mode];
    const average = profile.reduce((a,b)=>a+b,0)/12;
    for (let tonic = 0; tonic < 12; tonic++) {
      let dot=0, x2=0, y2=0;
      for (let i=0;i<12;i++) {
        const x=histogram[i]-mean, y=profile[(i-tonic+12)%12]-average;
        dot+=x*y; x2+=x*x; y2+=y*y;
      }
      const correlation=dot/Math.sqrt(x2*y2 || 1);
      if (!best || correlation>best.correlation) best={id:(mode?minor:major)[tonic],correlation};
    }
  }
  return best && best.correlation > .45 ? KEY_SIGNATURES.find(key=>key.id===best.id) : null;
}

export function segmentsToEvents(segments, bpm) {
  const first = segments.findIndex(segment=>segment.midi!=null);
  const last = segments.findLastIndex(segment=>segment.midi!=null);
  if (first < 0) return [];
  const events=[];
  let total=0;
  for (const segment of segments.slice(first,last+1)) {
    if (segment.end-segment.start<.065) continue;
    let remaining=Math.max(1,Math.round((segment.end-segment.start)*bpm/30));
    let continued=false;
    while (remaining && total<MAX_SCORE_SLOTS) {
      const slots=[8,4,2,1].find(value=>value<=remaining && total+value<=MAX_SCORE_SLOTS);
      if (!slots) break;
      const pitched=segment.midi!=null;
      events.push({midi:segment.midi,slots,tieStop:pitched&&continued,tieStart:pitched&&remaining>slots});
      remaining-=slots; total+=slots; continued=true;
    }
  }
  return events;
}

export async function analyseMelody(samples, sampleRate, bpm, onProgress, isCancelled) {
  const detector=PitchDetector.forFloat32Array(4096);
  const tracker=new LiveScoreTracker();
  for (let i=0;i+4096<=samples.length;i+=2048) {
    if (isCancelled()) throw new Error('Transcription cancelled.');
    const frame=samples.subarray(i,i+4096);
    const pitch=analysePitch(detector,frame,sampleRate);
    tracker.push(pitch.midi,i/sampleRate,pitch.rms);
    if (i%163840===0) { onProgress(Math.round(i/samples.length*100)); await new Promise(resolve=>setTimeout(resolve,0)); }
  }
  const segments=tracker.snapshot(samples.length/sampleRate);
  const tempo=bpm ? {bpm,estimated:false} : estimateTempo(segments);
  const events=segmentsToEvents(segments,tempo.bpm);
  if (!events.some(note=>note.midi!=null)) throw new Error('No clear melody found. Try a single voice or instrument closer to the microphone.');
  return {events,tempo,key:estimateKey(segments)};
}

export function pitchSpelling(midi, key) {
  const names=key?.fifths<0 ? ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'] : ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return midi==null ? null : {step:names[midi%12][0],accidental:names[midi%12].slice(1),octave:Math.floor(midi/12)-1};
}

export function scoreSummary(events) { return events.filter(event=>event.midi!=null).map(event=>noteName(event.midi)).join(' '); }
