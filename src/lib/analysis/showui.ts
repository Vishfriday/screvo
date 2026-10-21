import type { AnalysisStep, VideoFrame } from "./types";

/**
 * ShowUI-2B — GUI grounding for the recording.
 *
 * ShowUI is a vision-language-action model: hand it a screenshot and an
 * instruction and it returns the point on screen that instruction refers to.
 * It does not record anything; what it adds here is where each step actually
 * happens, so Touchpoints and zooms land on the real control instead of the
 * middle of the frame.
 *
 * The weights are 2B parameters, far too large to run inside the app, so this
 * talks to a server you point Screvo at (Profile → ShowUI endpoint): an HF
 * Inference Endpoint running showlab/ShowUI-2B, or any route that answers
 *
 *   POST { image: "<base64 jpeg>", query: "Tap the Send button" }
 *     -> { point: [x, y] }        // normalised 0..1, or pixels with size given
 *
 * Several response shapes are accepted, because every ShowUI deployment names
 * this differently.
 */
export const SHOWUI_MODEL = "showlab/ShowUI-2B";

export interface GroundedTouch {
  /** seconds into the video */
  t: number;
  /** normalised 0..1 inside the frame */
  x: number;
  y: number;
  /** what was pointed at, for the touchpoint label */
  label: string;
}

/** Pulls a normalised point out of whichever shape the deployment returns. */
function readPoint(body: any): { x: number; y: number } | null {
  const raw =
    body?.point ??
    body?.coordinates ??
    body?.coords ??
    body?.output ??
    body?.prediction ??
    (Array.isArray(body) ? body : null) ??
    (typeof body?.x === "number" ? [body.x, body.y] : null);

  let pair: any = raw;
  // some endpoints answer with a JSON string, or wrap the answer in a list
  if (typeof pair === "string") {
    try {
      pair = JSON.parse(pair);
    } catch {
      const nums = pair.match(/-?\d+(\.\d+)?/g);
      pair = nums ? nums.slice(0, 2).map(Number) : null;
    }
  }
  if (Array.isArray(pair) && Array.isArray(pair[0])) pair = pair[0];
  if (!Array.isArray(pair) || pair.length < 2) return null;

  let [x, y] = [Number(pair[0]), Number(pair[1])];
  if (!isFinite(x) || !isFinite(y)) return null;
  // pixels rather than a fraction — normalise against the reported frame size
  const w = Number(body?.width ?? body?.image_width ?? 0);
  const h = Number(body?.height ?? body?.image_height ?? 0);
  if (x > 1 || y > 1) {
    x = w ? x / w : x / 1000;
    y = h ? y / h : y / 1000;
  }
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** The frame closest to a moment in the video. */
function frameAt(frames: VideoFrame[], t: number): VideoFrame | undefined {
  return frames.reduce<VideoFrame | undefined>(
    (best, f) => (!best || Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best),
    undefined,
  );
}

async function groundOne(opts: {
  endpoint: string;
  token?: string;
  frame: VideoFrame;
  query: string;
}): Promise<{ x: number; y: number } | null> {
  const res = await fetch(opts.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: JSON.stringify({
      model: SHOWUI_MODEL,
      // sent under several names so one contract fits the usual deployments
      image: opts.frame.base64,
      image_base64: opts.frame.base64,
      inputs: { image: opts.frame.base64, query: opts.query },
      query: opts.query,
      instruction: opts.query,
    }),
  });
  if (!res.ok) throw new Error(`ShowUI returned ${res.status}`);
  return readPoint(await res.json());
}

/**
 * Asks ShowUI where each step's action happens. One request per step, in order;
 * a step whose point cannot be read is simply left out.
 */
export async function groundSteps(opts: {
  endpoint: string;
  token?: string;
  frames: VideoFrame[];
  steps: AnalysisStep[];
  /** at most this many requests, so a long recording cannot stall the pipeline */
  limit?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<GroundedTouch[]> {
  const steps = opts.steps.slice(0, opts.limit ?? 8);
  const out: GroundedTouch[] = [];
  let failures = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const frame = frameAt(opts.frames, step.start + 0.2);
    if (!frame) continue;
    try {
      const point = await groundOne({
        endpoint: opts.endpoint,
        token: opts.token,
        frame,
        query: step.instruction || step.name,
      });
      if (point) out.push({ t: frame.t, x: point.x, y: point.y, label: step.name });
    } catch {
      failures += 1;
      // three strikes and the endpoint is clearly not answering — stop asking
      if (failures >= 3) break;
    }
    opts.onProgress?.(i + 1, steps.length);
  }
  return out;
}
