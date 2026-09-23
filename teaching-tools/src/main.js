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
  theory: "Aural practice",
  notebook: "Notebook",
  instruments: "Sampled instruments",
  formation: "Stage formations",
  pose: "Pose tracking",
  theatre: "Line rehearsal",
  projection: "Vocal projection",
  lighting: "Stage lighting",
};
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
  $("tool").innerHTML = html;
}
async function saveFile(blob, name) {
  if (window.ReactNativeWebView && blob.type.startsWith("text/plain")) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: "share-notes",
        text: (await blob.text()).slice(0, 100000),
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
    '<h2>Keep the pulse</h2><label>Tempo (BPM) <input id="bpm" type="number" value="80" min="30" max="240"></label><label>Beats per bar <select id="beats"><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option><option>7</option><option>8</option><option>9</option><option>10</option><option>11</option><option>12</option></select></label><div class="readout" id="beat">—</div><div class="row"><button id="start">Start</button><button id="stop" class="secondary">Stop</button></div>',
  );
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
  });
  action("stop", () => {
    startId++;
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    playing = false;
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
  panel('<h2>Manuscript</h2><label>Notes (1–16, separated by spaces or commas)<input id="notes" value="C4 D4 E4 G4" style="width:100%" autocomplete="off" spellcheck="false"></label><p class="muted">Examples: C D E G · c4 d4 e4 g4 · C#4 Eb4 F4 G4. Octaves 2–6; missing octave means 4. Use R for a quarter rest. Updates as you type, or press Enter / Draw notes.</p><button id="draw" disabled>Draw notes</button><p id="notation-status" role="status"></p><div id="notation"></div>');
  const ticket = generation;
  let timer;
  cleanup = () => clearTimeout(timer);
  const { Renderer, Stave, StaveNote, Formatter, Voice, VexFlow, Accidental } = await import("vexflow");
  await Promise.all([document.fonts.load("16px Bravura"), document.fonts.load("16px Academico")]);
  if (ticket !== generation) return;
  VexFlow.setFonts("Bravura", "Academico");
  const draw = () => {
    const raw = $("notes").value.trim().replace(/♯/g, "#").replace(/♭/g, "b");
    const tokens = raw.split(/[\s,|]+/).filter(Boolean);
    if (!tokens.length || tokens.length > 16) throw new Error("Enter between 1 and 16 notes.");
    const notes = tokens.map(token => {
      if (/^(r|-)$/i.test(token)) return { rest: true };
      const match = /^([a-g])([#b]?)(?:\/?([2-6]))?$/i.exec(token);
      if (!match) throw new Error('"' + token + '" is not a note. Try C4, c#4, Eb4, or R.');
      return { letter: match[1].toLowerCase(), accidental: match[2].toLowerCase(), octave: match[3] || "4" };
    });
    const output = document.createElement("div");
    const renderer = new Renderer(output, Renderer.Backends.SVG);
    const height = Math.ceil(notes.length / 4) * 160 + 20;
    renderer.resize(520, height);
    const ctx = renderer.getContext();
    for (let start = 0; start < notes.length; start += 4) {
      const stave = new Stave(10, 30 + (start / 4) * 160, 500).addClef("treble").setContext(ctx);
      if (start === 0) stave.addTimeSignature("4/4");
      stave.draw();
      const tickables = notes.slice(start, start + 4).map(note => {
        const item = new StaveNote({ keys: [note.rest ? "b/4" : note.letter + note.accidental + "/" + note.octave], duration: note.rest ? "qr" : "q" });
        if (note.accidental) item.addModifier(new Accidental(note.accidental), 0);
        return item;
      });
      const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(tickables);
      new Formatter().joinVoices([voice]).format([voice], 375);
      voice.draw(ctx, stave);
    }
    const svg = output.querySelector("svg");
    svg.setAttribute("viewBox", "0 0 520 " + height);
    svg.style.width = "100%"; svg.style.height = "auto";
    $("notation").replaceChildren(output);
    $("notation-status").textContent = notes.length + " quarter-note entries.";
    status();
  };
  const update = () => { clearTimeout(timer); try { draw(); } catch(error) { $("notation-status").textContent = error.message; } };
  $("draw").disabled = false;
  $("draw").onclick = update;
  $("notes").oninput = () => { clearTimeout(timer); timer = setTimeout(update, 250); };
  $("notes").onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); update(); } };
  draw();
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
  theory,
  notebook,
  instruments: () => {
    cleanup = instruments({ panel, action, status });
  },
};
async function select(name) {
  stop();
  active = name;
  status();
  document
    .querySelectorAll("#tabs button")
    .forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.tool === name)),
    );
  try {
    await renderers[name]();
  } catch (e) {
    status(e.message || "Could not open this tool.");
  }
}
for (const [id, label] of Object.entries(tools)) {
  const b = document.createElement("button");
  b.textContent = label;
  b.dataset.tool = id;
  b.onclick = () => select(id);
  $("tabs").append(b);
}
$("stop-all").onclick = () => {
  select(active);
  status("Audio stopped.");
};
window.addEventListener("pagehide", stop);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !pendingPermissions) {
    pausedForVisibility = true;
    stop();
    status(
      "Tools paused while this screen is hidden. Select a tool to restart.",
    );
  } else if (!document.hidden && pausedForVisibility) {
    pausedForVisibility = false;
    select(active);
    status('Tools reset after returning to this screen. Audio remains off.');
  }
});
select("metronome");
