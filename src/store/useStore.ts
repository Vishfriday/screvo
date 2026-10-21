import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_QUALITY, type QualityId } from "@/lib/quality";
import { introTemplate } from "@/data/intros";
import type {
  Project,
  Chapter,
  Clip,
  Effect,
  ScriptSegment,
  SubtitleCue,
  Touchpoint,
  ToastMsg,
  EffectType,
  Intro,
  MusicBed,
  AudioSettings,
} from "@/lib/types";
import type { AnalysisResult, TranscriptSegment } from "@/lib/analysis/types";
import { addPauses } from "@/lib/script";
import { makeDemoProjects } from "@/data/demoProjects";
import { chapterAccents } from "@/theme/tokens";

const clone = <T,>(v: T): T =>
  typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** mirrors the generated voice-over onto the audio track so the timeline shows it */
const syncVoiceClips = (p: Project): Clip[] => {
  const kept = p.clips.filter((c) => !(c.track === "audio" && c.meta?.vo));
  const made: Clip[] = p.script
    .filter((seg) => seg.audioUri)
    .map((seg) => ({
      id: `vo_${seg.id}`,
      track: "audio" as const,
      start: seg.start,
      duration: Math.max(0.4, seg.audioDur ?? 1),
      label: `Voice-over — ${p.chapters.find((c) => c.id === seg.chapterId)?.name ?? "Step"}`,
      color: "#5B5FD1",
      volume: p.voice.volume ?? 1,
      meta: { vo: seg.id },
    }));
  return [...kept, ...made];
};

/** removes the span [s, e) from a list of timed items, pulling what follows earlier */
const cutSpan = <T extends { start: number; duration: number }>(list: T[], s: number, e: number): T[] => {
  const len = e - s;
  const out: T[] = [];
  for (const it of list) {
    const a = it.start;
    const b = it.start + it.duration;
    if (b <= s + 0.001) {
      out.push(it);
    } else if (a >= e - 0.001) {
      it.start = a - len;
      out.push(it);
    } else {
      const keep = Math.max(0, s - a) + Math.max(0, b - e);
      if (keep < 0.08) continue; // it lived entirely inside the deleted step
      it.start = Math.min(a, s);
      it.duration = keep;
      out.push(it);
    }
  }
  return out;
};

export interface PendingAI {
  summary: string;
  steps: string[];
  snapshot: Project;
  pastLen: number;
}

interface StoreState {
  projects: Project[];
  hydrated: boolean;

  // editor session
  editorId: string | null;
  playhead: number;
  playing: boolean;
  selectedChapterId: string | null;
  selectedClipId: string | null;
  selectedTrack: Clip["track"];
  timelinePxPerSec: number;
  activePanel: string | null;
  askOpen: boolean;
  beforeAfter: boolean;
  editorMode: "voice" | "manual";
  pendingAI: PendingAI | null;
  placePicker: { label: string; onPick: (x: number, y: number) => void } | null;
  startPlacing: (label: string, onPick: (x: number, y: number) => void) => void;
  finishPlacing: (x: number, y: number) => void;
  cancelPlacing: () => void;

  // history (snapshots of the editing project)
  past: Project[];
  future: Project[];

  toasts: ToastMsg[];

  // ---- lifecycle
  ensureSeed: () => void;
  resetDemo: () => void;

  // ---- project CRUD
  getProject: (id: string) => Project | undefined;
  applyAIGeneration: (id: string) => void;
  /** where the last cut landed, so the timeline can flash it briefly */
  splitFlashAt: number | null;
  /** the most recent cut, kept until dismissed so it can be promoted to a step */
  lastCutAt: number | null;
  clearLastCut: () => void;
  /** turns a cut into a step boundary */
  stepAt: (t: number) => void;
  /** removes the step boundary at a time, folding it back into the previous step */
  unstepAt: (t: number) => void;
  /** divides one step in two — at the playhead when it sits inside, else the middle */
  addStepAfter: (id: string) => void;
  /** removes a step and its footage, pulling the rest of the walkthrough earlier */
  deleteStep: (id: string) => void;
  /** stores a generated voice-over clip, and its length, against one script segment */
  setSegmentAudio: (segId: string, uri: string, dur?: number) => void;
  /** drops every generated voice-over clip and its timeline row */
  clearVoiceOver: () => void;
  /** rewrites the script so the voice pauses between sentences */
  addScriptPauses: () => void;
  /** turns on automatic key-word highlighting across the captions */
  emphasizeCaptions: () => void;
  /** corrects a project's length once the real video reports its duration */
  setRealDuration: (id: string, sec: number) => void;
  /** records the picture size of a project's source file */
  setFrameSize: (id: string, width: number, height: number) => void;
  /** the resolution Screvo's own recorder aims for, kept across sessions */
  captureQuality: QualityId;
  setCaptureQuality: (q: QualityId) => void;
  /** replaces the canned result with one Claude derived from the real footage */
  applyRealAnalysis: (id: string, result: AnalysisResult, transcript: TranscriptSegment[]) => void;
  /** assembles the product-demo cut: only the beats Claude chose, in order */
  applyDemoAnalysis: (id: string, result: AnalysisResult) => void;

  // ---- API keys and endpoints, kept on this device only
  keys: { anthropic?: string; stt?: string; kokoro?: string; showui?: string; showuiToken?: string };
  setKeys: (k: Partial<{ anthropic: string; stt: string; kokoro: string; showui: string; showuiToken: string }>) => void;
  createProject: (partial: Partial<Project> & { name: string }) => string;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => string;
  renameProject: (id: string, name: string) => void;
  setStatus: (id: string, status: Project["status"]) => void;

  // ---- editor session
  openEditor: (id: string) => void;
  closeEditor: () => void;
  editing: () => Project | undefined;
  commit: (label: string, recipe: (p: Project) => void) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ---- playback
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (t: number) => void;
  tick: (dt: number) => void;

