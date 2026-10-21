import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { X, Check, Play, Pause, Maximize2, Sparkles, Wand2, Download, Megaphone } from "lucide-react-native";
import Slider from "@react-native-community/slider";
import { VideoStage } from "@/components/editor/VideoStage";
import { useStore } from "@/store/useStore";
import { useLocalClock } from "@/hooks/useLocalClock";
import { Button } from "@/components/ui/Button";
import { fmtTime } from "@/lib/format";
import { chapterAccents } from "@/theme/tokens";
import { colors } from "@/theme/tokens";

export default function GeneratedResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const project = useStore((s) => s.getProject(id));
  const createProject = useStore((s) => s.createProject);
  const keys = useStore((s) => s.keys);
  const toast = useStore((s) => s.toast);
  const clock = useLocalClock(project?.durationSec ?? 1);

  // a demo is cut from the same footage, so it needs the source and Claude
  const canMakeDemo = !!project?.sourceUri && project?.videoType !== "demo";

  /** Starts a second project: the same recording, cut as a one-minute pitch. */
  const makeDemo = () => {
    if (!project?.sourceUri) return;
    if (!keys.anthropic) {
      toast("Add an Anthropic key in Profile — a demo needs Claude to write the pitch", "error");
      return;
    }
    const demoId = createProject({
      name: `${project.name} — demo`,
      status: "processing",
      source: project.source ?? "screen",
      sourceUri: project.sourceUri,
      videoType: "demo",
      durationSec: project.durationSec,
      clips: [
        { id: `clip_${Date.now()}`, track: "video" as const, start: 0, duration: project.durationSec, label: "Source video", frame: 0, color: "#5B5FD1", speed: 1, volume: 1 },
      ],
      thumbnailFrame: 0,
      touchpoints: [],
    });
    router.replace(`/processing/${demoId}`);
  };

  if (!project) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.ink400 }}>Project not found.</Text>
      </View>
    );
  }

  const activeChapter = project.chapters.find((c) => clock.t >= c.start && clock.t < c.start + c.duration);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.replace("/")} style={styles.iconRound}>
          <X size={18} color="#fff" />
        </Pressable>
        <View style={styles.doneBadge}>
          <Check size={13} color={colors.teal} />
          <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "800" }}>Video generated</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: "100%", maxWidth: 300, alignSelf: "center" }}>
          <VideoStage project={project} playhead={clock.t} playing={clock.playing} />
          <Pressable onPress={clock.toggle} style={StyleSheet.absoluteFill}>
            {!clock.playing && (
              <View style={styles.playOverlay}>
                <View style={styles.playCircle}>
                  <Play size={26} color="#fff" fill="#fff" />
                </View>
              </View>
            )}
          </Pressable>
          <View style={styles.scrubWrap}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.scrubTime}>{fmtTime(clock.t)}</Text>
              <Text style={styles.chapBadge}>{activeChapter?.name}</Text>
              <Text style={styles.scrubTime}>{fmtTime(project.durationSec)}</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={project.durationSec}
              value={clock.t}
              onValueChange={clock.setT}
              minimumTrackTintColor="#fff"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#fff"
            />
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 12 }}>
          <Pressable onPress={clock.toggle} style={styles.ctrlBtn}>
            {clock.playing ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
          </Pressable>
          <Pressable onPress={() => router.push(`/editor/${id}`)} style={styles.ctrlBtn}>
            <Maximize2 size={17} color="#fff" />
          </Pressable>
        </View>

        <Text style={styles.title}>{project.name}</Text>
        <View style={styles.summaryCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Sparkles size={12} color={colors.brand200} />
            <Text style={{ color: colors.brand200, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }}>AI SUMMARY</Text>
          </View>
          <Text style={{ color: colors.ink200, fontSize: 13, lineHeight: 20 }}>{project.summary}</Text>
        </View>

        <Text style={styles.chaptersLabel}>Steps</Text>
        <View style={{ gap: 8 }}>
          {project.chapters.map((c, i) => (
            <Pressable key={c.id} onPress={() => clock.setT(c.start + 0.1)} style={styles.chapRow}>
              <View style={[styles.chapNum, { backgroundColor: chapterAccents[i % chapterAccents.length] }]}>
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{c.name}</Text>
                <Text style={{ color: colors.ink400, fontSize: 11 }} numberOfLines={1}>
                  {c.summary}
                </Text>
              </View>
              <Text style={{ color: colors.ink400, fontSize: 11 }}>{fmtTime(c.duration)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <BlurView intensity={30} tint="dark" style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {canMakeDemo && (
          <Pressable onPress={makeDemo} style={styles.demoBtn}>
            <Megaphone size={15} color={colors.brand200} />
            <Text style={{ color: colors.brand200, fontWeight: "800", fontSize: 13 }}>
              Also make a one-minute product demo
            </Text>
          </Pressable>
        )}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Export" variant="secondary" icon={<Download size={16} color="#fff" />} onPress={() => router.push(`/export/${id}`)} style={{ flex: 1 }} />
          <Button label="Open Editor" icon={<Wand2 size={16} color="#fff" />} onPress={() => router.push(`/editor/${id}`)} style={{ flex: 1.6 }} />
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(91,95,209,0.35)",
    backgroundColor: "rgba(91,95,209,0.12)",
    paddingVertical: 11,
  },
  root: { flex: 1, backgroundColor: colors.ink950 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  iconRound: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  doneBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(63,209,204,0.15)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  playOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  playCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  scrubWrap: { position: "absolute", left: 12, right: 12, bottom: 12 },
  scrubTime: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "700" },
  chapBadge: { color: "#fff", fontSize: 10, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 6, borderRadius: 4, overflow: "hidden" },
  ctrlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 24, letterSpacing: -0.4 },
  summaryCard: { marginTop: 8, borderRadius: 18, borderWidth: 1, borderColor: "rgba(91,95,209,0.25)", backgroundColor: "rgba(91,95,209,0.1)", padding: 14 },
  chaptersLabel: { color: "#fff", fontSize: 13, fontWeight: "800", marginTop: 20, marginBottom: 8 },
  chapRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 18, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  chapNum: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(14,14,21,0.8)" },
});
