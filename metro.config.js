// Learn more: https://docs.expo.dev/guides/customizing-metro/
// The "@/*" -> "src/*" alias is handled by `experiments.tsconfigPaths` in app.json.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
