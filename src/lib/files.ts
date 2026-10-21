import { File, Paths } from "expo-file-system";

/**
 * Bringing a picked file into Screvo's own storage.
 *
 * Both media pickers hand back a copy in the CACHE directory, and Android
 * empties that whenever it wants space back. A project pointing into the cache
 * therefore works perfectly until, days later, its footage or its music is
 * simply gone — the export fails with "the recording file is gone" and there is
 * nothing left to recover.
 *
 * So anything a project is going to depend on gets copied into the document
 * directory first, next to the generated voice-over, which is kept there for
 * the same reason.
 */

/** A filename that stays unique and still says what it was. */
function targetName(displayName: string, prefix: string): string {
  const ext = (displayName.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4);
  const stem = displayName
    .replace(/\.[^.]*$/, "")
    .replace(/[^\w-]/g, "_")
    .slice(0, 40);
  return `${prefix}_${Date.now()}_${stem}${ext ? `.${ext}` : ""}`;
}

/**
 * Copies a picked file somewhere it will survive, and returns the URI to keep.
 *
 * The copy streams natively rather than through JavaScript, so a large
 * recording does not have to fit in memory. If it fails the original URI comes
 * back: a project that works today and may break later still beats one that
 * refuses the import outright.
 */
export async function adoptFile(
  uri: string,
  displayName: string,
  prefix: string,
  onProblem?: (reason: string) => void,
): Promise<string> {
  try {
    const source = new File(uri);
    if (!source.exists) return uri;
    // already ours — a re-import of something adopted earlier
    if (uri.startsWith(Paths.document.uri)) return uri;

    // not pre-created: `copy` writes the destination itself, and handing it a
    // file that already exists is what left an empty one behind
    const target = new File(Paths.document, targetName(displayName, prefix));
    await source.copy(target);
    if (target.exists && (target.size ?? 0) > 0) return target.uri;
    try {
      if (target.exists) target.delete();
    } catch {
      // nothing to clean up
    }
    onProblem?.("the copy came out empty");
    return uri;
  } catch (e: any) {
    // a silent failure here is how a project quietly loses its footage a week
    // later, so the caller gets told even though the import still goes ahead
    onProblem?.(e?.message ?? "unknown error");
    return uri;
  }
}

/** The footage a project is built on. */
export const adoptVideoFile = (uri: string, name: string, onProblem?: (r: string) => void) =>
  adoptFile(uri, name, "video", onProblem);

/** The music bed that plays under the narration. */
export const adoptMusicFile = (uri: string, name: string, onProblem?: (r: string) => void) =>
  adoptFile(uri, name, "music", onProblem);
