# Mozart teaching tools

## Architecture confirmed

The website is Express serving HTML/JavaScript from `public`, not Next.js. The `mobile` directory is a native Expo SDK 57 / React Native app, not a website wrapper. Existing WebViews are used for particular content. No Electron or Tauri application was found. No existing notebook/manuscript/metronome/tuner implementation was found. These tools use the existing attachment menus in ordinary tutor and organization-tutor chats, plus the web group-chat menu; they do not introduce a competing chat system.

The shared browser studio is built into `public/teaching-tools/`. Web chat opens it in an accessible dialog; native mobile opens a focused WebView inside the app; Expo web uses an iframe. Audio/files are processed client-side. No payment, user, database, lesson billing or chat API was changed. The public static tools contain no private account information. Menu visibility is a convenience, not an authorization boundary for sensitive data.

## Build and test

From this directory: `npm ci`, `npm run build`, then `npm test` (requires installed Google Chrome). Dependencies are isolated from the app's existing root and mobile dependencies. Commit the lockfile and generated `public/teaching-tools` assets when deploying without a tools build step. Otherwise add `npm ci --prefix teaching-tools && npm run build --prefix teaching-tools` to deployment. No secret or new environment variable is required. Mobile continues using its existing `EXPO_PUBLIC_API_URL`.

Do not deploy source only without rebuilding the browser assets. Rebuild the native app to pick up microphone permission wording. HTTPS is required for phone microphone access; a phone visiting a development computer's plain HTTP LAN address is not the localhost secure-context exception.

## Current behavior and boundaries

- Metronome: Tone Transport, tempo validation, 2–12 beats per bar, bar accents, explicit start/stop.
- Dance stage formations: Konva canvas, named draggable dancers, accessible coordinate controls, saved cues/path visualization, local draft retention and text-plan export. No API key, cloud account or paid service.
- Pose tracking: opt-in MediaPipe camera landmarks; self-hosted WASM, on-demand official model download. HTTPS/localhost and camera permission required. Frames are processed locally. Accuracy and performance need real-device testing; not a clinical posture assessment. MoveNet remains pending.
- Theatre: script cues with hide/reveal, timed advancement and device speech synthesis; relative dBFS microphone monitor (not calibrated SPL); Three.js lighting study. Vosk offline recognition and speech-driven cue following remain pending. No API keys or paid endpoints are used. Mobile camera/microphone WebView permissions still need device verification.
- Keyboard/sequencer: Tone synthesis, eight steps, optional browser MIDI. This is not represented as a sampled piano.
- Tuner/spectrum: Pitchy and Meyda; explicit microphone consent, local processing, tracks closed on exit. A silent 440 Hz test signal verifies analysis independently of microphone access. Permission requests time out with actionable feedback instead of leaving the button indefinitely busy; silence and input detection are distinguished.
- Waveforms: WaveSurfer local-file visualizations and region trims, synchronized Web Audio mixing, offsets, volume and browser WAV export. Maximum four tracks/25 MB each and a two-minute mix. No destructive source edits, live timeline scrubbing, project persistence or full DAW features. Native mobile supports audition, not WAV export.
- Manuscript: VexFlow with bundled Bravura/Academico fonts; 1–16 quarter notes/rests, sharps/flats, lowercase input and optional octaves (defaults to 4). Auto-redraw, Enter and Draw notes are supported. Invalid edits preserve the previous score. This is not a full score editor.
- Aural practice: teoria intervals and Tone playback.
- Sampled instruments: soundfont-player with optional FluidR3_GM download; visible CC BY attribution. Piano, flute and violin, one octave per instrument. Requires external-host availability. No sample bank is bundled.
- AI melody/chord generation is **not shipped**: Magenta 1.23.1 introduced nine production dependency advisories (four critical/five high) and failed the isolated-worker runtime test. Its dependencies, worker and UI were removed. No alternative was silently substituted. Next options: review and maintain a patched Magenta fork, or seek approval to implement against a maintained TensorFlow.js stack. Do not re-enable the unpatched package on production.
- Notebook: TipTap; memory-only notes retained between tool tabs, download on web/share text on native. Notes disappear when the studio closes or native WebView is unmounted in the background. Optional browser dictation/read-aloud. No promise of cloud sync or offline recognition.
- Tool audio is local. It is not automatically injected into Google Meet or transmitted to the student. Test the meeting application's supported screen/audio sharing separately. Microphone use alongside a live call can fail on some phones; the tool must show that error without affecting billing or the chat.

