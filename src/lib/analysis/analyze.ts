import Anthropic from "@anthropic-ai/sdk";
import type {
  AnalysisMode,
  AnalysisProgress,
  AnalysisResult,
  AnalysisStep,
  DemoBeat,
  TranscriptSegment,
  VideoFrame,
} from "./types";
import { extractFrames, fileForUpload } from "./frames";
import { groundSteps, SHOWUI_MODEL } from "./showui";
import { FileTooLargeError, transcribe } from "./transcribe";

export const ANALYSIS_MODEL = "claude-opus-5";
/**
 * Steps are detected from screen changes, so the sampling grid sets how precisely
 * a boundary can be placed: roughly one frame every 3 seconds, 8 at the low end
 * and 20 at the high end to keep vision cost and on-device decoding sane.
 */
function frameCountFor(durationSec: number): number {
  return Math.max(8, Math.min(20, Math.round(durationSec / 3)));
}

const SYSTEM = `You are the video analysis engine for Screvo, which turns a screen recording into a short vertical product demo with a step-by-step walkthrough.

You are given frames sampled at even intervals from ONE real recording, in order, each labelled with its
timestamp — plus the transcript of its audio when there is one.

Your main job is to split the recording into STEPS. A new step begins wherever the screen changes: a
different screen, a dialog opening, a panel expanding, a tab switching, a result appearing. Consecutive
frames showing the same screen in the same state belong to the SAME step — do not split them.

Describe only what is actually visible in the frames or spoken in the transcript. Never invent product
names, screens, features or steps that are not in the material. If the recording is unclear, say so
plainly in the summary rather than inventing a walkthrough.`

/** How long a product demo should run, and the arc it has to cover. */
const DEMO_TARGET_SECONDS = 60;

const DEMO_SYSTEM = `You are the video analysis engine for Screvo. From ONE real screen recording you write a product demo of about ${DEMO_TARGET_SECONDS} seconds: a crisp pitch that tells a stranger what this product is, the problem it solves, and why it is worth their time.

You are given frames sampled at even intervals, in order, each labelled with its timestamp — plus the
transcript of the audio when there is one.

A demo is a CUT, not a tour. Choose only the spans of the recording that earn their place and drop the
rest: loading, hesitation, repetition, anything that does not move the pitch forward. The beats you
choose run in the order they appear in the recording.

Write the narration as spoken marketing copy — plain, confident, specific, second person. No hype words
like "revolutionary" or "game-changing", no exclamation marks, no feature lists read out as lists.

Ground every claim in what is actually on screen or spoken. If the recording does not show what the
product is for, say that plainly in the summary instead of inventing a value proposition.`;

function buildDemoPrompt(durationSec: number, transcript: TranscriptSegment[], fileName?: string) {
  const spoken = transcript.length
    ? transcript.map((s) => `[${s.start.toFixed(1)}s] ${s.text}`).join("\n")
    : "(no audio transcript available — rely on the frames alone, and do not invent narration)";

  return `This recording is ${durationSec.toFixed(1)} seconds long${fileName ? ` (file: ${fileName})` : ""}.

TRANSCRIPT OF THE AUDIO:
${spoken}

Cut this into a product demo of about ${DEMO_TARGET_SECONDS} seconds, then reply with ONLY a JSON object,
no prose and no code fence, in exactly this shape:

{
  "title": "the product's name if visible, otherwise a short name for this demo",
  "summary": "one sentence a stranger could repeat: what this is and who it helps",
  "beats": [{ "name": "Hook", "start": 0, "end": 6, "script": "the line spoken over this beat" }],
  "keyMoments": [{ "t": 0, "label": "what happens here" }],
  "recommendations": [{ "title": "...", "detail": "..." }]
}

Rules:
- 4 to 7 beats, covering this arc in order: the hook, the problem it solves, the product's answer,
  how it works in practice, and the payoff. Name each beat for its job in that arc.
- "start" and "end" are seconds in THIS recording and must satisfy 0 <= start < end <= ${durationSec.toFixed(1)}.
- Beats must not overlap, and must appear in ascending order.
- Each beat runs between 4 and 15 seconds, and the beats together should total close to
  ${DEMO_TARGET_SECONDS} seconds — never more than ${Math.round(DEMO_TARGET_SECONDS * 1.25)}.
- "script" is read aloud over that beat: roughly 2.5 words per second of that beat's length, so a
  7 second beat takes about 17 words. Write whole sentences.
- Up to 5 keyMoments — instants worth pushing in on, in source time.
- 2 to 4 recommendations: concrete edits that would make THIS demo land harder.`;
}

