import assert from 'node:assert/strict';
import {staffMidi,placeScoreNote} from './src/score-drawing.js';
const staff={bottom:135,spacing:10,clef:'treble'};
assert.equal(staffMidi(135,staff),64);assert.equal(staffMidi(136.5,staff),64);assert.equal(staffMidi(133.5,staff),64);
assert.equal(staffMidi(130,staff),65);assert.equal(staffMidi(135,{...staff,clef:'bass'}),43);
const later=placeScoreNote([],16,60,2);assert.equal(later.slice(0,-1).reduce((sum,n)=>sum+n.slots,0),16);assert.equal(later.at(-1).midi,60);
const corrected=placeScoreNote([{midi:60,slots:8}],2,67,2);assert.deepEqual(corrected.map(n=>n.slots),[2,2,4]);assert.equal(corrected[1].midi,67);
assert.throws(()=>placeScoreNote([],511,60,2),/64 bars/);
console.log('PASS: uneven strokes snap to staff, treble/bass pitches, later staff placement and note replacement.');
