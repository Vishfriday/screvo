import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  MonitorSmartphone, UploadCloud, Link as LinkIcon, LayoutTemplate, FileVideo, Wifi,
  HardDrive, Film, Check, Images, FolderOpen, Sparkles, Scissors,
} from "lucide-react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Screen, ScreenHeader, Card } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Controls";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Misc";
import { Sheet } from "@/components/ui/Sheet";
import { useStore } from "@/store/useStore";
import { adoptVideoFile } from "@/lib/files";
import { makeDemoProjects } from "@/data/demoProjects";
import type { Project } from "@/lib/types";
import { colors } from "@/theme/tokens";

type Tab = "record" | "upload" | "import" | "template";
type Phase = "idle" | "uploading" | "error-unsupported" | "error-failed" | "error-offline";
/** what happens to the footage once it is in: AI analysis, or straight to the editor */
type Handling = "analyse" | "edit";

const DRIVE_FILES = [
  { name: "Onboarding walkthrough.mp4", size: "58.2 MB", kind: "Screen recording" },
  { name: "Q3 product demo — raw.mov", size: "210.4 MB", kind: "Camera video" },
  { name: "Webinar clip — pricing.mp4", size: "96.7 MB", kind: "Camera video" },
  { name: "Support macro screencast.mp4", size: "41.9 MB", kind: "Screen recording" },
  { name: "Field sales recording.mp4", size: "154.0 MB", kind: "Camera video" },
];

