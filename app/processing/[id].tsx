import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { Check, Sparkles } from "lucide-react-native";
import { PROCESSING_STAGES, OPUS_MODEL } from "@/lib/opus";
import { useStore } from "@/store/useStore";
import { runAnalysis } from "@/lib/analysis/analyze";
import { analyseLocally } from "@/lib/analysis/changes";
import { ProgressRing, ErrorState } from "@/components/ui/Misc";
import { colors } from "@/theme/tokens";

export default function Processing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const applyAIGeneration = useStore((s) => s.applyAIGeneration);
  const applyRealAnalysis = useStore((s) => s.applyRealAnalysis);
  const applyDemoAnalysis = useStore((s) => s.applyDemoAnalysis);
  const toast = useStore((s) => s.toast);
  const project = useStore((s) => s.getProject(id));
  const keys = useStore((s) => s.keys);
  const source = project?.source;
  const [stage, setStage] = useState(0);
  const [failed, setFailed] = useState(false);
  const [liveNote, setLiveNote] = useState<string | null>(null);

  // with a key Claude reads the frames and the speech; without one the steps
  // still come from this recording — screen changes are found on the device
  const hasFootage = !!project?.sourceUri;
  const canAnalyse = hasFootage && !!keys.anthropic;
  const wantsDemo = project?.videoType === "demo";
  const localOnly = hasFootage && !keys.anthropic && !wantsDemo;
  const analysis = useRef<ReturnType<typeof runAnalysis> | null>(null);
  const local = useRef<ReturnType<typeof analyseLocally> | null>(null);

  useEffect(() => {
    if (!localOnly || local.current || !project) return;
    local.current = analyseLocally({
      uri: project.sourceUri!,
      durationSec: project.durationSec,
      onProgress: (note) => setLiveNote(note),
    });
    local.current.catch(() => {});
  }, [localOnly]);

  useEffect(() => {
    if (!canAnalyse || analysis.current || !project) return;
    analysis.current = runAnalysis({
      uri: project.sourceUri!,
      durationSec: project.durationSec,
      anthropicKey: keys.anthropic!,
      sttKey: keys.stt,
      showuiUrl: keys.showui,
      showuiToken: keys.showuiToken,
      mode: project.videoType === "demo" ? "demo" : "walkthrough",
      fileName: project.name,
      onProgress: (p) => setLiveNote(p.note ?? null),
    });
    analysis.current.catch(() => {});
  }, [canAnalyse]);

  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.linear }), -1, false);
  }, []);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  const STAGES =
    source && source !== "screen"
      ? PROCESSING_STAGES.map((s) =>
          s.key === "touch"
            ? { ...s, label: "Detecting scene changes...", detail: "Cuts, pans, on-screen actions" }
            : s,
        )
      : PROCESSING_STAGES;

  useEffect(() => {
    if (failed) return;
    if (stage >= STAGES.length) {
      let cancelled = false;
      (async () => {
        if (canAnalyse && analysis.current) {
          setLiveNote("Finishing the analysis");
          try {
            const { result, transcript, notes } = await analysis.current;
            if (cancelled) return;
            if (project?.videoType === "demo" && result.beats?.length) {
              applyDemoAnalysis(id, result);
              const cut = result.beats.reduce((a, b) => a + (b.end - b.start), 0);
              toast(`Demo cut to ${Math.round(cut)}s across ${result.beats.length} beats`, "ai");
            } else {
              applyRealAnalysis(id, result, transcript);
            }
            notes.forEach((n) => toast(n, "error"));
          } catch (e: any) {
            if (cancelled) return;
            toast(`Analysis failed — ${e?.message ?? "unknown error"}`, "error");
            applyAIGeneration(id); // fall back to the sample cut rather than a dead end
          }
        } else if (localOnly && local.current) {
          setLiveNote("Splitting it into steps");
          try {
            const { result, cuts } = await local.current;
            if (cancelled) return;
            applyRealAnalysis(id, result, []);
            toast(
              cuts.length
                ? `${cuts.length + 1} steps from the screen changes in your recording`
                : "No screen changes found — this is one continuous step",
              "ai",
            );
          } catch (e: any) {
            if (cancelled) return;
            toast(`Could not read this recording — ${e?.message ?? "unknown error"}`, "error");
            applyAIGeneration(id);
          }
        } else {
          applyAIGeneration(id);
        }
        if (!cancelled) router.replace(`/result/${id}`);
      })();
      return () => {
        cancelled = true;
      };
    }
    const to = setTimeout(() => setStage((s) => s + 1), 700 + Math.random() * 500);
    return () => clearTimeout(to);
  }, [stage, failed, id]);

  if (failed) {
    return (
      <View style={styles.root}>
        <ErrorState
          title="AI processing failed"
          body="Claude Opus couldn't finish analyzing this video — the audio track looked corrupted. Your file is safe."
          actionLabel="Retry analysis"
          onAction={() => { setFailed(false); setStage(0); }}
          secondaryLabel="Back to Home"
          onSecondary={() => router.replace("/")}
        />
      </View>
    );
  }

  const done = stage >= STAGES.length;
  const pct = Math.min(1, stage / STAGES.length);

  return (
    <View style={styles.root}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 128, height: 128, alignItems: "center", justifyContent: "center" }}>
          <ProgressRing value={pct} size={128} stroke={7} />
          <View style={{ position: "absolute", alignItems: "center" }}>
            {done ? (
              <Check size={40} color={colors.teal} strokeWidth={3} />
            ) : (
              <Animated.View style={spinStyle}>
                <Sparkles size={34} color={colors.brand200} />
              </Animated.View>
            )}
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800", marginTop: 4 }}>{Math.round(pct * 100)}%</Text>
          </View>
        </View>

        <Animated.Text key={stage} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.stageLabel}>
          {done ? "Done!" : STAGES[stage]?.label}
        </Animated.Text>
        <Text style={styles.stageDetail}>{liveNote ?? (done ? "Opening your video" : STAGES[stage]?.detail)}</Text>

        <View style={{ marginTop: 28, gap: 6, width: 280 }}>
          {STAGES.map((s, i) => (
            <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, opacity: i < stage ? 1 : i === stage ? 0.9 : 0.3 }}>
              <View style={[styles.tick, { backgroundColor: i < stage ? colors.teal : i === stage ? colors.brand : colors.ink700 }]}>
                {i < stage && <Check size={10} color={colors.ink950} strokeWidth={4} />}
              </View>
              <Text style={{ color: i <= stage ? colors.ink200 : colors.ink500, fontSize: 12 }}>{s.label.replace("...", "")}</Text>
            </View>
          ))}
        </View>

        <View style={styles.opusPill}>
          <Sparkles size={11} color={colors.brand200} />
          <Text style={{ color: colors.ink400, fontSize: 10, fontWeight: "700" }}>Reasoning with {OPUS_MODEL}</Text>
        </View>

        {!done && (
          <Pressable onPress={() => setFailed(true)} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.ink600, fontSize: 10, fontWeight: "700" }}>Simulate a processing failure</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink950, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  stageLabel: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 28 },
  stageDetail: { color: colors.ink400, fontSize: 12, marginTop: 4 },
  tick: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  opusPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 24 },
});
