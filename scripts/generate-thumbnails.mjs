// Generates one thumbnail per preset: renders it with projectM (WASM) in headless Chrome with synthetic
// audio and saves public/thumbs/<id>.webp + public/thumbs/index.json. Resumes where it left off.
// Presets that make projectM abort are recorded in public/thumbs/broken.json and the app skips them.
// Usage: node scripts/generate-thumbnails.mjs [--limit N] [--workers N] [--seconds S] [--force]
// Requires scripts/prepare-assets.mjs to have run first (npm run dev / build do it automatically).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(webDir, "public");
const outDir = join(publicDir, "thumbs");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const LIMIT = arg("limit", Infinity);
const WORKERS = arg("workers", 6);
const SECONDS = arg("seconds", 2.5);
const FORCE = process.argv.includes("--force");
const WIDTH = 320;
const HEIGHT = 180;

const indexPath = join(publicDir, "presets", "index.json");
if (!existsSync(indexPath)) {
  console.error("public/presets is missing. Run this first: node scripts/prepare-assets.mjs");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const presets = JSON.parse(readFileSync(indexPath, "utf8"));
const brokenPath = join(outDir, "broken.json");
const broken = new Set(!FORCE && existsSync(brokenPath) ? JSON.parse(readFileSync(brokenPath, "utf8")) : []);
const pending = presets
  .filter((p) => FORCE || (!broken.has(p.f) && !existsSync(join(outDir, `${p.f}.webp`))))
  .slice(0, LIMIT);

// Minimal static server for public/ (projectM has to be served over http to load the .wasm).
const types = { ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".html": "text/html" };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(publicDir, path === "/" ? "blank.html" : path);
  if (path === "/" || path === "/blank.html") {
    res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><body style='margin:0;background:#000'>");
    return;
  }
  if (!file.startsWith(publicDir) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// Runs inside the page: boots projectM and exposes window.renderPreset(milk, ms).
function pageSetup({ width, height }) {
  let api = null;
  let pcmPointer = 0;
  const pcm = new Float32Array(2048);

  async function boot() {
    const canvas = document.createElement("canvas");
    canvas.id = `c${Math.random().toString(36).slice(2)}`;
    canvas.width = width * 1.5;
    canvas.height = height * 1.5;
    document.body.replaceChildren(canvas);
    const m = await window.KoelProjectM({ locateFile: () => "/projectm/koel_projectm.wasm" });
    api = {
      canvas,
      m,
      init: m.cwrap("koel_projectm_init", "number", ["string", "number", "number"]),
      load: m.cwrap("koel_projectm_load_preset", null, ["string"]),
      addPcm: m.cwrap("koel_projectm_add_pcm", null, ["number", "number"]),
      render: m.cwrap("koel_projectm_render", null, []),
    };
    if (api.init(`#${canvas.id}`, canvas.width, canvas.height) !== 0) throw new Error("no WebGL 2");
    pcmPointer = m._malloc(pcm.byteLength);
  }

  // Music-like synthetic audio: kick drum at 120bpm, bass, a moving pad and hi-hats.
  function fillPcm(t) {
    for (let i = 0; i < pcm.length; i++) {
      const s = t + i / 44100;
      const beat = s % 0.5;
      const kick = Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-beat * 30)) * beat) * Math.exp(-beat * 8);
      const bass = 0.35 * Math.sin(2 * Math.PI * 55 * s) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * s));
      const pad = 0.2 * Math.sin(2 * Math.PI * (220 + 30 * Math.sin(s)) * s + Math.sin(2 * Math.PI * 3 * s));
      const hat = (Math.random() - 0.5) * 0.4 * Math.exp(-((s + 0.25) % 0.5) * 40);
      pcm[i] = Math.max(-1, Math.min(1, 0.8 * kick + bass + pad + hat));
    }
  }

  const thumb = document.createElement("canvas");
  thumb.width = width;
  thumb.height = height;
  const thumbCtx = thumb.getContext("2d", { willReadFrequently: true });

  const brightness = () => {
    const { data } = thumbCtx.getImageData(0, 0, width, height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 16) sum += data[i] + data[i + 1] + data[i + 2];
    return sum / (data.length / 16) / 3;
  };

  window.renderPreset = async (milk, ms) => {
    if (!api) await boot();
    try {
      api.load(milk);
    } catch (e) {
      api = null; // module aborted: boot a fresh one for the next preset
      return { error: String(e) };
    }
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        try {
          fillPcm(t);
          api.m.HEAPF32.set(pcm, pcmPointer / 4);
          api.addPcm(pcmPointer, pcm.length);
          api.render();
        } catch (e) {
          api = null;
          return resolve({ error: String(e) });
        }
        if (t * 1000 >= ms) {
          // Copy in the same frame as the render, before the WebGL buffer gets discarded.
          thumbCtx.drawImage(api.canvas, 0, 0, width, height);
          const light = brightness();
          // If it came out almost black, give it a bit more time, up to double.
          if (light < 4 && t * 1000 < ms * 2) return requestAnimationFrame(tick);
          return resolve({ data: thumb.toDataURL("image/webp", 0.72), dark: light < 4 });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-background-timer-throttling"],
});

let next = 0;
let done = 0;
let dark = 0;
const failures = [];
const started = Date.now();
const report = () => {
  const rate = done / ((Date.now() - started) / 1000);
  const eta = rate ? Math.round((pending.length - done) / rate / 60) : "?";
  process.stdout.write(`\r${done}/${pending.length} · ${failures.length} failed · ${dark} dark · ~${eta} min   `);
};

async function worker() {
  const page = await browser.newPage();
  await page.goto(`${base}/blank.html`);
  await page.addScriptTag({ url: "/projectm/koel_projectm.js" });
  await page.evaluate(pageSetup, { width: WIDTH, height: HEIGHT });
  while (next < pending.length) {
    const preset = pending[next++];
    const milk = readFileSync(join(publicDir, "presets", `${preset.f}.milk`), "latin1");
    const result = await page
      .evaluate(([m, ms]) => window.renderPreset(m, ms), [milk, SECONDS * 1000])
      .catch((e) => ({ error: String(e) }));
    if (result.data) {
      writeFileSync(join(outDir, `${preset.f}.webp`), Buffer.from(result.data.split(",")[1], "base64"));
      if (result.dark) dark++;
    } else {
      failures.push({ name: preset.n, error: result.error?.slice(0, 200) });
      if (result.error?.includes("RuntimeError")) broken.add(preset.f); // the WASM module crashed
    }
    done++;
    report();
  }
  await page.close();
}

const writeIndex = () => {
  const ids = readdirSync(outDir)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.slice(0, -5));
  writeFileSync(join(outDir, "index.json"), JSON.stringify(ids));
  writeFileSync(brokenPath, JSON.stringify([...broken]));
  return ids.length;
};
const indexTimer = setInterval(writeIndex, 30000);

console.log(`${pending.length} presets to render with ${WORKERS} workers`);
await Promise.all(Array.from({ length: Math.min(WORKERS, pending.length || 1) }, worker));
clearInterval(indexTimer);
await browser.close();
server.close();
const total = writeIndex();
console.log(`\n${total} thumbnails in public/thumbs (${Math.round((Date.now() - started) / 1000)}s)`);
if (failures.length) {
  writeFileSync(join(webDir, "scripts", "thumbnail-failures.json"), JSON.stringify(failures, null, 2));
  console.log(`${failures.length} presets could not be rendered (scripts/thumbnail-failures.json)`);
}
