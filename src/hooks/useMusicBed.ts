import { useEffect, useRef } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useStore } from "@/store/useStore";
import { projectSpeed, finishedDuration } from "@/lib/speed";

/**
 * Plays the project's music bed under the preview.
 *
 * The bed follows the playhead the same way the narration does: it loops from
 * the top, is positioned by where the playhead sits on the finished clock, and
 * fades at both ends exactly as the exported mix will. Scrubbing repositions it
 * rather than restarting it, so the editor sounds like the file will.
 */
export function useMusicBed() {
  const project = useStore((s) => s.editing());
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);

  const ref = useRef<AudioPlayer | null>(null);
  const loaded = useRef<string | null>(null);

  useEffect(
    () => () => {
      try {
        ref.current?.remove();
      } catch {
        // already released
      }
      ref.current = null;
      loaded.current = null;
    },
    [],
  );

  useEffect(() => {
    const music = project?.music;
    if (!music) {
      try {
        ref.current?.pause();
      } catch {
        // nothing loaded yet
      }
      return;
    }
    try {
      if (loaded.current !== music.uri) {
        loaded.current = music.uri;
        if (ref.current) ref.current.replace(music.uri);
        else ref.current = createAudioPlayer(music.uri);
        if (ref.current) ref.current.loop = music.loop;
      }
      const pl = ref.current;
      if (!pl) return;
      pl.loop = music.loop;

      const speed = projectSpeed(project!);
      const total = finishedDuration(project!);
      const at = playhead / speed;
      const fade = Math.min(2, total / 6);
      const gain =
        (music.fadeIn ? Math.min(1, at / Math.max(0.2, fade)) : 1) *
        (music.fadeOut ? Math.min(1, Math.max(0, total - at) / Math.max(0.2, fade)) : 1);
      pl.volume = Math.max(0, Math.min(1, music.volume * gain));

      if (playing) {
        const len = pl.duration || 0;
        const want = music.loop && len > 0.5 ? at % len : at;
        if (len > 0 && Math.abs(pl.currentTime - want) > 0.45) void pl.seekTo(Math.min(want, len - 0.05));
        pl.play();
      } else {
        pl.pause();
      }
    } catch {
      // the player is not ready yet — the next playhead tick retries
    }
  }, [project, playhead, playing]);
}
