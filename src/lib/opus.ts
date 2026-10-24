// ---------------------------------------------------------------------------
// Claude Opus — reasoning layer for Screvo.
//
// Every AI capability in the app is routed through this module: workflow
// understanding, chapterisation, narration, subtitle generation, edit
// recommendations, and natural-language command interpretation.
//
// The functions below are a deterministic local stand-in for a hosted
// Claude Opus call. The call sites and return shapes are built so that a
// real request (`model: "claude-opus-4-x"`) can replace the body of each
// function without any caller changes.
// ---------------------------------------------------------------------------
import type { Project, AIRecommendation, SubtitleCue } from "./types";
import type { useStore } from "@/store/useStore";

type Store = ReturnType<typeof useStore.getState>;

export const OPUS_MODEL = "claude-opus";

// ---- Recording → analysis pipeline stages --------------------------------
export const PROCESSING_STAGES = [
  { key: "analyze", label: "Analyzing your recording...", detail: "Decoding frames and audio" },
  { key: "touch", label: "Detecting touchpoints...", detail: "8 touch events found" },
  { key: "ocr", label: "Reading screen content...", detail: "Buttons, labels, field names" },
  { key: "workflow", label: "Understanding workflow...", detail: "Create → name → invite → permit → confirm" },
  { key: "moments", label: "Finding key moments...", detail: "Ranking taps by intent" },
  { key: "chapters", label: "Creating chapters...", detail: "Hook · Solution · Feature · Results · CTA" },
  { key: "narration", label: "Writing narration...", detail: "Conversational, ~150 wpm" },
  { key: "subs", label: "Generating subtitles...", detail: "Word-by-word timing" },
  { key: "emphasis", label: "Applying visual emphasis...", detail: "Zooms, ripples, tint" },
  { key: "render", label: "Rendering your video...", detail: "Portrait 9:16 · 1080p" },
] as const;

// ---- Script rewriting ----------------------------------------------------
export type ScriptMode =
  | "Rewrite"
  | "Shorten"
  | "Expand"
  | "Professional"
  | "Conversational"
  | "Educational"
  | "Persuasive";

