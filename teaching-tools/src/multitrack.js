import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const size = buffer.length * channels * 2;
  const data = new ArrayBuffer(44 + size);
  const view = new DataView(data);
  const text = (offset, value) =>
    [...value].forEach((char, index) =>
      view.setUint8(offset + index, char.charCodeAt(0)),
    );
  text(0, "RIFF");
  view.setUint32(4, size + 36, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, size, true);
  const arrays = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  for (let i = 0; i < buffer.length; i++)
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, arrays[channel][i]));
      view.setInt16(
        44 + (i * channels + channel) * 2,
        sample * (sample < 0 ? 32768 : 32767),
        true,
      );
    }
  return data;
}

export function multitrack({ panel, action, status, saveFile }) {
  panel(
    '<h2>Waveform & multitrack practice</h2><p>Load up to four audio files (25 MB each). Drag on a waveform to trim its part in the mix, then set its starting time and volume. Original files are unchanged. Playback restarts from the beginning; edits apply on the next playback.</p><label>Audio files<input id="files" type="file" accept="audio/*" multiple></label><div class="row"><button id="mix-play">Play mix</button><button id="mix-stop" class="secondary">Stop</button><button id="mix-export" class="secondary">Export WAV</button></div><p class="muted">Mixes are limited to two minutes to protect device memory. Export is available in web browsers; native mobile can audition the mix.</p><div id="tracks"></div>',
  );
  const tracks = [];
  let context,
    sources = [];
  let disposed = false;
  if (window.ReactNativeWebView)
    document.getElementById("mix-export").disabled = true;
  const stop = () => {
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {}
    });
    sources = [];
    tracks.forEach((track) => track.wave.pause());
  };
  const parts = () =>
    tracks
      .filter((track) => track.wave.getDecodedData())
      .map((track) => {
        const buffer = track.wave.getDecodedData();
        const offset = Number(track.offset.value);
        const gain = Number(track.volume.value);
        if (!Number.isFinite(offset) || offset < 0 || offset > 120)
          throw new Error(
            "Track start times must be between 0 and 120 seconds.",
          );
        const start = track.region?.start || 0;
        const end = track.region?.end ?? buffer.duration;
        return { buffer, offset, gain, start, duration: end - start };
      });
  const schedule = (ctx, list, when) =>
    list.map((part) => {
      const source = ctx.createBufferSource();
      source.buffer = part.buffer;
      const gain = ctx.createGain();
      gain.gain.value = part.gain / Math.max(1, list.length);
      source.connect(gain).connect(ctx.destination);
      source.start(when + part.offset, part.start, part.duration);
      return source;
    });
  const validate = () => {
    const list = parts();
    if (!list.length) throw new Error("Choose at least one audio file first.");
    const duration = Math.max(...list.map((p) => p.offset + p.duration));
    if (duration > 120)
      throw new Error(
        "Trim tracks or reduce starting times so the mix fits within two minutes.",
      );
    return { list, duration };
  };
  action("mix-play", async () => {
    stop();
    const { list } = validate();
    context ||= new AudioContext();
    await context.resume();
    if (!disposed) sources = schedule(context, list, context.currentTime + 0.1);
  });
  action("mix-stop", stop);
  action("mix-export", async () => {
    stop();
    const { list, duration } = validate();
    const button = document.getElementById("mix-export");
    button.disabled = true;
    try {
      const offline = new OfflineAudioContext(
        2,
        Math.ceil(duration * 44100),
        44100,
      );
      schedule(offline, list, 0);
      const rendered = await offline.startRendering();
      if (!disposed)
        await saveFile(
          new Blob([encodeWav(rendered)], { type: "audio/wav" }),
          "mozart-practice-mix.wav",
        );
    } finally {
      if (!disposed) button.disabled = false;
    }
  });
  document.getElementById("files").onchange = async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    for (const file of files) {
      if (disposed) return;
      if (tracks.length >= 4) {
        status("Four tracks maximum. Reopen Waveforms to clear the session.");
        break;
      }
      if (file.size > 25 * 1024 * 1024) {
        status("Choose audio files smaller than 25 MB.");
        continue;
      }
      const wrapper = document.createElement("section");
      wrapper.className = "track";
      const title = document.createElement("strong");
      title.textContent = file.name;
      const container = document.createElement("div");
      const offset = document.createElement("input");
      offset.type = "number";
      offset.min = "0";
      offset.max = "120";
      offset.step = ".1";
      offset.value = "0";
      const volume = document.createElement("input");
      volume.type = "range";
      volume.min = "0";
      volume.max = "1";
      volume.step = ".05";
      volume.value = "1";
      const offsetLabel = document.createElement("label");
      offsetLabel.append("Start at (seconds) ", offset);
      const volumeLabel = document.createElement("label");
      volumeLabel.append("Volume ", volume);
      const audition = document.createElement("button");
      audition.textContent = "Audition / pause";
      audition.className = "secondary";
      wrapper.append(title, container, offsetLabel, volumeLabel, audition);
      document.getElementById("tracks").append(wrapper);
      const regions = RegionsPlugin.create();
      const wave = WaveSurfer.create({
        container,
        waveColor: "#e5bdc5",
        progressColor: "#b42335",
        height: 80,
        plugins: [regions],
      });
      const track = { wave, offset, volume, region: null };
      tracks.push(track);
      regions.enableDragSelection({ color: "#b4233530" });
      regions.on("region-created", (region) => {
        track.region?.remove();
        track.region = region;
      });
      audition.onclick = () =>
        wave.playPause().catch(() => status("Could not play this track."));
      try {
        await wave.loadBlob(file);
      } catch {
        if (!disposed) {
          status("This audio format could not be opened. Try WAV or MP3.");
          wave.destroy();
          wrapper.remove();
          tracks.splice(tracks.indexOf(track), 1);
        }
      }
    }
  };
  return () => {
    disposed = true;
    stop();
    tracks.forEach((track) => track.wave.destroy());
    context?.close();
  };
}
