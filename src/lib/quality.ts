/**
 * Capture quality.
 *
 * A screen recording can only hold what the display actually has, so a phone
 * with a 1080p panel records 1080p whatever is asked for — asking for 4K there
 * would just upscale, costing bitrate and storage for no extra detail. Each
 * preset therefore names a target for the long edge, and the recorder caps it
 * to the panel and to what the device's H.264 encoder will accept.
 */

export type QualityId = "1080p" | "2K" | "4K" | "5K";

export interface Quality {
  id: QualityId;
  label: string;
  /** pixels on the long edge this preset aims for */
  longEdge: number;
  /** video bitrate in bits per second */
  bitrate: number;
  note: string;
}

export const QUALITIES: Quality[] = [
  { id: "1080p", label: "1080p", longEdge: 1920, bitrate: 8_000_000, note: "Full HD — smallest files" },
  { id: "2K", label: "2K", longEdge: 2560, bitrate: 14_000_000, note: "Sharper text on 1440p screens" },
  { id: "4K", label: "4K", longEdge: 3840, bitrate: 28_000_000, note: "Ultra HD — large files" },
  { id: "5K", label: "5K", longEdge: 5120, bitrate: 44_000_000, note: "Maximum detail, if the encoder allows" },
];

export const DEFAULT_QUALITY: QualityId = "1080p";

export function qualityFor(id?: QualityId): Quality {
  return QUALITIES.find((q) => q.id === id) ?? QUALITIES[0];
}

/** The nearest preset name for a picture this size — for describing a file. */
export function describeSize(size?: { width: number; height: number }): string | null {
  if (!size?.width || !size?.height) return null;
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  const name =
    long >= 4800 ? "5K" : long >= 3600 ? "4K" : long >= 2400 ? "2K" : long >= 1800 ? "1080p" : `${short}p`;
  return `${name} · ${size.width}×${size.height}`;
}
