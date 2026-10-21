import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SkipBack, SkipForward, Play, Pause, RotateCcw } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useStore } from "@/store/useStore";
import { fmtTimeMs } from "@/lib/format";
import { colors } from "@/theme/tokens";

export function PlaybackControls() {
  const { playing, togglePlay, seek, playhead, editing } = useStore();
  const dur = editing()?.durationSec ?? 0;
  const chapters = editing()?.chapters ?? [];

  const prev = () => {
    const p = [...chapters].reverse().find((c) => c.start < playhead - 0.4);
    seek(p ? p.start + 0.05 : 0);
  };
  const next = () => {
    const n = chapters.find((c) => c.start > playhead + 0.1);
    seek(n ? n.start + 0.05 : dur);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.time}>{fmtTimeMs(playhead)}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
        <Pressable onPress={prev}>
          <SkipBack size={20} color={colors.ink300} fill={colors.ink300} />
        </Pressable>
        <Pressable onPress={togglePlay} style={styles.playBtn}>
          <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {playing ? <Pause size={22} color="#fff" fill="#fff" /> : <Play size={22} color="#fff" fill="#fff" />}
        </Pressable>
        <Pressable onPress={next}>
          <SkipForward size={20} color={colors.ink300} fill={colors.ink300} />
        </Pressable>
      </View>
      <Pressable onPress={() => seek(0)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <RotateCcw size={15} color={colors.ink400} />
        <Text style={[styles.time, { color: colors.ink500 }]}>{fmtTimeMs(dur)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  time: { color: colors.ink300, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"], minWidth: 56 },
  playBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
