/**
 * Kokoro-82M voice table.
 *
 * Kokoro ships one voice pack per speaker, named by accent and gender:
 * `af_*` / `am_*` are American female and male, `bf_*` / `bm_*` the British
 * pair. Every Screvo voice therefore names four packs — a gender it belongs to
 * and an accent the Language chip picks — so choosing "Male" genuinely changes
 * which model voice speaks, not just the label on the chip.
 */

export type VoiceGender = "female" | "male";

export interface ScrevoVoice {
  /** what the app calls it */
  name: string;
  gender: VoiceGender;
  /** how it reads, for the chip's second line */
  blurb: string;
  /** the Kokoro packs, American and British */
  us: string;
  uk: string;
}

export const VOICES: ScrevoVoice[] = [
  { name: "Ava — Warm", gender: "female", blurb: "Friendly and unhurried", us: "af_heart", uk: "bf_emma" },
  { name: "Nova — Bright", gender: "female", blurb: "Crisp and energetic", us: "af_nova", uk: "bf_isabella" },
  { name: "Ivy — Calm", gender: "female", blurb: "Even and reassuring", us: "af_sarah", uk: "bf_alice" },
  { name: "Mia — Soft", gender: "female", blurb: "Gentle, close to the mic", us: "af_bella", uk: "bf_lily" },
  { name: "Ben — Clear", gender: "male", blurb: "Plain and precise", us: "am_michael", uk: "bm_george" },
  { name: "Cole — Deep", gender: "male", blurb: "Low and authoritative", us: "am_onyx", uk: "bm_lewis" },
  { name: "Rio — Upbeat", gender: "male", blurb: "Quick and enthusiastic", us: "am_puck", uk: "bm_daniel" },
  { name: "Theo — Steady", gender: "male", blurb: "Measured, good for SOPs", us: "am_adam", uk: "bm_fable" },
];

const BY_NAME: Record<string, ScrevoVoice> = Object.fromEntries(VOICES.map((v) => [v.name, v]));

/** Kept for callers that only need the pack names. */
export const KOKORO_VOICES: Record<string, { us: string; uk: string }> = Object.fromEntries(
  VOICES.map((v) => [v.name, { us: v.us, uk: v.uk }]),
);

const DEFAULT = BY_NAME["Ava — Warm"];

/** The voices of one gender, in the order they should be offered. */
export function voicesOf(gender: VoiceGender): ScrevoVoice[] {
  return VOICES.filter((v) => v.gender === gender);
}

/** Which gender a saved voice name belongs to — female when it is unknown. */
export function genderOf(name?: string): VoiceGender {
  return (name && BY_NAME[name]?.gender) || "female";
}

/** The voice to switch to when the gender changes, keeping the same position. */
export function swapGender(name: string | undefined, gender: VoiceGender): string {
  const from = voicesOf(genderOf(name));
  const to = voicesOf(gender);
  const at = Math.max(0, from.findIndex((v) => v.name === name));
  return (to[at] ?? to[0]).name;
}

export function blurbFor(name?: string): string {
  return (name && BY_NAME[name]?.blurb) || "";
}

/** Resolves a Screvo voice name and language to one Kokoro voice pack. */
export function kokoroVoiceFor(name?: string, language?: string): string {
  const pack = (name && BY_NAME[name]) || DEFAULT;
  return language && /\b(uk|british|gb)\b/i.test(language) ? pack.uk : pack.us;
}

/** Kokoro speaks English only; other languages fall back to the English pack. */
export function kokoroSpeaksLanguage(language?: string): boolean {
  return !language || /english/i.test(language);
}
