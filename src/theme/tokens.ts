// Screvo design tokens — the single source of truth for the mobile UI.

export const colors = {
  brand: "#5B5FD1",
  brand600: "#4044B4",
  brand200: "#B9BBEE",
  teal: "#3FD1CC",
  tealSoft: "#8AE4E1",
  amber: "#FD9D43",
  gold: "#EDBF1B",

  bg: "#08080C",
  ink950: "#0A0A0F",
  ink900: "#0E0E15",
  ink850: "#13131C",
  ink800: "#191924",
  ink750: "#20202E",
  ink700: "#282838",
  ink600: "#3A3A50",
  ink500: "#565670",
  ink400: "#8A8AA3",
  ink300: "#B4B4C8",
  ink200: "#D6D6E2",
  white: "#F4F4F8",

  hairline: "rgba(255,255,255,0.07)",
  card: "#13131C",

  danger: "#E5484D",
  success: "#3DD68C",
};

// Cycles across the five canonical chapters.
export const chapterAccents = ["#5B5FD1", "#3FD1CC", "#FD9D43", "#EDBF1B", "#7C8CF8"];

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
};

export const space = (n: number) => n * 4;

export const font = {
  // System font stack — no custom font files required.
  regular: "System",
};

export const spring = {
  soft: { damping: 20, stiffness: 200, mass: 0.9 },
  snappy: { damping: 22, stiffness: 380, mass: 0.8 },
};
