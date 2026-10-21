package app.screvo.capture

import android.util.Log
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.PI

/**
 * Noise cancellation for a recording's own sound.
 *
 * A screen recording made with the microphone on picks up whatever the room was
 * doing — a fan, traffic, the hum of a laptop. All of that is *steady*: it is
 * there in the gaps between words just as much as under them. That is what makes
 * it removable, and it is the whole idea here.
 *
 * Three stages, each optional:
 *
 *  1. A high-pass filter, which takes out desk rumble and handling thumps below
 *     the range a voice actually occupies.
 *  2. Spectral gating, the real work. The signal is cut into overlapping frames
 *     and transformed to frequencies; the quiet end of each frequency's own
 *     distribution across the whole recording is taken as that frequency's noise
 *     floor; and every frame is then scaled down towards that floor. Because the
 *     floor is learned per frequency, a 50Hz hum and a hissy 8kHz fan are each
 *     removed by the amount *they* need, and speech — which is loud and moves —
 *     survives.
 *  3. A downward expander, which pushes the remaining gaps between phrases the
 *     rest of the way down.
 *
 * Nothing here is ever allowed to silence a band completely. Gating a frequency
 * to true zero is what produces the warbling "musical noise" that makes cheap
 * noise reduction sound worse than the noise did, so a floor is always left in,
 * and the gains are smoothed across neighbouring frequencies and frames.
 */
object Denoise {

  private const val TAG = "ScrevoCut"

  /** frame and hop for the short-time transform; hop = frame/4 keeps Hann well-behaved */
  private const val FRAME = 1024
  private const val HOP = FRAME / 4
  private const val BINS = FRAME / 2 + 1

  /** frames sampled to learn the noise floor — plenty for a stable estimate */
  private const val PROFILE_FRAMES = 1500

  /** the quantile of each bin's own distribution taken as its noise floor */
  private const val PROFILE_QUANTILE = 0.15

  data class Settings(
    val enabled: Boolean,
    /** 0 = barely touch it, 1 = as hard as this can push without artefacts */
    val strength: Double,
    val highPass: Boolean,
    val gate: Boolean,
  )

  /**
   * Cleans a mono signal in place-ish and returns the result. The input is left
   * untouched, so a caller can still offer the original for comparison.
   */
  fun apply(pcm: ShortArray, sampleRate: Int, settings: Settings): ShortArray {
    if (!settings.enabled || pcm.isEmpty()) return pcm
    val strength = settings.strength.coerceIn(0.0, 1.0)

    var x = DoubleArray(pcm.size) { pcm[it].toDouble() / 32768.0 }
    if (settings.highPass) x = highPass(x, sampleRate, 95.0)
    if (strength > 0.01) x = spectralGate(x, strength)
    if (settings.gate) x = expander(x, sampleRate, strength)

    val out = ShortArray(x.size)
    for (i in x.indices) out[i] = (x[i] * 32768.0).coerceIn(-32768.0, 32767.0).toInt().toShort()
    Log.i(TAG, "denoise: ${pcm.size / sampleRate}s at strength $strength, hp=${settings.highPass}, gate=${settings.gate}")
    return out
  }

  // ---------------------------------------------------------------- high-pass

  /** One biquad, Butterworth-flavoured (Q = 1/sqrt 2), run forwards once. */
  private fun highPass(x: DoubleArray, rate: Int, cutoffHz: Double): DoubleArray {
    val w0 = 2.0 * PI * cutoffHz / rate
    val q = 0.70710678
    val alpha = sin(w0) / (2.0 * q)
    val c = cos(w0)

    val b0 = (1.0 + c) / 2.0
    val b1 = -(1.0 + c)
    val b2 = (1.0 + c) / 2.0
    val a0 = 1.0 + alpha
    val a1 = -2.0 * c
    val a2 = 1.0 - alpha

    val out = DoubleArray(x.size)
    var x1 = 0.0; var x2 = 0.0; var y1 = 0.0; var y2 = 0.0
    for (i in x.indices) {
      val xn = x[i]
      val yn = (b0 / a0) * xn + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2
      out[i] = yn
      x2 = x1; x1 = xn
      y2 = y1; y1 = yn
    }
    return out
  }

