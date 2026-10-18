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
  const page = await browser.newPage({hasTouch:true});
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
  const beforeTouch=await page.locator('#score-input').inputValue();
  await page.touchscreen.tap(spot.x+50,spot.y-10);
  assert.notEqual(await page.locator('#score-input').inputValue(),beforeTouch,'Touch should produce playable notation too.');
  assert.match(await page.locator('#transcriber-status').innerText(),/aligned/,JSON.stringify(await page.locator('#transcribed-score svg').evaluate(svg=>({rect:svg.getBoundingClientRect().toJSON(),pen:document.querySelector('#score-pen').getAttribute('aria-pressed'),staves:svg.dataset.drawStaves,pointer:typeof svg.onpointerdown,screen:innerHeight}))));
  await page.locator('#score-pen').click();
  const oldHeight=await page.locator('#transcribed-score svg').getAttribute('viewBox');
  await page.locator('#score-page').click();
  assert.notEqual(await page.locator('#transcribed-score svg').getAttribute('viewBox'),oldHeight);
  await page.locator('#score-play').click();
  await page.locator('.score-note-playing').first().waitFor();
  await page.locator('#record-stop').click();
  assert.equal(await page.locator('.score-note-playing').count(),0);

 console.log('PASS: manuscript drawing, typing, pages and highlighting');
} finally { await browser?.close(); server.close(); }
