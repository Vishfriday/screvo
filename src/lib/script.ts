/**
 * Script text transforms. These change what the voice reads, so they are real
 * edits rather than hints: regenerating the voice-over after one of them is
 * audibly different.
 */

/** How long a line takes to read, used until the real clip length is known. */
export function estimateSpeechSeconds(text: string, speed = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.6, words / 2.6 / Math.max(0.25, speed));
}

const LEAD_INS = ["Then", "Next", "Now", "First", "Finally", "After that", "Once done"];

/**
 * Breaks a line at sentence ends and after a lead-in word. Speech synthesis
 * pauses on paragraph breaks and commas, so this lengthens the gaps the
 * listener hears without inventing words.
 */
export function addPauses(text: string): string {
  let out = text.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  for (const w of LEAD_INS) {
    out = out.replace(new RegExp(`(^|\\n)(${w}) (?![,])`, "g"), `$1$2, `);
  }
  out = out.replace(/([.!?])\s+(?=\S)/g, "$1\n\n");
  return out.trim();
}
