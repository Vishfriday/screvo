import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Scissors, Ruler, Trash2, Gauge, Volume2, Crop, Type, Captions,
  Sparkles, Wand2, ZoomIn, Layers, ArrowLeftRight, Fingerprint, Droplet, Bot,
  MousePointerClick, Shapes, BrainCircuit, MicVocal, Music, Clapperboard, Sparkle, Waves,
} from "lucide-react-native";
import { useStore } from "@/store/useStore";
import { colors } from "@/theme/tokens";

export function EditingToolbar() {
  const router = useRouter();
  const { openPanel, splitClipAtPlayhead, deleteClip, selectedClipId, editing, playhead, toast, setStatus } = useStore();
  const project = editing();

  const withClip = (fn: (id: string) => void, verb: string) => () => {
    const p = editing();
    const id = selectedClipId ?? p?.clips.find((c) => c.track === "video" && playhead >= c.start && playhead < c.start + c.duration)?.id;
    if (!id) return toast(`Select a clip to ${verb}`, "error");
    fn(id);
  };

  const items: { id: string; label: string; Icon: any; run: () => void; accent?: string; primary?: boolean }[] = [
    // an import that skipped analysis can still be sent through it from here
    ...(project && project.analysed === false && project.sourceUri
      ? [{
          id: "analyse",
          label: "Analyse",
          Icon: Sparkle,
          run: () => {
            setStatus(project.id, "processing");
            router.push(`/processing/${project.id}`);
          },
          primary: true,
        }]
      : []),
    { id: "voice", label: "Ask AI", Icon: BrainCircuit, run: () => openPanel("voice"), primary: true },
    { id: "script", label: "Voice", Icon: MicVocal, run: () => openPanel("script"), accent: "#3FD1CC" },
    { id: "split", label: "Split", Icon: Scissors, run: () => splitClipAtPlayhead(), accent: "#5B5FD1" },
    { id: "trim", label: "Trim", Icon: Ruler, run: () => openPanel("trim") },
    { id: "delete", label: "Delete", Icon: Trash2, run: withClip((id) => deleteClip(id), "delete") },
    { id: "speed", label: "Speed", Icon: Gauge, run: () => openPanel("speed"), accent: "#FD9D43" },
    { id: "intro", label: "Intro", Icon: Clapperboard, run: () => openPanel("intro"), accent: "#EDBF1B" },
    { id: "music", label: "Music", Icon: Music, run: () => openPanel("music"), accent: "#3FD1CC" },
    { id: "volume", label: "Volume", Icon: Volume2, run: () => openPanel("volume") },
    { id: "noise", label: "Denoise", Icon: Waves, run: () => openPanel("noise"), accent: "#3FD1CC" },
    { id: "crop", label: "Crop", Icon: Crop, run: () => openPanel("crop") },
    { id: "text", label: "Text", Icon: Type, run: () => openPanel("text") },
    { id: "subtitles", label: "Subtitles", Icon: Captions, run: () => openPanel("subtitles") },
    { id: "effects", label: "Effects", Icon: Sparkles, run: () => openPanel("effects") },
    { id: "animations", label: "Animations", Icon: Wand2, run: () => openPanel("animations") },
    { id: "zoom", label: "Zoom", Icon: ZoomIn, run: () => openPanel("zoom"), accent: "#3FD1CC" },
    { id: "parallax", label: "Parallax", Icon: Layers, run: () => openPanel("parallax") },
    { id: "transition", label: "Transition", Icon: ArrowLeftRight, run: () => openPanel("transition") },
    { id: "touchpoint", label: "Touchpoint", Icon: Fingerprint, run: () => openPanel("touchpoint"), accent: "#3FD1CC" },
    { id: "tint", label: "Tint", Icon: Droplet, run: () => openPanel("tint"), accent: "#FD9D43" },
    { id: "aiedit", label: "AI Edit", Icon: Bot, run: () => openPanel("aiedit"), accent: "#5B5FD1" },
    { id: "cta", label: "CTA", Icon: MousePointerClick, run: () => openPanel("cta"), accent: "#EDBF1B" },
    { id: "assets", label: "Assets", Icon: Shapes, run: () => openPanel("assets") },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      {items.map(({ id, label, Icon, run, accent, primary }) => (
        <Pressable key={id} onPress={run} style={[styles.item, primary && styles.itemPrimary]}>
          <View style={[styles.iconBox, !primary && { backgroundColor: accent ? accent + "22" : "rgba(255,255,255,0.06)" }]}>
            {primary && (
              <LinearGradient
                colors={["#5B5FD1", "#7376DB", "#3FD1CC"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
              />
            )}
            <Icon size={17} color={primary ? "#fff" : accent ?? colors.ink200} />
          </View>
          <Text style={[styles.label, primary && { color: "#fff" }]}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { width: 62, alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 18, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  itemPrimary: { backgroundColor: "rgba(91,95,209,0.15)", borderColor: "rgba(91,95,209,0.45)" },
  iconBox: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  label: { fontSize: 9.5, fontWeight: "700", color: colors.ink300 },
});
