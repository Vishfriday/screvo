import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Mic, Send, Sparkles, Keyboard, X } from "lucide-react-native";
import { Sheet } from "../ui/Sheet";
import { useStore } from "@/store/useStore";
import {
  interpretCommand, followUpFor, fallbackFollowUp, ASK_EXAMPLES, VOICE_HEARD, OPUS_MODEL,
  type FollowUp, type FollowUpOption,
} from "@/lib/opus";
import { colors } from "@/theme/tokens";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Shared voice/text command engine used by both the floating-FAB sheet and
 * the always-on inline voice panel, so the two entry points never drift apart. */
export function useAskScrevoCore(onApplied?: () => void) {
  const { editing, setPendingAI } = useStore();
  const [listening, setListening] = useState(false);
  const [value, setValue] = useState("");
  const [thinking, setThinking] = useState(false);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const timer = useRef<any>(null);

  /** A phrase was captured (voice) or picked (chip): ask a follow-up if it's vague. */
  const hear = (phrase: string) => {
    const fu = followUpFor(phrase);
    setFollowUp(fu);
    setValue(fu ? "" : phrase);
  };

  const startListening = () => {
    setListening(true);
    setValue("");
    setFollowUp(null);
    timer.current = setTimeout(() => {
      hear(VOICE_HEARD[Math.floor(Math.random() * VOICE_HEARD.length)]);
      setListening(false);
    }, 1900);
  };
  const stopListening = () => {
    if (timer.current) clearTimeout(timer.current);
    setListening(false);
  };

  const submit = (text: string) => {
    const cmd = text.trim();
    if (!cmd) return;
    const p = editing();
    if (!p) return;
    const fu = followUpFor(cmd);
    if (fu) {
      setFollowUp(fu);
      setValue("");
      return;
    }
    setFollowUp(null);
    setThinking(true);
    const s = useStore.getState();
    const snapshot = clone(p);
    const pastLen = s.past.length;
    const plan = interpretCommand(cmd, p, s);
    setTimeout(() => {
      setThinking(false);
      if (!plan.ok) {
        setFollowUp(fallbackFollowUp(cmd));
        setValue("");
        return;
      }
      plan.run(useStore.getState());
      setPendingAI({ summary: plan.summary, steps: plan.steps, snapshot, pastLen });
      setValue("");
      onApplied?.();
      useStore.getState().seek(Math.max(0, useStore.getState().playhead));
    }, 900);
  };

  const choose = (option: FollowUpOption) => {
    setFollowUp(null);
    submit(option.command);
  };

  const reset = () => {
    setValue("");
    setListening(false);
    setThinking(false);
    setFollowUp(null);
    if (timer.current) clearTimeout(timer.current);
  };

  return {
    value, setValue, listening, startListening, stopListening, thinking, submit, reset,
    followUp, hear, choose, dismissFollowUp: () => setFollowUp(null),
  };
}

/** Contextual suggestions shown after a vague command — e.g. a transition with no style named. */
export function FollowUpChips({
  followUp,
  onPick,
  onDismiss,
}: {
  followUp: FollowUp;
  onPick: (o: FollowUpOption) => void;
  onDismiss: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.fuCard}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Sparkles size={13} color={colors.brand200} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.ink400, fontSize: 11 }} numberOfLines={1}>Heard “{followUp.heard}”</Text>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>{followUp.question}</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.fuClose}>
          <X size={12} color={colors.ink300} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {followUp.options.map((o) => (
          <Pressable key={o.label} onPress={() => onPick(o)} style={styles.fuChip}>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

export function AskScrevoFab() {
  const insets = useSafeAreaInsets();
  const openAsk = useStore((s) => s.openAsk);
  const askOpen = useStore((s) => s.askOpen);
  const pendingAI = useStore((s) => s.pendingAI);
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false);
  }, []);
  const ring = useAnimatedStyle(() => ({ opacity: (1 - pulse.value) * 0.5, transform: [{ scale: 0.7 + pulse.value * 1.4 }] }));

  if (askOpen || pendingAI) return null;
  return (
    <Pressable onPress={openAsk} style={[styles.fab, { bottom: insets.bottom + 18 }]}>
      <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={[{ position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }, ring]} />
        <Mic size={16} color="#fff" />
      </View>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Ask Screvo</Text>
    </Pressable>
  );
}

