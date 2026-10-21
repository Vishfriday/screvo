/**
 * Intro templates — the opening card drawn over the first seconds of a video.
 *
 * Each one is data, not a component: `VideoStage` reads the background, layout
 * and motion fields and draws the card, so adding a template here is enough to
 * make it appear everywhere the preview is shown.
 */

export type IntroBackground = "solid" | "gradient" | "glass" | "none" | "split";
export type IntroLayout = "center" | "lower-third" | "left";
export type IntroMotion = "fade" | "rise" | "slide" | "scale";

export interface IntroTemplate {
  id: string;
  name: string;
  blurb: string;
  background: IntroBackground;
  layout: IntroLayout;
  motion: IntroMotion;
  /** title size in the 9:16 preview, scaled with the stage */
  titleSize: number;
  /** a rule or bar drawn in the accent colour */
  rule: boolean;
  /** seconds the card stays up by default */
  duration: number;
}

export const INTRO_TEMPLATES: IntroTemplate[] = [
  {
    id: "clean-fade",
    name: "Clean Fade",
    blurb: "Title fades up on black, then dissolves into the footage",
    background: "solid",
    layout: "center",
    motion: "fade",
    titleSize: 30,
    rule: true,
    duration: 2.4,
  },
  {
    id: "brand-bar",
    name: "Brand Bar",
    blurb: "Full brand gradient with the title sliding in",
    background: "gradient",
    layout: "left",
    motion: "slide",
    titleSize: 28,
    rule: true,
    duration: 2.6,
  },
  {
    id: "glass-card",
    name: "Glass Card",
    blurb: "A frosted card over the opening shot — the app stays visible",
    background: "glass",
    layout: "center",
    motion: "rise",
    titleSize: 24,
    rule: false,
    duration: 2.6,
  },
  {
    id: "bold-type",
    name: "Bold Type",
    blurb: "Oversized type scaling in, for a punchy social opener",
    background: "solid",
    layout: "center",
    motion: "scale",
    titleSize: 40,
    rule: false,
    duration: 2.2,
  },
  {
    id: "lower-third",
    name: "Lower Third",
    blurb: "Accent bar and title at the bottom, footage playing behind",
    background: "none",
    layout: "lower-third",
    motion: "slide",
    titleSize: 22,
    rule: true,
    duration: 3.2,
  },
  {
    id: "split-reveal",
    name: "Split Reveal",
    blurb: "Two halves part to reveal the recording",
    background: "split",
    layout: "center",
    motion: "fade",
    titleSize: 26,
    rule: false,
    duration: 2.4,
  },
];

export const DEFAULT_INTRO_TEMPLATE = INTRO_TEMPLATES[0];

export function introTemplate(id?: string): IntroTemplate {
  return INTRO_TEMPLATES.find((t) => t.id === id) ?? DEFAULT_INTRO_TEMPLATE;
}

/**
 * How far through the card we are, 0 before it starts and 1 once it is gone.
 * Everything the card draws is interpolated from this, so it stays in step with
 * the playhead whether it is playing or being scrubbed.
 */
export function introProgress(t: number, duration: number): number {
  if (duration <= 0) return 1;
  return Math.max(0, Math.min(1, t / duration));
}
