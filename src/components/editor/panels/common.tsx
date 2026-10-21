import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Trash2, Crosshair } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useStore } from "@/store/useStore";
import type { Effect, EffectType } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { colors } from "@/theme/tokens";

export function PanelSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 2 }}>
      {title ? <Text style={styles.sectionLabel}>{title.toUpperCase()}</Text> : null}
      {children}
    </View>
  );
}

export function AddButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={[styles.addBtn, disabled && { opacity: 0.4 }]}>
      <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function EffectList({
  types,
  selectedId,
  onSelect,
}: {
  types: EffectType[];
  selectedId?: string | null;
  onSelect?: (e: Effect) => void;
}) {
  const { editing, removeEffect, seek } = useStore();
  const list = (editing()?.effects ?? []).filter((e) => types.includes(e.type)).sort((a, b) => a.start - b.start);
  if (list.length === 0) return <Text style={styles.empty}>Nothing added yet</Text>;
  return (
    <View style={{ gap: 6 }}>
      {list.map((e) => (
        <View key={e.id} style={[styles.effRow, selectedId === e.id && { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.1)" }]}>
          <Pressable style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => { seek(e.start + 0.05); onSelect?.(e); }}>
            <Text style={{ color: colors.ink400, fontSize: 11, fontWeight: "800" }}>{fmtTime(e.start)}</Text>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "500" }} numberOfLines={1}>
              {e.label}
            </Text>
          </Pressable>
          <Pressable onPress={() => removeEffect(e.id)}>
            <Trash2 size={14} color="rgba(252,165,165,0.8)" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export function PlaceOnVideoToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={[styles.placeBtn, active ? { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.2)" } : { borderColor: "rgba(255,255,255,0.1)" }]}>
      <Crosshair size={14} color={active ? "#fff" : colors.ink300} />
      <Text style={{ color: active ? "#fff" : colors.ink300, fontSize: 12, fontWeight: "700" }}>{active ? "Tap the video to place it" : label}</Text>
    </Pressable>
  );
}

export function ClipPicker({
  tracks,
  value,
  onChange,
}: {
  tracks: ("video" | "audio")[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { editing } = useStore();
  const clips = (editing()?.clips ?? []).filter((c) => tracks.includes(c.track as any)).sort((a, b) => a.start - b.start);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {clips.map((c) => (
        <Pressable key={c.id} onPress={() => onChange(c.id)} style={[styles.clipChip, value === c.id ? { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.15)" } : { borderColor: "rgba(255,255,255,0.08)" }]}>
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", maxWidth: 120 }} numberOfLines={1}>
            {c.label}
          </Text>
          <Text style={{ color: colors.ink400, fontSize: 10 }}>
            {fmtTime(c.start)}–{fmtTime(c.start + c.duration)} · {(c.speed ?? 1).toFixed(2)}×
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.ink500, marginTop: 12, marginBottom: 6 },
  addBtn: { marginTop: 16, borderRadius: 18, paddingVertical: 13, alignItems: "center", overflow: "hidden" },
  empty: { color: colors.ink500, fontSize: 12, textAlign: "center", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, paddingVertical: 12 },
  effRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  placeBtn: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.03)" },
  clipChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.03)" },
});
