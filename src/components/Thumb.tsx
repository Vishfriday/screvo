import React, { useState } from "react";
import { View, StyleProp, ViewStyle, LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Frame, BASE_W, BASE_H } from "@/data/frames";

/**
 * A thumbnail of a screen-recording frame. The Frame is authored at a fixed
 * logical size and scaled with a transform so typography stays in proportion.
 * default: a 9:16 box (caller sets width). crop: fills the caller's box.
 */
export function Thumb({
  frame,
  style,
  radius = 18,
  crop,
}: {
  frame: number;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  crop?: boolean;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const scale = box.w
    ? crop
      ? Math.max(box.w / BASE_W, box.h / BASE_H)
      : box.w / BASE_W
    : 0.25;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[
        { overflow: "hidden", borderRadius: radius, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
        !crop && { aspectRatio: 9 / 16 },
        style,
      ]}
    >
      <View style={{ width: BASE_W, height: BASE_H, transform: [{ scale }] }}>
        <Frame index={frame} />
      </View>
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.45)"]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "50%" }}
        pointerEvents="none"
      />
    </View>
  );
}
