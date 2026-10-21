import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { VoiceOverPlayer } from "@/lib/voice/player";

/**
 * Keeps the generated voice-over in step with the preview: it starts when the
 * playhead reaches a step that has a clip, follows scrubbing, and stops with
 * the editor.
 */
export function useVoiceOver() {
  const ref = useRef<VoiceOverPlayer | null>(null);
  const project = useStore((s) => s.editing());
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);

  useEffect(() => {
    ref.current = new VoiceOverPlayer();
    return () => {
      ref.current?.dispose();
      ref.current = null;
    };
  }, []);

  useEffect(() => {
    if (!project) {
      ref.current?.pause();
      return;
    }
    ref.current?.sync({
      segs: project.script,
      t: playhead,
      playing,
      volume: project.voice.volume ?? 1,
      muted: !!project.voice.muted,
    });
  }, [project, playhead, playing]);
}
