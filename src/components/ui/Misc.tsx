import React from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeOut,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { CheckCircle2, AlertCircle, Sparkles, Info } from "lucide-react-native";
import { useStore } from "@/store/useStore";
import { colors } from "@/theme/tokens";
import { Button } from "./Button";

// ---- Toast host ----------------------------------------------------------
export function ToastHost() {
  const toasts = useStore((s) => s.toasts);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 8 }]}>
      {toasts.map((t) => {
        const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertCircle : t.tone === "ai" ? Sparkles : Info;
        const color =
          t.tone === "error" ? "#FCA5A5" : t.tone === "ai" ? colors.tealSoft : t.tone === "success" ? "#A7F3D0" : "#fff";
        return (
          <Animated.View key={t.id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.toast}>
            <Icon size={15} color={color} />
            <Text style={[styles.toastText, { color }]}>{t.text}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ---- Confirm dialog ----------------------------------------------------
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.dialogRoot} onPress={onCancel}>
        <Animated.View entering={FadeIn.duration(160)} style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogBody}>{body}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
            <Pressable style={[styles.dialogBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]} onPress={onCancel}>
              <Text style={[styles.dialogBtnText, { color: colors.ink200 }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.dialogBtn, { backgroundColor: danger ? "#E5484D" : colors.brand }]} onPress={onConfirm}>
              <Text style={[styles.dialogBtnText, { color: "#fff" }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ---- Empty / error states -------------------------------------------
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.stateWrap}>
      <View style={styles.stateIcon}>{icon}</View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      {action ? <View style={{ marginTop: 18 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.stateWrap}>
      <View style={[styles.stateIcon, { backgroundColor: "rgba(229,72,77,0.15)" }]}>
        <AlertCircle size={26} color="#FCA5A5" />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      <View style={{ marginTop: 18, alignItems: "center", gap: 8 }}>
        <Button label={actionLabel} onPress={onAction} />
        {secondaryLabel ? (
          <Pressable onPress={onSecondary}>
            <Text style={{ color: colors.ink400, fontSize: 12, fontWeight: "700" }}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ---- Waveform --------------------------------------------------------
export function Waveform({ bars = 44, active = false, color = colors.teal }: { bars?: number; active?: boolean; color?: string }) {
  const p = useSharedValue(0);
  React.useEffect(() => {
    if (active) p.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    else p.value = withTiming(0);
  }, [active]);

  return (
    <View style={styles.wave}>
      {Array.from({ length: bars }).map((_, i) => {
        const n = Math.abs(Math.sin(i * 12.9898 + 7) * 43758.5453) % 1;
        const h = 3 + n * 20;
        return <Bar key={i} baseH={h} i={i} p={p} color={color} />;
      })}
    </View>
  );
}
function Bar({ baseH, i, p, color }: { baseH: number; i: number; p: SharedValue<number>; color: string }) {
  const st = useAnimatedStyle(() => {
    const phase = (Math.sin(i) + 1) / 2;
    const f = 1 - p.value * 0.6 * phase;
    return { height: baseH * f + 2 };
  });
  return <Animated.View style={[{ width: 3, borderRadius: 2, backgroundColor: color }, st]} />;
}

// ---- Progress ring -------------------------------------------------
export function ProgressRing({ value, size = 64, stroke = 6 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Defs>
        <SvgGradient id="pg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5B5FD1" />
          <Stop offset="1" stopColor="#3FD1CC" />
        </SvgGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="url(#pg)"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 100, gap: 8, paddingHorizontal: 16 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(20,20,28,0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastText: { fontSize: 13, fontWeight: "600" },
  dialogRoot: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 32 },
  dialog: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(18,18,26,0.98)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 20,
    alignItems: "center",
  },
  dialogTitle: { fontSize: 16, fontWeight: "800", color: "#fff", textAlign: "center" },
  dialogBody: { fontSize: 13, color: colors.ink300, textAlign: "center", marginTop: 6, lineHeight: 19 },
  dialogBtn: { flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: "center" },
  dialogBtnText: { fontSize: 13, fontWeight: "800" },
  stateWrap: { alignItems: "center", paddingHorizontal: 32, paddingVertical: 48 },
  stateIcon: { width: 64, height: 64, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  stateTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  stateBody: { fontSize: 13, color: colors.ink400, textAlign: "center", marginTop: 6, lineHeight: 19, maxWidth: 260 },
  wave: { flexDirection: "row", alignItems: "center", gap: 3, height: 26 },
});
