import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import { useRouter, useLocalSearchParams, useIsFocused } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { Undo2, Redo2, X, Download, Play, Pause, Eye, ChevronDown, ChevronUp, Scissors } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useStore } from "@/store/useStore";
import { usePlaybackClock } from "@/hooks/usePlaybackClock";
import { useMicAccess } from "@/hooks/useMicAccess";
import { useVoiceOver } from "@/hooks/useVoiceOver";
import { useMusicBed } from "@/hooks/useMusicBed";
import { VideoStage } from "@/components/editor/VideoStage";
import { Timeline } from "@/components/editor/Timeline";
import { EditingToolbar } from "@/components/editor/EditingToolbar";
import { PanelHost } from "@/components/editor/PanelHost";
import { AskScrevoResultBar } from "@/components/editor/AskScrevo";
import { VoiceCommandPanel, VoiceTopBar } from "@/components/editor/VoiceCommandPanel";
import { StepsPanel } from "@/components/editor/StepsPanel";
import { LivePreview } from "@/components/editor/LivePreview";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "@/components/ui/Controls";
import { fmtTime, fmtTimeMs } from "@/lib/format";
import { aspectRatioOf } from "@/lib/aspect";
import { fmtSpeed, projectSpeed, finishedDuration } from "@/lib/speed";
import { colors } from "@/theme/tokens";

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const {
    editorId, openEditor, editing, playhead, seek, playing, togglePlay,
    undo, redo, canUndo, canRedo, beforeAfter, placePicker, finishPlacing, cancelPlacing, renameProject,
    activePanel, closePanel,
    lastCutAt, clearLastCut, stepAt, unstepAt,
  } = useStore();

  usePlaybackClock();
  useVoiceOver();
  useMusicBed();
  const mic = useMicAccess();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [tab, setTab] = useState<"edit" | "steps">("edit");

  // `editorId` is global, so a second editor left behind in the navigation stack
  // would keep claiming it back and fight the one on screen until React gave up
  // with "maximum update depth exceeded". Only the focused editor claims it.
  const focused = useIsFocused();
  useEffect(() => {
    if (focused && id && editorId !== id) openEditor(id);
  }, [focused, id, editorId]);

  const p = editing();
  if (!p) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center", gap: 12 }]}>
        <Text style={{ color: colors.ink400 }}>Project not found.</Text>
        <Pressable onPress={() => router.replace("/")} style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Home</Text>
        </Pressable>
      </View>
    );
  }

  // clip boundaries — the visible evidence that a split happened
  const cutPoints = p.clips
    .filter((c) => c.track === "video" && c.start > 0.05)
    .map((c) => Math.round(c.start * 100) / 100);

  const cutIsStep =
    lastCutAt != null && p.chapters.some((c) => Math.abs(c.start - lastCutAt) < 0.3);

  const voiceOpen = activePanel === "voice";
  // while the Crop panel is open the footage answers to the fingers, so the
  // tap-to-play overlay steps aside and lets the gestures through
  const cropOpen = activePanel === "crop";
  // the preview stays the dominant element; the timeline and tools scroll under
  // it. A landscape project is wide and short, so the height budget only binds
  // on the vertical shapes.
  const previewW = Math.min(width - 24, Math.round(height * 0.44 * aspectRatioOf(p.aspect)));

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.replace("/")} style={styles.hBtn}>
          <X size={17} color="#fff" />
        </Pressable>
        <Pressable onPress={() => { setName(p.name); setRenaming(true); }} style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }} numberOfLines={1}>{p.name}</Text>
          <Text style={{ color: colors.ink500, fontSize: 10 }}>
            {fmtTime(p.durationSec)} · {p.aspect}
            {projectSpeed(p) !== 1 ? ` · ${fmtSpeed(projectSpeed(p))} → ${fmtTime(finishedDuration(p))}` : ""}
            {p.music ? ` · ♪ ${p.music.name}` : ""}
          </Text>
        </Pressable>
        <Pressable onPress={undo} disabled={!canUndo()} style={[styles.hBtn, !canUndo() && { opacity: 0.3 }]}>
          <Undo2 size={16} color="#fff" />
        </Pressable>
        <Pressable onPress={redo} disabled={!canRedo()} style={[styles.hBtn, !canRedo() && { opacity: 0.3 }]}>
          <Redo2 size={16} color="#fff" />
        </Pressable>
        <Pressable onPress={() => router.push(`/export/${p.id}`)} style={styles.exportBtn}>
          <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Download size={14} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Export</Text>
        </Pressable>
      </View>

      {/* pinned: the preview stays visible whatever you are doing */}
      <View style={{ paddingHorizontal: 12, paddingTop: 4, gap: 10 }}>
        {/* connected mic, above the preview */}
        <VoiceTopBar mic={mic} />

        <View style={{ alignItems: "center" }}>
          <View style={{ width: previewW }}>
            <VideoStage
              audible
              project={p}
              playhead={playhead}
              showTint={!beforeAfter}
              onStageTap={placePicker ? (x, y) => finishPlacing(x, y) : undefined}
              positioningFor={placePicker?.label ?? null}
              cropEditing={cropOpen}
            />
            {!placePicker && !cropOpen && (
              <Pressable onPress={togglePlay} style={StyleSheet.absoluteFill}>
                {!playing && (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <View style={styles.playCircle}>
                      <Play size={20} color="#fff" fill="#fff" />
                    </View>
                  </View>
                )}
              </Pressable>
            )}
            {beforeAfter && (
              <View style={styles.beforeTag}>
                <Eye size={11} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>Before</Text>
              </View>
            )}
          </View>
          {placePicker && (
            <Pressable onPress={cancelPlacing} style={styles.cancelPlace}>
              <Text style={{ color: colors.ink200, fontSize: 11, fontWeight: "700" }}>Cancel placing</Text>
            </Pressable>
          )}
        </View>

        {/* transport */}
        <View style={styles.transport}>
          <Pressable onPress={togglePlay} style={styles.miniPlay} accessibilityLabel={playing ? "Pause" : "Play"}>
            <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {playing ? <Pause size={14} color="#fff" fill="#fff" /> : <Play size={14} color="#fff" fill="#fff" />}
          </Pressable>
          <Text style={styles.time}>{fmtTimeMs(playhead)}</Text>
          <View style={{ flex: 1, position: "relative", justifyContent: "center" }}>
            <Slider
              style={{ width: "100%", height: 30 }}
              minimumValue={0}
              maximumValue={p.durationSec}
              value={playhead}
              onValueChange={seek}
              minimumTrackTintColor={colors.brand}
              maximumTrackTintColor="rgba(255,255,255,0.14)"
              thumbTintColor="#fff"
            />
            {cutPoints.map((t) => (
              <View
                key={t}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: `${(t / p.durationSec) * 100}%`,
                  top: 8,
                  width: 2,
                  height: 14,
                  borderRadius: 1,
                  backgroundColor: colors.teal,
                }}
              />
            ))}
          </View>
          <Text style={[styles.time, { color: colors.ink500, textAlign: "right" }]}>{fmtTimeMs(p.durationSec)}</Text>
        </View>
      </View>

      {/* scrolls under the pinned preview */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16, gap: 10 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {lastCutAt != null && (
          <View style={styles.cutBar}>
            <Scissors size={13} color={colors.teal} />
            <Text style={styles.cutBarText} numberOfLines={1}>
              Cut at {fmtTimeMs(lastCutAt)}
            </Text>
            <Pressable
              onPress={() => (cutIsStep ? unstepAt(lastCutAt) : stepAt(lastCutAt))}
              style={styles.cutBarBtn}
            >
              <Text style={styles.cutBarBtnText}>{cutIsStep ? "Merge into previous" : "Make a new step"}</Text>
            </Pressable>
            <Pressable onPress={clearLastCut} hitSlop={8}>
              <X size={13} color={colors.ink400} />
            </Pressable>
          </View>
        )}

        {/* collapsible timeline */}
        <Pressable onPress={() => setTimelineOpen((v) => !v)} style={styles.timelineHead}>
          {timelineOpen ? <ChevronDown size={14} color={colors.ink300} /> : <ChevronUp size={14} color={colors.ink300} />}
          <Text style={styles.timelineHeadText}>TIMELINE</Text>
          <Text style={styles.timelineHeadHint}>{timelineOpen ? "Hide" : "Show"}</Text>
        </Pressable>
        {timelineOpen && <Timeline />}
      </ScrollView>

      {/* tools — pinned footer, Ask AI first */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={{ width: 168, marginBottom: 8 }}>
          <Segmented<"edit" | "steps">
            value={tab}
            onChange={setTab}
            options={[
              { value: "edit", label: "Edit" },
              { value: "steps", label: "Steps" },
            ]}
          />
        </View>
        {tab === "edit" ? (
          <EditingToolbar />
        ) : (
          <ScrollView style={{ maxHeight: height * 0.3 }} showsVerticalScrollIndicator={false}>
            <StepsPanel />
          </ScrollView>
        )}
      </View>

      {/* voice command, opened by the Ask AI tool */}
      <Sheet
        open={voiceOpen}
        onClose={closePanel}
        title="Voice command"
        subtitle="Speak or type an edit — Screvo applies it"
        size="lg"
        preview={<LivePreview />}
      >
        {voiceOpen ? <VoiceCommandPanel mic={mic} autoStart /> : null}
      </Sheet>

      <AskScrevoResultBar />
      <PanelHost />

      <Sheet open={renaming} onClose={() => setRenaming(false)} title="Rename project" size="sm">
        <TextInput autoFocus value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.ink500} />
        <Pressable onPress={() => { if (name.trim()) renameProject(p.id, name.trim()); setRenaming(false); }} style={styles.saveBtn}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Save</Text>
        </Pressable>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink950 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  hBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, borderRadius: 17, paddingHorizontal: 12, overflow: "hidden" },
  playCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  beforeTag: { position: "absolute", left: 8, top: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  cancelPlace: { marginTop: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  transport: { flexDirection: "row", alignItems: "center", gap: 8 },
  miniPlay: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  time: { color: colors.ink300, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"], width: 48 },
  footer: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", backgroundColor: colors.ink950, paddingHorizontal: 16, paddingTop: 8 },
  cutBar: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(63,209,204,0.3)", backgroundColor: "rgba(63,209,204,0.1)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  cutBarText: { flex: 1, color: colors.tealSoft, fontSize: 11, fontWeight: "700" },
  cutBarBtn: { backgroundColor: "rgba(63,209,204,0.2)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  cutBarBtnText: { color: colors.tealSoft, fontSize: 11, fontWeight: "800" },
  timelineHead: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  timelineHeadText: { color: colors.ink300, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  timelineHeadHint: { marginLeft: "auto", color: colors.ink500, fontSize: 10, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.ink800, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontWeight: "700", color: "#fff" },
  saveBtn: { marginTop: 16, borderRadius: 18, backgroundColor: colors.brand, paddingVertical: 13, alignItems: "center" },
});
