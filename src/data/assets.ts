export interface AssetGroup {
  id: string;
  label: string;
  items: { id: string; label: string; glyph: string }[];
}

export const assetLibrary: AssetGroup[] = [
  {
    id: "icons",
    label: "Icons",
    items: [
      { id: "i1", label: "Check", glyph: "✓" },
      { id: "i2", label: "Star", glyph: "★" },
      { id: "i3", label: "Bolt", glyph: "⚡" },
      { id: "i4", label: "Heart", glyph: "♥" },
      { id: "i5", label: "Bell", glyph: "🔔" },
      { id: "i6", label: "Lock", glyph: "🔒" },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    items: [
      { id: "s1", label: "Circle", glyph: "●" },
      { id: "s2", label: "Square", glyph: "■" },
      { id: "s3", label: "Triangle", glyph: "▲" },
      { id: "s4", label: "Blob", glyph: "❁" },
    ],
  },
  {
    id: "arrows",
    label: "Arrows",
    items: [
      { id: "a1", label: "Up", glyph: "↑" },
      { id: "a2", label: "Curved", glyph: "↝" },
      { id: "a3", label: "Point", glyph: "➤" },
      { id: "a4", label: "Hand", glyph: "☞" },
    ],
  },
  {
    id: "callouts",
    label: "Callouts",
    items: [
      { id: "c1", label: "Speech", glyph: "💬" },
      { id: "c2", label: "Badge", glyph: "❏" },
      { id: "c3", label: "Tag", glyph: "🏷" },
      { id: "c4", label: "Pin", glyph: "📍" },
    ],
  },
  {
    id: "stickers",
    label: "Stickers",
    items: [
      { id: "st1", label: "New", glyph: "🆕" },
      { id: "st2", label: "Fire", glyph: "🔥" },
      { id: "st3", label: "Sparkle", glyph: "✨" },
      { id: "st4", label: "100", glyph: "💯" },
    ],
  },
  {
    id: "logos",
    label: "Logos",
    items: [
      { id: "l1", label: "Screvo mark", glyph: "S" },
      { id: "l2", label: "Northwind", glyph: "N" },
      { id: "l3", label: "Acme", glyph: "A" },
    ],
  },
  {
    id: "gifs",
    label: "GIFs",
    items: [
      { id: "g1", label: "Confetti", glyph: "🎉" },
      { id: "g2", label: "Loading", glyph: "◴" },
      { id: "g3", label: "Wave", glyph: "👋" },
    ],
  },
];
