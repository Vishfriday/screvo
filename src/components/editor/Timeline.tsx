import React, { useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Copy, Trash2, ZoomIn, ZoomOut } from "lucide-react-native";
import { useStore } from "@/store/useStore";
import type { TrackKind } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { colors } from "@/theme/tokens";

const GUTTER = 58;
const TRACK_H = 34;
const TRACKS: { key: string; label: string; color: string }[] = [
  { key: "video", label: "Video", color: "#5B5FD1" },
  { key: "audio", label: "Audio", color: "#3FD1CC" },
  { key: "subtitles", label: "Subs", color: "#EDBF1B" },
  { key: "effects", label: "FX", color: "#FD9D43" },
  { key: "animations", label: "Anim", color: "#7C8CF8" },
];

export function Timeline() {
  const {
    editing, playhead, seek, timelinePxPerSec, setTimelineZoom,
    selectedClipId, selectClip, setSelectedTrack,
    deleteClip, splitFlashAt,
  } = useStore();
  const p = editing();
  const pxps = timelinePxPerSec;
  const dur = p?.durationSec ?? 1;
  const width = dur * pxps;
  const pinchBase = useRef(pxps);

  if (!p) return null;

  const scrubTo = (x: number) => seek(Math.max(0, Math.min(dur, x / pxps)));

  const pan = Gesture.Pan()
    .onBegin((e) => runOnJS(scrubTo)(e.x))
    .onUpdate((e) => runOnJS(scrubTo)(e.x));

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      "worklet";
      runOnJS(setPinchBase)();
    })
    .onUpdate((e) => {
      "worklet";
      runOnJS(applyZoom)(e.scale);
    });

  function setPinchBase() {
    pinchBase.current = pxps;
  }
  function applyZoom(scale: number) {
    setTimelineZoom(pinchBase.current * scale);
  }

  const laneBlocks = (key: string): { id: string; start: number; duration: number; label: string; color: string }[] => {
    if (key === "video" || key === "audio")
      return p.clips.filter((c) => c.track === key).map((c) => ({ id: c.id, start: c.start, duration: c.duration, label: c.label, color: c.color || "#5B5FD1" }));
    if (key === "subtitles")
      return p.subtitles.map((s) => ({ id: s.id, start: s.start, duration: s.duration, label: s.text, color: "#EDBF1B" }));
    if (key === "effects")
      return p.effects
        .filter((e) => ["zoom", "parallax", "touchpoint", "tint", "effect"].includes(e.type))
        .map((e) => ({ id: e.id, start: e.start, duration: e.duration, label: e.label, color: "#FD9D43" }));
    return p.effects
      .filter((e) => ["transition", "text", "cta", "animation"].includes(e.type))
      .map((e) => ({ id: e.id, start: e.start, duration: Math.max(e.duration, 0.4), label: e.label, color: "#7C8CF8" }));
  };

  const selected = p.clips.find((c) => c.id === selectedClipId);
  const ticks = Array.from({ length: Math.ceil(dur / 5) + 1 }, (_, i) => i * 5);

  return (
    <View style={styles.wrap}>
      {/* toolbar */}
      <View style={styles.toolbar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {selected && (
            <>
              <Pressable onPress={() => deleteClip(selected.id)} style={[styles.miniBtn, { backgroundColor: "rgba(229,72,77,0.15)" }]}>
                <Trash2 size={15} color="#FCA5A5" />
              </Pressable>
            </>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable onPress={() => setTimelineZoom(pxps / 1.4)} style={styles.zoomBtn}>
            <ZoomOut size={14} color={colors.ink300} />
          </Pressable>
          <Text style={{ color: colors.ink500, fontSize: 10, width: 42, textAlign: "center" }}>{Math.round(pxps)}px/s</Text>
          <Pressable onPress={() => setTimelineZoom(pxps * 1.4)} style={styles.zoomBtn}>
            <ZoomIn size={14} color={colors.ink300} />
          </Pressable>
        </View>
      </View>

      <GestureDetector gesture={pinch}>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled>
            <View style={{ width: width + GUTTER }}>
              {/* ruler + scrub */}
              <View style={{ height: 24, marginLeft: GUTTER }}>
                <GestureDetector gesture={pan}>
                  <View style={{ position: "absolute", left: 0, top: 0, width, height: 24 }}>
                    {ticks.map((sec) => (
                      <View key={sec} style={{ position: "absolute", left: sec * pxps, top: 0 }}>
                        <View style={{ width: 1, height: 8, backgroundColor: "rgba(255,255,255,0.15)" }} />
                        <Text style={{ color: colors.ink500, fontSize: 9, marginTop: 2 }}>{fmtTime(sec)}</Text>
                      </View>
                    ))}
                  </View>
                </GestureDetector>
              </View>

              {/* tracks */}
              {TRACKS.map((tr) => (
                <View key={tr.key} style={styles.track}>
                  <View style={styles.trackLabel}>
                    <Text style={{ color: tr.color, fontSize: 10, fontWeight: "800" }}>{tr.label}</Text>
                  </View>
                  <View style={{ position: "absolute", left: GUTTER, width, height: TRACK_H }}>
                    {laneBlocks(tr.key).map((b) => {
                      const isClip = tr.key === "video" || tr.key === "audio";
                      const isSel = b.id === selectedClipId;
                      return (
                        <Pressable
                          key={b.id}
                          onPress={() => {
                            if (isClip) {
                              selectClip(isSel ? null : b.id);
                              setSelectedTrack(tr.key as TrackKind);
                            }
                          }}
                          style={[
                            styles.block,
                            {
                              left: b.start * pxps,
                              width: Math.max(6, b.duration * pxps - 2),
                              backgroundColor: isClip ? b.color : b.color + "44",
                              borderLeftWidth: isClip ? 0 : 2,
                              borderLeftColor: b.color,
                              borderColor: isSel ? "#fff" : "rgba(0,0,0,0.2)",
                              borderWidth: isSel ? 2 : 1,
                            },
                          ]}
                        >
                          <Text style={styles.blockText} numberOfLines={1}>
                            {b.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* playhead */}
              <View pointerEvents="none" style={{ position: "absolute", left: GUTTER + playhead * pxps - 1, top: 0, width: 2, height: 24 + TRACK_H * TRACKS.length, backgroundColor: "#fff" }}>
                <View style={{ position: "absolute", left: -5, top: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff" }} />
              </View>
              {splitFlashAt != null && (
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", left: GUTTER + splitFlashAt * pxps - 1.5, top: 0, width: 3, height: 24 + TRACK_H * TRACKS.length, backgroundColor: colors.teal }}
                />
              )}

            </View>
          </ScrollView>
        </View>
      </GestureDetector>

      <Text style={styles.hint}>Drag the ruler to scrub · tap a clip to select · pinch to zoom</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.ink900, overflow: "hidden" },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", paddingHorizontal: 12, paddingVertical: 8 },
  miniBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  zoomBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  track: { height: TRACK_H, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)", justifyContent: "center" },
  trackLabel: { position: "absolute", left: 0, width: GUTTER, height: TRACK_H, justifyContent: "center", paddingLeft: 12, backgroundColor: colors.ink900, zIndex: 5 },
  block: { position: "absolute", top: 3, height: TRACK_H - 6, borderRadius: 6, paddingHorizontal: 6, justifyContent: "center", overflow: "hidden" },
  blockText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  hint: { color: colors.ink600, fontSize: 10, textAlign: "center", paddingVertical: 6 },
});
