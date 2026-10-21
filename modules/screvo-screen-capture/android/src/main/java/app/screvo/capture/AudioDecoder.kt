package app.screvo.capture

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Decodes any audio file Android can read into mono 16-bit PCM.
 *
 * The music bed can be a track the user picked out of their own library, so it
 * arrives as MP3, M4A, OGG or anything else the platform decoder handles. The
 * mixer downstream only speaks raw PCM, so everything is brought to one shape
 * here: mono, signed 16-bit, at whatever rate the file was encoded at — the
 * caller resamples to the rate it is mixing into.
 */
object AudioDecoder {

  private const val TAG = "ScrevoCut"

  /** A decoded file: mono samples plus the rate they were decoded at. */
  class Pcm(val samples: ShortArray, val sampleRate: Int)

  /**
   * Decodes up to `maxSeconds` of audio. Returns null when the file has no
   * audio track or the platform cannot decode it, so the caller can carry on
   * without music rather than failing the whole export.
   */
  fun decode(path: String, maxSeconds: Double = 600.0): Pcm? {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      extractor.setDataSource(path)
      var track = -1
      var format: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val f = extractor.getTrackFormat(i)
        if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
          track = i
          format = f
          break
        }
      }
      val source = format ?: return null
      extractor.selectTrack(track)

      val mime = source.getString(MediaFormat.KEY_MIME) ?: return null
      val rate = source.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      val channels = if (source.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
        source.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
      } else 1

      codec = MediaCodec.createDecoderByType(mime)
      codec.configure(source, null, null, 0)
      codec.start()

      val cap = (maxSeconds * rate).toInt().coerceAtLeast(rate)
      var out = ShortArray(minOf(cap, rate * 30))
      var count = 0
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false

      while (!outputDone && count < cap) {
        if (!inputDone) {
          val index = codec.dequeueInputBuffer(10_000)
          if (index >= 0) {
            val buffer = codec.getInputBuffer(index)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        val index = codec.dequeueOutputBuffer(info, 10_000)
        if (index >= 0) {
          if (info.size > 0) {
            val buffer = codec.getOutputBuffer(index)!!
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            val shorts = buffer.order(ByteOrder.nativeOrder()).asShortBuffer()
            val frames = shorts.remaining() / channels
            if (count + frames > out.size) {
              out = out.copyOf(minOf(cap, maxOf(out.size * 2, count + frames)))
            }
            // interleaved channels are averaged down to one
            var i = 0
            while (i < frames && count < out.size) {
              var sum = 0
              for (c in 0 until channels) sum += shorts.get(i * channels + c).toInt()
              out[count] = (sum / channels).coerceIn(-32768, 32767).toShort()
              count += 1
              i += 1
            }
          }
          codec.releaseOutputBuffer(index, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputDone = true
        }
      }

      if (count == 0) return null
      Log.i(TAG, "decoded ${count / rate}s of audio from $path at ${rate}Hz")
      return Pcm(out.copyOf(count), rate)
    } catch (e: Throwable) {
      Log.w(TAG, "could not decode audio: $path", e)
      return null
    } finally {
      try {
        codec?.stop()
      } catch (_: Throwable) {
      }
      try {
        codec?.release()
      } catch (_: Throwable) {
      }
      extractor.release()
    }
  }
}