export function rewriteScript(text: string, mode: ScriptMode): string {
  const t = text.trim();
  if (!t) return t;
  switch (mode) {
    case "Shorten": {
      const first = t.split(/(?<=[.!?])\s+/)[0] ?? t;
      return first.length < t.length ? first : t.split(" ").slice(0, 14).join(" ") + "…";
    }
    case "Expand":
      return (
        t +
        " In practice that means fewer handoffs, less waiting on someone else, and a space your customer can open the same day."
      );
    case "Professional":
      return t
        .replace(/\bused to\b/gi, "previously")
        .replace(/\bin four taps\b/gi, "in four steps")
        .replace(/\bHere's\b/g, "The following demonstrates");
    case "Conversational":
      return t.replace(/previously/gi, "used to").replace(/The following demonstrates/gi, "Here's");
    case "Educational":
      return "In this step: " + t.charAt(0).toLowerCase() + t.slice(1);
    case "Persuasive":
      return t + " Most teams get this back in the first week.";
    case "Rewrite":
    default:
      return t.replace(/\ball of that\b/gi, "the whole thing").replace(/\bcollapses\b/gi, "turns");
  }
}

// ---- Edit recommendations (AI Edit panel) -------------------------------
export function generateRecommendations(p: Project, s: Store): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  const hook = p.chapters[0];

  if (hook && hook.duration > 10) {
    recs.push({
      id: "rec_hook",
      title: "This introduction is too long",
      detail: `Hook runs ${hook.duration.toFixed(0)}s. Tighten to 8s so the payoff lands sooner.`,
      tool: "chapter",
      apply: () =>
        s.commit("AI: tighten hook", (d) => {
          const c = d.chapters[0];
          const cut = c.duration - 8;
          c.duration = 8;
          for (let i = 1; i < d.chapters.length; i++) d.chapters[i].start -= cut;
          const vc = d.clips.find((x) => x.track === "video");
          if (vc) vc.duration = Math.max(2, vc.duration - cut);
        }),
    });
  }

  const firstKeyTap = p.touchpoints.find((t) => t.key);
  if (firstKeyTap && !p.effects.some((e) => e.type === "zoom" && Math.abs(e.start - firstKeyTap.t) < 2)) {
    recs.push({
      id: "rec_zoom",
      title: "Zoom into this button",
      detail: `A ${(1.7).toFixed(1)}× push on the “${firstKeyTap.label}” tap at ${firstKeyTap.t.toFixed(1)}s makes the action obvious.`,
      tool: "zoom",
      apply: () =>
        s.addEffect(
          "zoom",
          { mode: "Touchpoint Zoom", scale: 1.7, easing: "easeOut" },
          { start: Math.max(0, firstKeyTap.t - 0.5), duration: 2.5, x: firstKeyTap.x, y: firstKeyTap.y, label: `Zoom → ${firstKeyTap.label}` },
        ),
    });
  }

  const bareTap = p.touchpoints.find(
    (t) => !p.effects.some((e) => e.type === "touchpoint" && Math.abs(e.start - t.t) < 1.5),
  );
  if (bareTap) {
    recs.push({
      id: "rec_ripple",
      title: "Highlight this touchpoint",
      detail: `Add a ripple at the “${bareTap.label}” tap so viewers see exactly where the finger goes.`,
      tool: "touchpoint",
      apply: () =>
        s.addEffect(
          "touchpoint",
          { style: "Ripple", size: 60, color: "#3FD1CC", opacity: 0.8, duration: 1.1 },
          { start: bareTap.t, duration: 1.4, x: bareTap.x, y: bareTap.y, label: `Ripple → ${bareTap.label}` },
        ),
    });
  }

  if (p.subtitles.length === 0) {
    recs.push({
      id: "rec_subs",
      title: "Add subtitles here",
      detail: "No captions yet. Run speech-to-text on the video and add word-by-word captions from the transcript.",
      tool: "subtitle",
      apply: () => transcribeToSubtitles(p, s),
    });
  }

  const uiCollision = p.subtitles.find((sub) => sub.position === "bottom") && p.effects.some((e) => e.type === "cta");
  if (uiCollision) {
    recs.push({
      id: "rec_movetext",
      title: "Move this text away from the UI",
      detail: "A caption overlaps the CTA near the end. Lift captions to just above middle for that stretch.",
      tool: "subtitle",
      apply: () =>
        s.commit("AI: lift captions", (d) => {
          d.subtitles.filter((x) => x.start > d.durationSec - 16).forEach((x) => (x.position = "above-middle"));
        }),
    });
  }

  if (!p.effects.some((e) => e.type === "transition")) {
    recs.push({
      id: "rec_transition",
      title: "Add a transition",
      detail: "Cuts between chapters are hard. A 0.5s dissolve at the Feature boundary smooths it.",
      tool: "transition",
      apply: () => {
        const b = p.chapters[2];
        s.addEffect("transition", { style: "Dissolve", duration: 0.5 }, { start: b ? b.start : 4, duration: 0.5, label: "Dissolve → Feature" });
      },
    });
  }

  if (p.tint.intensity < 0.12) {
    recs.push({
      id: "rec_tint",
      title: "Add a subtle tint",
      detail: "Raw screen capture reads flat. A light Cinematic tint adds depth without hurting legibility.",
      tool: "tint",
      apply: () => s.setTint({ preset: "Cinematic", intensity: 0.18, contrast: 0.12 }),
    });
    recs.push({
      id: "rec_contrast",
      title: "Increase contrast",
      detail: "Bump contrast +0.1 so field labels separate from the background.",
      tool: "tint",
      apply: () => s.setTint({ contrast: Math.min(0.4, p.tint.contrast + 0.1) }),
    });
  }

  if (!p.effects.some((e) => e.type === "cta")) {
    recs.push({
      id: "rec_cta",
      title: "Add a CTA",
      detail: "End on an ask. Drop a “Start Free Trial” button over the last 8 seconds.",
      tool: "cta",
      apply: () =>
        s.addEffect(
          "cta",
          { text: "Start Free Trial", template: "Start Free Trial", url: "https://northwind.io/try", animation: "Pop", bg: "#5B5FD1", color: "#FFFFFF" },
          { start: Math.max(0, p.durationSec - 8), duration: 8, x: 0.5, y: 0.8, label: "CTA — Start Free Trial" },
        ),
    });
  }

  return recs;
}

