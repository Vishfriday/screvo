import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView } from "react-native";
import { Minus, Plus, Trash2, Wand2, Palette, Check, X, Sparkles, AudioLines, Volume2, Play } from "lucide-react-native";
import { synthesizeSpeech, playClip, clipDuration, KOKORO_DEFAULT_ENDPOINT } from "@/lib/voice/tts";
import { estimateSpeechSeconds } from "@/lib/script";
import { voicesOf, genderOf, swapGender, blurbFor, type VoiceGender } from "@/lib/voice/voices";
import { useStore } from "@/store/useStore";
import { Slider, ChipGroup, Segmented, Toggle, ColorRow } from "@/components/ui/Controls";
import { PanelSection, AddButton, EffectList, PlaceOnVideoToggle, ClipPicker, EmptyNote } from "./common";
import { generateRecommendations, generateSubtitlesFromScript, transcribeToSubtitles, rewriteScript, type ScriptMode } from "@/lib/opus";
import { fmtTime } from "@/lib/format";
import { SPEEDS, fmtSpeed, projectSpeed, finishedDuration, narrationOverrun } from "@/lib/speed";
import { colors } from "@/theme/tokens";

const H_POS = ["top", "above-middle", "middle", "below-middle", "bottom"];
const V_POS = ["center-left", "center", "center-right"];
const TEXT_ANIM = ["Typewriter", "Word-by-word", "Fade", "Pop", "Slide", "Bounce", "Reveal", "Kinetic", "Scale", "Emphasis"];

function useDefaultClip(tracks: ("video" | "audio")[]) {
  const { editing, selectedClipId, playhead } = useStore();
  const p = editing();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (id && p?.clips.some((c) => c.id === id)) return;
    const under = p?.clips.find((c) => tracks.includes(c.track as any) && playhead >= c.start && playhead < c.start + c.duration);
    setId(selectedClipId ?? under?.id ?? p?.clips.find((c) => tracks.includes(c.track as any))?.id ?? null);
  }, [p?.id, selectedClipId]);
  return { id, setId, clip: p?.clips.find((c) => c.id === id) ?? null };
}

