# RetroVisuals

Milkdrop visuals in the browser, reacting to your microphone or your computer's audio. Live at
[retrovisuals.vercel.app](https://retrovisuals.vercel.app).

It runs [projectM](https://github.com/projectM-visualizer/projectm) compiled to WebAssembly
([@koel-project/projectm-wasm](https://github.com/koel/projectm-wasm)) with 9000+ presets from projectM's
[cream of the crop](https://github.com/projectM-visualizer/presets-cream-of-the-crop) pack. Web version of
[DepreVisuales](https://github.com/guillermodoghel/depreVisuales), the native C++ app.

```sh
npm install
npm run dev   # http://localhost:3000
```

Audio only works on `localhost` or over HTTPS.

The main tab is the control panel. The visuals open in a separate window (`/visuals`) that you can drag to another
monitor; double click or press F inside it for fullscreen.

- **Audio**: microphone / any input, or "Use computer audio" (share a tab or the whole screen with audio).
  If macOS doesn't offer system audio, install [BlackHole](https://existential.audio/blackhole/) and pick it as the input.
- **Space** (in either window): next preset
- **Gallery**: browse presets by category and subcategory, or search by name or author.

If a preset drops below 30 fps or leaves the screen black for 3 seconds, it switches to the next one. Presets that
crash projectM are dropped from the list.

## Presets and thumbnails

`public/presets` and `public/thumbs` are committed. To rebuild them from a presets folder:

```sh
node scripts/import-presets.mjs path/to/presets-cream-of-the-crop
node scripts/generate-thumbnails.mjs --workers 12   # ~1 h with Chrome; resumable; marks crashing presets in broken.json
node scripts/find-empty-presets.mjs                 # marks presets that render nothing in empty.json
node scripts/import-presets.mjs path/to/presets-cream-of-the-crop   # again, to drop broken and empty ones
```

## License

projectM is LGPL-2.1. Presets belong to their authors.
