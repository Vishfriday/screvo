import type { Project } from "@/lib/types";

/**
 * Playback speed.
 *
 * The timeline always stays in 1x seconds — a caption placed at 0:12 belongs at
 * 0:12 of the footage however fast it is played. Speed is applied once, at the
 * two places the video actually moves: the preview clock, and the exporter's
 * output timestamps.
 */

export const SPEEDS = [0.5, 1, 1.5, 2, 3, 4, 5] as const;

export function projectSpeed(p: Pick<Project, "speed">): number {
  const s = p.speed ?? 1;
  return s > 0 ? s : 1;
}

/** How long the finished file runs, once the speed is applied. */
export function finishedDuration(p: Pick<Project, "speed" | "durationSec">): number {
  return p.durationSec / projectSpeed(p);
}

/** "2×" — never "2.00×" for a whole number. */
export function fmtSpeed(s: number): string {
  return `${Number.isInteger(s) ? s : s.toFixed(1)}×`;
}

/**
 * Narration keeps its natural pace, so speeding the picture up can push a line
 * past the start of the next one. This reports by how much, so the panel can
 * say so instead of letting the export surprise anyone.
 */
export function narrationOverrun(p: Project): { overlapping: number; worstSec: number } {
  const speed = projectSpeed(p);
  const lines = p.script
    .filter((s) => s.audioUri && (s.audioDur ?? 0) > 0)
    .map((s) => ({ at: s.start / speed, len: s.audioDur as number }))
    .sort((a, b) => a.at - b.at);

  let overlapping = 0;
  let worstSec = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const end = lines[i].at + lines[i].len;
    const nextAt = i + 1 < lines.length ? lines[i + 1].at : finishedDuration(p);
    const over = end - nextAt;
    if (over > 0.15) {
      overlapping += 1;
      worstSec = Math.max(worstSec, over);
    }
  }
  return { overlapping, worstSec };
}
