// Copies projectM compiled to WebAssembly (@koel-project/projectm-wasm) into public/projectm.
// Runs automatically before dev/build. Manual use: node scripts/prepare-assets.mjs
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmDir = dirname(createRequire(import.meta.url).resolve("@koel-project/projectm-wasm/koel_projectm.js"));
const projectmOut = join(webDir, "public", "projectm");
mkdirSync(projectmOut, { recursive: true });
for (const file of ["koel_projectm.js", "koel_projectm.wasm"]) copyFileSync(join(wasmDir, file), join(projectmOut, file));
console.log("projectM ready in public/projectm");
