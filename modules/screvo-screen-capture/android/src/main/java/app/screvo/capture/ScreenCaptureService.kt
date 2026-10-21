package app.screvo.capture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import java.io.File

/**
 * Records the screen with MediaProjection.
 *
 * The capture itself has to live in a foreground service: from Android 10 a
 * projection needs one, and from Android 14 the service must already be in the
 * foreground with the mediaProjection type before the projection is handed out.
 */
class ScreenCaptureService : Service() {
  private var recorder: MediaRecorder? = null
  private var projection: MediaProjection? = null
  private var display: VirtualDisplay? = null
  private var outputFile: File? = null
  private var startedAt = 0L

  companion object {
    const val ACTION_START = "app.screvo.capture.START"
    const val ACTION_STOP = "app.screvo.capture.STOP"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    const val EXTRA_WITH_AUDIO = "withAudio"
    const val EXTRA_LONG_EDGE = "longEdge"

    private const val TAG = "ScrevoCapture"
    private const val CHANNEL_ID = "screvo_capture"
    private const val NOTIFICATION_ID = 4711

    /** Set by the module so it learns when recording starts, stops or fails. */
    var onStarted: ((String, Int, Int) -> Unit)? = null
    var onStopped: ((String, Long) -> Unit)? = null
    var onFailed: ((String) -> Unit)? = null

    /** Whether a recording is running right now. */
    @Volatile
    var recording = false
      private set
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> handleStart(intent)
      ACTION_STOP -> handleStop()
      else -> stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun handleStart(intent: Intent) {
    if (recording) return
    try {
      goToForeground()

      val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
      @Suppress("DEPRECATION")
      val data: Intent = intent.getParcelableExtra(EXTRA_RESULT_DATA)
        ?: throw IllegalStateException("The screen capture permission result was empty")
      val withAudio = intent.getBooleanExtra(EXTRA_WITH_AUDIO, true)
      val wantedLongEdge = intent.getIntExtra(EXTRA_LONG_EDGE, 1920)

      val metrics = screenMetrics()
      val (width, height) = captureSize(metrics.widthPixels, metrics.heightPixels, wantedLongEdge)
      val bitrate = bitrateFor(width, height)

      // not cacheDir: Android empties that whenever it wants storage back, and a
      // recording a project still points at must outlive the next clean-up
      val dir = File(filesDir, "recordings").apply { mkdirs() }
      val file = File(dir, "screvo_${System.currentTimeMillis()}.mp4")
      outputFile = file

      val rec = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
      if (withAudio) rec.setAudioSource(MediaRecorder.AudioSource.MIC)
      rec.setVideoSource(MediaRecorder.VideoSource.SURFACE)
      rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      rec.setOutputFile(file.absolutePath)
      rec.setVideoSize(width, height)
      rec.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
      rec.setVideoEncodingBitRate(bitrate)
      rec.setVideoFrameRate(30)
      if (withAudio) {
        rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        rec.setAudioEncodingBitRate(128_000)
        rec.setAudioSamplingRate(44_100)
      }
      rec.prepare()
      recorder = rec

      val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      val proj = manager.getMediaProjection(resultCode, data)
        ?: throw IllegalStateException("The system refused the screen capture permission")
      // registering a callback is required from Android 14
      proj.registerCallback(object : MediaProjection.Callback() {
        override fun onStop() {
          // the user revoked the projection from the system UI
          if (recording) handleStop()
        }
      }, null)
      projection = proj

      display = proj.createVirtualDisplay(
        "ScrevoCapture",
        width,
        height,
        metrics.densityDpi,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        rec.surface,
        null,
        null,
      )

      rec.start()
      recording = true
      startedAt = System.currentTimeMillis()
      Log.i(TAG, "recording at ${width}x$height, ${bitrate / 1_000_000} Mbps")
      onStarted?.invoke("file://${file.absolutePath}", width, height)
    } catch (e: Throwable) {
      release()
      onFailed?.invoke(e.message ?: "Screen recording could not start")
      stopSelf()
    }
  }

  private fun handleStop() {
    val file = outputFile
    val elapsed = if (startedAt > 0) System.currentTimeMillis() - startedAt else 0L
    try {
      recorder?.stop()
    } catch (_: Throwable) {
      // a recording stopped within a few frames of starting has nothing to write
    }
    release()
    if (file != null && file.exists() && file.length() > 0) {
      onStopped?.invoke("file://${file.absolutePath}", elapsed)
    } else {
      onFailed?.invoke("The recording was too short to save")
    }
    stopForegroundCompat()
    stopSelf()
  }

  private fun release() {
    recording = false
    startedAt = 0L
    try {
      display?.release()
    } catch (_: Throwable) {
    }
    try {
      recorder?.reset()
      recorder?.release()
    } catch (_: Throwable) {
    }
    try {
      projection?.stop()
    } catch (_: Throwable) {
    }
    display = null
    recorder = null
    projection = null
  }

  /**
   * The picture size to record at.
   *
   * A capture can only hold what the panel is already showing, so asking for 4K
   * on a 1080p phone would upscale — more bitrate, no more detail. The target is
   * therefore capped at the display, then capped again at whatever the device's
   * H.264 encoder will actually accept, and finally rounded to even numbers
   * because encoders reject odd ones.
   */
  private fun captureSize(screenW: Int, screenH: Int, wantedLongEdge: Int): Pair<Int, Int> {
    val longEdge = maxOf(screenW, screenH)
    val target = minOf(longEdge, maxOf(640, wantedLongEdge))
    var scale = target.toFloat() / longEdge
    var width = even((screenW * scale).toInt())
    var height = even((screenH * scale).toInt())

    val caps = h264Capabilities()
    if (caps != null) {
      // step down in 10% increments until the encoder stops refusing the size
      var guard = 0
      while (guard < 12 && !caps.isSizeSupported(width, height)) {
        scale *= 0.9f
        width = even((screenW * scale).toInt())
        height = even((screenH * scale).toInt())
        guard += 1
      }
      if (!caps.isSizeSupported(width, height)) {
        // nothing fit — fall back to the one size every encoder handles
        val portrait = screenH >= screenW
        width = if (portrait) 1080 else 1920
        height = if (portrait) 1920 else 1080
      }
    }
    return width to height
  }

  private fun even(v: Int) = v and 0xFFFFFFFE.toInt()

  private fun h264Capabilities(): android.media.MediaCodecInfo.VideoCapabilities? = try {
    MediaCodecList(MediaCodecList.REGULAR_CODECS)
      .codecInfos
      .firstOrNull { it.isEncoder && it.supportedTypes.any { t -> t.equals(MediaFormat.MIMETYPE_VIDEO_AVC, true) } }
      ?.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC)
      ?.videoCapabilities
  } catch (e: Throwable) {
    Log.w(TAG, "could not read encoder capabilities", e)
    null
  }

  /** Roughly 0.1 bits per pixel per frame at 30fps, clamped to something sane. */
  private fun bitrateFor(width: Int, height: Int): Int {
    val bits = (width.toLong() * height.toLong() * 30L * 0.1).toLong()
    return bits.coerceIn(6_000_000L, 60_000_000L).toInt()
  }

  private fun screenMetrics(): DisplayMetrics {
    val metrics = DisplayMetrics()
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = wm.currentWindowMetrics.bounds
      metrics.widthPixels = bounds.width()
      metrics.heightPixels = bounds.height()
      metrics.densityDpi = resources.configuration.densityDpi
    } else {
      @Suppress("DEPRECATION")
      wm.defaultDisplay.getRealMetrics(metrics)
    }
    return metrics
  }

  private fun goToForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Screen recording", NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      nm.createNotificationChannel(channel)
    }
    val notification: Notification = Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Screvo is recording")
      .setContentText("Your screen is being captured for this project")
      .setSmallIcon(android.R.drawable.presence_video_online)
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  override fun onDestroy() {
    if (recording) handleStop() else release()
    super.onDestroy()
  }
}
