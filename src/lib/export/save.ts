import { Directory, File } from "expo-file-system";
import { exportCut, canExportCut, saveToGallery, canSaveToGallery, type ExportOptions } from "../../../modules/screvo-screen-capture";
import * as ImagePicker from "expo-image-picker";
import { sourceTimeAt } from "@/lib/timemap";
import { projectSpeed } from "@/lib/speed";
import type { Project } from "@/lib/types";

/**
 * Saving a project's video to the device.
 *
 * This copies the real media file out of Screvo's private storage into a folder
 * the user picks, through Android's document picker — so the file lands
 * somewhere they can open, move and share.
 *
 * A project that is a CUT — a product demo keeps a few spans and drops the rest
 * — is written out for real: the kept spans are copied into a new MP4, so a
 * one-minute demo saves as a one-minute file rather than the whole recording.
 *
 * Generated voice-over IS carried: each step's line is laid onto the cut's clock
 * and encoded as the file's audio track, replacing whatever the room sounded
 * like during the recording. A music bed is mixed in underneath it, and playback
 * speed is applied by rewriting the frames' timestamps.
 *
 * What it still does NOT do is render the picture overlays — zooms, captions,
 * touchpoints and the intro card are drawn during playback inside Screvo, and
 * burning those in needs a video encoder this build has no way to run.
 */

/**
 * The spans of the source this project actually keeps.
 *
 * A demo records them directly. Anything else that dropped footage — a deleted
 * step, say — only has the timeline map, so the spans are read back out of it:
 * each stretch of timeline between two removals is one span of source.
 */
export function keptSpans(project: Project): { start: number; end: number }[] {
  if (project.cut?.length) return project.cut;
  if (!project.removed?.length) return [];

  const eps = 0.01;
  const edges = [0, ...project.removed.map((r) => r.at), project.durationSec]
    .filter((t) => t >= 0 && t <= project.durationSec)
    .sort((a, b) => a - b);

  const spans: { start: number; end: number }[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const from = edges[i];
    const to = edges[i + 1];
    if (to - from < eps) continue;
    const start = sourceTimeAt(project, from + eps) - eps;
    const end = sourceTimeAt(project, to - eps) + eps;
    if (end - start < 0.2) continue;
    const last = spans[spans.length - 1];
    // stretches that are continuous in the source are one span, not two
    if (last && start - last.end < 0.05) last.end = end;
    else spans.push({ start: Math.max(0, start), end });
  }
  return spans;
}

/** The generated lines, each with the moment it is spoken on this project's clock. */
export function voiceLines(project: Project): { uri: string; at: number }[] {
  return project.script
    .filter((seg) => !!seg.audioUri)
    .map((seg) => ({ uri: seg.audioUri as string, at: seg.start }))
    .sort((a, b) => a.at - b.at);
}

/** What the export screen lets the user drop from this particular render. */
export interface ExportChoices {
  includeVoice?: boolean;
  includeMusic?: boolean;
  includeSourceAudio?: boolean;
}

/** Everything the exporter needs beyond the spans themselves. */
export function exportOptions(project: Project, choices: ExportChoices = {}): ExportOptions {
  const music = choices.includeMusic === false ? undefined : project.music;
  const audio = project.audio;
  return {
    speed: projectSpeed(project),
    ...(audio
      ? {
          audio: {
            sourceVolume: choices.includeSourceAudio === false ? 0 : audio.sourceVolume,
            enabled: audio.denoise.enabled,
            strength: audio.denoise.strength,
            highPass: audio.denoise.highPass,
            gate: audio.denoise.gate,
          },
        }
      : {}),
    ...(music
      ? {
          music: {
            uri: music.uri,
            volume: music.volume,
            loop: music.loop,
            fadeIn: music.fadeIn,
            fadeOut: music.fadeOut,
          },
        }
      : {}),
  };
}

export class NoFootageError extends Error {
  constructor() {
    super("This project has no video file — it was built from the sample footage");
    this.name = "NoFootageError";
  }
}

export class SaveCancelledError extends Error {
  constructor() {
    super("No folder was chosen");
    this.name = "SaveCancelledError";
  }
}

/** A filename that will still make sense in a downloads folder a week later. */
function fileNameFor(project: Project): string {
  const stamp = new Date(project.updatedAt || Date.now())
    .toISOString()
    .slice(0, 16)
    .replace("T", " ")
    .replace(":", "-");
  const base = project.name.replace(/[^\w\s-]/g, "").trim() || "Screvo recording";
  const ext = (project.sourceUri?.split(".").pop() || "mp4").toLowerCase().split("?")[0];
  return `${base} ${stamp}.${ext.length <= 4 ? ext : "mp4"}`;
}

export interface SavedVideo {
  /** where the copy landed, as a content URI */
  uri: string;
  name: string;
  bytes: number;
}

/**
 * Asks for a destination folder and copies the project's footage into it.
 * Resolves with the written file, or throws so the caller can report why not.
 */
export async function saveProjectVideo(
  project: Project,
  choices: ExportChoices = {},
): Promise<SavedVideo> {
  if (!project.sourceUri) throw new NoFootageError();

  // a cut is written as its own file first, so what lands on the device is the
  // edit and not the raw recording it came from
  let source = new File(project.sourceUri);
  if (!source.exists) throw new NoFootageError();
  const spans = keptSpans(project);
  const voice = choices.includeVoice === false ? [] : voiceLines(project);
  const options = exportOptions(project, choices);
  const retimed = (options.speed ?? 1) !== 1;
  const room = (options.audio?.sourceVolume ?? 0) > 0;
  if ((spans.length || voice.length || options.music || retimed || room) && canExportCut()) {
    // with no cut the whole recording is the span, so narration, music and a
    // speed change can still be applied to it
    const whole = [{ start: 0, end: project.durationSec }];
    const written = await exportCut(project.sourceUri, spans.length ? spans : whole, voice, options);
    source = new File(written.uri);
  }
  const bytes = source.size ?? 0;

  const name = fileNameFor(project);

  // the gallery is where people look for a video, so it goes there first and
  // Google Photos picks it up; the folder picker is the fallback
  if (canSaveToGallery()) {
    const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    try {
      await saveToGallery(source.uri, name);
      return { uri: "gallery", name, bytes };
    } catch {
      // the gallery refused it — fall through and let them pick a folder
    }
  }

  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    // the picker closing without a choice is a cancel, not a failure
    throw new SaveCancelledError();
  }
  if (!folder) throw new SaveCancelledError();
  const destination = folder.createFile(name, "video/mp4");

  // `copy` into a document-provider file leaves it empty, so the bytes are
  // written explicitly. A half-written file is worse than none, so a failure
  // takes the empty placeholder with it.
  try {
    destination.write(await source.bytes());
  } catch (e) {
    try {
      destination.delete();
    } catch {
      // the provider may refuse the delete; the caller still hears about the failure
    }
    throw e;
  }

  const written = destination.size ?? 0;
  if (!written) {
    try {
      destination.delete();
    } catch {
      // nothing more to clean up
    }
    throw new Error("The file was created but nothing was written to it");
  }

  return { uri: destination.uri, name, bytes: written };
}

/** "18.4 MB" — for telling the user what actually landed on their device. */
export function prettyBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
