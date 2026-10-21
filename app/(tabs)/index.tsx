import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Search, X, MonitorSmartphone, Upload, FileVideo, LayoutTemplate, Sparkles } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectActionsSheet } from "@/components/ProjectActionsSheet";
import { EmptyState } from "@/components/ui/Misc";
import { PressableScale, Appear } from "@/components/ui/Motion";
import { useStore } from "@/store/useStore";
import type { Project } from "@/lib/types";
import { colors } from "@/theme/tokens";

const quick = [
  { id: "record", label: "Record Screen", Icon: MonitorSmartphone, to: "/record", accent: "#5B5FD1" },
  { id: "upload", label: "Upload Video", Icon: Upload, to: "/create?tab=upload", accent: "#3FD1CC" },
  { id: "import", label: "Import Video", Icon: FileVideo, to: "/create?tab=import", accent: "#FD9D43" },
  { id: "template", label: "Create from Template", Icon: LayoutTemplate, to: "/templates", accent: "#EDBF1B" },
] as const;

export default function Home() {
  const router = useRouter();
  const projects = useStore((s) => s.projects);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<Project | null>(null);

  const recent = useMemo(() => {
    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter((p) => p.name.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q));
  }, [projects, query]);

  return (
    <Screen>
      <View style={styles.topRow}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <Text style={styles.brand}>Screvo</Text>
          </View>
          <Text style={styles.tagline}>Turn your workflow into a story.</Text>
        </View>
        <Pressable onPress={() => router.push("/profile")} style={styles.avatar}>
          <Text style={styles.avatarText}>VT</Text>
        </Pressable>
      </View>

      <View style={styles.search}>
        <Search size={17} color={colors.ink500} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search projects..."
          placeholderTextColor={colors.ink500}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")}>
            <X size={15} color={colors.ink500} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.quickGrid}>
        {quick.map((q, i) => (
          <Appear key={q.id} delay={i * 40} style={{ width: "48%" }}>
            <PressableScale onPress={() => router.push(q.to as any)} style={styles.quickCard}>
              <View style={[styles.quickIcon, { backgroundColor: q.accent + "22" }]}>
                <q.Icon size={18} color={q.accent} />
              </View>
              <Text style={styles.quickLabel}>{q.label}</Text>
            </PressableScale>
          </Appear>
        ))}
      </View>

      <PressableScale onPress={() => router.push("/record")} style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Sparkles size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Record once. Screvo does the rest.</Text>
          <Text style={styles.bannerSub}>AI chapters, narration, zooms & subtitles — automatically.</Text>
        </View>
      </PressableScale>

      <View style={styles.recentHead}>
        <Text style={styles.recentTitle}>Recent Projects</Text>
        <Pressable onPress={() => router.push("/projects")}>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>

      {recent.length === 0 ? (
        <EmptyState
          icon={<FileVideo size={24} color={colors.ink300} />}
          title={query ? "No matches" : "No projects yet"}
          body={query ? `Nothing matches "${query}".` : "Record a workflow or start from a template."}
        />
      ) : (
        <View style={{ gap: 12 }}>
          {recent.map((p) => (
            <ProjectCard key={p.id} project={p} onMenu={setMenu} />
          ))}
        </View>
      )}

      <ProjectActionsSheet project={menu} onClose={() => setMenu(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  logo: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  brand: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: colors.ink400, marginTop: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: colors.ink850,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, padding: 0 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginTop: 20 },
  quickCard: {
    height: 104,
    borderRadius: 20,
    backgroundColor: colors.ink850,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    padding: 14,
    justifyContent: "space-between",
  },
  quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 13, fontWeight: "800", color: "#fff", lineHeight: 17 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(91,95,209,0.3)",
    backgroundColor: "rgba(91,95,209,0.14)",
  },
  bannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  bannerTitle: { fontSize: 13, fontWeight: "800", color: "#fff" },
  bannerSub: { fontSize: 11, color: colors.ink300, marginTop: 1 },
  recentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 },
  recentTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  seeAll: { fontSize: 12, fontWeight: "700", color: colors.brand200 },
});
