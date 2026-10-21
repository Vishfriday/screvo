import type { Project, Chapter, Clip, Effect, SubtitleCue, Touchpoint, ScriptSegment } from "@/lib/types";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

const defaultTint = {
  preset: "Clean",
  color: "#5B5FD1",
  intensity: 0.14,
  brightness: 0.03,
  contrast: 0.08,
  saturation: 0.06,
  opacity: 0.16,
};

const defaultVoice = {
  voice: "Ava — Warm",
  language: "English (US)",
  speed: 1,
  tone: "Conversational",
};

// --- Flagship demo -------------------------------------------------------------
function buildFlagship(): Project {
  const chapters: Chapter[] = [
    { id: "ch_hook", name: "Hook", start: 0, duration: 12, frame: 0, summary: "Opens on the pain: setting up a client space by hand takes all morning." },
    { id: "ch_solution", name: "Solution Overview", start: 12, duration: 18, frame: 2, summary: "Northwind's Customer Workspace does it in four taps." },
    { id: "ch_feature", name: "Feature Walkthrough", start: 30, duration: 45, frame: 3, summary: "Name it, invite the customer, set permissions, confirm." },
    { id: "ch_results", name: "Results & Value", start: 75, duration: 15, frame: 7, summary: "A branded, permission-scoped space your customer can log into immediately." },
    { id: "ch_cta", name: "Call to Action", start: 90, duration: 12, frame: 6, summary: "Try it on your next onboarding — free for 14 days." },
  ];

  const clips: Clip[] = [
    { id: "clip_1", track: "video", start: 0, duration: 12, label: "Intro screen", frame: 0, speed: 1, volume: 1, color: "#5B5FD1" },
    { id: "clip_2", track: "video", start: 12, duration: 18, label: "Choose workspace type", frame: 2, speed: 1, volume: 1, color: "#3FD1CC" },
    { id: "clip_3", track: "video", start: 30, duration: 16, label: "Name + invite", frame: 3, speed: 1, volume: 1, color: "#FD9D43" },
    { id: "clip_4", track: "video", start: 46, duration: 16, label: "Invite teammates", frame: 4, speed: 1, volume: 1, color: "#FD9D43" },
    { id: "clip_5", track: "video", start: 62, duration: 13, label: "Permissions", frame: 5, speed: 1, volume: 1, color: "#FD9D43" },
    { id: "clip_6", track: "video", start: 75, duration: 15, label: "Workspace dashboard", frame: 7, speed: 1, volume: 1, color: "#EDBF1B" },
    { id: "clip_7", track: "video", start: 90, duration: 12, label: "Success + CTA", frame: 6, speed: 1, volume: 1, color: "#7C8CF8" },
    { id: "aud_1", track: "audio", start: 0, duration: 102, label: "AI narration — Ava", volume: 0.9, color: "#3FD1CC" },
    { id: "aud_2", track: "audio", start: 0, duration: 102, label: "Music bed — Soft Rise", volume: 0.22, color: "#565670" },
  ];

  const touchpoints: Touchpoint[] = [
    { id: uid("tp"), x: 0.82, y: 0.86, t: 6.4, label: "Tap +", key: true },
    { id: uid("tp"), x: 0.5, y: 0.62, t: 14.2, label: "New Workspace", key: true },
    { id: uid("tp"), x: 0.5, y: 0.3, t: 22.0, label: "Customer Workspace", key: true },
    { id: uid("tp"), x: 0.5, y: 0.26, t: 34.5, label: "Name field", key: true },
    { id: uid("tp"), x: 0.5, y: 0.22, t: 50.0, label: "Add email", key: true },
    { id: uid("tp"), x: 0.86, y: 0.34, t: 66.0, label: "Toggle permission", key: true },
    { id: uid("tp"), x: 0.5, y: 0.8, t: 71.5, label: "Confirm", key: true },
    { id: uid("tp"), x: 0.5, y: 0.68, t: 96.0, label: "Open workspace", key: true },
  ];

  const effects: Effect[] = [
    { id: uid("fx"), type: "zoom", start: 6, duration: 3, x: 0.82, y: 0.86, label: "Zoom → + button", params: { mode: "Touchpoint Zoom", scale: 1.8, easing: "easeOut" } },
    { id: uid("fx"), type: "touchpoint", start: 14, duration: 1.6, x: 0.5, y: 0.62, label: "Ripple → New Workspace", params: { style: "Ripple", size: 64, color: "#3FD1CC", opacity: 0.8, duration: 1.2 } },
    { id: uid("fx"), type: "transition", start: 30, duration: 0.6, label: "Whip → walkthrough", params: { style: "Whip", duration: 0.6 } },
    { id: uid("fx"), type: "zoom", start: 50, duration: 3.5, x: 0.5, y: 0.22, label: "Smart Focus → invite row", params: { mode: "Smart Focus", scale: 1.5, easing: "easeInOut" } },
    { id: uid("fx"), type: "transition", start: 75, duration: 0.5, label: "Dissolve → results", params: { style: "Dissolve", duration: 0.5 } },
    { id: uid("fx"), type: "tint", start: 0, duration: 102, label: "Cinematic tint", params: { preset: "Cinematic" } },
    { id: uid("fx"), type: "cta", start: 92, duration: 8, x: 0.5, y: 0.8, label: "CTA — Start Free Trial", params: { text: "Start Free Trial", template: "Start Free Trial", url: "https://northwind.io/try", animation: "Pop", bg: "#5B5FD1", color: "#FFFFFF" } },
    { id: uid("fx"), type: "text", start: 2, duration: 6, x: 0.5, y: 0.32, label: "Vertical text — 'All morning.'", params: { text: "All morning.\nGone.", orientation: "vertical", position: "center", animation: "Kinetic" } },
  ];

  const subtitles: SubtitleCue[] = [
    ["Setting up a client space by hand?", 0.5, 4.5, "bottom"],
    ["That used to take all morning.", 5.2, 4.5, "bottom"],
    ["Northwind does it in four taps.", 12.5, 4.5, "above-middle"],
    ["Pick Customer Workspace.", 20, 4, "bottom"],
    ["Give it a name your client will recognise.", 33, 5, "bottom"],
    ["Invite the customer and your team.", 47, 4.5, "bottom"],
    ["Scope exactly what they can see.", 63, 4.5, "bottom"],
    ["Done. A branded space, ready to log into.", 76, 5, "above-middle"],
    ["Try it on your next onboarding.", 91, 4, "bottom"],
    ["Free for 14 days.", 96, 4, "bottom"],
  ].map(([text, start, duration, position]) => ({
    id: uid("sub"),
    start: start as number,
    duration: duration as number,
    text: text as string,
    orientation: "horizontal" as const,
    position: position as string,
    animation: "Word-by-word",
    highlight: {
      enabled: true,
      auto: true,
      color: "#0A0A0F",
      style: "rounded",
      opacity: 0.55,
      radius: 10,
      padding: 8,
    },
  }));

  const script: ScriptSegment[] = [
    { id: uid("sc"), chapterId: "ch_hook", start: 0, text: "Setting up a client space by hand? That used to eat your whole morning — folders, invites, permissions, one at a time." },
    { id: uid("sc"), chapterId: "ch_solution", start: 12, text: "Northwind's Customer Workspace collapses all of that into four taps. Here's the whole thing." },
    { id: uid("sc"), chapterId: "ch_feature", start: 30, text: "Pick Customer Workspace. Name it something your client will recognise. Invite the customer and the teammates who'll support them. Then scope exactly what they can see — view, comment, nothing they shouldn't touch." },
    { id: uid("sc"), chapterId: "ch_results", start: 75, text: "And that's it. A branded, permission-scoped workspace your customer can log into right now — no back-and-forth." },
    { id: uid("sc"), chapterId: "ch_cta", start: 90, text: "Try it on your next onboarding. It's free for fourteen days." },
  ];

  const now = Date.now();
  return {
    id: "proj_flagship",
    name: "How to Create a Customer Workspace",
    status: "ready",
    durationSec: 102,
    createdAt: now - 1000 * 60 * 60 * 26,
    updatedAt: now - 1000 * 60 * 42,
    aspect: "9:16",
    summary:
      "A 1:42 vertical walkthrough of Northwind's Customer Workspace setup — from the four-tap create flow to a branded, permission-scoped space the customer can log into immediately. Five chapters, AI narration, smart zooms on every touchpoint, and a Start Free Trial CTA.",
    thumbnailFrame: 2,
    chapters,
    clips,
    effects,
    subtitles,
    touchpoints,
    script,
    tint: { ...defaultTint, preset: "Cinematic", intensity: 0.2 },
    voice: defaultVoice,
  };
}

