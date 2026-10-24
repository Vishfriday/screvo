/**
 * Screen recording in a browser.
 *
 * The native module is Android's MediaProjection, which obviously cannot run on
 * the web — so the web build used to fall back to "record it with your phone
 * and import the file", which reads like the feature is broken when the browser
 * can record the screen perfectly well itself.
 *
 * This is the same API backed by `getDisplayMedia` and `MediaRecorder`. What it
 * cannot do is the parts that are genuinely native: cutting an MP4 by copying
 * samples, mixing an AAC track, and writing to the phone's gallery. Those throw
 * a clear error rather than pretending, exactly as an out-of-date Android build
 * does.
 */

export interface ExportOptions {
  speed?: number;
  audio?: { sourceVolume: number; enabled: boolean; strength: number; highPass: boolean; gate: boolean };
  music?: { uri: string; volume: number; loop: boolean; fadeIn: boolean; fadeOut: boolean };
}

export class CaptureUnsupportedError extends Error {
  constructor(message = "This browser cannot record the screen") {
    super(message);
    this.name = "CaptureUnsupportedError";
  }
}

export class ExportFeatureMissingError extends Error {
  constructor(what: string) {
    super(`${what} needs the Android app — a browser cannot do it`);
    this.name = "ExportFeatureMissingError";
  }
}

const displayMedia = (): MediaDevices | null => {
  if (typeof navigator === "undefined") return null;
  const md = navigator.mediaDevices as MediaDevices | undefined;
  return md && typeof (md as any).getDisplayMedia === "function" ? md : null;
};

/** Desktop browsers can share a screen; mobile ones almost universally cannot. */
export function canCaptureScreen(): boolean {
  return !!displayMedia() && typeof MediaRecorder !== "undefined";
}

let recorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let stream: MediaStream | null = null;
let startedAt = 0;

export function isCapturing(): boolean {
  return !!recorder && recorder.state === "recording";
}

/** The first type the browser will actually encode — Safari and Chrome differ. */
function pickMimeType(): string | undefined {
  const wanted = [
    "video/mp4;codecs=h264",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return wanted.find((t) => MediaRecorder.isTypeSupported?.(t));
}

export async function startScreenCapture(
  withAudio = true,
  _longEdge = 1920,
): Promise<{ uri: string; width: number; height: number }> {
  const md = displayMedia();
  if (!md) throw new CaptureUnsupportedError();
  if (isCapturing()) throw new CaptureUnsupportedError("A recording is already running");

  // the browser shows its own picker here, so there is no quality to request —
  // what comes back is whatever surface the user chose
  stream = await (md as any).getDisplayMedia({ video: { frameRate: 30 }, audio: withAudio });
  const track = stream!.getVideoTracks()[0];
  const settings = track?.getSettings?.() ?? {};

  // the user can stop sharing from the browser's own banner
  track?.addEventListener("ended", () => {
    try {
      if (recorder?.state === "recording") recorder.stop();
    } catch {
      // already stopped
    }
  });

  chunks = [];
  const mimeType = pickMimeType();
  recorder = new MediaRecorder(stream!, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.start(1000);
  startedAt = Date.now();

  return {
    uri: "",
    width: Math.round((settings as any).width ?? 0),
    height: Math.round((settings as any).height ?? 0),
  };
}

export async function stopScreenCapture(): Promise<{ uri: string; durationSec: number }> {
  const active = recorder;
  if (!active) throw new CaptureUnsupportedError("Nothing is being recorded");

  const blob = await new Promise<Blob>((resolve) => {
    active.onstop = () => resolve(new Blob(chunks, { type: active.mimeType || "video/webm" }));
    if (active.state === "recording") active.stop();
    else resolve(new Blob(chunks, { type: active.mimeType || "video/webm" }));
  });

  stream?.getTracks().forEach((t) => t.stop());
  const durationSec = Math.max(1, (Date.now() - startedAt) / 1000);
  recorder = null;
  stream = null;
  chunks = [];

  // an object URL lives as long as the tab, which is as long as the project
  // being edited does on the web
  return { uri: URL.createObjectURL(blob), durationSec };
}

// ---- the genuinely native parts, which say so rather than misbehaving -------

export function canExportCut(): boolean {
  return false;
}

export async function exportCut(
  _sourceUri: string,
  _spans: { start: number; end: number }[],
  _voice: { uri: string; at: number }[] = [],
  _options: ExportOptions = {},
): Promise<{ uri: string; bytes: number }> {
  throw new ExportFeatureMissingError("Writing the cut");
}

export function canSaveToGallery(): boolean {
  return false;
}

export async function saveToGallery(_fileUri: string, _displayName: string): Promise<{ uri: string }> {
  throw new ExportFeatureMissingError("Saving to the gallery");
}

export function canDenoise(): boolean {
  return false;
}

export async function denoisePreview(
  _sourceUri: string,
  _atSec: number,
  _lengthSec: number,
  _settings: { enabled: boolean; strength: number; highPass: boolean; gate: boolean },
): Promise<{ uri: string; durationSec: number }> {
  throw new ExportFeatureMissingError("Noise cancellation");
}
