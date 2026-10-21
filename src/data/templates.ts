export interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  durationSec: number;
  frame: number;
  chapters: { name: string; duration: number }[];
  accent: string;
}

const std = (a: number, b: number, c: number, d: number, e: number) => [
  { name: "Hook", duration: a },
  { name: "Solution Overview", duration: b },
  { name: "Feature Walkthrough", duration: c },
  { name: "Results & Value", duration: d },
  { name: "Call to Action", duration: e },
];

export const templateCategories = [
  "Product Demo",
  "Feature Announcement",
  "How-To",
  "SOP",
  "Employee Training",
  "Onboarding",
  "Customer Education",
  "Marketing Demo",
  "Sales Demo",
  "Social Media",
];

export const templates: Template[] = [
  {
    id: "tpl_product_demo",
    name: "Product Demo — Core Loop",
    category: "Product Demo",
    description: "Show the one workflow that sells the product. Problem, three steps, payoff, trial CTA.",
    durationSec: 90,
    frame: 2,
    chapters: std(10, 16, 44, 12, 8),
    accent: "#5B5FD1",
  },
  {
    id: "tpl_feature",
    name: "Feature Announcement",
    category: "Feature Announcement",
    description: "Tease, reveal, show it working, tell them where to find it. Perfect for What's New.",
    durationSec: 45,
    frame: 4,
    chapters: std(6, 8, 20, 6, 5),
    accent: "#3FD1CC",
  },
  {
    id: "tpl_howto",
    name: "How-To — Single Task",
    category: "How-To",
    description: "One task, start to finish, no detours. Numbered steps, touchpoint zooms, recap.",
    durationSec: 75,
    frame: 3,
    chapters: std(8, 10, 42, 8, 7),
    accent: "#FD9D43",
  },
  {
    id: "tpl_sop",
    name: "SOP — Compliance Ready",
    category: "SOP",
    description: "Formal tone, every step captioned, exports cleanly to a step-by-step PDF.",
    durationSec: 110,
    frame: 5,
    chapters: std(8, 14, 68, 12, 8),
    accent: "#EDBF1B",
  },
  {
    id: "tpl_training",
    name: "Employee Training Module",
    category: "Employee Training",
    description: "Teach a process to a whole team. Chapters map to a quiz. Slower pacing.",
    durationSec: 150,
    frame: 7,
    chapters: std(12, 20, 90, 16, 12),
    accent: "#7C8CF8",
  },
  {
    id: "tpl_onboarding",
    name: "New Hire Onboarding",
    category: "Onboarding",
    description: "Day-one setup walkthrough. Warm, encouraging, ends with 'you're ready'.",
    durationSec: 130,
    frame: 0,
    chapters: std(12, 18, 76, 14, 10),
    accent: "#3FD1CC",
  },
  {
    id: "tpl_customer_ed",
    name: "Customer Education",
    category: "Customer Education",
    description: "Help an existing customer get more from a feature they already have.",
    durationSec: 95,
    frame: 6,
    chapters: std(10, 15, 50, 12, 8),
    accent: "#5B5FD1",
  },
  {
    id: "tpl_marketing",
    name: "Marketing Demo — Punchy",
    category: "Marketing Demo",
    description: "High energy, kinetic text, whip cuts. Built for a feed. Sound-off friendly.",
    durationSec: 40,
    frame: 1,
    chapters: std(5, 7, 18, 6, 4),
    accent: "#FD9D43",
  },
  {
    id: "tpl_sales",
    name: "Sales Demo — Leave-Behind",
    category: "Sales Demo",
    description: "Personalised walkthrough to send after the call. Names the prospect's use case.",
    durationSec: 120,
    frame: 2,
    chapters: std(10, 20, 66, 16, 8),
    accent: "#EDBF1B",
  },
  {
    id: "tpl_social",
    name: "Social — 15 Second Tip",
    category: "Social Media",
    description: "One tip, one screen, one CTA. Vertical, captioned, loops cleanly.",
    durationSec: 15,
    frame: 4,
    chapters: [
      { name: "Hook", duration: 3 },
      { name: "The Tip", duration: 8 },
      { name: "Call to Action", duration: 4 },
    ],
    accent: "#3FD1CC",
  },
];