export function generateSubtitlesFromScript(p: Project, s: Store) {
  const lines: { text: string; start: number; duration: number }[] = [];
  const source = p.script.length
    ? p.script
    : p.chapters.map((c) => ({ start: c.start, text: c.summary || c.name }));
  for (const seg of source) {
    const sentences = (seg.text || "").split(/(?<=[.!?])\s+/).filter(Boolean);
    let cursor = seg.start + 0.3;
    for (const sent of sentences) {
      const dur = Math.max(1.6, Math.min(5, sent.split(" ").length / 2.6));
      lines.push({ text: sent, start: cursor, duration: dur });
      cursor += dur + 0.2;
    }
  }
  s.commit("AI: generate subtitles", (d) => {
    d.subtitles = lines.map((l, i) => ({
      id: `sub_ai_${i}_${Math.random().toString(36).slice(2, 6)}`,
      start: l.start,
      duration: l.duration,
      text: l.text,
      orientation: "horizontal" as const,
      position: "bottom",
      animation: "Word-by-word",
      highlight: {
        enabled: true,
        auto: true,
        color: i % 2 ? "#F4F4F8" : "#0A0A0F",
        style: "rounded",
        opacity: 0.5,
        radius: 10,
        padding: 8,
      },
    }));
  });
}

// A stand-in for speech-to-text on the video's own audio track. In a real
// build this is the transcript the STT pass returns; here it's a fixed,
// spoken-style transcript that gets time-scaled to the actual clip length.
const DEMO_TRANSCRIPT: { at: number; text: string }[] = [
  { at: 0.4, text: "Okay so — setting up a client space by hand?" },
  { at: 4.5, text: "Honestly, that used to eat my whole morning." },
  { at: 9, text: "So let me show you the faster way." },
  { at: 13, text: "I'll hit the plus up here" },
  { at: 17, text: "and pick Customer Workspace." },
  { at: 22, text: "Now I just give it a name" },
  { at: 27, text: "something the client will recognise." },
  { at: 34, text: "Then I invite the customer" },
  { at: 40, text: "and the teammates who'll support them." },
  { at: 48, text: "Quick permissions check —" },
  { at: 54, text: "they can view and comment, nothing else." },
  { at: 63, text: "And hit create." },
  { at: 68, text: "There we go." },
  { at: 73, text: "A branded space they can log into right now." },
  { at: 82, text: "No back-and-forth." },
  { at: 88, text: "Try it on your next onboarding." },
  { at: 94, text: "It's free for two weeks." },
];

// Build subtitles from the video's spoken transcript (speech-to-text), not the
// narration script. Scales to the real clip length so it works for any video.
export function transcribeToSubtitles(p: Project, s: Store) {
  const total = Math.max(1, p.durationSec);
  const span = DEMO_TRANSCRIPT[DEMO_TRANSCRIPT.length - 1].at + 5;
  const scale = total / span;
  let end = 0;
  const cues = DEMO_TRANSCRIPT.map((line, i) => {
    const words = line.text.split(" ").length;
    const dur = Math.max(1.4, Math.min(4, words / 2.7));
    let start = line.at * scale;
    if (start < end + 0.1) start = end + 0.1;
    end = start + dur;
    return { i, start, dur, text: line.text };
  });
  s.commit("AI: transcribe → subtitles", (d) => {
    d.subtitles = cues.map((c) => ({
      id: `sub_tx_${c.i}_${Math.random().toString(36).slice(2, 6)}`,
      start: c.start,
      duration: c.dur,
      text: c.text,
      orientation: "horizontal" as const,
      position: "bottom",
      animation: "Word-by-word",
      highlight: {
        enabled: true,
        auto: true,
        color: c.i % 2 ? "#F4F4F8" : "#0A0A0F",
        style: "rounded",
        opacity: 0.5,
        radius: 10,
        padding: 8,
      },
    }));
  });
}

// ---- Natural-language command interpretation ---------------------------
export interface CommandPlan {
  summary: string;
  steps: string[];
  run: (s: Store) => void;
  ok: boolean;
}

function num(re: RegExp, text: string, fallback: number): number {
  const m = text.match(re);
  if (!m) return fallback;
  const word: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  return Number(m[1]) || word[m[1].toLowerCase()] || fallback;
}

