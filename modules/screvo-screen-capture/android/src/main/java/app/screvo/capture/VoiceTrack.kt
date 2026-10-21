package app.screvo.capture

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.util.Log
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

/**
 * Builds the exported file's audio: the generated voice-over, and the music bed
 * underneath it, as one AAC track laid out on the cut's clock.
 *
 * Each step's line is its own WAV file, written by the speech server and spoken
 * at that step's moment. They are laid into a single silent canvas the length of
 * the finished video, each at its own offset. A music bed is laid under them
 * first — looped to fill the canvas and faded at both ends — so the mix the
 * editor plays and the mix in the file are the same thing.
 */
object VoiceTrack {

  private const val TAG = "ScrevoCut"
  private const val MIME = "audio/mp4a-latm"
  private const val BITRATE = 96_000

  data class Line(val path: String, val atSec: Double)

  /** The bed laid under the narration. */
  data class Music(
    val path: String,
    /** 0..1, well below the voice */
    val volume: Double,
    val loop: Boolean,
    val fadeIn: Boolean,
    val fadeOut: Boolean,
  )

  /** One encoded AAC frame, ready for the muxer. */
  class Frame(val bytes: ByteArray, val presentationTimeUs: Long, val flags: Int)

  class Encoded(val format: MediaFormat, val frames: List<Frame>)

  /** A WAV as the speech server writes it: RIFF, PCM 16-bit. */
  private class Wav(val pcm: ShortArray, val sampleRate: Int, val channels: Int)

  /** Interleaved channels averaged down to one, for mixing. */
  private fun monoOf(wav: Wav): ShortArray {
    val channels = wav.channels.coerceAtLeast(1)
    if (channels == 1) return wav.pcm
    val frames = wav.pcm.size / channels
    val out = ShortArray(frames)
    for (i in 0 until frames) {
      var sum = 0
      for (c in 0 until channels) sum += wav.pcm[i * channels + c].toInt()
      out[i] = (sum / channels).coerceIn(-32768, 32767).toShort()
    }
    return out
  }

  private fun readWav(path: String): Wav? {
    val bytes = try {
      File(path).readBytes()
    } catch (e: Throwable) {
      Log.w(TAG, "voice clip unreadable: $path")
      return null
    }
    if (bytes.size < 44) return null
    val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    if (bb.int != 0x46464952) return null // "RIFF"
    bb.int
    if (bb.int != 0x45564157) return null // "WAVE"

    var sampleRate = 24_000
    var channels = 1
    var bits = 16
    var dataOffset = -1
    var dataLength = 0
    while (bb.remaining() >= 8) {
      val id = bb.int
      val size = bb.int
      val next = bb.position() + size + (size and 1)
      when (id) {
        0x20746d66 -> { // "fmt "
          bb.short // format tag
          channels = bb.short.toInt()
          sampleRate = bb.int
          bb.int // byte rate
          bb.short // block align
          bits = bb.short.toInt()
        }
        0x61746164 -> { // "data"
          dataOffset = bb.position()
          dataLength = size
        }
      }
      if (next <= bb.capacity()) bb.position(next) else break
      if (dataOffset >= 0) break
    }
    if (dataOffset < 0 || bits != 16) {
      Log.w(TAG, "voice clip is not 16-bit PCM: $path")
      return null
    }

    val count = min(dataLength, bytes.size - dataOffset) / 2
    val pcm = ShortArray(count)
    val data = ByteBuffer.wrap(bytes, dataOffset, count * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until count) pcm[i] = data.short
    return Wav(pcm, sampleRate, channels)
  }

