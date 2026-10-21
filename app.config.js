/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "Screvo",
  slug: "screvo",
  version: "1.0.0",
  scheme: "screvo",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  backgroundColor: "#0A0A0F",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "app.screvo.mobile",
  },
  android: {
    package: "app.screvo.mobile",
    // in-app screen recording: MediaProjection runs inside a foreground service,
    // and from Android 14 that service must declare the mediaProjection type
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
      "android.permission.POST_NOTIFICATIONS",
    ],
  },
  plugins: [
    "expo-router",
    // expo-splash-screen is left out on purpose: with no logo asset it emits a
    // reference to @drawable/splashscreen_logo that nothing generates, and
    // resource linking fails. The dark splash comes from backgroundColor above.
    [
      "expo-image-picker",
      {
        photosPermission:
          "Screvo uses your photos and videos so you can turn an existing recording into a polished demo.",
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission:
          "Screvo uses your microphone for Ask Screvo voice commands — including a connected wired or Bluetooth headset.",
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
    tsconfigPaths: true,
  },
};
