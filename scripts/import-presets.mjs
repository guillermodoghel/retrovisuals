// Imports a folder of .milk presets (e.g. projectM's presets-cream-of-the-crop) into public/presets:
// each file is copied as <id>.milk and public/presets/index.json maps names to ids.
// Presets listed in public/thumbs/broken.json or empty.json are skipped, and their thumbnails removed.
// Usage: node scripts/import-presets.mjs <presets-dir>
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = process.argv[2] && resolve(process.argv[2]);
if (!sourceDir || !existsSync(sourceDir)) {
  console.error("Usage: node scripts/import-presets.mjs <presets-dir>");
  process.exit(1);
}

const thumbsDir = join(webDir, "public", "thumbs");
const readList = (file) => (existsSync(join(thumbsDir, file)) ? JSON.parse(readFileSync(join(thumbsDir, file), "utf8")) : []);
const skipped = new Set([...readList("broken.json"), ...readList("empty.json")]);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".milk") ? [join(dir, e.name)] : [],
  );

const presetsOut = join(webDir, "public", "presets");
rmSync(presetsOut, { recursive: true, force: true });
mkdirSync(presetsOut, { recursive: true });
const index = [];
for (const file of walk(sourceDir)) {
  const name = relative(sourceDir, file).split(sep).join("/").replace(/\.milk$/, "");
  // Short, filesystem-safe file name; the real name lives in the index.
  const id = createHash("sha1").update(name).digest("hex").slice(0, 12);
  if (skipped.has(id)) {
    rmSync(join(thumbsDir, `${id}.webp`), { force: true });
    continue;
  }
  copyFileSync(file, join(presetsOut, `${id}.milk`));
  index.push({ n: name, f: id });
}
index.sort((a, b) => a.n.localeCompare(b.n));
writeFileSync(join(presetsOut, "index.json"), JSON.stringify(index));

// Keep the thumbnail index in sync with the files that are left.
if (existsSync(thumbsDir)) {
  const ids = readdirSync(thumbsDir).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5));
  writeFileSync(join(thumbsDir, "index.json"), JSON.stringify(ids));
}
console.log(`${index.length} presets in public/presets (${skipped.size} broken or empty skipped)`);
