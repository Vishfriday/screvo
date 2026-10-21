package app.screvo.capture

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.util.Log
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.max

/**
 * Writes a real file for an edit that until now only existed as playback data.
 *
 * A demo keeps a handful of spans of the recording and drops the rest. This
 * copies the compressed samples of those spans straight into a new MP4 — no
 * decoding and no re-encoding — so a one-minute cut of a three-minute capture
 * takes seconds and loses no quality.
 *
 * The one compromise is where a span can begin. Video samples only decode from
 * a keyframe, so each span starts at the keyframe at or before the requested
 * time; the result can therefore run slightly longer than asked. Starting late
 * would clip the beginning of a beat, which is worse, so it errs early.
 *
 * Speed is applied here too, and it is free: playing a video faster just means
 * its frames carry earlier timestamps, which a copy can rewrite. The one thing
 * it cannot do is retime the recording's own audio — AAC frames are fixed
 * length — so above 1x that track is dropped and the narration takes its place.
 */
object CutExporter {

  private const val TAG = "ScrevoCut"
  private const val MAX_BUFFER = 24 shl 20

  /** a frame's worth of space so the next span cannot share a timestamp */
  private const val FRAME_GAP_US = 33_000L

  /** lead-in worth tolerating to keep a beat whole, before trimming instead */
  private const val MAX_LEAD_IN_US = 2_000_000L

  data class Span(val startUs: Long, val endUs: Long)

  /** Where a span really begins in the source, and how long it runs on the cut. */
  data class Placed(val sourceStartUs: Long, val sourceEndUs: Long, val outStartUs: Long, val outLengthUs: Long)

