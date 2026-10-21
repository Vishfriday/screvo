import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { useStore } from "@/store/useStore";
import { ToastHost } from "@/components/ui/Misc";
import { colors } from "@/theme/tokens";

export default function RootLayout() {
  const ensureSeed = useStore((s) => s.ensureSeed);
  useEffect(() => {
    ensureSeed();
  }, [ensureSeed]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ink950 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: colors.ink950 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.ink950 },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="record" options={{ animation: "slide_from_bottom" }} />
            <Stack.Screen name="processing/[id]" options={{ animation: "fade" }} />
            <Stack.Screen name="result/[id]" options={{ animation: "fade" }} />
            <Stack.Screen name="editor/[id]" options={{ animation: "slide_from_bottom" }} />
            <Stack.Screen name="export/[id]" options={{ animation: "slide_from_bottom" }} />
          </Stack>
          <ToastHost />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
