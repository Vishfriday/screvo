// ---------------------------------------------------------------------------
// Synthetic "screen recording" frames (React Native).
// Stand in for real recorded video: a fictional product ("Northwind" — a
// customer-workspace tool) operated step by step, so the preview / editor
// always has believable 9:16 content.
//
// The Frame is authored at a fixed logical size (BASE_W x BASE_H) and callers
// scale it with a transform, so typography stays in proportion at any size.
// ---------------------------------------------------------------------------
import React from "react";
import { View, Text, StyleSheet } from "react-native";

export const BASE_W = 270;
export const BASE_H = 480;
export const FRAME_COUNT = 8;

const NW = "#0B7285";
const NWlight = "#E3FAFC";

export const frameLabels = [
  "Open Northwind",
  "Tap New",
  "Choose Workspace",
  "Name the workspace",
  "Invite teammates",
  "Set permissions",
  "Workspace created",
  "Workspace dashboard",
];

function StatusBar() {
  return (
    <View style={s.statusBar}>
      <Text style={s.statusText}>9:41</Text>
      <Text style={[s.statusText, { letterSpacing: 2 }]}>Northwind</Text>
      <Text style={s.statusText}>100%</Text>
    </View>
  );
}

function AppBar({ title, back }: { title: string; back?: boolean }) {
  return (
    <View style={s.appBar}>
      {back ? <Text style={s.back}>‹</Text> : null}
      <Text style={s.appBarTitle}>{title}</Text>
    </View>
  );
}

