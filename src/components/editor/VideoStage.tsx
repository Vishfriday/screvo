import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useVideoPlayer, VideoView } from "expo-video";
import { useStore } from "@/store/useStore";
import { sourceTimeAt } from "@/lib/timemap";
import type { Project, Effect } from "@/lib/types";
import { Frame, BASE_W, BASE_H } from "@/data/frames";
import { RippleOnce, PulseRing } from "../ui/Motion";
import { introTemplate, introProgress } from "@/data/intros";
import { projectSpeed } from "@/lib/speed";
import { IntroCard } from "./IntroCard";

/**
 * Plays the project's real footage, driven by the editor playhead: seeks while
 * scrubbing and rolls while playing, so every effect stays in sync with it.
 */
function SourceVideo({
  uri,
  projectId,
  playhead,
  playing,
  removed,
  speed = 1,
  volume = 0,
}: {
  uri: string;
  projectId: string;
  playhead: number;
  playing?: boolean;
  removed?: { at: number; len: number }[];
  /** how fast the finished video runs — the footage is played at this rate */
  speed?: number;
  /** the recording's own sound in the preview; 0 keeps it silent */
  volume?: number;
}) {
  const storePlaying = useStore((s) => s.playing);
  const setRealDuration = useStore((s) => s.setRealDuration);
  const setFrameSize = useStore((s) => s.setFrameSize);
  const isPlaying = playing ?? storePlaying;
  const player = useVideoPlayer(uri, (pl) => {
    pl.loop = false;
    pl.muted = true;
  });

  // The recording's own sound is silent until something asks for it, so the two
  // previews on screen at once can never talk over each other. Noise reduction
  // is not applied here — the panel renders a sample for that — so what plays is
  // the raw room at the level the export will use.
  useEffect(() => {
    try {
      player.muted = volume <= 0;
      player.volume = Math.max(0, Math.min(1, volume));
    } catch {
      // the player is not ready yet
    }
  }, [player, volume]);
  const gotDuration = useRef(false);
  const gotSize = useRef(false);

  useEffect(() => {
    try {
      const at = sourceTimeAt({ removed }, playhead);
      if (isPlaying) {
        // the playhead already advances `speed` seconds per real second, so the
        // footage has to roll at the same rate or the two drift apart
        if (player.playbackRate !== speed) player.playbackRate = speed;
        // a faster rate covers more ground between ticks, so the tolerance for
        // "close enough" has to grow with it or it reseeks constantly
        if (Math.abs(player.currentTime - at) > 0.4 * speed) player.currentTime = at;
        player.play();
      } else {
        player.pause();
        if (Math.abs(player.currentTime - at) > 0.05) player.currentTime = at;
      }
      if (!gotDuration.current && player.duration > 0) {
        gotDuration.current = true;
        setRealDuration(projectId, player.duration);
      }
      if (!gotSize.current) {
        const size = player.videoTrack?.size;
        if (size?.width && size?.height) {
          gotSize.current = true;
          setFrameSize(projectId, size.width, size.height);
        }
      }
    } catch {
      // the player is not ready yet — the next playhead tick retries
    }
  }, [isPlaying, playhead, player, projectId, setRealDuration, setFrameSize, removed, speed]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function activeAt<T extends { start: number; duration: number }>(items: T[], t: number): T[] {
  return items.filter((i) => t >= i.start && t <= i.start + i.duration);
}

const TINT_PRESETS: Record<string, { color: string; opacity: number }> = {
  Original: { color: "#000000", opacity: 0 },
  Clean: { color: "#5B5FD1", opacity: 0.1 },
  Cool: { color: "#3FD1CC", opacity: 0.16 },
  Warm: { color: "#FD9D43", opacity: 0.16 },
  Midnight: { color: "#0A0A0F", opacity: 0.36 },
  Soft: { color: "#B4B4C8", opacity: 0.12 },
  Cinematic: { color: "#1B1B3A", opacity: 0.26 },
  Brand: { color: "#5B5FD1", opacity: 0.22 },
  Subtle: { color: "#5B5FD1", opacity: 0.06 },
};

function subPosition(orientation: string, position: string) {
  if (orientation === "vertical") {
    const left = position.includes("left") ? 0.38 : position.includes("right") ? 0.62 : 0.5;
    return { leftPct: left, topPct: 0.5, vertical: true };
  }
  const map: Record<string, number> = { bottom: 0.84, "below-middle": 0.62, middle: 0.5, "above-middle": 0.4, top: 0.16 };
  return { leftPct: 0.5, topPct: map[position] ?? 0.84, vertical: false };
}

function TouchFx({ fx, W, H }: { fx: Effect; W: number; H: number }) {
  const style = fx.params.style || "Ripple";
  const color = fx.params.color || "#3FD1CC";
  const size = fx.params.size || 60;
  const left = (fx.x ?? 0.5) * W;
  const top = (fx.y ?? 0.5) * H;

  if (style === "Spotlight") {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]} />
        <View
          style={{
            position: "absolute",
            left: left - size,
            top: top - size,
            width: size * 2,
            height: size * 2,
            borderRadius: size,
            backgroundColor: "#000",
          }}
        />
      </View>
    );
  }
  const base = { position: "absolute" as const, left, top, alignItems: "center" as const, justifyContent: "center" as const };
  if (style === "Glow" || style === "Touch Highlight") {
    return (
      <View pointerEvents="none" style={base}>
        <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.5, marginLeft: -size / 2, marginTop: -size / 2 }} />
      </View>
    );
  }
  if (style === "Magnify" || style === "Touch Zoom") {
    return (
      <View pointerEvents="none" style={base}>
        <View style={{ position: "absolute", width: size * 2, height: size * 2, borderRadius: size, borderWidth: 2, borderColor: color, backgroundColor: color + "22", marginLeft: -size, marginTop: -size }} />
      </View>
    );
  }
  if (style === "Pulse") {
    return (
      <View pointerEvents="none" style={base}>
        <PulseRing size={size} color={color} />
        <PulseRing size={size} color={color} delay={600} />
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      </View>
    );
  }
  // Ripple
  return (
    <View pointerEvents="none" style={base}>
      <RippleOnce size={size} color={color} />
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
    </View>
  );
}

