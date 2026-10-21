import { File, Paths } from "expo-file-system";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { kokoroVoiceFor } from "./voices";

/**
 * Voice-over synthesis with Kokoro-82M. The 82M ONNX model runs in-process in
 * the browser build, but a React Native app has no ONNX runtime in Expo Go, so
 * on device Screvo talks to a Kokoro server instead: any OpenAI-compatible
 * `/v1/audio/speech` route serving Kokoro, such as Kokoro-FastAPI. Set it in
 * Profile → Kokoro endpoint.
 */
export const KOKORO_MODEL = "hexgrad/Kokoro-82M";

/** Where Kokoro-FastAPI listens by default, offered as the placeholder. */
export const KOKORO_DEFAULT_ENDPOINT = "http://localhost:8880/v1/audio/speech";

export { kokoroVoiceFor };

/** Nothing runs locally here, so the model is never resident. */
export function kokoroReady(): boolean {
  return false;
}

export interface SpeechClip {
  uri: string;
  duration: number;
}

export class VoiceSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceSetupError";
  }
}

/** Synthesises one line on the configured Kokoro server and caches the file. */
export async function synthesizeSpeech(opts: {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
  endpoint?: string;
  apiKey?: string;
  onProgress?: (pct: number) => void;
}): Promise<SpeechClip> {
  if (!opts.text.trim()) throw new VoiceSetupError("There is nothing to say in this step");
  if (!opts.endpoint) {
    throw new VoiceSetupError("Add a Kokoro endpoint in Profile to generate voice-over on this device");
  }
  const res = await fetch(opts.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: "kokoro",
      voice: kokoroVoiceFor(opts.voice, opts.language),
      input: opts.text,
      speed: Math.min(2, Math.max(0.5, opts.speed ?? 1)),
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Kokoro server returned ${res.status} ${detail.slice(0, 160)}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const name = `vo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`;
  // the document directory, not the cache: a cached clip disappears the next
  // time Android reclaims storage, taking the step's voice-over with it
  const file = new File(Paths.document, name);
  file.create({ overwrite: true });
  file.write(bytes);
  return { uri: file.uri, duration: 0 };
}

/**
 * Measures a generated clip so the timeline can show its real length. Falls
 * back to the estimate when the player never reports a duration.
 */
export async function clipDuration(uri: string, fallback: number): Promise<number> {
  let probe: AudioPlayer | null = null;
  try {
    probe = createAudioPlayer(uri);
    for (let i = 0; i < 24; i += 1) {
      if (probe.isLoaded && probe.duration > 0) return Math.max(0.4, probe.duration);
      await new Promise((r) => setTimeout(r, 120));
    }
  } catch {
    // fall through to the estimate
  } finally {
    try {
      probe?.remove();
    } catch {
      // already released
    }
  }
  return Math.max(0.4, fallback);
}

let current: AudioPlayer | null = null;

/** Plays a generated clip, stopping whichever clip was playing before it. */
export function playClip(uri: string): Promise<void> {
  try {
    current?.remove();
  } catch {
    // the previous player was already released
  }
  current = null;
  try {
    const player = createAudioPlayer(uri);
    current = player;
    player.play();
  } catch {
    // playback is a convenience — a failure here must not break the panel
  }
  return Promise.resolve();
}
