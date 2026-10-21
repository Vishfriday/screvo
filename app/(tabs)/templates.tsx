import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Clock3, Layers } from "lucide-react-native";
import { Screen, ScreenHeader } from "@/components/ui/Screen";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Thumb } from "@/components/Thumb";
import { PressableScale, Appear } from "@/components/ui/Motion";
import { useStore } from "@/store/useStore";
import { templates, templateCategories, type Template } from "@/data/templates";
import { fmtTime } from "@/lib/format";
import { colors } from "@/theme/tokens";

export default function Templates() {
  const router = useRouter();
  const { createProject, toast } = useStore();
  const [cat, setCat] = useState("All");
  const [preview, setPreview] = useState<Template | null>(null);

  const list = useMemo(() => (cat === "All" ? templates : templates.filter((t) => t.category === cat)), [cat]);

  function useTemplate(t: Template) {
    let cursor = 0;
    const chapters = t.chapters.map((c, i) => {
      const ch = { id: `tpl_ch_${i}_${Math.random().toString(36).slice(2, 6)}`, name: c.name, start: cursor, duration: c.duration, frame: i + 1, summary: "" };
      cursor += c.duration;
      return ch;
    });
    const clips = chapters.map((c, i) => ({
      id: `tpl_cl_${i}_${Math.random().toString(36).slice(2, 6)}`,
      track: "video" as const,
      start: c.start,
      duration: c.duration,
      label: c.name,
      frame: i + 1,
      speed: 1,
      volume: 1,
      color: t.accent,
    }));
    const id = createProject({
      name: `${t.name} — draft`,
      status: "draft",
      durationSec: t.durationSec,
      summary: t.description,
      thumbnailFrame: t.frame,
      chapters,
      clips,
    });
    toast("Template applied — add your recording", "success");
    setPreview(null);
    router.push(`/editor/${id}`);
  }

  return (
    <Screen>
      <ScreenHeader title="Templates" subtitle="Proven structures for every format" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {["All", ...templateCategories].map((c) => (
          <Pressable
            key={c}
            onPress={() => setCat(c)}
            style={[styles.catChip, cat === c ? { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.2)" } : { borderColor: "rgba(255,255,255,0.08)" }]}
          >
            <Text style={{ color: cat === c ? "#fff" : colors.ink400, fontSize: 12, fontWeight: "700" }}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.grid}>
        {list.map((t, i) => (
          <Appear key={t.id} delay={i * 30} style={{ width: "48%" }}>
            <PressableScale onPress={() => setPreview(t)} style={styles.card} scaleTo={0.97}>
              <Thumb frame={t.frame} radius={0} style={{ width: "100%" }} />
              <View style={{ padding: 12 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {t.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                  <Clock3 size={10} color={colors.ink400} />
                  <Text style={styles.cardMeta}>{fmtTime(t.durationSec)}</Text>
                  <Layers size={10} color={colors.ink400} style={{ marginLeft: 6 }} />
                  <Text style={styles.cardMeta}>{t.chapters.length}</Text>
                </View>
              </View>
            </PressableScale>
          </Appear>
        ))}
      </View>

      <Sheet
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name}
        subtitle={preview?.category}
        footer={preview ? <Button label="Use Template" full onPress={() => useTemplate(preview)} /> : undefined}
      >
        {preview && (
          <View>
            <Thumb frame={preview.frame} crop style={{ height: 176, width: "100%", marginBottom: 16 }} />
            <Text style={{ color: colors.ink300, fontSize: 13, lineHeight: 20 }}>{preview.description}</Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Clock3 size={13} color={colors.ink400} />
                <Text style={{ color: colors.ink400, fontSize: 12 }}>{fmtTime(preview.durationSec)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Layers size={13} color={colors.ink400} />
                <Text style={{ color: colors.ink400, fontSize: 12 }}>{preview.chapters.length} chapters</Text>
              </View>
            </View>
            <Text style={styles.structLabel}>CHAPTER STRUCTURE</Text>
            <View style={{ gap: 6 }}>
              {preview.chapters.map((c, i) => (
                <View key={i} style={styles.structRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.structNum, { backgroundColor: preview.accent }]}>
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{i + 1}</Text>
                    </View>
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500" }}>{c.name}</Text>
                  </View>
                  <Text style={{ color: colors.ink400, fontSize: 12 }}>{fmtTime(c.duration)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  catChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.03)" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginTop: 16 },
  card: { borderRadius: 20, backgroundColor: colors.ink850, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", overflow: "hidden" },
  cardTitle: { fontSize: 13, fontWeight: "800", color: "#fff", lineHeight: 16 },
  cardMeta: { fontSize: 10, color: colors.ink400 },
  structLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.ink500, marginTop: 16, marginBottom: 8 },
  structRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  structNum: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
});
