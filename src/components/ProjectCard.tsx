import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { MoreVertical, Clock3, Layers } from "lucide-react-native";
import type { Project } from "@/lib/types";
import { Thumb } from "./Thumb";
import { fmtTime, relativeTime } from "@/lib/format";
import { colors } from "@/theme/tokens";
import { PressableScale } from "./ui/Motion";

const statusStyle: Record<Project["status"], { bg: string; fg: string }> = {
  draft: { bg: colors.ink700, fg: colors.ink300 },
  processing: { bg: "rgba(253,157,67,0.2)", fg: colors.amber },
  ready: { bg: "rgba(63,209,204,0.2)", fg: colors.teal },
  published: { bg: "rgba(61,214,140,0.2)", fg: "#6EE7B7" },
  shared: { bg: "rgba(91,95,209,0.25)", fg: colors.brand200 },
};

export function ProjectCard({ project, onMenu }: { project: Project; onMenu?: (p: Project) => void }) {
  const router = useRouter();
  const st = statusStyle[project.status];
  return (
    <PressableScale onPress={() => router.push(`/editor/${project.id}`)} scaleTo={0.985} style={styles.card}>
      <Thumb frame={project.thumbnailFrame} style={{ width: 68 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {project.name}
            </Text>
            <View style={styles.meta}>
              <Clock3 size={11} color={colors.ink400} />
              <Text style={styles.metaText}>{fmtTime(project.durationSec)}</Text>
              <Layers size={11} color={colors.ink400} style={{ marginLeft: 8 }} />
              <Text style={styles.metaText}>{project.chapters.length} chapters</Text>
            </View>
          </View>
          {onMenu && (
            <Pressable hitSlop={10} onPress={() => onMenu(project)} style={styles.menuBtn}>
              <MoreVertical size={16} color={colors.ink400} />
            </Pressable>
          )}
        </View>
        <View style={styles.bottomRow}>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.fg }]}>{project.status.toUpperCase()}</Text>
          </View>
          <Text style={styles.edited}>Edited {relativeTime(project.updatedAt)}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: colors.ink850,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  name: { fontSize: 14, fontWeight: "800", color: "#fff" },
  meta: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  metaText: { fontSize: 11, color: colors.ink400 },
  menuBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  edited: { fontSize: 11, color: colors.ink500 },
});
