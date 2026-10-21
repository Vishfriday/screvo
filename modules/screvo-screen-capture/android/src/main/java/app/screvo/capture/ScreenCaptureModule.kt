package app.screvo.capture

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private const val REQUEST_CODE = 9771

class CaptureUnavailableException(message: String) : CodedException(message)

/**
 * In-app screen recording for Screvo.
 *
 * `start()` asks the system for the screen capture permission — the dialog the
 * user confirms once per recording — then hands the result to a foreground
 * service that does the capturing. `stop()` returns the finished file.
 */
class ScreenCaptureModule : Module() {
  private var startPromise: Promise? = null
  private var stopPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("ScrevoScreenCapture")

    Function("isAvailable") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP
    }

    Function("isRecording") {
      ScreenCaptureService.recording
    }

    AsyncFunction("start") { withAudio: Boolean, longEdge: Int, promise: Promise ->
      if (ScreenCaptureService.recording) {
        promise.reject(CaptureUnavailableException("A recording is already running"))
        return@AsyncFunction
      }
      val activity = appContext.activityProvider?.currentActivity
      if (activity == null) {
        promise.reject(CaptureUnavailableException("Screvo is not in the foreground"))
        return@AsyncFunction
      }
      startPromise = promise
      wireServiceCallbacks(withAudio, longEdge)
      val manager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      activity.startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_CODE)
    }

    /**
     * Writes the chosen spans of a recording into a new MP4, copying the
     * compressed samples rather than re-encoding them.
     */
    AsyncFunction("exportCut") { sourceUri: String, spans: List<Map<String, Double>>, voice: List<Map<String, Any?>>, options: Map<String, Any?>?, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw CaptureUnavailableException("No app context")
        val source = File(sourceUri.removePrefix("file://"))
        if (!source.exists()) throw CaptureUnavailableException("The recording file is gone")

        val wanted = spans.mapNotNull { span ->
          val start = span["start"] ?: return@mapNotNull null
          val end = span["end"] ?: return@mapNotNull null
          if (end <= start) null
          else CutExporter.Span((start * 1_000_000).toLong(), (end * 1_000_000).toLong())
        }
        if (wanted.isEmpty()) throw CaptureUnavailableException("This edit has no spans to export")
        android.util.Log.i(
          "ScrevoCut",
          "export asked for ${spans.size} spans, using ${wanted.size}: " +
            wanted.joinToString { "${it.startUs / 1000}..${it.endUs / 1000}ms" },
        )

        val speed = ((options?.get("speed") as? Number)?.toDouble() ?: 1.0).coerceIn(0.1, 10.0)
        // the narration and the bed are laid on the finished clock, which the
        // speed has already shortened
        val totalSec = wanted.sumOf { (it.endUs - it.startUs) / 1_000_000.0 } / speed
        val lines = voice.mapNotNull { entry ->
          val path = (entry["uri"] as? String)?.removePrefix("file://") ?: return@mapNotNull null
          val at = ((entry["at"] as? Number)?.toDouble() ?: return@mapNotNull null) / speed
          if (File(path).exists()) VoiceTrack.Line(path, at) else null
        }

        // the recording's own sound: cut to the same stretches as the picture,
        // cleaned, and mixed under the narration
        val audioMap = options?.get("audio") as? Map<*, *>
        val sourceVolume = (audioMap?.get("sourceVolume") as? Number)?.toDouble() ?: 0.0
        // a sped-up export drops it: a copy cannot retime sound, and chipmunked
        // room noise is worse than none
        val roomAudio = if (sourceVolume > 0.001 && speed == 1.0) {
          val placed = CutExporter.plan(source.absolutePath, wanted, speed)
          SourceAudio.prepare(source.absolutePath, placed, sourceVolume, denoiseOf(audioMap))
        } else null

        val musicMap = options?.get("music") as? Map<*, *>
        val musicPath = (musicMap?.get("uri") as? String)?.removePrefix("file://")
        val music = if (musicPath != null && File(musicPath).exists()) {
          VoiceTrack.Music(
            path = musicPath,
            volume = (musicMap["volume"] as? Number)?.toDouble() ?: 0.22,
            loop = musicMap["loop"] as? Boolean ?: true,
            fadeIn = musicMap["fadeIn"] as? Boolean ?: true,
            fadeOut = musicMap["fadeOut"] as? Boolean ?: true,
          )
        } else null

        val narration =
          if (lines.isEmpty() && music == null && roomAudio == null) null
          else VoiceTrack.build(lines, totalSec, music, roomAudio)

        val dir = File(context.filesDir, "exports").apply { mkdirs() }
        val out = File(dir, "cut_${System.currentTimeMillis()}.mp4")
        CutExporter.export(source.absolutePath, wanted, out.absolutePath, narration, speed)
        promise.resolve(mapOf("uri" to "file://${out.absolutePath}", "bytes" to out.length().toDouble()))
      } catch (e: Throwable) {
        android.util.Log.e("ScrevoCut", "export failed", e)
        promise.reject(CaptureUnavailableException(e.message ?: "The cut could not be written"))
      }
    }

    /**
     * Renders a few seconds of the recording's own sound, cleaned, as a WAV the
     * app can play. Noise reduction is the one setting nobody can judge from a
     * slider, so the editor offers it to listen to.
     */
    AsyncFunction("denoisePreview") { sourceUri: String, atSec: Double, lengthSec: Double, settings: Map<String, Any?>, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw CaptureUnavailableException("No app context")
        val file = File(sourceUri.removePrefix("file://"))
        if (!file.exists()) throw CaptureUnavailableException("The recording file is gone")

        val length = lengthSec.coerceIn(1.0, 20.0)
        val decoded = AudioDecoder.decode(file.absolutePath, atSec + length + 1.0)
          ?: throw CaptureUnavailableException("This recording has no sound to clean")
        val rate = decoded.sampleRate
        val from = (atSec * rate).toInt().coerceIn(0, decoded.samples.size)
        val count = minOf((length * rate).toInt(), decoded.samples.size - from)
        if (count <= 0) throw CaptureUnavailableException("There is no sound at this point")

        val slice = decoded.samples.copyOfRange(from, from + count)
        val clean = Denoise.apply(slice, rate, denoiseOf(settings))

        val dir = File(context.filesDir, "previews").apply { mkdirs() }
        val out = File(dir, "denoise_${System.currentTimeMillis()}.wav")
        out.writeBytes(wavOf(clean, rate))
        promise.resolve(mapOf("uri" to "file://${out.absolutePath}", "durationSec" to count.toDouble() / rate))
      } catch (e: Throwable) {
        android.util.Log.e("ScrevoCut", "denoise preview failed", e)
        promise.reject(CaptureUnavailableException(e.message ?: "That sample could not be cleaned"))
      }
    }

    /** Puts a finished file into the media library, for Google Photos and friends. */
    AsyncFunction("saveToGallery") { fileUri: String, displayName: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw CaptureUnavailableException("No app context")
        val uri = GallerySaver.save(context, fileUri.removePrefix("file://"), displayName)
        promise.resolve(mapOf("uri" to uri))
      } catch (e: Throwable) {
        android.util.Log.e("ScrevoCut", "gallery save failed", e)
        promise.reject(CaptureUnavailableException(e.message ?: "The gallery would not take this video"))
      }
    }

    AsyncFunction("stop") { promise: Promise ->
      if (!ScreenCaptureService.recording) {
        promise.reject(CaptureUnavailableException("Nothing is being recorded"))
        return@AsyncFunction
      }
      stopPromise = promise
      val context = appContext.reactContext ?: return@AsyncFunction
      context.startService(Intent(context, ScreenCaptureService::class.java).setAction(ScreenCaptureService.ACTION_STOP))
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = startPromise
      startPromise = null
      val data = payload.data
      if (payload.resultCode != Activity.RESULT_OK || data == null) {
        promise?.reject(CaptureUnavailableException("Screen recording was not allowed"))
        return@OnActivityResult
      }
      // the promise resolves from the service, once the encoder is actually rolling
      startPromise = promise
      val context = appContext.reactContext ?: return@OnActivityResult
      val intent = Intent(context, ScreenCaptureService::class.java)
        .setAction(ScreenCaptureService.ACTION_START)
        .putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, payload.resultCode)
        .putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
        .putExtra(ScreenCaptureService.EXTRA_WITH_AUDIO, pendingWithAudio)
        .putExtra(ScreenCaptureService.EXTRA_LONG_EDGE, pendingLongEdge)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    OnDestroy {
      ScreenCaptureService.onStarted = null
      ScreenCaptureService.onStopped = null
      ScreenCaptureService.onFailed = null
    }
  }

  /** Reads the cleaning settings the editor sent, with sane defaults. */
  private fun denoiseOf(map: Map<*, *>?): Denoise.Settings = Denoise.Settings(
    enabled = map?.get("enabled") as? Boolean ?: false,
    strength = (map?.get("strength") as? Number)?.toDouble() ?: 0.6,
    highPass = map?.get("highPass") as? Boolean ?: true,
    gate = map?.get("gate") as? Boolean ?: false,
  )

  /** Wraps mono 16-bit samples in a RIFF header so a player will take them. */
  private fun wavOf(pcm: ShortArray, rate: Int): ByteArray {
    val data = pcm.size * 2
    val buffer = java.nio.ByteBuffer.allocate(44 + data).order(java.nio.ByteOrder.LITTLE_ENDIAN)
    buffer.put("RIFF".toByteArray())
    buffer.putInt(36 + data)
    buffer.put("WAVE".toByteArray())
    buffer.put("fmt ".toByteArray())
    buffer.putInt(16)
    buffer.putShort(1)
    buffer.putShort(1)
    buffer.putInt(rate)
    buffer.putInt(rate * 2)
    buffer.putShort(2)
    buffer.putShort(16)
    buffer.put("data".toByteArray())
    buffer.putInt(data)
    for (v in pcm) buffer.putShort(v)
    return buffer.array()
  }

  private var pendingWithAudio = true
  private var pendingLongEdge = 1920

  private fun wireServiceCallbacks(withAudio: Boolean, longEdge: Int) {
    pendingWithAudio = withAudio
    pendingLongEdge = if (longEdge > 0) longEdge else 1920
    ScreenCaptureService.onStarted = { uri, width, height ->
      startPromise?.resolve(mapOf("uri" to uri, "width" to width, "height" to height))
      startPromise = null
    }
    ScreenCaptureService.onStopped = { uri, elapsedMs ->
      stopPromise?.resolve(mapOf("uri" to uri, "durationSec" to elapsedMs / 1000.0))
      stopPromise = null
    }
    ScreenCaptureService.onFailed = { message ->
      startPromise?.reject(CaptureUnavailableException(message))
      startPromise = null
      stopPromise?.reject(CaptureUnavailableException(message))
      stopPromise = null
    }
  }
}
