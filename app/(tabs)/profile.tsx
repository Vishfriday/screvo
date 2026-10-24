import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import {
  Building2, Sparkles, HardDrive, Video, FileText, Clock, LayoutGrid,
  Palette, Mic2, CreditCard, Settings, HelpCircle, ChevronRight, RotateCcw,
} from "lucide-react-native";
import { Screen, ScreenHeader, SectionTitle, Card } from "@/components/ui/Screen";
import { Sheet } from "@/components/ui/Sheet";
import { ConfirmDialog } from "@/components/ui/Misc";
import { Segmented, Slider, ChipGroup, Toggle } from "@/components/ui/Controls";
import { useStore } from "@/store/useStore";
import { KOKORO_DEFAULT_ENDPOINT } from "@/lib/voice/tts";
import { voicesOf, genderOf, swapGender, blurbFor, type VoiceGender } from "@/lib/voice/voices";
import { colors } from "@/theme/tokens";

export default function Profile() {
  const keys = useStore((s) => s.keys);
  const setKeys = useStore((s) => s.setKeys);
  const router = useRouter();
  const projects = useStore((s) => s.projects);
  const resetDemo = useStore((s) => s.resetDemo);
  const toast = useStore((s) => s.toast);
  const [sheet, setSheet] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const [voiceName, setVoiceName] = useState("Ava — Warm");
  const [lang, setLang] = useState("English (US)");
  const [rate, setRate] = useState(1);
  const [brandColor, setBrandColor] = useState("#5B5FD1");
  const reduceMotion = useStore((s) => s.reduceMotion);
  const setReduceMotion = useStore((s) => s.setReduceMotion);
  const defaultAspect = useStore((s) => s.defaultAspect);
  const setDefaultAspect = useStore((s) => s.setDefaultAspect);

  const videosCreated = projects.length + 11;
  const sopsCreated = projects.filter((p) => /sop|onboard/i.test(p.name)).length + 4;
  const minutesSaved = projects.reduce((a, p) => a + p.durationSec, 0) / 60 + 320;

  const stats = [
    { id: "ai", label: "AI Usage", value: "68%", sub: "of monthly credits", Icon: Sparkles, accent: "#5B5FD1" },
    { id: "storage", label: "Storage", value: "4.1 / 20 GB", sub: "20% used", Icon: HardDrive, accent: "#3FD1CC" },
    { id: "videos", label: "Videos Created", value: String(videosCreated), sub: "all time", Icon: Video, accent: "#FD9D43" },
    { id: "sops", label: "SOPs Created", value: String(sopsCreated), sub: "exported as PDF", Icon: FileText, accent: "#EDBF1B" },
    { id: "time", label: "Time Saved", value: `${Math.round(minutesSaved)} min`, sub: "vs manual editing", Icon: Clock, accent: "#7C8CF8" },
    { id: "templates", label: "Templates", value: "10", sub: "2 custom", Icon: LayoutGrid, accent: "#3FD1CC" },
  ];

  const rows = [
    { id: "workspace", label: "Workspace", Icon: Building2, hint: "Vishal's Team · 3 seats" },
    { id: "brand", label: "Brand Kit", Icon: Palette, hint: "Colors, logo, fonts" },
    { id: "voice", label: "Voice Settings", Icon: Mic2, hint: voiceName },
    { id: "subscription", label: "Subscription", Icon: CreditCard, hint: "Pro · renews Sep 12" },
    { id: "settings", label: "Settings", Icon: Settings, hint: "Appearance, playback" },
    { id: "help", label: "Help", Icon: HelpCircle, hint: "Guides & support" },
  ];

  return (
    <Screen>
      <ScreenHeader title="Profile" />
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
        <View style={styles.bigAvatar}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>VT</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Vishal T</Text>
          <Text style={{ color: colors.ink400, fontSize: 12 }}>tvvishal1997@gmail.com</Text>
        </View>
        <View style={styles.proBadge}>
          <Text style={{ color: colors.gold, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>PRO</Text>
        </View>
      </Card>

      <SectionTitle>Your impact</SectionTitle>
      <View style={styles.statGrid}>
        {stats.map((s) => (
          <Pressable key={s.id} onPress={() => toast(`${s.label}: ${s.value}`)} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: s.accent + "22" }]}>
              <s.Icon size={16} color={s.accent} />
            </View>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 17 }}>{s.value}</Text>
            <Text style={{ color: colors.ink300, fontWeight: "700", fontSize: 11 }}>{s.label}</Text>
            <Text style={{ color: colors.ink500, fontSize: 10 }}>{s.sub}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>AI keys</SectionTitle>
      <Card style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: colors.ink400, fontSize: 12, lineHeight: 18 }}>
          Screvo reads frames and speech from your recording on this device, then calls Claude Opus to
          analyse them. Keys are stored on this device only — fine while you're testing, not safe to ship.
        </Text>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink500, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>ANTHROPIC API KEY</Text>
          <TextInput
            value={keys.anthropic ?? ""}
            onChangeText={(v) => setKeys({ anthropic: v.trim() })}
            placeholder="sk-ant-..."
            placeholderTextColor={colors.ink500}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={styles.keyInput}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink500, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>
            OPENAI KEY — CAPTIONS FROM SPEECH (OPTIONAL)
          </Text>
          <TextInput
            value={keys.stt ?? ""}
            onChangeText={(v) => setKeys({ stt: v.trim() })}
            placeholder="sk-..."
            placeholderTextColor={colors.ink500}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={styles.keyInput}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink500, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>
            KOKORO ENDPOINT — VOICE-OVER
          </Text>
          <TextInput
            value={keys.kokoro ?? ""}
            onChangeText={(v) => setKeys({ kokoro: v.trim() })}
            placeholder={KOKORO_DEFAULT_ENDPOINT}
            placeholderTextColor={colors.ink500}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.keyInput}
          />
          <Text style={{ color: colors.ink500, fontSize: 11, lineHeight: 16 }}>
            Kokoro-82M needs an ONNX runtime, which a phone build does not have, so voice-over runs on a
            Kokoro server you point this at. The browser build runs the same model in-page.
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink500, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>
            SHOWUI ENDPOINT — TOUCHPOINT PLACEMENT (OPTIONAL)
          </Text>
          <TextInput
            value={keys.showui ?? ""}
            onChangeText={(v) => setKeys({ showui: v.trim() })}
            placeholder="https://…/showlab/ShowUI-2B"
            placeholderTextColor={colors.ink500}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.keyInput}
          />
          <TextInput
            value={keys.showuiToken ?? ""}
            onChangeText={(v) => setKeys({ showuiToken: v.trim() })}
            placeholder="Bearer token, if the endpoint needs one"
            placeholderTextColor={colors.ink500}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={styles.keyInput}
          />
          <Text style={{ color: colors.ink500, fontSize: 11, lineHeight: 16 }}>
            ShowUI-2B reads each step's frame and says where on screen it happens, so touchpoints and zooms
            land on the real control.
          </Text>
        </View>
        <Text style={{ color: colors.ink500, fontSize: 11 }}>
          {keys.anthropic
            ? keys.stt
              ? "Real analysis is on — frames and speech."
              : "Real analysis is on — frames only. Add an OpenAI key for captions from the recording's speech."
            : "Without an Anthropic key Screvo falls back to the built-in sample result."}
          {keys.showui ? " ShowUI will place the touchpoints." : " Touchpoints stay centred until a ShowUI endpoint is set."}
        </Text>
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card>
        {rows.map(({ id, label, Icon, hint }, i) => (
          <Pressable
            key={id}
            onPress={() => setSheet(id)}
            style={[styles.accRow, i > 0 && { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }]}
          >
            <Icon size={18} color={colors.ink300} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{label}</Text>
              <Text style={{ color: colors.ink500, fontSize: 11 }}>{hint}</Text>
            </View>
            <ChevronRight size={16} color={colors.ink500} />
          </Pressable>
        ))}
      </Card>

      <Pressable onPress={() => setConfirmReset(true)} style={styles.resetBtn}>
        <RotateCcw size={15} color={colors.ink300} />
        <Text style={{ color: colors.ink300, fontSize: 13, fontWeight: "700" }}>Reset demo data</Text>
      </Pressable>
      <Text style={{ color: colors.ink600, fontSize: 11, textAlign: "center", marginTop: 12 }}>Screvo v1.0.0 · Powered by Claude Opus</Text>

      {/* --- sheets --- */}
      <Sheet open={sheet === "voice"} onClose={() => setSheet(null)} title="Voice Settings" subtitle="Default narration voice">
        <FieldSub>AI voice</FieldSub>
        <Segmented<VoiceGender>
          value={genderOf(voiceName)}
          onChange={(g) => setVoiceName(swapGender(voiceName, g))}
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
        />
        <View style={{ height: 10 }} />
        <ChipGroup
          columns={2}
          value={voiceName}
          onChange={setVoiceName}
          items={voicesOf(genderOf(voiceName)).map((x) => x.name)}
        />
        <Text style={{ color: colors.ink500, fontSize: 11, marginTop: 8 }}>{blurbFor(voiceName)}</Text>
        <FieldSub>Language</FieldSub>
        <ChipGroup columns={2} value={lang} onChange={setLang} items={["English (US)", "English (UK)", "Spanish", "German", "French", "Japanese"]} />
        <Slider label="Speaking rate" min={0.7} max={1.4} step={0.05} value={rate} onChange={setRate} format={(v) => `${v.toFixed(2)}×`} />
        <SaveBtn onPress={() => { toast("Voice settings saved", "success"); setSheet(null); }} />
      </Sheet>

      <Sheet open={sheet === "brand"} onClose={() => setSheet(null)} title="Brand Kit">
        <FieldSub>Primary color</FieldSub>
        <ChipGroup columns={4} value={brandColor} onChange={setBrandColor} items={["#5B5FD1", "#3FD1CC", "#FD9D43", "#EDBF1B"]} />
        <View style={{ marginTop: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 18, padding: 16 }}>
          <Text style={{ color: colors.ink300, fontSize: 12, fontWeight: "700" }}>Logo</Text>
          <View style={styles.logoDrop}>
            <Text style={{ color: colors.ink500, fontSize: 12 }}>Tap to upload SVG or PNG</Text>
          </View>
        </View>
        <SaveBtn onPress={() => { toast("Brand kit updated", "success"); setSheet(null); }} />
      </Sheet>

      <Sheet open={sheet === "settings"} onClose={() => setSheet(null)} title="Settings">
        <Toggle
          label="Reduce motion"
          checked={reduceMotion}
          onChange={setReduceMotion}
          hint="Skips the ripples, pulses and eased pushes in the preview"
        />
        <FieldSub>Default export preset</FieldSub>
        <Segmented
          value={defaultAspect}
          onChange={(v) => setDefaultAspect(v as "9:16" | "1:1" | "16:9")}
          options={[{ value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }]}
        />
      </Sheet>

      <Sheet open={sheet === "subscription"} onClose={() => setSheet(null)} title="Subscription" subtitle="Pro plan">
        <View style={{ borderRadius: 20, backgroundColor: colors.brand, padding: 16 }}>
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700" }}>Current plan</Text>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Screvo Pro</Text>
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12 }}>$29 / month · renews Sep 12, 2026</Text>
        </View>
        {[
          ["AI minutes", "240 / 400"],
          ["Exports this month", "18"],
          ["Team seats", "3"],
        ].map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
            <Text style={{ color: colors.ink300, fontSize: 13 }}>{k}</Text>
            <Text style={{ color: "#fff", fontSize: 13 }}>{v}</Text>
          </View>
        ))}
        <SaveBtn label="Manage billing" onPress={() => { toast("Opening billing portal…"); setSheet(null); }} />
      </Sheet>

      <Sheet open={sheet === "workspace"} onClose={() => setSheet(null)} title="Workspace" subtitle="Vishal's Team">
        {["Vishal T — Owner", "Priya S — Editor", "Marcus L — Viewer"].map((m) => (
          <View key={m} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink700 }} />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500" }}>{m}</Text>
          </View>
        ))}
        <SaveBtn label="Invite teammate" onPress={() => { toast("Invite link copied", "success"); setSheet(null); }} />
      </Sheet>

      <Sheet open={sheet === "help"} onClose={() => setSheet(null)} title="Help">
        {["Getting started with Screvo", "How touchpoint detection works", "Editing with Ask Screvo", "Exporting SOPs & guides", "Contact support"].map((h) => (
          <Pressable key={h} onPress={() => toast("Opening: " + h)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" }}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500" }}>{h}</Text>
            <ChevronRight size={15} color={colors.ink500} />
          </Pressable>
        ))}
      </Sheet>

      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data?"
        body="All projects return to their original sample state. Edits made this session are lost."
        confirmLabel="Reset"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemo();
          setConfirmReset(false);
          toast("Demo data reset", "success");
          router.replace("/");
        }}
      />
    </Screen>
  );
}

function FieldSub({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: colors.ink500, marginTop: 14, marginBottom: 6 }}>{String(children).toUpperCase()}</Text>;
}
function SaveBtn({ onPress, label = "Save" }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={{ marginTop: 16, borderRadius: 18, backgroundColor: colors.brand, paddingVertical: 13, alignItems: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bigAvatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  proBadge: { backgroundColor: "rgba(237,191,27,0.2)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  keyInput: { borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.ink800, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 13 },
  statCard: { width: "47%", borderRadius: 20, backgroundColor: colors.ink850, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", padding: 14, gap: 2 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  accRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  resetBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, paddingVertical: 12 },
  logoDrop: { marginTop: 8, height: 64, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.1)", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
});
