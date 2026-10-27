import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useVideoPlayer, VideoView } from "expo-video";
import { useStore } from "@/store/useStore";
import { sourceTimeAt } from "@/lib/timemap";
import type { Project, Effect } from "@/lib/types";
import { Frame, BASE_W, BASE_H } from "@/data/frames";
import { RippleOnce, PulseRing } from "../ui/Motion";
import { introTemplate, introProgress } from "@/data/intros";
import { projectSpeed } from "@/lib/speed";
import { IntroCard } from "./IntroCard";
import { aspectRatioOf, cropOf, clampPan } from "@/lib/aspect";

/**
 * Hands the footage to the pinch and drag gestures, but only while the Crop
 * panel is open. The rest of the time the stage must stay an ordinary tap
 * target, because a tap there places a touchpoint or a CTA.
 */
function ReframeArea({
  enabled,
  gesture,
  children,
}: {
  enabled: boolean;
  gesture: any;
  children: React.ReactElement;
}) {
  if (!enabled) return children;
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

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
  contentFit = "cover",
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
  /** cover crops the footage to the frame, contain shows all of it */
  contentFit?: "cover" | "contain";
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

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={contentFit} nativeControls={false} />;
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

function TouchFx({ fx, W, H, still }: { fx: Effect; W: number; H: number; still?: boolean }) {
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
        {!still && (
          <>
            <PulseRing size={size} color={color} />
            <PulseRing size={size} color={color} delay={600} />
          </>
        )}
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      </View>
    );
  }
  // Ripple
  return (
    <View pointerEvents="none" style={base}>
      {!still && <RippleOnce size={size} color={color} />}
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
  cropEditing,
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
  /** lets the footage be pinched and dragged inside the frame — on only while
   *  the Crop panel is open, so a tap elsewhere still places touchpoints */
  cropEditing?: boolean;
  style?: any;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const reduceMotion = useStore((s) => s.reduceMotion);
  const t = playhead;

  const currentClip = useMemo(
    () =>
      project.clips.filter((c) => c.track === "video").find((c) => t >= c.start && t < c.start + c.duration) ??
      project.clips.filter((c) => c.track === "video").slice(-1)[0],
    [project.clips, t],
  );
  const frameIdx = currentClip?.frame ?? 0;

  // Reframing, as the Crop panel and the fingers left it on this clip. The
  // shape of the frame is the project's own aspect now, so "fill" and "fit"
  // only decide whether the footage is cropped to that frame or shown whole.
  const crop = cropOf(currentClip?.meta);
  const frameRatio = aspectRatioOf(project.aspect);

  const zoom = activeAt(project.effects.filter((e) => e.type === "zoom"), t)[0];
  const transitions = activeAt(project.effects.filter((e) => e.type === "transition"), t);
  const parallaxFx = activeAt(project.effects.filter((e) => e.type === "parallax"), t)[0];
  const animFx = activeAt(project.effects.filter((e) => e.type === "animation"), t)[0];

  // Parallax drifts the footage across its own frame for the length of the
  // effect; the direction and how far come from the panel.
  const parallax = (() => {
    if (!parallaxFx) return { x: 0, y: 0 };
    const p = Math.max(0, Math.min(1, (t - parallaxFx.start) / Math.max(0.1, parallaxFx.duration)));
    const depth = parallaxFx.params.depth ?? 0.5;
    const intensity = parallaxFx.params.intensity ?? 0.5;
    // a gentle ease either side of the middle rather than a linear slide.
    // 60 as the base puts the default drift near 3% of the frame — small
    // enough to read as depth, large enough that the panel visibly does
    // something, which 26 did not.
    const travel = Math.sin(p * Math.PI) * 60 * depth * (0.5 + intensity);
    const back = /Background|Perspective/.test(parallaxFx.params.type ?? "");
    const amount = back ? -travel : travel;
    return parallaxFx.params.direction === "vertical" ? { x: 0, y: amount } : { x: amount, y: 0 };
  })();

  // An entrance or exit: the same shapes the Animations panel names, run
  // forwards for "in" and backwards for "out".
  const anim = (() => {
    if (!animFx) return null;
    const raw = Math.max(0, Math.min(1, (t - animFx.start) / Math.max(0.1, animFx.duration)));
    const p = animFx.params.scope === "out" ? 1 - raw : raw;
    const eased = 1 - Math.pow(1 - p, 3);
    switch (animFx.params.anim) {
      case "Slide":
        return { opacity: eased, scale: 1, x: (1 - eased) * 90, y: 0 };
      case "Zoom":
        return { opacity: eased, scale: 0.7 + eased * 0.3, x: 0, y: 0 };
      case "Bounce":
        // overshoots just past full size before settling
        return { opacity: eased, scale: 1 + Math.sin(p * Math.PI) * 0.12, x: 0, y: (1 - eased) * 40 };
      case "Pop":
        return { opacity: eased, scale: 0.86 + eased * 0.14 + Math.sin(p * Math.PI) * 0.06, x: 0, y: 0 };
      case "Reveal":
        return { opacity: eased, scale: 1, x: 0, y: (1 - eased) * -70 };
      case "Spin":
        return { opacity: eased, scale: 0.8 + eased * 0.2, x: 0, y: 0, rotate: (1 - eased) * 25 };
      case "Kinetic":
        return { opacity: eased, scale: 1, x: Math.sin(p * Math.PI * 2) * 18 * (1 - eased), y: 0 };
      default: // Fade, Blur In — blur has no cheap equivalent, so it fades
        return { opacity: eased, scale: 1, x: 0, y: 0 };
    }
  })();

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
    // the panel offers an easing per zoom, and Reduce motion turns the push
    // into a cut rather than a glide
    const named: Record<string, any> = {
      linear: Easing.linear,
      easeIn: Easing.in(Easing.cubic),
      easeInOut: Easing.inOut(Easing.cubic),
      easeOut: Easing.out(Easing.cubic),
    };
    const cfg = {
      duration: reduceMotion ? 0 : !zoom || zoomKind === "in" ? 600 : 130,
      easing: named[(zoom?.params.easing as string) ?? "easeOut"] ?? Easing.out(Easing.cubic),
    };
    s.value = withTiming(zoomScale, cfg);
    tx.value = withTiming((0.5 - fx) * W * (zoomScale - 1), cfg);
    ty.value = withTiming((0.5 - fy) * H * (zoomScale - 1), cfg);
  }, [zoomScale, zoom?.id, zoom?.x, zoom?.y, box.w, box.h]);
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: s.value }],
  }));

  const scale = box.w ? box.w / BASE_W : 0.25;

  // --- reframing with the fingers ---
  // The pinch and the drag run live on the UI thread as a delta on top of the
  // committed crop, and are written to the clip when the fingers lift, so a
  // single adjustment is a single step in undo rather than hundreds.
  const commitProject = useStore((s) => s.commit);
  const gScale = useSharedValue(1);
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  // how many fingers' worth of gesture is still in progress, and where each
  // gesture picked up from, so a second pinch or drag adds to the first
  const active = useSharedValue(0);
  const pinchBase = useSharedValue(1);
  const panBaseX = useSharedValue(0);
  const panBaseY = useSharedValue(0);
  const clipId = currentClip?.id ?? null;

  const applyCrop = (mul: number, dx: number, dy: number) => {
    // the live delta is only cleared once the committed crop has replaced it,
    // otherwise the footage snaps back to where it was for a frame
    const clearDelta = () => {
      gScale.value = 1;
      gx.value = 0;
      gy.value = 0;
    };
    // ignore the specks: a tap that moved two pixels is not a reframe, and
    // committing one would bury the user's real edits in undo
    if (!clipId || (Math.abs(mul - 1) < 0.01 && Math.abs(dx) < 2 && Math.abs(dy) < 2)) {
      clearDelta();
      return;
    }
    const nextScale = Math.max(1, Math.min(4, crop.scale * mul));
    const pan = clampPan(
      crop.x + dx / Math.max(1, box.w),
      crop.y + dy / Math.max(1, box.h),
      nextScale,
    );
    commitProject("Reframe clip", (d: Project) => {
      const c = d.clips.find((x) => x.id === clipId);
      if (!c) return;
      c.meta = {
        ...(c.meta ?? {}),
        crop: {
          ...crop,
          scale: Number(nextScale.toFixed(3)),
          x: Number(pan.x.toFixed(4)),
          y: Number(pan.y.toFixed(4)),
        },
      };
    });
    clearDelta();
  };

  const cropGesture = useMemo(() => {
    // One finger drags the picture, two scale it, and the two may overlap: a
    // pinch often ends with one finger still down and still moving. So the
    // write happens when the last finger lifts, not when either gesture ends,
    // and each gesture builds on the delta so far rather than from scratch.
    const begin = () => {
      "worklet";
      active.value += 1;
    };
    const finish = () => {
      "worklet";
      active.value = Math.max(0, active.value - 1);
      if (active.value === 0) runOnJS(applyCrop)(gScale.value, gx.value, gy.value);
    };

    const pinch = Gesture.Pinch()
      .onBegin(() => {
        "worklet";
        begin();
        pinchBase.value = gScale.value;
      })
      .onUpdate((e) => {
        "worklet";
        gScale.value = pinchBase.value * e.scale;
      })
      .onFinalize(finish);

    const pan = Gesture.Pan()
      .minDistance(2)
      .onBegin(() => {
        "worklet";
        begin();
        panBaseX.value = gx.value;
        panBaseY.value = gy.value;
      })
      .onUpdate((e) => {
        "worklet";
        gx.value = panBaseX.value + e.translationX;
        gy.value = panBaseY.value + e.translationY;
      })
      .onFinalize(finish);

    return Gesture.Simultaneous(pinch, pan);
  }, [clipId, crop.scale, crop.x, crop.y, crop.fit, box.w, box.h]);

  // what is on screen: the committed crop, plus whatever the fingers are doing
  // right now. Translating before scaling keeps the drag 1:1 with the finger.
  const cropStyle = useAnimatedStyle(() => {
    const sc = Math.max(1, Math.min(4, crop.scale * gScale.value));
    const room = Math.max(0, (sc - 1) / 2);
    const cl = (v: number) => Math.max(-room, Math.min(room, v));
    const px = cl(crop.x + gx.value / Math.max(1, box.w));
    const py = cl(crop.y + gy.value / Math.max(1, box.h));
    return {
      transform: [
        { translateX: px * box.w },
        { translateY: py * box.h },
        { scale: sc },
      ],
    };
  }, [crop.scale, crop.x, crop.y, box.w, box.h]);

  const handleTap = (e: any) => {
    if (!onStageTap || !box.w) return;
    const { locationX, locationY } = e.nativeEvent;
    onStageTap(Math.max(0, Math.min(1, locationX / box.w)), Math.max(0, Math.min(1, locationY / box.h)));
  };

  return (
    <Pressable
      onPress={onStageTap ? handleTap : undefined}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[
        styles.stage,
        { aspectRatio: frameRatio },
        positioningFor ? { borderColor: "#5B5FD1", borderWidth: 2 } : null,
        style,
      ]}
    >
      {/* frame */}
      <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
       <ReframeArea enabled={!!cropEditing} gesture={cropGesture}>
        <View
          style={[
            styles.cropHost,
            anim ? { opacity: anim.opacity } : null,
            parallax.x || parallax.y || anim
              ? {
                  transform: [
                    { translateX: parallax.x + (anim?.x ?? 0) },
                    { translateY: parallax.y + (anim?.y ?? 0) },
                    ...(anim?.rotate ? [{ rotate: `${anim.rotate}deg` }] : []),
                    ...(anim && anim.scale !== 1 ? [{ scale: anim.scale }] : []),
                  ],
                }
              : null,
          ]}
        >
          <Animated.View style={[{ width: "100%", height: "100%" }, cropStyle]}>
            {project.sourceUri ? (
              <SourceVideo
                uri={project.sourceUri}
                projectId={project.id}
                playhead={t}
                playing={playing}
                removed={project.removed}
                speed={projectSpeed(project)}
                volume={audible ? project.audio?.sourceVolume ?? 0 : 0}
                contentFit={crop.fit === "fit" ? "contain" : "cover"}
              />
            ) : (
              <View style={{ width: BASE_W, height: BASE_H, transform: [{ scale }], position: "absolute", left: "50%", top: "50%", marginLeft: -BASE_W / 2, marginTop: -BASE_H / 2 }}>
                <Frame index={frameIdx} />
              </View>
            )}
          </Animated.View>
        </View>
       </ReframeArea>
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

      {/* live touch ripples — the dot stays, the ripple goes under Reduce motion */}
      {liveTouches.map((tp) => (
        <View key={tp.id} pointerEvents="none" style={{ position: "absolute", left: tp.x * box.w, top: tp.y * box.h, alignItems: "center", justifyContent: "center" }}>
          {!reduceMotion && <RippleOnce size={48} color="#3FD1CC" />}
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#3FD1CC" }} />
        </View>
      ))}

      {/* touchpoint effects */}
      {touchFx.map((fx) => (
        <TouchFx key={fx.id} fx={fx} W={box.w} H={box.h} still={reduceMotion} />
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

      {cropEditing && (
        <View pointerEvents="none" style={styles.reframeGrid}>
          <View style={[styles.gridLine, { left: "33.333%", width: 1, top: 0, bottom: 0 }]} />
          <View style={[styles.gridLine, { left: "66.666%", width: 1, top: 0, bottom: 0 }]} />
          <View style={[styles.gridLine, { top: "33.333%", height: 1, left: 0, right: 0 }]} />
          <View style={[styles.gridLine, { top: "66.666%", height: 1, left: 0, right: 0 }]} />
        </View>
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
  // holds the footage layer; the stage's own shape comes from project.aspect
  cropHost: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  // the thirds, shown only while the footage is being reframed by hand
  reframeGrid: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderWidth: 1.5, borderColor: "rgba(91,95,209,0.9)", borderRadius: 26 },
  gridLine: { position: "absolute", backgroundColor: "rgba(255,255,255,0.22)" },
  stage: { width: "100%", borderRadius: 26, backgroundColor: "#000", overflow: "hidden" },
  overlayText: { color: "#fff", fontWeight: "900", textAlign: "center", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 } },
  subWord: { color: "#fff", fontWeight: "800", textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  cta: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 12 },
  positionHint: { position: "absolute", top: 12, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  positionHintText: { color: "#8AE4E1", fontSize: 11, fontWeight: "700" },
});