export function interpretCommand(raw: string, p: Project, s: Store): CommandPlan {
  const text = raw.toLowerCase().trim();
  const at = s.playhead;

  const noop: CommandPlan = {
    ok: false,
    summary: "I didn't catch an edit in that",
    steps: [],
    run: () => {},
  };
  if (!text) return noop;

  // --- cut / trim the last N seconds
  if (/(cut|trim|remove|drop).*(last|final|end)/.test(text)) {
    const n = num(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:s|sec|second)/, text, 5);
    return {
      ok: true,
      summary: `trimmed the last ${n} seconds`,
      steps: [`Locate the tail of the timeline`, `Trim ${n}s from the final clip`, "Pull the CTA in to match", "Preview"],
      run: (st) =>
        st.commit("AI: cut the end", (d) => {
          const vids = d.clips.filter((c) => c.track === "video").sort((a, b) => a.start - b.start);
          let remaining = n;
          for (let i = vids.length - 1; i >= 0 && remaining > 0; i--) {
            const take = Math.min(vids[i].duration - 0.3, remaining);
            vids[i].duration -= take;
            remaining -= take;
          }
          d.durationSec = Math.max(1, d.durationSec - n);
          d.effects.filter((e) => e.type === "cta").forEach((e) => (e.start = Math.max(0, d.durationSec - e.duration)));
          const lastCh = d.chapters[d.chapters.length - 1];
          if (lastCh) lastCh.duration = Math.max(2, lastCh.duration - n);
        }),
    };
  }

  // --- split this clip here [+ zoom into the second half]
  if (/\bsplit\b/.test(text) && !/chapter/.test(text)) {
    const wantsZoom = /zoom/.test(text);
    const half = /second half|latter|part two|2nd half/.test(text) ? "second" : "first";
    return {
      ok: true,
      summary: wantsZoom ? `split the clip and zoomed the ${half} half` : "split the clip at the playhead",
      steps: [
        `Split at ${at.toFixed(1)}s`,
        ...(wantsZoom ? [`Select the ${half} clip`, "Add a 1.6× zoom", "Preview"] : ["Preview"]),
      ],
      run: (st) => {
        st.splitClipAtPlayhead();
        if (wantsZoom) {
          const cur = st.editing()!;
          const vids = cur.clips.filter((c) => c.track === "video").sort((a, b) => a.start - b.start);
          const target = half === "second" ? vids.find((c) => c.start >= at - 0.05) : [...vids].reverse().find((c) => c.start < at);
          if (target) {
            st.selectClip(target.id);
            st.addEffect(
              "zoom",
              { mode: "Custom Zoom", scale: 1.6, easing: "easeInOut" },
              { start: target.start, duration: Math.min(3, target.duration), x: 0.5, y: 0.45, label: `Zoom → ${half} half` },
            );
          }
        }
      },
    };
  }

  // --- remove this section / delete this clip
  if (/(remove|delete|cut).*(this|the)?\s*(section|clip|part|bit)/.test(text) || text === "remove this" || text === "delete this") {
    return {
      ok: true,
      summary: "removed the clip at the playhead",
      steps: ["Identify the clip under the playhead", "Delete it", "Close the gap", "Preview"],
      run: (st) => {
        const cur = st.editing()!;
        const c =
          cur.clips.find((x) => x.id === st.selectedClipId) ??
          cur.clips.find((x) => x.track === "video" && at >= x.start && at < x.start + x.duration);
        if (c) st.deleteClip(c.id);
        else st.toast("No clip under the playhead", "error");
      },
    };
  }

  // --- zoom into the button / into X
  if (/\bzoom\b/.test(text) && !/transition/.test(text)) {
    const tpNear = p.touchpoints.slice().sort((a, b) => Math.abs(a.t - at) - Math.abs(b.t - at))[0];
    const quick = /in (?:&|and) out|quick|pulse|punch/.test(text) ? "pulse" : /zoom(?:ing)? out/.test(text) ? "out" : null;
    if (quick) {
      const spec =
        quick === "out"
          ? { scale: 1.85, duration: 2.5, easing: "easeInOut", label: "Zoom out" }
          : { scale: 1.5, duration: 1, easing: "easeInOut", label: "Zoom in & out" };
      return {
        ok: true,
        summary: quick === "out" ? "added a zoom out at the playhead" : "added a quick zoom in & out",
        steps: [`Focus on ${tpNear?.label ?? "the centre"}`, `${spec.label} over ${spec.duration}s`, "Preview"],
        run: (st) =>
          st.addEffect(
            "zoom",
            { mode: spec.label, scale: spec.scale, easing: spec.easing, kind: quick },
            { start: at, duration: spec.duration, x: tpNear?.x ?? 0.5, y: tpNear?.y ?? 0.45, label: spec.label },
          ),
      };
    }
    const m = raw.match(/zoom (?:in(?:to)?|on) (?:the )?([a-z0-9 '"-]+?)(?:\.|$)/i);
    const targetName = m?.[1]?.trim() && !/^(here|now|this)$/i.test(m[1].trim()) ? m[1].trim() : undefined;
    const tp =
      (targetName && p.touchpoints.find((t) => t.label?.toLowerCase().includes(targetName.split(" ")[0]))) ||
      tpNear;
    return {
      ok: true,
      summary: targetName ? `zoomed into “${targetName}”` : "added a zoom at the playhead",
      steps: [`Find the focal point${tp ? ` (${tp.label})` : ""}`, "Add a 1.8× push", "Ease in over 0.6s", "Preview"],
      run: (st) =>
        st.addEffect(
          "zoom",
          { mode: tp ? "Touchpoint Zoom" : "Custom Zoom", scale: 1.8, easing: "easeOut", kind: "in" },
          {
            start: at,
            duration: 2.4,
            x: tp?.x ?? 0.5,
            y: tp?.y ?? 0.45,
            label: targetName ? `Zoom → ${targetName}` : "Zoom",
          },
        ),
    };
  }

  // --- add a transition here
  if (/transition/.test(text)) {
    const style =
      TRANSITION_STYLES.map((x) => x.toLowerCase()).find((x) => text.includes(x)) ??
      "dissolve";
    return {
      ok: true,
      summary: `added a ${style} transition`,
      steps: [`Place a ${style} at ${at.toFixed(1)}s`, "Set length 0.5s", "Preview"],
      run: (st) =>
        st.addEffect(
          "transition",
          { style: style[0].toUpperCase() + style.slice(1), duration: 0.5 },
          { start: at, duration: 0.5, label: `${style} transition` },
        ),
    };
  }

  // --- subtitle background style
  if (/subtitle|caption/.test(text) && /(plain|dark|light|smoky|smokey|background|\bbg\b)/.test(text)) {
    const preset = SUBTITLE_STYLES.find((x) => x.test.test(text));
    if (preset) {
      return {
        ok: true,
        summary: `set the subtitles to ${preset.label.toLowerCase()}`,
        steps: ["Select all caption cues", `Apply ${preset.label}`, "Check legibility", "Preview"],
        run: (st) => {
          const cur = st.editing()!;
          if (!cur.subtitles.length) transcribeToSubtitles(cur, st);
          st.editing()!.subtitles.forEach((x) => st.updateSubtitle(x.id, { highlight: preset.patch }));
        },
      };
    }
  }

  // --- subtitles
  if (/subtitle|caption|transcri/.test(text) && /(add|generate|create|turn on|transcri)/.test(text)) {
    return {
      ok: true,
      summary: "transcribed the video into subtitles",
      steps: ["Run speech-to-text on the audio", "Split the transcript into caption lines", "Time each line", "Auto-match highlighter colour", "Preview"],
      run: (st) => transcribeToSubtitles(st.editing()!, st),
    };
  }
  if (/subtitle|caption|text/.test(text) && /(higher|up|above|raise|lift)/.test(text)) {
    return {
      ok: true,
      summary: "moved the subtitles higher",
      steps: ["Select all caption cues", "Move to just above middle", "Preview"],
      run: (st) =>
        st.commit("AI: raise subtitles", (d) => d.subtitles.forEach((x) => (x.position = "above-middle"))),
    };
  }
  if (/subtitle|caption|text/.test(text) && /(lower|down|below|drop)/.test(text)) {
    return {
      ok: true,
      summary: "moved the subtitles lower",
      steps: ["Select all caption cues", "Move to bottom", "Preview"],
      run: (st) => st.commit("AI: lower subtitles", (d) => d.subtitles.forEach((x) => (x.position = "bottom"))),
    };
  }

  // --- tint
  if (/tint|colou?r grade|grade|filter/.test(text)) {
    const dark = /dark|midnight|moody|black/.test(text);
    const warm = /warm/.test(text);
    const preset = dark ? "Midnight" : warm ? "Warm" : /cinematic/.test(text) ? "Cinematic" : "Clean";
    return {
      ok: true,
      summary: `applied a ${dark ? "dark " : ""}${preset.toLowerCase()} tint`,
      steps: [`Set preset ${preset}`, `Intensity ${dark ? "0.30" : "0.18"}`, "Check text legibility", "Preview"],
      run: (st) =>
        st.setTint({
          preset,
          color: dark ? "#0A0A0F" : warm ? "#FD9D43" : "#5B5FD1",
          intensity: dark ? 0.3 : 0.18,
          brightness: dark ? -0.06 : 0.03,
        }),
    };
  }

  // --- make the intro shorter
  if (/(intro|hook|opening|beginning).*(short|tight|faster|snappier)/.test(text) || /shorten.*(intro|hook)/.test(text)) {
    return {
      ok: true,
      summary: "tightened the intro",
      steps: ["Trim the Hook chapter to 8s", "Shift everything left", "Preview"],
      run: (st) =>
        st.commit("AI: shorten intro", (d) => {
          const c = d.chapters[0];
          if (!c) return;
          const cut = Math.max(0, c.duration - 8);
          c.duration = 8;
          for (let i = 1; i < d.chapters.length; i++) d.chapters[i].start -= cut;
          const vc = d.clips.filter((x) => x.track === "video")[0];
          if (vc) vc.duration = Math.max(2, vc.duration - cut);
          d.durationSec = Math.max(1, d.durationSec - cut);
        }),
    };
  }

  // --- add a CTA
  if (/\bcta\b|call to action|call-to-action/.test(text)) {
    const label = CTA_LABELS.find((x) => text.includes(x.toLowerCase())) ?? "Start Free Trial";
    return {
      ok: true,
      summary: `added a ${label} CTA`,
      steps: ["Create a CTA layer over the last 8s", "Style with brand colour", "Pop animation", "Preview"],
      run: (st) => {
        const cur = st.editing()!;
        st.addEffect(
          "cta",
          { text: label, template: label, url: "https://northwind.io/try", animation: "Pop", bg: "#5B5FD1", color: "#FFFFFF" },
          { start: Math.max(0, cur.durationSec - 8), duration: 8, x: 0.5, y: 0.8, label: `CTA — ${label}` },
        );
      },
    };
  }

  // --- make this more engaging (compound)
  if (/(more engaging|more dynamic|punch|spice|better|polish|more interesting)/.test(text)) {
    return {
      ok: true,
      summary: "made a pass for engagement",
      steps: [
        "Add zooms on the two strongest touchpoints",
        "Ripple every key tap",
        "Dissolve between chapters",
        "Cinematic tint +0.06",
        "Kinetic caption animation",
        "Preview",
      ],
      run: (st) => {
        const cur = st.editing()!;
        cur.touchpoints
          .filter((t) => t.key)
          .slice(0, 2)
          .forEach((t) =>
            st.addEffect(
              "zoom",
              { mode: "Touchpoint Zoom", scale: 1.6, easing: "easeOut" },
              { start: Math.max(0, t.t - 0.4), duration: 2, x: t.x, y: t.y, label: `Zoom → ${t.label}` },
            ),
          );
        cur.touchpoints
          .filter((t) => t.key)
          .forEach((t) =>
            st.addEffect(
              "touchpoint",
              { style: "Pulse", size: 56, color: "#3FD1CC", opacity: 0.75, duration: 1 },
              { start: t.t, duration: 1.2, x: t.x, y: t.y, label: `Pulse → ${t.label}` },
            ),
          );
        st.editing()!.chapters.slice(1).forEach((c) =>
          st.addEffect("transition", { style: "Dissolve", duration: 0.4 }, { start: c.start, duration: 0.4, label: "Dissolve" }),
        );
        st.setTint({ preset: "Cinematic", intensity: Math.min(0.3, cur.tint.intensity + 0.06) });
        st.commit("AI: kinetic captions", (d) => d.subtitles.forEach((x) => (x.animation = "Kinetic")));
      },
    };
  }

  // --- add touchpoint effect / highlight
  if (/(touchpoint|ripple|pulse|glow|spotlight|highlight the tap)/.test(text)) {
    const style =
      ["ripple", "pulse", "glow", "spotlight", "magnify"].find((x) => text.includes(x)) ?? "ripple";
    const tp = p.touchpoints.slice().sort((a, b) => Math.abs(a.t - at) - Math.abs(b.t - at))[0];
    return {
      ok: true,
      summary: `added a ${style} on the nearest touchpoint`,
      steps: [`Find the touch near ${at.toFixed(1)}s`, `Apply ${style}`, "Preview"],
      run: (st) =>
        st.addEffect(
          "touchpoint",
          { style: style[0].toUpperCase() + style.slice(1), size: 60, color: "#3FD1CC", opacity: 0.8, duration: 1.1 },
          { start: tp?.t ?? at, duration: 1.4, x: tp?.x ?? 0.5, y: tp?.y ?? 0.5, label: `${style} → ${tp?.label ?? "tap"}` },
        ),
    };
  }

  // --- clip speed
  const speedMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:x|×|times)/);
  if (speedMatch && /(speed|slow|fast|play|clip|set|x|×)/.test(text)) {
    const speed = Math.min(5, Math.max(0.5, Number(speedMatch[1])));
    return {
      ok: true,
      summary: `play the video at ${speed}×`,
      // speed is a whole-video setting: a per-clip one was never played back
      // or exported, so asking for it here did nothing either
      steps: [`Set playback to ${speed}×`, "Preview"],
      run: (st) => st.setProjectSpeed(speed),
    };
  }

  return noop;
}

