"use client";

import { useEffect, useState } from "react";

// The control panel creates the canvas inside this container (a new one every time projectM starts).
export const STAGE_ID = "retro-stage";

export type VisualsMessage = { type: "ready" } | { type: "next" } | { type: "attached" };

// "Dumb" window: it only hosts the canvas. The control panel (window.opener) draws here and handles the audio.
export default function VisualsWindow() {
  const [attached, setAttached] = useState(false);
  const [orphan, setOrphan] = useState(false);

  useEffect(() => {
    const send = (msg: VisualsMessage) => window.opener?.postMessage(msg, window.location.origin);

    const onMessage = (e: MessageEvent<VisualsMessage>) => {
      if (e.origin === window.location.origin && e.data?.type === "attached") setAttached(true);
    };
    const toggleFullscreen = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        send({ type: "next" });
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKey);
    window.addEventListener("dblclick", toggleFullscreen);
    if (window.opener) send({ type: "ready" });
    const orphanTimer = setTimeout(() => setOrphan(!window.opener), 1500);

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dblclick", toggleFullscreen);
      clearTimeout(orphanTimer);
    };
  }, []);

  return (
    <main className={`relative h-full w-full ${attached ? "cursor-none" : ""}`}>
      <div id={STAGE_ID} className="absolute inset-0" />
      {!attached && (
        <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-zinc-500">
          {orphan
            ? 'This window is opened from the control panel. Go back to the other tab and click "Open visuals".'
            : "Connecting to the control panel…"}
        </p>
      )}
      {attached && (
        <p className="pointer-events-none absolute bottom-4 left-0 right-0 animate-[fade_4s_forwards] text-center text-xs text-white/70">
          double-click or F: fullscreen · space: next preset
        </p>
      )}
    </main>
  );
}