  /**
   * Encodes the lines into AAC. Returns null when there is nothing to say, so
   * the caller can fall back to the recording's own audio.
   */
  fun build(
    lines: List<Line>,
    totalSec: Double,
    music: Music? = null,
    source: SourceAudio.Prepared? = null,
  ): Encoded? {
    if (totalSec <= 0) return null
    if (lines.isEmpty() && music == null && source == null) return null

    val clips = lines.mapNotNull { line -> readWav(line.path)?.let { it to line.atSec } }
    if (clips.isEmpty() && music == null && source == null) return null

    // the narration sets the canvas rate when there is any, so no voice clip is
    // ever resampled; a music-only export follows the bed instead
    val rate = clips.firstOrNull()?.first?.sampleRate ?: 24_000
    val canvas = ShortArray(((totalSec + 0.5) * rate).toInt().coerceAtLeast(rate))

    if (music != null) layMusic(canvas, rate, music, totalSec)
    // the recording's own sound goes down before the voice, which sits on top
    if (source != null) laySource(canvas, rate, source)

    for ((wav, atSec) in clips) {
      // a clip recorded at another rate is stepped through rather than resampled
      // properly — close enough for narration, and they all come from one server
      val step = wav.sampleRate.toDouble() / rate
      val channels = wav.channels.coerceAtLeast(1)
      val start = (atSec * rate).toInt().coerceAtLeast(0)
      var i = 0
      while (true) {
        val src = (i * step).toInt() * channels
        val dst = start + i
        if (src >= wav.pcm.size || dst >= canvas.size) break
        val mixed = canvas[dst].toInt() + wav.pcm[src].toInt()
        canvas[dst] = mixed.coerceIn(-32768, 32767).toShort()
        i += 1
      }
    }

    val format = MediaFormat.createAudioFormat(MIME, rate, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, BITRATE)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 1 shl 16)
    }
    val codec = MediaCodec.createEncoderByType(MIME)
    val frames = ArrayList<Frame>()
    var outFormat: MediaFormat? = null

    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      codec.start()

      val info = MediaCodec.BufferInfo()
      var offset = 0 // in samples
      var inputDone = false

      while (true) {
        if (!inputDone) {
          val index = codec.dequeueInputBuffer(10_000)
          if (index >= 0) {
            val buffer = codec.getInputBuffer(index)!!
            buffer.clear()
            val room = buffer.capacity() / 2
            val take = min(room, canvas.size - offset)
            if (take <= 0) {
              codec.queueInputBuffer(
                index, 0, 0,
                (offset.toLong() * 1_000_000L) / rate,
                MediaCodec.BUFFER_FLAG_END_OF_STREAM,
              )
              inputDone = true
            } else {
              val shorts = buffer.order(ByteOrder.nativeOrder()).asShortBuffer()
              shorts.put(canvas, offset, take)
              codec.queueInputBuffer(index, 0, take * 2, (offset.toLong() * 1_000_000L) / rate, 0)
              offset += take
            }
          }
        }

        val outIndex = codec.dequeueOutputBuffer(info, 10_000)
        if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          outFormat = codec.outputFormat
        } else if (outIndex >= 0) {
          val buffer = codec.getOutputBuffer(outIndex)!!
          if (info.size > 0 && (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
            val bytes = ByteArray(info.size)
            buffer.position(info.offset)
            buffer.get(bytes)
            frames.add(Frame(bytes, info.presentationTimeUs, info.flags))
          }
          codec.releaseOutputBuffer(outIndex, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break
        }
      }
    } finally {
      try {
        codec.stop()
      } catch (_: Throwable) {
      }
      codec.release()
    }

    val resolved = outFormat ?: return null
    Log.i(
      TAG,
      "audio track: ${clips.size} lines${if (music != null) " + music bed" else ""}" +
        "${if (source != null) " + source audio" else ""}, " +
        "${frames.size} aac frames at ${rate}Hz",
    )
    return Encoded(resolved, frames)
  }

  /**
   * Lays the cleaned recording across the canvas, from its start.
   *
   * It has already been cut to the exported stretches, so it lines up with the
   * picture sample for sample; all that is left is to bring it to the canvas's
   * rate and level.
   */
  private fun laySource(canvas: ShortArray, rate: Int, source: SourceAudio.Prepared) {
    val step = source.sampleRate.toDouble() / rate
    val gain = source.volume.coerceIn(0.0, 1.0)
    if (gain <= 0.0) return
    // Downsampling by taking every nth sample folds everything above the new
    // Nyquist back into the audible range as a metallic shimmer, so each output
    // sample is the average of the input samples it stands for instead.
    // rounded up, not truncated: downsampling 44.1k to 24k gives a step of 1.84,
    // and truncating that to one sample would be no filtering at all
    val span = max(1, kotlin.math.ceil(step).toInt())
    for (i in canvas.indices) {
      val from = (i * step).toLong()
      if (from >= source.pcm.size) break
      var sum = 0
      var n = 0
      var k = from
      while (n < span && k < source.pcm.size) {
        sum += source.pcm[k.toInt()].toInt()
        n += 1
        k += 1
      }
      if (n == 0) break
      val v = canvas[i] + (sum.toDouble() / n) * gain
      canvas[i] = v.toInt().coerceIn(-32768, 32767).toShort()
    }
  }

  /**
   * Lays the bed across the whole canvas before any narration goes on top.
   *
   * The bed is usually far shorter than the video, so it repeats; a bed that is
   * not set to loop simply stops where it ends. Fades are linear over a window
   * that shrinks for short videos, so a twenty-second demo does not spend a
   * third of itself fading in.
   */
  private fun layMusic(canvas: ShortArray, rate: Int, music: Music, totalSec: Double) {
    // Screvo's own beds are written as plain WAV, which the direct reader opens
    // without spinning up a codec; anything the user picked goes through the
    // platform decoder instead
    val decoded = readWav(music.path)?.let { wav ->
      AudioDecoder.Pcm(monoOf(wav), wav.sampleRate)
    } ?: AudioDecoder.decode(music.path, totalSec + 2.0) ?: return
    if (decoded.samples.isEmpty()) return

    val step = decoded.sampleRate.toDouble() / rate
    val fadeSec = minOf(2.0, totalSec / 6.0).coerceAtLeast(0.2)
    val fade = (fadeSec * rate).toInt().coerceAtLeast(1)
    val gain = music.volume.coerceIn(0.0, 1.0)
    if (gain <= 0.0) return

    for (i in canvas.indices) {
      val srcIndex = (i * step).toLong()
      // a bed that does not loop simply runs out; one that does wraps, and the
      // index is kept in Long until it is known to fit
      if (!music.loop && srcIndex >= decoded.samples.size) break
      val src = (if (music.loop) srcIndex % decoded.samples.size else srcIndex).toInt()
      var g = gain
      if (music.fadeIn && i < fade) g *= i.toDouble() / fade
      if (music.fadeOut && i > canvas.size - fade) g *= (canvas.size - i).toDouble() / fade
      canvas[i] = (canvas[i] + decoded.samples[src] * g).toInt().coerceIn(-32768, 32767).toShort()
    }
    Log.i(TAG, "music bed laid at ${(gain * 100).toInt()}%, loop=${music.loop}")
  }
}
