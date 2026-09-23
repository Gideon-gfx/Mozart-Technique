import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
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
  await page.getByRole("heading", { name: "Keep the pulse" }).waitFor();
  await page.getByRole('button', { name: 'Line rehearsal', exact: true }).click();
  await page.locator('#script-example').click();
  assert.match(await page.locator('#script-line').innerText(), /NARRATOR/);
  await page.locator('#script-text').fill('First cue\nSecond cue');
  await page.locator('#script-load').click();
  assert.equal(await page.locator('#script-line').innerText(), 'First cue');
  await page.locator('#cue-next').click();
  assert.equal(await page.locator('#script-line').innerText(), 'Second cue');
  await page.locator('#cue-reveal').click();
  assert.match(await page.locator('#script-line').innerText(), /Recall this line/);
  await page.getByRole('button', { name: 'Pose tracking', exact: true }).click();
  assert.equal(await page.locator('#pose-result').innerText(), 'Camera off');
  assert.deepEqual(await page.locator('#pose-people option').allTextContents(), ['1','2','3','4']);
  await page.locator('#pose-fullscreen').click();
  await page.waitForFunction(() => !!document.fullscreenElement || document.querySelector('#pose-view').classList.contains('pose-expanded'));
  await page.locator('#pose-fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector('#pose-view').classList.contains('pose-expanded'));
  await page.getByRole('button', { name: 'Vocal projection', exact: true }).click();
  await page.locator('#voice-start').click();
  await page.waitForFunction(() => document.querySelector('#voice-level').textContent.includes('dBFS'));
  await page.locator('#voice-stop').click();
  assert.equal(await page.locator('#voice-level').innerText(), 'Microphone off');
  await page.getByRole('button', { name: 'Stage formations', exact: true }).click();
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
  await page.getByRole('button', { name: 'Metronome', exact: true }).click();
  assert.deepEqual(await page.locator('#beats option').allTextContents(), ['2','3','4','5','6','7','8','9','10','11','12']);
  await page.locator('#beats').selectOption('12');
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#beat").textContent !== "—",
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page
    .getByRole("button", { name: "Keyboard & sequence", exact: true })
    .click();
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
  await page.getByRole("button", { name: "Manuscript", exact: true }).click();
  await page.locator("#notation svg").waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#notation .vf-stavenote').length === 4);
  assert.equal(await page.locator('#status').innerText(), '');
  await page.locator('#notes').fill('c#4, Eb4 F G A4 R');
  await page.locator('#notes').press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('#notation .vf-stavenote').length===6);
  assert.match(await page.locator('#notation-status').innerText(), /6 quarter/);
  await page.locator('#notes').fill('invalid');
  await page.locator('#draw').click();
  assert.match(await page.locator('#notation-status').innerText(), /not a note/);
  assert.equal(await page.locator('#notation .vf-stavenote').count(),6);
  await page.locator('#notes').fill('g3 a3 b3 c4 d4');
  await page.waitForFunction(()=>document.querySelectorAll('#notation .vf-stavenote').length===5);
  assert.equal(
    await page.evaluate(() => document.fonts.check("16px Bravura")),
    true,
  );
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await page.locator(".tiptap").fill("Keep your wrists relaxed.");
  await page
    .getByRole("button", { name: "Aural practice", exact: true })
    .click();
  await page.locator("#question").click();
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  assert.match(await page.locator(".tiptap").innerText(), /wrists/);
  await page
    .getByRole("button", { name: "Tuner & spectrum", exact: true })
    .click();
  await page.locator("#listen").click();
  await page.locator("#mic-stop").click();
  await page.locator('#test-tone').click();
  await page.waitForFunction(()=>document.getElementById('pitch').textContent==='A4');
  assert.match(await page.locator('#pitch-detail').innerText(), /440\.0 Hz/);
  await page.locator('#mic-stop').click();
  assert.equal(await page.locator('#pitch-detail').innerText(),'Microphone off');
  await page.getByRole("button", { name: "Waveforms", exact: true }).click();
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
    await page
      .getByRole("button", { name: "Sampled instruments", exact: true })
      .click();
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
    "Aural practice",
    "Notebook",
    "Sampled instruments",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Mobile overflow in ${name}`,
    );
  }
  await mkdir('test-results', {recursive:true});
  await page.getByRole('button', {name:'Manuscript',exact:true}).click();
  await page.locator('#notation svg').waitFor();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button', {name:'Metronome',exact:true}).click();
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  // The modal mounts the same page, and removing it tears down its audio context.
  await page.addScriptTag({
    url: `http://127.0.0.1:${server.address().port}/assets/teaching-tools-launcher.js`,
  });
  await page.evaluate(() => window.MozartTeachingTools.open());
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("button", { name: "Close tools · return to chat" })
    .click();
  assert.equal(await page.locator("dialog").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: tool navigation, metronome, sequence validation, notation fonts, notebook retention, microphone start/stop, two-track mix/WAV export, 375px layout, modal close, no browser exceptions.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
