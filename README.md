# Screvo — Mobile (Expo SDK 57)

Screvo turns a screen recording into a polished 9:16 product demo, tutorial or
SOP: it finds the steps, writes and speaks the narration, and cuts the footage
down to the parts worth showing.

A full **native** React Native port of Screvo, built with **Expo SDK 57**
(`expo@57.0.22`, React Native 0.86.3, React 19.2, Reanimated 4.5, expo-router 57).

Everything the app needs lives in this folder. Domain logic mirrors the web
builds of Screvo: the Zustand store,
`lib/opus.ts` (the Claude Opus reasoning layer), types, and demo data are ported
almost verbatim; every screen and editor component is rebuilt on native
primitives (`View` / `Text` / `Pressable`, Reanimated, gesture-handler,
react-native-svg, AsyncStorage).

## Run

```bash
npm install            # already done if node_modules/ exists
```

### Expo Go (simplest — needs Expo Go on SDK 57)

```bash
npx expo start
```

Then press `a` (Android) / `i` (iOS), or scan the QR from the Expo Go app.

> Ask Screvo's microphone permission is a **native** permission. It works in
> Expo Go, but if you hit a native-module error, use the dev-client path below.

### Android dev client (USB debugging on, device authorised)

```bash
npx expo run:android
```

Builds a dev client, installs it to the connected device over adb, and starts
Metro. Needs Android Studio / the Android SDK + a JDK on your machine.

### iOS dev client (Mac + Xcode, device trusted)

```bash
npx expo run:ios --device
```

## Type-check

```bash
npx tsc --noEmit      # clean
npx expo-doctor
```

## Structure

```
Screvo-Mobile/
  app/                       expo-router routes
    _layout.tsx              providers (gesture-handler root, safe-area, Stack)
    (tabs)/                  Home · Projects · Create · Templates · Profile
    record.tsx               screen recording + touchpoint capture
    processing/[id].tsx      10-stage AI pipeline animation
    result/[id].tsx          generated 9:16 video
    editor/[id].tsx          the editor
    export/[id].tsx          export / render / share
  src/
    store/useStore.ts        full domain model + every edit op (AsyncStorage persist)
    lib/opus.ts              Claude Opus reasoning layer (deterministic stand-in)
    lib/{types,format}.ts
    data/{frames,demoProjects,templates,assets}.ts
    components/
      ui/                    Screen, Sheet, Button, Controls, Misc, Motion
      editor/                VideoStage, PlaybackControls, Timeline,
                             EditingToolbar, AskScrevo, PanelHost
      editor/panels/all.tsx  the 17 tool panels
```

## What works

Bottom-nav (Create emphasised), recording with per-touch ripples + timestamps,
the AI pipeline, a portrait 9:16 `VideoStage` that composits zoom / tint /
touchpoint FX / subtitles / text / CTA / transitions off store state, a
pinch-zoom multi-track timeline with a **scissor split** (flash confirm), quick
zoom presets (In · Out · In-&-Out) and subtitle background presets (Plain · Dark
· Light · Dark smoky · Light smoky), all 20 toolbar tools opening
real bottom-sheet panels, **Ask Screvo** voice/text NL commands → edit ops →
Undo / Keep, and the export flow. The flagship demo project
**"How to Create a Customer Workspace"** is seeded on first launch.