  // ----------------------------------------------------------- spectral gating

  private fun hann(n: Int) = DoubleArray(n) { 0.5 - 0.5 * cos(2.0 * PI * it / n) }

  private fun spectralGate(x: DoubleArray, strength: Double): DoubleArray {
    if (x.size < FRAME * 2) return x
    val window = hann(FRAME)
    val fft = Fft(FRAME)
    val frameCount = (x.size - FRAME) / HOP + 1
    if (frameCount < 4) return x

    val noise = noiseProfile(x, window, fft, frameCount)

    // How far above its own floor a frequency has to be before it counts as
    // signal, and how much is left behind when it does not.
    val overSubtract = 1.0 + 2.2 * strength
    val floorGain = 0.32 - 0.28 * strength

    val out = DoubleArray(x.size)
    val norm = DoubleArray(x.size)
    val re = DoubleArray(FRAME)
    val im = DoubleArray(FRAME)
    val gain = DoubleArray(BINS)
    val smoothed = DoubleArray(BINS)
    var previous: DoubleArray? = null

    for (f in 0 until frameCount) {
      val at = f * HOP
      for (i in 0 until FRAME) {
        re[i] = x[at + i] * window[i]
        im[i] = 0.0
      }
      fft.forward(re, im)

      for (b in 0 until BINS) {
        val mag = sqrt(re[b] * re[b] + im[b] * im[b])
        val threshold = noise[b] * overSubtract
        gain[b] = if (mag <= 1e-12) floorGain else max(floorGain, (mag - threshold) / mag)
      }

      // smoothing across neighbouring bins, then across time, is what keeps the
      // result sounding like a room with the noise turned down rather than a
      // swarm of tones switching on and off
      for (b in 0 until BINS) {
        val lo = max(0, b - 2)
        val hi = min(BINS - 1, b + 2)
        var sum = 0.0
        for (k in lo..hi) sum += gain[k]
        smoothed[b] = sum / (hi - lo + 1)
      }
      // the harder this pushes, the more it leans on the previous frame's gains:
      // aggressive settings are exactly where bins start flickering between open
      // and shut, and that flicker is what musical noise is
      val now = 0.65 - 0.20 * strength
      val last = previous
      if (last != null) for (b in 0 until BINS) smoothed[b] = now * smoothed[b] + (1 - now) * last[b]
      previous = smoothed.copyOf()

      for (b in 0 until BINS) {
        val g = smoothed[b]
        re[b] *= g
        im[b] *= g
        // the transform is of a real signal, so the upper half mirrors the lower
        if (b in 1 until BINS - 1) {
          val mirror = FRAME - b
          re[mirror] *= g
          im[mirror] *= g
        }
      }

      fft.inverse(re, im)
      for (i in 0 until FRAME) {
        out[at + i] += re[i] * window[i]
        norm[at + i] += window[i] * window[i]
      }
    }

    // The first and last frames are covered by fewer overlaps than the middle,
    // so dividing straight through by the accumulated window would amplify the
    // ends enormously. Each sample is instead blended towards the original by
    // how fully it was covered, which both fixes the ends and leaves no seam.
    var steady = 0.0
    for (v in norm) if (v > steady) steady = v
    if (steady <= 1e-9) return x
    for (i in out.indices) {
      val cover = (norm[i] / steady).coerceIn(0.0, 1.0)
      val recon = if (norm[i] > 1e-9) out[i] / norm[i] else 0.0
      out[i] = recon * cover + x[i] * (1.0 - cover)
    }
    return out
  }

