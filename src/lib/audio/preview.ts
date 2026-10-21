import { createAudioPlayer, type AudioPlayer } from "expo-audio";

/**
 * Audition playback for a short piece of audio — the music bed in the Music
 * panel, the cleaned sample in the Noise panel.
 *
 * One player, replaced rather than stacked, so tapping between two things to
 * compare never leaves both of them playing at once.
 */

let player: AudioPlayer | null = null;

export async function previewAudio(uri: string, loop = true): Promise<void> {
  await stopPreview();
  try {
    player = createAudioPlayer(uri);
    player.loop = loop;
    player.volume = 0.7;
    player.play();
  } catch {
    // auditioning is a convenience — a failure here must not break the panel
    player = null;
  }
}

export async function stopPreview(): Promise<void> {
  try {
    player?.remove();
  } catch {
    // already released
  }
  player = null;
}
