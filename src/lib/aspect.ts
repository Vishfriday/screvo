import type { Project } from "@/lib/types";

/**
 * The shape of the finished video.
 *
 * This used to be fixed at 9:16 everywhere, so a landscape recording was shown
 * cropped to a phone-shaped hole the moment it was imported — before anyone had
 * asked for that. The output shape is now a property of the project, chosen
 * from the footage to begin with and changed whenever the user wants.
 */

export type AspectId = "9:16" | "1:1" | "16:9";

export const ASPECTS: { id: AspectId; label: string; ratio: number; blurb: string }[] = [
  { id: "9:16", label: "9:16", ratio: 9 / 16, blurb: "Vertical — Reels, Shorts, TikTok" },
  { id: "1:1", label: "1:1", ratio: 1, blurb: "Square — feed posts" },
  { id: "16:9", label: "16:9", ratio: 16 / 9, blurb: "Landscape — YouTube, embeds" },
];

export function aspectRatioOf(id?: string): number {
  return ASPECTS.find((a) => a.id === id)?.ratio ?? 9 / 16;
}

/** The project's shape, defaulting to vertical when nothing has been chosen. */
export function projectAspect(p: Pick<Project, "aspect">): AspectId {
  return (ASPECTS.find((a) => a.id === p.aspect)?.id ?? "9:16") as AspectId;
}

/**
 * The shape a piece of footage is closest to.
 *
 * Imported video should open looking like itself: a landscape screen recording
 * belongs in a landscape frame until someone decides otherwise.
 */
export function aspectForSize(size?: { width: number; height: number }): AspectId {
  if (!size?.width || !size?.height) return "9:16";
  const r = size.width / size.height;
  if (r > 1.2) return "16:9";
  if (r < 0.85) return "9:16";
  return "1:1";
}

/** How the footage is framed inside that shape. */
export type CropFit = "fill" | "fit";

export interface Crop {
  fit: CropFit;
  /** 1 = untouched; above that the footage is pushed in */
  scale: number;
  /** pan, as a fraction of the frame, so it survives a change of preview size */
  x: number;
  y: number;
}

export const DEFAULT_CROP: Crop = { fit: "fill", scale: 1, x: 0, y: 0 };

export function cropOf(meta?: Record<string, any> | null): Crop {
  const c = (meta?.crop ?? {}) as Partial<Crop>;
  return {
    fit: c.fit === "fit" ? "fit" : "fill",
    scale: clamp(c.scale ?? 1, 1, 4),
    x: clamp(c.x ?? 0, -1, 1),
    y: clamp(c.y ?? 0, -1, 1),
  };
}

export function isCropped(c: Crop): boolean {
  return c.fit !== "fill" || c.scale !== 1 || c.x !== 0 || c.y !== 0;
}

/**
 * Keeps the pan inside the footage.
 *
 * At scale 1 there is nothing to pan — any offset would show empty frame — and
 * the room to move grows with how far in the picture has been pushed.
 */
export function clampPan(x: number, y: number, scale: number): { x: number; y: number } {
  const room = Math.max(0, (scale - 1) / 2);
  return { x: clamp(x, -room, room), y: clamp(y, -room, room) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
