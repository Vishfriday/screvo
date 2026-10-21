package app.screvo.capture

import android.util.Log
import kotlin.math.min

/**
 * The recording's own sound, cut to the edit and cleaned up.
 *
 * Until now a cut either kept the original audio track untouched or threw it
 * away for the narration. Neither is much use once there is noise cancellation
 * to apply: the sound has to be decoded, cut to the same stretches the picture
 * shows, cleaned, and mixed in alongside the voice-over and the music.
 *
 * The stretches come from `CutExporter.plan`, not from the spans the editor
 * asked for, because a span starts at the keyframe before it. Cutting the audio
 * where the editor asked and the video where the keyframe fell is exactly how
 * sound ends up out of step with the picture.
 */
object SourceAudio {

  private const val TAG = "ScrevoCut"

  class Prepared(val pcm: ShortArray, val sampleRate: Int, val volume: Double)

  /**
   * Decodes the recording, keeps the planned stretches, and cleans them.
   * Returns null when there is no audio worth carrying.
   */
  fun prepare(
    path: String,
    placed: List<CutExporter.Placed>,
    volume: Double,
    denoise: Denoise.Settings,
  ): Prepared? {
    if (volume <= 0.001 || placed.isEmpty()) return null

    val longestSec = placed.maxOf { it.sourceEndUs } / 1_000_000.0 + 2.0
    val decoded = AudioDecoder.decode(path, longestSec) ?: return null
    if (decoded.samples.isEmpty()) return null
    val rate = decoded.sampleRate

    // Each stretch is written at the exact moment the picture shows it. Laying
    // them end to end instead would seem right and be wrong: the exporter leaves
    // a frame's gap between spans, so the sound would creep ahead of the picture
    // by a little more with every cut.
    val lastEnd = placed.maxOf { it.outStartUs + it.outLengthUs }
    val total = (lastEnd / 1_000_000.0 * rate).toInt()
    if (total <= 0) return null

    val out = ShortArray(total)
    for (p in placed) {
      val at = (p.outStartUs / 1_000_000.0 * rate).toInt()
      if (at >= out.size) continue
      val from = (p.sourceStartUs / 1_000_000.0 * rate).toInt().coerceIn(0, decoded.samples.size)
      val want = (p.outLengthUs / 1_000_000.0 * rate).toInt()
      val count = min(min(want, decoded.samples.size - from), out.size - at)
      if (count > 0) System.arraycopy(decoded.samples, from, out, at, count)
      // anything the recording ran out of simply stays silent, and the next
      // stretch still lands where its own picture does
    }

    val cleaned = Denoise.apply(out, rate, denoise)
    Log.i(TAG, "source audio: ${placed.size} spans, ${cleaned.size / rate}s at ${rate}Hz, level ${(volume * 100).toInt()}%")
    return Prepared(cleaned, rate, volume)
  }

}
