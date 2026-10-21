import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/theme/tokens";

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 120 };
  if (!scroll) {
    return <View style={[{ flex: 1, backgroundColor: colors.ink950 }, pad, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink950 }}
      contentContainerStyle={[pad, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  back,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  back?: boolean;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back && (
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={20} color={colors.ink200} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionText}>{children}</Text>
      {action}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginTop: 2 },
  title: { fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.ink400, marginTop: 2 },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12 },
  sectionText: { fontSize: 15, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  card: { borderRadius: 20, backgroundColor: colors.ink850, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
});
