import { build } from "esbuild";
import { mkdir, copyFile, readdir, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const out = new URL("../public/teaching-tools/", import.meta.url);
await mkdir(out, { recursive: true });
await build({ entryPoints: ['src/pose-worker.js'], bundle: true, format: 'iife', outfile: fileURLToPath(new URL('pose-worker.js', out)), minify: true, legalComments: 'linked', target: ['es2022'] });
await cp('node_modules/@mediapipe/tasks-vision/wasm', new URL('vision-wasm/', out), { recursive: true });
await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  splitting: true,
  outdir: fileURLToPath(out),
  minify: true,
  legalComments: "linked",
  target: ["es2022"],
});
for (const name of ["index.html", "styles.css"])
  await copyFile(new URL(`src/${name}`, import.meta.url), new URL(name, out));
// Preserve the exact distributed license texts, including transitive dependencies.
async function licenses(root, prefix = "") {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = path.join(root, entry.name);
    if (entry.name.startsWith("@")) {
      await licenses(dir, `${entry.name}-`);
      continue;
    }
    for (const file of await readdir(dir, { withFileTypes: true })) {
      if (file.isFile() && /^(licen[cs]e|copying|notice)/i.test(file.name)) {
        await copyFile(
          path.join(dir, file.name),
          new URL(`licenses/${prefix}${entry.name}-${file.name}`, out),
        );
      }
      if (file.isDirectory() && file.name === "node_modules")
        await licenses(path.join(dir, file.name), `${prefix}${entry.name}-`);
    }
  }
}
await mkdir(new URL("licenses/", out), { recursive: true });
await licenses("node_modules");
for (const font of ["bravura", "academico"]) {
  await copyFile(
    `node_modules/@vexflow-fonts/${font}/${font}.woff2`,
    new URL(`${font}.woff2`, out),
  );
}
