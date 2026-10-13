// projectM (the same engine as the native version) compiled to WebAssembly by @koel-project/projectm-wasm.
// Reads .milk files directly, no conversion. scripts/prepare-assets.mjs copies the files to public/projectm.

interface ProjectMModule {
  cwrap: (name: string, returnType: string | null, argumentTypes: string[]) => (...args: unknown[]) => unknown;
  _malloc: (size: number) => number;
  _free: (pointer: number) => void;
  HEAPF32: Float32Array;
}

type ProjectMFactory = (options: { locateFile: (file: string) => string }) => Promise<ProjectMModule>;

export interface ProjectM {
  loadPreset(milk: string): void;
  addPcm(samples: Float32Array): void;
  render(): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export const PCM_SAMPLES = 2048;

function loadScript(win: Window): Promise<ProjectMFactory> {
  const existing = (win as Window & { KoelProjectM?: ProjectMFactory }).KoelProjectM;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = win.document.createElement("script");
    script.src = "/projectm/koel_projectm.js";
    script.onload = () => resolve((win as Window & { KoelProjectM?: ProjectMFactory }).KoelProjectM!);
    script.onerror = () => reject(new Error("Could not load projectM"));
    win.document.head.appendChild(script);
  });
}

// The module is loaded inside the window that holds the canvas: emscripten finds the canvas with
// document.querySelector, so it has to live in that same document.
export async function createProjectM(win: Window, canvas: HTMLCanvasElement): Promise<ProjectM> {
  const factory = await loadScript(win);
  const wasm = await factory({ locateFile: () => "/projectm/koel_projectm.wasm" });

  const init = wasm.cwrap("koel_projectm_init", "number", ["string", "number", "number"]);
  const loadPreset = wasm.cwrap("koel_projectm_load_preset", null, ["string"]);
  const addPcm = wasm.cwrap("koel_projectm_add_pcm", null, ["number", "number"]);
  const render = wasm.cwrap("koel_projectm_render", null, []);
  const resize = wasm.cwrap("koel_projectm_resize", null, ["number", "number"]);
  const destroy = wasm.cwrap("koel_projectm_destroy", null, []);

  if (init(`#${canvas.id}`, canvas.width, canvas.height) !== 0) {
    throw new Error("projectM could not create the WebGL 2 context");
  }

  const pcmPointer = wasm._malloc(PCM_SAMPLES * Float32Array.BYTES_PER_ELEMENT);

  return {
    loadPreset: (milk) => loadPreset(milk),
    addPcm: (samples) => {
      const count = Math.min(samples.length, PCM_SAMPLES);
      wasm.HEAPF32.set(samples.subarray(0, count), pcmPointer / Float32Array.BYTES_PER_ELEMENT);
      addPcm(pcmPointer, count);
    },
    render: () => render(),
    resize: (width, height) => resize(width, height),
    destroy: () => {
      destroy();
      wasm._free(pcmPointer);
    },
  };
}
