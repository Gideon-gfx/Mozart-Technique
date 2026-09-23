const notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
export function instruments({ panel, action, status }) {
  panel(
    '<h2>Sampled instruments</h2><p>Optional download from the FluidR3_GM soundfont collection. Nothing downloads until you tap Load. Only this octave is decoded.</p><label>Instrument <select id="instrument"><option value="acoustic_grand_piano">Piano</option><option value="violin">Violin</option><option value="flute">Flute</option></select></label><button id="load-samples">Load instrument</button><div class="keys" id="sample-keys"></div><p class="muted">FluidR3 sound recordings by Frank Wen, converted for MIDI.js by Benjamin Gleitzman. <a href="https://github.com/gleitz/midi-js-soundfonts">Source and attribution</a> · <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>. No samples are bundled. Availability and download data depend on the external host.</p>',
  );
  let context, player;
  let disposed = false;
  let loadId = 0;
  for (const note of notes) {
    const b = document.createElement("button");
    b.textContent = note;
    b.disabled = true;
    b.onclick = async () => {
      try {
        await context.resume();
        if (!disposed)
          player.play(note, context.currentTime, { duration: 1, gain: 0.5 });
      } catch (e) {
        status("Instrument playback failed. Try loading it again.");
      }
    };
    document.getElementById("sample-keys").append(b);
  }
  action("load-samples", async () => {
    const button = document.getElementById("load-samples");
    button.disabled = true;
    const attempt = ++loadId;
    document.querySelectorAll('#sample-keys button').forEach(b => b.disabled = true);
    player?.stop();
    if (context) await context.close();
    context = new AudioContext();
    await context.resume();
    status("Downloading instrument…");
    try {
      const { default: Soundfont } = await import("soundfont-player");
      if (disposed) return;
      let timer;
      const pending = Soundfont.instrument(
        context,
        document.getElementById("instrument").value,
        { soundfont: "FluidR3_GM", format: "mp3", notes },
      ).then(instrument => { if (disposed || attempt !== loadId) instrument.stop(); return instrument; });
      let instrument;
      try {
        instrument = await Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => { loadId++; reject(new Error('The instrument download timed out. Please try again.')); }, 60000); })]);
      } finally { clearTimeout(timer); }
      if (disposed || attempt !== loadId) {
        instrument.stop();
        return;
      }
      player = instrument;
      document
        .querySelectorAll("#sample-keys button")
        .forEach((b) => (b.disabled = false));
      status("Instrument ready.");
    } finally {
      if (!disposed) button.disabled = false;
    }
  });
  return () => {
    disposed = true;
    loadId++;
    player?.stop();
    context?.close();
  };
}