function Row({ label, sub, tone }: { label: string; sub?: string; tone?: string }) {
  return (
    <View style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: tone || NWlight }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={s.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function Frame({ index }: { index: number; dim?: boolean }) {
  const i = ((index % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;

  return (
    <View style={s.phone}>
      <StatusBar />

      {i === 0 && (
        <View style={s.body}>
          <AppBar title="Home" />
          <View style={[s.hero, { backgroundColor: NW }]}>
            <Text style={s.heroKicker}>Welcome back</Text>
            <Text style={s.heroTitle}>Acme Corp</Text>
          </View>
          <Row label="Design Team" sub="12 members" />
          <Row label="Support" sub="4 members" tone="#FFF3BF" />
          <Row label="Sales EMEA" sub="7 members" tone="#FFE3E3" />
          <View style={[s.fab, { backgroundColor: NW }]}>
            <Text style={s.fabPlus}>+</Text>
          </View>
        </View>
      )}

      {i === 1 && (
        <View style={s.body}>
          <AppBar title="Home" />
          <View style={{ opacity: 0.4 }}>
            <Row label="Design Team" sub="12 members" />
            <Row label="Support" sub="4 members" tone="#FFF3BF" />
          </View>
          <View style={s.menuSheet}>
            <View style={s.grabber} />
            {["New Workspace", "New Project", "Invite people"].map((t, k) => (
              <View key={t} style={[s.menuItem, k === 0 && { backgroundColor: NW }]}>
                <Text style={[s.menuItemText, k === 0 && { color: "#fff" }]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {i === 2 && (
        <View style={s.body}>
          <AppBar title="Create" back />
          <Text style={s.caption}>What are you setting up?</Text>
          <View style={[s.optionCard, { borderColor: NW, backgroundColor: NWlight }]}>
            <Text style={s.optionTitle}>Customer Workspace</Text>
            <Text style={s.optionSub}>A shared space for a client and your team</Text>
          </View>
          <View style={s.optionCardMuted}>
            <Text style={[s.optionTitle, { color: "#334155" }]}>Internal Project</Text>
            <Text style={s.optionSub}>Private to your organization</Text>
          </View>
        </View>
      )}

      {i === 3 && (
        <View style={s.body}>
          <AppBar title="Name it" back />
          <Text style={s.caption}>Workspace name</Text>
          <View style={[s.input, { borderColor: NW }]}>
            <Text style={s.inputText}>Acme Corp — Onboarding</Text>
            <View style={[s.caret, { backgroundColor: NW }]} />
          </View>
          <Text style={s.hint}>This is visible to invited customers.</Text>
        </View>
      )}

      {i === 4 && (
        <View style={s.body}>
          <AppBar title="Invite teammates" back />
          <View style={s.inputPlain}>
            <Text style={s.inputPlaceholder}>Add people by email…</Text>
          </View>
          <Row label="jordan@acme.com" sub="Customer admin" tone="#D3F9D8" />
          <Row label="mara@northwind.io" sub="Teammate" tone={NWlight} />
          <Row label="deepak@northwind.io" sub="Teammate" tone={NWlight} />
        </View>
      )}

      {i === 5 && (
        <View style={s.body}>
          <AppBar title="Permissions" back />
          {[
            ["Can view files", true],
            ["Can comment", true],
            ["Can invite others", false],
            ["Can export data", false],
          ].map(([label, on]) => (
            <View key={label as string} style={s.permRow}>
              <Text style={s.permLabel}>{label as string}</Text>
              <View style={[s.toggle, { backgroundColor: on ? NW : "#CBD5E1", alignItems: on ? "flex-end" : "flex-start" }]}>
                <View style={s.toggleKnob} />
              </View>
            </View>
          ))}
        </View>
      )}

      {i === 6 && (
        <View style={[s.body, { alignItems: "center", justifyContent: "center", flex: 1 }]}>
          <View style={[s.successCircle, { backgroundColor: NW }]}>
            <Text style={s.successCheck}>✓</Text>
          </View>
          <Text style={s.successTitle}>Workspace created</Text>
          <Text style={s.successSub}>Acme Corp — Onboarding is ready. We emailed 3 invites.</Text>
          <View style={[s.primaryBtn, { backgroundColor: NW }]}>
            <Text style={s.primaryBtnText}>Open workspace</Text>
          </View>
        </View>
      )}

      {i === 7 && (
        <View style={s.body}>
          <AppBar title="Acme Corp — Onboarding" />
          <View style={s.statGrid}>
            {[
              ["Files", "12"],
              ["Tasks", "6"],
              ["Members", "4"],
              ["Activity", "Now"],
            ].map(([t, v]) => (
              <View key={t} style={s.statCard}>
                <Text style={s.statKicker}>{t}</Text>
                <Text style={s.statValue}>{v}</Text>
              </View>
            ))}
          </View>
          <Row label="Kickoff checklist" sub="2 of 6 done" tone="#FFF3BF" />
          <Row label="Shared with jordan@acme.com" sub="Customer admin" tone="#D3F9D8" />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  phone: { position: "absolute", left: 0, top: 0, width: BASE_W, height: BASE_H, backgroundColor: "#F3F5F8" },
  statusBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 12 },
  statusText: { fontSize: 10, fontWeight: "700", color: "#94A3B8" },
  body: { paddingHorizontal: 16, gap: 9, paddingTop: 4 },
  appBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  back: { fontSize: 20, color: "#94A3B8" },
  appBarTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  hero: { borderRadius: 18, padding: 14, marginBottom: 4 },
  heroKicker: { fontSize: 10, color: "rgba(255,255,255,0.8)" },
  heroTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 11 },
  rowLabel: { fontSize: 12.5, fontWeight: "700", color: "#1E293B" },
  rowSub: { fontSize: 10.5, color: "#94A3B8" },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 28,
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  fabPlus: { fontSize: 26, color: "#fff", fontWeight: "300" },
  menuSheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 10,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", marginBottom: 10 },
  menuItem: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  menuItemText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  caption: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  optionCard: { borderRadius: 16, borderWidth: 2, padding: 14 },
  optionCardMuted: { borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff", padding: 14 },
  optionTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  optionSub: { fontSize: 10.5, color: "#64748B", marginTop: 2 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputText: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  caret: { width: 2, height: 18, marginLeft: 2 },
  inputPlain: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputPlaceholder: { fontSize: 12.5, color: "#94A3B8" },
  hint: { fontSize: 10.5, color: "#94A3B8", marginTop: 4 },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  permLabel: { fontSize: 12.5, fontWeight: "600", color: "#334155" },
  toggle: { width: 40, height: 24, borderRadius: 12, padding: 2, justifyContent: "center" },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  successCircle: { width: 74, height: 74, borderRadius: 37, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  successCheck: { fontSize: 34, color: "#fff", fontWeight: "800" },
  successTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  successSub: { fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 6, paddingHorizontal: 24 },
  primaryBtn: { marginTop: 22, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12 },
  primaryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statCard: { width: (BASE_W - 32 - 9) / 2, backgroundColor: "#fff", borderRadius: 16, padding: 14 },
  statKicker: { fontSize: 10.5, color: "#94A3B8" },
  statValue: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
});
