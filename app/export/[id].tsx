import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  X, Check, Download, Link2, RotateCcw, Share as ShareIcon,
  FileVideo, Smartphone, FileText, ListChecks, BookOpen, Share2,
  Gauge, Music, Clapperboard, MonitorPlay, Waves,
} from "lucide-react-native";
import { Segmented, Toggle } from "@/components/ui/Controls";
import { ProgressRing, ErrorState } from "@/components/ui/Misc";
import { ShareSheet } from "@/components/ShareSheet";
import { Thumb } from "@/components/Thumb";
import { useStore } from "@/store/useStore";
import { saveProjectVideo, prettyBytes, NoFootageError, SaveCancelledError } from "@/lib/export/save";
import { saveProjectDocument, type DocumentKind } from "@/lib/export/document";
import { ExportFeatureMissingError } from "../../modules/screvo-screen-capture";
import { describeSize } from "@/lib/quality";
import { fmtSpeed, projectSpeed, finishedDuration } from "@/lib/speed";
import { fmtTime } from "@/lib/format";
import { colors } from "@/theme/tokens";

const FORMATS = [
  { id: "mp4", label: "MP4", Icon: FileVideo, note: "Universal video file" },
  { id: "vertical", label: "Vertical Video", Icon: Smartphone, note: "9:16, optimised for phones" },
  { id: "sop", label: "SOP document", Icon: FileText, note: "Numbered steps — print to PDF" },
  { id: "guide", label: "Step-by-Step Guide", Icon: ListChecks, note: "The steps and their narration" },
  { id: "kb", label: "Knowledge Base Article", Icon: BookOpen, note: "HTML for your help centre" },
  { id: "social", label: "Social Video", Icon: Share2, note: "Captioned, sound-off ready" },
];

