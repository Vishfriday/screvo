import React from "react";
import { Text, StyleSheet, ViewStyle, StyleProp, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "./Motion";
import { colors, radius } from "@/theme/tokens";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const heights: Record<Size, number> = { sm: 38, md: 46, lg: 52 };
const fontSizes: Record<Size, number> = { sm: 13, md: 14, lg: 15 };

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  full,
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const h = heights[size];
  const inner = (
    <View style={styles.rowCenter}>
      {icon}
      <Text
        style={[
          styles.label,
          { fontSize: fontSizes[size] },
          variant === "primary" && { color: "#fff" },
          variant === "secondary" && { color: "#fff" },
          variant === "ghost" && { color: colors.ink200 },
          variant === "danger" && { color: "#FCA5A5" },
          variant === "gold" && { color: colors.gold },
        ]}
      >
        {label}
      </Text>
    </View>
  );

  const base: StyleProp<ViewStyle> = [
    styles.base,
    { height: h, borderRadius: size === "sm" ? radius.md : radius.lg, opacity: disabled ? 0.4 : 1 },
    full && { alignSelf: "stretch" },
    style,
  ];

  if (variant === "primary") {
    return (
      <PressableScale onPress={disabled ? undefined : onPress} style={base}>
        <LinearGradient
          colors={["#5B5FD1", "#7376DB", "#3FD1CC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size === "sm" ? radius.md : radius.lg }]}
        />
        {inner}
      </PressableScale>
    );
  }

  const bg =
    variant === "secondary"
      ? colors.ink750
      : variant === "ghost"
        ? "rgba(255,255,255,0.05)"
        : variant === "danger"
          ? "rgba(229,72,77,0.15)"
          : "rgba(237,191,27,0.15)";
  const border =
    variant === "danger"
      ? "rgba(229,72,77,0.3)"
      : variant === "gold"
        ? "rgba(237,191,27,0.3)"
        : "rgba(255,255,255,0.1)";

  return (
    <PressableScale onPress={disabled ? undefined : onPress} style={[base, { backgroundColor: bg, borderWidth: 1, borderColor: border }]}>
      {inner}
    </PressableScale>
  );
}

export function IconButton({
  children,
  onPress,
  active,
  size = 44,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  active?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.88}
      style={[
        styles.iconBtn,
        { width: size, height: size },
        active
          ? { backgroundColor: colors.brand, borderColor: colors.brand }
          : { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" },
        style,
      ]}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 16 },
  rowCenter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { fontWeight: "700", letterSpacing: -0.2 },
  iconBtn: { alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1 },
});