export function VideoStage({
  project,
  playhead,
  playing,
  showTint = true,
  onStageTap,
  positioningFor,
  audible = false,
  style,
}: {
  project: Project;
  playhead: number;
  /** overrides the store's playback state (screens with their own clock) */
  playing?: boolean;
  showTint?: boolean;
  /** lets this stage play the recording's own sound — only one should */
  audible?: boolean;
  onStageTap?: (x: number, y: number) => void;
  positioningFor?: string | null;
  style?: any;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const t = playhead;

  const currentClip = useMemo(
    () =>
      project.clips.filter((c) => c.track === "video").find((c) => t >= c.start && t < c.start + c.duration) ??
      project.clips.filter((c) => c.track === "video").slice(-1)[0],
    [project.clips, t],
  );
  const frameIdx = currentClip?.frame ?? 0;

  const zoom = activeAt(project.effects.filter((e) => e.type === "zoom"), t)[0];
  const transitions = activeAt(project.effects.filter((e) => e.type === "transition"), t);
  const touchFx = activeAt(project.effects.filter((e) => e.type === "touchpoint"), t);
  const ctas = activeAt(project.effects.filter((e) => e.type === "cta"), t);
  const texts = activeAt(project.effects.filter((e) => e.type === "text"), t);
  const subs = activeAt(project.subtitles, t);
  const filterFx = activeAt(project.effects.filter((e) => e.type === "effect"), t);
  const liveTouches = project.touchpoints.filter((tp) => Math.abs(tp.t - t) < 0.4);

  const preset = TINT_PRESETS[project.tint.preset] ?? TINT_PRESETS.Clean;
  const tintOpacity = showTint ? Math.min(0.55, preset.opacity + project.tint.intensity * 0.6) : 0;

  // zoom scale respecting `kind`: in = push in and hold, out = start pushed in
  // and pull back to 1, pulse = quick in-and-out.
  const zoomKind: string = zoom?.params.kind ?? "in";
  let zoomScale = 1;
  if (zoom) {
    const sc = zoom.params.scale ?? 1.6;
    const prog = Math.max(0, Math.min(1, (t - zoom.start) / Math.max(0.1, zoom.duration)));
    if (zoomKind === "out") zoomScale = sc + (1 - sc) * prog;
    else if (zoomKind === "pulse") zoomScale = 1 + (sc - 1) * Math.sin(prog * Math.PI);
    else zoomScale = sc;
  }

  // zoom transform (animated)
  const s = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  React.useEffect(() => {
    const fx = zoom?.x ?? 0.5;
    const fy = zoom?.y ?? 0.5;
    const W = box.w || BASE_W;
    const H = box.h || BASE_H;
    const cfg = { duration: !zoom || zoomKind === "in" ? 600 : 130, easing: Easing.out(Easing.cubic) };
    s.value = withTiming(zoomScale, cfg);
    tx.value = withTiming((0.5 - fx) * W * (zoomScale - 1), cfg);
    ty.value = withTiming((0.5 - fy) * H * (zoomScale - 1), cfg);
  }, [zoomScale, zoom?.id, zoom?.x, zoom?.y, box.w, box.h]);
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }],
  }));

  const scale = box.w ? box.w / BASE_W : 0.25;

  const handleTap = (e: any) => {
    if (!onStageTap || !box.w) return;
    const { locationX, locationY } = e.nativeEvent;
    onStageTap(Math.max(0, Math.min(1, locationX / box.w)), Math.max(0, Math.min(1, locationY / box.h)));
  };

  return (
    <Pressable
      onPress={onStageTap ? handleTap : undefined}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[styles.stage, positioningFor ? { borderColor: "#5B5FD1", borderWidth: 2 } : null, style]}
    >
      {/* frame */}
      <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
        {project.sourceUri ? (
          <SourceVideo
            uri={project.sourceUri}
            projectId={project.id}
            playhead={t}
            playing={playing}
            removed={project.removed}
            speed={projectSpeed(project)}
            volume={audible ? project.audio?.sourceVolume ?? 0 : 0}
          />
        ) : (
          <View style={{ width: BASE_W, height: BASE_H, transform: [{ scale }], position: "absolute", left: "50%", top: "50%", marginLeft: -BASE_W / 2, marginTop: -BASE_H / 2 }}>
            <Frame index={frameIdx} />
          </View>
        )}
      </Animated.View>

      {/* filter effects */}
      {filterFx.map((fx) => {
        const kind = fx.params.kind || "Vignette";
        const amt = fx.params.intensity ?? 0.5;
        if (kind === "Vignette" || kind === "Cinematic")
          return (
            <LinearGradient
              key={fx.id}
              pointerEvents="none"
              colors={["rgba(0,0,0,0.5)", "transparent", "rgba(0,0,0,0.5)"]}
              style={[StyleSheet.absoluteFill, { opacity: 0.4 + amt * 0.5 }]}
            />
          );
        return (
          <View
            key={fx.id}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: kind === "Duotone" ? "#5B5FD1" : kind === "Light Leak" ? "#FD9D43" : "#000", opacity: 0.15 + amt * 0.3 }]}
          />
        );
      })}

      {/* tint */}
      {tintOpacity > 0 && (
        <>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: project.tint.color || preset.color, opacity: tintOpacity }]} />
          <LinearGradient
            pointerEvents="none"
            colors={["transparent", "transparent", `rgba(0,0,0,${0.3 + tintOpacity * 0.4})`]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}

      {/* transitions */}
      {transitions.map((tr) => (
        <Animated.View
          key={tr.id}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                tr.params.style === "Light" ? "rgba(255,255,255,0.5)" : tr.params.style === "Blur" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.4)",
            },
          ]}
        />
      ))}

      {/* live touch ripples */}
      {liveTouches.map((tp) => (
        <View key={tp.id} pointerEvents="none" style={{ position: "absolute", left: tp.x * box.w, top: tp.y * box.h, alignItems: "center", justifyContent: "center" }}>
          <RippleOnce size={48} color="#3FD1CC" />
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#3FD1CC" }} />
        </View>
      ))}

      {/* touchpoint effects */}
      {touchFx.map((fx) => (
        <TouchFx key={fx.id} fx={fx} W={box.w} H={box.h} />
      ))}

      {/* text overlays */}
      {texts.map((tx2) => {
        const pos = subPosition(tx2.params.orientation || "horizontal", tx2.params.position || "center");
        return (
          <View
            key={tx2.id}
            pointerEvents="none"
            style={{ position: "absolute", left: (tx2.x ?? pos.leftPct) * box.w, top: (tx2.y ?? pos.topPct) * box.h, transform: [{ translateX: -90 }, { translateY: -20 }], maxWidth: box.w * 0.8 }}
          >
            <Text style={[styles.overlayText, { fontSize: tx2.params.size ?? 26 }]}>{tx2.params.text}</Text>
          </View>
        );
      })}

      {/* subtitles — sized to sit comfortably inside a 9:16 frame */}
      {subs.map((sub) => {
        const pos = subPosition(sub.orientation, sub.position);
        const hl = sub.highlight;
        const boxStyle = ["rounded", "marker", "pill", "soft"].includes(hl.style);
        const hasBox = hl.enabled && boxStyle;
        const bg = hasBox ? applyAlpha(hl.color, hl.style === "soft" ? Math.min(0.55, hl.opacity) : hl.opacity) : "transparent";
        const radius = hl.style === "pill" ? 999 : hl.style === "marker" ? 4 : hl.radius;
        const textColor = hasBox ? (isLight(hl.color) ? "#0A0A0F" : "#F4F4F8") : "#fff";
        const wrapW = box.w * (pos.vertical ? 0.46 : 0.8);
        return (
          <View
            key={sub.id}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: pos.leftPct * box.w,
              top: pos.topPct * box.h,
              transform: [{ translateX: -wrapW / 2 }, { translateY: -18 }],
              width: wrapW,
              alignItems: "center",
            }}
          >
            <View
              style={{
                maxWidth: wrapW,
                flexDirection: pos.vertical ? "column" : "row",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: bg,
                borderRadius: radius,
                paddingHorizontal: hasBox ? Math.round(hl.padding * 0.55) + 6 : 0,
                paddingVertical: hasBox ? Math.round(hl.padding * 0.3) + 2 : 0,
                borderBottomWidth: hl.enabled && hl.style === "underline" ? 3 : 0,
                borderBottomColor: applyAlpha(hl.color, Math.min(1, hl.opacity + 0.3)),
              }}
            >
              {sub.text.split(" ").map((w, i) => (
                <Text
                  key={i}
                  style={{
                    color: textColor,
                    fontSize: sub.orientation === "vertical" ? 22 : 15,
                    lineHeight: sub.orientation === "vertical" ? 24 : 18,
                    fontWeight: "800",
                    marginHorizontal: 2,
                    textShadowColor: hasBox ? "transparent" : "rgba(0,0,0,0.6)",
                    textShadowRadius: hl.enabled && hl.style === "glow" ? 12 : 8,
                    textShadowOffset: { width: 0, height: 2 },
                  }}
                >
                  {w}
                </Text>
              ))}
            </View>
          </View>
        );
      })}

      {/* CTA */}
      {ctas.map((c) => (
        <Animated.View
          key={c.id}
          pointerEvents="none"
          style={{ position: "absolute", left: (c.x ?? 0.5) * box.w, top: (c.y ?? 0.8) * box.h, transform: [{ translateX: -80 }, { translateY: -22 }] }}
        >
          <View style={[styles.cta, { backgroundColor: c.params.bg || "#5B5FD1" }]}>
            <Text style={{ color: c.params.color || "#fff", fontWeight: "800", fontSize: 15 }}>{c.params.text || "Start Free Trial"}</Text>
            <Text style={{ color: c.params.color || "#fff", fontWeight: "800", fontSize: 15 }}>→</Text>
          </View>
        </Animated.View>
      ))}

      {/* intro card — drawn over the opening seconds */}
      {project.intro && t <= project.intro.duration && (
        <IntroCard
          intro={project.intro}
          template={introTemplate(project.intro.template)}
          progress={introProgress(t, project.intro.duration)}
          width={box.w}
          height={box.h}
        />
      )}

      {positioningFor && (
        <View pointerEvents="none" style={styles.positionHint}>
          <Text style={styles.positionHintText}>Tap to place {positioningFor}</Text>
        </View>
      )}
    </Pressable>
  );
}

function rgbParts(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function applyAlpha(hex: string, a: number) {
  const [r, g, b] = rgbParts(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function isLight(hex: string) {
  const [r, g, b] = rgbParts(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

const styles = StyleSheet.create({
  stage: { aspectRatio: 9 / 16, width: "100%", borderRadius: 26, backgroundColor: "#000", overflow: "hidden" },
  overlayText: { color: "#fff", fontWeight: "900", textAlign: "center", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 } },
  subWord: { color: "#fff", fontWeight: "800", textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  cta: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 12 },
  positionHint: { position: "absolute", top: 12, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  positionHintText: { color: "#8AE4E1", fontSize: 11, fontWeight: "700" },
});