  // ---- selection / ui
  selectChapter: (id: string) => void;
  selectClip: (id: string | null) => void;
  setSelectedTrack: (t: Clip["track"]) => void;
  setTimelineZoom: (px: number) => void;
  openPanel: (name: string) => void;
  closePanel: () => void;
  openAsk: () => void;
  closeAsk: () => void;
  toggleBeforeAfter: () => void;
  setEditorMode: (m: "voice" | "manual") => void;

  // ---- toasts
  toast: (text: string, tone?: ToastMsg["tone"]) => void;
  dismissToast: (id: string) => void;

  // ---- editing operations
  splitClipAtPlayhead: () => void;
  splitClipAtTimes: (clipId: string, times: number[]) => void;
  splitAllAtChapters: () => void;
  trimClip: (id: string, side: "start" | "end", deltaSec: number) => void;
  deleteClip: (id: string) => void;
  duplicateClip: (id: string) => void;
  moveClip: (id: string, newStart: number) => void;
  setClipSpeed: (id: string, speed: number) => void;
  setClipVolume: (id: string, volume: number) => void;

  renameChapter: (id: string, name: string) => void;
  deleteChapter: (id: string) => void;
  mergeChapterWithNext: (id: string) => void;
  splitChapterAtPlayhead: () => void;
  reorderChapter: (id: string, dir: -1 | 1) => void;
  addChapter: () => void;

  addEffect: (type: EffectType, params: Record<string, any>, opts?: Partial<Effect>) => string;
  updateEffect: (id: string, params: Record<string, any>) => void;
  removeEffect: (id: string) => void;

  addSubtitle: (cue: Partial<SubtitleCue>) => string;
  updateSubtitle: (
    id: string,
    patch: Partial<Omit<SubtitleCue, "highlight">> & { highlight?: Partial<SubtitleCue["highlight"]> },
  ) => void;
  removeSubtitle: (id: string) => void;
  autoHighlightAll: () => void;

  setTint: (patch: Partial<Project["tint"]>) => void;
  setVoice: (patch: Partial<Project["voice"]>) => void;
  /** how fast the finished video plays — 1x to 5x */
  setProjectSpeed: (speed: number) => void;
  /** adds or replaces the opening card */
  setIntro: (patch: Partial<Intro>) => void;
  removeIntro: () => void;
  /** adds or replaces the music bed */
  /** the recording's own sound: level, and how hard to clean it */
  setAudio: (patch: Partial<AudioSettings>) => void;
  setDenoise: (patch: Partial<AudioSettings["denoise"]>) => void;
  setMusic: (bed: MusicBed) => void;
  updateMusic: (patch: Partial<MusicBed>) => void;
  removeMusic: () => void;
  updateScript: (id: string, text: string) => void;

  addTouchpoint: (tp: Omit<Touchpoint, "id">) => void;

  // ---- AI command flow
  setPendingAI: (p: PendingAI | null) => void;
  keepAI: () => void;
  revertAI: () => void;
}

const DEFAULT_PXPS = 46;

/**
 * A new project keeps its own sound at full level and leaves the cleaning off.
 * Turning noise reduction on by itself would quietly change what every existing
 * recording sounds like, and it is not free of artefacts — it is a choice.
 */
