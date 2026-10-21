import React, { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Plus, FolderClosed } from "lucide-react-native";
import { Screen, ScreenHeader } from "@/components/ui/Screen";
import { Segmented } from "@/components/ui/Controls";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectActionsSheet } from "@/components/ProjectActionsSheet";
import { EmptyState } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/store/useStore";
import type { Project } from "@/lib/types";
import { colors } from "@/theme/tokens";

type Tab = "all" | "drafts" | "published" | "shared";

export default function Projects() {
  const router = useRouter();
  const projects = useStore((s) => s.projects);
  const [tab, setTab] = useState<Tab>("all");
  const [menu, setMenu] = useState<Project | null>(null);

  const filtered = useMemo(() => {
    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
    if (tab === "drafts") return sorted.filter((p) => p.status === "draft" || p.status === "processing");
    if (tab === "published") return sorted.filter((p) => p.status === "published" || p.status === "ready");
    if (tab === "shared") return sorted.filter((p) => p.status === "shared" || p.shared);
    return sorted;
  }, [projects, tab]);

  return (
    <Screen>
      <ScreenHeader
        title="Projects"
        subtitle={`${projects.length} total`}
        right={
          <Pressable
            onPress={() => router.push("/create")}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}
          >
            <Plus size={20} color="#fff" />
          </Pressable>
        }
      />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "all", label: "All" },
          { value: "drafts", label: "Drafts" },
          { value: "published", label: "Published" },
          { value: "shared", label: "Shared" },
        ]}
      />
      <View style={{ gap: 12, marginTop: 16 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<FolderClosed size={24} color={colors.ink300} />}
            title={`No ${tab === "all" ? "" : tab + " "}projects`}
            body={tab === "shared" ? "Projects shared with you show here." : "Start a recording or pick a template."}
            action={<Button label="New project" onPress={() => router.push("/create")} size="sm" />}
          />
        ) : (
          filtered.map((p) => <ProjectCard key={p.id} project={p} onMenu={setMenu} />)
        )}
      </View>
      <ProjectActionsSheet project={menu} onClose={() => setMenu(null)} />
    </Screen>
  );
}
