import { requireOptionalNativeModule } from "expo";

/**
 * In-app screen recording. The native side only exists in a development or
 * release build of Screvo — in Expo Go `native` is null and the app falls back
 * to importing a clip the phone's own recorder made.
 */
/** Noise cancellation settings, as the native side expects them. */
export interface DenoiseOptions {
  enabled: boolean;
  strength: number;
  highPass: boolean;
  gate: boolean;
}

/** What the exporter should do beyond copying the spans. */
export interface ExportOptions {
  /** the recording's own sound: how loud it sits, and how hard it is cleaned */
  audio?: DenoiseOptions & { sourceVolume: number };
  /** 1 writes the footage unchanged; 2–5 rewrite the timestamps so it plays faster */
  speed?: number;
  /** a bed mixed in under the narration */
  music?: {
    uri: string;
    volume: number;
    loop: boolean;
    fadeIn: boolean;
    fadeOut: boolean;
  };
}

interface ScrevoScreenCaptureModule {
  isAvailable(): boolean;
  isRecording(): boolean;
  start(withAudio: boolean, longEdge: number): Promise<{ uri: string; width: number; height: number }>;
  stop(): Promise<{ uri: string; durationSec: number }>;
  exportCut(
    sourceUri: string,
    spans: { start: number; end: number }[],
    voice: { uri: string; at: number }[],
    options: ExportOptions,
  ): Promise<{ uri: string; bytes: number }>;
  denoisePreview(
    sourceUri: string,
    atSec: number,
    lengthSec: number,
    settings: DenoiseOptions,
  ): Promise<{ uri: string; durationSec: number }>;
  saveToGallery(fileUri: string, displayName: string): Promise<{ uri: string }>;
}

const native = requireOptionalNativeModule<ScrevoScreenCaptureModule>("ScrevoScreenCapture");

/** Whether this build can record the screen itself. */
export function canCaptureScreen(): boolean {
  try {
    return !!native?.isAvailable();
  } catch {
    return false;
  }
}

export function isCapturing(): boolean {
  try {
    return !!native?.isRecording();
  } catch {
    return false;
  }
}

export class CaptureUnsupportedError extends Error {
  constructor() {
    super("This build of Screvo cannot record the screen — use a development build");
    this.name = "CaptureUnsupportedError";
  }
}

/**
 * Asks for the system permission and starts recording. Resolves once rolling,
 * with the picture size the recorder actually settled on — which can be smaller
 * than `longEdge` asked for, since a capture cannot exceed the display.
 */
export async function startScreenCapture(
  withAudio = true,
  longEdge = 1920,
): Promise<{ uri: string; width: number; height: number }> {
  if (!native) throw new CaptureUnsupportedError();
  try {
    return await native.start(withAudio, longEdge);
  } catch (e) {
    // A build made before the quality setting existed takes one argument and
    // rejects two. That refusal happens before Android is ever asked for
    // permission, so retrying cannot show the user a second dialog.
    if (!isArgumentMismatch(e)) throw e;
    const legacy = await (native.start as unknown as (a: boolean) => Promise<{ uri: string }>)(withAudio);
    return { ...legacy, width: 0, height: 0 };
  }
}

/**
 * Whether a rejection is the native module refusing the shape of the call
 * rather than failing to do the work — which is what an app running newer
 * JavaScript than its own native half looks like.
 */
function isArgumentMismatch(e: unknown): boolean {
  const message = (e as { message?: string })?.message ?? "";
  return /argument|received \d+ arguments|mismatch|expected/i.test(message);
}

/** Stops recording and returns the finished file. */
export async function stopScreenCapture(): Promise<{ uri: string; durationSec: number }> {
  if (!native) throw new CaptureUnsupportedError();
  return native.stop();
}

/**
 * Writes the given spans of a recording into one new MP4, copying samples
 * rather than re-encoding, and returns the file it produced.
 */
export async function exportCut(
  sourceUri: string,
  spans: { start: number; end: number }[],
  voice: { uri: string; at: number }[] = [],
  options: ExportOptions = {},
): Promise<{ uri: string; bytes: number }> {
  if (!native) throw new CaptureUnsupportedError();
  try {
    return await native.exportCut(sourceUri, spans, voice, options);
  } catch (e) {
    if (!isArgumentMismatch(e)) throw e;
    // an older build still writes the cut and the narration; it just cannot
    // retime it or mix in music, so the caller is told what was left out
    if (options.speed && options.speed !== 1) throw new ExportFeatureMissingError("speed changes");
    if (options.music) throw new ExportFeatureMissingError("background music");
    if (options.audio?.enabled) throw new ExportFeatureMissingError("noise cancellation");
    return (native.exportCut as unknown as (
      a: string,
      b: { start: number; end: number }[],
      c: { uri: string; at: number }[],
    ) => Promise<{ uri: string; bytes: number }>)(sourceUri, spans, voice);
  }
}

/** This app's native half predates something the edit asks for. */
export class ExportFeatureMissingError extends Error {
  constructor(what: string) {
    super(`This build of Screvo cannot write ${what} yet — rebuild the app to export it`);
    this.name = "ExportFeatureMissingError";
  }
}

/**
 * Renders a few seconds of the recording's own sound with the cleaning applied,
 * as a WAV the editor can play. Noise reduction is impossible to judge from a
 * slider, so the panel lets you hear it against the raw take.
 */
export async function denoisePreview(
  sourceUri: string,
  atSec: number,
  lengthSec: number,
  settings: DenoiseOptions,
): Promise<{ uri: string; durationSec: number }> {
  if (!native) throw new CaptureUnsupportedError();
  if (typeof native.denoisePreview !== "function") {
    throw new ExportFeatureMissingError("a noise-cancellation preview");
  }
  return native.denoisePreview(sourceUri, atSec, lengthSec, settings);
}

/** Whether this build can clean a recording's sound. */
export function canDenoise(): boolean {
  try {
    return typeof native?.denoisePreview === "function";
  } catch {
    return false;
  }
}

/** Puts a finished file in the device's media library, where Photos will see it. */
export async function saveToGallery(fileUri: string, displayName: string): Promise<{ uri: string }> {
  if (!native) throw new CaptureUnsupportedError();
  return native.saveToGallery(fileUri, displayName);
}

/** Whether this build can write into the gallery. */
export function canSaveToGallery(): boolean {
  try {
    return typeof native?.saveToGallery === "function";
  } catch {
    return false;
  }
}

/** Whether this build can write a cut as its own file. */
export function canExportCut(): boolean {
  try {
    return typeof native?.exportCut === "function";
  } catch {
    return false;
  }
}