## Platform decisions

| Tool family | Web | Expo native |
| --- | --- | --- |
| Tone, WaveSurfer, Meyda, Pitchy, notation, teoria, TipTap, soundfont-player | Browser Web Audio/DOM | Shared focused WebView; no silent native library substitutions |
| Magenta.js (blocked) | Published dependency/runtime issues; see above | No AI feature shipped; any replacement requires physical-device performance testing |
| Web MIDI | Feature-detect; HTTPS; user permission; no sysex | Not supported in iOS Safari/WKWebView; Android WebView must be tested; on-screen keys remain available. Vosk is **not** a MIDI fallback |
| SpeechRecognition | Feature-detect, optional; browser provider may use remote servers | Safari support does not guarantee embedded WKWebView recognition. Native offline Vosk bridge is a separate planned development-build integration |
| Speech synthesis | Browser voices vary by OS | Feature-detect in WebView; installed voices determine offline behavior |
| MediaPipe Pose / MoveNet (next category) | Camera permission and client-side model download | Start with WebView for shared UI; benchmark before choosing an additional native binding. Frame processing off the UI thread and downscaled video needed |
| Konva / Three.js (later categories) | DOM canvas / WebGL | WebView reuse; context-loss and low-memory fallback required |
| Vosk (planned theatre/offline speech) | WASM worker plus a separately licensed small language model | Prefer native Vosk capture/recognition bridge feeding transcript messages into the shared notebook. Requires Expo development build, not an assumption that Expo Go includes the module |

Native camera tools will need iOS `NSCameraUsageDescription`, Android CAMERA permission and runtime consent; they are not requested by this Music increment. Microphone uses the existing expo-audio config plugin and RECORD_AUDIO permission, plus runtime consent and WebView origin permission. iOS native speech services, if later chosen instead of Vosk, would require their own speech-recognition privacy description; none are silently enabled here.

## Costs and safeguards

There are no paid API keys, subscriptions or per-use application charges in the implemented tools. Hosting assets, model downloads and samples still consume hosting bandwidth and user data. Browser speech recognition can depend on a vendor service: it is not guaranteed offline or unlimited. Models and sound recordings have separate licenses; a library's MIT/Apache license does not license all downloadable assets. No microphone/video data is uploaded by the studio.

Dance and Theatre remain later increments. Do not claim pose analysis, a stage mapper, a teleprompter, offline Vosk, a vocal monitor or a lighting simulator is shipped by the Music entry point.

## References checked

- https://docs.expo.dev/versions/v57.0.0/
- https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md
- https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API
- https://github.com/mdn/browser-compat-data/blob/main/api/MIDIAccess.json
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- https://alphacephei.com/vosk/models (model licenses/sizes differ)
- https://github.com/gleitz/midi-js-soundfonts (sample-bank licenses differ)
- https://wavesurfer.xyz/ (waveform visualization is not itself a DAW)

## Verification of the Music increment

The isolated Chrome smoke test covers metronome start/stop, invalid sequence input, four rendered notation notes and loaded fonts, retained notebook text, synthetic microphone start/stop, two uploaded WAV tracks and WAV mix export, 375px overflow checks, and closing the embedded dialog. A separate opt-in run (`TEACHING_TOOLS_NETWORK_TEST=1 npm test`) downloaded and decoded the sampled piano successfully. Desktop and phone-width screenshots were inspected; a VexFlow stave-return mismatch found in that review was corrected and added to the regression check. `mobile` TypeScript validation passed. The final teaching-tools production dependency audit reported zero advisories after Magenta was removed; this is not an audit of the rest of the Mozart app.

No authenticated live lesson was created, no payment was made, and no production database was modified for these tests. Real iOS/Android hardware, MIDI hardware, real speech recognition and sharing audio into a live meeting still require device testing.

## Device release checklist

Test on an actual iPhone and Android device: permission granted/denied/revoked; back/close/background cleanup; no microphone indicator after exit; Bluetooth/headphone routing; interrupted calls; touch controls; imported MP3/WAV; notebook export; notation glyphs; a slow/offline connection. Desktop browser tests cannot certify these native behaviors.