export default function Create() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { createProject, toast } = useStore();
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || "record");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState<{ name: string; size: string; source: Project["source"]; uri?: string; durationSec?: number } | null>(null);
  const [drive, setDrive] = useState<null | "connect" | "list">(null);
  const [devicePicker, setDevicePicker] = useState(false);
  // a chosen file waits here until the user says what should happen to it
  const [asking, setAsking] = useState(false);
  const [handling, setHandling] = useState<Handling>("analyse");
  const armed = useRef(false);

  useEffect(() => {
    if (params.tab) setTab(params.tab as Tab);
  }, [params.tab]);

  useEffect(() => {
    if (phase !== "uploading") return;
    setProgress(0);
    armed.current = false;
    const iv = setInterval(() => {
      setProgress((p) => Math.min(100, p + Math.random() * 16 + 6));
    }, 260);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase !== "uploading") return;
    // only fires once this run's progress has been seen below 100, so a stale
    // 100 left over from a previous run cannot complete instantly
    if (progress < 100) {
      armed.current = true;
      return;
    }
    if (!armed.current) return;
    armed.current = false;
    finish();
  }, [phase, progress]);

  function finish() {
    const demo = makeDemoProjects()[0];
    const dur = Math.max(1, Math.round(pending?.durationSec ?? 30));
    const name = pending?.name?.replace(/\.[a-z0-9]+$/i, "") || "Untitled Video";
    const real = !!pending?.uri;
    const analyse = handling === "analyse";
    const id = createProject({
      name,
      // an unanalysed import is ready the moment it lands — there is nothing to wait for
      status: analyse ? "processing" : "ready",
      analysed: analyse,
      source: pending?.source ?? "video",
      sourceUri: pending?.uri,
      durationSec: real ? dur : demo.durationSec,
      clips: real
        ? [{ id: `clip_${Date.now()}`, track: "video" as const, start: 0, duration: dur, label: "Source video", frame: 0, color: "#5B5FD1", speed: 1, volume: 1 }]
        : demo.clips,
      // without analysis there are no steps, so the whole video is one of them
      chapters: analyse
        ? undefined
        : [{ id: `ch_${Date.now()}`, name, start: 0, duration: real ? dur : demo.durationSec, frame: 0, summary: "" }],
      touchpoints: !real && pending?.source === "screen" ? demo.touchpoints : [],
      thumbnailFrame: 0,
    });
    setPhase("idle");
    setPending(null);
    router.push(analyse ? `/processing/${id}` : `/editor/${id}`);
  }

  const humanSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
  };

  // Picking a file does not start anything: the answer to "analyse or edit?"
  // decides where this lands, so it is asked before the work begins.
  const startUpload = (
    name: string,
    size: string,
    source: Project["source"],
    uri?: string,
    durationSec?: number,
  ) => {
    setPending({ name, size, source, uri, durationSec });
    setDevicePicker(false);
    setAsking(true);
  };

  const proceed = (how: Handling) => {
    setHandling(how);
    setAsking(false);
    setPhase("uploading");
  };

  // Photos & videos — the OS media library, behind a real permission prompt.
  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setDevicePicker(false);
      toast(
        perm.canAskAgain
          ? "Photo access is needed to pick a video"
          : "Enable photo access for Screvo in Settings",
        "error",
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 1 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const name = a.fileName ?? "Video from library.mp4";
    // the picker's copy lives in the cache, which Android empties — keep our own
    const uri = await adoptVideoFile(a.uri, name, (r) => toast(`Kept the picker\u2019s copy \u2014 ${r}`, "error"));
    startUpload(
      name,
      humanSize(a.fileSize),
      /screen|record|capture/i.test(name) ? "screen" : "video",
      uri,
      a.duration ? a.duration / 1000 : undefined,
    );
  }

  // Any video file on the device — Files, Downloads, SD card or a cloud provider.
  async function pickFromFiles() {
    const res = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (a.mimeType && !a.mimeType.startsWith("video/")) {
      setDevicePicker(false);
      setPhase("error-unsupported");
      return;
    }
    const uri = await adoptVideoFile(a.uri, a.name, (r) => toast(`Kept the picker\u2019s copy \u2014 ${r}`, "error"));
    startUpload(a.name, humanSize(a.size), /screen|record|capture/i.test(a.name) ? "screen" : "video", uri);
  }

  return (
    <Screen>
      <ScreenHeader title="Create" subtitle="Start a new Screvo project" />
      <Segmented<Tab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPhase("idle");
        }}
        options={[
          { value: "record", label: "Record" },
          { value: "upload", label: "Upload" },
          { value: "import", label: "Import" },
          { value: "template", label: "Template" },
        ]}
      />

      <Animated.View key={tab + phase} entering={FadeIn.duration(220)} style={{ marginTop: 20 }}>
        {phase === "error-unsupported" && (
          <ErrorState
            title="Unsupported file"
            body="Screvo needs a video file — MP4, MOV, WebM or M4V. That file wasn't a video."
            actionLabel="Choose another file"
            onAction={() => setPhase("idle")}
          />
        )}
        {phase === "error-failed" && (
          <ErrorState
            title="Upload failed"
            body="The upload stopped partway. This is usually a flaky connection — your file wasn't changed."
            actionLabel="Retry upload"
            onAction={() => setPhase("uploading")}
            secondaryLabel="Cancel"
            onSecondary={() => setPhase("idle")}
          />
        )}
        {phase === "error-offline" && (
          <ErrorState
            title="No internet connection"
            body="Screvo needs a connection to analyze videos. Reconnect and try again."
            actionLabel="Try again"
            onAction={() => setPhase("idle")}
          />
        )}

        {phase === "uploading" && (
          <Card style={{ padding: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <FileVideo size={20} color={colors.brand200} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>{pending?.name ?? "video.mp4"}</Text>
                <Text style={{ color: colors.ink400, fontSize: 11 }}>
                  {pending?.size ?? "—"} · {pending?.source === "drive" ? "Google Drive" : pending?.source === "screen" ? "Screen recording" : "Uploaded video"}
                </Text>
              </View>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{Math.round(progress)}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress}%` }]} />
            </View>
            <Pressable onPress={() => setPhase("error-failed")} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.ink500, fontSize: 11, fontWeight: "700" }}>Simulate a failure</Text>
            </Pressable>
          </Card>
        )}

        {phase === "idle" && tab === "record" && (
          <Card style={{ padding: 28, alignItems: "center" }}>
            <View style={[styles.bigIcon, { backgroundColor: colors.brand }]}>
              <MonitorSmartphone size={28} color="#fff" />
            </View>
            <Text style={styles.cardTitle}>Record your screen</Text>
            <Text style={styles.cardBody}>Screvo captures every touchpoint with its timestamp for AI analysis and zoom effects.</Text>
            <Button label="Open recorder" full onPress={() => router.push("/record")} style={{ marginTop: 20 }} />
          </Card>
        )}

        {phase === "idle" && tab === "upload" && (
          <View>
            <Text style={{ color: colors.ink400, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
              Any video works — screen recordings and normal footage: talking-head, product shots, webinar
              clips, phone videos. Screvo builds chapters, narration and subtitles either way.
            </Text>

            <Pressable onPress={() => setDevicePicker(true)} style={styles.dropzone}>
              <UploadCloud size={30} color={colors.brand200} />
              <Text style={styles.cardTitle}>Choose a video from this device</Text>
              <Text style={{ color: colors.ink400, fontSize: 12, marginTop: 4 }}>MP4, MOV, WebM, M4V · up to 2 GB</Text>
            </Pressable>

            <Pressable onPress={() => setDrive("connect")} style={styles.driveRow}>
              <View style={styles.driveIcon}>
                <HardDrive size={18} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Import from Google Drive</Text>
                <Text style={{ color: colors.ink400, fontSize: 11 }}>Pick a video straight from your Drive</Text>
              </View>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable onPress={() => setPhase("error-unsupported")} style={styles.altBtn}>
                <Text style={styles.altText}>Try a non-video file</Text>
              </Pressable>
              <Pressable onPress={() => setPhase("error-offline")} style={[styles.altBtn, { flexDirection: "row", gap: 6, flex: 0, paddingHorizontal: 14 }]}>
                <Wifi size={13} color={colors.ink300} />
                <Text style={styles.altText}>Offline</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === "idle" && tab === "import" && (
          <Card style={{ padding: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <LinkIcon size={16} color={colors.brand200} />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Import from a link</Text>
            </View>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://drive.google.com/…  or  loom.com/share/…"
              placeholderTextColor={colors.ink500}
              autoCapitalize="none"
              style={styles.input}
            />
            <Text style={{ color: colors.ink500, fontSize: 11, marginTop: 8 }}>Google Drive & Dropbox share links, Loom, YouTube, or a direct MP4 URL.</Text>
            <Button
              label="Import"
              full
              disabled={!/^https?:\/\//.test(url)}
              onPress={() => {
                const isDrive = /drive\.google|docs\.google/.test(url);
                setPending({ name: isDrive ? "Drive video.mp4" : "Imported video.mp4", size: "—", source: isDrive ? "drive" : "video" });
                toast("Fetching video from link…", "ai");
                setAsking(true);
              }}
              style={{ marginTop: 16 }}
            />
          </Card>
        )}

        {phase === "idle" && tab === "template" && (
          <Card style={{ padding: 28, alignItems: "center" }}>
            <View style={[styles.bigIcon, { backgroundColor: "rgba(237,191,27,0.2)" }]}>
              <LayoutTemplate size={28} color={colors.gold} />
            </View>
            <Text style={styles.cardTitle}>Start from a structure</Text>
            <Text style={styles.cardBody}>Pick a template and Screvo pre-builds the chapter plan.</Text>
            <Button label="Browse templates" full onPress={() => router.push("/templates")} style={{ marginTop: 20 }} />
          </Card>
        )}
      </Animated.View>

      {/* device picker */}
      <Sheet open={devicePicker} onClose={() => setDevicePicker(false)} title="Choose a video" subtitle="From this device" size="sm">
        <View style={{ gap: 8 }}>
          <Pressable onPress={pickFromLibrary} style={styles.fileRow}>
            <Images size={17} color={colors.brand200} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Photos & videos</Text>
              <Text style={{ color: colors.ink400, fontSize: 11 }}>Your camera roll and screen recordings</Text>
            </View>
          </Pressable>
          <Pressable onPress={pickFromFiles} style={styles.fileRow}>
            <FolderOpen size={17} color={colors.teal} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Browse files</Text>
              <Text style={{ color: colors.ink400, fontSize: 11 }}>Any video in Files, Downloads or Drive</Text>
            </View>
          </Pressable>
        </View>
      </Sheet>

      {/* analyse or edit */}
      <Sheet
        open={asking}
        onClose={() => {
          setAsking(false);
          setPending(null);
        }}
        title="What should Screvo do with it?"
        subtitle={pending?.name}
        size="md"
      >
        <View style={{ gap: 10 }}>
          <Pressable onPress={() => proceed("analyse")} style={[styles.choice, { borderColor: "rgba(91,95,209,0.45)", backgroundColor: "rgba(91,95,209,0.12)" }]}>
            <View style={[styles.choiceIcon, { backgroundColor: colors.brand }]}>
              <Sparkles size={17} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>Analyse it with AI</Text>
              <Text style={styles.choiceBody}>
                Claude Opus watches the footage, splits it into steps, writes the narration and
                places the zooms. Takes a minute or two.
              </Text>
            </View>
          </Pressable>

          <Pressable onPress={() => proceed("edit")} style={styles.choice}>
            <View style={[styles.choiceIcon, { backgroundColor: "rgba(63,209,204,0.18)" }]}>
              <Scissors size={17} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>Just let me edit it</Text>
              <Text style={styles.choiceBody}>
                Straight into the editor with the full clip. Trim, speed, music, intro and captions
                are all there — and you can run the analysis later.
              </Text>
            </View>
          </Pressable>
        </View>
      </Sheet>

      {/* Google Drive */}
      <Sheet open={!!drive} onClose={() => setDrive(null)} title="Google Drive" subtitle="Pick a video to import" size="md">
        {drive === "connect" ? (
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <View style={styles.driveIconLg}>
              <HardDrive size={24} color={colors.teal} />
            </View>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14, marginTop: 12 }}>Connect Google Drive</Text>
            <Text style={{ color: colors.ink400, fontSize: 12, textAlign: "center", marginTop: 4, maxWidth: 260 }}>
              Screvo will list your videos so you can import one without downloading it first.
            </Text>
            <Button
              label="Connect"
              onPress={() => {
                toast("Connecting to Google Drive…");
                setTimeout(() => setDrive("list"), 700);
              }}
              style={{ marginTop: 16 }}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Check size={13} color={colors.teal} />
              <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "700" }}>Connected as tvvishal1997@gmail.com</Text>
            </View>
            {DRIVE_FILES.map((f) => (
              <Pressable
                key={f.name}
                onPress={() => {
                  setPending({ name: f.name, size: f.size, source: f.kind === "Screen recording" ? "screen" : "drive" });
                  setDrive(null);
                  setTab("upload");
                  setAsking(true);
                }}
                style={styles.fileRow}
              >
                <Film size={17} color={colors.ink300} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>{f.name}</Text>
                  <Text style={{ color: colors.ink400, fontSize: 11 }}>{f.size} · {f.kind}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: colors.ink700, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.brand },
  bigIcon: { width: 64, height: 64, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#fff", textAlign: "center" },
  cardBody: { fontSize: 13, color: colors.ink400, textAlign: "center", marginTop: 6, lineHeight: 19 },
  dropzone: {
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed",
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 28,
  },
  driveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    padding: 14,
  },
  driveIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(63,209,204,0.15)", alignItems: "center", justifyContent: "center" },
  driveIconLg: { width: 56, height: 56, borderRadius: 18, backgroundColor: "rgba(63,209,204,0.15)", alignItems: "center", justifyContent: "center" },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    padding: 12,
  },
  altBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  altText: { color: colors.ink300, fontSize: 12, fontWeight: "700" },
  choice: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    padding: 14,
  },
  choiceIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  choiceTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  choiceBody: { color: colors.ink400, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: colors.ink800,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: "#fff",
  },
});
