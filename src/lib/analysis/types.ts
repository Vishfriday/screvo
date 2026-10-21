/** One line of real speech, with the timing the STT service reported. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/** A still pulled out of the real video, handed to Claude as an image. */
export interface VideoFrame {
  /** seconds into the video */
  t: number;
  /** base64 JPEG, no data: prefix */
  base64: string;
}

/** What Screvo is making: a step-by-step tutorial, or a short product pitch. */
export type AnalysisMode = "walkthrough" | "demo";

/**
 * One beat of a product demo. Unlike a walkthrough step it names a span of the
 * recording worth showing, because a demo is a cut — the dull parts are dropped.
 */
export interface DemoBeat {
  /** the arc position: Hook, Problem, Solution, Proof, Close… */
  name: string;
  /** seconds into the SOURCE recording */
  start: number;
  end: number;
  /** the line spoken over this beat */
  script: string;
}

/** One step of the walkthrough — a new one begins wherever the screen changes. */
export interface AnalysisStep {
  /** imperative where the user acts, descriptive where the app responds */
  name: string;
  /** seconds into the video where this screen first appears */
  start: number;
  /** the narration / caption line for this step */
  instruction: string;
}

/** What Claude returns after looking at the frames and reading the transcript. */
export interface AnalysisResult {
  title: string;
  summary: string;
  steps: AnalysisStep[];
  /** moments worth pushing in on — used for automatic zooms */
  keyMoments: { t: number; label: string }[];
  /** where each step's action lands on screen, when ShowUI grounded it */
  touches?: { t: number; x: number; y: number; label: string }[];
  /** the demo cut, when this was analysed as a product demo */
  beats?: DemoBeat[];
  recommendations: { title: string; detail: string }[];
}

/** Platform-specific handle to the media file, built by frames.ts and consumed by transcribe.ts. */
export interface UploadFile {
  name: string;
  size: number;
  [key: string]: any;
}

export type AnalysisStage =
  | "frames"
  | "transcribe"
  | "reasoning"
  | "grounding"
  | "assembling";

export interface AnalysisProgress {
  stage: AnalysisStage;
  note?: string;
}