  /**
   * The noise floor of each frequency, learned from the recording itself.
   *
   * Frames are sampled across the whole signal rather than taken from one spot,
   * so this never depends on the user having been quiet at the start, and the
   * quiet end of each bin's distribution is what gets used — a frequency that
   * carries speech some of the time is still mostly silence, so its low quantile
   * is the noise under it.
   */
  private fun noiseProfile(x: DoubleArray, window: DoubleArray, fft: Fft, frameCount: Int): DoubleArray {
    val take = min(frameCount, PROFILE_FRAMES)
    val step = max(1, frameCount / take)
    val rows = ArrayList<DoubleArray>(take)
    val re = DoubleArray(FRAME)
    val im = DoubleArray(FRAME)

    var f = 0
    while (f < frameCount && rows.size < take) {
      val at = f * HOP
      for (i in 0 until FRAME) {
        re[i] = x[at + i] * window[i]
        im[i] = 0.0
      }
      fft.forward(re, im)
      val row = DoubleArray(BINS)
      for (b in 0 until BINS) row[b] = sqrt(re[b] * re[b] + im[b] * im[b])
      rows.add(row)
      f += step
    }

    val profile = DoubleArray(BINS)
    if (rows.isEmpty()) return profile
    val column = DoubleArray(rows.size)
    val index = ((rows.size - 1) * PROFILE_QUANTILE).toInt()
    for (b in 0 until BINS) {
      for (r in rows.indices) column[r] = rows[r][b]
      column.sort()
      profile[b] = column[index]
    }
    return profile
  }

  // -------------------------------------------------------------- expander

  /**
   * Pushes what is left in the gaps further down.
   *
   * This follows the envelope with a fast attack and a slow release, so it opens
   * the instant someone speaks and closes gently afterwards instead of chopping
   * the tail off every word.
   */
  private fun expander(x: DoubleArray, rate: Int, strength: Double): DoubleArray {
    val attack = exp(-1.0 / (0.005 * rate))
    val release = exp(-1.0 / (0.120 * rate))
    val threshold = 0.010 + 0.020 * strength
    val depth = 0.25 - 0.20 * strength

    val out = DoubleArray(x.size)
    var env = 0.0
    for (i in x.indices) {
      val a = abs(x[i])
      env = if (a > env) attack * env + (1 - attack) * a else release * env + (1 - release) * a
      val g = if (env >= threshold) 1.0 else max(depth, env / threshold)
      out[i] = x[i] * g
    }
    return out
  }

  // ------------------------------------------------------------------- FFT

  /** In-place iterative radix-2 Cooley-Tukey, with the twiddles worked out once. */
  private class Fft(private val n: Int) {
    private val levels = Integer.numberOfTrailingZeros(n)
    private val cosTable = DoubleArray(n / 2) { cos(2.0 * PI * it / n) }
    private val sinTable = DoubleArray(n / 2) { sin(2.0 * PI * it / n) }

    init {
      require(Integer.bitCount(n) == 1) { "FFT length must be a power of two" }
    }

    fun forward(re: DoubleArray, im: DoubleArray) {
      for (i in 0 until n) {
        val j = Integer.reverse(i) ushr (32 - levels)
        if (j > i) {
          var t = re[i]; re[i] = re[j]; re[j] = t
          t = im[i]; im[i] = im[j]; im[j] = t
        }
      }
      var size = 2
      while (size <= n) {
        val half = size / 2
        val stride = n / size
        var i = 0
        while (i < n) {
          var j = i
          var k = 0
          while (j < i + half) {
            val l = j + half
            val c = cosTable[k]
            val s = -sinTable[k]
            val tre = re[l] * c - im[l] * s
            val tim = re[l] * s + im[l] * c
            re[l] = re[j] - tre
            im[l] = im[j] - tim
            re[j] += tre
            im[j] += tim
            j += 1
            k += stride
          }
          i += size
        }
        size *= 2
      }
    }

    /** The forward transform on conjugated input, conjugated back and scaled. */
    fun inverse(re: DoubleArray, im: DoubleArray) {
      for (i in 0 until n) im[i] = -im[i]
      forward(re, im)
      val scale = 1.0 / n
      for (i in 0 until n) {
        re[i] *= scale
        im[i] = -im[i] * scale
      }
    }
  }
}
