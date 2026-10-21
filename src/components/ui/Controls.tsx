import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from "react-native";
import RNSlider from "@react-native-community/slider";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors, radius } from "@/theme/tokens";

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{String(children).toUpperCase()}</Text>;
}

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
  accent = colors.brand,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  accent?: string;
}) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <View style={styles.sliderTop}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{format ? format(value) : value.toFixed(2)}</Text>
      </View>
      <RNSlider
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={accent}
        maximumTrackTintColor="rgba(255,255,255,0.14)"
        thumbTintColor="#fff"
        style={{ height: 32 }}
      />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const seg = w / options.length;
  const x = useSharedValue(0);
  React.useEffect(() => {
    x.value = withTiming(idx * seg, { duration: 220 });
  }, [idx, seg]);
  const hi = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: seg || 0 }));

  return (
    <View style={styles.segWrap} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width - 8)}>
      {w > 0 && <Animated.View style={[styles.segHighlight, hi]} />}
      {options.map((o) => (
        <Pressable key={o.value} style={styles.segItem} onPress={() => onChange(o.value)}>
          <Text style={[styles.segText, value === o.value ? { color: "#fff" } : { color: colors.ink400 }]} numberOfLines={1}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ChipGroup({
  items,
  value,
  onChange,
  columns = 3,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  columns?: number;
}) {
  return (
    <View style={styles.chipGrid}>
      {items.map((it) => {
        const active = value === it;
        return (
          <Pressable
            key={it}
            onPress={() => onChange(it)}
            style={[
              styles.chip,
              { width: `${100 / columns - 2}%` },
              active
                ? { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.2)" }
                : { borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? "#fff" : colors.ink300 }]} numberOfLines={1}>
              {it}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const x = useSharedValue(checked ? 1 : 0);
  React.useEffect(() => {
    x.value = withTiming(checked ? 1 : 0, { duration: 160 });
  }, [checked]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));
  return (
    <Pressable onPress={() => onChange(!checked)} style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, { backgroundColor: checked ? colors.brand : colors.ink700 }]}>
        <Animated.View style={[styles.toggleKnob, knob]} />
      </View>
    </Pressable>
  );
}

const SWATCHES = ["#5B5FD1", "#3FD1CC", "#FD9D43", "#EDBF1B", "#0A0A0F", "#F4F4F8", "#E5484D", "#7C8CF8"];
export function ColorRow({
  value,
  onChange,
  swatches = SWATCHES,
}: {
  value: string;
  onChange: (v: string) => void;
  swatches?: string[];
}) {
  return (
    <View style={styles.colorRow}>
      {swatches.map((c) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          style={[
            styles.swatch,
            { backgroundColor: c },
            value.toLowerCase() === c.toLowerCase() ? { borderColor: "#fff", transform: [{ scale: 1.12 }] } : { borderColor: "rgba(255,255,255,0.2)" },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.ink500, marginTop: 12, marginBottom: 6 },
  sliderTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  sliderLabel: { fontSize: 13, fontWeight: "500", color: colors.ink200 },
  sliderValue: { fontSize: 13, color: colors.ink400, fontVariant: ["tabular-nums"] },
  segWrap: { flexDirection: "row", backgroundColor: colors.ink800, borderRadius: radius.lg, padding: 4 },
  segHighlight: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: radius.md, backgroundColor: colors.brand },
  segItem: { flex: 1, paddingVertical: 9, alignItems: "center", justifyContent: "center" },
  segText: { fontSize: 13, fontWeight: "700" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" },
  chipText: { fontSize: 12, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  toggleLabel: { fontSize: 13, fontWeight: "500", color: colors.ink200 },
  toggleHint: { fontSize: 11, color: colors.ink500, marginTop: 1 },
  toggleTrack: { width: 48, height: 28, borderRadius: 14, padding: 4, justifyContent: "center" },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
});
