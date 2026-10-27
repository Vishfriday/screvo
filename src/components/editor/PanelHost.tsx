import React from "react";
import { Sheet } from "../ui/Sheet";
import { useStore } from "@/store/useStore";
import {
  TrimPanel, SpeedPanel, VolumePanel, CropPanel, ZoomPanel, ParallaxPanel, TransitionPanel,
  EffectsPanel, AnimationsPanel, TintPanel, TouchpointPanel, TextPanel, SubtitlePanel, CTAPanel,
  AIEditPanel, ScriptPanel, AssetsPanel,
} from "./panels/all";
import { IntroPanel, MusicPanel } from "./panels/media";
import { NoisePanel } from "./panels/noise";
import { LivePreview } from "./LivePreview";
import { ReframePreview } from "./ReframePreview";

// `preview` replaces the thumbnail strip for panels that need the video big
// enough to work on directly
const REGISTRY: Record<
  string,
  { title: string; subtitle: string; C: React.ComponentType; size: "md" | "lg"; preview?: React.ComponentType }
> = {
  trim: { title: "Trim", subtitle: "Adjust clip in / out points", C: TrimPanel, size: "md" },
  speed: { title: "Speed", subtitle: "Play the video faster or slower", C: SpeedPanel, size: "lg" },
  intro: { title: "Intro & Title", subtitle: "An opening card from a template", C: IntroPanel, size: "lg" },
  music: { title: "Music", subtitle: "A bed under the narration", C: MusicPanel, size: "lg" },
  noise: { title: "Noise Cancellation", subtitle: "Clean the recording's own sound", C: NoisePanel, size: "lg" },
  volume: { title: "Volume", subtitle: "Level a track", C: VolumePanel, size: "md" },
  crop: { title: "Crop", subtitle: "Shape, framing, pinch to zoom", C: CropPanel, size: "lg", preview: ReframePreview },
  zoom: { title: "Zoom", subtitle: "Push in on the action", C: ZoomPanel, size: "lg" },
  parallax: { title: "Parallax", subtitle: "Add depth and motion", C: ParallaxPanel, size: "lg" },
  transition: { title: "Transitions", subtitle: "Between clips & chapters", C: TransitionPanel, size: "lg" },
  effects: { title: "Effects", subtitle: "Filters and looks", C: EffectsPanel, size: "lg" },
  animations: { title: "Animations", subtitle: "Clip entrance & exit", C: AnimationsPanel, size: "lg" },
  tint: { title: "Tint", subtitle: "Grade the raw recording", C: TintPanel, size: "lg" },
  touchpoint: { title: "Touchpoint", subtitle: "Effects on real touch coordinates", C: TouchpointPanel, size: "lg" },
  text: { title: "Text", subtitle: "Overlays & vertical text", C: TextPanel, size: "lg" },
  subtitles: { title: "Subtitles", subtitle: "Captions & smart highlighters", C: SubtitlePanel, size: "lg" },
  cta: { title: "CTA", subtitle: "Call-to-action layer", C: CTAPanel, size: "lg" },
  aiedit: { title: "AI Edit", subtitle: "Claude Opus recommendations", C: AIEditPanel, size: "lg" },
  script: { title: "Script & Voiceover", subtitle: "AI narration you control", C: ScriptPanel, size: "lg" },
  assets: { title: "Assets", subtitle: "Icons, shapes, stickers & more", C: AssetsPanel, size: "lg" },
};

export function PanelHost() {
  const activePanel = useStore((s) => s.activePanel);
  const closePanel = useStore((s) => s.closePanel);
  const placePicker = useStore((s) => s.placePicker);
  const cancelPlacing = useStore((s) => s.cancelPlacing);
  const entry = activePanel ? REGISTRY[activePanel] : null;

  return (
    <Sheet
      open={!!entry}
      onClose={closePanel}
      title={entry?.title}
      subtitle={entry?.subtitle}
      size={entry?.size ?? "md"}
      preview={
        entry && !placePicker
          ? entry.preview
            ? React.createElement(entry.preview)
            : <LivePreview />
          : undefined
      }
      peek={!!placePicker}
      peekLabel={placePicker?.label}
      onPeekCancel={cancelPlacing}
    >
      {entry ? <entry.C /> : null}
    </Sheet>
  );
}