function SummaryRow({
  Icon,
  label,
  value,
  note,
  last,
}: {
  Icon: any;
  label: string;
  value: string;
  note: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.sumRow, last && { borderBottomWidth: 0 }]}>
      <Icon size={16} color={colors.ink400} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{label}</Text>
        <Text style={{ color: colors.ink500, fontSize: 10.5, marginTop: 1 }} numberOfLines={2}>{note}</Text>
      </View>
      <Text style={{ color: colors.brand200, fontWeight: "800", fontSize: 12, maxWidth: 130 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const project = useStore((s) => s.getProject(id));
  const setStatus = useStore((s) => s.setStatus);
  const toast = useStore((s) => s.toast);

  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [format, setFormat] = useState("vertical");
  /** the written formats save a document; everything else saves the video */
  const isDoc = ["sop", "guide", "kb"].includes(format);

  /** Saves what the chosen format actually is, into a folder the user picks. */
  const saveToDevice = async () => {
    if (!project || saving) return;
    setSaving(true);
    try {
      // a written format saves a document; it used to save the video whatever
      // was picked, so choosing "SOP" handed you an MP4
      const written = isDoc
        ? await saveProjectDocument(project, format as DocumentKind)
        : await saveProjectVideo(project, {
            includeVoice: opts.aiVoice,
            includeMusic: opts.music,
            includeSourceAudio: opts.roomAudio,
          });
      setSavedTo(written.name);
      toast(`Saved ${written.name} · ${prettyBytes(written.bytes)}`, "success");
    } catch (e: any) {
      if (e instanceof SaveCancelledError) {
        // the user backed out of the folder picker — nothing to report
      } else if (e instanceof ExportFeatureMissingError) {
        toast(e.message, "error");
      } else if (e instanceof NoFootageError) {
        toast("This project has no video file to save — record or import one first", "error");
      } else {
        toast(e?.message ?? "The file could not be saved", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const defaultAspect = useStore((s) => s.defaultAspect);
  const [preset, setPreset] = useState<"9:16" | "1:1" | "16:9">(defaultAspect);
  const [opts, setOpts] = useState({ captions: true, branding: true, watermark: false, aiVoice: true, music: true, roomAudio: true, cta: true });
  const [phase, setPhase] = useState<"config" | "rendering" | "done" | "error">("config");
  const [progress, setProgress] = useState(0);
  const armed = useRef(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (phase !== "rendering") return;
    setProgress(0);
    armed.current = false;
    const iv = setInterval(() => {
      setProgress((p) => Math.min(100, p + Math.random() * 12 + 4));
    }, 240);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase !== "rendering") return;
    // only fires once this run's progress has been seen below 100, so a stale
    // 100 left over from a previous run cannot complete instantly
    if (progress < 100) {
      armed.current = true;
      return;
    }
    if (!armed.current) return;
    armed.current = false;
    setPhase("done");
    setStatus(id, "published");
  }, [phase, progress]);

  if (!project) return <View style={styles.root}><Text style={{ color: colors.ink400 }}>Project not found.</Text></View>;

  // the copy keeps the source's own picture, so the quality on offer is the
  // quality that was recorded — naming it beats offering a choice that re-encodes
  const quality = describeSize(project.frameSize) ?? "Source resolution";

  const stageLabel = progress < 30 ? "Compositing layers…" : progress < 60 ? "Rendering effects & zooms…" : progress < 85 ? "Mixing narration & music…" : "Finalising file…";

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => (phase === "config" ? router.back() : setPhase("config"))} style={styles.iconRound}>
          <X size={18} color="#fff" />
        </Pressable>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Export</Text>
        <View style={{ width: 36 }} />
      </View>

      {phase === "config" && (
        <Animated.View entering={FadeIn} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130, paddingTop: 12 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <Thumb frame={project.thumbnailFrame} style={{ width: 56 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }} numberOfLines={1}>{project.name}</Text>
                <Text style={{ color: colors.ink400, fontSize: 11 }}>{project.chapters.length} chapters · {project.durationSec}s</Text>
              </View>
            </View>

            <Text style={styles.label}>FORMAT</Text>
            <View style={{ gap: 8 }}>
              {FORMATS.map(({ id: fid, label, Icon, note }) => (
                <Pressable key={fid} onPress={() => setFormat(fid)} style={[styles.fmtRow, format === fid ? { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.1)" } : { borderColor: "rgba(255,255,255,0.08)" }]}>
                  <Icon size={18} color={format === fid ? colors.brand200 : colors.ink400} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{label}</Text>
                    <Text style={{ color: colors.ink400, fontSize: 11 }}>{note}</Text>
                  </View>
                  {format === fid && <Check size={16} color={colors.brand200} />}
                </Pressable>
              ))}
            </View>

            {!isDoc && (
              <>
                <Text style={styles.label}>ASPECT PRESET</Text>
                <Segmented value={preset} onChange={(v) => setPreset(v as any)} options={[{ value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }]} />

                <Text style={styles.label}>THIS RENDER</Text>
                <View style={styles.summary}>
                  <SummaryRow
                    Icon={MonitorPlay}
                    label="Quality"
                    value={quality}
                    note={
                      project.frameSize
                        ? "Written at the source resolution — the copy loses nothing"
                        : "Set the recording quality before you capture"
                    }
                  />
                  <SummaryRow
                    Icon={Gauge}
                    label="Speed"
                    value={fmtSpeed(projectSpeed(project))}
                    note={`Runs ${fmtTime(finishedDuration(project))} from ${fmtTime(project.durationSec)} of footage`}
                  />
                  <SummaryRow
                    Icon={Music}
                    label="Music"
                    value={project.music ? project.music.name : "None"}
                    note={project.music ? `Mixed in at ${Math.round(project.music.volume * 100)}%` : "Add a bed in the editor"}
                  />
                  <SummaryRow
                    Icon={Waves}
                    label="Noise cancellation"
                    value={
                      project.audio?.denoise.enabled
                        ? `${Math.round((project.audio.denoise.strength ?? 0) * 100)}%`
                        : "Off"
                    }
                    note={
                      (project.audio?.sourceVolume ?? 1) === 0
                        ? "The recording's own sound is switched off"
                        : project.audio?.denoise.enabled
                          ? "Applied to the recording's own sound on export"
                          : "The room is carried through as recorded"
                    }
                  />
                  <SummaryRow
                    Icon={Clapperboard}
                    label="Intro"
                    value={project.intro ? project.intro.title || "Untitled card" : "None"}
                    note={project.intro ? "Plays in Screvo — not burned into the file yet" : "Add an opening card in the editor"}
                    last
                  />
                </View>
              </>
            )}

            <Text style={styles.label}>OPTIONS</Text>
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 14 }}>
              <Toggle label="Captions / subtitles" checked={opts.captions} onChange={(v) => setOpts((o) => ({ ...o, captions: v }))} />
              <Toggle label="Branding" checked={opts.branding} onChange={(v) => setOpts((o) => ({ ...o, branding: v }))} />
              <Toggle label="Screvo watermark" checked={opts.watermark} onChange={(v) => setOpts((o) => ({ ...o, watermark: v }))} />
              {!isDoc && <Toggle label="AI voiceover" checked={opts.aiVoice} onChange={(v) => setOpts((o) => ({ ...o, aiVoice: v }))} />}
              {!isDoc && <Toggle label="Background music" checked={opts.music} onChange={(v) => setOpts((o) => ({ ...o, music: v }))} />}
              {!isDoc && <Toggle label="Recording's own sound" checked={opts.roomAudio} onChange={(v) => setOpts((o) => ({ ...o, roomAudio: v }))} />}
              <Toggle label="Include CTA" checked={opts.cta} onChange={(v) => setOpts((o) => ({ ...o, cta: v }))} />
            </View>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
            <Pressable onPress={() => setPhase("rendering")} style={styles.exportBtn}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Export {FORMATS.find((f) => f.id === format)?.label}</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {phase === "rendering" && (
        <View style={styles.centered}>
          <View style={{ width: 128, height: 128, alignItems: "center", justifyContent: "center" }}>
            <ProgressRing value={progress / 100} size={128} stroke={7} />
            <Text style={{ position: "absolute", color: "#fff", fontSize: 18, fontWeight: "900" }}>{Math.round(progress)}%</Text>
          </View>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 24 }}>{stageLabel}</Text>
          <Text style={{ color: colors.ink400, fontSize: 12, marginTop: 4 }}>
            {FORMATS.find((f) => f.id === format)?.label} · {isDoc ? "PDF" : `${preset} · ${quality} · ${fmtSpeed(projectSpeed(project))}`}
          </Text>
          <Pressable onPress={() => setPhase("error")} style={{ marginTop: 24 }}>
            <Text style={{ color: colors.ink600, fontSize: 10, fontWeight: "700" }}>Simulate export failure</Text>
          </Pressable>
        </View>
      )}

      {phase === "error" && (
        <View style={styles.centered}>
          <ErrorState
            title="Export failed"
            body="The render ran out of memory at 100%. Try 1080p instead of 4K, or export without background music."
            actionLabel="Back to settings"
            onAction={() => setPhase("config")}
            secondaryLabel="Retry"
            onSecondary={() => setPhase("rendering")}
          />
        </View>
      )}

      {phase === "done" && (
        <View style={styles.centered}>
          <View style={styles.doneCircle}>
            <Check size={40} color={colors.teal} strokeWidth={3} />
          </View>
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 20 }}>
            {isDoc ? "Your document is ready." : "Your video is ready."}
          </Text>
          <Text style={{ color: colors.ink400, fontSize: 13, marginTop: 4, textAlign: "center" }}>
            {project.name} · {FORMATS.find((f) => f.id === format)?.label}{!isDoc && ` · ${preset} ${quality}`}
          </Text>
          {savedTo ? (
            <Text style={{ color: colors.teal, fontSize: 12, marginTop: 10, textAlign: "center", fontWeight: "700" }}>
              Saved to your device as {savedTo}
            </Text>
          ) : (
            <Text style={{ color: colors.ink500, fontSize: 11, marginTop: 10, textAlign: "center", lineHeight: 16 }}>
              {isDoc
                ? "Save writes the steps and their narration as an HTML page you can read, share or print to PDF."
                : `Save writes the real cut: the kept spans, at ${fmtSpeed(projectSpeed(project))}, with the narration${project.music ? " and music" : ""} mixed in. Zooms, captions and the intro card play inside Screvo but are not burned into the file yet.`}
            </Text>
          )}
          <View style={styles.doneGrid}>
            {[
              { label: "Share", Icon: ShareIcon, run: () => setSharing(true) },
              { label: saving ? "Saving…" : "Save", Icon: Download, run: saveToDevice },
              { label: "Copy Link", Icon: Link2, run: async () => { await Clipboard.setStringAsync(`https://screvo.app/v/${id}`); toast("Link copied", "success"); } },
              { label: "Export Again", Icon: RotateCcw, run: () => setPhase("config") },
            ].map(({ label, Icon, run }) => (
              <Pressable key={label} onPress={run} style={styles.doneTile}>
                <Icon size={18} color={colors.brand200} />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => router.replace(`/editor/${id}`)} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.ink400, fontSize: 12, fontWeight: "700" }}>Back to editor</Text>
          </Pressable>
        </View>
      )}

      <ShareSheet open={sharing} onClose={() => setSharing(false)} projectName={project.name} />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 14 },
  sumRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  root: { flex: 1, backgroundColor: colors.ink950 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  iconRound: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.ink500, marginTop: 20, marginBottom: 8 },
  fmtRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 18, padding: 12 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(14,14,21,0.9)", paddingHorizontal: 20, paddingTop: 12 },
  exportBtn: { borderRadius: 18, backgroundColor: colors.brand, paddingVertical: 14, alignItems: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  doneCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(63,209,204,0.2)", alignItems: "center", justifyContent: "center" },
  doneGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 28, width: "100%", maxWidth: 280 },
  doneTile: { width: "47%", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 18, paddingVertical: 16 },
});
