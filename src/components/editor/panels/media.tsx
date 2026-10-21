import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Check, Music, Play, Square, Trash2, Upload, Wand2 } from "lucide-react-native";
import { Slider, Toggle, ColorRow } from "@/components/ui/Controls";
import { PanelSection, EmptyNote } from "./common";
import { INTRO_TEMPLATES, introTemplate } from "@/data/intros";
import { adoptMusicFile } from "@/lib/files";
import { previewAudio, stopPreview } from "@/lib/audio/preview";
import { useStore } from "@/store/useStore";
import { fmtTime } from "@/lib/format";
import { finishedDuration } from "@/lib/speed";
import { colors } from "@/theme/tokens";

// ---------------- INTRO ----------------

export function IntroPanel() {
  const { editing, setIntro, removeIntro, seek, toast } = useStore();
  const p = editing();
  if (!p) return <EmptyNote>No project open.</EmptyNote>;

  const intro = p.intro;
  const active = introTemplate(intro?.template);

  const choose = (templateId: string) => {
    const wasOff = !intro;
    setIntro({ template: templateId });
    // put the playhead on the card so the preview shows what was just picked
    seek(0.3);
    if (wasOff) toast("Intro added — it plays over the opening seconds", "ai");
  };

  return (
    <View>
      <PanelSection title="Template">
        <View style={{ gap: 8 }}>
          {INTRO_TEMPLATES.map((t) => {
            const on = !!intro && t.id === active.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => choose(t.id)}
                style={[styles.row, on && { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.12)" }]}
              >
                <View style={[styles.swatch, { backgroundColor: on ? colors.brand : "rgba(255,255,255,0.07)" }]}>
                  <Wand2 size={15} color={on ? "#fff" : colors.ink300} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t.name}</Text>
                  <Text style={styles.rowNote} numberOfLines={2}>{t.blurb}</Text>
                </View>
                {on && <Check size={16} color={colors.brand200} />}
              </Pressable>
            );
          })}
        </View>
      </PanelSection>

      {intro ? (
        <>
          <PanelSection title="Title">
            <TextInput
              value={intro.title}
              onChangeText={(v) => setIntro({ title: v })}
              placeholder="What this video shows"
              placeholderTextColor={colors.ink500}
              style={styles.input}
            />
          </PanelSection>
          <PanelSection title="Subtitle">
            <TextInput
              value={intro.subtitle}
              onChangeText={(v) => setIntro({ subtitle: v })}
              placeholder="One supporting line (optional)"
              placeholderTextColor={colors.ink500}
              style={styles.input}
            />
          </PanelSection>

          <Slider
            label="On screen for"
            min={1}
            max={8}
            step={0.1}
            value={intro.duration}
            onChange={(v) => {
              setIntro({ duration: Number(v.toFixed(1)) });
              seek(Math.min(v * 0.4, v));
            }}
            format={(v) => `${v.toFixed(1)}s`}
          />

          <PanelSection title="Accent">
            <ColorRow value={intro.accent} onChange={(c) => setIntro({ accent: c })} />
          </PanelSection>

          <View style={styles.note}>
            <Text style={styles.noteText}>
              The card plays in the preview and in every share link. Burning it into a downloaded
              file needs the re-encoder, which this build does not have yet.
            </Text>
          </View>

          <Pressable onPress={removeIntro} style={styles.delBtn}>
            <Trash2 size={14} color="#FCA5A5" />
            <Text style={{ color: "#FCA5A5", fontSize: 13, fontWeight: "800" }}>Remove intro</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.note}>
          <Text style={styles.noteText}>Pick a template to add an opening card.</Text>
        </View>
      )}
    </View>
  );
}

// ---------------- MUSIC ----------------

