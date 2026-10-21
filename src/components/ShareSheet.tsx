import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Sheet } from "./ui/Sheet";
import { useStore } from "@/store/useStore";
import { colors } from "@/theme/tokens";
import { Link2, Mail, MessageCircle, Share2, Linkedin, QrCode, Copy } from "lucide-react-native";

const targets = [
  { id: "link", label: "Copy link", Icon: Link2 },
  { id: "email", label: "Email", Icon: Mail },
  { id: "message", label: "Messages", Icon: MessageCircle },
  { id: "slack", label: "Slack", Icon: Share2 },
  { id: "linkedin", label: "LinkedIn", Icon: Linkedin },
  { id: "qr", label: "QR code", Icon: QrCode },
];

export function ShareSheet({
  open,
  onClose,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  projectName?: string;
}) {
  const toast = useStore((s) => s.toast);
  const slug = (projectName ?? "screvo-video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const url = `https://screvo.app/v/${slug}`;

  const act = async (id: string) => {
    if (id === "link") {
      await Clipboard.setStringAsync(url);
      toast("Link copied to clipboard", "success");
    } else {
      toast(`Shared to ${targets.find((t) => t.id === id)?.label}`, "success");
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share" subtitle={projectName} size="sm">
      <View style={styles.urlRow}>
        <Text style={styles.url} numberOfLines={1}>
          {url}
        </Text>
        <Pressable onPress={() => act("link")} style={styles.copyBtn}>
          <Copy size={13} color="#fff" />
          <Text style={styles.copyText}>Copy</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {targets.map(({ id, label, Icon }) => (
          <Pressable key={id} onPress={() => act(id)} style={styles.tile}>
            <View style={styles.tileIcon}>
              <Icon size={19} color={colors.brand200} />
            </View>
            <Text style={styles.tileLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  urlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.ink800,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  url: { flex: 1, fontSize: 13, color: colors.ink300 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  copyText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "30%",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tileIcon: { width: 44, height: 44, borderRadius: 18, backgroundColor: "rgba(91,95,209,0.15)", alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: 11, fontWeight: "700", color: colors.ink300 },
});
