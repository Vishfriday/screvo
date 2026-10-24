import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { requestRecordingPermissionsAsync, getRecordingPermissionsAsync } from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Mic, MicOff, Camera, CameraOff, Hand, X, Pause, Play, Square, Circle, MonitorSmartphone, Images, FolderOpen, Sparkles, Scissors, Gauge } from "lucide-react-native";
import { Frame, FRAME_COUNT, BASE_W, BASE_H } from "@/data/frames";
import { useStore } from "@/store/useStore";
import { makeDemoProjects } from "@/data/demoProjects";
import { ConfirmDialog, ErrorState } from "@/components/ui/Misc";
import { Sheet } from "@/components/ui/Sheet";
import { QUALITIES, qualityFor } from "@/lib/quality";
import { adoptVideoFile } from "@/lib/files";
import { RippleOnce } from "@/components/ui/Motion";
import { fmtTimeMs } from "@/lib/format";
import { canCaptureScreen, startScreenCapture, stopScreenCapture } from "../modules/screvo-screen-capture";
import type { Touchpoint } from "@/lib/types";
import { colors } from "@/theme/tokens";

interface Ripple { id: number; x: number; y: number }

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createProject, toast } = useStore();
  const captureQuality = useStore((s) => s.captureQuality);
  const setCaptureQuality = useStore((s) => s.setCaptureQuality);

  // "capture" = Screvo records the screen itself (development or release build);
  // "guide"    = Expo Go cannot, so the phone's own recorder is imported instead;
  // "demo"     = the built-in touchpoint capture surface, kept for demos.
  const nativeCapture = canCaptureScreen();
  const [mode, setMode] = useState<"capture" | "guide" | "demo">(nativeCapture ? "capture" : "guide");
  const [capturing, setCapturing] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  // the mic stays off unless it is asked for: a screen recording otherwise
  // picks up whatever is happening in the room
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [showTouch, setShowTouch] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [tps, setTps] = useState<Touchpoint[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  // a file picked from the library waits here until "analyse or edit" is answered
  const [pendingImport, setPendingImport] = useState<{ name: string; uri: string; durationMs?: number | null } | null>(null);
  // what the recorder actually managed, which can be less than was asked for
  const [recordedAt, setRecordedAt] = useState<{ width: number; height: number } | null>(null);
  const rid = useRef(0);
  const startAt = useRef(0);
  const surface = useRef({ w: BASE_W, h: BASE_H });

  const recDot = useSharedValue(1);
  useEffect(() => {
    recDot.value = state === "recording" ? withRepeat(withTiming(0.2, { duration: 600 }), -1, true) : withTiming(0.4);
  }, [state]);
  const recDotStyle = useAnimatedStyle(() => ({ opacity: recDot.value }));

  useEffect(() => {
    if (state !== "recording") return;
    startAt.current = Date.now() - elapsed * 1000;
    const iv = setInterval(() => setElapsed((Date.now() - startAt.current) / 1000), 66);
    return () => clearInterval(iv);
  }, [state]);

  useEffect(() => {
    if (state !== "recording") return;
    const iv = setInterval(() => setFrameIdx((f) => (f + 1) % FRAME_COUNT), 3400);
    return () => clearInterval(iv);
  }, [state]);

  function onTouch(e: any) {
    if (state === "idle" || state === "error") return;
    const { locationX, locationY } = e.nativeEvent;
    const x = Math.max(0, Math.min(1, locationX / surface.current.w));
    const y = Math.max(0, Math.min(1, locationY / surface.current.h));
    const id = ++rid.current;
    setRipples((r) => [...r, { id, x, y }]);
    setTimeout(() => setRipples((r) => r.filter((z) => z.id !== id)), 850);
    setTps((t) => [...t, { id: `tp_${id}`, x, y, t: elapsed, label: "Touch", key: false }]);
  }

  function finishImport(rawName: string, uri: string, durationMs?: number | null, analyse = true) {
    const dur = durationMs ? Math.max(2, Math.round(durationMs / 1000)) : 30;
    const name = rawName.replace(/\.[a-z0-9]+$/i, "") || "Screen recording";
    const id = createProject({
      name,
      status: analyse ? "processing" : "ready",
      analysed: analyse,
      source: "screen",
      sourceUri: uri,
      durationSec: dur,
      clips: [{ id: `clip_${Date.now()}`, track: "video" as const, start: 0, duration: dur, label: "Source video", frame: 0, color: "#5B5FD1", speed: 1, volume: 1 }],
      chapters: analyse ? undefined : [{ id: `ch_${Date.now()}`, name, start: 0, duration: dur, frame: 0, summary: "" }],
      frameSize: recordedAt ?? undefined,
      thumbnailFrame: 0,
      touchpoints: [],
    });
    router.replace(analyse ? `/processing/${id}` : `/editor/${id}`);
  }

  async function importRecording(from: "library" | "files") {
    if (from === "library") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast(
          perm.canAskAgain
            ? "Photo access is needed to import your recording"
            : "Enable photo access for Screvo in Settings",
          "error",
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 1 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const name = a.fileName ?? "Screen recording.mp4";
      setPendingImport({ name, uri: await adoptVideoFile(a.uri, name), durationMs: a.duration });
    } else {
      const res = await DocumentPicker.getDocumentAsync({ type: "video/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const picked = res.assets[0];
      setPendingImport({ name: picked.name, uri: await adoptVideoFile(picked.uri, picked.name) });
    }
  }

  /** Screvo's own recorder: the system asks once, then the service captures. */
  async function startCapture() {
    setCapturePending(true);
    try {
      // the recorder writes a mic track, which MediaRecorder refuses without
      // the runtime permission — ask before the capture starts, not after
      let withAudio = mic;
      if (withAudio) {
        const current = await getRecordingPermissionsAsync();
        const perm = current.granted ? current : await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          withAudio = false;
          setMic(false);
          toast("Recording without sound — microphone access was declined", "error");
        }
      }
      const started = await startScreenCapture(withAudio, qualityFor(captureQuality).longEdge);
      if (started.width && started.height) setRecordedAt({ width: started.width, height: started.height });
      setCapturing(true);
      setElapsed(0);
      setState("recording");
      const got = started.width && started.height ? ` at ${started.width}×${started.height}` : "";
      toast(`Recording your screen${got} — switch to the app you want to show`, "ai");
    } catch (e: any) {
      toast(e?.message ?? "Screen recording could not start", "error");
    } finally {
      setCapturePending(false);
    }
  }

  async function stopCapture() {
    setCapturePending(true);
    try {
      const { uri, durationSec } = await stopScreenCapture();
      setCapturing(false);
      setState("idle");
      finishImport(`Screen recording ${new Date().toLocaleTimeString()}`, uri, durationSec * 1000);
    } catch (e: any) {
      setCapturing(false);
      setState("idle");
      toast(e?.message ?? "The recording could not be saved", "error");
    } finally {
      setCapturePending(false);
    }
  }

  function start() {
    setState("recording");
    setElapsed(0);
    setTps([]);
    toast("Recording started — every touch is captured", "ai");
  }

  function stop() {
    if (elapsed < 1.5) {
      setState("error");
      return;
    }
    const demo = makeDemoProjects()[0];
    const id = createProject({
      name: "Untitled Recording",
      status: "processing",
      durationSec: Math.max(demo.durationSec, Math.round(elapsed)),
      clips: demo.clips,
      thumbnailFrame: 0,
      touchpoints: tps.length ? tps.map((t, i) => ({ ...t, key: i % 2 === 0 })) : demo.touchpoints,
    });
    router.replace(`/processing/${id}`);
  }

  if (mode === "capture") {
    return (
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => (capturing ? setConfirmCancel(true) : router.back())} style={styles.iconRound}>
            <X size={18} color="#fff" />
          </Pressable>
          {capturing ? (
            <View style={styles.timerPill}>
              <Animated.View style={[styles.recDot, recDotStyle]} />
              <Text style={styles.timerText}>{fmtTimeMs(elapsed)}</Text>
            </View>
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Record your screen</Text>
          )}
          <View style={{ width: 36 }} />
        </View>

        <View style={{ flex: 1, paddingHorizontal: 22, justifyContent: "center", gap: 16 }}>
          <View style={styles.introCard}>
            <View style={styles.introIcon}>
              <MonitorSmartphone size={22} color="#fff" />
            </View>
            <Text style={styles.introTitle}>{capturing ? "Screvo is recording" : "Screvo records your screen"}</Text>
            <Text style={styles.introBody}>
              {capturing
                ? "Run your workflow in any app. Come back here and stop when you are done — the clip goes straight into a project."
                : Platform.OS === "web"
                  ? "Your browser asks which window or screen to share, then Screvo records it. Quality follows whatever surface you pick."
                  : "Android asks once for permission, then Screvo captures the screen itself. Everything you do in any app is recorded."}
            </Text>
            {!capturing && (
              <>
                <Pressable onPress={() => setMic((m) => !m)} style={styles.stepRow}>
                  <View style={styles.stepNum}>{mic ? <Mic size={13} color="#fff" /> : <MicOff size={13} color="#fff" />}</View>
                  <Text style={styles.stepText}>{mic ? "Microphone on — narrate as you go" : "Microphone off — silent capture"}</Text>
                </Pressable>
                {Platform.OS !== "web" && (
                  <Pressable onPress={() => setQualityOpen(true)} style={styles.stepRow}>
                    <View style={styles.stepNum}><Gauge size={13} color="#fff" /></View>
                    <Text style={styles.stepText}>
                      Quality: {qualityFor(captureQuality).label} — {qualityFor(captureQuality).note}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </View>

          {capturing ? (
            <Pressable onPress={stopCapture} disabled={capturePending} style={[styles.introPrimary, capturePending && { opacity: 0.5 }]}>
              <Square size={15} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                {capturePending ? "Saving…" : "Stop and analyse"}
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={startCapture} disabled={capturePending} style={[styles.introPrimary, capturePending && { opacity: 0.5 }]}>
              <Circle size={15} color="#fff" fill="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                {capturePending ? "Asking Android…" : "Start recording"}
              </Text>
            </Pressable>
          )}

          {!capturing && (
            <>
              <Pressable onPress={() => importRecording("library")} style={styles.introSecondary}>
                <Images size={15} color={colors.ink200} />
                <Text style={{ color: colors.ink200, fontWeight: "700", fontSize: 13 }}>Import an existing recording</Text>
              </Pressable>
              <Pressable onPress={() => setMode("demo")} style={{ alignSelf: "center", paddingVertical: 8 }}>
                <Text style={styles.demoLink}>Try the touchpoint demo recorder</Text>
              </Pressable>
            </>
          )}
        </View>

        <Sheet
          open={qualityOpen}
          onClose={() => setQualityOpen(false)}
          title="Recording quality"
          subtitle="Capped to what your screen and encoder can do"
          size="sm"
        >
          <View style={{ gap: 8 }}>
            {QUALITIES.map((q) => (
              <Pressable
                key={q.id}
                onPress={() => {
                  setCaptureQuality(q.id);
                  setQualityOpen(false);
                }}
                style={[styles.qRow, captureQuality === q.id && { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.12)" }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{q.label}</Text>
                  <Text style={{ color: colors.ink400, fontSize: 11 }}>{q.note}</Text>
                </View>
                <Text style={{ color: colors.ink500, fontSize: 11, fontWeight: "700" }}>
                  {Math.round(q.bitrate / 1_000_000)} Mbps
                </Text>
              </Pressable>
            ))}
            <Text style={{ color: colors.ink500, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
              A recording can only hold what the panel shows, so on a 1080p screen every preset
              records 1080p. Screvo picks the highest size your display and encoder both accept and
              tells you what it got.
            </Text>
          </View>
        </Sheet>

        <Sheet
          open={!!pendingImport}
          onClose={() => setPendingImport(null)}
          title="What should Screvo do with it?"
          subtitle={pendingImport?.name}
          size="md"
        >
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={() => {
                const it = pendingImport;
                setPendingImport(null);
                if (it) finishImport(it.name, it.uri, it.durationMs, true);
              }}
              style={[styles.choice, { borderColor: "rgba(91,95,209,0.45)", backgroundColor: "rgba(91,95,209,0.12)" }]}
            >
              <View style={[styles.choiceIcon, { backgroundColor: colors.brand }]}>
                <Sparkles size={17} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>Analyse it with AI</Text>
                <Text style={styles.choiceBody}>Steps, narration and zooms, found in the footage.</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => {
                const it = pendingImport;
                setPendingImport(null);
                if (it) finishImport(it.name, it.uri, it.durationMs, false);
              }}
              style={styles.choice}
            >
              <View style={[styles.choiceIcon, { backgroundColor: "rgba(63,209,204,0.18)" }]}>
                <Scissors size={17} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>Just let me edit it</Text>
                <Text style={styles.choiceBody}>Straight into the editor with the whole clip.</Text>
              </View>
            </Pressable>
          </View>
        </Sheet>

        <ConfirmDialog
          open={confirmCancel}
          title="Discard this recording?"
          body="The capture stops and the clip is thrown away."
          confirmLabel="Discard"
          danger
          onCancel={() => setConfirmCancel(false)}
          onConfirm={async () => {
            setConfirmCancel(false);
            try {
              await stopScreenCapture();
            } catch {
              // nothing was recording
            }
            setCapturing(false);
            setState("idle");
            router.back();
          }}
        />
      </View>
    );
  }

  if (mode === "guide") {
    const steps =
      Platform.OS === "ios"
        ? ["Open Control Centre", "Tap the Screen Recording button", "Run your workflow, then stop the recording"]
        : ["Swipe down to Quick Settings", "Tap Screen record, then Start", "Run your workflow, then stop the recording"];
    return (
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.iconRound}>
            <X size={18} color="#fff" />
          </Pressable>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Record your screen</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ flex: 1, paddingHorizontal: 22, justifyContent: "center", gap: 16 }}>
          <View style={styles.introCard}>
            <View style={styles.introIcon}>
              <MonitorSmartphone size={22} color="#fff" />
            </View>
            <Text style={styles.introTitle}>Use your phone's screen recorder</Text>
            <Text style={styles.introBody}>
              {nativeCapture
                ? "Your phone records everything — including other apps. Screvo picks the clip up afterwards."
                : "Expo Go cannot capture the screen, so record with the phone and import the clip. A development build of Screvo records it directly."}
            </Text>
            {steps.map((label, i) => (
              <View key={label} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{label}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={() => importRecording("library")} style={styles.introPrimary}>
            <Images size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Import a screen recording</Text>
          </Pressable>

          <Pressable onPress={() => importRecording("files")} style={styles.introSecondary}>
            <FolderOpen size={15} color={colors.ink200} />
            <Text style={{ color: colors.ink200, fontWeight: "700", fontSize: 13 }}>Browse files instead</Text>
          </Pressable>

          {nativeCapture && (
            <Pressable onPress={() => setMode("capture")} style={styles.introSecondary}>
              <MonitorSmartphone size={15} color={colors.ink200} />
              <Text style={{ color: colors.ink200, fontWeight: "700", fontSize: 13 }}>Let Screvo record instead</Text>
            </Pressable>
          )}

          <Pressable onPress={() => setMode("demo")} style={{ alignSelf: "center", paddingVertical: 8 }}>
            <Text style={styles.demoLink}>Try the touchpoint demo recorder</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (state === "error") {
    return (
      <View style={[styles.root, { justifyContent: "center", paddingHorizontal: 24 }]}>
        <ErrorState
          title="Recording failed"
          body="That clip was too short to analyze (under 1.5s). Record at least a few seconds of your workflow."
          actionLabel="Try again"
          onAction={() => { setState("idle"); setElapsed(0); }}
          secondaryLabel="Back to Home"
          onSecondary={() => router.replace("/")}
        />
      </View>
    );
  }

  const scale = 300 / BASE_W;

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => (state === "idle" ? router.back() : setConfirmCancel(true))} style={styles.iconRound}>
          <X size={18} color="#fff" />
        </Pressable>
        <View style={styles.timerPill}>
          <Animated.View style={[styles.recDot, recDotStyle]} />
          <Text style={styles.timerText}>{fmtTimeMs(elapsed)}</Text>
        </View>
        <View style={styles.tpPill}>
          <Hand size={12} color={colors.teal} />
          <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "700" }}>{tps.length}</Text>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
        <Pressable
          onPress={onTouch}
          onLayout={(e) => (surface.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          style={styles.surface}
        >
          <Animated.View key={frameIdx} entering={FadeIn.duration(400)} style={StyleSheet.absoluteFill}>
            <View style={{ width: BASE_W, height: BASE_H, transform: [{ scale }], position: "absolute", left: "50%", top: "50%", marginLeft: -BASE_W / 2, marginTop: -BASE_H / 2 }}>
              <Frame index={frameIdx} />
            </View>
          </Animated.View>

          {cam && (
            <View style={styles.pip}>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>You</Text>
            </View>
          )}

          {showTouch &&
            ripples.map((r) => (
              <View key={r.id} style={{ position: "absolute", left: `${r.x * 100}%`, top: `${r.y * 100}%` }} pointerEvents="none">
                <View style={{ position: "absolute", marginLeft: -27, marginTop: -27, alignItems: "center", justifyContent: "center" }}>
                  <RippleOnce size={54} color={colors.teal} />
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.teal }} />
                </View>
              </View>
            ))}

          {state === "idle" && (
            <View style={styles.readyOverlay}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Demo surface</Text>
              <Text style={{ color: colors.ink300, fontSize: 12, textAlign: "center", marginTop: 4, maxWidth: 200 }}>
                Tap anywhere on this surface while recording to drop a touchpoint.
              </Text>
            </View>
          )}
          {state === "paused" && (
            <View style={styles.readyOverlay}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 }}>Paused</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.toggles}>
        {[
          { on: mic, set: setMic, IconOn: Mic, IconOff: MicOff, label: "Mic" },
          { on: cam, set: setCam, IconOn: Camera, IconOff: CameraOff, label: "Camera" },
          { on: showTouch, set: setShowTouch, IconOn: Hand, IconOff: Hand, label: "Touchpoints" },
        ].map(({ on, set, IconOn, IconOff, label }) => (
          <Pressable key={label} onPress={() => set(!on)} style={[styles.toggle, on ? { backgroundColor: "rgba(91,95,209,0.2)" } : { backgroundColor: "rgba(255,255,255,0.05)" }]}>
            {on ? <IconOn size={18} color="#fff" /> : <IconOff size={18} color={colors.ink500} />}
            <Text style={{ fontSize: 10, fontWeight: "700", color: on ? "#fff" : colors.ink500 }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.transport, { paddingBottom: insets.bottom + 24 }]}>
        {state !== "idle" && (
          <Pressable onPress={() => setState(state === "paused" ? "recording" : "paused")} style={styles.sideBtn}>
            {state === "paused" ? <Play size={22} color="#fff" /> : <Pause size={22} color="#fff" />}
          </Pressable>
        )}
        <Pressable onPress={state === "idle" ? start : stop} style={styles.recBtn}>
          {state === "idle" ? <Circle size={26} color="#fff" fill="#fff" /> : <Square size={24} color="#fff" fill="#fff" />}
        </Pressable>
        {state !== "idle" && <View style={styles.sideBtn} />}
      </View>

      <ConfirmDialog
        open={confirmCancel}
        title="Discard recording?"
        body="This recording and its touchpoints won't be saved."
        confirmLabel="Discard"
        danger
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => { setConfirmCancel(false); router.replace("/"); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  introCard: { borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.ink900, padding: 20, gap: 10 },
  introIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  introTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  introBody: { color: colors.ink300, fontSize: 12.5, lineHeight: 18, marginBottom: 4 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(91,95,209,0.25)", alignItems: "center", justifyContent: "center" },
  stepNumText: { color: colors.brand200, fontSize: 11, fontWeight: "800" },
  stepText: { color: colors.ink200, fontSize: 13, flex: 1 },
  introPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, borderRadius: 18, paddingVertical: 15 },
  introSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18, paddingVertical: 13 },
  qRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
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
  demoLink: { color: colors.ink500, fontSize: 12, fontWeight: "700" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  iconRound: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#EF4444" },
  timerText: { color: "#fff", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
  tpPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  surface: { width: "100%", maxWidth: 300, aspectRatio: 9 / 16, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "#000", overflow: "hidden" },
  pip: { position: "absolute", bottom: 12, right: 12, width: 64, height: 80, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", backgroundColor: colors.ink800, alignItems: "center", justifyContent: "center" },
  readyOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 20 },
  toggles: { flexDirection: "row", justifyContent: "center", gap: 12, paddingHorizontal: 20 },
  toggle: { alignItems: "center", gap: 4, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  transport: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 32, paddingTop: 20 },
  sideBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  recBtn: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: "rgba(255,255,255,0.8)", backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
});
