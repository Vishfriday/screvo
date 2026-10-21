import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Sheet } from "./ui/Sheet";
import { ConfirmDialog } from "./ui/Misc";
import { ShareSheet } from "./ShareSheet";
import { useStore } from "@/store/useStore";
import type { Project } from "@/lib/types";
import { colors } from "@/theme/tokens";
import { FolderOpen, Pencil, Copy, Share2, Download, Trash2 } from "lucide-react-native";

export function ProjectActionsSheet({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const router = useRouter();
  const { renameProject, duplicateProject, deleteProject, toast } = useStore();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (project) setName(project.name);
  }, [project]);

  if (!project) return null;

  const rows = [
    { id: "open", label: "Open in editor", Icon: FolderOpen, run: () => { onClose(); router.push(`/editor/${project.id}`); } },
    { id: "rename", label: "Rename", Icon: Pencil, run: () => setRenaming(true) },
    { id: "duplicate", label: "Duplicate", Icon: Copy, run: () => { duplicateProject(project.id); toast("Project duplicated", "success"); onClose(); } },
    { id: "share", label: "Share", Icon: Share2, run: () => setSharing(true) },
    { id: "export", label: "Export", Icon: Download, run: () => { onClose(); router.push(`/export/${project.id}`); } },
    { id: "delete", label: "Delete", Icon: Trash2, danger: true, run: () => setConfirmDel(true) },
  ];

  return (
    <>
      <Sheet open={!!project && !renaming && !sharing} onClose={onClose} title={project.name} size="sm">
        <View>
          {rows.map(({ id, label, Icon, run, danger }, i) => (
            <Pressable
              key={id}
              onPress={run}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }]}
            >
              <Icon size={18} color={danger ? "#FCA5A5" : colors.ink300} />
              <Text style={[styles.rowText, { color: danger ? "#FCA5A5" : "#fff" }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      <ConfirmDialog
        open={confirmDel}
        title="Delete project?"
        body={`"${project.name}" and all its chapters, edits and exports will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => {
          deleteProject(project.id);
          setConfirmDel(false);
          onClose();
          toast("Project deleted");
        }}
      />

      <Sheet open={renaming} onClose={() => setRenaming(false)} title="Rename project" size="sm">
        <TextInput
          autoFocus
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholderTextColor={colors.ink500}
        />
        <Pressable
          style={styles.saveBtn}
          onPress={() => {
            if (name.trim()) {
              renameProject(project.id, name.trim());
              toast("Renamed", "success");
            }
            setRenaming(false);
            onClose();
          }}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </Sheet>

      <ShareSheet open={sharing} onClose={() => { setSharing(false); onClose(); }} projectName={project.name} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  rowText: { fontSize: 14, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: colors.ink800,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  saveBtn: { marginTop: 16, borderRadius: 18, backgroundColor: colors.brand, paddingVertical: 13, alignItems: "center" },
  saveText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