export function MusicPanel() {
  const { editing, setMusic, updateMusic, removeMusic, toast } = useStore();
  const [picking, setPicking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const p = editing();

  useEffect(() => () => void stopPreview(), []);

  if (!p) return <EmptyNote>No project open.</EmptyNote>;
  const music = p.music;

  const pickFromDevice = async () => {
    setPicking(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      // out of the cache first, or Android reclaims it and the bed vanishes
      const uri = await adoptMusicFile(a.uri, a.name);
      setMusic({
        uri,
        name: a.name.replace(/\.[a-z0-9]+$/i, ""),
        source: "device",
        volume: music?.volume ?? 0.22,
        fadeIn: music?.fadeIn ?? true,
        fadeOut: music?.fadeOut ?? true,
        loop: music?.loop ?? true,
      });
      toast(`${a.name} added under the narration`, "ai");
    } catch (e: any) {
      toast(e?.message ?? "That track could not be added", "error");
    } finally {
      setPicking(false);
    }
  };

  const audition = async () => {
    if (!music) return;
    if (playing) {
      await stopPreview();
      setPlaying(false);
      return;
    }
    try {
      await previewAudio(music.uri, true);
      setPlaying(true);
    } catch {
      toast("That track could not be played", "error");
    }
  };

  return (
    <View>
      {music ? (
        <>
          <View style={styles.current}>
            <Pressable onPress={audition} style={styles.playBtn} hitSlop={6}>
              {playing ? (
                <Square size={13} color={colors.teal} fill={colors.teal} />
              ) : (
                <Play size={13} color={colors.teal} fill={colors.teal} />
              )}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{music.name}</Text>
              <Text style={styles.rowNote}>
                {music.source === "stock" ? "Screvo bed" : "From this device"} · under{" "}
                {fmtTime(finishedDuration(p))} of video
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                await stopPreview();
                setPlaying(false);
                removeMusic();
              }}
              hitSlop={8}
            >
              <Trash2 size={15} color="rgba(252,165,165,0.85)" />
            </Pressable>
          </View>

          <Slider
            label="Music level"
            min={0}
            max={1}
            value={music.volume}
            onChange={(v) => updateMusic({ volume: Number(v.toFixed(2)) })}
            format={(v) => `${Math.round(v * 100)}%`}
            accent={colors.teal}
          />
          <Toggle label="Fade in" checked={music.fadeIn} onChange={(v) => updateMusic({ fadeIn: v })} />
          <Toggle label="Fade out" checked={music.fadeOut} onChange={(v) => updateMusic({ fadeOut: v })} />
          <Toggle label="Loop to the end of the video" checked={music.loop} onChange={(v) => updateMusic({ loop: v })} />

          <Pressable onPress={pickFromDevice} style={styles.dashBtn}>
            <Upload size={14} color={colors.ink200} />
            <Text style={{ color: colors.ink200, fontSize: 12, fontWeight: "700" }}>
              {picking ? "Opening…" : "Choose a different track"}
            </Text>
          </Pressable>

          <View style={styles.note}>
            <Text style={styles.noteText}>
              The bed is mixed into the exported file underneath the narration. Keep it near 20% so
              the voice stays in front.
            </Text>
          </View>
        </>
      ) : (
        <>
          <Pressable onPress={pickFromDevice} style={styles.dropzone}>
            {picking ? (
              <ActivityIndicator color={colors.teal} />
            ) : (
              <Music size={26} color={colors.teal} />
            )}
            <Text style={styles.dropTitle}>Choose a track from this device</Text>
            <Text style={styles.dropNote}>MP3, M4A, WAV or AAC · plays under the narration</Text>
          </Pressable>
          <View style={styles.note}>
            <Text style={styles.noteText}>
              Whatever you pick is copied into Screvo, so the project keeps working if the original
              is moved or deleted.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  current: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(63,209,204,0.35)",
    backgroundColor: "rgba(63,209,204,0.08)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 4,
  },
  swatch: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  playBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(63,209,204,0.14)", alignItems: "center", justifyContent: "center" },
  rowTitle: { color: "#fff", fontWeight: "800", fontSize: 13 },
  rowNote: { color: colors.ink400, fontSize: 11, marginTop: 1 },
  dropzone: {
    alignItems: "center",
    gap: 6,
    borderWidth: 2,
    borderColor: "rgba(63,209,204,0.3)",
    borderStyle: "dashed",
    borderRadius: 22,
    backgroundColor: "rgba(63,209,204,0.05)",
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  dropTitle: { color: "#fff", fontWeight: "800", fontSize: 14, marginTop: 6 },
  dropNote: { color: colors.ink400, fontSize: 11.5 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: colors.ink800,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: "#fff",
  },
  note: { marginTop: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 12, paddingVertical: 9 },
  noteText: { color: colors.ink400, fontSize: 11, lineHeight: 16 },
  delBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(229,72,77,0.15)",
    borderRadius: 18,
    paddingVertical: 12,
  },
  dashBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderStyle: "dashed",
    borderRadius: 18,
    paddingVertical: 12,
  },
});