// ---- follow-up questions for vague voice commands ----------------------
export const TRANSITION_STYLES = ["Fade", "Dissolve", "Slide", "Push", "Scale", "Zoom", "Blur", "Morph", "Swipe", "Whip", "Light", "Minimal"];
export const CTA_LABELS = ["Start Free Trial", "Learn More", "Book a Demo", "Try This Feature", "Download Guide", "Visit Website", "Get Started"];

const SUBTITLE_STYLES: { label: string; test: RegExp; patch: Partial<SubtitleCue["highlight"]> }[] = [
  { label: "Dark smoky background", test: /\bdark smok/, patch: { enabled: true, auto: false, color: "#0A0A0F", style: "soft", opacity: 0.42, radius: 12, padding: 10 } },
  { label: "Light smoky background", test: /\blight smok/, patch: { enabled: true, auto: false, color: "#F4F4F8", style: "soft", opacity: 0.42, radius: 12, padding: 10 } },
  { label: "Dark background", test: /\bdark\b/, patch: { enabled: true, auto: false, color: "#0A0A0F", style: "rounded", opacity: 0.85, radius: 10, padding: 10 } },
  { label: "Light background", test: /\blight\b/, patch: { enabled: true, auto: false, color: "#F4F4F8", style: "rounded", opacity: 0.92, radius: 10, padding: 10 } },
  { label: "Plain style", test: /plain|no background|without background/, patch: { enabled: false } },
];

