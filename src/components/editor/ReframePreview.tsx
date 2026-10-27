import React from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Play, Pause } from "lucide-react-native";
import { useStore } from "@/store/useStore";
import { VideoStage } from "./VideoStage";
import { aspectRatioOf } from "@/lib/aspect";
import { fmtTimeMs } from "@/lib/format";
import { colors } from "@/theme/tokens";

/**
 * The Crop panel's preview, in place of the usual thumbnail strip.
 *
 * The sheet covers almost three quarters of the screen, so the full-size stage
 * behind it is out of reach — and reframing by hand is useless if the hand
 * cannot get to the footage. This puts a stage big enough to drag and pinch at
 * the top of the panel itself, directly above the controls that do the same job
 * numerically.
 */
export function ReframePreview() {
  const { editing, playhead, playing, togglePlay } = useStore();
  const { width, height } = useWindowDimensions();
  const p = editing();
  if (!p) return null;

  // tall enough to manipulate, short enough to leave the controls on screen
  const boxH = Math.min(210, Math.round(height * 0.24));
  const w = Math.min(width - 72, Math.round(boxH * aspectRatioOf(p.aspect)));

  return (
    <View style={styles.wrap}>
      <View style={{ width: w, alignSelf: "center" }}>
        <VideoStage project={p} playhead={playhead} cropEditing />
      </View>
      <View style={styles.bar}>
        <Pressable onPress={togglePlay} style={styles.play} accessibilityLabel={playing ? "Pause" : "Play"}>
          <LinearGradient
            colors={["#5B5FD1", "#7376DB", "#3FD1CC"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {playing ? <Pause size={12} color="#fff" fill="#fff" /> : <Play size={12} color="#fff" fill="#fff" />}
        </Pressable>
        <Text style={styles.time}>{fmtTimeMs(playhead)}</Text>
        <Text style={styles.hint} numberOfLines={1}>
          Drag to move · pinch to zoom
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: 8,
    gap: 8,
  },
  bar: { flexDirection: "row", alignItems: "center", gap: 8 },
  play: { width: 26, height: 26, borderRadius: 13, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  time: { color: "#fff", fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  hint: { color: colors.ink500, fontSize: 10.5, flex: 1, textAlign: "right" },
});
