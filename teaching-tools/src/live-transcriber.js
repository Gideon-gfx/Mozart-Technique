import { PitchDetector } from 'pitchy';
import { MAX_TRANSCRIPTION_SECONDS, parseScore, scoreText, splitIntoBars, transcribeSamples } from './transcriber-core.js';
import { KEY_SIGNATURES, MAX_LIVE_SECONDS, MAX_SCORE_SLOTS, LiveScoreTracker, analyseMelody, analysePitch, estimateKey, estimateTempo, pitchSpelling, segmentsToEvents } from './live-score-core.js';
import { musicXml, scoreImage } from './live-score-export.js';
import { attachScoreDrawing, placeScoreNote } from './score-drawing.js';

const DRAFT_KEY='mozart-live-score-draft-v1';
const validBpm=value=>Number.isFinite(Number(value))&&Number(value)>=40&&Number(value)<=240;
function readDraft(key=DRAFT_KEY) {
  try {
    const draft=JSON.parse(localStorage.getItem(key));
    if(!draft||!Array.isArray(draft.events)||draft.events.length>512) return null;
    if(draft.events.some(note=>![1,2,4,8].includes(note.slots)||(note.midi!==null&&(!Number.isInteger(note.midi)||note.midi<36||note.midi>95)))) return null;
    return draft.events.reduce((sum,note)=>sum+note.slots,0)>MAX_SCORE_SLOTS?null:draft;
  }catch{return null;}
}

