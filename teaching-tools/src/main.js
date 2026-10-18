import * as Tone from "tone";
import { PitchDetector } from "pitchy";
import Meyda from "meyda";
import teoria from "teoria";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { instruments } from "./advanced.js";
import { multitrack } from "./multitrack.js";

const $ = (id) => document.getElementById(id);
// A short pressed state remains visible after taps, including on touch screens.
const feedbackTimers = new WeakMap();
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('button');
  if (!button || button.disabled) return;
  clearTimeout(feedbackTimers.get(button));
  button.classList.add('click-feedback');
  feedbackTimers.set(button, setTimeout(() => button.classList.remove('click-feedback'), 280));
}, true);
const status = (message = "") => {
  $("status").textContent = message;
};
let cleanup = () => {};
let generation = 0;
let pendingPermissions = 0;
let pausedForVisibility = false;
let active = "";
let notebookContent = "<p></p>";
const tools = {
  metronome: "Metronome",
  keyboard: "Keyboard & sequence",
  tuner: "Tuner & spectrum",
  waveform: "Waveforms",
  notation: "Manuscript",
  transcriber: "Audio to score",
  theory: "Aural practice",
  notebook: "Notebook",
  instruments: "Sampled instruments",
  formation: "Stage formations",
  pose: "Pose tracking",
  theatre: "Line rehearsal",
  projection: "Vocal projection",
  lighting: "Stage lighting",
};
const descriptions = ['Keep perfect time', 'Create and play', 'Tune with precision', 'Visualize your sound', 'Write music', 'Convert audio', 'Train your ear', 'Take lesson notes', 'Explore sounds', 'Plan performances', 'Improve movement', 'Practice together', 'Build your voice', 'Design your stage'];
const iconPaths = [
  '<path d="m9 3-6 18h18L15 3zM8 16h8M12 16l5-10M12 4v4"/>',
  '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v9h3V4m6 0v9h3V4M7 13v7m5-16v16m5-7v7"/>',
  '<path d="M2 12h3l2-7 3 14 3-17 3 19 2-9h4"/>',
  '<path d="M2 12c4-17 6 17 10 0s6 17 10 0"/>',
  '<path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8m-8 4h8m-8 3h5"/>',
  '<path d="M14 2H5v20h14V7zM14 2v6h5M12 11v6m0-5 4-1v5"/><ellipse cx="10" cy="17" rx="2" ry="1.5"/><ellipse cx="14" cy="16" rx="2" ry="1.5"/>',
  '<path d="M7 10a5 5 0 1 1 9 3c-2 2-3 2-3 5a3 3 0 0 1-6 0m3-8a2 2 0 1 1 4 0c0 2-3 2-3 5"/>',
  '<rect x="5" y="2" width="15" height="20" rx="2"/><path d="M3 6h4m-4 4h4m-4 4h4m-4 4h4M16 2v20"/>',
  '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  '<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3zm-4-3v-2a4 4 0 0 1 4-4m16 6v-2a4 4 0 0 0-4-4M3 5a3 3 0 0 1 2 5m16-5a3 3 0 0 0-2 5"/>',
  '<circle cx="12" cy="4" r="2"/><path d="m4 11 8-3 8 3m-8-3v7m0 0-4 7m4-7 4 7"/>',
  '<circle cx="8" cy="7" r="3"/><circle cx="18" cy="8" r="2"/><path d="M2 21v-3a6 6 0 0 1 12 0v3zm14-7a5 5 0 0 1 6 5v2h-5"/>',
  '<rect x="8" y="2" width="8" height="14" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  '<path d="M8 16a7 7 0 1 1 8 0l-1 4H9zm1 7h6M12 0v1M1 10h2m18 0h2M4 3l2 2m12 0 2-2"/>'
];
const studentView = new URLSearchParams(location.search).get('role') === 'student';
$('studio-context').textContent = studentView ? 'Student tools' : 'Teaching tools';
$('tabs').setAttribute('aria-label', studentView ? 'Student tools' : 'Teaching tools');
function showMenu() {
  stop(); active = ''; status();
  document.body.classList.remove('tool-open');
  $('tabs').hidden = false; $('tool').hidden = true; panel('');
  $('back-label').textContent = 'Back to chat';
  $('studio-back').setAttribute('aria-label', 'Back to chat');
  document.title = 'Music Studio · Mozart Techniques';
}
function action(id, fn) {
  $(id).addEventListener("click", async () => {
    try {
      await fn();
    } catch (error) {
      status(error?.message || "This tool could not start. Please try again.");
    }
  });
}
function stop() {
  generation++;
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  cleanup();
  cleanup = () => {};
  window.speechSynthesis?.cancel();
}
async function audio() {
  await Tone.start();
}
function panel(html) {
  $('tool').classList.remove('digital-score', 'split-tool');
  $("tool").innerHTML = html;
}
function separateDocumentation(name) {
  if (name === 'transcriber' || name === 'notation') return; // Shared score workspaces have their own tabs.
  const root = $('tool');
  root.classList.add('split-tool');
  const workspace = document.createElement('section');
  workspace.id = 'tool-workspace';
  workspace.setAttribute('role', 'tabpanel');
  const docs = document.createElement('section');
  docs.id = 'tool-documentation';
  docs.setAttribute('role', 'tabpanel');
  docs.hidden = true;
  const title = document.createElement('h2');
  title.textContent = tools[name];
  docs.append(title);
  const children = [...root.childNodes];
  children.forEach(node => workspace.append(node));
  // Guides sometimes contain useful preset/example controls. Keep those
  // controls in the workspace, moving the explanatory copy instead.
  workspace.querySelectorAll('.tool-guide').forEach(guide => {
    [...guide.children].forEach(node => {
      if (node.matches('button, input, select, textarea, label, [role="status"], [aria-live]') || node.querySelector('button, input, select, textarea, [role="status"], [aria-live]')) {
        guide.before(node);
      }
    });
    docs.append(guide);
  });
  workspace.querySelectorAll(':scope > p, :scope > .tool-description, :scope > .muted').forEach(node => {
    if (!workspace.contains(node) || node.id || node.hasAttribute('role') || node.hasAttribute('aria-live') || node.querySelector('button,input,select,textarea')) return;
    docs.append(node);
  });
  // The tool name is already visible in the workspace tab.
  workspace.querySelectorAll(':scope > h2, :scope > small').forEach(node => node.remove());
  const safety = document.querySelector('body > footer, .studio-footer');
  if (safety) { const note = document.createElement('p'); note.textContent = safety.textContent.trim(); docs.append(note); }
  const tabs = document.createElement('div');
  tabs.className = 'score-view-tabs'; tabs.setAttribute('role', 'tablist');
  const documentation = document.createElement('button'), working = document.createElement('button');
  documentation.id = 'tool-doc-tab'; working.id = 'tool-workspace-tab';
  documentation.textContent = 'Documentation'; working.textContent = tools[name];
  for (const button of [documentation, working]) button.setAttribute('role', 'tab');
  documentation.setAttribute('aria-controls', docs.id); working.setAttribute('aria-controls', workspace.id);
  const switchView = guide => {
    docs.hidden = !guide; workspace.hidden = guide;
    documentation.setAttribute('aria-selected', String(guide)); working.setAttribute('aria-selected', String(!guide));
    documentation.tabIndex = guide ? 0 : -1; working.tabIndex = guide ? -1 : 0;
    if (!guide) window.dispatchEvent(new Event('resize'));
  };
  documentation.onclick = () => switchView(true); working.onclick = () => switchView(false);
  tabs.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); const guide = event.key === 'Home' || (event.key !== 'End' && docs.hidden);
    switchView(guide); (guide ? documentation : working).focus();
  };
  tabs.append(documentation, working); root.append(tabs, workspace, docs); switchView(false);
}
async function saveFile(blob, name) {
  if (window.ReactNativeWebView && ['mozart-score.png', 'mozart-transcription.musicxml'].includes(name)) {
    const encoding = blob.type === 'image/png' ? 'base64' : 'utf8';
    const data = encoding === 'base64'
      ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not prepare the score image.')); reader.readAsDataURL(blob); })
      : await blob.text();
    if (data.length > 6 * 1024 * 1024) throw new Error('This score file is too large. Try saving MusicXML instead.');
    window.ReactNativeWebView.postMessage(JSON.stringify({type: 'save-score', name, mimeType: blob.type, encoding, data}));
    return;
  }
  if (window.ReactNativeWebView && blob.type.startsWith("text/plain")) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "share-notes",
        text: (await blob.text()).slice(0, 100000),
        name,
      }),
    );
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const noteNames = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

