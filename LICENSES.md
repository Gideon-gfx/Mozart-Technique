# Teaching tools: third-party notices

This file covers the newly added teaching-tools package, not a retroactive license audit of every existing app dependency. The build copies exact installed license/notice files into `public/teaching-tools/licenses/` and preserves bundled JavaScript legal comments. Keep that directory with the distributed assets. Exact versions and transitive packages are locked in `teaching-tools/package-lock.json`.

| Library / asset | License | Use |
| --- | --- | --- |
| @mediapipe/tasks-vision (locked version) | Apache-2.0 | Browser pose landmarks; distributed WASM notices retained |
| Three.js (locked version) | MIT | Theatre stage-lighting study |
| Konva (exact version in teaching-tools/package-lock.json) | MIT | Dance stage formations and cue paths |
| Tone.js 15.1.22 | MIT | Metronome, synthesizer, sequencer |
| WaveSurfer.js 7.12.12 | BSD-3-Clause | Local waveforms and regions |
| Meyda 5.6.3 | MIT | Spectrum extraction |
| Pitchy 4.1.0 | MIT (installed npm release and LICENSE) | Pitch detection; no aubio/GPL package |
| teoria 2.5.0 | MIT | Interval logic |
| VexFlow 5.0.0 | MIT | Notation |
| Bravura 1.0.2 / Academico 1.0.1 fonts | SIL OFL-1.1 | Unmodified notation/text fonts; Steinberg notices retained |
| TipTap core / starter-kit 3.31.3 | MIT | Notebook; no paid TipTap extensions or cloud service |
| soundfont-player 0.12.0 | MIT | Optional sampled instruments; does not license sound recordings |
| esbuild | MIT | Build dependency |
| Playwright | Apache-2.0 | Development browser tests |

Browser-native Web Audio, Web MIDI and Web Speech APIs are not third-party code redistributed by this package. Speech services/voices can have provider terms and availability limits.

## Later categories (not yet distributed)

Magenta.js 1.23.1 was evaluated and removed before deployment. Its dependency audit reported nine production advisories (four critical, five high), including protobufjs, minimist and the old static-module chain. The isolated worker also failed the runtime generation test. It is not included in the final package or generated output. No alternative AI library has been substituted. A reviewed maintained fork/patch set, or explicit approval for a maintained TensorFlow.js implementation, is needed before restoring AI generation.

TensorFlow.js/MoveNet and Vosk remain pending. Vosk language-model licenses are not uniform; select an Apache-2.0 small model for an offline build and include its model notice.

Pose tracking requests Google's version-1 Pose Landmarker Lite model from the official MediaPipe model bucket only after the user clicks Start. The model is not bundled in this repository; keep its upstream model terms with any future offline redistribution. Camera frames never leave the client. Initial model downloading needs internet/data; this is not guaranteed offline.

## Samples and model assets

Do not infer asset licenses from the player or AI library. FluidR3_GM's published bank is described as CC BY 3.0 by midi-js-soundfonts; MusyngKite/FatBoy use CC BY-SA 3.0. Any shipped sample bank needs its own attribution and license. No bank is bundled by this initial build. Magenta model checkpoints likewise require retained source/attribution and an explicit download action rather than loading in every chat.
