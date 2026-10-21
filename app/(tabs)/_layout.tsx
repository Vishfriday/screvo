import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Home, FolderClosed, Plus, LayoutGrid, User } from "lucide-react-native";
import { colors } from "@/theme/tokens";

const ICONS: Record<string, any> = { index: Home, projects: FolderClosed, create: Plus, templates: LayoutGrid, profile: User };
const LABELS: Record<string, string> = { index: "Home", projects: "Projects", create: "Create", templates: "Templates", profile: "Profile" };

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <BlurView intensity={30} tint="dark" style={[styles.bar, { paddingBottom: insets.bottom || 10 }]}>
      <View style={styles.row}>
        {state.routes.map((route: any, index: number) => {
          const focused = state.index === index;
          const Icon = ICONS[route.name] ?? Home;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          if (route.name === "create") {
            return (
              <Pressable key={route.key} onPress={onPress} style={styles.createWrap}>
                <LinearGradient colors={["#5B5FD1", "#7376DB", "#3FD1CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createBtn}>
                  <Plus size={26} color="#fff" strokeWidth={2.6} />
                </LinearGradient>
                <Text style={[styles.label, { color: colors.brand200 }]}>Create</Text>
              </Pressable>
            );
          }
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item}>
              <Icon size={22} color={focused ? "#fff" : colors.ink500} strokeWidth={focused ? 2.6 : 2} />
              <Text style={[styles.label, { color: focused ? "#fff" : colors.ink500 }]}>{LABELS[route.name]}</Text>
            </Pressable>
          );
        })}
      </View>
    </BlurView>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ink950 } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="projects" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="templates" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(14,14,21,0.8)",
    paddingTop: 8,
  },
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", paddingHorizontal: 8 },
  item: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 6 },
  label: { fontSize: 10, fontWeight: "700" },
  createWrap: { flex: 1, alignItems: "center", marginTop: -24 },
  createBtn: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#5B5FD1",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