function metronome() {
  panel(
    `<small>METRONOME</small><h2>Keep the pulse</h2><p class="tool-description">Set your tempo and time signature. Tap start to hear the beat.</p>
    <div class="metronome-layout"><div class="metro-settings">
    <section class="metro-control"><div class="metro-control-top"><span class="metro-symbol" aria-hidden="true">♪</span><label for="bpm">Tempo (BPM)<input id="bpm" type="number" value="80" min="30" max="240"></label></div><div class="metro-slider"><button id="bpm-minus" class="secondary" aria-label="Decrease tempo">−</button><input id="bpm-range" type="range" min="30" max="240" value="80" aria-label="Tempo slider"><button id="bpm-plus" class="secondary" aria-label="Increase tempo">+</button></div></section>
    <section class="metro-control"><div class="metro-control-top"><span class="metro-symbol" aria-hidden="true">≋</span><label for="beats">Beats per bar<select id="beats">${Array.from({length:11},(_,i)=>`<option${i===2?' selected':''}>${i+2}</option>`).join('')}</select></label></div><div class="metro-slider"><button id="beats-minus" class="secondary" aria-label="Decrease beats">−</button><input id="beats-range" type="range" min="2" max="12" value="4" aria-label="Beats slider"><button id="beats-plus" class="secondary" aria-label="Increase beats">+</button></div></section>
    </div><div class="metro-playback"><div><button id="start" class="metro-start" aria-label="Start" aria-pressed="false"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m10 5 17 11-17 11z" fill="currentColor"/></svg></button><span class="metro-caption">START</span></div><div><button id="stop" class="metro-stop secondary" aria-label="Stop"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="7" width="18" height="18" rx="3" fill="currentColor"/></svg></button><span class="metro-caption">STOP</span></div></div></div><div class="metro-beat" id="beat" aria-live="off">—</div>`,
  );
  const syncRange = (name) => {
    $(name + '-range').value = $(name).value;
    const slider = $(name + '-range');
    slider.style.setProperty('--progress', `${(Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min))*100}%`);
  };
  for (const name of ['bpm', 'beats']) {
    const update = (value) => {
      const slider = $(name + '-range');
      $(name).value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), value)));
      syncRange(name);
      $(name).dispatchEvent(new Event('change'));
    };
    $(name + '-range').oninput = () => update(Number($(name + '-range').value));
    action(name + '-minus', () => update(Number($(name).value) - 1));
    action(name + '-plus', () => update(Number($(name).value) + 1));
    $(name).addEventListener('change', () => syncRange(name));
    syncRange(name);
  }
  const synth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
  }).toDestination();
  synth.volume.value = -16;
  let beat = 0;
  let playing = false;
  let startId = 0;
  const tempo = () => {
    const bpm = Number($("bpm").value);
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240)
      throw new Error("Choose a tempo between 30 and 240 BPM.");
    Tone.getTransport().bpm.value = bpm;
  };
  $("bpm").onchange = () => {
    try {
      tempo();
    } catch (e) {
      status(e.message);
    }
  };
  action("start", async () => {
    if (playing) return;
    const ticket = generation;
    tempo();
    playing = true;
    const start = ++startId;
    try { await audio(); } catch (error) { playing = false; throw error; }
    if (ticket !== generation || start !== startId) return;
    beat = 0;
    Tone.getTransport().scheduleRepeat((time) => {
      const current = beat++ % Number($("beats").value);
      synth.triggerAttackRelease(current === 0 ? "C6" : "C5", "32n", time);
      Tone.getDraw().schedule(() => {
        if (ticket === generation && start === startId && $("beat")) $("beat").textContent = String(current + 1);
      }, time);
    }, "4n");
    Tone.getTransport().start();
    $('start').setAttribute('aria-pressed', 'true');
  });
  action("stop", () => {
    startId++;
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    playing = false;
    $('start').setAttribute('aria-pressed', 'false');
    $("beat").textContent = "—";
  });
  cleanup = () => {
    startId++;
    synth.dispose();
  };
}