function buildPrompt(durationSec: number, transcript: TranscriptSegment[], fileName?: string) {
  const spoken = transcript.length
    ? transcript.map((s) => `[${s.start.toFixed(1)}s] ${s.text}`).join("\n")
    : "(no audio transcript available — rely on the frames alone, and do not invent narration)";

  return `This recording is ${durationSec.toFixed(1)} seconds long${fileName ? ` (file: ${fileName})` : ""}.

TRANSCRIPT OF THE AUDIO:
${spoken}

Split the recording into steps at each screen change, then reply with ONLY a JSON object, no prose and
no code fence, in exactly this shape:

{
  "title": "short name for this walkthrough, from its actual content",
  "summary": "two sentences describing what actually happens",
  "steps": [{ "name": "short step name", "start": 0, "instruction": "one line of narration for this step" }],
  "keyMoments": [{ "t": 0, "label": "what happens here" }],
  "recommendations": [{ "title": "...", "detail": "..." }]
}

Rules:
- One step per distinct screen or state, in the order they appear, between 3 and 12 steps.
- "start" must be the timestamp of the FIRST frame that shows that screen. The first step starts at 0.
- Name a step imperatively where the user acts ("Open the billing panel") and descriptively where the
  app responds ("Invoice preview loads").
- "instruction" is spoken aloud over that step, so write it to be read.
- Up to 5 keyMoments — instants worth zooming into, such as a click landing or a result appearing.
- 2 to 4 recommendations: concrete edits that would improve THIS video.
- Every timestamp must be between 0 and ${durationSec.toFixed(1)}.`;
}

function parseJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/** Clamps whatever came back into something the editor can render safely. */
export function normalizeResult(raw: any, durationSec: number): AnalysisResult {
  const clamp = (n: any, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(n) || 0));
  const str = (v: any, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);

  let steps: AnalysisStep[] = (Array.isArray(raw?.steps) ? raw.steps : [])
    .map((x: any) => ({
      name: str(x?.name, "Step"),
      start: clamp(x?.start, 0, durationSec),
      instruction: str(x?.instruction),
    }))
    .sort((a: AnalysisStep, b: AnalysisStep) => a.start - b.start)
    .slice(0, 12);

  // drop steps that landed on top of each other — a boundary needs room to be a step
  steps = steps.filter((x, i) => i === 0 || x.start - steps[i - 1].start >= 0.75);

  if (!steps.length) {
    steps = [{ name: "Full recording", start: 0, instruction: str(raw?.summary) }];
  }
  steps[0].start = 0;

  return {
    title: str(raw?.title, "Untitled recording"),
    summary: str(raw?.summary, "No summary was returned for this recording."),
    steps,
    keyMoments: (Array.isArray(raw?.keyMoments) ? raw.keyMoments : [])
      .map((m: any) => ({ t: clamp(m?.t, 0, durationSec), label: str(m?.label, "Key moment") }))
      .slice(0, 5),
    recommendations: (Array.isArray(raw?.recommendations) ? raw.recommendations : [])
      .map((r: any) => ({ title: str(r?.title), detail: str(r?.detail) }))
      .filter((r: any) => r.title)
      .slice(0, 4),
  };
}

/** Clamps the demo cut into beats the editor can actually assemble. */
export function normalizeDemo(raw: any, durationSec: number): AnalysisResult {
  const num = (n: any) => (Number.isFinite(Number(n)) ? Number(n) : 0);
  const str = (v: any, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);

  let beats: DemoBeat[] = (Array.isArray(raw?.beats) ? raw.beats : [])
    .map((b: any) => {
      const start = Math.max(0, Math.min(durationSec, num(b?.start)));
      const end = Math.max(0, Math.min(durationSec, num(b?.end)));
      return { name: str(b?.name, "Beat"), start, end, script: str(b?.script) };
    })
    .filter((b: DemoBeat) => b.end - b.start >= 1)
    .sort((a: DemoBeat, b: DemoBeat) => a.start - b.start);

  // a beat that runs into the next one would make the cut jump backwards
  beats = beats.filter((b, i) => i === 0 || b.start >= beats[i - 1].end - 0.01).slice(0, 7);

  if (!beats.length) {
    beats = [
      {
        name: "The recording",
        start: 0,
        end: Math.min(durationSec, DEMO_TARGET_SECONDS),
        script: str(raw?.summary),
      },
    ];
  }

  return {
    title: str(raw?.title, "Product demo"),
    summary: str(raw?.summary, "No summary was returned for this recording."),
    // the editor still thinks in steps, so each beat is one
    steps: beats.map((b) => ({ name: b.name, start: b.start, instruction: b.script })),
    beats,
    keyMoments: (Array.isArray(raw?.keyMoments) ? raw.keyMoments : [])
      .map((m: any) => ({ t: Math.max(0, Math.min(durationSec, num(m?.t))), label: str(m?.label, "Key moment") }))
      .slice(0, 5),
    recommendations: (Array.isArray(raw?.recommendations) ? raw.recommendations : [])
      .map((r: any) => ({ title: str(r?.title), detail: str(r?.detail) }))
      .filter((r: any) => r.title)
      .slice(0, 4),
  };
}

