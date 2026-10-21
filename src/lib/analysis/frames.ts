import * as VideoThumbnails from "expo-video-thumbnails";
import { File } from "expo-file-system";
import type { UploadFile, VideoFrame } from "./types";

/**
 * Pulls evenly spaced stills out of the real recording with the platform's own
 * thumbnail generator — no ffmpeg, and it works inside Expo Go.
 */
export async function extractFrames(uri: string, count: number, durationSec: number): Promise<VideoFrame[]> {
  const frames: VideoFrame[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.max(0, Math.min(durationSec - 0.1, ((i + 0.5) / count) * durationSec));
    try {
      const shot = await VideoThumbnails.getThumbnailAsync(uri, { time: t * 1000, quality: 0.6 });
      const base64 = await new File(shot.uri).base64();
      frames.push({ t, base64 });
    } catch {
      // a frame the decoder refuses is skipped rather than failing the run
    }
  }
  if (!frames.length) throw new Error("No frames could be read from this video");
  return frames;
}

/** Describes the media file for a multipart upload to the transcription service. */
export async function fileForUpload(uri: string): Promise<UploadFile> {
  const name = uri.split("/").pop() || "recording.mp4";
  const ext = (name.split(".").pop() || "mp4").toLowerCase();
  let size = 0;
  try {
    size = new File(uri).size ?? 0;
  } catch {
    // an unreadable size only means we cannot pre-empt the size limit
  }
  return {
    uri,
    name,
    size,
    type: ext === "mov" ? "video/quicktime" : ext === "m4a" ? "audio/m4a" : `video/${ext}`,
  };
}
