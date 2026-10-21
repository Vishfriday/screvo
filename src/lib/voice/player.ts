import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import type { ScriptSegment } from "@/lib/types";

export interface VoiceOverSync {
  segs: ScriptSegment[];
  /** the editor playhead, in timeline seconds */
  t: number;
  playing: boolean;
  volume: number;
  muted: boolean;
}

/**
 * Plays generated voice-over in step with the playhead: the clip for the step
 * under the playhead, offset to the right point inside it. One player is
 * reused, so two lines can never talk over each other.
 */
export class VoiceOverPlayer {
  private player: AudioPlayer | null = null;
  private uri: string | null = null;

  sync({ segs, t, playing, volume, muted }: VoiceOverSync) {
    const seg = segs.find((s) => s.audioUri && t >= s.start - 0.02 && t < s.start + (s.audioDur ?? 0));
    if (!seg?.audioUri) {
      this.pause();
      return;
    }
    try {
      if (this.uri !== seg.audioUri) {
        this.uri = seg.audioUri;
        if (this.player) this.player.replace(seg.audioUri);
        else this.player = createAudioPlayer(seg.audioUri);
      }
      const pl = this.player;
      if (!pl) return;
      pl.volume = muted ? 0 : Math.max(0, Math.min(1, volume));
      const offset = Math.max(0, t - seg.start);
      if (playing) {
        if (Math.abs(pl.currentTime - offset) > 0.35) void pl.seekTo(offset);
        pl.play();
      } else {
        pl.pause();
        if (Math.abs(pl.currentTime - offset) > 0.05) void pl.seekTo(offset);
      }
    } catch {
      // the player is not ready yet — the next playhead tick retries
    }
  }

  pause() {
    try {
      this.player?.pause();
    } catch {
      // already released
    }
  }

  dispose() {
    try {
      this.player?.remove();
    } catch {
      // already released
    }
    this.player = null;
    this.uri = null;
  }
}
