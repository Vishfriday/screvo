import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { AudioLines, Check, Play, Square, Waves } from "lucide-react-native";
import { Slider, Toggle } from "@/components/ui/Controls";
import { PanelSection, EmptyNote } from "./common";
import { denoisePreview, canDenoise } from "../../../../modules/screvo-screen-capture";
import { previewAudio, stopPreview } from "@/lib/audio/preview";
import { useStore, defaultAudio } from "@/store/useStore";
import { projectSpeed } from "@/lib/speed";
import { colors } from "@/theme/tokens";

/**
 * Noise cancellation.
 *
 * The slider is the setting nobody can judge by looking at it, so the panel is
 * built around hearing it: pick a strength, tap Listen, and the five seconds
 * under the playhead come back cleaned. Raw plays the same five seconds
 * untouched, so the two can be compared directly.
 */

const PRESETS: { id: string; label: string; strength: number; note: string }[] = [
  { id: "light", label: "Light", strength: 0.35, note: "Takes the edge off — safest on voices" },
  { id: "standard", label: "Standard", strength: 0.6, note: "Fans, hum and traffic; speech barely touched" },
  { id: "strong", label: "Strong", strength: 0.85, note: "Loud rooms, at some cost to the voice" },
];

/** How much of the recording is rendered for a listen. */
const SAMPLE_SECONDS = 5;

export function NoisePanel() {
  const { editing, setAudio, setDenoise, playhead, toast } = useStore();
  const p = editing();
  const [busy, setBusy] = useState<"clean" | "raw" | null>(null);
  const [playingWhich, setPlayingWhich] = useState<"clean" | "raw" | null>(null);

  useEffect(() => () => void stopPreview(), []);

  if (!p) return <EmptyNote>No project open.</EmptyNote>;

  const audio = { ...defaultAudio(), ...p.audio };
  const { denoise } = audio;
  const speed = projectSpeed(p);
  const supported = canDenoise();
  const hasFootage = !!p.sourceUri;

  const stop = async () => {
    await stopPreview();
    setPlayingWhich(null);
  };

  const listen = async (which: "clean" | "raw") => {
    if (playingWhich === which) return void stop();
    if (!p.sourceUri) return toast("This project has no recording to listen to", "error");
    setBusy(which);
    try {
      await stopPreview();
      const { uri } = await denoisePreview(
        p.sourceUri,
        Math.max(0, playhead),
        SAMPLE_SECONDS,
        which === "raw"
          ? { enabled: false, strength: 0, highPass: false, gate: false }
          : { ...denoise, enabled: true },
      );
      // a short sample plays once — looping it would make the two hard to compare
      await previewAudio(uri, false);
      setPlayingWhich(which);
      setTimeout(() => setPlayingWhich((w) => (w === which ? null : w)), SAMPLE_SECONDS * 1000 + 300);
    } catch (e: any) {
      toast(e?.message ?? "That sample could not be played", "error");
    } finally {
      setBusy(null);
    }
  };

  const activePreset = PRESETS.find((x) => Math.abs(x.strength - denoise.strength) < 0.02);

  return (
    <View>
      <View style={styles.banner}>
        <Waves size={15} color={colors.teal} />
        <Text style={styles.bannerText}>
          Cleans the recording's own sound — room hum, fans, traffic. Narration and music are
          untouched.
        </Text>
      </View>

      <Toggle
        label="Noise cancellation"
        checked={denoise.enabled}
        onChange={(v) => {
          setDenoise({ enabled: v });
          if (v && audio.sourceVolume === 0) setAudio({ sourceVolume: 1 });
        }}
      />

      {denoise.enabled && (
        <>
          <PanelSection title="How hard">
            <View style={{ gap: 8 }}>
              {PRESETS.map((preset) => {
                const on = activePreset?.id === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => setDenoise({ strength: preset.strength })}
                    style={[styles.row, on && { borderColor: colors.teal, backgroundColor: "rgba(63,209,204,0.1)" }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{preset.label}</Text>
                      <Text style={styles.rowNote} numberOfLines={2}>{preset.note}</Text>
                    </View>
                    {on && <Check size={16} color={colors.teal} />}
                  </Pressable>
                );
              })}
            </View>
          </PanelSection>

          <Slider
            label="Strength"
            min={0.1}
            max={1}
            step={0.05}
            value={denoise.strength}
            onChange={(v) => setDenoise({ strength: Number(v.toFixed(2)) })}
            format={(v) => `${Math.round(v * 100)}%`}
            accent={colors.teal}
          />

          <Toggle
            label="Remove low rumble"
            checked={denoise.highPass}
            onChange={(v) => setDenoise({ highPass: v })}
          />
          <Toggle
            label="Quieten gaps between phrases"
            checked={denoise.gate}
            onChange={(v) => setDenoise({ gate: v })}
          />

          <PanelSection title={`Listen · ${SAMPLE_SECONDS}s from the playhead`}>
            {!hasFootage ? (
              <EmptyNote>This project has no recording to listen to.</EmptyNote>
            ) : !supported ? (
              <View style={styles.note}>
                <Text style={styles.noteText}>
                  This build cannot render a sample yet — rebuild the app to hear it. The setting
                  still applies when you export.
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["raw", "clean"] as const).map((which) => (
                  <Pressable
                    key={which}
                    onPress={() => listen(which)}
                    style={[
                      styles.listenBtn,
                      playingWhich === which && { borderColor: colors.teal, backgroundColor: "rgba(63,209,204,0.14)" },
                    ]}
                  >
                    {busy === which ? (
                      <ActivityIndicator size="small" color={colors.teal} />
                    ) : playingWhich === which ? (
                      <Square size={13} color={colors.teal} fill={colors.teal} />
                    ) : which === "raw" ? (
                      <AudioLines size={14} color={colors.ink300} />
                    ) : (
                      <Play size={13} color={colors.teal} fill={colors.teal} />
                    )}
                    <Text style={{ color: which === "clean" ? "#fff" : colors.ink200, fontSize: 12, fontWeight: "800" }}>
                      {which === "raw" ? "Raw" : "Cleaned"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </PanelSection>
        </>
      )}

      <PanelSection title="Recording's own sound">
        <Slider
          label="Level in the finished video"
          min={0}
          max={1}
          value={audio.sourceVolume}
          onChange={(v) => setAudio({ sourceVolume: Number(v.toFixed(2)) })}
          format={(v) => (v === 0 ? "Off" : `${Math.round(v * 100)}%`)}
        />
      </PanelSection>

      {speed !== 1 && (
        <View style={[styles.note, { backgroundColor: "rgba(253,157,67,0.1)" }]}>
          <Text style={{ color: colors.amber, fontSize: 11, lineHeight: 16 }}>
            At {speed}× the recording's own sound is left out of the export — a copy cannot retime
            audio, and sped-up room noise is worse than none. Narration and music still play.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(63,209,204,0.08)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  bannerText: { color: colors.ink300, fontSize: 11.5, lineHeight: 16, flex: 1 },
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
  rowTitle: { color: "#fff", fontWeight: "800", fontSize: 13 },
  rowNote: { color: colors.ink400, fontSize: 11, marginTop: 1 },
  listenBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingVertical: 12,
  },
  note: { marginTop: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 12, paddingVertical: 9 },
  noteText: { color: colors.ink400, fontSize: 11, lineHeight: 16 },
});
