import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { Plus, Merge, Trash2 } from "lucide-react-native";
import { useStore } from "@/store/useStore";
import { fmtTime } from "@/lib/format";
import { colors, chapterAccents } from "@/theme/tokens";

/**
 * The Steps tab — the walkthrough's structure. Jump to a step, rename it, add a
 * step under any of them, fold one into the step before, or delete a step along
 * with its footage.
 */
export function StepsPanel() {
  const {
    editing,
    playhead,
    seek,
    renameChapter,
    stepAt,
    unstepAt,
    selectChapter,
    addStepAfter,
    deleteStep,
  } = useStore();
  const p = editing();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!p) return null;

  const steps = p.chapters;
  const active = steps.find((c) => playhead >= c.start && playhead < c.start + c.duration);

  const commitName = (id: string) => {
    if (draft.trim()) renameChapter(id, draft.trim());
    setRenamingId(null);
  };

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.headLabel}>
          {steps.length} STEP{steps.length === 1 ? "" : "S"}
        </Text>
        <Pressable onPress={() => stepAt(playhead)} style={styles.newBtn}>
          <Plus size={12} color={colors.brand200} />
          <Text style={styles.newBtnText}>New step here</Text>
        </Pressable>
      </View>

      {steps.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.ink400, fontSize: 12, textAlign: "center" }}>
            No steps yet — move the playhead and press “New step here”.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {steps.map((c, i) => {
            const confirming = confirmId === c.id;
            return (
              <View key={c.id} style={[styles.row, active?.id === c.id && styles.rowActive]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      seek(c.start + 0.05);
                      selectChapter(c.id);
                    }}
                    style={[styles.badge, { backgroundColor: chapterAccents[i % chapterAccents.length] }]}
                  >
                    <Text style={styles.badgeText}>{i + 1}</Text>
                  </Pressable>

                  {renamingId === c.id ? (
                    <TextInput
                      autoFocus
                      value={draft}
                      onChangeText={setDraft}
                      onBlur={() => commitName(c.id)}
                      onSubmitEditing={() => commitName(c.id)}
                      style={styles.nameInput}
                    />
                  ) : (
                    <Pressable
                      onPress={() => {
                        setDraft(c.name);
                        setRenamingId(c.id);
                      }}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <Text style={styles.name} numberOfLines={1}>
                        {c.name}
                      </Text>
                    </Pressable>
                  )}

                  <Text style={styles.time}>
                    {fmtTime(c.start)} · {fmtTime(c.duration)}
                  </Text>
                </View>

                {c.summary ? (
                  <Text style={styles.summary} numberOfLines={1}>
                    {c.summary}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    onPress={() => {
                      setConfirmId(null);
                      unstepAt(c.start);
                    }}
                    disabled={i === 0}
                    style={[styles.action, i === 0 && { opacity: 0.3 }]}
                  >
                    <Merge size={11} color={colors.ink200} />
                    <Text style={styles.actionText}>Merge up</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (confirming) {
                        setConfirmId(null);
                        deleteStep(c.id);
                      } else {
                        setConfirmId(c.id);
                      }
                    }}
                    style={[styles.action, styles.danger, confirming && { backgroundColor: colors.danger }]}
                  >
                    <Trash2 size={11} color={confirming ? "#fff" : "#FF9A9D"} />
                    <Text style={[styles.dangerText, confirming && { color: "#fff" }]}>
                      {confirming ? "Tap to confirm" : "Delete"}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => {
                    setConfirmId(null);
                    addStepAfter(c.id);
                  }}
                  style={styles.addBtn}
                >
                  <Plus size={11} color={colors.ink300} />
                  <Text style={styles.addText}>Add a new step under this one</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  headLabel: { color: colors.ink400, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  newBtn: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(91,95,209,0.2)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  newBtnText: { color: colors.brand200, fontSize: 11, fontWeight: "800" },
  empty: { borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 12, paddingVertical: 20 },
  row: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", padding: 10 },
  rowActive: { borderColor: "rgba(91,95,209,0.5)", backgroundColor: "rgba(91,95,209,0.1)" },
  badge: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  name: { color: "#fff", fontSize: 12, fontWeight: "700" },
  nameInput: { flex: 1, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.ink800, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, color: "#fff", fontSize: 12, fontWeight: "700" },
  time: { color: colors.ink500, fontSize: 10, fontVariant: ["tabular-nums"] },
  summary: { color: colors.ink400, fontSize: 11, marginTop: 4, paddingLeft: 38 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, marginLeft: 38 },
  action: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  actionText: { color: colors.ink200, fontSize: 10, fontWeight: "700" },
  danger: { marginLeft: "auto", backgroundColor: "rgba(229,72,77,0.15)" },
  dangerText: { color: "#FF9A9D", fontSize: 10, fontWeight: "800" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 6, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.15)", paddingVertical: 6 },
  addText: { color: colors.ink300, fontSize: 10, fontWeight: "800" },
});
