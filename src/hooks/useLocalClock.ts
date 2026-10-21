import { useEffect, useRef, useState } from "react";

export function useLocalClock(duration: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (!playing) return;
    last.current = Date.now();
    const loop = () => {
      const now = Date.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [playing, duration]);

  return {
    t,
    playing,
    setT,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
  };
}
