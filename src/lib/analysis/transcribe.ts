import type { TranscriptSegment, UploadFile } from "./types";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

/** The transcription service rejects anything larger; we skip speech instead of failing. */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor() {
    super("The recording is too large to transcribe");
    this.name = "FileTooLargeError";
  }
}

/** Turns a verbose_json response into our own segment shape. */
export function normalizeSegments(json: any): TranscriptSegment[] {
  const raw = Array.isArray(json?.segments) ? json.segments : [];
  const segs: TranscriptSegment[] = raw
    .map((s: any) => ({
      start: Number(s?.start) || 0,
      end: Number(s?.end) || 0,
      text: String(s?.text ?? "").trim(),
    }))
    .filter((s: TranscriptSegment) => s.text.length > 0);
  if (segs.length) return segs;
  const whole = typeof json?.text === "string" ? json.text.trim() : "";
  return whole ? [{ start: 0, end: 0, text: whole }] : [];
}

/** Real speech-to-text on the recording's own audio track. */
export async function transcribe(file: UploadFile, apiKey: string): Promise<TranscriptSegment[]> {
  if (file.size && file.size > MAX_UPLOAD_BYTES) throw new FileTooLargeError();

  const form = new FormData();
  // React Native's networking layer understands this file descriptor shape
  form.append("file", { uri: file.uri, name: file.name, type: file.type } as any);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Transcription failed (${res.status}) ${detail.slice(0, 200)}`);
  }
  return normalizeSegments(await res.json());
}