async function callClaude(
  apiKey: string,
  frames: VideoFrame[],
  transcript: TranscriptSegment[],
  durationSec: number,
  mode: AnalysisMode,
  fileName?: string,
): Promise<AnalysisResult> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
  });

  const content: Anthropic.ContentBlockParam[] = [];
  for (const f of frames) {
    content.push({ type: "text", text: `Frame at ${f.t.toFixed(1)}s:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: f.base64 },
    });
  }
  const demo = mode === "demo";
  content.push({
    type: "text",
    text: demo
      ? buildDemoPrompt(durationSec, transcript, fileName)
      : buildPrompt(durationSec, transcript, fileName),
  });

  const res = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 16000,
    system: demo ? DEMO_SYSTEM : SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (res.stop_reason === "refusal") {
    throw new Error("The model declined to analyse this recording");
  }
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const raw = parseJson(text);
  return demo ? normalizeDemo(raw, durationSec) : normalizeResult(raw, durationSec);
}

/**
 * The real pipeline: frames out of the video, speech out of the audio, then one
 * Claude Opus call that reasons over both.
 */
export async function runAnalysis(opts: {
  uri: string;
  durationSec: number;
  anthropicKey: string;
  sttKey?: string;
  /** a ShowUI server, for real touchpoint placement */
  showuiUrl?: string;
  showuiToken?: string;
  /** a walkthrough tutorial by default, or a short product demo */
  mode?: AnalysisMode;
  fileName?: string;
  onProgress?: (p: AnalysisProgress) => void;
}): Promise<{ result: AnalysisResult; transcript: TranscriptSegment[]; notes: string[] }> {
  const notes: string[] = [];
  const progress = opts.onProgress ?? (() => {});

  progress({ stage: "frames", note: "Sampling frames to find screen changes" });
  const frames = await extractFrames(opts.uri, frameCountFor(opts.durationSec), opts.durationSec);

  let transcript: TranscriptSegment[] = [];
  if (opts.sttKey) {
    progress({ stage: "transcribe", note: "Transcribing the audio" });
    try {
      const file = await fileForUpload(opts.uri);
      transcript = await transcribe(file, opts.sttKey);
    } catch (e) {
      notes.push(
        e instanceof FileTooLargeError
          ? "Recording too large to transcribe — analysed the picture only"
          : "Transcription failed — analysed the picture only",
      );
    }
  } else {
    notes.push("No transcription key — analysed the picture only");
  }

  const mode: AnalysisMode = opts.mode ?? "walkthrough";
  progress({
    stage: "reasoning",
    note:
      mode === "demo"
        ? `${ANALYSIS_MODEL} is cutting a one-minute demo`
        : `${ANALYSIS_MODEL} is splitting it into steps`,
  });
  const result = await callClaude(opts.anthropicKey, frames, transcript, opts.durationSec, mode, opts.fileName);

  if (opts.showuiUrl) {
    progress({ stage: "grounding", note: `${SHOWUI_MODEL} is locating each step on screen` });
    try {
      const touches = await groundSteps({
        endpoint: opts.showuiUrl,
        token: opts.showuiToken,
        frames,
        steps: result.steps,
        onProgress: (done, total) =>
          progress({ stage: "grounding", note: `Locating step ${done} of ${total} on screen` }),
      });
      if (touches.length) result.touches = touches;
      else notes.push("ShowUI found no control to point at — touchpoints left centred");
    } catch {
      notes.push("ShowUI endpoint did not answer — touchpoints left centred");
    }
  } else {
    notes.push("No ShowUI endpoint — touchpoints left centred");
  }

  progress({ stage: "assembling", note: "Building your timeline" });
  return { result, transcript, notes };
}