export interface FollowUpOption {
  label: string;
  /** a fully specified command that interpretCommand can apply directly */
  command: string;
}
export interface FollowUp {
  heard: string;
  question: string;
  options: FollowUpOption[];
}

/** When a command names an edit but not its type (a transition with no style),
 * return a clarifying question with concrete choices instead of guessing. */
export function followUpFor(raw: string): FollowUp | null {
  const text = raw.toLowerCase().trim();
  const has = (words: string[]) => words.some((w) => text.includes(w));
  if (!text) return null;

  if (/transition/.test(text) && !has(TRANSITION_STYLES.map((s) => s.toLowerCase()))) {
    return {
      heard: raw,
      question: "Which transition should I use?",
      options: TRANSITION_STYLES.map((s) => ({ label: s, command: `Add a ${s.toLowerCase()} transition here` })),
    };
  }
  if (/\bzoom\b/.test(text) && !/transition/.test(text) && !/zoom(?:ing)? (in|out|into|on)\b|quick|pulse/.test(text)) {
    return {
      heard: raw,
      question: "What kind of zoom?",
      options: [
        { label: "Zoom in", command: "Zoom in here" },
        { label: "Zoom out", command: "Zoom out here" },
        { label: "In & out quickly", command: "Zoom in and out quickly" },
        { label: "Into the tapped button", command: "Zoom into the button" },
      ],
    };
  }
  if (/tint|colou?r grade|\bgrade\b|filter/.test(text) && !has(["dark", "midnight", "moody", "black", "warm", "cinematic", "clean"])) {
    return {
      heard: raw,
      question: "Which tint?",
      options: [
        { label: "Dark", command: "Add a dark tint" },
        { label: "Warm", command: "Add a warm tint" },
        { label: "Cinematic", command: "Add a cinematic tint" },
        { label: "Clean", command: "Add a clean tint" },
      ],
    };
  }
  if (/subtitle|caption/.test(text) && /(style|background|\bbg\b|look)/.test(text) && !has(["plain", "dark", "light", "smok"])) {
    return {
      heard: raw,
      question: "Which subtitle style?",
      options: [
        { label: "Plain", command: "Make the subtitles plain" },
        { label: "Dark bg", command: "Give the subtitles a dark background" },
        { label: "Light bg", command: "Give the subtitles a light background" },
        { label: "Dark smoky bg", command: "Give the subtitles a dark smoky background" },
        { label: "Light smoky bg", command: "Give the subtitles a light smoky background" },
      ],
    };
  }
  if (/(speed|slow ?mo|slow down|faster|slower)/.test(text) && !/\d/.test(text) && !/(intro|hook|opening)/.test(text)) {
    const slow = /slow/.test(text);
    const opts = slow ? [0.25, 0.5, 0.75] : /fast|speed up/.test(text) ? [1.25, 1.5, 2, 3] : [0.5, 1, 1.5, 2];
    return {
      heard: raw,
      question: "What speed?",
      options: opts.map((v) => ({ label: `${v}×`, command: `Set the clip speed to ${v}x` })),
    };
  }
  if (/(touchpoint|tap effect|touch effect)/.test(text) && !has(["ripple", "pulse", "glow", "spotlight", "magnify"])) {
    return {
      heard: raw,
      question: "Which touchpoint effect?",
      options: ["Ripple", "Pulse", "Glow", "Spotlight"].map((s) => ({ label: s, command: `Add a ${s.toLowerCase()} touchpoint effect` })),
    };
  }
  if (/\bcta\b|call to action|call-to-action/.test(text) && !has(CTA_LABELS.map((l) => l.toLowerCase()))) {
    return {
      heard: raw,
      question: "What should the CTA say?",
      options: CTA_LABELS.slice(0, 5).map((l) => ({ label: l, command: `Add a ${l} CTA` })),
    };
  }
  return null;
}

