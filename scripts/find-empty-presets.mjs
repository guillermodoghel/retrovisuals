// Flags presets that show nothing: the thumbnail came out a single color (black, white or flat)
// or they are fade-to-black transitions from the "! Transition" folder. Writes public/thumbs/empty.json and the
// app drops them from the gallery just like the broken ones. Run after scripts/generate-thumbnails.mjs.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const MIN_CONTRAST = 3; // average standard deviation of the channels, 0 to 255

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const presets = JSON.parse(readFileSync(join(publicDir, "presets", "index.json"), "utf8"));
const thumbs = new Set(JSON.parse(readFileSync(join(publicDir, "thumbs", "index.json"), "utf8")));

// Keeps earlier entries: import-presets.mjs already removed those presets from the index.
const emptyPath = join(publicDir, "thumbs", "empty.json");
const empty = existsSync(emptyPath) ? JSON.parse(readFileSync(emptyPath, "utf8")) : [];
let next = 0;
await Promise.all(
  Array.from({ length: 16 }, async () => {
    while (next < presets.length) {
      const preset = presets[next++];
      if (empty.includes(preset.f)) continue;
      if (preset.n.startsWith("! Transition/")) {
        empty.push(preset.f);
        continue;
      }
      if (!thumbs.has(preset.f)) continue;
      const { channels } = await sharp(join(publicDir, "thumbs", `${preset.f}.webp`)).stats();
      const contrast = (channels[0].stdev + channels[1].stdev + channels[2].stdev) / 3;
      if (contrast < MIN_CONTRAST) empty.push(preset.f);
    }
  }),
);

writeFileSync(emptyPath, JSON.stringify(empty));
console.log(`${empty.length} empty presets in public/thumbs/empty.json`);
