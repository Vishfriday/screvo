import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { Intro } from "@/lib/types";
import type { IntroTemplate } from "@/data/intros";
import { colors } from "@/theme/tokens";

/**
 * The opening card.
 *
 * Everything here is interpolated from `progress` — 0 at the start of the card,
 * 1 as it leaves — rather than from its own animation clock. That way the card
 * behaves identically whether the preview is playing or being scrubbed
 * backwards, which an independent timer could never manage.
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Rises 0 → 1 over the first `in` of the card and falls back over the last `out`. */
function envelope(p: number, enter = 0.3, exit = 0.22) {
  const rise = clamp01(p / enter);
  const fall = clamp01((1 - p) / exit);
  return Math.min(rise, fall);
}

/**
 * Opacity for a background that hides the footage.
 *
 * Unlike the title, an opaque card is already there when the video starts — it
 * is what the first frame *is*. Fading it in would show a flash of the
 * recording before the intro, so this holds at full and only clears at the end.
 */
function cover(p: number, exit = 0.28) {
  return clamp01((1 - p) / exit);
}

/** `ease-out` — fast first, settling at the end, the way titles should arrive. */
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

export function IntroCard({
  intro,
  template,
  progress,
  width,
  height,
}: {
  intro: Intro;
  template: IntroTemplate;
  progress: number;
  width: number;
  height: number;
}) {
  const accent = intro.accent || colors.brand;
  const alpha = envelope(progress);
  const solid = cover(progress);
  // the split's halves stay shut over the opening, then part to reveal the shot
  const shut = 1 - easeOut(clamp01((progress - 0.55) / 0.45));
  const enter = easeOut(clamp01(progress / 0.34));
  // the stage is much smaller than the 1080-wide frame it stands for, so the
  // template's type sizes are scaled to whatever room it actually has
  const k = width ? width / 320 : 1;

  const motion = (() => {
    switch (template.motion) {
      case "slide":
        return { translateX: (1 - enter) * -40 * k, translateY: 0, scale: 1 };
      case "rise":
        return { translateX: 0, translateY: (1 - enter) * 26 * k, scale: 1 };
      case "scale":
        return { translateX: 0, translateY: 0, scale: 0.86 + enter * 0.14 };
      default:
        return { translateX: 0, translateY: 0, scale: 1 };
    }
  })();

  const layout = (() => {
    switch (template.layout) {
      case "lower-third":
        return { justifyContent: "flex-end" as const, alignItems: "flex-start" as const, align: "left" as const };
      case "left":
        return { justifyContent: "center" as const, alignItems: "flex-start" as const, align: "left" as const };
      default:
        return { justifyContent: "center" as const, alignItems: "center" as const, align: "center" as const };
    }
  })();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* background */}
      {template.background === "solid" && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#07070B", opacity: solid }]} />
      )}
      {template.background === "gradient" && (
        <LinearGradient
          colors={[accent, "#2B2E7A", "#07070B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: solid }]}
        />
      )}
      {template.background === "split" && (
        <>
          {/* two halves that part as the card leaves */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: height / 2,
              backgroundColor: "#07070B",
              transform: [{ translateY: -(1 - shut) * (height / 2) }],
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: height / 2,
              backgroundColor: "#07070B",
              transform: [{ translateY: (1 - shut) * (height / 2) }],
            }}
          />
        </>
      )}

      {/* content */}
      <View
        style={{
          flex: 1,
          justifyContent: layout.justifyContent,
          alignItems: layout.alignItems,
          paddingHorizontal: 22 * k,
          paddingBottom: template.layout === "lower-third" ? 58 * k : 0,
        }}
      >
        <View
          style={{
            opacity: alpha,
            transform: [
              { translateX: motion.translateX },
              { translateY: motion.translateY },
              { scale: motion.scale },
            ],
            alignItems: layout.alignItems,
            maxWidth: width * 0.88,
            ...(template.background === "glass"
              ? {
                  backgroundColor: "rgba(10,10,15,0.62)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  borderRadius: 20 * k,
                  paddingHorizontal: 20 * k,
                  paddingVertical: 18 * k,
                }
              : null),
          }}
        >
          {template.rule && template.layout !== "lower-third" && (
            <View
              style={{
                width: (28 + enter * 36) * k,
                height: 3 * k,
                borderRadius: 2,
                backgroundColor: accent,
                marginBottom: 12 * k,
              }}
            />
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 * k }}>
            {template.rule && template.layout === "lower-third" && (
              <View style={{ width: 4 * k, height: 34 * k, borderRadius: 2, backgroundColor: accent }} />
            )}
            <View style={{ flexShrink: 1 }}>
              <Text
                numberOfLines={3}
                style={{
                  color: "#fff",
                  fontSize: template.titleSize * k,
                  lineHeight: template.titleSize * 1.15 * k,
                  fontWeight: "900",
                  letterSpacing: -0.5,
                  textAlign: layout.align,
                  textShadowColor: "rgba(0,0,0,0.5)",
                  textShadowRadius: 10,
                  textShadowOffset: { width: 0, height: 2 },
                }}
              >
                {intro.title || "Untitled"}
              </Text>
              {!!intro.subtitle && (
                <Text
                  numberOfLines={2}
                  style={{
                    color: template.background === "gradient" ? "rgba(255,255,255,0.88)" : colors.ink300,
                    fontSize: Math.max(10, template.titleSize * 0.42) * k,
                    fontWeight: "600",
                    marginTop: 7 * k,
                    textAlign: layout.align,
                  }}
                >
                  {intro.subtitle}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
