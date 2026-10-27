import React from "react";
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { X } from "lucide-react-native";
import { colors } from "@/theme/tokens";

type Size = "sm" | "md" | "lg" | "full";
const heightFactor: Record<Size, number> = { sm: 0.5, md: 0.72, lg: 0.86, full: 0.94 };

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  preview,
  size = "md",
  peek = false,
  peekLabel,
  onPeekCancel,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** pinned above the scrolling body — used for the editor's live preview */
  preview?: React.ReactNode;
  size?: Size;
  peek?: boolean;
  peekLabel?: string;
  onPeekCancel?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxH = height * heightFactor[size];

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* a Modal is its own native view tree, outside the app's gesture root,
          so a pinch or drag inside a sheet needs this to be seen at all */}
      <GestureHandlerRootView style={styles.root}>
        {!peek && (
          <AnimatedPressable
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(150)}
            style={styles.backdrop}
            onPress={onClose}
          />
        )}

        {peek ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={[styles.peekBar, { paddingBottom: insets.bottom + 14 }]}>
            <View style={styles.peekDot}>
              <Text style={{ color: colors.brand200, fontSize: 14 }}>◎</Text>
            </View>
            <Text style={styles.peekText}>Tap the video to place {peekLabel ?? "it"}</Text>
            <Pressable onPress={onPeekCancel} style={styles.peekCancel}>
              <Text style={styles.peekCancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(150)}
            style={[styles.sheet, { maxHeight: maxH }]}
          >
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {typeof title === "string" ? <Text style={styles.title}>{title}</Text> : title}
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <Pressable onPress={onClose} style={styles.close}>
                <X size={16} color={colors.ink300} />
              </Pressable>
            </View>
            {preview ? <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>{preview}</View> : null}
            <ScrollView
              style={{ flexShrink: 1 }}
              // the navigation bar overlaps the bottom of the sheet, so the last
              // control in a panel without a footer would sit underneath it and
              // simply not take taps
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
            {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>{footer}</View> : null}
          </Animated.View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "rgba(18,18,26,0.98)",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingTop: 8,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  title: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: colors.ink400, marginTop: 2 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  footer: { borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(14,14,21,0.6)" },
  peekBar: {
    backgroundColor: "rgba(18,18,26,0.98)",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: "rgba(91,95,209,0.4)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  peekDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(91,95,209,0.2)", alignItems: "center", justifyContent: "center" },
  peekText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#fff" },
  peekCancel: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  peekCancelText: { fontSize: 12, fontWeight: "700", color: colors.ink200 },
});