export async function transcriber({panel,action,status,saveFile,isCurrent=()=>true,onPermissionStart=()=>{},onPermissionEnd=()=>{},mode='transcriber'}) {
  const draftKey=mode==='manuscript'?'mozart-manuscript-draft-v2':DRAFT_KEY;
  panel(`<h2>Live scoresheet</h2><p class="tool-description">Sing or play a melody. Watch the notes appear on your sheet as you perform.</p>
  <div class="live-toolbar"><button id="record-start" disabled>Start listening</button><button id="record-stop" class="secondary" disabled>Pause</button><button id="score-new" class="secondary">New score</button><span id="record-time" role="status">Microphone off</span></div>
  <div id="score-reset-confirm" class="tool-guide" hidden><p>Start a new score? Save your current score first if you want to keep it.</p><div class="row"><button id="score-reset-yes">Start new score</button><button id="score-reset-no" class="secondary">Keep this score</button></div></div>
  <div class="live-score-stats"><div><small>NOTE</small><strong id="live-note">—</strong></div><div><small>TEMPO · ESTIMATE</small><strong id="live-tempo">Listening…</strong></div><div><small>KEY · ESTIMATE</small><strong id="live-key">Listening…</strong></div></div>
  <p id="transcriber-status" role="status" aria-live="polite">Your empty scoresheet is ready. Select Start listening to begin.</p>
  <section id="transcriber-result" class="score-paper"><div class="score-paper-heading"><label class="score-title-label" for="score-title">SCORE TITLE</label><input id="score-title" value="Untitled score" maxlength="120" aria-label="Score title"><div class="score-paper-meta"><span id="score-tempo-mark">Tempo will appear as you play</span><span id="score-key-mark">Key will appear as you play</span><span>4/4</span></div></div><div id="transcribed-score" aria-label="Live sheet music"></div></section>
  <div class="row score-save-row"><button id="score-image" disabled>Save score image</button><button id="score-export" class="secondary" disabled>Save MusicXML</button><span id="score-save-status" role="status"></span></div>
  <details class="score-options"><summary>Score settings &amp; corrections</summary><div class="row"><label>Tempo <select id="tempo-mode"><option value="auto">Detect automatically</option><option value="manual">Set manually</option></select></label><label>Tempo (BPM) <input id="transcriber-bpm" type="number" min="40" max="240" value="120"></label><label>Key <select id="score-key"><option value="auto">Detect automatically</option>${KEY_SIGNATURES.map(key=>`<option value="${key.id}">${key.label}</option>`).join('')}</select></label><label>Clef <select id="transcriber-clef"><option value="treble">Treble</option><option value="bass">Bass</option></select></label></div><label>Correct notes and rhythms<textarea id="score-input" rows="3" spellcheck="false" placeholder="C4:q D4:8 E4:8 R:q"></textarea></label><p class="muted">C4:q = quarter note; C4:8 = eighth; C4:h = half; C4:w = whole. R:q = a rest. Pause before editing.</p><button id="score-redraw" class="secondary">Update score</button></details>
  <details class="score-options"><summary>Transcribe an audio file instead</summary><label>Audio file <input id="transcriber-file" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg"></label><audio id="transcriber-playback" controls hidden></audio><div class="row"><button id="transcribe" disabled>Transcribe file to score</button><button id="transcribe-cancel" class="secondary" hidden>Cancel analysis</button></div><p class="muted">Audio clips up to ${MAX_TRANSCRIPTION_SECONDS} seconds. Uses the tempo/key settings above.</p></details>
  <p class="muted">Follow one clear voice or instrument at a time. Chords and background music can confuse detection. Tempo, key and rhythms are estimates you can correct. Your draft stays on this device; save a file to keep or share it.</p>`);
  const $=id=>document.getElementById(id);
  // Keep the notation engine and its controls shared between both presentation views.
  const root=$('transcriber-result').parentElement;
  root.classList.add('digital-score');
  const paths={record:'<circle cx="12" cy="12" r="6" fill="currentColor"/>',pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 5 11 7-11 7Z"/>',import:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',tempo:'<path d="m8 21 4-18 5 18ZM12 14l7-7M7 21h12"/>',save:'<path d="M5 3h12l4 4v14H3V3Zm2 0v7h10V3M7 21v-7h10v7"/>',edit:'<path d="m4 16 12-12 4 4L8 20H4Zm9-9 4 4"/>',new:'<path d="M14 3H4v18h16V9ZM14 3v6h6M8 15h8m-4-4v8"/>'};
  const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.tempo}</svg>`;
  const tabs=document.createElement('div');tabs.className='score-view-tabs';tabs.setAttribute('role','tablist');tabs.innerHTML='<button id="score-doc-tab" role="tab" aria-selected="false">Documentation</button><button id="score-live-tab" role="tab" aria-selected="true">Live scoresheet</button>';root.prepend(tabs);
  const docs=document.createElement('section');docs.id='score-documentation';docs.hidden=true;docs.innerHTML='<h2>Your digital manuscript</h2><p>Record one voice or instrument and watch the melody appear as notes. Pause to review, play back your score, or import an audio recording.</p><h3>Toolbar guide</h3><p>Record starts microphone transcription. Pause stops recording or playback. Play performs the written notes. Import accepts audio clips up to 60 seconds and 25 MB.</p><p>The metronome provides a click at your selected tempo. Use headphones while recording so the microphone does not pick up the click.</p><p>Tempo, clef and key controls change your score. Automatic tempo and key are estimates; you can override them. The pencil opens note corrections. Save exports a PNG image or MusicXML file.</p><h3>Getting a clear score</h3><p>Use one clear melody, with little background noise. This is not full orchestral or chord transcription. Review the detected notes and rhythms before saving. Drafts stay on this device.</p>';
  root.append(docs);
  root.querySelector('h2').remove();root.querySelector('.tool-description').remove();
  const live=document.createElement('section');live.className='score-live-workspace';root.insertBefore(live,docs);
  [...root.children].filter(node=>node!==tabs&&node!==docs&&node!==live).forEach(node=>live.append(node));
  const toolbar=live.querySelector('.live-toolbar');toolbar.classList.add('score-icon-toolbar');
  const decorate=(id,label,name)=>{const button=$(id);button.innerHTML=icon(name);button.title=label;button.setAttribute('aria-label',label);};
  decorate('record-start','Record melody','record');decorate('record-stop','Pause','pause');decorate('score-new','Clear all','new');
  $('score-new').innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg><span>Clear all</span>';
  $('score-reset-confirm').querySelector('p').textContent='Clear every note from this score? Save it first if you want to keep a copy.';
  $('score-reset-yes').textContent='Clear all notes';
  const makeButton=(id,label,graphic)=>{const button=document.createElement('button');button.id=id;button.title=label;button.setAttribute('aria-label',label);button.innerHTML=graphic;toolbar.insertBefore(button,$('record-time'));return button;};
  makeButton('score-play','Play score',icon('play'));makeButton('score-click','Metronome',icon('tempo')).setAttribute('aria-pressed','false');
  const pen=makeButton('score-pen','Draw notes on staff',icon('edit'));pen.setAttribute('aria-pressed','false');
  makeButton('score-page','Add score page',icon('new'));
  const duration=document.createElement('select');duration.id='draw-duration';duration.title='Drawn note duration';duration.setAttribute('aria-label','Drawn note duration');duration.innerHTML='<option value="1">♪ Eighth</option><option value="2" selected>♩ Quarter</option><option value="4">𝅗𝅥 Half</option><option value="8">𝅝 Whole</option>';toolbar.insertBefore(duration,$('record-time'));
  const options=[...live.querySelectorAll('.score-options')];
  const controls=document.createElement('div');controls.className='score-control-popovers';toolbar.after(controls);
  const popover=(id,label,graphic,nodes)=>{const box=document.createElement('section');box.id=id;box.className='score-popover';box.hidden=true;const heading=document.createElement('h3');heading.textContent=label;box.append(heading,...nodes);controls.append(box);const button=makeButton(id+'-toggle',label,graphic);button.setAttribute('aria-expanded','false');button.onclick=()=>{const open=box.hidden;controls.querySelectorAll('.score-popover').forEach(p=>p.hidden=true);toolbar.querySelectorAll('[aria-expanded]').forEach(b=>b.setAttribute('aria-expanded','false'));box.hidden=!open;button.setAttribute('aria-expanded',String(open));};};
  const labelFor=id=>$(id).closest('label');
  popover('score-tempo-panel','Tempo',icon('tempo'),[labelFor('tempo-mode'),labelFor('transcriber-bpm')]);
  popover('score-clef-panel','Clef','<span class="score-glyph">𝄞</span>',[labelFor('transcriber-clef')]);
  popover('score-key-panel','Key signature','<span class="score-glyph">♯♭</span>',[labelFor('score-key')]);
  popover('score-edit-panel','Correct notes',icon('edit'),[labelFor('score-input'),$('score-redraw')]);
  $('score-edit-panel').insertAdjacentHTML('afterbegin',`<div class="score-note-editor"><label>Note<select id="edit-note-index"></select></label><label>Pitch<select id="edit-note-pitch"><option value="rest">Rest</option>${Array.from({length:60},(_,i)=>{const midi=i+36;return `<option value="${midi}">${scoreText([{midi,slots:2}]).split(':')[0]}</option>`;}).join('')}</select></label><label>Duration<select id="edit-note-duration"><option value="1">Eighth</option><option value="2">Quarter</option><option value="4">Half</option><option value="8">Whole</option></select></label><button id="edit-note-apply">Apply note</button><button id="edit-note-add">Add note</button><button id="edit-note-delete" class="secondary">Delete note</button></div>`);
  popover('score-import-panel','Import audio',icon('import'),[labelFor('transcriber-file'),$('transcriber-playback'),$('transcribe'),$('transcribe-cancel')]);
  popover('score-save-panel','Save score',icon('save'),[$('score-image'),$('score-export'),$('score-save-status')]);
  options.forEach(node=>node.remove());live.querySelector('.score-save-row').remove();
  live.querySelectorAll(':scope > p.muted').forEach(node=>{docs.append(node);});
  live.querySelector('.live-score-stats').classList.add('score-monitor');
  const setView=guide=>{docs.hidden=!guide;live.hidden=guide;$('score-doc-tab').setAttribute('aria-selected',String(guide));$('score-live-tab').setAttribute('aria-selected',String(!guide));if(!guide)window.dispatchEvent(new Event('resize'));};
  $('score-doc-tab').onclick=()=>setView(true);$('score-live-tab').onclick=()=>setView(false);
  docs.insertAdjacentHTML('beforeend','<h3>Draw and write music</h3><p>Choose the pencil and a note duration, then use your finger, stylus or mouse to draw a small notehead on a staff line or space. It snaps into a playable note. Turn the pencil off to tap and edit a note. Use Correct notes to type pitches and rhythms. Drawing recognises placement, not arbitrary handwritten music symbols.</p>');
  if(mode==='manuscript'){$('score-live-tab').textContent='Manuscript';$('record-start').hidden=true;$('score-import-panel-toggle').hidden=true;docs.querySelector('h2').textContent='Draw and write your manuscript';docs.querySelector('p').textContent='Compose on the staff with your finger, stylus or mouse, or type notes using the correction editor. Play the score and save it as an image or MusicXML.';}
  let disposed=false,analysing=false,cancelled=false,listening=false,starting=false,saving=false;
  let stream=null,context=null,source=null,processor=null,silent=null,timer=null;
  let samples=null,sampleRate=0,previewUrl='',tracker=null,epoch=null,startedAt=0;
  let baseEvents=[],lastRender=0,lastPersist=0,renderedSignature='';
  let events=[],detectedKey=null,detectedTempo={bpm:120,estimated:false},draftDirty=false;
  let playbackContext=null,playbackTimer=null,clickTimer=null,playing=false,clicking=false;
  let drawing=false,staffLayout=[],highlightTimers=[],minimumBars=8;
  const clearHighlights=()=>{highlightTimers.forEach(clearTimeout);highlightTimers=[];$('transcribed-score')?.querySelectorAll('.score-note-playing').forEach(node=>node.classList.remove('score-note-playing'));};
  const sound=async()=>{if(!playbackContext||playbackContext.state==='closed')playbackContext=new(window.AudioContext||window.webkitAudioContext)();await playbackContext.resume();return playbackContext;};
  const tone=(audio,hz,at,duration,volume=.12)=>{const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='triangle';oscillator.frequency.value=hz;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+Math.max(.03,duration));oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+duration+.02);};
  const stopPlayback=async()=>{clearHighlights();clearTimeout(playbackTimer);clearInterval(clickTimer);clicking=playing=false;$('score-click')?.setAttribute('aria-pressed','false');const old=playbackContext;playbackContext=null;await old?.close().catch(()=>{});if(current())buttons();};
  const current=()=>!disposed&&isCurrent();
  const tell=message=>{if(current())$('transcriber-status').textContent=message;};
  const chosenKey=()=>$('score-key').value==='auto'?detectedKey:KEY_SIGNATURES.find(key=>key.id===$('score-key').value);
  const chosenBpm=()=>$('tempo-mode').value==='manual'?Number($('transcriber-bpm').value):detectedTempo.bpm;
  const settings=()=>({title:$('score-title').value.trim()||'Untitled score',clef:$('transcriber-clef').value,key:chosenKey(),bpm:chosenBpm()});
  const persist=(force=false)=>{
    // Cleanup runs after the parent invalidates its render ticket, but before
    // replacing the DOM. Preserve the final draft during that cleanup too.
    if(disposed||!draftDirty||!$('score-title')||(!force&&Date.now()-lastPersist<1000))return;
    lastPersist=Date.now();
    try{localStorage.setItem(draftKey,JSON.stringify({events,title:$('score-title').value.slice(0,120),clef:$('transcriber-clef').value,tempoMode:$('tempo-mode').value,bpm:Number($('transcriber-bpm').value),key:$('score-key').value,detectedKey:detectedKey?.id,detectedTempo}));draftDirty=false;}catch{/* Export still works if browser storage is unavailable. */}
  };
  const buttons=()=>{
    if(!current())return;
    $('record-start').disabled=listening||starting||analysing;$('record-stop').disabled=!listening&&!playing&&!clicking;
    $('score-play').disabled=!events.length||listening||starting||analysing||playing;
    $('score-pen').disabled=listening||starting||analysing||playing;
    $('record-start').classList.toggle('is-recording',listening);
    $('transcribe').disabled=!samples||listening||starting||analysing;$('transcriber-file').disabled=listening||starting||analysing;
    $('score-new').disabled=listening||starting||analysing;$('score-redraw').disabled=listening||analysing;$('score-input').readOnly=listening||analysing;
    for(const id of ['edit-note-index','edit-note-pitch','edit-note-duration','edit-note-apply','edit-note-add','edit-note-delete'])$(id).disabled=listening||starting||analysing||playing||(id!=='edit-note-add'&&!events.length);
    $('score-image').disabled=!events.length||saving;$('score-export').disabled=!events.length||saving;
  };
  const draft=readDraft(draftKey);
  if(draft){
    events=draft.events;$('score-title').value=typeof draft.title==='string'?draft.title.slice(0,120):'Untitled score';
    $('transcriber-clef').value=draft.clef==='bass'?'bass':'treble';$('tempo-mode').value=draft.tempoMode==='manual'?'manual':'auto';
    $('transcriber-bpm').value=validBpm(draft.bpm)?draft.bpm:120;$('score-key').value=KEY_SIGNATURES.some(key=>key.id===draft.key)?draft.key:'auto';
    detectedKey=KEY_SIGNATURES.find(key=>key.id===draft.detectedKey)||null;
    if(validBpm(draft.detectedTempo?.bpm))detectedTempo={bpm:Number(draft.detectedTempo.bpm),estimated:Boolean(draft.detectedTempo.estimated)};
    $('score-input').value=scoreText(events);if(events.length)tell('Your saved draft is ready. Resume listening to add notes, or save the score.');
  }
  const {Renderer,Stave,StaveNote,Formatter,Voice,VexFlow,Accidental,StaveTie}=await import('vexflow');
  await Promise.all([document.fonts.load('16px Bravura'),document.fonts.load('16px Academico')]);
  if(!current())return()=>{};
  VexFlow.setFonts('Bravura','Academico');
  function drawSheet(output,backend,width){
    const {clef,key,bpm}=settings();
    const bars=events.length?splitIntoBars(events):[];
    const barCount=Math.min(64,Math.max(minimumBars,bars.length+Number(bars.at(-1)?.reduce((sum,n)=>sum+n.slots,0)===8)));
    while(bars.length<barCount)bars.push([]);
    const columns=width>=760?2:1,barWidth=(width-20)/columns;
    if(backend===Renderer.Backends.SVG)staffLayout=[];
    const height=Math.ceil(bars.length/columns)*145+60;
    const renderer=new Renderer(output,backend);renderer.resize(width,height);const ctx=renderer.getContext(),drawn=[];
    bars.forEach((bar,index)=>{
      const row=Math.floor(index/columns),firstInRow=index%columns===0;
      const stave=new Stave(10+(index%columns)*barWidth,55+row*145,barWidth).setContext(ctx);
      if(firstInRow){stave.addClef(clef);if(key)stave.addKeySignature(key.id);}
      if(index===0){stave.addTimeSignature('4/4');if($('tempo-mode').value==='manual'||detectedTempo.estimated)stave.setTempo({duration:'q',bpm},-12);}
      stave.draw();if(backend===Renderer.Backends.SVG)staffLayout.push({x:stave.getNoteStartX(),width:stave.getNoteEndX()-stave.getNoteStartX(),bottom:stave.getYForLine(4),spacing:stave.getSpacingBetweenLines(),clef,row,index});if(!bar.length)return;
      const tickables=bar.map(event=>{
        const pitch=pitchSpelling(event.midi,key),duration={1:'8',2:'q',4:'h',8:'w'}[event.slots]+(pitch?'':'r');
        const note=new StaveNote({keys:[pitch?`${pitch.step.toLowerCase()}${pitch.accidental}/${pitch.octave}`:'b/4'],duration,clef});
        if(pitch?.accidental)note.addModifier(new Accidental(pitch.accidental),0);drawn.push({note,row,...event});return note;
      });
      const voice=new Voice({numBeats:4,beatValue:4}).setMode(Voice.Mode.SOFT).addTickables(tickables);
      new Formatter().joinVoices([voice]).format([voice],Math.max(90,stave.getNoteEndX()-stave.getNoteStartX()-14));voice.draw(ctx,stave);
    });
    for(let i=1;i<drawn.length;i++){
      const before=drawn[i-1],after=drawn[i];if(!before.tieStart||!after.tieStop)continue;
      if(before.row===after.row)new StaveTie({firstNote:before.note,lastNote:after.note,firstIndices:[0],lastIndices:[0]}).setContext(ctx).draw();
      else{new StaveTie({firstNote:before.note,firstIndices:[0],lastIndices:[0]}).setContext(ctx).draw();new StaveTie({lastNote:after.note,firstIndices:[0],lastIndices:[0]}).setContext(ctx).draw();}
    }
    return height;
  }
  function render(force=false){
    if(!current())return;
    const {clef,key,bpm}=settings();if(!validBpm(bpm))throw new Error('Choose a tempo between 40 and 240 BPM.');
    const width=Math.max(350,Math.min(1000,$('transcribed-score').clientWidth||620));
    const signature=JSON.stringify([events,clef,key?.id,bpm,width]);if(signature===renderedSignature&&!force)return;
    renderedSignature=signature;
    const output=document.createElement('div'),height=drawSheet(output,Renderer.Backends.SVG,width);
    const svg=output.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.width='100%';svg.style.height='auto';$('transcribed-score').replaceChildren(output);
    const selected=Math.min(Number($('edit-note-index').value)||0,Math.max(0,events.length-1));
    $('edit-note-index').replaceChildren(...events.map((note,index)=>{const option=document.createElement('option');option.value=index;option.textContent=`${index+1} · ${scoreText([note])}`;return option;}));
    $('edit-note-index').value=String(selected);selectNote(selected);
    let eventIndex=0,eventSlots=0;const noteMap=splitIntoBars(events).flat().map(note=>{const index=eventIndex;eventSlots+=note.slots;if(eventSlots>=events[eventIndex].slots){eventIndex++;eventSlots=0;}return index;});
    output.querySelectorAll('.vf-stavenote').forEach((node,drawnIndex)=>{const index=noteMap[drawnIndex];node.style.cursor='pointer';node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-label',`Edit note ${index+1}`);const edit=()=>{if(listening||analysing||playing)return;if($('score-edit-panel').hidden)$('score-edit-panel-toggle').click();selectNote(index);$('edit-note-pitch').focus();};node.onclick=edit;node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();edit();}};});
    let startSlot=0;const drawnNotes=splitIntoBars(events).flat();output.querySelectorAll('.vf-stavenote').forEach((node,i)=>{node.dataset.startSlot=startSlot;startSlot+=drawnNotes[i].slots;node.dataset.endSlot=startSlot;});
    attachScoreDrawing(svg,{enabled:drawing&&!listening&&!analysing&&!playing,staves:staffLayout,commit:({midi,x,staff})=>{
      const fifths=chosenKey()?.fifths||0,accidentals=(fifths>0?[5,0,7,2,9,4,11]:[11,4,9,2,7,0,5]).slice(0,Math.abs(fifths));if(accidentals.includes(midi%12))midi+=Math.sign(fifths);
      const slots=Number($('draw-duration').value);
      const slot=staff.index*8+Math.max(0,Math.min(7,Math.floor((x-staff.x)/staff.width*8)));
      try{events=placeScoreNote(events,slot,midi,slots);draftDirty=true;$('score-input').value=scoreText(events);render(true);persist(true);tell('Note aligned to the staff.');}catch(error){tell(error.message);}
    }});
    $('live-tempo').textContent=$('tempo-mode').value==='manual'?`${bpm} BPM · set`:detectedTempo.estimated?`${bpm} BPM`:'Listening…';$('live-key').textContent=key?.label||'Listening…';
    $('score-tempo-mark').textContent=$('tempo-mode').value==='manual'?`♩ = ${bpm}`:detectedTempo.estimated?`♩ ≈ ${bpm}`:'Tempo will appear as you play';
    $('score-key-mark').textContent=key?`${key.label}${$('score-key').value==='auto'?' · estimated':''}`:'Key will appear as you play';buttons();persist();
  }
  function updateLive(force=false){
    if(!current()||!tracker)return;
    const segments=tracker.snapshot(),tempo=estimateTempo(segments,detectedTempo.bpm);if(tempo.estimated)detectedTempo=tempo;
    const key=estimateKey(segments);if(key)detectedKey=key;const fresh=segmentsToEvents(segments,chosenBpm());
    if(baseEvents.reduce((sum,note)=>sum+note.slots,0)+fresh.reduce((sum,note)=>sum+note.slots,0)>MAX_SCORE_SLOTS){stopMicrophone().catch(()=>{});tell('This score has reached 64 bars. Save it, then start a new score.');return;}
    events=[...baseEvents,...fresh];draftDirty=true;$('score-input').value=scoreText(events);render(force);
  }
  const handlePitch=data=>{
    if(!current()||!listening||!tracker)return;if(epoch===null)epoch=data.time;
    const time=data.time-epoch;tracker.push(data.midi,time,data.rms);$('live-note').textContent=data.midi==null?'—':scoreText([{midi:data.midi,slots:2}]).split(':')[0];
    if(time-lastRender>=.2){lastRender=time;try{updateLive();}catch(error){tell(error.message);}}
  };
  async function stopMicrophone(){
    clearInterval(timer);timer=null;const wasListening=listening;listening=false;
    processor?.port?.postMessage('stop');if(processor?.port)processor.port.onmessage=null;if(processor&&'onaudioprocess'in processor)processor.onaudioprocess=null;
    processor?.disconnect();source?.disconnect();silent?.disconnect();stream?.getTracks().forEach(track=>track.stop());
    const oldContext=context;stream=context=source=processor=silent=null;
    if(current()){$('record-time').textContent='Microphone off';if(wasListening){updateLive(true);tell(events.length?'Paused. Your score is ready to save or continue.':'No clear notes yet. Try singing or playing closer to the microphone.');}buttons();persist(true);}
    await oldContext?.close().catch(()=>{});
  }
  action('record-start',async()=>{
    if(listening||starting||analysing)return;if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access needs HTTPS or localhost and a supported browser.');
    if(!validBpm(chosenBpm()))throw new Error('Choose a tempo between 40 and 240 BPM.');
    await stopPlayback();starting=true;buttons();tell('Requesting microphone access…');onPermissionStart();
    try{
      try{stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});}finally{onPermissionEnd();}
      if(!current()){stream.getTracks().forEach(track=>track.stop());stream=null;return;}
      const Context=window.AudioContext||window.webkitAudioContext;context=new Context();await context.resume();if(!current()){await stopMicrophone();return;}
      tracker=new LiveScoreTracker();baseEvents=[...events];epoch=null;lastRender=-1;source=context.createMediaStreamSource(stream);
      if(context.audioWorklet&&window.AudioWorkletNode){try{await context.audioWorklet.addModule(new URL('./live-pitch-worklet.js',location.href).href);if(!current()){await stopMicrophone();return;}processor=new AudioWorkletNode(context,'mozart-live-pitch');processor.port.onmessage=event=>handlePitch(event.data);$('record-time').dataset.processor='worklet';}catch(error){$('record-time').dataset.processorError=error.message;}}
      if(!processor){$('record-time').dataset.processor='compatibility';processor=context.createScriptProcessor(4096,1,1);const detector=PitchDetector.forFloat32Array(4096);let processed=0;processor.onaudioprocess=event=>{const frame=event.inputBuffer.getChannelData(0);processed+=frame.length;handlePitch({...analysePitch(detector,frame,event.inputBuffer.sampleRate),time:processed/event.inputBuffer.sampleRate});};}
      silent=context.createGain();silent.gain.value=0;listening=true;source.connect(processor);processor.connect(silent);silent.connect(context.destination);
      startedAt=Date.now();$('record-time').textContent='Listening · 0:00';timer=setInterval(()=>{if(!current())return;const seconds=Math.floor((Date.now()-startedAt)/1000);$('record-time').textContent=`Listening · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;if(seconds>=MAX_LIVE_SECONDS)stopMicrophone().then(()=>tell('Five-minute score captured. Save your score or resume listening.')).catch(error=>tell(error.message));},250);
      tell('Listening… sing or play one clear melody. Notes will appear below.');
    }catch(error){await stopMicrophone();tell(error.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access in your browser/device settings and try again.':`Could not start listening: ${error.message}`);}
    finally{starting=false;buttons();}
  });
  action('record-stop',async()=>{await stopPlayback();await stopMicrophone();});
  action('score-play',async()=>{
    if(!events.length||listening)return;await stopPlayback();drawing=false;$('score-pen').setAttribute('aria-pressed','false');render(true);
    const audio=await sound();playing=true;buttons();const start=audio.currentTime+.08;let at=start;
    for(let i=0;i<events.length;i++){const note=events[i];let slots=note.slots;while(events[i]?.tieStart&&events[i+1]?.tieStop&&events[i+1].midi===note.midi){i++;slots+=events[i].slots;}const duration=slots*30/chosenBpm();if(note.midi!==null)tone(audio,440*2**((note.midi-69)/12),at,duration*.98);at+=duration;}
    $('transcribed-score').querySelectorAll('.vf-stavenote').forEach(node=>{
      const begin=(start-audio.currentTime+Number(node.dataset.startSlot)*30/chosenBpm())*1000,end=(start-audio.currentTime+Number(node.dataset.endSlot)*30/chosenBpm())*1000;
      highlightTimers.push(setTimeout(()=>{if(current()&&playing){node.classList.add('score-note-playing');node.scrollIntoView({block:'nearest',behavior:'smooth'});}},Math.max(0,begin)),setTimeout(()=>node.classList.remove('score-note-playing'),Math.max(0,end)));
    });
    tell('Playing your score…');playbackTimer=setTimeout(()=>{stopPlayback();tell('Playback finished.');},(at-audio.currentTime)*1000+100);
  });
  action('score-pen',()=>{if(listening||analysing||playing)return;drawing=!drawing;$('score-pen').setAttribute('aria-pressed',String(drawing));render(true);tell(drawing?'Draw a notehead on a staff line or space.':'Tap a note to edit it.');});
  action('score-page',()=>{if(minimumBars>=64){tell('Maximum 64 bars per score.');return;}minimumBars=Math.min(64,Math.max(minimumBars,Math.ceil(events.reduce((sum,note)=>sum+note.slots,0)/8))+8);render(true);$('transcribed-score').lastElementChild?.scrollIntoView({block:'end',behavior:'smooth'});tell('More staff rows added.');});
  action('score-click',async()=>{if(clicking){clearInterval(clickTimer);clicking=false;}else{const audio=await sound();clicking=true;const tick=()=>tone(audio,1200,audio.currentTime,.045,.07);tick();clickTimer=setInterval(tick,60000/chosenBpm());}$('score-click').setAttribute('aria-pressed',String(clicking));buttons();});
  $('transcriber-file').onchange=async event=>{
    const file=event.target.files?.[0];if(!file||listening||analysing)return;
    try{
      if(file.size>25*1024*1024)throw new Error('Choose an audio file smaller than 25 MB.');tell('Reading audio file…');
      const Decoder=window.AudioContext||window.webkitAudioContext,decoder=new Decoder();let decoded;
      try{decoded=await decoder.decodeAudioData(await file.arrayBuffer());}finally{await decoder.close().catch(()=>{});}
      if(!current())return;if(decoded.duration>MAX_TRANSCRIPTION_SECONDS)throw new Error(`Choose a clip of ${MAX_TRANSCRIPTION_SECONDS} seconds or less.`);
      samples=new Float32Array(decoded.length);sampleRate=decoded.sampleRate;for(let channel=0;channel<decoded.numberOfChannels;channel++){const input=decoded.getChannelData(channel);for(let i=0;i<samples.length;i++)samples[i]+=input[i]/decoded.numberOfChannels;}
      if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);$('transcriber-playback').src=previewUrl;$('transcriber-playback').hidden=false;tell(`Audio ready (${decoded.duration.toFixed(1)} seconds). Select Transcribe file to score.`);buttons();
    }catch(error){tell(error.message||'This audio format could not be read. Try WAV or MP3.');}
  };
  action('transcribe',async()=>{
    if(!samples||analysing||listening)return;analysing=true;cancelled=false;buttons();$('transcribe-cancel').hidden=false;
    try{
      const manual=$('tempo-mode').value==='manual',result=await analyseMelody(samples,sampleRate,manual?Number($('transcriber-bpm').value):null,percent=>tell(`Transcribing audio… ${percent}%`),()=>cancelled||!current());
      if(!current())return;
      events=manual?await transcribeSamples(samples,sampleRate,Number($('transcriber-bpm').value),()=>{},()=>cancelled||!current()):result.events;
      if(!current())return;draftDirty=true;detectedTempo=result.tempo;detectedKey=result.key;$('score-input').value=scoreText(events);render(true);persist(true);tell('File transcribed. Review the score and save it to your device.');
    }catch(error){tell(error.message);}finally{analysing=false;if(current()){$('transcribe-cancel').hidden=true;buttons();}}
  });
  action('transcribe-cancel',()=>{cancelled=true;tell('Stopping analysis…');});
  action('score-redraw',()=>{if(listening)return;events=parseScore($('score-input').value);draftDirty=true;render(true);persist(true);tell('Score updated.');});
  function selectNote(index){const note=events[index];$('edit-note-index').value=String(index);if(note){$('edit-note-pitch').value=note.midi===null?'rest':String(note.midi);$('edit-note-duration').value=String(note.slots);}}
  $('edit-note-index').onchange=()=>selectNote(Number($('edit-note-index').value));
  const editNote=kind=>{if(listening||starting||analysing||playing)return;stopPlayback().catch(()=>{});const index=Number($('edit-note-index').value)||0,note={midi:$('edit-note-pitch').value==='rest'?null:Number($('edit-note-pitch').value),slots:Number($('edit-note-duration').value)};const next=events.map(note=>({...note}));if(kind==='delete')next.splice(index,1);else if(kind==='add')next.splice(events.length?index+1:0,0,note);else if(next[index])next[index]=note;if(next.reduce((sum,n)=>sum+n.slots,0)>MAX_SCORE_SLOTS)throw new Error('This score has reached 64 bars.');for(const note of next){delete note.tieStart;delete note.tieStop;}events=next;draftDirty=true;$('score-input').value=scoreText(events);render(true);persist(true);if(kind==='add')selectNote(Math.min(index+1,events.length-1));tell('Score updated.');};
  action('edit-note-apply',()=>editNote('apply'));action('edit-note-add',()=>editNote('add'));action('edit-note-delete',()=>editNote('delete'));
  for(const id of ['transcriber-clef','tempo-mode','transcriber-bpm','score-key'])$(id).onchange=()=>{try{draftDirty=true;render(true);persist(true);}catch(error){tell(error.message);}};
  $('score-title').oninput=()=>{draftDirty=true;persist(true);};
  const newScore=()=>{events=[];tracker=null;baseEvents=[];detectedKey=null;detectedTempo={bpm:120,estimated:false};draftDirty=true;$('score-input').value='';$('score-title').value='Untitled score';$('live-note').textContent='—';$('score-reset-confirm').hidden=true;render(true);persist(true);tell('Your empty scoresheet is ready. Select Start listening to begin.');};
  action('score-new',()=>{if(events.length)$('score-reset-confirm').hidden=false;else newScore();});action('score-reset-yes',newScore);action('score-reset-no',()=>{$('score-reset-confirm').hidden=true;});
  async function saveScore(kind){
    if(!events.length||saving)return;saving=true;buttons();$('score-save-status').textContent='Preparing score…';
    try{
      if(listening)updateLive(true);
      if(kind==='xml')await saveFile(new Blob([musicXml(events,settings())],{type:'application/vnd.recordare.musicxml+xml'}),'mozart-transcription.musicxml');
      else {
        const notation=document.createElement('canvas'),width=Math.max(620,Math.min(1000,$('transcribed-score').clientWidth||620));
        const height=drawSheet(notation,Renderer.Backends.CANVAS,width);
        await saveFile(await scoreImage(notation,{...settings(),width,height}),'mozart-score.png');
      }
      if(current())$('score-save-status').textContent=window.ReactNativeWebView?'Opening device save options…':'Score download started.';
    }catch(error){if(current())$('score-save-status').textContent=error.message;}finally{saving=false;buttons();}
  }
  action('score-export',()=>saveScore('xml'));action('score-image',()=>saveScore('png'));
  const saved=event=>{if(current())$('score-save-status').textContent=event.detail?.error||event.detail?.message||'Score file saved. Choose where to share or keep it.';};window.addEventListener('mozart-score-saved',saved);
  let resizeTimer;const resize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(current())render(true);},180);};window.addEventListener('resize',resize);
  render(true);buttons();status();if(mode==='manuscript'){$('record-time').textContent='Manuscript';tell('Manuscript ready.');}
  return()=>{persist(true);disposed=true;cancelled=true;stopPlayback().catch(()=>{});clearInterval(timer);clearTimeout(resizeTimer);stopMicrophone().catch(()=>{});window.removeEventListener('resize',resize);window.removeEventListener('mozart-score-saved',saved);if(previewUrl)URL.revokeObjectURL(previewUrl);};
}