function keyboard() {
  panel(
    '<h2>Keyboard & eight-step sequencer</h2><p>Tap a note or play a connected MIDI keyboard. This is a synthesizer, not sampled piano audio.</p><div class="keys">' +
      noteNames.map((n) => `<button data-note="${n}">${n}</button>`).join("") +
      '</div><label>Sequence (eight space-separated notes; use - for a rest)<input id="sequence" style="width:100%" value="C4 E4 G4 - F4 A4 C5 -"></label><div class="row"><button id="play">Play sequence</button><button id="halt" class="secondary">Stop sequence</button><button id="midi" class="secondary">Connect MIDI</button></div>',
  );
  const synth = new Tone.PolySynth(Tone.Synth).toDestination();
  synth.volume.value = -15;
  let midi;
  let sequence;
  const ticket = generation;
  document.querySelectorAll("[data-note]").forEach(
    (btn) =>
      (btn.onclick = async () => {
        try {
          await audio();
          if (ticket === generation)
            synth.triggerAttackRelease(btn.dataset.note, "8n");
        } catch (e) {
          status(e.message);
        }
      }),
  );
  action("play", async () => {
    const notes = $("sequence").value.trim().split(/\s+/);
    if (
      notes.length !== 8 ||
      notes.some((n) => !/^([A-G](#|b)?[2-6]|-)$/.test(n))
    )
      throw new Error("Enter eight notes, such as C4 E4 G4 - F4 A4 C5 -.");
    await audio();
    if (ticket !== generation) return;
    sequence?.dispose();
    sequence = new Tone.Sequence(
      (time, n) => {
        if (n !== "-") synth.triggerAttackRelease(n, "8n", time);
      },
      notes,
      "8n",
    ).start(0);
    Tone.getTransport().bpm.value = 90;
    Tone.getTransport().start();
  });
  action("halt", () => {
    Tone.getTransport().stop();
    synth.releaseAll();
  });
  const midiStatus = document.createElement("p");
  midiStatus.id = "midi-status"; midiStatus.setAttribute("role", "status");
  $("midi").parentElement.after(midiStatus);
  midiStatus.textContent = "Connect a physical USB MIDI keyboard first. Browser permission is required; this does not connect a normal computer keyboard.";
  let connecting = false;
  let midiPermissionTimer;
  action("midi", async () => {
    if (connecting) return;
    if (!navigator.requestMIDIAccess) {
      midiStatus.textContent = "Web MIDI is not supported in this browser. Use a compatible desktop browser such as Chrome/Edge, or use the on-screen keys. iPhone Safari does not provide Web MIDI.";
      return;
    }
    connecting = true; $("midi").disabled = true; pendingPermissions++;
    midiStatus.textContent = "Requesting MIDI permission… Allow access when your browser asks.";
    try {
      // Request permission directly from the click, before awaiting audio startup.
      const [access] = await Promise.race([
        Promise.all([navigator.requestMIDIAccess({ sysex: false }), audio()]),
        new Promise((_, reject) => { midiPermissionTimer = setTimeout(() => reject(new Error('The permission request timed out. Check the browser prompt or site settings, then retry.')), 20000); })
      ]);
      if (ticket !== generation) return;
      midi = access;
      const attach = async () => {
        if (ticket !== generation) return;
        const connected = [...midi.inputs.values()].filter(input => input.state === "connected");
        midiStatus.textContent = connected.length ? "Connected: " + connected.map(input => input.name || "MIDI keyboard").join(", ") + ". Play a note." : "MIDI access allowed, but no keyboard was found. Plug in a USB MIDI keyboard and check its driver; it will appear automatically.";
        for (const input of midi.inputs.values()) {
          input.onmidimessage = null;
          if (input.state !== "connected") continue;
          try { await input.open(); } catch { midiStatus.textContent = "Could not open " + (input.name || "MIDI device") + ". Close other music apps and reconnect it."; continue; }
          if (ticket !== generation) { input.close(); return; }
          input.onmidimessage = ({data}) => {
            if (data.length < 3) return;
            const [command, note, velocity] = data; const kind = command & 0xf0;
            if (kind !== 0x90 && kind !== 0x80) return;
            const name = Tone.Frequency(note, "midi").toNote();
            if (kind === 0x90 && velocity) {
              synth.triggerAttack(name, undefined, velocity / 127);
              midiStatus.textContent = (input.name || "MIDI keyboard") + " · " + name;
            } else synth.triggerRelease(name);
          };
        }
      };
      await attach();
      midi.onstatechange = () => { synth.releaseAll(); attach().catch(() => { midiStatus.textContent = "MIDI device changed. Reconnect the keyboard."; }); };
    } catch(error) {
      if (ticket === generation) midiStatus.textContent =
        error.name === "NotAllowedError" || error.name === "SecurityError"
          ? "This browser denied MIDI access. Allow MIDI in this site's permissions, or open this same URL directly in Chrome/Edge if the embedded browser blocks it. On-screen keys still work."
          : "MIDI connection failed: " + error.message;
    } finally {
      clearTimeout(midiPermissionTimer);
      pendingPermissions--; connecting = false;
      if (ticket === generation && $("midi")) $("midi").disabled = false;
    }
  });
  cleanup = () => {
    sequence?.dispose();
    synth.dispose();
    if (midi) {
      midi.onstatechange = null;
      for (const input of midi.inputs.values()) { input.onmidimessage = null; input.close().catch(() => {}); }
    }
  };
}

function tuner() {
  panel('<h2>Tuner & spectrum</h2><p>Play one steady note near the microphone. No recording is uploaded or saved.</p><div class="readout" id="pitch">—</div><p id="pitch-detail" role="status">Microphone off</p><canvas id="spectrum" width="720" height="120" aria-label="Audio spectrum"></canvas><div class="row"><button id="listen">Enable microphone</button><button id="mic-stop" class="secondary">Stop</button><button id="test-tone" class="secondary">Test with A4 signal</button></div><p class="muted">Allow microphone access in your browser and Windows privacy settings. If this embedded browser cannot request access, open this same localhost URL in Chrome or Edge. The test signal checks the tuner without using your microphone.</p>');
  let stream, context, analyser, raf, sourceNode, mute, oscillator, permissionTimer;
  let disposed = false, requestId = 0;
  let endPermission = () => {};
  const release = () => {
    endPermission();
    requestId++;
    clearTimeout(permissionTimer); cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t => t.stop());
    try { oscillator?.stop(); } catch {}
    sourceNode?.disconnect(); mute?.disconnect();
    context?.close().catch(() => {});
    stream = context = oscillator = sourceNode = mute = null;
    if (!disposed && $("listen")) $("listen").disabled = false;
  };
  const startAnalysis = (testSignal) => {
    analyser = context.createAnalyser(); analyser.fftSize = 4096;
    sourceNode.connect(analyser);
    // Keep the graph active on WebKit without echoing microphone audio.
    mute = context.createGain(); mute.gain.value = 0;
    analyser.connect(mute).connect(context.destination);
    const input = new Float32Array(analyser.fftSize);
    const detector = PitchDetector.forFloat32Array(input.length);
    const canvas = $("spectrum"), ctx = canvas.getContext("2d");
    Meyda.bufferSize = input.length;
    Meyda.sampleRate = context.sampleRate;
    const tick = () => {
      if (!context || disposed) return;
      try {
        analyser.getFloatTimeDomainData(input);
        const [freq, clarity] = detector.findPitch(input, context.sampleRate);
        const rms = Math.sqrt(input.reduce((sum, sample) => sum + sample * sample, 0) / input.length);
        if (clarity > 0.85 && rms > 0.002 && freq > 30 && freq < 3000) {
          const midiNote = Math.round(69 + 12 * Math.log2(freq / 440));
          const target = 440 * 2 ** ((midiNote - 69) / 12);
          $("pitch").textContent = Tone.Frequency(midiNote, "midi").toNote();
          $("pitch-detail").textContent = (testSignal ? "Test signal · " : "Microphone listening · ") + freq.toFixed(1) + " Hz · " + Math.round(1200 * Math.log2(freq / target)) + " cents";
        } else {
          $("pitch").textContent = "—";
          $("pitch-detail").textContent = rms < 0.002 ? "Microphone connected, but no sound detected. Check the selected input and play closer." : "Sound detected. Play one steady note.";
        }
        const spectrum = Meyda.extract("amplitudeSpectrum", input);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#eaa7b1";
        for (let i = 0; i < 64; i++) {
          const height = Math.min(115, Math.log1p(spectrum[i] * 10) * 25);
          ctx.fillRect(i * 11, 120 - height, 8, height);
        }
        raf = requestAnimationFrame(tick);
      } catch (error) { release(); $("pitch-detail").textContent = "Audio analysis stopped: " + error.message; }
    };
    tick();
  };
  action("listen", async () => {
    release();
    if (!navigator.mediaDevices?.getUserMedia) {
      $("pitch-detail").textContent = "Microphone is unavailable here. Use HTTPS, or localhost in Chrome/Edge.";
      return;
    }
    const ticket = generation, request = requestId;
    $("listen").disabled = true;
    $("pitch-detail").textContent = "Waiting for microphone permission. Choose Allow in the browser prompt.";
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    const resume = context.resume();
    pendingPermissions++;
    let waiting = true;
    const finishPermission = () => { if (waiting) { pendingPermissions--; waiting = false; } };
    endPermission = finishPermission;
    try {
      const incomingPromise = navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      permissionTimer = setTimeout(() => {
        if (request === requestId && !disposed) {
          release();
          $("pitch-detail").textContent = "Microphone request is still unanswered. Check browser permissions, then try again. Chrome/Edge can be used if this embedded browser blocks access.";
        }
      }, 20000);
      const incoming = await incomingPromise;
      clearTimeout(permissionTimer);
      if (disposed || ticket !== generation || request !== requestId || document.hidden) { incoming.getTracks().forEach(t => t.stop()); return; }
      stream = incoming;
      await resume;
      if (!context || request !== requestId) return;
      sourceNode = context.createMediaStreamSource(stream);
      startAnalysis(false);
    } catch (error) {
      if (disposed || ticket !== generation || request !== requestId) return;
      release();
      const errors = {
        NotAllowedError: "Microphone permission was denied. Allow it in the browser site settings and Windows microphone privacy settings, then retry. Embedded browsers may not support this permission.",
        NotFoundError: "No microphone was found. Connect or enable a microphone and retry.",
        NotReadableError: "The microphone could not be opened. Check whether another app has exclusive access.",
        SecurityError: "This browser or page policy blocks microphone access. Try this URL directly in Chrome or Edge."
      };
      $("pitch-detail").textContent = errors[error.name] || "Could not start the microphone: " + error.message;
    } finally {
      finishPermission();
      if (!disposed && ticket === generation && $("listen")) $("listen").disabled = false;
    }
  });
  action("test-tone", async () => {
    release();
    const request = requestId;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass(); await context.resume();
    if (disposed || request !== requestId || !context) return;
    oscillator = context.createOscillator(); oscillator.frequency.value = 440;
    sourceNode = oscillator; oscillator.start(); startAnalysis(true);
  });
  action("mic-stop", () => { release(); $("pitch").textContent = "—"; $("pitch-detail").textContent = "Microphone off"; });
  cleanup = () => { disposed = true; release(); };
}
async function notation() {
  const ticket = generation;
  const { transcriber } = await import('./live-transcriber.js');
  if (ticket !== generation) return;
  const dispose = await transcriber({panel, action, status, saveFile, mode:'manuscript', isCurrent:()=>ticket===generation});
  if(ticket===generation) cleanup=dispose; else dispose?.();
}
function theory() {
  panel(
    '<h2>Listen & identify</h2><p>Listen to an interval from C, then choose its name.</p><button id="question">Play a new interval</button><div class="row" id="answers"></div><p id="answer" aria-live="polite"></p>',
  );
  const options = {
    M2: "Major second",
    M3: "Major third",
    P4: "Perfect fourth",
    P5: "Perfect fifth",
    P8: "Octave",
  };
  let correct;
  const synth = new Tone.Synth().toDestination();
  synth.volume.value = -15;
  const ticket = generation;
  for (const [value, label] of Object.entries(options)) {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "secondary";
    b.onclick = () => {
      $("answer").textContent = !correct
        ? "Play an interval first."
        : value === correct
          ? "Correct! Listen to another interval."
          : `Try again. You chose ${label.toLowerCase()}.`;
    };
    $("answers").append(b);
  }
  action("question", async () => {
    await audio();
    if (ticket !== generation) return;
    correct = Object.keys(options)[Math.floor(Math.random() * 5)];
    const target = teoria.note("c4").interval(correct).fq();
    const now = Tone.now();
    synth.triggerAttackRelease("C4", 0.4, now);
    synth.triggerAttackRelease(target, 0.5, now + 0.6);
    $("answer").textContent = "Which interval did you hear?";
  });
  cleanup = () => synth.dispose();
}

function notebook() {
  panel(
    '<h2>Lesson notebook</h2><p>Notes stay in this open tool session. Download them before closing; they are not sent to anyone.</p><div class="row"><button id="bold">Bold</button><button id="list" class="secondary">Bullet list</button><button id="download" class="secondary">Download notes</button></div><div id="editor"></div><div class="row"><button id="dictate" class="secondary">Dictate</button><button id="dictation-stop" class="secondary">Stop dictation</button><button id="read" class="secondary">Read aloud</button></div><p class="muted">Dictation may send audio to your browser provider and may require internet. It is optional, not guaranteed offline. No speech service API key is used by Mozart.</p>',
  );
  const editor = new Editor({
    element: $("editor"),
    extensions: [StarterKit],
    content: notebookContent,
    onUpdate: ({ editor }) => {
      notebookContent = editor.getJSON();
    },
  });
  let recognition;
  const notebookGeneration = generation;
  action("bold", () => editor.chain().focus().toggleBold().run());
  action("list", () => editor.chain().focus().toggleBulletList().run());
  action("download", () =>
    saveFile(
      new Blob([editor.getText()], { type: "text/plain;charset=utf-8" }),
      "mozart-lesson-notes.txt",
    ),
  );
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $("dictate").disabled = true;
    $("dictation-stop").disabled = true;
    status(
      "Dictation is unavailable here. You can type notes or use your device keyboard dictation.",
    );
  }
  action("dictate", () => {
    if (recognition) return;
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.lang = navigator.language;
    recognition.onresult = (e) => {
      if (notebookGeneration !== generation) return;
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal)
          editor.commands.insertContent({
            type: "text",
            text: e.results[i][0].transcript + " ",
          });
    };
    recognition.onerror = (e) => {
      if (notebookGeneration === generation) status(`Dictation stopped (${e.error}). You can continue typing.`);
    };
    recognition.onend = () => {
      recognition = null;
    };
    try { recognition.start(); } catch (error) { recognition = null; throw error; }
  });
  action("dictation-stop", () => recognition?.stop());
  if (!window.speechSynthesis) $("read").disabled = true;
  action("read", () => {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(editor.getText()));
  });
  cleanup = () => {
    recognition?.abort();
    editor.destroy();
  };
}