/** Offered when a command couldn't be mapped to an edit at all. */
export function fallbackFollowUp(raw: string): FollowUp {
  return {
    heard: raw,
    question: "I didn't catch an edit — did you mean one of these?",
    options: [
      { label: "Add a transition", command: "Put a transition here" },
      { label: "Zoom", command: "Zoom this part" },
      { label: "Subtitles", command: "Add subtitles" },
      { label: "Tint", command: "Add a tint" },
      { label: "CTA", command: "Add a CTA" },
    ],
  };
}

/** Phrases the simulated speech-to-text can "hear" — deliberately includes
 * vague ones so the follow-up question flow is exercised. */
export const VOICE_HEARD = [
  "Put a transition here",
  "Zoom this part",
  "Add a tint",
  "Change the speed",
  "Change the subtitle style",
  "Add a CTA",
  "Split this clip here",
  "Cut the last five seconds",
  "Add subtitles",
  "Make this video more engaging",
];

// ---- quick suggestion chips for the Ask Screvo sheet -------------------
export const ASK_EXAMPLES = [
  "Cut the last five seconds",
  "Split this clip here",
  "Remove this section",
  "Zoom into the button",
  "Add a transition here",
  "Add subtitles",
  "Move the subtitles higher",
  "Add a dark tint",
  "Make the intro shorter",
  "Add a CTA",
  "Make this video more engaging",
];