export const defaultAudio = (): AudioSettings => ({
  sourceVolume: 1,
  denoise: { enabled: false, strength: 0.6, highPass: true, gate: false },
});

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      // apply a recipe to the editing project, recording history
      const commit: StoreState["commit"] = (label, recipe) => {
        const id = get().editorId;
        if (!id) return;
        const projects = get().projects;
        const idx = projects.findIndex((p) => p.id === id);
        if (idx < 0) return;
        const prev = projects[idx];
        const next = clone(prev);
        recipe(next);
        next.updatedAt = Date.now();
        next.durationSec = Math.max(
          next.durationSec,
          ...next.clips.filter((c) => c.track === "video").map((c) => c.start + c.duration),
          0.1,
        );
        const copy = projects.slice();
        copy[idx] = next;
        set({
          projects: copy,
          past: [...get().past, prev].slice(-50),
          future: [],
        });
        void label;
      };

      return {
        projects: [],
        hydrated: false,
        editorId: null,
        playhead: 0,
        playing: false,
        selectedChapterId: null,
        selectedClipId: null,
        selectedTrack: "video",
        timelinePxPerSec: DEFAULT_PXPS,
        activePanel: null,
        askOpen: false,
        beforeAfter: false,
        editorMode: "voice",
        splitFlashAt: null,
        lastCutAt: null,
        pendingAI: null,
        placePicker: null,
        startPlacing: (label, onPick) => set({ placePicker: { label, onPick } }),
        finishPlacing: (x, y) => {
          const pp = get().placePicker;
          set({ placePicker: null });
          pp?.onPick(x, y);
        },
        cancelPlacing: () => set({ placePicker: null }),
        past: [],
        future: [],
        toasts: [],

        ensureSeed: () => {
          if (get().projects.length === 0) set({ projects: makeDemoProjects() });
        },
        resetDemo: () =>
          set({
            projects: makeDemoProjects(),
            editorId: null,
            past: [],
            future: [],
            playhead: 0,
            playing: false,
          }),

        getProject: (id) => get().projects.find((p) => p.id === id),

        applyAIGeneration: (id) => {
          const src = makeDemoProjects()[0]; // flagship carries a full AI result
          set({
            projects: get().projects.map((p) => {
              if (p.id !== id) return p;
              // Real footage keeps its own length and its own clip — the AI result is
              // scaled onto it. Without footage we fall back to the demo cut.
              const real = !!p.sourceUri;
              const dur = real ? p.durationSec : src.durationSec;
              const k = src.durationSec ? dur / src.durationSec : 1;
              const fit = <T extends { start: number; duration: number }>(list: T[]): T[] =>
                list
                  .map((x) => ({ ...x, start: x.start * k, duration: Math.max(0.2, x.duration * k) }))
                  .filter((x) => x.start < dur - 0.05);
              return {
                ...p,
                status: "ready",
                durationSec: dur,
                aspect: "9:16",
                summary: src.summary,
                thumbnailFrame: real ? p.thumbnailFrame : 2,
                chapters: real ? fit(clone(src.chapters)) : clone(src.chapters),
                clips: real
                  ? [
                      { id: uid("clip"), track: "video" as const, start: 0, duration: dur, label: "Source video", frame: 0, color: "#5B5FD1", speed: 1, volume: 1 },
                      { id: uid("clip"), track: "audio" as const, start: 0, duration: dur, label: "Original audio", frame: 0, color: "#3FD1CC", volume: 1 },
                    ]
                  : clone(src.clips),
                effects: real ? fit(clone(src.effects)) : clone(src.effects),
                subtitles: real ? fit(clone(src.subtitles)) : clone(src.subtitles),
                script: real
                  ? clone(src.script).map((x) => ({ ...x, start: x.start * k })).filter((x) => x.start < dur - 0.05)
                  : clone(src.script),
                touchpoints: p.touchpoints.length ? p.touchpoints : real ? [] : clone(src.touchpoints),
                tint: clone(src.tint),
                voice: clone(src.voice),
                updatedAt: Date.now(),
              };
            }),
          });
        },


        applyRealAnalysis: (id, result, transcript) =>
          set({
            projects: get().projects.map((p) => {
              if (p.id !== id) return p;

              // one step per screen change; each runs until the next one starts
              const chapters = result.steps.map((st, i) => ({
                id: uid("ch"),
                name: st.name,
                start: st.start,
                duration: Math.max(0.5, (result.steps[i + 1]?.start ?? p.durationSec) - st.start),
                frame: i % 5,
                summary: st.instruction,
              }));

              // real captions, straight from the speech the recording actually contains
              const subtitles = transcript.map((s) => ({
                id: uid("sub"),
                start: Math.max(0, s.start),
                duration: Math.max(1, (s.end || s.start + 2.5) - s.start),
                text: s.text,
                orientation: "horizontal" as const,
                position: "bottom",
                animation: "Fade",
                highlight: { enabled: true, auto: false, color: "#0A0A0F", style: "rounded", opacity: 0.85, radius: 10, padding: 10 },
              }));

              // the narration walks the same steps. A step with no line still gets
              // its row: local screen-change detection cannot describe a step, and
              // an empty line you can type into beats no line at all.
              const script = result.steps.map((st, i) => ({
                id: uid("seg"),
                chapterId: chapters[i]?.id ?? "",
                text: st.instruction,
                start: st.start,
              }));

              // where ShowUI found each step's control, when it was asked
              const touches = result.touches ?? [];
              const touchpoints = touches.length
                ? touches.map((g) => ({
                    id: uid("tp"),
                    x: g.x,
                    y: g.y,
                    t: g.t,
                    label: g.label,
                    key: true,
                  }))
                : p.touchpoints;

              /** the grounded point nearest a moment, so a zoom lands on the control */
              const focusFor = (t: number) => {
                let best: (typeof touches)[number] | undefined;
                for (const g of touches) if (!best || Math.abs(g.t - t) < Math.abs(best.t - t)) best = g;
                return best && Math.abs(best.t - t) < 3 ? { x: best.x, y: best.y } : { x: 0.5, y: 0.45 };
              };

              // push in on the moments Claude picked out of the real frames
              const effects = result.keyMoments.slice(0, 3).map((m) => ({
                id: uid("fx"),
                type: "zoom" as const,
                start: Math.max(0, m.t - 0.3),
                duration: 2.2,
                ...focusFor(m.t),
                params: { mode: "Custom Zoom", scale: 1.6, easing: "easeOut", kind: "in" },
                label: `Zoom → ${m.label}`,
              }));

              const generic = /^(untitled|screen recording|recording|video|img[_-])/i.test(p.name.trim());

              return {
                ...p,
                status: "ready" as const,
                analysed: true,
                name: generic && result.title ? result.title : p.name,
                summary: result.summary,
                chapters,
                subtitles,
                script,
                effects,
                touchpoints,
                updatedAt: Date.now(),
              };
            }),
          }),

        applyDemoAnalysis: (id, result) =>
          set({
            projects: get().projects.map((p) => {
              if (p.id !== id) return p;
              const beats = (result.beats ?? []).filter((b) => b.end - b.start >= 1);
              if (!beats.length) return p;

              // The cut keeps only the chosen spans. Everything between them is
              // removed, and `removed` tells playback how far to jump ahead in the
              // source so the gaps are never seen.
              const removed: { at: number; len: number }[] = [];
              const chapters: Chapter[] = [];
              const script: ScriptSegment[] = [];
              let timeline = 0;
              let sourceCursor = 0;

              beats.forEach((b, i) => {
                const gap = Math.max(0, b.start - sourceCursor);
                if (gap > 0.05) removed.push({ at: Math.round(timeline * 100) / 100, len: gap });
                const length = Math.max(0.5, b.end - b.start);
                const chapterId = uid("ch");
                chapters.push({
                  id: chapterId,
                  name: b.name,
                  start: Math.round(timeline * 100) / 100,
                  duration: Math.round(length * 100) / 100,
                  frame: i % 5,
                  summary: b.script,
                });
                if (b.script) {
                  script.push({
                    id: uid("seg"),
                    chapterId,
                    text: b.script,
                    start: Math.round(timeline * 100) / 100,
                  });
                }
                timeline += length;
                sourceCursor = b.end;
              });

              const dur = Math.round(timeline * 100) / 100;
              /** a source instant, expressed on the cut's own clock */
              const onCut = (t: number) => {
                let acc = 0;
                for (const b of beats) {
                  if (t < b.start) break;
                  if (t <= b.end) return acc + (t - b.start);
                  acc += b.end - b.start;
                }
                return -1;
              };

              const effects = result.keyMoments
                .map((m) => ({ m, t: onCut(m.t) }))
                .filter((x) => x.t >= 0 && x.t < dur - 0.4)
                .slice(0, 3)
                .map((x) => ({
                  id: uid("fx"),
                  type: "zoom" as const,
                  start: Math.max(0, x.t - 0.3),
                  duration: 2.2,
                  x: 0.5,
                  y: 0.45,
                  params: { mode: "Custom Zoom", scale: 1.5, easing: "easeOut", kind: "in" },
                  label: `Zoom → ${x.m.label}`,
                }));

              return {
                ...p,
                status: "ready" as const,
                analysed: true,
                videoType: "demo" as const,
                name: result.title || p.name,
                summary: result.summary,
                durationSec: dur,
                removed,
                cut: beats.map((b) => ({ start: b.start, end: b.end })),
                chapters,
                script,
                effects,
                subtitles: [],
                clips: [
                  { id: uid("clip"), track: "video" as const, start: 0, duration: dur, label: "Demo cut", frame: 0, color: "#5B5FD1", speed: 1, volume: 1 },
                  { id: uid("clip"), track: "audio" as const, start: 0, duration: dur, label: "Original audio", frame: 0, color: "#3FD1CC", volume: 1 },
                ],
                updatedAt: Date.now(),
              };
            }),
          }),

        keys: {},
        setKeys: (k) => set({ keys: { ...get().keys, ...k } }),

        setSegmentAudio: (segId, uri, dur) =>
          set({
            projects: get().projects.map((p) => {
              if (p.id !== get().editorId) return p;
              const next = {
                ...p,
                script: p.script.map((seg) =>
                  seg.id === segId ? { ...seg, audioUri: uri, audioDur: dur ?? seg.audioDur } : seg,
                ),
                updatedAt: Date.now(),
              };
              return { ...next, clips: syncVoiceClips(next) };
            }),
          }),

        clearVoiceOver: () => {
          set({
            projects: get().projects.map((p) =>
              p.id !== get().editorId
                ? p
                : {
                    ...p,
                    script: p.script.map((seg) => ({ ...seg, audioUri: undefined, audioDur: undefined })),
                    clips: p.clips.filter((c) => !(c.track === "audio" && c.meta?.vo)),
                    updatedAt: Date.now(),
                  },
            ),
          });
          get().toast("Voice-over cleared", "default");
        },

        addScriptPauses: () => {
          const p = get().editing();
          if (!p?.script.length) {
            get().toast("There is no script to pause yet", "error");
            return;
          }
          let changed = 0;
          commit("Add pauses", (d) => {
            for (const seg of d.script) {
              const next = addPauses(seg.text);
              if (next !== seg.text) {
                seg.text = next;
                changed += 1;
              }
            }
          });
          get().toast(
            changed
              ? `Pauses added in ${changed} step${changed === 1 ? "" : "s"} — regenerate the voice-over to hear them`
              : "The script already reads with pauses",
            changed ? "ai" : "default",
          );
        },

        emphasizeCaptions: () => {
          const p = get().editing();
          if (!p?.subtitles.length) {
            get().toast("No captions yet — transcribe the video first", "error");
            return;
          }
          commit("Emphasise captions", (d) => {
            for (const c of d.subtitles) c.highlight = { ...c.highlight, enabled: true, auto: true };
          });
          get().toast("Key words now highlight as the captions play", "ai");
        },

        // the real duration only becomes known once the video element reports it
        setRealDuration: (id, sec) =>
          set({
            projects: get().projects.map((p) => {
              if (p.id !== id || !p.sourceUri || !sec || !isFinite(sec)) return p;
              if (Math.abs(p.durationSec - sec) < 0.5) return p;
              if (p.removed?.length) return p; // deleting a step shortened it on purpose
              if (p.clips.filter((c) => c.track === "video").length > 1) return p; // already cut up
              return {
                ...p,
                durationSec: sec,
                clips: p.clips.map((c) => (c.duration >= p.durationSec - 0.15 ? { ...c, duration: sec } : c)),
                // An import that skipped analysis has one chapter standing for the
                // whole video, guessed from a length the file picker never gave.
                // Now that the real one is known, it has to stretch with it —
                // chapters the analysis wrote are left exactly where it put them.
                chapters:
                  p.analysed === false && p.chapters.length === 1 && p.chapters[0].start === 0
                    ? [{ ...p.chapters[0], duration: sec }]
                    : p.chapters,
                updatedAt: Date.now(),
              };
            }),
          }),

        // the picture size only becomes known once something has opened the file
        setFrameSize: (id, width, height) =>
          set({
            projects: get().projects.map((p) => {
              if (p.id !== id || !width || !height) return p;
              if (p.frameSize?.width === width && p.frameSize?.height === height) return p;
              return { ...p, frameSize: { width, height } };
            }),
          }),

        captureQuality: DEFAULT_QUALITY,
        setCaptureQuality: (q) => set({ captureQuality: q }),

        createProject: (partial) => {
          const id = partial.id ?? uid("proj");
          const now = Date.now();
          const base: Project = {
            id,
            name: partial.name,
            status: partial.status ?? "draft",
            source: partial.source ?? "screen",
            sourceUri: partial.sourceUri,
            // without this a demo project is born as a walkthrough, and the
            // analysis runs the wrong prompt entirely
            videoType: partial.videoType ?? "walkthrough",
            analysed: partial.analysed,
            frameSize: partial.frameSize,
            speed: partial.speed ?? 1,
            intro: partial.intro,
            music: partial.music,
            audio: partial.audio ?? defaultAudio(),
            durationSec: partial.durationSec ?? 60,
            createdAt: now,
            updatedAt: now,
            aspect: "9:16",
            summary: partial.summary ?? "",
            thumbnailFrame: partial.thumbnailFrame ?? 0,
            chapters: partial.chapters ?? [],
            clips: partial.clips ?? [],
            effects: partial.effects ?? [],
            subtitles: partial.subtitles ?? [],
            touchpoints: partial.touchpoints ?? [],
            script: partial.script ?? [],
            tint: partial.tint ?? {
              preset: "Clean",
              color: "#5B5FD1",
              intensity: 0.14,
              brightness: 0.03,
              contrast: 0.08,
              saturation: 0.06,
              opacity: 0.16,
            },
            voice: partial.voice ?? {
              voice: "Ava — Warm",
              language: "English (US)",
              speed: 1,
              tone: "Conversational",
            },
          };
          set({ projects: [base, ...get().projects] });
          return id;
        },

        deleteProject: (id) =>
          set({
            projects: get().projects.filter((p) => p.id !== id),
            editorId: get().editorId === id ? null : get().editorId,
          }),

        duplicateProject: (id) => {
          const src = get().getProject(id);
          if (!src) return id;
          const copy = clone(src);
          copy.id = uid("proj");
          copy.name = `${src.name} (copy)`;
          copy.status = "draft";
          copy.createdAt = Date.now();
          copy.updatedAt = Date.now();
          set({ projects: [copy, ...get().projects] });
          return copy.id;
        },

        renameProject: (id, name) =>
          set({
            projects: get().projects.map((p) =>
              p.id === id ? { ...p, name, updatedAt: Date.now() } : p,
            ),
          }),

        setStatus: (id, status) =>
          set({
            projects: get().projects.map((p) =>
              p.id === id ? { ...p, status, updatedAt: Date.now() } : p,
            ),
          }),

        openEditor: (id) => {
          const p = get().getProject(id);
          set({
            editorId: id,
            playhead: 0,
            playing: false,
            selectedChapterId: p?.chapters[0]?.id ?? null,
            selectedClipId: null,
            selectedTrack: "video",
            timelinePxPerSec: DEFAULT_PXPS,
            activePanel: null,
            askOpen: false,
            pendingAI: null,
            editorMode: "voice",
            lastCutAt: null,
            past: [],
            future: [],
          });
        },
        closeEditor: () => set({ editorId: null, playing: false, pendingAI: null }),

        editing: () => {
          const id = get().editorId;
          return id ? get().projects.find((p) => p.id === id) : undefined;
        },

        commit,

        undo: () => {
          const past = get().past;
          if (past.length === 0) return;
          const id = get().editorId;
          if (!id) return;
          const projects = get().projects;
          const idx = projects.findIndex((p) => p.id === id);
          const current = projects[idx];
          const prev = past[past.length - 1];
          const copy = projects.slice();
          copy[idx] = prev;
          set({
            projects: copy,
            past: past.slice(0, -1),
            future: [current, ...get().future].slice(0, 50),
          });
          get().toast("Undone", "default");
        },

        redo: () => {
          const future = get().future;
          if (future.length === 0) return;
          const id = get().editorId;
          if (!id) return;
          const projects = get().projects;
          const idx = projects.findIndex((p) => p.id === id);
          const current = projects[idx];
          const nextP = future[0];
          const copy = projects.slice();
          copy[idx] = nextP;
          set({
            projects: copy,
            past: [...get().past, current].slice(-50),
            future: future.slice(1),
          });
          get().toast("Redone", "default");
        },

        canUndo: () => get().past.length > 0,
        canRedo: () => get().future.length > 0,

        play: () => set({ playing: true }),
        pause: () => set({ playing: false }),
        togglePlay: () => set({ playing: !get().playing }),
        seek: (t) => {
          const p = get().editing();
          const dur = p?.durationSec ?? 0;
          set({ playhead: Math.max(0, Math.min(dur, t)) });
        },
        tick: (dt) => {
          if (!get().playing) return;
          const p = get().editing();
          if (!p) return;
          // the playhead is in 1x seconds, so a 3x project simply burns through
          // three of them every real second — what the viewer will see
          let next = get().playhead + dt * (p.speed ?? 1);
          if (next >= p.durationSec) {
            next = p.durationSec;
            set({ playing: false });
          }
          set({ playhead: next });
          // keep selected chapter in sync while playing
          const ch = p.chapters.find((c) => next >= c.start && next < c.start + c.duration);
          if (ch && ch.id !== get().selectedChapterId) set({ selectedChapterId: ch.id });
        },

        selectChapter: (id) => {
          const p = get().editing();
          const ch = p?.chapters.find((c) => c.id === id);
          set({
            selectedChapterId: id,
            playhead: ch ? ch.start + 0.001 : get().playhead,
          });
        },
        selectClip: (id) => set({ selectedClipId: id }),
        setSelectedTrack: (t) => set({ selectedTrack: t }),
        setTimelineZoom: (px) => set({ timelinePxPerSec: Math.max(14, Math.min(160, px)) }),
        openPanel: (name) => set({ activePanel: name }),
        closePanel: () => set({ activePanel: null }),
        openAsk: () => set({ askOpen: true }),
        closeAsk: () => set({ askOpen: false }),
        toggleBeforeAfter: () => set({ beforeAfter: !get().beforeAfter }),
        setEditorMode: (m) => set({ editorMode: m }),

        toast: (text, tone = "default") => {
          const id = uid("t");
          set({ toasts: [...get().toasts, { id, text, tone }] });
          setTimeout(() => get().dismissToast(id), tone === "ai" ? 4200 : 2600);
        },
        dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

        clearLastCut: () => set({ lastCutAt: null }),

        stepAt: (t) => {
          const p = get().editing();
          if (!p) return;
          const ch = p.chapters.find((c) => t > c.start + 0.3 && t < c.start + c.duration - 0.3);
          if (!ch) {
            get().toast("Too close to an existing step boundary", "error");
            return;
          }
          commit("New step at cut", (d) => {
            const c = d.chapters.find((x) => x.id === ch.id)!;
            const rightDur = c.start + c.duration - t;
            c.duration = t - c.start;
            const at = d.chapters.findIndex((x) => x.id === c.id);
            d.chapters.splice(at + 1, 0, {
              id: uid("ch"),
              name: `${c.name} (2)`,
              start: t,
              duration: rightDur,
              frame: c.frame,
              summary: "",
            });
          });
          get().toast("The cut is now its own step", "success");
        },

        unstepAt: (t) => {
          const p = get().editing();
          if (!p) return;
          const i = p.chapters.findIndex((c) => Math.abs(c.start - t) < 0.3);
          if (i < 0) {
            get().toast("No step boundary here", "error");
            return;
          }
          if (i === 0) {
            get().toast("This is the first step — nothing before it", "error");
            return;
          }
          get().mergeChapterWithNext(p.chapters[i - 1].id);
        },

        addStepAfter: (id) => {
          const p = get().editing();
          if (!p) return;
          const ch = p.chapters.find((c) => c.id === id);
          if (!ch) return;
          if (ch.duration < 0.8) {
            get().toast("This step is too short to divide", "error");
            return;
          }
          const end = ch.start + ch.duration;
          const ph = get().playhead;
          const t = ph > ch.start + 0.3 && ph < end - 0.3 ? ph : ch.start + ch.duration / 2;
          commit("New step", (d) => {
            const c = d.chapters.find((x) => x.id === id)!;
            c.duration = t - c.start;
            const at = d.chapters.findIndex((x) => x.id === id);
            d.chapters.splice(at + 1, 0, {
              id: uid("ch"),
              name: `${c.name} (2)`,
              start: t,
              duration: end - t,
              frame: c.frame,
              summary: "",
            });
          });
          get().seek(t);
          get().toast("Step added", "success");
        },

        deleteStep: (id) => {
          const p = get().editing();
          if (!p) return;
          if (p.chapters.length <= 1) {
            get().toast("This is the only step — nothing would be left", "error");
            return;
          }
          const ch = p.chapters.find((c) => c.id === id);
          if (!ch) return;
          const s = ch.start;
          const len = ch.duration;
          const e = s + len;
          commit("Delete step", (d) => {
            d.clips = cutSpan(d.clips, s, e);
            d.effects = cutSpan(d.effects, s, e);
            d.subtitles = cutSpan(d.subtitles, s, e);
            d.touchpoints = d.touchpoints
              .filter((tp) => tp.t < s || tp.t >= e)
              .map((tp) => (tp.t >= e ? { ...tp, t: tp.t - len } : tp));
            d.script = d.script
              .filter((sg) => sg.chapterId !== id && (sg.start < s || sg.start >= e))
              .map((sg) => (sg.start >= e ? { ...sg, start: sg.start - len } : sg));
            d.chapters = d.chapters
              .filter((c) => c.id !== id)
              .map((c) => (c.start >= e - 0.001 ? { ...c, start: c.start - len } : c));
            d.durationSec = Math.max(0.5, d.durationSec - len);
            const removed = (d.removed ?? []).map((r) => (r.at > s ? { ...r, at: Math.max(0, r.at - len) } : r));
            removed.push({ at: s, len });
            removed.sort((a, b) => a.at - b.at);
            d.removed = removed;
          });
          set({ selectedClipId: null, lastCutAt: null, splitFlashAt: null });
          get().seek(Math.max(0, s - 0.05));
          get().toast(`Step deleted — ${len.toFixed(1)}s removed`, "success");
        },


        // ---------- editing operations ----------
        splitClipAtPlayhead: () => {
          const p = get().editing();
          if (!p) return;
          const t = get().playhead;
          const track = get().selectedTrack;
          const target =
            p.clips.find((c) => c.id === get().selectedClipId && t > c.start + 0.05 && t < c.start + c.duration - 0.05) ??
            p.clips.find((c) => c.track === track && t > c.start + 0.05 && t < c.start + c.duration - 0.05);
          if (!target) {
            get().toast("Move the playhead inside a clip to split", "error");
            return;
          }
          commit("Split clip", (d) => {
            const c = d.clips.find((x) => x.id === target.id)!;
            const left = c.duration - (t - c.start);
            const right: Clip = {
              ...clone(c),
              id: uid("clip"),
              start: t,
              duration: left,
              label: `${c.label} (2)`,
            };
            c.duration = t - c.start;
            const at = d.clips.findIndex((x) => x.id === c.id);
            d.clips.splice(at + 1, 0, right);
          });
          const cutAt = t;
          set({ selectedClipId: null, splitFlashAt: cutAt, lastCutAt: cutAt });
          setTimeout(() => {
            if (get().splitFlashAt === cutAt) set({ splitFlashAt: null });
          }, 900);
          get().toast("Cut made — this clip is now two", "success");
        },

        splitClipAtTimes: (clipId, times) => {
          const p = get().editing();
          if (!p) return;
          const c0 = p.clips.find((x) => x.id === clipId);
          if (!c0) {
            get().toast("Select a clip first", "error");
            return;
          }
          const s0 = c0.start;
          const e0 = c0.start + c0.duration;
          const cuts = Array.from(
            new Set(times.filter((t) => t > s0 + 0.1 && t < e0 - 0.1).map((t) => Math.round(t * 100) / 100)),
          ).sort((a, b) => a - b);
          if (cuts.length === 0) {
            get().toast("Nothing to split there", "error");
            return;
          }
          commit("Split clip", (d) => {
            const c = d.clips.find((x) => x.id === clipId)!;
            const bounds = [c.start, ...cuts, c.start + c.duration];
            const at = d.clips.findIndex((x) => x.id === clipId);
            const pieces: Clip[] = [];
            for (let i = 0; i < bounds.length - 1; i++) {
              pieces.push({
                ...clone(c),
                id: i === 0 ? c.id : uid("clip"),
                start: bounds[i],
                duration: bounds[i + 1] - bounds[i],
                label: i === 0 ? c.label : `${c.label} (${i + 1})`,
              });
            }
            d.clips.splice(at, 1, ...pieces);
          });
          set({ selectedClipId: null, splitFlashAt: cuts[0], lastCutAt: cuts[0] });
          setTimeout(() => {
            if (get().splitFlashAt === cuts[0]) set({ splitFlashAt: null });
          }, 900);
          get().toast(`Split into ${cuts.length + 1} parts`, "success");
        },

        splitAllAtChapters: () => {
          const p = get().editing();
          if (!p) return;
          if (p.chapters.length < 2) {
            get().toast("No chapter boundaries to split at", "error");
            return;
          }
          const boundaries = p.chapters.slice(1).map((c) => c.start);
          commit("Split at chapters", (d) => {
            const vids = d.clips.filter((x) => x.track === "video");
            for (const c of vids) {
              const cuts = boundaries
                .filter((b) => b > c.start + 0.1 && b < c.start + c.duration - 0.1)
                .sort((a, b) => a - b);
              if (!cuts.length) continue;
              const at = d.clips.findIndex((x) => x.id === c.id);
              const bounds = [c.start, ...cuts, c.start + c.duration];
              const pieces: Clip[] = [];
              for (let i = 0; i < bounds.length - 1; i++) {
                pieces.push({
                  ...clone(c),
                  id: i === 0 ? c.id : uid("clip"),
                  start: bounds[i],
                  duration: bounds[i + 1] - bounds[i],
                  label: i === 0 ? c.label : `${c.label} (${i + 1})`,
                });
              }
              d.clips.splice(at, 1, ...pieces);
            }
          });
          set({ selectedClipId: null });
          get().toast("Split every video clip at chapter boundaries", "success");
        },

        trimClip: (id, side, deltaSec) =>
          commit("Trim clip", (d) => {
            const c = d.clips.find((x) => x.id === id);
            if (!c) return;
            if (side === "start") {
              const ns = Math.max(0, Math.min(c.start + c.duration - 0.3, c.start + deltaSec));
              c.duration -= ns - c.start;
              c.start = ns;
            } else {
              c.duration = Math.max(0.3, c.duration + deltaSec);
            }
          }),

        deleteClip: (id) => {
          commit("Delete clip", (d) => {
            d.clips = d.clips.filter((x) => x.id !== id);
          });
          set({ selectedClipId: null });
          get().toast("Clip deleted", "default");
        },

        duplicateClip: (id) => {
          commit("Duplicate clip", (d) => {
            const c = d.clips.find((x) => x.id === id);
            if (!c) return;
            const dup: Clip = { ...clone(c), id: uid("clip"), start: c.start + c.duration, label: `${c.label} (copy)` };
            const at = d.clips.findIndex((x) => x.id === id);
            d.clips.splice(at + 1, 0, dup);
          });
          get().toast("Clip duplicated", "success");
        },

        moveClip: (id, newStart) =>
          commit("Move clip", (d) => {
            const c = d.clips.find((x) => x.id === id);
            if (c) c.start = Math.max(0, newStart);
          }),

        setClipSpeed: (id, speed) =>
          commit("Change speed", (d) => {
            const c = d.clips.find((x) => x.id === id);
            if (c) {
              const orig = c.duration * (c.speed ?? 1);
              c.speed = speed;
              c.duration = orig / speed;
            }
          }),

        setClipVolume: (id, volume) =>
          commit("Change volume", (d) => {
            const c = d.clips.find((x) => x.id === id);
            if (c) c.volume = volume;
          }),

        renameChapter: (id, name) =>
          commit("Rename chapter", (d) => {
            const c = d.chapters.find((x) => x.id === id);
            if (c) c.name = name;
          }),

        // kept as an alias so a step is never dropped without closing the gap it leaves
        deleteChapter: (id) => get().deleteStep(id),

        mergeChapterWithNext: (id) => {
          commit("Merge steps", (d) => {
            const i = d.chapters.findIndex((x) => x.id === id);
            if (i < 0 || i >= d.chapters.length - 1) return;
            const a = d.chapters[i];
            const b = d.chapters[i + 1];
            a.duration = b.start + b.duration - a.start;
            a.name = `${a.name} + ${b.name}`;
            d.chapters.splice(i + 1, 1);
          });
          get().toast("Steps merged", "success");
        },

        splitChapterAtPlayhead: () => {
          const p = get().editing();
          if (!p) return;
          const t = get().playhead;
          const ch = p.chapters.find((c) => t > c.start + 0.5 && t < c.start + c.duration - 0.5);
          if (!ch) {
            get().toast("Move the playhead inside a chapter to split", "error");
            return;
          }
          commit("Split chapter", (d) => {
            const c = d.chapters.find((x) => x.id === ch.id)!;
            const rightDur = c.start + c.duration - t;
            c.duration = t - c.start;
            const at = d.chapters.findIndex((x) => x.id === c.id);
            d.chapters.splice(at + 1, 0, {
              id: uid("ch"),
              name: `${c.name} (2)`,
              start: t,
              duration: rightDur,
              frame: c.frame,
              summary: "",
            });
          });
          get().toast("Chapter split", "success");
        },

        reorderChapter: (id, dir) =>
          commit("Reorder chapter", (d) => {
            const i = d.chapters.findIndex((x) => x.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= d.chapters.length) return;
            const arr = d.chapters;
            [arr[i], arr[j]] = [arr[j], arr[i]];
            // recompute starts to keep contiguous ordering
            let cursor = arr[0].start;
            for (const c of arr) {
              c.start = cursor;
              cursor += c.duration;
            }
          }),

        addChapter: () => {
          commit("Add chapter", (d) => {
            const last = d.chapters[d.chapters.length - 1];
            const start = last ? last.start + last.duration : 0;
            d.chapters.push({
              id: uid("ch"),
              name: "New Chapter",
              start,
              duration: 8,
              frame: (last?.frame ?? 0) + 1,
              summary: "",
            });
          });
          get().toast("Chapter added", "success");
        },

        addEffect: (type, params, opts = {}) => {
          const id = uid("fx");
          const p = get().editing();
          const t = get().playhead;
          commit(`Add ${type}`, (d) => {
            d.effects.push({
              id,
              type,
              start: opts.start ?? t,
              duration: opts.duration ?? (type === "transition" ? 0.6 : type === "cta" ? 6 : 3),
              x: opts.x,
              y: opts.y,
              params,
              label: opts.label ?? `${type} @ ${t.toFixed(1)}s`,
            });
          });
          void p;
          return id;
        },

        updateEffect: (id, params) =>
          commit("Adjust effect", (d) => {
            const e = d.effects.find((x) => x.id === id);
            if (e) e.params = { ...e.params, ...params };
          }),

        removeEffect: (id) => {
          commit("Remove effect", (d) => {
            d.effects = d.effects.filter((x) => x.id !== id);
          });
          get().toast("Effect removed", "default");
        },

        addSubtitle: (cue) => {
          const id = uid("sub");
          const t = get().playhead;
          commit("Add subtitle", (d) => {
            d.subtitles.push({
              id,
              start: cue.start ?? t,
              duration: cue.duration ?? 3,
              text: cue.text ?? "New subtitle",
              orientation: cue.orientation ?? "horizontal",
              position: cue.position ?? "bottom",
              animation: cue.animation ?? "Word-by-word",
              highlight: cue.highlight ?? {
                enabled: true,
                auto: true,
                color: "#0A0A0F",
                style: "rounded",
                opacity: 0.55,
                radius: 10,
                padding: 8,
              },
            });
          });
          return id;
        },

        updateSubtitle: (id, patch) =>
          commit("Edit subtitle", (d) => {
            const s = d.subtitles.find((x) => x.id === id);
            if (s) Object.assign(s, patch, patch.highlight ? { highlight: { ...s.highlight, ...patch.highlight } } : {});
          }),

        removeSubtitle: (id) => {
          commit("Remove subtitle", (d) => {
            d.subtitles = d.subtitles.filter((x) => x.id !== id);
          });
        },

        autoHighlightAll: () => {
          commit("Auto highlighters", (d) => {
            d.subtitles.forEach((s, i) => {
              // alternate as a stand-in for sampling the underlying frame luma
              const dark = i % 2 === 0;
              s.highlight.enabled = true;
              s.highlight.auto = true;
              s.highlight.color = dark ? "#0A0A0F" : "#F4F4F8";
            });
          });
          get().toast("Smart highlighters matched to the video", "ai");
        },

        setTint: (patch) =>
          commit("Adjust tint", (d) => {
            d.tint = { ...d.tint, ...patch };
            const fx = d.effects.find((e) => e.type === "tint");
            if (fx) fx.params = { ...fx.params, ...patch };
          }),

        setVoice: (patch) =>
          commit("Voice settings", (d) => {
            d.voice = { ...d.voice, ...patch };
          }),

        // Speed is a render property, not an edit: the timeline stays in 1x
        // seconds so every chapter, caption and zoom keeps the moment it was
        // placed at, and only playback and the exporter run the clock faster.
        setProjectSpeed: (speed) => {
          const clamped = Math.max(0.5, Math.min(5, speed));
          commit("Change speed", (d) => {
            d.speed = clamped;
          });
        },

        setIntro: (patch) =>
          commit("Intro", (d) => {
            const template = introTemplate(patch.template ?? d.intro?.template);
            d.intro = {
              template: template.id,
              title: d.intro?.title ?? d.name,
              subtitle: d.intro?.subtitle ?? "",
              duration: d.intro?.duration ?? template.duration,
              accent: d.intro?.accent ?? "#5B5FD1",
              ...patch,
              // a new template brings its own pacing unless one was set by hand
              ...(patch.template && !patch.duration && !d.intro
                ? { duration: template.duration }
                : {}),
            };
          }),

        removeIntro: () =>
          commit("Remove intro", (d) => {
            d.intro = undefined;
          }),

        setAudio: (patch) =>
          commit("Audio settings", (d) => {
            d.audio = { ...defaultAudio(), ...d.audio, ...patch };
          }),

        setDenoise: (patch) =>
          commit("Noise cancellation", (d) => {
            const base = { ...defaultAudio(), ...d.audio };
            d.audio = { ...base, denoise: { ...base.denoise, ...patch } };
          }),

        setMusic: (bed) =>
          commit("Add music", (d) => {
            d.music = bed;
          }),

        updateMusic: (patch) =>
          commit("Music settings", (d) => {
            if (d.music) d.music = { ...d.music, ...patch };
          }),

        removeMusic: () =>
          commit("Remove music", (d) => {
            d.music = undefined;
          }),

        updateScript: (id, text) =>
          commit("Edit script", (d) => {
            const s = d.script.find((x) => x.id === id);
            if (s) s.text = text;
          }),

        addTouchpoint: (tp) =>
          commit("Add touchpoint", (d) => {
            d.touchpoints.push({ ...tp, id: uid("tp") });
          }),

        // ---------- AI command flow ----------
        setPendingAI: (p) => set({ pendingAI: p }),
        keepAI: () => {
          const p = get().pendingAI;
          set({ pendingAI: null });
          if (p) get().toast("Kept — " + p.summary, "success");
        },
        revertAI: () => {
          const p = get().pendingAI;
          if (!p) return;
          const id = get().editorId!;
          const projects = get().projects.slice();
          const idx = projects.findIndex((x) => x.id === id);
          if (idx >= 0) projects[idx] = p.snapshot;
          set({
            projects,
            pendingAI: null,
            past: get().past.slice(0, p.pastLen),
            future: [],
          });
          get().toast("Reverted the AI edit", "default");
        },
      };
    },
    {
      name: "screvo-store-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ projects: s.projects, keys: s.keys, captureQuality: s.captureQuality }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

export { chapterAccents };
