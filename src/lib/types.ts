// ---------------------------------------------------------------------------
// Screvo domain model
// ---------------------------------------------------------------------------

export type ProjectStatus = "draft" | "processing" | "ready" | "published" | "shared";

export interface Touchpoint {
  id: string;
  /** normalized 0..1 within the 9:16 frame */
  x: number;
  y: number;
  /** seconds from project start */
  t: number;
  label?: string;
  /** was this touch promoted into a key moment by the AI */
  key?: boolean;
}

export type TrackKind = "video" | "audio" | "subtitles" | "effects" | "animations";

export interface Clip {
  id: string;
  track: TrackKind;
  start: number; // seconds on the timeline
  duration: number; // seconds
  label: string;
  /** source frame index for thumbnails (into the demo frame set) */
  frame?: number;
  speed?: number; // 1 = normal
  volume?: number; // 0..1
  color?: string;
  /** effect payload for effects/animations/subtitle tracks */
  meta?: Record<string, any>;
}

export interface Chapter {
  id: string;
  name: string;
  start: number;
  duration: number;
  frame: number;
  summary?: string;
}

export type EffectType =
  | "touchpoint"
  | "zoom"
  | "parallax"
  | "transition"
  | "tint"
  | "cta"
  | "text"
  | "effect"
  | "animation";

export interface Effect {
  id: string;
  type: EffectType;
  start: number;
  duration: number;
  /** normalized focal point when relevant */
  x?: number;
  y?: number;
  params: Record<string, any>;
  label: string;
}

export interface SubtitleCue {
  id: string;
  start: number;
  duration: number;
  text: string;
  orientation: "horizontal" | "vertical";
  position: string; // e.g. "bottom", "center-left"
  animation: string; // e.g. "typewriter"
  highlight: {
    enabled: boolean;
    auto: boolean;
    color: string;
    style: string; // rounded | marker | pill | underline | glow | soft
    opacity: number;
    radius: number;
    padding: number;
  };
}

/** An opening card drawn over the first seconds of the video. */
export interface Intro {
  /** which template draws it — see `src/data/intros.ts` */
  template: string;
  title: string;
  subtitle: string;
  /** how long the card stays up, in seconds */
  duration: number;
  accent: string;
}

/** Noise cancellation for the recording's own sound. */
export interface Denoise {
  enabled: boolean;
  /** 0 = barely touch it, 1 = as hard as it goes before artefacts creep in */
  strength: number;
  /** takes out desk rumble below the range a voice uses */
  highPass: boolean;
  /** pushes the gaps between phrases further down */
  gate: boolean;
}

/** What the recording's own audio does in the finished video. */
export interface AudioSettings {
  /** 0..1; 0 drops the room entirely and leaves only narration and music */
  sourceVolume: number;
  denoise: Denoise;
}

/** The music bed that plays under the narration. */
export interface MusicBed {
  uri: string;
  name: string;
  /** where the track came from; "stock" only appears in projects made before
   *  Screvo dropped its generated beds, and still plays from its saved file */
  source: "device" | "stock";
  /** 0..1, well under the narration by default */
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
  /** repeats the bed until the video ends */
  loop: boolean;
}

export interface ScriptSegment {
  id: string;
  chapterId: string;
  text: string;
  start: number;
  /** generated voice-over clip for this step, when one has been made */
  audioUri?: string;
  /** that clip's measured length in seconds */
  audioDur?: number;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  /** how the source footage got in — screen recording, an uploaded video, or a Drive import */
  source?: "screen" | "video" | "drive";
  /** what this project is: a step-by-step walkthrough, or a short product demo cut */
  videoType?: "walkthrough" | "demo";
  /** whether the footage went through AI analysis or straight to the editor */
  analysed?: boolean;
  /** local file URI (native) or object URL (web) of the real footage, when there is one.
   *  When set, the editor plays this video instead of the synthetic demo frames. */
  sourceUri?: string;
  durationSec: number;
  /** spans that deleting a step took out of the timeline, so playback skips
   *  them in the source footage. Timeline seconds, ascending. */
  removed?: { at: number; len: number }[];
  /** the spans of the SOURCE this edit keeps, in order — what an export writes */
  cut?: { start: number; end: number }[];
  /** how fast the finished video plays. The timeline stays in 1x seconds; this
   *  only changes how quickly it is played back and written out. */
  speed?: number;
  /** the picture size of the source file, once something has measured it */
  frameSize?: { width: number; height: number };
  createdAt: number;
  updatedAt: number;
  aspect: "9:16" | "1:1" | "16:9";
  summary: string;
  thumbnailFrame: number;
  chapters: Chapter[];
  clips: Clip[];
  effects: Effect[];
  subtitles: SubtitleCue[];
  touchpoints: Touchpoint[];
  script: ScriptSegment[];
  tint: {
    preset: string;
    color: string;
    intensity: number;
    brightness: number;
    contrast: number;
    saturation: number;
    opacity: number;
  };
  voice: {
    voice: string;
    language: string;
    speed: number;
    tone: string;
    /** voice-over playback level in the preview, 0..1 */
    volume?: number;
    /** silences the voice-over without discarding the clips */
    muted?: boolean;
  };
  /** the opening card, when one has been added */
  intro?: Intro;
  /** the music bed, when one has been added */
  music?: MusicBed;
  /** what the recording's own sound does, and how much of it is cleaned away */
  audio?: AudioSettings;
  shared?: boolean;
}

export interface EditOp {
  id: string;
  label: string;
  /** inverse patch applied on undo */
  undo: () => void;
  redo: () => void;
  at: number;
}

export interface AIRecommendation {
  id: string;
  title: string;
  detail: string;
  tool: EffectType | "chapter" | "subtitle" | "script";
  apply: () => void;
}

export interface ToastMsg {
  id: string;
  text: string;
  tone?: "default" | "success" | "error" | "ai";
}