  /**
   * Chooses the keyframe a span starts from.
   *
   * Video only decodes from a keyframe, so a span begins at the one at or before
   * the time asked for. That keeps the beat whole, but where the screen was
   * static the keyframes are far apart and the lead-in can drag in many seconds
   * of the wrong thing — so past a couple of seconds it takes the next keyframe
   * instead and loses a moment rather than bloating the cut.
   *
   * It reads `sampleTime`, which reports the next sample on ANY selected track,
   * so it is only correct while the video track alone is selected. That holds
   * wherever it is called: `plan` selects nothing else, and the write pass only
   * selects the source audio track when there is no replacement audio at all —
   * and in that case nothing asks `plan` for anything. Select another track
   * before calling this and the planned and written cuts will disagree.
   */
  private fun keyframeFor(extractor: MediaExtractor, span: Span): Long {
    extractor.seekTo(span.startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
    var firstUs = extractor.sampleTime
    if (firstUs >= 0 && span.startUs - firstUs > MAX_LEAD_IN_US) {
      extractor.seekTo(span.startUs, MediaExtractor.SEEK_TO_NEXT_SYNC)
      val nextUs = extractor.sampleTime
      if (nextUs in 0 until span.endUs) {
        firstUs = nextUs
      } else {
        extractor.seekTo(span.startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        firstUs = extractor.sampleTime
      }
    }
    return firstUs
  }

  /**
   * Works out where every span will land before a single sample is written.
   *
   * The recording's own sound has to be cut to exactly the stretches the picture
   * shows, and those are not the stretches that were asked for — each one starts
   * at a keyframe. Running the same choice here, cheaply, means the audio is cut
   * from the same places the video is, so the two cannot drift apart.
   */
  fun plan(sourcePath: String, spans: List<Span>, speed: Double = 1.0): List<Placed> {
    val rate = if (speed > 0.0) speed else 1.0
    val extractor = MediaExtractor()
    val placed = ArrayList<Placed>(spans.size)
    try {
      extractor.setDataSource(sourcePath)
      var videoSrc = -1
      for (i in 0 until extractor.trackCount) {
        val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("video/")) { videoSrc = i; break }
      }
      if (videoSrc < 0) return emptyList()
      extractor.selectTrack(videoSrc)

      var outBaseUs = 0L
      for (span in spans) {
        val firstUs = keyframeFor(extractor, span)
        if (firstUs < 0) continue
        // a span can only ever hold the frames up to its end, so the length it
        // occupies on the cut is settled here and the write pass matches it
        val length = ((span.endUs - firstUs).coerceAtLeast(0L) / rate).toLong()
        placed.add(Placed(firstUs, span.endUs, outBaseUs, length))
        outBaseUs += length + FRAME_GAP_US
      }
    } catch (e: Throwable) {
      Log.w(TAG, "could not plan the cut", e)
      return emptyList()
    } finally {
      extractor.release()
    }
    return placed
  }

  fun export(
    sourcePath: String,
    spans: List<Span>,
    outPath: String,
    voice: VoiceTrack.Encoded? = null,
    speed: Double = 1.0,
  ): String {
    if (spans.isEmpty()) throw IllegalArgumentException("No spans were given to export")
    val rate = if (speed > 0.0) speed else 1.0
    /** a source duration, on the sped-up output clock */
    fun out(us: Long): Long = (us / rate).toLong()

    val extractor = MediaExtractor()
    val muxer: MediaMuxer
    try {
      extractor.setDataSource(sourcePath)
      muxer = MediaMuxer(outPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    } catch (e: Throwable) {
      extractor.release()
      throw e
    }

    var videoSrc = -1
    var audioSrc = -1
    var videoDst = -1
    var audioDst = -1
    var bufferSize = 1 shl 20

    try {
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
          bufferSize = max(bufferSize, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
        }
        if (mime.startsWith("video/") && videoSrc < 0) {
          videoSrc = i
          videoDst = muxer.addTrack(format)
        } else if (mime.startsWith("audio/") && audioSrc < 0 && voice == null && rate == 1.0) {
          audioSrc = i
          audioDst = muxer.addTrack(format)
        }
      }
      if (videoSrc < 0) throw IllegalStateException("The recording has no video track to cut")

      // narration takes the audio track when there is any, because a demo wants
      // the written voice rather than whatever the room sounded like
      var voiceDst = -1
      if (voice != null) voiceDst = muxer.addTrack(voice.format)

      muxer.start()
      // a sample bigger than the buffer makes readSampleData throw, and the
      // reported max input size is not always the truth, so it can grow
      var buffer = ByteBuffer.allocate(bufferSize)
      val info = MediaCodec.BufferInfo()
      var outBaseUs = 0L

      // Both tracks stay selected for the whole pass. The extractor then hands
      // back video and audio interleaved in file order, which is exactly what
      // the muxer wants, and each span needs one seek instead of several.
      extractor.selectTrack(videoSrc)
      if (audioSrc >= 0) extractor.selectTrack(audioSrc)
      if (rate != 1.0) Log.i(TAG, "writing at ${rate}x — source audio dropped")

      if (voice != null && voiceDst >= 0) {
        val voiceInfo = MediaCodec.BufferInfo()
        for (frame in voice.frames) {
          val bytes = ByteBuffer.wrap(frame.bytes)
          voiceInfo.offset = 0
          voiceInfo.size = frame.bytes.size
          voiceInfo.presentationTimeUs = frame.presentationTimeUs
          voiceInfo.flags = frame.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM.inv()
          muxer.writeSampleData(voiceDst, bytes, voiceInfo)
        }
        Log.i(TAG, "wrote ${voice.frames.size} narration frames")
      }

      for ((index, span) in spans.withIndex()) {
        val firstUs = keyframeFor(extractor, span)
        if (firstUs < 0) {
          Log.w(TAG, "span $index at ${span.startUs}us had no samples")
          continue
        }

        var lastUs = firstUs
        var written = 0
        // how far this span reached on the OUTPUT clock, across both tracks: a
        // static screen emits almost no video frames, so audio routinely runs
        // past the last picture, and the next span must start after all of it
        var spanEndOutUs = 0L
        while (true) {
          val track = extractor.sampleTrackIndex
          if (track < 0) break
          val ptsUs = extractor.sampleTime
          if (ptsUs < 0) break
          // the video decides when the span is over; audio that runs past the
          // end is skipped rather than ending the span early
          if (track == videoSrc && ptsUs > span.endUs) break
          if (ptsUs <= span.endUs) {
            var size: Int
            while (true) {
              try {
                size = extractor.readSampleData(buffer, 0)
                break
              } catch (e: IllegalArgumentException) {
                if (buffer.capacity() >= MAX_BUFFER) throw e
                val grown = minOf(MAX_BUFFER, buffer.capacity() * 2)
                Log.w(TAG, "sample did not fit; growing buffer to $grown bytes")
                buffer = ByteBuffer.allocate(grown)
              }
            }
            if (size < 0) break
            info.offset = 0
            info.size = size
            info.presentationTimeUs = outBaseUs + out(ptsUs - firstUs)
            info.flags = extractor.sampleFlags
            muxer.writeSampleData(if (track == videoSrc) videoDst else audioDst, buffer, info)
            spanEndOutUs = max(spanEndOutUs, info.presentationTimeUs)
            if (track == videoSrc) {
              lastUs = ptsUs
              written += 1
            }
          }
          if (!extractor.advance()) break
        }

        val kept = max(0L, lastUs - firstUs)
        Log.i(
          TAG,
          "span $index: ${firstUs / 1000}ms..${lastUs / 1000}ms, $written frames, " +
            "video ${kept / 1000}ms, span ends at ${spanEndOutUs / 1000}ms on the cut",
        )
        // A still screen produces almost no frames, so a beat's last picture can
        // land seconds before the beat should end. The clock advances by the
        // length the beat was meant to run, which simply holds that picture on
        // screen — otherwise the cut collapses to the handful of frames in it.
        val intended = max(0L, span.endUs - firstUs)
        outBaseUs = max(outBaseUs + out(max(kept, intended)), spanEndOutUs) + FRAME_GAP_US
      }

      muxer.stop()
    } finally {
      try {
        muxer.release()
      } catch (_: Throwable) {
      }
      extractor.release()
    }

    val written = File(outPath)
    if (!written.exists() || written.length() <= 0L) {
      throw IllegalStateException("The cut came out empty")
    }
    return outPath
  }
}
