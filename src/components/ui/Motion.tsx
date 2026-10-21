import React from "react";
import { Pressable, StyleProp, ViewStyle, PressableProps, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
  FadeIn,
} from "react-native-reanimated";

export { FadeIn, Animated };

/** Pressable that scales down slightly while pressed. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.96,
  haptic,
  ...rest
}: PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 400 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 350 });
        rest.onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[aStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Dissolve in on mount. */
export function Appear({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(260)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Expanding ring, repeats forever — used for touch ripples / recording pulse. */
export function PulseRing({
  size = 40,
  color = "#3FD1CC",
  delay = 0,
  style,
}: {
  size?: number;
  color?: string;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const p = useSharedValue(0);
  React.useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }), -1, false));
  }, []);
  const aStyle = useAnimatedStyle(() => ({
    opacity: (1 - p.value) * 0.6,
    transform: [{ scale: 0.4 + p.value * 1.8 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color },
        aStyle,
        style,
      ]}
    />
  );
}

/** One-shot ripple (grows then fades once). */
export function RippleOnce({ size = 54, color = "#3FD1CC" }: { size?: number; color?: string }) {
  const p = useSharedValue(0);
  React.useEffect(() => {
    p.value = withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) });
  }, []);
  const aStyle = useAnimatedStyle(() => ({
    opacity: (1 - p.value) * 0.7,
    transform: [{ scale: p.value * 2.6 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        aStyle,
      ]}
    />
  );
}

/** Infinite spin wrapper. */
export function Spin({ children, duration = 3000 }: { children: React.ReactNode; duration?: number }) {
  const r = useSharedValue(0);
  React.useEffect(() => {
    r.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, []);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }] }));
  return <Animated.View style={aStyle}>{children}</Animated.View>;
}

export const AView = Animated.View;
export { View };
