import * as THREE from 'three';
export function theatre({ panel, action, status }) {
  panel(`<h2>Theatre · Line rehearsal</h2><label>Script (one cue per line)<textarea id="script-text" rows="7" maxlength="30000" placeholder="Paste your scene here"></textarea></label><button id="script-load">Load script</button><p id="cue-count" role="status"></p><div id="script-line" class="readout" aria-live="polite"></div><div class="row"><button id="cue-prev">Previous</button><button id="cue-reveal">Hide line</button><button id="cue-next">Next</button><button id="cue-speak">Read line</button></div><label>Seconds per cue <input id="cue-delay" type="number" min="2" max="120" value="8"></label><div class="row"><button id="cue-auto">Start auto-cues</button><button id="cue-stop">Stop</button></div><p>No script is uploaded. Read-aloud uses your device's available speech voices.</p>`);
  const $ = id => document.getElementById(id);
  $('script-text').closest('label').insertAdjacentHTML('beforebegin', `<section class="tool-guide"><h3>What is line rehearsal?</h3><p>A practice partner for learning dialogue: read one cue, hide it, say it from memory, then reveal it to check yourself. A cue is one speaking turn or stage direction.</p><ol><li>Paste your scene below, putting each character's speaking turn on a separate line.</li><li>Click <strong>Load script</strong>. Use Previous / Next to move through the scene.</li><li>Click <strong>Hide line</strong> to practise recall, then Reveal line to check. Read line plays the current cue aloud.</li><li>For timed practice, choose seconds per cue and Start auto-cues. Stop pauses the timer.</li></ol><p>Example exercise: practise slowly at 10 seconds per cue, then reduce the time as you become confident. This tool does not listen to or grade your performance; cues advance by timer, not speech.</p><button id="script-example" class="secondary">Try an example scene</button></section>`);
  action('script-example', () => { $('script-text').value='NARRATOR: The rehearsal room falls silent.\nMAYA: Are you ready to step onto the stage?\nLEO: I am nervous, but I will try.\nMAYA: Take a breath. We will begin together.\n[Both walk to the centre of the stage.]'; $('script-load').click(); });
  let lines = [], index = 0, hidden = false, timer;
  function render() { $('script-line').textContent = hidden ? '••• Recall this line •••' : lines[index] || 'Load a script to begin.'; $('cue-count').textContent = lines.length ? `Cue ${index+1} of ${lines.length}` : ''; $('cue-reveal').textContent = hidden ? 'Reveal line' : 'Hide line'; }
  function stop() { clearInterval(timer); timer = null; window.speechSynthesis?.cancel(); $('cue-auto').textContent = 'Start auto-cues'; }
  action('script-load', () => { stop(); lines = $('script-text').value.split('\n').map(v=>v.trim()).filter(Boolean); index=0; hidden=false; render(); });
  action('cue-next', () => { index=Math.max(0,Math.min(lines.length-1, index+1)); render(); });
  action('cue-prev', () => { index=Math.max(0,index-1); render(); });
  action('cue-reveal', () => { hidden=!hidden; render(); });
  action('cue-speak', () => { if (!window.speechSynthesis) throw new Error('Read-aloud is unavailable in this browser.'); speechSynthesis.cancel(); if(lines[index]) speechSynthesis.speak(new SpeechSynthesisUtterance(lines[index])); });
  action('cue-auto', () => { stop(); const delay=Number($('cue-delay').value); if(!lines.length || delay<2 || delay>120 || !Number.isFinite(delay)) throw new Error('Load a script and choose 2–120 seconds per cue.'); $('cue-auto').textContent='Auto-cues running'; timer=setInterval(()=>{ if(index>=lines.length-1) stop(); else { index++; render(); } },delay*1000); });
  action('cue-stop', stop); render();
  return stop;
}

