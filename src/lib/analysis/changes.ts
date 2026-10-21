import * as VideoThumbnails from "expo-video-thumbnails";
import { File } from "expo-file-system";
import * as jpeg from "jpeg-js";
import type { AnalysisResult, AnalysisStep } from "./types";

/**
 * Screen-change detection, on the device, with no model and no API key.
 *
 * Steps in a walkthrough begin where the screen changes, so this samples the
 * recording, reduces each frame to a small grayscale signature, and cuts a new
 * step wherever consecutive signatures stop resembling each other. Everything
 * runs locally: `expo-video-thumbnails` pulls the stills and `jpeg-js` decodes
 * them in JavaScript, so nothing leaves the phone.
 */

/** the signature grid — coarse enough to ignore cursors, fine enough to see a new screen */
const GRID_W = 24;
const GRID_H = 48;

/** roughly one sample per this many seconds, within the frame budget */
const SECONDS_PER_SAMPLE = 1.5;
const MIN_FRAMES = 6;
const MAX_FRAMES = 40;

/** two steps closer together than this are the same step */
const MIN_STEP_GAP = 2.5;

/** no walkthrough needs more boundaries than this */
const MAX_STEPS = 12;

type Signature = Uint8Array;

function signatureOf(raw: { width: number; height: number; data: Uint8Array }): Signature {
  const sig = new Uint8Array(GRID_W * GRID_H);
  for (let gy = 0; gy < GRID_H; gy += 1) {
    for (let gx = 0; gx < GRID_W; gx += 1) {
      // average four points per cell so one stray pixel cannot move the signature
      let total = 0;
      for (let s = 0; s < 4; s += 1) {
        const fx = (gx + (s % 2 === 0 ? 0.3 : 0.7)) / GRID_W;
        const fy = (gy + (s < 2 ? 0.3 : 0.7)) / GRID_H;
        const x = Math.min(raw.width - 1, Math.floor(fx * raw.width));
        const y = Math.min(raw.height - 1, Math.floor(fy * raw.height));
        const i = (y * raw.width + x) * 4;
        // Rec. 601 luma, in integers
        total += (raw.data[i] * 77 + raw.data[i + 1] * 151 + raw.data[i + 2] * 28) >> 8;
      }
      sig[gy * GRID_W + gx] = total >> 2;
    }
  }
  return sig;
}

/** mean absolute difference between two signatures, 0 (identical) to 1 */
function distance(a: Signature, b: Signature): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
}

export interface SampledFrame {
  t: number;
  sig: Signature;
}

/** Reads the recording and reduces each sampled frame to its signature. */
export async function sampleSignatures(opts: {
  uri: string;
  durationSec: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<SampledFrame[]> {
  const count = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Math.round(opts.durationSec / SECONDS_PER_SAMPLE)));
  const out: SampledFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = Math.max(0, Math.min(opts.durationSec - 0.1, (i / Math.max(1, count - 1)) * opts.durationSec));
    try {
      const shot = await VideoThumbnails.getThumbnailAsync(opts.uri, { time: t * 1000, quality: 0.5 });
      const bytes = new Uint8Array(await new File(shot.uri).arrayBuffer());
      // useTArray keeps the decoder off Node's Buffer, which React Native lacks
      const raw = jpeg.decode(bytes, { useTArray: true });
      out.push({ t, sig: signatureOf(raw) });
      try {
        new File(shot.uri).delete();
      } catch {
        // the thumbnail is in the cache; leaving it costs nothing
      }
    } catch {
      // a frame the decoder refuses is skipped rather than failing the run
    }
    opts.onProgress?.(i + 1, count);
  }
  return out;
}

/** The times where the screen changed enough to start a new step. */
export function cutsFrom(frames: SampledFrame[]): number[] {
  if (frames.length < 3) return [];
  const diffs: { t: number; d: number }[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    diffs.push({ t: frames[i].t, d: distance(frames[i - 1].sig, frames[i].sig) });
  }

  // a threshold from the recording itself: most frames are "no change", so the
  // median is the noise floor and a real change stands well above it
  const sorted = diffs.map((x) => x.d).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const spread =
    diffs.reduce((acc, x) => acc + Math.abs(x.d - median), 0) / Math.max(1, diffs.length);
  const threshold = Math.max(0.04, median + Math.max(0.025, spread * 2.5));

  // An app switch animates, so it lifts two or three frames in a row above the
  // threshold. Each run of raised frames is one change: keep its peak and drop
  // the rest, or every transition would cut twice and leave a phantom step.
  const peaks: { t: number; d: number }[] = [];
  let run: { t: number; d: number }[] = [];
  const flush = () => {
    if (!run.length) return;
    peaks.push(run.reduce((best, x) => (x.d > best.d ? x : best), run[0]));
    run = [];
  };
  for (const entry of diffs) {
    if (entry.d >= threshold) run.push(entry);
    else flush();
  }
  flush();

  const cuts: number[] = [];
  for (const { t } of peaks) {
    if (t < MIN_STEP_GAP) continue; // the opening step owns the start
    if (cuts.length && t - cuts[cuts.length - 1] < MIN_STEP_GAP) continue;
    cuts.push(Math.round(t * 100) / 100);
  }

  if (cuts.length <= MAX_STEPS) return cuts;
  // too many: keep the strongest changes, then put them back in order
  const byStrength = peaks
    .filter((x) => cuts.includes(Math.round(x.t * 100) / 100))
    .sort((a, b) => b.d - a.d)
    .slice(0, MAX_STEPS)
    .map((x) => Math.round(x.t * 100) / 100);
  return byStrength.sort((a, b) => a - b);
}

/** Turns change points into steps, named by position since nothing described them. */
export function stepsFromCuts(cuts: number[]): AnalysisStep[] {
  const starts = [0, ...cuts];
  return starts.map((start, i) => ({
    name: i === 0 ? "Opening screen" : `Step ${i + 1}`,
    start,
    // left blank on purpose: a screen change says where a step begins, not what
    // it does — narration needs a model, and inventing it here would be a lie
    instruction: "",
  }));
}

/**
 * The whole local pass: sample, compare, and return a result shaped exactly
 * like the one Claude produces, so the store applies it the same way.
 */
export async function analyseLocally(opts: {
  uri: string;
  durationSec: number;
  onProgress?: (note: string) => void;
}): Promise<{ result: AnalysisResult; frames: number; cuts: number[] }> {
  opts.onProgress?.("Sampling the recording");
  const frames = await sampleSignatures({
    uri: opts.uri,
    durationSec: opts.durationSec,
    onProgress: (done, total) => opts.onProgress?.(`Reading frame ${done} of ${total}`),
  });
  if (frames.length < 3) throw new Error("This recording was too short to split into steps");

  opts.onProgress?.("Looking for screen changes");
  const cuts = cutsFrom(frames);
  const steps = stepsFromCuts(cuts);

  return {
    result: {
      // left empty so the project keeps the name it already has
      title: "",
      summary: `${steps.length} step${steps.length === 1 ? "" : "s"} found by watching for screen changes across ${frames.length} sampled frames. Add an Anthropic key in Profile to have Claude name and narrate them.`,
      steps,
      keyMoments: [],
      recommendations: [],
    },
    frames: frames.length,
    cuts,
  };
}
