import assert from 'node:assert/strict';
import {LiveScoreTracker,analyseMelody,estimateTempo,estimateKey,segmentsToEvents} from './src/live-score-core.js';
import {splitIntoBars,scoreText} from './src/transcriber-core.js';
import {musicXml} from './src/live-score-export.js';

const tracker=new LiveScoreTracker();
for(let i=0;i<120;i++) tracker.push(i<20?60:i<40?62:i<60?64:i<80?65:i<100?67:60,i*.025,.15);
const segments=tracker.snapshot(3);
assert.equal(segments.length,6);
assert.equal(estimateTempo(segments).bpm,120);
assert.equal(estimateTempo(segments).estimated,true);
const jittered=[0,.384,.811,1.195,1.621,2.005].map(start=>({midi:60,start,end:start+.3}));
assert.ok(Math.abs(estimateTempo(jittered).bpm-150)<=2,'Tempo should tolerate audio-frame timing jitter.');
assert.equal(estimateTempo(segments.slice(0,2)).estimated,false);
assert.equal(estimateKey(segments.slice(0,2)),null);
assert.ok(estimateKey(segments)?.label);
assert.equal(scoreText(segmentsToEvents(segments,120)),'C4:q D4:q E4:q F4:q G4:q C4:q');
const unstable=new LiveScoreTracker();
unstable.push(60,0,.15);unstable.push(60,.05,.15);unstable.push(61,.1,.15);unstable.push(60,.15,.15);unstable.push(60,.2,.15);
assert.equal(unstable.snapshot().length,1,'A one-frame pitch wobble must not create a note.');
const tied=splitIntoBars([{midi:60,slots:2},{midi:64,slots:8}]);
assert.equal(tied[0].at(-1).tieStart,true);
assert.equal(tied[1][0].tieStop,true);
const xml=musicXml([{midi:60,slots:2},{midi:64,slots:8}],{bpm:120,title:'A & B <score>',key:{id:'F',fifths:-1}});
assert.match(xml,/<sound tempo="120"/);assert.match(xml,/<fifths>-1<\/fifths>/);assert.match(xml,/A &amp; B &lt;score&gt;/);assert.match(xml,/<tie type="start"/);
const samples=new Float32Array(44100);
for(let i=0;i<samples.length;i++)samples[i]=.4*Math.sin(2*Math.PI*(i<22050?440:493.883)*i/44100);
const result=await analyseMelody(samples,44100,null,()=>{},()=>false);
assert.equal(scoreText(result.events),'A4:q B4:q');
// A voice-like signal: vibrato, harmonics and changing loudness, not only a
// clean sine wave. Sustained singing must not become semitone chatter.
const sung=new Float32Array(44100*3);let phase=0;
for(let i=0;i<sung.length;i++){
  const time=i/44100,midi=time<1?60:time<2?62:64;
  const hz=440*2**((midi-69+.58*Math.sin(2*Math.PI*5*time))/12);
  phase+=2*Math.PI*hz/44100;
  const envelope=.12+.07*Math.sin(2*Math.PI*2*time);
  sung[i]=envelope*(Math.sin(phase)+.45*Math.sin(phase*2)+.2*Math.sin(phase*3));
}
const sungResult=await analyseMelody(sung,44100,120,()=>{},()=>false);
assert.deepEqual(sungResult.events.filter(note=>note.midi!==null&&!note.tieStop).map(note=>note.midi),[60,62,64],'Vibrato/harmonics should preserve the sung melody.');
const dynamics=new LiveScoreTracker();
for(let i=0;i<80;i++)dynamics.push(60,i*.025,i%10===0?.3:.06);
assert.equal(dynamics.snapshot().length,1,'Changes in volume must not create repeated notes.');
console.log('PASS: live pitch stability, automatic tempo/key, rhythm quantisation, file analysis and tied MusicXML export.');
