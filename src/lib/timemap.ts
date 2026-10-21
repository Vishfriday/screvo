import type { Project } from "@/lib/types";

/**
 * Timeline seconds → source-video seconds. Deleting a step cuts its span out of
 * the timeline but not out of the recording, so playback has to add those spans
 * back to land on the right frame.
 */
export function sourceTimeAt(p: Pick<Project, "removed">, t: number): number {
  let out = t;
  for (const r of p.removed ?? []) if (r.at <= t + 1e-6) out += r.len;
  return out;
}
