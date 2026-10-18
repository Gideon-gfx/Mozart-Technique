import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { encodeWav } from "./src/multitrack.js";
const root = path.resolve(
  fileURLToPath(new URL("../public/", import.meta.url)),
);
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".woff2": "font/woff2",
      }[path.extname(file)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/teaching-tools/index.html`,
  );
  async function openTool(name) {
    const back = page.getByRole('button', { name: 'Back to all tools', exact: true });
    if (await back.isVisible()) await back.click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.locator('#tool').waitFor({state:'visible'});
  }
  assert.equal(await page.locator('#tool').isVisible(), false);
  assert.equal(await page.locator('#tabs button').count(), 14);
  await openTool('Line rehearsal');
  await page.locator('#script-example').click();
  assert.match(await page.locator('#script-line').innerText(), /NARRATOR/);
  await page.locator('#script-text').fill('First cue\nSecond cue');
  await page.locator('#script-load').click();
  assert.equal(await page.locator('#script-line').innerText(), 'First cue');
  await page.locator('#cue-next').click();
  assert.equal(await page.locator('#script-line').innerText(), 'Second cue');
  await page.locator('#cue-reveal').click();
  assert.match(await page.locator('#script-line').innerText(), /Recall this line/);
  await openTool('Pose tracking');
  assert.equal(await page.locator('#pose-result').innerText(), 'Camera off');
  assert.deepEqual(await page.locator('#pose-people option').allTextContents(), ['1','2','3','4']);
  await page.locator('#pose-fullscreen').click();
  await page.waitForFunction(() => !!document.fullscreenElement || document.querySelector('#pose-view').classList.contains('pose-expanded'));
  await page.locator('#pose-fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector('#pose-view').classList.contains('pose-expanded'));
  await openTool('Vocal projection');
  await page.locator('#voice-start').click();
  await page.waitForFunction(() => document.querySelector('#voice-level').textContent.includes('dBFS'));
  await page.locator('#voice-stop').click();
  assert.equal(await page.locator('#voice-level').innerText(), 'Microphone off');
  await openTool('Stage formations');
  await page.locator('#dancer-name').fill('Dancer One');
  await page.locator('#dancer-add').click();
  await page.locator('#cue-save').click();
  assert.equal(await page.locator('#formation-summary').innerText(), '1 dancers · 1 saved cues');
  await page.locator('#dancer-x').fill('120');
  await page.locator('#dancer-position').click();
  await page.locator('#cue-save').click();
  await page.locator('#cue-select').selectOption('0');
  await page.locator('#cue-load').click();
  await page.locator('#dancer-select').selectOption('1');
  assert.equal(await page.locator('#dancer-x').inputValue(), '360');
  await openTool('Metronome');
  await page.locator('#bpm-plus').click();
  assert.equal(await page.locator('#bpm').inputValue(), '81');
  await page.locator('#bpm-range').fill('100');
  assert.equal(await page.locator('#bpm').inputValue(), '100');
  await page.locator('#beats-plus').click();
  assert.equal(await page.locator('#beats').inputValue(), '5');
  assert.deepEqual(await page.locator('#beats option').allTextContents(), ['2','3','4','5','6','7','8','9','10','11','12']);
  await page.locator('#beats').selectOption('12');
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#beat").textContent !== "—",
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await openTool('Keyboard & sequence');
  await page.locator("#sequence").fill("bad");
  await page.locator("#play").click();
  assert.match(await page.locator("#status").innerText(), /eight notes/);
  await page.evaluate(() => {
    window.testMidiInput = {name:'Test MIDI keyboard',state:'connected',open:async()=>{},close:async()=>{}};
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>({inputs:new Map([['test',window.testMidiInput]])})});
  });
  await page.locator('#midi').click();
  await page.waitForFunction(()=>document.getElementById('midi-status').textContent.includes('Connected: Test MIDI keyboard'));
  await page.evaluate(()=>window.testMidiInput.onmidimessage({data:new Uint8Array([144,60,100])}));
  assert.match(await page.locator('#midi-status').innerText(), /C4/);
  await page.evaluate(()=>window.testMidiInput.onmidimessage({data:new Uint8Array([128,60,0])}));
  await page.evaluate(()=>Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
  await page.locator('#midi').click();
  await page.waitForFunction(()=>document.getElementById('midi-status').textContent.includes('denied MIDI access'));
  await openTool('Manuscript');
  await page.locator('#transcribed-score svg').waitFor();
  assert.equal(await page.locator('#record-start').isVisible(),false);
  await page.locator('#score-edit-panel-toggle').click();
  await page.locator('#score-input').fill('C4:q D4:q E4:q G4:q');
  await page.locator('#score-redraw').click();
  assert.equal(await page.locator('#transcribed-score .vf-stavenote').count(),4);
  await page.locator('#score-input').fill('invalid');
  await page.locator('#score-redraw').click();
  assert.equal(await page.locator('#transcribed-score .vf-stavenote').count(),4);
  await page.locator('#score-input').fill('C5:q D5:q E5:q F5:q');
  await page.locator('#score-redraw').click();
  await page.locator('#score-edit-panel-toggle').click();
  await page.locator('#score-pen').click();
  await page.locator('#transcribed-score svg').evaluate(svg=>svg.scrollIntoView({block:'start'}));
  const spot=await page.locator('#transcribed-score svg').evaluate(svg=>{const point=svg.createSVGPoint();point.x=180;point.y=135;return {x:point.matrixTransform(svg.getScreenCTM()).x,y:point.matrixTransform(svg.getScreenCTM()).y};});
  await page.mouse.move(spot.x,spot.y);await page.mouse.down();
  for(let i=0;i<12;i++)await page.mouse.move(spot.x+Math.cos(i*Math.PI/6)*4,spot.y+Math.sin(i*Math.PI/6)*2);
  await page.mouse.up();
  assert.match(await page.locator('#transcriber-status').innerText(),/aligned/,JSON.stringify(await page.locator('#transcribed-score svg').evaluate(svg=>({rect:svg.getBoundingClientRect().toJSON(),pen:document.querySelector('#score-pen').getAttribute('aria-pressed'),pointer:typeof svg.onpointerdown,screen:innerHeight}))));
  await page.locator('#score-pen').click();
  const oldHeight=await page.locator('#transcribed-score svg').getAttribute('viewBox');
  await page.locator('#score-page').click();
  assert.notEqual(await page.locator('#transcribed-score svg').getAttribute('viewBox'),oldHeight);
  await page.locator('#score-play').click();
  await page.locator('.score-note-playing').first().waitFor();
  await page.locator('#record-stop').click();
  assert.equal(await page.locator('.score-note-playing').count(),0);
  await openTool('Audio to score');
  await page.locator('#score-doc-tab').click();
  assert.equal(await page.locator('#score-documentation').isVisible(),true);
  await page.locator('#score-live-tab').click();
  await page.locator('#transcribed-score svg').waitFor();
  assert.equal(await page.locator('#transcribed-score .vf-stavenote').count(),0,'The initial sheet must be empty.');
  const workletRequests=[];
  page.on('response',response=>{if(response.url().endsWith('/live-pitch-worklet.js'))workletRequests.push(response.status());});
  await page.evaluate(()=>{
    window.originalMic=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async()=>{
      const context=new AudioContext();await context.resume();
      const destination=context.createMediaStreamDestination(),oscillator=context.createOscillator(),gain=context.createGain();
      gain.gain.value=.3;oscillator.connect(gain);gain.connect(destination);
      const now=context.currentTime+.35;
      [261.626,293.665,329.628,349.228,391.995,440,493.883,523.251,261.626].forEach((hz,i)=>oscillator.frequency.setValueAtTime(hz,now+i*.4));
      oscillator.start();window.liveMic={context,destination,oscillator};return destination.stream;
    };
  });
  await page.locator('#record-start').click();
  await page.waitForFunction(()=>document.querySelectorAll('#transcribed-score .vf-stavenote').length>=6,{},{timeout:15000});
  assert.equal(await page.locator('#record-stop').isDisabled(),false,'Notes must appear before pausing.');
  await page.waitForFunction(()=>document.querySelector('#live-tempo').textContent.includes('BPM')&&document.querySelector('#live-key').textContent!=='Listening…');
  assert.equal(await page.locator('#record-time').getAttribute('data-processor'),'worklet',`Worklet failed: ${await page.locator('#record-time').getAttribute('data-processor-error')}; requests: ${JSON.stringify(workletRequests)}`);
  await page.locator('#record-stop').click();
  await page.waitForFunction(()=>document.querySelector('#record-time').textContent==='Microphone off');
  assert.equal(await page.evaluate(()=>window.liveMic.destination.stream.getTracks().every(track=>track.readyState==='ended')),true);
  await page.evaluate(async()=>{window.liveMic.oscillator.stop();await window.liveMic.context.close();navigator.mediaDevices.getUserMedia=window.originalMic;});
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/live-score-desktop.png',fullPage:true});
  await page.locator('#score-play').click();
  assert.equal(await page.locator('#score-play').isDisabled(),true);
  await page.locator('#record-stop').click();
  await page.locator('#score-click').click();
  assert.equal(await page.locator('#score-click').getAttribute('aria-pressed'),'true');
  await page.locator('#record-stop').click();
  await page.locator('#score-save-panel-toggle').click();
  const imageDownloadPromise=page.waitForEvent('download');
  await page.locator('#score-image').click();
  const imageDownload=await imageDownloadPromise;
  assert.equal(imageDownload.suggestedFilename(),'mozart-score.png');
  const pngBytes=await readFile(await imageDownload.path());
  assert.deepEqual([...pngBytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  await writeFile('test-results/live-score-export.png',pngBytes);
  const savedScore=await page.locator('#score-input').inputValue();
  await page.evaluate(()=>document.dispatchEvent(new Event('mozart-tools-pause')));
  await page.evaluate(()=>document.dispatchEvent(new Event('mozart-tools-resume')));
  await page.waitForFunction(expected=>document.querySelector('#score-input')?.value===expected,savedScore);
  await page.reload();
  await page.locator('#transcribed-score .vf-stavenote').first().waitFor();
  assert.equal(await page.locator('#record-time').innerText(),'Microphone off','Reload must restore notes without restarting the mic.');
  await page.locator('#score-import-panel-toggle').click();
  const melodySamples = new Float32Array(44100);
  for (let i = 0; i < melodySamples.length; i++) {
    const hz = i < 22050 ? 440 : 493.883;
    melodySamples[i] = 0.5 * Math.sin(2 * Math.PI * hz * i / 44100);
  }
  const melodyWav = Buffer.from(encodeWav({
    numberOfChannels: 1,
    length: melodySamples.length,
    sampleRate: 44100,
    getChannelData: () => melodySamples,
  }));
  await page.locator('#transcriber-file').setInputFiles({ name: 'melody.wav', mimeType: 'audio/wav', buffer: melodyWav });
  await page.waitForFunction(() => !document.querySelector('#transcribe').disabled);
  await page.locator('#transcribe').click();
  await page.waitForFunction(()=>document.querySelector('#score-input').value==='A4:q B4:q');
  assert.match(await page.locator('#score-input').inputValue(), /A4:q B4:q/);
  await page.locator('#score-edit-panel-toggle').click();
  await page.locator('#score-input').fill('C4:q D4:q R:q E4:q');
  await page.locator('#score-redraw').click();
  assert.equal(await page.locator('#transcribed-score .vf-stavenote').count(), 4);
  await page.locator('#transcribed-score .vf-stavenote').first().click();
  await page.locator('#edit-note-pitch').selectOption('67');
  await page.locator('#edit-note-duration').selectOption('1');
  await page.locator('#edit-note-apply').click();
  assert.match(await page.locator('#score-input').inputValue(),/^G4:8/);
  await page.locator('#edit-note-add').click();
  assert.equal(await page.locator('#transcribed-score .vf-stavenote').count(),5);
  await page.locator('#edit-note-delete').click();
  assert.equal(await page.locator('#transcribed-score .vf-stavenote').count(),4);
  await page.locator('#score-save-panel-toggle').click();
  const scoreDownloadPromise = page.waitForEvent('download');
  await page.locator('#score-export').click();
  assert.equal((await scoreDownloadPromise).suggestedFilename(), 'mozart-transcription.musicxml');
  await page.evaluate(()=>{window.nativeScoreMessages=[];window.ReactNativeWebView={postMessage:message=>window.nativeScoreMessages.push(JSON.parse(message))};});
  await page.locator('#score-export').click();
  await page.waitForFunction(()=>window.nativeScoreMessages.length===1);
  const nativeXml=await page.evaluate(()=>window.nativeScoreMessages[0]);
  assert.equal(nativeXml.type,'save-score');assert.equal(nativeXml.encoding,'utf8');assert.match(nativeXml.data,/<score-partwise/);
  await page.locator('#score-image').click();
  await page.waitForFunction(()=>window.nativeScoreMessages.length===2);
  const nativeImage=await page.evaluate(()=>window.nativeScoreMessages[1]);
  assert.equal(nativeImage.mimeType,'image/png');assert.equal(nativeImage.encoding,'base64');assert.match(nativeImage.data,/^iVBOR/);
  await page.evaluate(()=>{delete window.ReactNativeWebView;});
  await page.locator('#record-start').click();
  await page.waitForFunction(() => !document.querySelector('#record-stop').disabled);
  await page.waitForTimeout(400);
  await page.locator('#record-stop').click();
  await page.waitForFunction(() => document.querySelector('#record-time').textContent === 'Microphone off');
  assert.equal(await page.locator('#transcribe').isDisabled(), false);
  await page.locator('#score-new').click();
  await page.locator('#score-reset-no').click();
  assert.ok(await page.locator('#transcribed-score .vf-stavenote').count());
  await page.locator('#score-new').click();
  await page.locator('#score-reset-yes').click();
  assert.equal(await page.locator('#transcribed-score .vf-stavenote').count(),0);
  await mkdir('test-results', { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: 'test-results/transcriber-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTool('Notebook');
  await page.locator(".tiptap").fill("Keep your wrists relaxed.");
  await openTool('Aural practice');
  await page.locator("#question").click();
  await openTool('Notebook');
  assert.match(await page.locator(".tiptap").innerText(), /wrists/);
  await openTool('Tuner & spectrum');
  await page.locator("#listen").click();
  await page.locator("#mic-stop").click();
  await page.locator('#test-tone').click();
  await page.waitForFunction(()=>document.getElementById('pitch').textContent==='A4');
  const tunerHz = Number((await page.locator('#pitch-detail').innerText()).match(/([\d.]+) Hz/)?.[1]);
  assert.ok(Math.abs(tunerHz - 440) < 2, `Expected an A4 test signal, got ${tunerHz} Hz`);
  await page.locator('#mic-stop').click();
  assert.equal(await page.locator('#pitch-detail').innerText(),'Microphone off');
  await openTool('Waveforms');
  const wav = Buffer.from(
    encodeWav({
      numberOfChannels: 1,
      length: 44100,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(44100),
    }),
  );
  await page.locator("#files").setInputFiles([
    { name: "practice.wav", mimeType: "audio/wav", buffer: wav },
    { name: "accompaniment.wav", mimeType: "audio/wav", buffer: wav },
  ]);
  await page.waitForFunction(
    () => document.querySelectorAll(".track").length === 2,
  );
  await page.locator("#mix-play").click();
  await page.locator("#mix-stop").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#mix-export").click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "mozart-practice-mix.wav");
  if (process.env.TEACHING_TOOLS_NETWORK_TEST === "1") {
    await openTool('Sampled instruments');
    await page.locator("#load-samples").click();
    await page.waitForFunction(
      () => !document.getElementById("load-samples").disabled,
      {},
      { timeout: 90000 },
    );
    assert.match(await page.locator("#status").innerText(), /Instrument ready/);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  for (const name of [
    "Metronome",
    "Keyboard & sequence",
    "Tuner & spectrum",
    "Waveforms",
    "Manuscript",
    "Audio to score",
    "Aural practice",
    "Notebook",
    "Sampled instruments",
    "Stage formations",
    "Pose tracking",
    "Line rehearsal",
    "Vocal projection",
    "Stage lighting",
  ]) {
    await openTool(name);
    if (name !== 'Audio to score' && name !== 'Manuscript') {
      await page.locator('#tool-workspace-tab').waitFor();
      assert.equal(await page.locator('#tool-documentation').isVisible(),false);
      assert.equal(await page.locator('#tool-workspace > p:not([id]):not([role]):not([aria-live])').count(),0,`Guide left in ${name}`);
      await page.locator('#tool-doc-tab').click();
      assert.equal(await page.locator('#tool-documentation').isVisible(),true);
      assert.equal(await page.locator('#tool-workspace').isVisible(),false);
      await page.locator('#tool-workspace-tab').click();
      assert.equal(await page.locator('#tool-workspace').isVisible(),true);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Mobile overflow in ${name}`,
    );
  }
  await mkdir('test-results', {recursive:true});
  await openTool('Manuscript');
  await page.locator('#transcribed-score svg').waitFor();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await openTool('Metronome');
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  // The modal mounts the same page, and removing it tears down its audio context.
  await page.addScriptTag({
    url: `http://127.0.0.1:${server.address().port}/assets/teaching-tools-launcher.js`,
  });
  await page.evaluate(() => window.MozartTeachingTools.open());
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("button", { name: "← Back to chat" })
    .click();
  assert.equal(await page.locator("dialog").count(), 0);
  await page.goto(`http://127.0.0.1:${server.address().port}/teaching-tools/index.html?role=student#metronome`);
  await page.locator('#bpm').waitFor();
  assert.equal(await page.locator('#studio-context').innerText(), 'Student tools');
  assert.equal(await page.locator('#tabs').isVisible(), false);
  await page.getByRole('button', {name:'Back to all tools',exact:true}).click();
  await page.locator('#tabs').waitFor({state:'visible'});
  assert.equal(await page.locator('.studio-intro').isVisible(), true);
  assert.equal(await page.locator('#tool').isVisible(), false);
  await openTool('Notebook');
  await page.locator('.tiptap').waitFor();
  await page.goBack();
  await page.locator('#tabs').waitFor({state:'visible'});
  assert.equal(await page.locator('#tool').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: tool navigation, metronome, sequence validation, notation fonts, notebook retention, microphone start/stop, two-track mix/WAV export, 375px layout, modal close, no browser exceptions.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