function QuickGrid({
  items,
  cols = 2,
}: {
  items: { label: string; onPress: () => void; disabled?: boolean; accent?: boolean }[];
  cols?: number;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          onPress={it.disabled ? undefined : it.onPress}
          style={{
            width: `${100 / cols - 2}%`,
            borderWidth: 1,
            borderColor: it.accent ? "rgba(63,209,204,0.3)" : "rgba(255,255,255,0.1)",
            backgroundColor: it.accent ? "rgba(63,209,204,0.1)" : "rgba(255,255,255,0.04)",
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 6,
            alignItems: "center",
            opacity: it.disabled ? 0.4 : 1,
          }}
        >
          <Text style={{ color: it.accent ? "#8AE4E1" : colors.ink200, fontSize: 11.5, fontWeight: "800", textAlign: "center" }}>
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------- TRIM ----------------
export function TrimPanel() {
  const { trimClip, stepAt, unstepAt, playhead, editing, toast } = useStore();
  const { id, setId, clip } = useDefaultClip(["video", "audio"]);
  if (!clip) return <EmptyNote>No clips to trim.</EmptyNote>;
  const inside = playhead > clip.start + 0.05 && playhead < clip.start + clip.duration - 0.05;
  return (
    <View>
      <PanelSection title="Clip">
        <ClipPicker tracks={["video", "audio"]} value={id} onChange={setId} />
      </PanelSection>

      <PanelSection title="Quick">
        <QuickGrid
          cols={2}
          items={[
            { label: "Head → playhead", disabled: !inside, onPress: () => { trimClip(clip.id, "start", playhead - clip.start); toast("Trimmed the head", "success"); } },
            { label: "Tail → playhead", disabled: !inside, onPress: () => { trimClip(clip.id, "end", -(clip.start + clip.duration - playhead)); toast("Trimmed the tail", "success"); } },
            { label: "Trim 1s ends", onPress: () => { trimClip(clip.id, "start", 1); trimClip(clip.id, "end", -1); toast("Trimmed 1s off each end", "success"); } },
            { label: "Trim dead air", accent: true, onPress: () => { trimClip(clip.id, "start", 0.4); trimClip(clip.id, "end", -0.4); toast("Trimmed the silence off both ends", "ai"); } },
          ]}
        />
      </PanelSection>

      <View style={styles.readout}>
        <Text style={styles.readoutKick}>Length</Text>
        <Text style={styles.readoutBig}>{fmtTime(clip.duration)}</Text>
        <Text style={styles.readoutSub}>{fmtTime(clip.start)} → {fmtTime(clip.start + clip.duration)}</Text>
      </View>
      {(["start", "end"] as const).map((side) => (
        <View key={side} style={styles.trimRow}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700", textTransform: "capitalize" }}>{side} handle</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => trimClip(clip.id, side, -0.5)} style={styles.stepBtn}>
              <Minus size={14} color="#fff" />
            </Pressable>
            <Pressable onPress={() => trimClip(clip.id, side, 0.5)} style={styles.stepBtn}>
              <Plus size={14} color="#fff" />
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable
        disabled={!inside}
        onPress={() => trimClip(clip.id, "end", -(clip.start + clip.duration - playhead))}
        style={[styles.wideBtn, !inside && { opacity: 0.4 }]}
      >
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Trim end to playhead ({fmtTime(playhead)})</Text>
      </Pressable>

      <PanelSection title="Steps">
        <QuickGrid
          cols={1}
          items={[
            { label: "New step at the playhead", onPress: () => stepAt(playhead) },
            { label: "Merge the step here into the previous one", onPress: () => unstepAt(playhead) },
          ]}
        />
      </PanelSection>
    </View>
  );
}

// ---------------- SPEED ----------------
export function SpeedPanel() {
  const { editing, setProjectSpeed, setClipSpeed, toast } = useStore();
  const p = editing();
  const { id, setId, clip } = useDefaultClip(["video"]);
  const [scope, setScope] = useState<"video" | "clip">("video");
  if (!p) return <EmptyNote>No project open.</EmptyNote>;

  const speed = projectSpeed(p);
  const finished = finishedDuration(p);
  const overrun = narrationOverrun(p);
  const voiced = p.script.filter((s) => s.audioUri).length;

  return (
    <View>
      <PanelSection title="Applies to">
        <Segmented
          value={scope}
          onChange={(v) => setScope(v as any)}
          options={[
            { value: "video", label: "Whole video" },
            { value: "clip", label: "One clip" },
          ]}
        />
      </PanelSection>

      {scope === "video" ? (
        <>
          <PanelSection title="Preset">
            <ChipGroup
              columns={4}
              value={fmtSpeed(speed)}
              onChange={(v) => setProjectSpeed(parseFloat(v))}
              items={SPEEDS.map(fmtSpeed)}
            />
          </PanelSection>
          <Slider
            label="Playback speed"
            min={0.5}
            max={5}
            step={0.1}
            value={speed}
            onChange={(v) => setProjectSpeed(Number(v.toFixed(1)))}
            format={(v) => `${v.toFixed(1)}×`}
          />
          <View style={styles.readout}>
            <Text style={styles.readoutKick}>FINISHED LENGTH</Text>
            <Text style={styles.readoutBig}>{fmtTime(finished)}</Text>
            <Text style={styles.readoutSub}>
              {fmtTime(p.durationSec)} of footage at {fmtSpeed(speed)}
            </Text>
          </View>

          {speed !== 1 && (
            <View style={styles.note}>
              <Text style={{ color: colors.ink400, fontSize: 11, lineHeight: 16 }}>
                The recording's own sound is dropped above 1× — sped-up audio is unusable, and the
                export writes the narration track instead.
              </Text>
            </View>
          )}

          {voiced > 0 && overrun.overlapping > 0 && (
            <View style={[styles.note, { backgroundColor: "rgba(253,157,67,0.1)" }]}>
              <Text style={{ color: colors.amber, fontSize: 11, lineHeight: 16 }}>
                Narration keeps its natural pace, so {overrun.overlapping}{" "}
                {overrun.overlapping === 1 ? "line runs" : "lines run"} into the next by up to{" "}
                {overrun.worstSec.toFixed(1)}s at this speed. Shorten those lines, or drop back a step.
              </Text>
            </View>
          )}

          {speed !== 1 && (
            <Pressable onPress={() => setProjectSpeed(1)} style={styles.wideBtn}>
              <Text style={{ color: colors.ink200, fontSize: 12, fontWeight: "700" }}>Back to 1×</Text>
            </Pressable>
          )}
        </>
      ) : !clip ? (
        <EmptyNote>No video clips.</EmptyNote>
      ) : (
        <>
          <PanelSection title="Clip">
            <ClipPicker tracks={["video"]} value={id} onChange={setId} />
          </PanelSection>
          <PanelSection title="Preset">
            <ChipGroup
              columns={4}
              value={fmtSpeed(clip.speed ?? 1)}
              onChange={(v) => setClipSpeed(clip.id, parseFloat(v))}
              items={SPEEDS.map(fmtSpeed)}
            />
          </PanelSection>
          <Slider
            label="Clip speed"
            min={0.5}
            max={5}
            step={0.1}
            value={clip.speed ?? 1}
            onChange={(v) => setClipSpeed(clip.id, Number(v.toFixed(1)))}
            format={(v) => `${v.toFixed(1)}×`}
          />
          <View style={styles.note}>
            <Text style={{ color: colors.ink400, fontSize: 11 }}>
              New clip length: <Text style={{ color: "#fff", fontWeight: "800" }}>{fmtTime(clip.duration)}</Text>
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setClipSpeed(clip.id, 1);
              toast("Clip back to 1×");
            }}
            style={styles.wideBtn}
          >
            <Text style={{ color: colors.ink200, fontSize: 12, fontWeight: "700" }}>Reset this clip</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ---------------- VOLUME ----------------
export function VolumePanel() {
  const { setClipVolume } = useStore();
  const { id, setId, clip } = useDefaultClip(["video", "audio"]);
  if (!clip) return <EmptyNote>No clips.</EmptyNote>;
  const vol = clip.volume ?? 1;
  return (
    <View>
      <PanelSection title="Track">
        <ClipPicker tracks={["video", "audio"]} value={id} onChange={setId} />
      </PanelSection>
      <Slider label="Volume" min={0} max={1} value={vol} onChange={(v) => setClipVolume(clip.id, v)} format={(v) => `${Math.round(v * 100)}%`} accent="#3FD1CC" />
      <Toggle label="Mute this track" checked={vol === 0} onChange={(m) => setClipVolume(clip.id, m ? 0 : 1)} />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        {([["Fade in", 0.15], ["Normal", 1], ["Duck", 0.35]] as const).map(([label, v]) => (
          <Pressable key={label} onPress={() => setClipVolume(clip.id, v)} style={styles.thirdBtn}>
            <Text style={{ color: colors.ink200, fontSize: 12, fontWeight: "700" }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------- CROP ----------------
export function CropPanel() {
  const { commit, toast } = useStore();
  const { id, setId, clip } = useDefaultClip(["video"]);
  const [fit, setFit] = useState<"fill" | "fit" | "square" | "wide">("fill");
  const [scale, setScale] = useState(1);
  if (!clip) return <EmptyNote>No video clips.</EmptyNote>;
  return (
    <View>
      <PanelSection title="Clip">
        <ClipPicker tracks={["video"]} value={id} onChange={setId} />
      </PanelSection>
      <PanelSection title="Framing">
        <Segmented value={fit} onChange={(v) => setFit(v as any)} options={[{ value: "fill", label: "Fill" }, { value: "fit", label: "Fit" }, { value: "square", label: "1:1" }, { value: "wide", label: "16:9" }]} />
      </PanelSection>
      <Slider label="Scale" min={1} max={2.5} step={0.05} value={scale} onChange={setScale} format={(v) => `${v.toFixed(2)}×`} />
      <AddButton label="Apply crop" onPress={() => { commit("Crop clip", (d) => { const c = d.clips.find((x) => x.id === clip.id); if (c) c.meta = { ...(c.meta ?? {}), crop: { fit, scale } }; }); toast("Crop applied to clip", "success"); }} />
    </View>
  );
}

// ---------------- SPLIT ----------------
// ---------------- ZOOM ----------------
export function ZoomPanel() {
  const { addEffect, updateEffect, playhead, startPlacing, placePicker, toast } = useStore();
  const [mode, setMode] = useState("Touchpoint Zoom");
  const [scale, setScale] = useState(1.7);
  const [duration, setDuration] = useState(2.5);
  const [easing, setEasing] = useState("easeOut");
  const [xy, setXy] = useState({ x: 0.5, y: 0.45 });
  const [editId, setEditId] = useState<string | null>(null);

  const kindForMode = (m: string) => (m === "Zoom Out" ? "out" : "in");
  const quickZoom = (kind: "in" | "out" | "pulse") => {
    const spec =
      kind === "in"
        ? { scale: 1.85, dur: 2.5, easing: "easeOut", label: "Zoom in" }
        : kind === "out"
          ? { scale: 1.85, dur: 2.5, easing: "easeInOut", label: "Zoom out" }
          : { scale: 1.5, dur: 1, easing: "easeInOut", label: "Zoom in & out" };
    addEffect(
      "zoom",
      { mode: spec.label, scale: spec.scale, easing: spec.easing, kind },
      { start: playhead, duration: spec.dur, x: xy.x, y: xy.y, label: `${spec.label} @ ${fmtTime(playhead)}` },
    );
    toast(`${spec.label} added`, "success");
  };

  return (
    <View>
      <PanelSection title="Quick">
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["Zoom In", "in"], ["Zoom Out", "out"], ["In & Out", "pulse"]] as const).map(([label, k]) => (
            <Pressable key={k} onPress={() => quickZoom(k)} style={styles.quickZoomBtn}>
              <Text style={styles.quickZoomText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: colors.ink500, fontSize: 10, marginTop: 6 }}>Drops a preset zoom at the playhead using the focal point below.</Text>
      </PanelSection>
      <PanelSection title="Type">
        <ChipGroup columns={3} value={mode} onChange={setMode} items={["Zoom In", "Zoom Out", "Dynamic Zoom", "Smart Focus", "Touchpoint Zoom", "Custom Zoom"]} />
      </PanelSection>
      <Slider label="Scale" min={1} max={3} step={0.05} value={scale} onChange={setScale} format={(v) => `${v.toFixed(2)}×`} accent="#3FD1CC" />
      <Slider label="Duration" min={0.4} max={6} step={0.1} value={duration} onChange={setDuration} format={(v) => `${v.toFixed(1)}s`} />
      <PanelSection title="Easing">
        <Segmented value={easing} onChange={setEasing} options={[{ value: "linear", label: "Linear" }, { value: "easeIn", label: "In" }, { value: "easeOut", label: "Out" }, { value: "easeInOut", label: "In-Out" }]} />
      </PanelSection>
      <PanelSection title="Focal point">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Slider label="X" min={0} max={1} value={xy.x} onChange={(v) => setXy((s) => ({ ...s, x: v }))} format={(v) => v.toFixed(2)} /></View>
          <View style={{ flex: 1 }}><Slider label="Y" min={0} max={1} value={xy.y} onChange={(v) => setXy((s) => ({ ...s, y: v }))} format={(v) => v.toFixed(2)} /></View>
        </View>
        <PlaceOnVideoToggle label="Place focal point on video" active={placePicker?.label === "the zoom focus"} onToggle={() => startPlacing("the zoom focus", (x, y) => setXy({ x, y }))} />
      </PanelSection>
      <AddButton
        label={editId ? "Update zoom" : "Add zoom"}
        onPress={() => {
          if (editId) { updateEffect(editId, { mode, scale, easing, kind: kindForMode(mode) }); toast("Zoom updated", "success"); }
          else { addEffect("zoom", { mode, scale, easing, kind: kindForMode(mode) }, { start: playhead, duration, x: xy.x, y: xy.y, label: `${mode} ${scale.toFixed(1)}×` }); toast("Zoom added at " + fmtTime(playhead), "success"); }
        }}
      />
      <PanelSection title="Zooms on this video">
        <EffectList types={["zoom"]} selectedId={editId} onSelect={(e) => { setEditId(e.id); setMode(e.params.mode); setScale(e.params.scale ?? 1.7); setEasing(e.params.easing ?? "easeOut"); }} />
        {editId && <Pressable onPress={() => setEditId(null)} style={styles.newBtn}><Text style={styles.newBtnText}>+ New zoom instead</Text></Pressable>}
      </PanelSection>
    </View>
  );
}

// ---------------- PARALLAX ----------------
export function ParallaxPanel() {
  const { addEffect, playhead, toast } = useStore();
  const [type, setType] = useState("Layered Depth");
  const [depth, setDepth] = useState(0.5);
  const [direction, setDirection] = useState("horizontal");
  const [speed, setSpeed] = useState(0.5);
  const [intensity, setIntensity] = useState(0.5);
  return (
    <View>
      <PanelSection title="Style">
        <ChipGroup columns={2} value={type} onChange={setType} items={["Layered Depth", "3D Motion", "Perspective", "Foreground Motion", "Background Motion", "Dynamic Depth"]} />
      </PanelSection>
      <Slider label="Depth" min={0} max={1} value={depth} onChange={setDepth} />
      <PanelSection title="Direction">
        <Segmented value={direction} onChange={setDirection} options={[{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }, { value: "diagonal", label: "Diagonal" }]} />
      </PanelSection>
      <Slider label="Speed" min={0.1} max={2} step={0.05} value={speed} onChange={setSpeed} format={(v) => `${v.toFixed(2)}×`} />
      <Slider label="Intensity" min={0} max={1} value={intensity} onChange={setIntensity} accent="#7C8CF8" />
      <AddButton label="Add parallax" onPress={() => { addEffect("parallax", { type, depth, direction, speed, intensity }, { start: playhead, duration: 4, label: type }); toast("Parallax added", "success"); }} />
      <PanelSection title="Parallax layers"><EffectList types={["parallax"]} /></PanelSection>
    </View>
  );
}

// ---------------- TRANSITION ----------------
const TRANSITIONS = ["Fade", "Dissolve", "Slide", "Push", "Scale", "Zoom", "Blur", "Morph", "Swipe", "Whip", "Light", "Minimal"];
export function TransitionPanel() {
  const { addEffect, playhead, editing, toast } = useStore();
  const [style, setStyle] = useState("Dissolve");
  const [duration, setDuration] = useState(0.5);
  const p = editing();
  return (
    <View>
      <PanelSection title="Style"><ChipGroup columns={3} value={style} onChange={setStyle} items={TRANSITIONS} /></PanelSection>
      <Slider label="Duration" min={0.2} max={1.5} step={0.05} value={duration} onChange={setDuration} format={(v) => `${v.toFixed(2)}s`} />
      <AddButton label={`Insert ${style} at playhead`} onPress={() => { addEffect("transition", { style, duration }, { start: playhead, duration, label: `${style} transition` }); toast(`${style} added at ${fmtTime(playhead)}`, "success"); }} />
      <Pressable onPress={() => { p?.chapters.slice(1).forEach((c) => addEffect("transition", { style, duration }, { start: c.start, duration, label: `${style} → ${c.name}` })); toast(`${style} added between every chapter`, "success"); }} style={styles.wideBtn}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Add between every chapter</Text>
      </Pressable>
      <PanelSection title="Transitions on timeline"><EffectList types={["transition"]} /></PanelSection>
    </View>
  );
}

// ---------------- EFFECTS ----------------
export function EffectsPanel() {
  const { addEffect, playhead, toast } = useStore();
  const [kind, setKind] = useState("Vignette");
  const [intensity, setIntensity] = useState(0.5);
  const [duration, setDuration] = useState(4);
  return (
    <View>
      <PanelSection title="Effect"><ChipGroup columns={3} value={kind} onChange={setKind} items={["Vignette", "Blur", "Grain", "Duotone", "Light Leak", "Chromatic", "Dreamy", "Shake"]} /></PanelSection>
      <Slider label="Intensity" min={0} max={1} value={intensity} onChange={setIntensity} accent="#FD9D43" />
      <Slider label="Duration" min={0.5} max={12} step={0.5} value={duration} onChange={setDuration} format={(v) => `${v.toFixed(1)}s`} />
      <AddButton label={`Add ${kind}`} onPress={() => { addEffect("effect", { kind, intensity }, { start: playhead, duration, label: kind }); toast(`${kind} added`, "success"); }} />
      <PanelSection title="Effects on timeline"><EffectList types={["effect"]} /></PanelSection>
    </View>
  );
}

// ---------------- ANIMATIONS ----------------
export function AnimationsPanel() {
  const { addEffect, playhead, selectedClipId, editing, toast } = useStore();
  const [anim, setAnim] = useState("Pop");
  const [scope, setScope] = useState<"in" | "out">("in");
  const [duration, setDuration] = useState(0.6);
  const clip = editing()?.clips.find((c) => c.id === selectedClipId);
  return (
    <View>
      <PanelSection title="Animation"><ChipGroup columns={3} value={anim} onChange={setAnim} items={["Fade", "Slide", "Zoom", "Bounce", "Pop", "Reveal", "Spin", "Blur In", "Kinetic"]} /></PanelSection>
      <PanelSection title="Applies to"><Segmented value={scope} onChange={(v) => setScope(v as any)} options={[{ value: "in", label: "Entrance" }, { value: "out", label: "Exit" }]} /></PanelSection>
      <Slider label="Duration" min={0.2} max={2} step={0.05} value={duration} onChange={setDuration} format={(v) => `${v.toFixed(2)}s`} />
      <View style={styles.note}><Text style={{ color: colors.ink400, fontSize: 11 }}>Target: <Text style={{ color: "#fff", fontWeight: "800" }}>{clip ? clip.label : "clip under playhead"}</Text></Text></View>
      <AddButton label={`Add ${anim} ${scope === "in" ? "entrance" : "exit"}`} onPress={() => { addEffect("animation", { anim, scope }, { start: playhead, duration, label: `${anim} ${scope}` }); toast(`${anim} animation added`, "success"); }} />
      <PanelSection title="Animations on timeline"><EffectList types={["animation"]} /></PanelSection>
    </View>
  );
}

// ---------------- TINT ----------------
const TINT_PRESETS = ["Original", "Clean", "Cool", "Warm", "Midnight", "Soft", "Cinematic", "Brand", "Subtle"];
export function TintPanel() {
  const { editing, setTint, beforeAfter, toggleBeforeAfter } = useStore();
  const p = editing();
  if (!p) return null;
  const t = p.tint;
  return (
    <View>
      <Pressable onPress={toggleBeforeAfter} style={styles.baToggle}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{beforeAfter ? "Showing: Before (raw)" : "Showing: After (tinted)"} — tap to toggle</Text>
      </Pressable>
      <PanelSection title="Preset"><ChipGroup columns={3} value={t.preset} onChange={(v) => setTint({ preset: v })} items={TINT_PRESETS} /></PanelSection>
      <PanelSection title="Tint color"><ColorRow value={t.color} onChange={(c) => setTint({ color: c })} /></PanelSection>
      <Slider label="Intensity" min={0} max={0.5} value={t.intensity} onChange={(v) => setTint({ intensity: v })} accent="#FD9D43" />
      <Slider label="Brightness" min={-0.2} max={0.2} value={t.brightness} onChange={(v) => setTint({ brightness: v })} format={(v) => v.toFixed(2)} />
      <Slider label="Contrast" min={-0.2} max={0.4} value={t.contrast} onChange={(v) => setTint({ contrast: v })} format={(v) => v.toFixed(2)} />
      <Slider label="Saturation" min={-0.3} max={0.4} value={t.saturation} onChange={(v) => setTint({ saturation: v })} format={(v) => v.toFixed(2)} />
      <Slider label="Opacity" min={0} max={0.5} value={t.opacity} onChange={(v) => setTint({ opacity: v })} />
      <View style={styles.note}><Text style={{ color: colors.ink400, fontSize: 11, lineHeight: 16 }}>Screvo caps the tint so UI text stays readable. Use Before / After to check contrast.</Text></View>
    </View>
  );
}

// ---------------- TOUCHPOINT ----------------
const TP_STYLES = ["Ripple", "Pulse", "Glow", "Spotlight", "Magnify", "Touch Highlight", "Touch Zoom"];
export function TouchpointPanel() {
  const { editing, addEffect, updateEffect, playhead, startPlacing, placePicker, toast, seek } = useStore();
  const p = editing();
  const [style, setStyle] = useState("Ripple");
  const [size, setSize] = useState(60);
  const [opacity, setOpacity] = useState(0.8);
  const [duration, setDuration] = useState(1.2);
  const [color, setColor] = useState("#3FD1CC");
  const [xy, setXy] = useState({ x: 0.5, y: 0.5 });
  const [editId, setEditId] = useState<string | null>(null);
  if (!p) return null;
  const near = p.touchpoints.slice().sort((a, b) => Math.abs(a.t - playhead) - Math.abs(b.t - playhead))[0];
  return (
    <View>
      <PanelSection title="Captured touchpoints">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {p.touchpoints.map((tp) => (
            <Pressable key={tp.id} onPress={() => { seek(tp.t); setXy({ x: tp.x, y: tp.y }); }} style={styles.tpChip}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{tp.label}</Text>
              <Text style={{ color: colors.ink400, fontSize: 9 }}>{fmtTime(tp.t)}{tp.key ? " · key" : ""}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </PanelSection>
      <PanelSection title="Style"><ChipGroup columns={3} value={style} onChange={setStyle} items={TP_STYLES} /></PanelSection>
      <Slider label="Size" min={20} max={140} step={2} value={size} onChange={setSize} format={(v) => `${Math.round(v)}px`} />
      <Slider label="Opacity" min={0.1} max={1} value={opacity} onChange={setOpacity} />
      <Slider label="Duration" min={0.4} max={3} step={0.1} value={duration} onChange={setDuration} format={(v) => `${v.toFixed(1)}s`} />
      <PanelSection title="Color"><ColorRow value={color} onChange={setColor} /></PanelSection>
      <PlaceOnVideoToggle label="Place on video" active={placePicker?.label === "the touchpoint effect"} onToggle={() => startPlacing("the touchpoint effect", (x, y) => setXy({ x, y }))} />
      <Text style={{ color: colors.ink500, fontSize: 10, textAlign: "center", marginTop: 4 }}>at x {xy.x.toFixed(2)}, y {xy.y.toFixed(2)}</Text>
      <AddButton
        label={editId ? "Update touchpoint effect" : "Add touchpoint effect"}
        onPress={() => {
          if (editId) { updateEffect(editId, { style, size, opacity, duration, color }); toast("Touchpoint effect updated", "success"); }
          else {
            const src = near ?? { t: playhead, label: "tap" };
            addEffect("touchpoint", { style, size, opacity, duration, color }, { start: src.t, duration: duration + 0.2, x: xy.x, y: xy.y, label: `${style} → ${src.label}` });
            toast("Touchpoint effect added", "success");
          }
        }}
      />
      <PanelSection title="Touchpoint effects">
        <EffectList types={["touchpoint"]} selectedId={editId} onSelect={(e) => { setEditId(e.id); setStyle(e.params.style); setSize(e.params.size ?? 60); setOpacity(e.params.opacity ?? 0.8); setColor(e.params.color ?? "#3FD1CC"); }} />
        {editId && <Pressable onPress={() => setEditId(null)} style={styles.newBtn}><Text style={styles.newBtnText}>+ New effect instead</Text></Pressable>}
      </PanelSection>
    </View>
  );
}

// ---------------- TEXT ----------------
export function TextPanel() {
  const { addEffect, playhead, startPlacing, placePicker, toast } = useStore();
  const [text, setText] = useState("Your text");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [position, setPosition] = useState("above-middle");
  const [animation, setAnimation] = useState("Kinetic");
  const [size, setSize] = useState(26);
  const [duration, setDuration] = useState(4);
  const [xy, setXy] = useState({ x: 0.5, y: 0.4 });
  return (
    <View>
      <PanelSection title="Text">
        <TextInput value={text} onChangeText={setText} multiline style={styles.textArea} placeholderTextColor={colors.ink500} />
      </PanelSection>
      <PanelSection title="Orientation">
        <Segmented value={orientation} onChange={(v) => { setOrientation(v as any); setPosition(v === "vertical" ? "center" : "above-middle"); }} options={[{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical (portrait)" }]} />
      </PanelSection>
      <PanelSection title="Position"><ChipGroup columns={3} value={position} onChange={setPosition} items={orientation === "vertical" ? V_POS : H_POS} /></PanelSection>
      <PanelSection title="Animation"><ChipGroup columns={3} value={animation} onChange={setAnimation} items={TEXT_ANIM} /></PanelSection>
      <Slider label="Size" min={16} max={48} step={1} value={size} onChange={setSize} format={(v) => `${Math.round(v)}px`} />
      <Slider label="Duration" min={1} max={10} step={0.5} value={duration} onChange={setDuration} format={(v) => `${v.toFixed(1)}s`} />
      <PlaceOnVideoToggle label="Place on video" active={placePicker?.label === "the text"} onToggle={() => startPlacing("the text", (x, y) => setXy({ x, y }))} />
      <AddButton label="Add text overlay" onPress={() => { addEffect("text", { text, orientation, position, animation, size }, { start: playhead, duration, x: xy.x, y: xy.y, label: `Text — ${text.split("\n")[0].slice(0, 16)}` }); toast("Text overlay added", "success"); }} />
      <PanelSection title="Text overlays"><EffectList types={["text"]} /></PanelSection>
    </View>
  );
}

// ---------------- SUBTITLES ----------------
const HL_STYLES = ["rounded", "marker", "pill", "underline", "glow", "soft"];

type HLPatch = Partial<{ enabled: boolean; auto: boolean; color: string; style: string; opacity: number; radius: number; padding: number }>;
const SUB_BG_PRESETS: { label: string; patch: HLPatch }[] = [
  { label: "Plain", patch: { enabled: false } },
  { label: "Dark bg", patch: { enabled: true, auto: false, color: "#0A0A0F", style: "rounded", opacity: 0.85, radius: 10, padding: 10 } },
  { label: "Light bg", patch: { enabled: true, auto: false, color: "#F4F4F8", style: "rounded", opacity: 0.92, radius: 10, padding: 10 } },
  { label: "Dark smoky bg", patch: { enabled: true, auto: false, color: "#0A0A0F", style: "soft", opacity: 0.42, radius: 12, padding: 10 } },
  { label: "Light smoky bg", patch: { enabled: true, auto: false, color: "#F4F4F8", style: "soft", opacity: 0.42, radius: 12, padding: 10 } },
];

function SubBgButtons({ onPick }: { onPick: (patch: HLPatch) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {SUB_BG_PRESETS.map((p) => (
        <Pressable key={p.label} onPress={() => onPick(p.patch)} style={styles.subBgBtn}>
          <Text style={styles.subBgText}>{p.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SubtitlePanel() {
  const { editing, addSubtitle, updateSubtitle, removeSubtitle, autoHighlightAll, playhead, seek, commit, toast } = useStore();
  const p = editing();
  const [sel, setSel] = useState<string | null>(null);
  if (!p) return null;
  const cue = p.subtitles.find((s) => s.id === sel);

  if (cue) {
    const hl = cue.highlight;
    return (
      <View>
        <Pressable onPress={() => setSel(null)}><Text style={{ color: colors.brand200, fontSize: 12, fontWeight: "700", marginBottom: 10 }}>‹ All subtitles</Text></Pressable>
        <TextInput value={cue.text} onChangeText={(v) => updateSubtitle(cue.id, { text: v })} multiline style={styles.textArea} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Slider label="Start" min={0} max={p.durationSec} step={0.1} value={cue.start} onChange={(v) => updateSubtitle(cue.id, { start: v })} format={fmtTime} /></View>
          <View style={{ flex: 1 }}><Slider label="Length" min={0.5} max={8} step={0.1} value={cue.duration} onChange={(v) => updateSubtitle(cue.id, { duration: v })} format={(v) => `${v.toFixed(1)}s`} /></View>
        </View>
        <PanelSection title="Orientation">
          <Segmented value={cue.orientation} onChange={(v) => updateSubtitle(cue.id, { orientation: v as any, position: v === "vertical" ? "center" : "bottom" })} options={[{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }]} />
        </PanelSection>
        <PanelSection title="Position"><ChipGroup columns={3} value={cue.position} onChange={(v) => updateSubtitle(cue.id, { position: v })} items={cue.orientation === "vertical" ? V_POS : H_POS} /></PanelSection>
        <PanelSection title="Animation"><ChipGroup columns={3} value={cue.animation} onChange={(v) => updateSubtitle(cue.id, { animation: v })} items={TEXT_ANIM} /></PanelSection>
        <PanelSection title="Background">
          <SubBgButtons onPick={(patch) => updateSubtitle(cue.id, { highlight: patch })} />
        </PanelSection>
        <View style={styles.hlBox}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <Palette size={13} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Smart Highlighter</Text>
          </View>
          <Toggle label="Highlight background" checked={hl.enabled} onChange={(v) => updateSubtitle(cue.id, { highlight: { enabled: v } })} />
          <Toggle label="Auto colour from video" hint="Dark bg → light chip, light bg → dark chip" checked={hl.auto} onChange={(v) => updateSubtitle(cue.id, { highlight: { auto: v } })} />
          {!hl.auto && <ColorRow value={hl.color} onChange={(c) => updateSubtitle(cue.id, { highlight: { color: c } })} />}
          <PanelSection title="Style"><ChipGroup columns={3} value={hl.style} onChange={(v) => updateSubtitle(cue.id, { highlight: { style: v } })} items={HL_STYLES} /></PanelSection>
          <Slider label="Opacity" min={0} max={1} value={hl.opacity} onChange={(v) => updateSubtitle(cue.id, { highlight: { opacity: v } })} />
          <Slider label="Corner radius" min={0} max={20} step={1} value={hl.radius} onChange={(v) => updateSubtitle(cue.id, { highlight: { radius: v } })} format={(v) => `${Math.round(v)}px`} />
          <Slider label="Padding" min={0} max={24} step={1} value={hl.padding} onChange={(v) => updateSubtitle(cue.id, { highlight: { padding: v } })} format={(v) => `${Math.round(v)}px`} />
        </View>
        <Pressable onPress={() => { removeSubtitle(cue.id); setSel(null); }} style={styles.delBtn}>
          <Trash2 size={15} color="#FCA5A5" />
          <Text style={{ color: "#FCA5A5", fontWeight: "800", fontSize: 13 }}>Delete cue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onPress={() => { transcribeToSubtitles(p, useStore.getState()); toast("Transcribed the video — captions added", "ai"); }}
        style={styles.splitPrimary}
      >
        <AudioLines size={15} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Transcribe video → subtitles</Text>
      </Pressable>
      <Text style={{ color: colors.ink600, fontSize: 10, textAlign: "center", marginTop: 6 }}>Speech-to-text on the video's own audio</Text>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Pressable onPress={() => { generateSubtitlesFromScript(p, useStore.getState()); toast("Subtitles generated from the narration script", "ai"); }} style={[styles.halfBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
          <Wand2 size={14} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>From script</Text>
        </Pressable>
        <Pressable onPress={autoHighlightAll} style={[styles.halfBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
          <Palette size={14} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Auto-highlight</Text>
        </Pressable>
      </View>
      <PanelSection title="Background — all cues">
        <SubBgButtons
          onPick={(patch) => {
            commit("Subtitle background", (d) => d.subtitles.forEach((s) => Object.assign(s.highlight, patch)));
            toast("Applied to all subtitles", "success");
          }}
        />
      </PanelSection>
      <Pressable onPress={() => { const id = addSubtitle({ start: playhead, text: "New subtitle" }); setSel(id); }} style={styles.dashBtn}>
        <Plus size={14} color={colors.ink300} />
        <Text style={{ color: colors.ink300, fontWeight: "700", fontSize: 12 }}>Add cue at playhead ({fmtTime(playhead)})</Text>
      </Pressable>
      <PanelSection title={`${p.subtitles.length} cues`}>
        <View style={{ gap: 6 }}>
          {p.subtitles.slice().sort((a, b) => a.start - b.start).map((s) => (
            <Pressable key={s.id} onPress={() => { seek(s.start + 0.05); setSel(s.id); }} style={styles.cueRow}>
              <Text style={{ color: colors.ink400, fontSize: 10, fontWeight: "800" }}>{fmtTime(s.start)}</Text>
              <Text style={{ color: "#fff", fontSize: 12, flex: 1 }} numberOfLines={1}>{s.text}</Text>
              <Text style={{ color: colors.ink500, fontSize: 9 }}>{s.orientation[0].toUpperCase()}</Text>
            </Pressable>
          ))}
          {p.subtitles.length === 0 && <EmptyNote>No subtitles yet</EmptyNote>}
        </View>
      </PanelSection>
      {p.subtitles.length > 0 && (
        <Pressable onPress={() => { commit("Clear subtitles", (d) => (d.subtitles = [])); toast("All subtitles removed"); }} style={{ marginTop: 8, alignItems: "center", paddingVertical: 8 }}>
          <Text style={{ color: colors.ink400, fontSize: 11, fontWeight: "700" }}>Clear all</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------- CTA ----------------
const CTA_TEMPLATES = ["Start Free Trial", "Learn More", "Book a Demo", "Try This Feature", "Download Guide", "Visit Website", "Get Started"];
export function CTAPanel() {
  const { addEffect, editing, playhead, startPlacing, placePicker, toast } = useStore();
  const p = editing();
  const [tpl, setTpl] = useState("Start Free Trial");
  const [text, setText] = useState("Start Free Trial");
  const [url, setUrl] = useState("https://northwind.io/try");
  const [animation, setAnimation] = useState("Pop");
  const [bg, setBg] = useState("#5B5FD1");
  const [color, setColor] = useState("#FFFFFF");
  const [duration, setDuration] = useState(6);
  const [xy, setXy] = useState({ x: 0.5, y: 0.8 });
  return (
    <View>
      <PanelSection title="Template"><ChipGroup columns={2} value={tpl} onChange={(v) => { setTpl(v); setText(v); }} items={CTA_TEMPLATES} /></PanelSection>
      <PanelSection title="Button text"><TextInput value={text} onChangeText={setText} style={styles.input} placeholderTextColor={colors.ink500} /></PanelSection>
      <PanelSection title="Link URL"><TextInput value={url} onChangeText={setUrl} autoCapitalize="none" style={styles.input} placeholderTextColor={colors.ink500} /></PanelSection>
      <PanelSection title="Animation"><ChipGroup columns={3} value={animation} onChange={setAnimation} items={["Pop", "Slide", "Fade", "Bounce", "Pulse"]} /></PanelSection>
      <PanelSection title="Background"><ColorRow value={bg} onChange={setBg} /></PanelSection>
      <PanelSection title="Text colour"><ColorRow value={color} onChange={setColor} swatches={["#FFFFFF", "#0A0A0F", "#EDBF1B", "#3FD1CC"]} /></PanelSection>
      <Slider label="Duration" min={2} max={12} step={0.5} value={duration} onChange={setDuration} format={(v) => `${v.toFixed(1)}s`} />
      <PlaceOnVideoToggle label="Place on video" active={placePicker?.label === "the CTA"} onToggle={() => startPlacing("the CTA", (x, y) => setXy({ x, y }))} />
      <AddButton label="Add CTA layer" onPress={() => {
        const start = Math.min(playhead, Math.max(0, (p?.durationSec ?? 10) - duration));
        addEffect("cta", { text, template: tpl, url, animation, bg, color }, { start, duration, x: xy.x, y: xy.y, label: `CTA — ${text}` });
        toast("CTA layer added to timeline", "success");
      }} />
      <PanelSection title="CTAs on timeline"><EffectList types={["cta"]} /></PanelSection>
    </View>
  );
}

// ---------------- AI EDIT ----------------
export function AIEditPanel() {
  const s = useStore();
  const p = s.editing();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  const recs = useMemo(() => (p ? generateRecommendations(p, useStore.getState()) : []), [p?.id, p?.effects.length, p?.subtitles.length, p?.chapters.length, applied.length]);
  const visible = recs.filter((r) => !dismissed.includes(r.id));
  if (!p) return null;
  return (
    <View>
      <View style={styles.aiBanner}>
        <Sparkles size={14} color={colors.brand200} />
        <Text style={{ color: colors.brand200, fontSize: 12, flex: 1 }}>Claude Opus reviewed your timeline and found {visible.length} improvement{visible.length === 1 ? "" : "s"}.</Text>
      </View>
      {visible.map((r) => (
        <View key={r.id} style={styles.recCard}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>{r.title}</Text>
          <Text style={{ color: colors.ink400, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{r.detail}</Text>
          <View style={styles.previewTag}><Text style={{ color: colors.ink500, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>PREVIEW · {String(r.tool).toUpperCase()}</Text></View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pressable onPress={() => setDismissed((d) => [...d, r.id])} style={[styles.recBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
              <X size={13} color={colors.ink300} />
              <Text style={{ color: colors.ink300, fontWeight: "800", fontSize: 12 }}>Dismiss</Text>
            </Pressable>
            <Pressable onPress={() => { r.apply(); setApplied((a) => [...a, r.id]); setDismissed((d) => [...d, r.id]); s.toast("Applied — " + r.title, "success"); }} style={[styles.recBtn, { backgroundColor: colors.brand, flex: 1.4 }]}>
              <Check size={13} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Apply</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {visible.length === 0 && (
        <View style={{ alignItems: "center", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 18, paddingVertical: 32 }}>
          <Check size={26} color={colors.teal} />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13, marginTop: 8 }}>Looking sharp</Text>
          <Text style={{ color: colors.ink400, fontSize: 12, marginTop: 4 }}>No more suggestions right now.</Text>
        </View>
      )}
    </View>
  );
}

// ---------------- SCRIPT ----------------
const SCRIPT_MODES: ScriptMode[] = ["Rewrite", "Shorten", "Expand", "Professional", "Conversational", "Educational", "Persuasive"];
export function ScriptPanel() {
  const {
    editing, updateScript, setVoice, seek, toast, keys,
    setSegmentAudio, clearVoiceOver, addScriptPauses, emphasizeCaptions,
  } = useStore();
  const p = editing();
  const [busy, setBusy] = useState<string | null>(null);
  const [voBusy, setVoBusy] = useState<string | null>(null);
  if (!p) return null;
  const v = p.voice;
  const done = p.script.filter((seg) => seg.audioUri).length;
  // a step with a blank line has nothing to speak, so it cannot be generated
  const speakable = p.script.filter((seg) => seg.text.trim()).length;

  /** everything a Kokoro call needs on this device */
  const voiceOpts = (text: string) => ({
    text,
    voice: v.voice,
    language: v.language,
    speed: v.speed,
    endpoint: keys.kokoro,
  });

  /** speaks one step's line, measures it, and plays it back */
  const makeVoice = async (segId: string, text: string) => {
    if (!text.trim()) {
      toast("Write this step's line first — there is nothing to say yet", "error");
      return;
    }
    setVoBusy(segId);
    try {
      const clip = await synthesizeSpeech(voiceOpts(text));
      const dur = clip.duration || (await clipDuration(clip.uri, estimateSpeechSeconds(text, v.speed)));
      setSegmentAudio(segId, clip.uri, dur);
      void playClip(clip.uri);
    } catch (e: any) {
      toast(e?.message ?? "Voice-over failed", "error");
    } finally {
      setVoBusy(null);
    }
  };

  const makeAllVoices = async () => {
    if (!speakable) {
      toast(
        p.script.length
          ? "Write a line in a step first — every line is still blank"
          : "This project has no steps to narrate yet",
        "error",
      );
      return;
    }
    let made = 0;
    for (const seg of p.script) {
      if (!seg.text.trim()) continue;
      setVoBusy(seg.id);
      try {
        const clip = await synthesizeSpeech(voiceOpts(seg.text));
        const dur = clip.duration || (await clipDuration(clip.uri, estimateSpeechSeconds(seg.text, v.speed)));
        setSegmentAudio(seg.id, clip.uri, dur);
        made += 1;
      } catch (e: any) {
        toast(e?.message ?? "Voice-over failed", "error");
        break;
      }
    }
    setVoBusy(null);
    if (made) toast(`Voice-over ready for ${made} step${made === 1 ? "" : "s"} — press play`, "ai");
  };
  const run = (segId: string, text: string, mode: ScriptMode) => {
    setBusy(segId + mode);
    setTimeout(() => { updateScript(segId, rewriteScript(text, mode)); setBusy(null); toast(`${mode} applied`, "ai"); }, 500);
  };
  return (
    <View>
      {keys.kokoro ? (
        <View style={{ borderWidth: 1, borderColor: "rgba(91,95,209,0.25)", backgroundColor: "rgba(91,95,209,0.1)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 }}>
          <Text style={{ color: colors.brand200, fontSize: 11, lineHeight: 16 }}>
            Voice-over runs on your Kokoro server — Kokoro-82M voices, no per-word cost.
          </Text>
        </View>
      ) : (
        <View style={{ borderWidth: 1, borderColor: "rgba(237,191,27,0.3)", backgroundColor: "rgba(237,191,27,0.1)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 }}>
          <Text style={{ color: "#EDBF1B", fontSize: 11, lineHeight: 16 }}>
            Add a Kokoro endpoint in Profile to generate voice-over on this device ({KOKORO_DEFAULT_ENDPOINT}). Kokoro-82M
            needs an ONNX runtime, which a phone build does not have.
          </Text>
        </View>
      )}
      <Pressable onPress={makeAllVoices} disabled={!!voBusy || !speakable} style={[styles.splitPrimary, { marginBottom: 12 }, (!!voBusy || !speakable) && { opacity: 0.5 }]}>
        <Volume2 size={15} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
          {voBusy ? "Generating…" : `Generate voice-over · ${speakable} step${speakable === 1 ? "" : "s"}`}
        </Text>
      </Pressable>
      <View style={styles.voNote}>
        <Volume2 size={12} color={done ? colors.brand200 : colors.ink500} />
        <Text style={{ color: colors.ink400, fontSize: 11, flex: 1 }}>
          {done
            ? `${done} of ${p.script.length} steps have voice-over — it plays with the preview${v.muted ? " (muted)" : ""}.`
            : speakable
              ? "Nothing generated yet. Generated lines play with the preview, in step."
              : p.script.length
                ? "Every step's line is blank. Write one below and the voice has something to read."
                : "No steps to narrate yet — record or re-analyse this project first."}
        </Text>
      </View>

      {p.script.map((seg) => {
        const chapter = p.chapters.find((c) => c.id === seg.chapterId);
        const over = seg.audioDur && chapter ? seg.audioDur - chapter.duration : 0;
        return (
          <View key={seg.id} style={styles.scriptCard}>
            <Pressable onPress={() => seek(seg.start + 0.05)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <View style={{ backgroundColor: "rgba(91,95,209,0.2)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: colors.brand200, fontSize: 10, fontWeight: "800" }}>{chapter?.name ?? "Segment"}</Text>
              </View>
              <Text style={{ color: colors.ink500, fontSize: 10 }}>{fmtTime(seg.start)}</Text>
              {seg.audioDur ? (
                <View style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: colors.ink300, fontSize: 10, fontWeight: "700" }}>{seg.audioDur.toFixed(1)}s read</Text>
                </View>
              ) : null}
            </Pressable>
            <TextInput value={seg.text} onChangeText={(t) => updateScript(seg.id, t)} multiline style={styles.scriptArea} />
            {over > 0.3 ? (
              <Text style={{ color: colors.gold, fontSize: 10, fontWeight: "700", marginTop: 6 }}>
                Runs {over.toFixed(1)}s past this step — shorten the line or lengthen the step.
              </Text>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
              <Pressable
                onPress={() => (seg.audioUri ? void playClip(seg.audioUri) : makeVoice(seg.id, seg.text))}
                disabled={voBusy === seg.id}
                style={[styles.modeChip, { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(91,95,209,0.2)" }, voBusy === seg.id && { opacity: 0.4 }]}
              >
                {seg.audioUri ? <Play size={11} color={colors.brand200} /> : <Volume2 size={11} color={colors.brand200} />}
                <Text style={{ color: colors.brand200, fontSize: 11, fontWeight: "700" }}>
                  {voBusy === seg.id ? "…" : seg.audioUri ? "Play" : "Voice"}
                </Text>
              </Pressable>
              {seg.audioUri ? (
                <Pressable
                  onPress={() => makeVoice(seg.id, seg.text)}
                  disabled={voBusy === seg.id}
                  style={[styles.modeChip, voBusy === seg.id && { opacity: 0.4 }]}
                >
                  <Text style={{ color: colors.ink200, fontSize: 11, fontWeight: "700" }}>Redo</Text>
                </Pressable>
              ) : null}
              {SCRIPT_MODES.map((m) => (
                <Pressable key={m} disabled={!!busy} onPress={() => run(seg.id, seg.text, m)} style={styles.modeChip}>
                  <Text style={{ color: colors.ink200, fontSize: 11, fontWeight: "700" }}>{busy === seg.id + m ? "…" : m}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        );
      })}
      <PanelSection title="AI voice">
        <Segmented<VoiceGender>
          value={genderOf(v.voice)}
          onChange={(g) => setVoice({ voice: swapGender(v.voice, g) })}
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
        />
        <View style={{ height: 10 }} />
        <ChipGroup
          columns={2}
          value={v.voice}
          onChange={(x) => setVoice({ voice: x })}
          items={voicesOf(genderOf(v.voice)).map((x) => x.name)}
        />
        <Text style={{ color: colors.ink500, fontSize: 11, marginTop: 8 }}>
          {blurbFor(v.voice)} · speaks every step in this project
        </Text>
      </PanelSection>
      <PanelSection title="Language"><ChipGroup columns={3} value={v.language} onChange={(x) => setVoice({ language: x })} items={["English (US)", "English (UK)", "Spanish", "German", "French", "Japanese"]} /></PanelSection>
      <PanelSection title="Tone">
        <Segmented value={v.tone} onChange={(x) => setVoice({ tone: x })} options={[{ value: "Conversational", label: "Casual" }, { value: "Professional", label: "Pro" }, { value: "Educational", label: "Teach" }, { value: "Persuasive", label: "Sell" }]} />
      </PanelSection>
      <Slider label="Speed" min={0.7} max={1.4} step={0.05} value={v.speed} onChange={(x) => setVoice({ speed: x })} format={(x) => `${x.toFixed(2)}×`} accent="#3FD1CC" />
      <PanelSection title="Playback">
        <Toggle
          label="Mute voice-over"
          checked={!!v.muted}
          onChange={(x) => setVoice({ muted: x })}
          hint="Silences it in the preview without deleting the clips"
        />
        <Slider
          label="Voice-over volume"
          min={0}
          max={1}
          step={0.05}
          value={v.volume ?? 1}
          onChange={(x) => setVoice({ volume: x })}
          format={(x) => `${Math.round(x * 100)}%`}
          accent="#5B5FD1"
        />
      </PanelSection>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <Pressable onPress={addScriptPauses} style={styles.halfBtnFlat}><Text style={styles.halfBtnText}>Add pauses</Text></Pressable>
        <Pressable onPress={emphasizeCaptions} style={styles.halfBtnFlat}><Text style={styles.halfBtnText}>Emphasise captions</Text></Pressable>
      </View>
      <AddButton
        label={voBusy ? "Generating…" : `Regenerate voice-over in ${v.voice}`}
        onPress={makeAllVoices}
        disabled={!!voBusy || !speakable}
      />
      {done > 0 ? (
        <Pressable onPress={clearVoiceOver} style={styles.newBtn}>
          <Text style={styles.newBtnText}>Clear voice-over ({done})</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------- ASSETS ----------------
import { assetLibrary } from "@/data/assets";
export function AssetsPanel() {
  const { addEffect, playhead, toast } = useStore();
  const [group, setGroup] = useState(assetLibrary[0].id);
  const active = assetLibrary.find((g) => g.id === group)!;
  const insert = (label: string, glyph: string) => {
    addEffect("text", { text: glyph, orientation: "horizontal", position: "middle", animation: "Pop", size: 44 }, { start: playhead, duration: 3, x: 0.5, y: 0.5, label: `Asset — ${label}` });
    toast(`${label} added to the canvas`, "success");
  };
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        {assetLibrary.map((g) => (
          <Pressable key={g.id} onPress={() => setGroup(g.id)} style={[styles.assetTab, group === g.id ? { borderColor: colors.brand, backgroundColor: "rgba(91,95,209,0.2)" } : { borderColor: "rgba(255,255,255,0.08)" }]}>
            <Text style={{ color: group === g.id ? "#fff" : colors.ink400, fontSize: 12, fontWeight: "700" }}>{g.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <PanelSection title={active.label}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {active.items.map((it) => (
            <Pressable key={it.id} onPress={() => insert(it.label, it.glyph)} style={styles.assetItem}>
              <Text style={{ fontSize: 22 }}>{it.glyph}</Text>
              <Text style={{ color: colors.ink400, fontSize: 9 }}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      </PanelSection>
      <View style={styles.note}><Text style={{ color: colors.ink400, fontSize: 11, lineHeight: 16 }}>Assets drop onto the timeline at the playhead as their own layer.</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { marginTop: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.03)", padding: 12, alignItems: "center" },
  readoutKick: { color: colors.ink400, fontSize: 11 },
  readoutBig: { color: "#fff", fontSize: 20, fontWeight: "900" },
  readoutSub: { color: colors.ink500, fontSize: 10 },
  trimRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  stepBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  wideBtn: { marginTop: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", paddingVertical: 12, alignItems: "center" },
  note: { marginTop: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 12, paddingVertical: 8 },
  voNote: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 12, paddingVertical: 8 },
  thirdBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  newBtn: { marginTop: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  newBtnText: { color: colors.ink300, fontSize: 12, fontWeight: "700" },
  baToggle: { marginBottom: 12, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", paddingVertical: 11, alignItems: "center" },
  textArea: { minHeight: 60, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.ink800, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#fff", textAlignVertical: "top" },
  input: { borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.ink800, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#fff" },
  hlBox: { marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", padding: 12 },
  delBtn: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(229,72,77,0.15)", borderRadius: 18, paddingVertical: 12 },
  halfBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 18, paddingVertical: 10 },
  dashBtn: { marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderStyle: "dashed", borderRadius: 18, paddingVertical: 10 },
  cueRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  aiBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(91,95,209,0.1)", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  recCard: { marginBottom: 10, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", padding: 14 },
  previewTag: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  recBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 12, paddingVertical: 8 },
  scriptCard: { marginBottom: 12, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", padding: 12 },
  scriptArea: { minHeight: 68, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: colors.ink800, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#fff", textAlignVertical: "top" },
  modeChip: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  halfBtnFlat: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  halfBtnText: { color: colors.ink200, fontSize: 12, fontWeight: "700" },
  tpChip: { borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  assetTab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.03)" },
  assetItem: { width: "22%", aspectRatio: 1, alignItems: "center", justifyContent: "center", gap: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12 },
  quickZoomBtn: { flex: 1, borderWidth: 1, borderColor: "rgba(63,209,204,0.3)", backgroundColor: "rgba(63,209,204,0.1)", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  splitPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 18, backgroundColor: colors.brand, paddingVertical: 13 },
  quickZoomText: { color: "#8AE4E1", fontSize: 12, fontWeight: "800" },
  subBgBtn: { width: "31%", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  subBgText: { color: colors.ink200, fontSize: 11, fontWeight: "800" },
});