export function projection({ panel, action, status }) {
  panel(`<h2>Theatre · Vocal projection</h2><p>Relative microphone level only—not calibrated sound pressure or a measure of vocal health. Keep microphone distance consistent; do not strain your voice.</p><div class="readout" id="voice-level">Microphone off</div><meter id="voice-meter" min="0" max="1" value="0" style="width:100%"></meter><div class="row"><button id="voice-start">Enable microphone</button><button id="voice-stop">Stop microphone</button></div><p>Audio is analysed on this device, not recorded or uploaded.</p>`);
  const output=document.getElementById('voice-level'), meter=document.getElementById('voice-meter');
  let stream, context, frame, token=0;
  function stop(){ token++; cancelAnimationFrame(frame); stream?.getTracks().forEach(t=>t.stop()); stream=null; context?.close().catch(()=>{}); context=null; output.textContent='Microphone off'; meter.value=0; }
  action('voice-start', async()=>{ stop(); const current=token; output.textContent='Waiting for microphone permission…'; try {
    const incoming=await navigator.mediaDevices.getUserMedia({audio:true});
    if(current!==token){incoming.getTracks().forEach(t=>t.stop()); return;}
    stream=incoming; context=new AudioContext(); await context.resume(); if(current!==token) return;
    const analyser=context.createAnalyser(); analyser.fftSize=2048; context.createMediaStreamSource(stream).connect(analyser); const data=new Float32Array(2048);
    function tick(){ if(current!==token)return; analyser.getFloatTimeDomainData(data); const rms=Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length); const db=20*Math.log10(Math.max(rms,0.00001)); output.textContent=`${db.toFixed(0)} dBFS · ${rms>0.8?'Input clipping—reduce level':rms<0.005?'Quiet input':'Voice detected'}`; meter.value=rms; frame=requestAnimationFrame(tick); } tick();
  }catch(error){if(current===token){stop(); status(`Microphone unavailable: ${error.message}. Allow microphone access in your browser.`);}} });
  action('voice-stop',stop); return stop;
}

export function lighting({ panel, action }) {
  panel(`<h2>Theatre · Lighting study</h2><p>Explore light colour, intensity and position on a simple stage.</p><div id="lighting-view"></div><label>Light colour <input id="light-color" type="color" value="#ffcc99"></label><label>Intensity <input id="light-power" type="range" min="0" max="150" value="70"></label><label>Left / right <input id="light-x" type="range" min="-5" max="5" step="0.1" value="-2"></label>`);
  const holder=document.getElementById('lighting-view');
  holder.insertAdjacentHTML('beforebegin', `<section class="tool-guide"><h3>What is stage lighting for?</h3><p>Lighting helps an audience see the performer and understand a scene's mood. The grey figure represents an actor; the platform is the stage. This is a visual classroom experiment, not a controller for real lights or a professional lighting plan.</p><ol><li><strong>Colour:</strong> compare warm amber with cool blue and discuss how each changes the scene.</li><li><strong>Intensity:</strong> change how strongly the actor is lit. Low light can suggest a quiet moment; brighter light can suggest an open, energetic scene.</li><li><strong>Left / right:</strong> move the lamp across the stage and watch which side of the figure catches the light.</li></ol><p>Try these starting points, then adjust the sliders. There is no single correct mood for a colour.</p><div class="row"><button id="light-warm">Warm rehearsal</button><button id="light-cool">Cool night</button><button id="light-side">Side-light study</button></div><p id="light-description" role="status">Warm light from the left. Compare both sides of the actor.</p></section>`);
  const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); holder.append(renderer.domElement);
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#171321'); const camera=new THREE.PerspectiveCamera(45,2,0.1,100); camera.position.set(0,3,9); camera.lookAt(0,1,0);
  const floor=new THREE.Mesh(new THREE.BoxGeometry(8,0.15,5),new THREE.MeshStandardMaterial({color:'#777777'})); scene.add(floor);
  const actor=new THREE.Mesh(new THREE.CapsuleGeometry(0.4,1.2,8,16),new THREE.MeshStandardMaterial({color:'#dddddd'})); actor.position.y=1.1; scene.add(actor);
  scene.add(new THREE.AmbientLight(0xffffff,0.15)); const light=new THREE.PointLight(0xffcc99,70); light.position.set(-2,4,2); scene.add(light);
  const render=()=>renderer.render(scene,camera);
  for (const [id, colour, power, x, description] of [
    ['light-warm','#ffcc99',70,-2,'Warm amber: try this for an intimate conversation.'],
    ['light-cool','#88baff',45,2,'Cool blue: discuss whether this suggests night, calm or distance.'],
    ['light-side','#ffffff',100,-5,'Side lighting: notice the contrast between the two sides of the figure.'],
  ]) action(id,()=>{document.getElementById('light-color').value=colour;document.getElementById('light-power').value=power;document.getElementById('light-x').value=x;light.color.set(colour);light.intensity=power;light.position.x=x;document.getElementById('light-description').textContent=description;render();});
  document.getElementById('light-color').oninput=e=>{light.color.set(e.target.value);render();}; document.getElementById('light-power').oninput=e=>{light.intensity=Number(e.target.value);render();}; document.getElementById('light-x').oninput=e=>{light.position.x=Number(e.target.value);render();};
  const resize=new ResizeObserver(()=>{const width=holder.clientWidth; renderer.setSize(width,width/2);camera.aspect=2;camera.updateProjectionMatrix();render();});resize.observe(holder);render();
  return ()=>{resize.disconnect();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});renderer.dispose();};
}