export function AskScrevoSheet() {
  const { askOpen, closeAsk } = useStore();
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const core = useAskScrevoCore(closeAsk);
  const { value, setValue, listening, startListening, stopListening, thinking, submit } = core;

  useEffect(() => {
    if (!askOpen) core.reset();
  }, [askOpen]); // eslint-disable-line

  return (
    <Sheet
      open={askOpen}
      onClose={closeAsk}
      title={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} color={colors.brand200} />
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>Ask Screvo</Text>
        </View>
      }
      subtitle="Tell Screvo what you want to change."
      size="lg"
      footer={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable onPress={() => setMode(mode === "voice" ? "text" : "voice")} style={styles.modeBtn}>
            {mode === "voice" ? <Keyboard size={18} color={colors.ink200} /> : <Mic size={18} color={colors.ink200} />}
          </Pressable>
          {mode === "text" ? (
            <>
              <TextInput
                autoFocus
                value={value}
                onChangeText={setValue}
                onSubmitEditing={() => submit(value)}
                placeholder="Type a command…"
                placeholderTextColor={colors.ink500}
                style={styles.textInput}
              />
              <Pressable onPress={() => submit(value)} disabled={!value.trim() || thinking} style={[styles.sendBtn, (!value.trim() || thinking) && { opacity: 0.4 }]}>
                <LinearGradient colors={["#5B5FD1", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Send size={17} color="#fff" />
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => (value ? submit(value) : startListening())} disabled={thinking} style={styles.speakBtn}>
              <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                {listening ? "Listening… tap to stop" : value ? "Send command" : "Tap to speak"}
              </Text>
            </Pressable>
          )}
        </View>
      }
    >
      <View style={{ alignItems: "center", paddingVertical: 16 }}>
        <Pressable onPress={mode === "voice" ? (listening ? stopListening : startListening) : undefined} style={styles.micCircle}>
          <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Mic size={30} color="#fff" />
        </Pressable>
        <Text style={styles.status}>
          {thinking ? `${OPUS_MODEL} is working…` : listening ? "Go ahead…" : value ? `"${value}"` : "Speak or pick an example"}
        </Text>
        {value && !thinking ? (
          <Pressable onPress={() => setValue("")} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
            <X size={11} color={colors.ink500} />
            <Text style={{ color: colors.ink500, fontSize: 11, fontWeight: "700" }}>clear</Text>
          </Pressable>
        ) : null}
      </View>

      {core.followUp ? (
        <FollowUpChips followUp={core.followUp} onPick={core.choose} onDismiss={core.dismissFollowUp} />
      ) : (
        <>
          <Text style={styles.tryLabel}>TRY</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ASK_EXAMPLES.map((ex) => (
              <Pressable key={ex} onPress={() => core.hear(ex)} style={styles.exChip}>
                <Text style={{ color: colors.ink200, fontSize: 12, fontWeight: "500" }}>{ex}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <View style={styles.explainer}>
        <Text style={{ color: colors.ink400, fontSize: 11, lineHeight: 17 }}>
          Screvo sends your command and the current timeline to {OPUS_MODEL}, which returns a list of editing operations.
          You review the result and choose Keep or Undo.
        </Text>
      </View>
    </Sheet>
  );
}

export function AskScrevoResultBar() {
  const insets = useSafeAreaInsets();
  const { pendingAI, keepAI, revertAI } = useStore();
  if (!pendingAI) return null;
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={[styles.resultBar, { bottom: insets.bottom + 14 }]}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={styles.resultIcon}>
          <Sparkles size={15} color={colors.teal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>Done — I {pendingAI.summary}.</Text>
          <Text style={{ color: colors.ink400, fontSize: 11, marginTop: 2 }}>{pendingAI.steps.join(" · ")}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pressable onPress={revertAI} style={styles.undoBtn}>
          <Text style={{ color: colors.ink200, fontWeight: "800", fontSize: 13 }}>Undo</Text>
        </Pressable>
        <Pressable onPress={keepAI} style={styles.keepBtn}>
          <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Keep</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: { position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12, overflow: "hidden", zIndex: 40 },
  modeBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  textInput: { flex: 1, height: 44, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.ink800, paddingHorizontal: 14, color: "#fff", fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  speakBtn: { flex: 1, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  micCircle: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  status: { marginTop: 8, color: colors.ink300, fontSize: 13, fontWeight: "500", textAlign: "center" },
  tryLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.ink500, marginBottom: 8 },
  exChip: { borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  fuCard: { width: "100%", borderRadius: 16, borderWidth: 1, borderColor: "rgba(91,95,209,0.35)", backgroundColor: "rgba(91,95,209,0.12)", padding: 12 },
  fuClose: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  fuChip: { borderWidth: 1, borderColor: "rgba(91,95,209,0.5)", backgroundColor: "rgba(18,18,26,0.6)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  explainer: { marginTop: 16, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.03)", padding: 12 },
  resultBar: { position: "absolute", left: 12, right: 12, backgroundColor: "rgba(18,18,26,0.98)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(63,209,204,0.3)", padding: 14, zIndex: 50 },
  resultIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(63,209,204,0.2)", alignItems: "center", justifyContent: "center" },
  undoBtn: { flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", paddingVertical: 10, alignItems: "center" },
  keepBtn: { flex: 1.4, borderRadius: 12, paddingVertical: 10, alignItems: "center", overflow: "hidden" },
});
