import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { Play, Pause } from "lucide-react-native";
import { useStore } from "@/store/useStore";
import { VideoStage } from "./VideoStage";
import { fmtTimeMs } from "@/lib/format";
import { colors } from "@/theme/tokens";

/**
 * Compact preview pinned to the top of every tool sheet, so an edit made in
 * the panel below is visible on the video immediately — the full-size preview
 * behind the sheet is covered on a phone.
 */
export function LivePreview() {
  const { editing, playhead, seek, playing, togglePlay, beforeAfter } = useStore();
  const p = editing();
  if (!p) return null;

  return (
    <View style={styles.wrap}>
      <View style={{ width: 74 }}>
        <VideoStage project={p} playhead={playhead} showTint={!beforeAfter} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.kicker}>LIVE PREVIEW</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 }}>
          <Pressable onPress={togglePlay} style={styles.play} accessibilityLabel={playing ? "Pause" : "Play"}>
            <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {playing ? <Pause size={12} color="#fff" fill="#fff" /> : <Play size={12} color="#fff" fill="#fff" />}
          </Pressable>
          <Text style={styles.time}>{fmtTimeMs(playhead)}</Text>
          <Text style={styles.timeDim}>/ {fmtTimeMs(p.durationSec)}</Text>
        </View>
        <Slider
          style={{ width: "100%", height: 28, marginTop: 2 }}
          minimumValue={0}
          maximumValue={p.durationSec}
          value={playhead}
          onValueChange={seek}
          minimumTrackTintColor={colors.brand}
          maximumTrackTintColor="rgba(255,255,255,0.14)"
          thumbTintColor="#fff"
        />
        <Text style={styles.hint}>Edits apply instantly — scrub to check them.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(0,0,0,0.3)", padding: 8 },
  kicker: { color: colors.ink500, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  play: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  time: { color: colors.ink300, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  timeDim: { color: colors.ink600, fontSize: 10, fontVariant: ["tabular-nums"] },
  hint: { color: colors.ink500, fontSize: 10, lineHeight: 13 },
});