// --- Lighter demo projects ---------------------------------------------------
function lightProject(
  id: string,
  name: string,
  status: Project["status"],
  durationSec: number,
  summary: string,
  thumbFrame: number,
  updatedAgoMin: number,
  shared = false,
): Project {
  const seg = durationSec / 5;
  const names = ["Hook", "Solution Overview", "Feature Walkthrough", "Results & Value", "Call to Action"];
  const chapters: Chapter[] = names.map((n, k) => ({
    id: `${id}_ch${k}`,
    name: n,
    start: Math.round(seg * k),
    duration: Math.round(seg),
    frame: k + 1,
    summary: "",
  }));
  const clips: Clip[] = chapters.map((c, k) => ({
    id: `${id}_cl${k}`,
    track: "video" as const,
    start: c.start,
    duration: c.duration,
    label: c.name,
    frame: k + 1,
    speed: 1,
    volume: 1,
    color: ["#5B5FD1", "#3FD1CC", "#FD9D43", "#EDBF1B", "#7C8CF8"][k],
  }));
  clips.push({ id: `${id}_aud`, track: "audio", start: 0, duration: durationSec, label: "AI narration", volume: 0.9, color: "#3FD1CC" });
  const now = Date.now();
  return {
    id,
    name,
    status,
    durationSec,
    createdAt: now - 1000 * 60 * 60 * 24 * 3,
    updatedAt: now - 1000 * 60 * updatedAgoMin,
    aspect: "9:16",
    summary,
    thumbnailFrame: thumbFrame,
    chapters,
    clips,
    effects: [
      { id: uid("fx"), type: "tint", start: 0, duration: durationSec, label: "Clean tint", params: { preset: "Clean" } },
      { id: uid("fx"), type: "zoom", start: seg, duration: 3, x: 0.5, y: 0.4, label: "Zoom — key step", params: { mode: "Dynamic Zoom", scale: 1.4, easing: "easeInOut" } },
    ],
    subtitles: [],
    touchpoints: [
      { id: uid("tp"), x: 0.5, y: 0.5, t: seg * 1.2, label: "Key tap", key: true },
      { id: uid("tp"), x: 0.7, y: 0.7, t: seg * 3.1, label: "Key tap", key: true },
    ],
    script: chapters.map((c) => ({ id: uid("sc"), chapterId: c.id, start: c.start, text: "" })),
    tint: defaultTint,
    voice: defaultVoice,
    shared,
  };
}

export function makeDemoProjects(): Project[] {
  return [
    buildFlagship(),
    lightProject(
      "proj_feature",
      "Product Feature Walkthrough",
      "ready",
      88,
      "Vertical tour of the new bulk-actions bar: select rows, apply a status, undo. Built for the in-app What's New slot.",
      4,
      180,
    ),
    lightProject(
      "proj_onboarding",
      "Employee Onboarding Guide",
      "published",
      126,
      "Day-one checklist walkthrough for new hires: accounts, tools, first task. Doubles as an SOP PDF export.",
      7,
      60 * 20,
    ),
    lightProject(
      "proj_release",
      "March Release Highlights",
      "draft",
      54,
      "Fast-cut montage of three shipped features for the monthly changelog post.",
      1,
      12,
    ),
    lightProject(
      "proj_sop",
      "Refund Approval SOP",
      "shared",
      71,
      "Step-by-step: locate the order, verify the policy window, issue the refund, log the reason.",
      5,
      60 * 30,
      true,
    ),
  ];
}