const renderers = {
  ...Object.fromEntries(['theatre','projection','lighting'].map(name => [name, async () => {
    const token = generation;
    const module = await import('./theatre.js');
    if (token === generation) cleanup = module[name]({ panel, action, status });
  }])),
  pose: async () => {
    const token = generation;
    const { pose } = await import('./pose-live.js');
    if (token === generation) cleanup = pose({ panel, action, status });
  },
  formation: async () => {
    const token = generation;
    const { formation } = await import('./formation.js');
    if (token === generation) cleanup = formation({ panel, action, status, saveFile });
  },
  metronome,
  keyboard,
  tuner,
  waveform: () => {
    cleanup = multitrack({ panel, action, status, saveFile });
  },
  notation,
  transcriber: async () => {
    const ticket = generation;
    const { transcriber } = await import("./live-transcriber.js");
    if (ticket !== generation) return;
    const dispose = await transcriber({ panel, action, status, saveFile, isCurrent: () => ticket === generation,
      onPermissionStart: () => { pendingPermissions++; },
      onPermissionEnd: () => { pendingPermissions = Math.max(0, pendingPermissions - 1); },
    });
    if (ticket === generation) cleanup = dispose;
    else dispose?.();
  },
  theory,
  notebook,
  instruments: () => {
    cleanup = instruments({ panel, action, status });
  },
};
async function select(name) {
  if (!Object.hasOwn(renderers, name)) { showMenu(); return; }
  stop();
  active = name;
  status();
  document.body.classList.add('tool-open');
  $('tabs').hidden = true; $('tool').hidden = false;
  $('back-label').textContent = 'All tools';
  $('studio-back').setAttribute('aria-label', 'Back to all tools');
  document.title = `${tools[name]} · Mozart Techniques`;
  panel(`<div class="tool-loading" role="status">Opening ${tools[name]}…</div>`);
  try {
    await renderers[name]();
    if (active === name) { separateDocumentation(name); $('tool').focus({ preventScroll: true }); }
  } catch (e) {
    status(e.message || "Could not open this tool.");
  }
}
for (const [index, [id, label]] of Object.entries(tools).entries()) {
  const b = document.createElement("button");
  b.className = 'tool-card';
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[index]}</svg><span class="tool-card-copy"><strong>${label}</strong><span>${descriptions[index]}</span></span><span class="tool-chevron" aria-hidden="true">›</span>`;
  b.dataset.tool = id;
  b.onclick = () => { location.hash = id; };
  $("tabs").append(b);
}
window.addEventListener("pagehide", stop);
function pauseTools() {
  if (!pendingPermissions) {
    pausedForVisibility = true;
    stop();
    status(
      "Tools paused while this screen is hidden. Select a tool to restart.",
    );
  }
}
function resumeTools() {
  if (pausedForVisibility) {
    pausedForVisibility = false;
    select(active);
    status('Tools reset after returning to this screen. Audio remains off.');
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseTools(); else resumeTools(); });
document.addEventListener('mozart-tools-pause', pauseTools);
document.addEventListener('mozart-tools-resume', resumeTools);
function routeTool() {
  const name = location.hash.slice(1);
  if (Object.hasOwn(tools, name)) select(name); else showMenu();
}
$('studio-back').onclick = () => {
  if (active) { location.hash = ''; return; }
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'close-tools' }));
  } else if (window.parent !== window) {
    window.parent.postMessage({ type: 'mozart-close-tools' }, location.origin);
  } else if (document.referrer && new URL(document.referrer).origin === location.origin) {
    history.back();
  } else { location.assign('/messages'); }
};
window.addEventListener('hashchange', routeTool);
routeTool();
