import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Mic, Send, Keyboard, ShieldAlert, Headphones, Settings, Scissors, Ruler, Trash2, Gauge } from "lucide-react-native";
import { useAskScrevoCore, FollowUpChips } from "./AskScrevo";
import type { MicAccess } from "@/hooks/useMicAccess";
import { useStore } from "@/store/useStore";
import { OPUS_MODEL } from "@/lib/opus";
import { colors } from "@/theme/tokens";

/** Connected mic chip — sits above the video preview. */
export function VoiceTopBar({ mic, right }: { mic: MicAccess; right?: React.ReactNode }) {
  const currentLabel = mic.current?.name ?? (mic.inputs[0]?.name || undefined);
  return (
    <View style={styles.topRow}>
      <View style={[styles.connectedRow, !mic.granted && styles.connectedOff]}>
        <Headphones size={11} color={mic.granted ? colors.tealSoft : colors.ink400} />
        <Text style={[styles.connectedText, !mic.granted && { color: colors.ink400 }]} numberOfLines={1}>
          {mic.granted ? currentLabel ?? "Microphone connected" : "Microphone off"}
        </Text>
      </View>

      {mic.granted && mic.inputs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flexGrow: 0, flexShrink: 1 }}>
          {mic.inputs.map((inp) => (
            <Pressable
              key={inp.uid}
              onPress={() => mic.selectInput(inp.uid)}
              style={[styles.inputChip, inp.uid === mic.current?.uid && styles.inputChipActive]}
            >
              <Text style={[styles.inputChipText, inp.uid === mic.current?.uid && { color: "#fff" }]}>{inp.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {right ? <View style={{ marginLeft: "auto" }}>{right}</View> : null}
    </View>
  );
}

/**
 * Voice command surface, opened from the Ask AI tool. `autoStart` begins
 * listening as soon as it opens, so one tap on the tool starts a command.
 */
export function VoiceCommandPanel({ mic, autoStart }: { mic: MicAccess; autoStart?: boolean }) {
  const core = useAskScrevoCore();
  const { value, setValue, listening, startListening, stopListening, thinking, submit, followUp } = core;
  const { openPanel, splitClipAtPlayhead, deleteClip, selectedClipId, editing, playhead, toast } = useStore();
  const [mode, setMode] = useState<"voice" | "text">("voice");

  const micReady = mic.granted;
  const voiceUI = mode === "voice" && micReady;

  const pulse = useSharedValue(0);
  React.useEffect(() => {
    pulse.value = listening ? withRepeat(withTiming(1, { duration: 900 }), -1, true) : withTiming(0);
  }, [listening]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.08 }] }));

  React.useEffect(() => {
    if (autoStart && micReady) startListening();
  }, []);

  const withClip = (fn: (id: string) => void, verb: string) => () => {
    const p = editing();
    const id = selectedClipId ?? p?.clips.find((c) => c.track === "video" && playhead >= c.start && playhead < c.start + c.duration)?.id;
    if (!id) return toast(`Move the playhead over a clip to ${verb} it`, "error");
    fn(id);
  };
  const quick = [
    { id: "split", label: "Split", Icon: Scissors, run: () => splitClipAtPlayhead() },
    { id: "trim", label: "Trim", Icon: Ruler, run: () => openPanel("trim") },
    { id: "delete", label: "Delete", Icon: Trash2, run: withClip((id) => { deleteClip(id); toast("Clip deleted", "success"); }, "delete") },
    { id: "speed", label: "Speed", Icon: Gauge, run: () => openPanel("speed") },
  ];

  return (
    <View>
      {!micReady && mode === "voice" && (
        <View style={styles.permCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.permIcon}>
              <Mic size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>Turn on your microphone</Text>
              <Text style={styles.permBody}>Built-in mic, wired or Bluetooth headset.</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <Pressable onPress={mic.request} disabled={mic.requesting} style={[styles.allowBtn, mic.requesting && { opacity: 0.6 }]}>
              <Mic size={14} color="#fff" />
              <Text style={styles.allowText}>{mic.requesting ? "Requesting…" : "Allow Microphone Access"}</Text>
            </Pressable>
            <Pressable onPress={() => setMode("text")} style={styles.typeBtn}>
              <Text style={{ color: colors.ink200, fontSize: 11, fontWeight: "700" }}>Type</Text>
            </Pressable>
          </View>
          {mic.status === "denied" && (
            <View style={styles.deniedBox}>
              <ShieldAlert size={12} color="#FCA5A5" style={{ marginTop: 1 }} />
              <Text style={styles.deniedText}>
                {mic.canAskAgain
                  ? "Microphone access was declined. Tap Allow again to retry."
                  : "Microphone access is blocked. Open Settings to enable it for Screvo."}
              </Text>
              {!mic.canAskAgain && (
                <Pressable onPress={mic.openSettings} style={styles.settingsBtn}>
                  <Settings size={12} color={colors.ink200} />
                  <Text style={{ color: colors.ink200, fontSize: 11, fontWeight: "700" }}>Settings</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {(voiceUI || mode === "text") && (
        <>
          {voiceUI ? (
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <Pressable onPress={listening ? stopListening : startListening} disabled={thinking} accessibilityLabel="Speak a command">
                <Animated.View style={[styles.micCircle, pulseStyle]}>
                  <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Mic size={30} color="#fff" />
                </Animated.View>
              </Pressable>

              <View style={[styles.micRow, { marginTop: 14 }]}>
                <Pressable onPress={() => setMode("text")} style={styles.sideBtn} accessibilityLabel="Type instead">
                  <Keyboard size={17} color={colors.ink200} />
                </Pressable>
                <Pressable
                  onPress={() => (value ? submit(value) : listening ? stopListening() : startListening())}
                  disabled={thinking}
                  style={[styles.speakBtn, thinking && { opacity: 0.5 }]}
                >
                  <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                    {listening ? "Listening… tap to stop" : value ? "Send command" : "Tap to speak"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.micRow}>
              <Pressable onPress={() => setMode("voice")} style={styles.sideBtn} accessibilityLabel="Use voice">
                <Mic size={17} color={colors.ink200} />
              </Pressable>
              <TextInput
                value={value}
                onChangeText={setValue}
                onSubmitEditing={() => submit(value)}
                placeholder="Type a command…"
                placeholderTextColor={colors.ink500}
                style={styles.textInput}
                returnKeyType="send"
              />
              <Pressable
                onPress={() => submit(value)}
                disabled={!value.trim() || thinking}
                style={[styles.sideBtn, { overflow: "hidden" }, (!value.trim() || thinking) && { opacity: 0.4 }]}
              >
                <LinearGradient colors={["#5B5FD1", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Send size={16} color="#fff" />
              </Pressable>
            </View>
          )}

          <Text style={styles.status} numberOfLines={1}>
            {thinking
              ? `${OPUS_MODEL} is working…`
              : listening
                ? "Go ahead…"
                : value
                  ? `"${value}" — tap send`
                  : followUp
                    ? "Pick one below"
                    : voiceUI
                      ? "Tap the mic and say an edit"
                      : "Type what you want to change"}
          </Text>
        </>
      )}

      {followUp && (
        <View style={{ marginTop: 6 }}>
          <FollowUpChips followUp={followUp} onPick={core.choose} onDismiss={core.dismissFollowUp} />
        </View>
      )}

      {/* quick clip controls under the mic */}
      <View style={styles.quickRow}>
        {quick.map(({ id, label, Icon, run }) => {
          const danger = id === "delete";
          return (
            <Pressable key={id} onPress={run} style={({ pressed }) => [styles.quickBtn, danger && styles.quickDanger, pressed && { transform: [{ scale: 0.94 }] }]}>
              <Icon size={17} color={danger ? "#FCA5A5" : colors.ink200} />
              <Text style={[styles.quickText, danger && { color: "#FCA5A5" }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  connectedRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(63,209,204,0.15)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 1 },
  connectedOff: { backgroundColor: "rgba(255,255,255,0.08)" },
  connectedText: { color: colors.tealSoft, fontSize: 10, fontWeight: "800", flexShrink: 1 },
  inputChip: { borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  inputChipActive: { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.25)" },
  inputChipText: { color: colors.ink400, fontSize: 10, fontWeight: "700" },
  permCard: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(91,95,209,0.3)", backgroundColor: "rgba(91,95,209,0.1)", padding: 10, marginBottom: 4 },
  permIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  permTitle: { color: "#fff", fontWeight: "800", fontSize: 13 },
  permBody: { color: colors.ink300, fontSize: 11, marginTop: 1 },
  allowBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, borderRadius: 12, height: 38 },
  allowText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  typeBtn: { height: 38, borderRadius: 12, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  deniedBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  deniedText: { color: "#FCA5A5", fontSize: 11, lineHeight: 15, flex: 1 },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  micRow: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" },
  sideBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  speakBtn: { flex: 1, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  micCircle: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  textInput: { flex: 1, height: 44, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.ink800, paddingHorizontal: 12, color: "#fff", fontSize: 14 },
  status: { marginTop: 8, color: colors.ink300, fontSize: 12, fontWeight: "500", textAlign: "center", minHeight: 16 },
  quickRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  quickBtn: { flex: 1, alignItems: "center", gap: 4, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)", paddingVertical: 8 },
  quickDanger: { borderColor: "rgba(248,113,113,0.2)", backgroundColor: "rgba(239,68,68,0.06)" },
  quickText: { color: colors.ink200, fontSize: 10, fontWeight: "700" },
});
