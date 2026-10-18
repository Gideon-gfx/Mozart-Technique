import { PitchDetector } from 'pitchy';
import { analysePitch } from './live-score-core.js';

class MozartLivePitch extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame=new Float32Array(4096); this.filled=0; this.running=true;
    this.detector=PitchDetector.forFloat32Array(this.frame.length);
    this.port.onmessage=event=>{if(event.data==='stop') this.running=false;};
  }
  process(inputs) {
    const input=inputs[0]?.[0];
    if (input) for (let i=0;i<input.length;i++) {
      this.frame[this.filled++]=input[i];
      if(this.filled===this.frame.length) {
        this.port.postMessage({...analysePitch(this.detector,this.frame,sampleRate),time:(currentFrame+i)/sampleRate});
        this.frame.copyWithin(0,2048); this.filled=2048;
      }
    }
    return this.running;
  }
}
registerProcessor('mozart-live-pitch',MozartLivePitch);
