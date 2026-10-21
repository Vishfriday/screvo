import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";

// Drives the editor playhead while `playing` is true.
export function usePlaybackClock() {
  const playing = useStore((s) => s.playing);
  const tick = useStore((s) => s.tick);
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (!playing) return;
    last.current = Date.now();
    const loop = () => {
      const now = Date.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      tick(dt);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [playing, tick]);
}
