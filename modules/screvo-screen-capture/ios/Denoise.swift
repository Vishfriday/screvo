import Foundation

/**
 Noise cancellation for a recording's own sound — the iOS half of the Android
 `Denoise.kt`.

 A screen recording made with the microphone on picks up whatever the room was
 doing: a fan, traffic, the hum of a laptop. All of that is *steady* — it is
 there in the gaps between words just as much as under them. That is what makes
 it removable, and it is the whole idea here.

 Three stages, each optional:

  1. A high-pass filter, which takes out desk rumble and handling thumps below
     the range a voice actually occupies.
  2. Spectral gating, the real work. The signal is cut into overlapping frames
     and transformed to frequencies; the quiet end of each frequency's own
     distribution across the whole recording is taken as that frequency's noise
     floor; and every frame is then scaled down towards that floor. Because the
     floor is learned per frequency, a 50Hz hum and a hissy 8kHz fan are each
     removed by the amount *they* need, and speech — which is loud and moves —
     survives.
  3. A downward expander, which pushes the remaining gaps between phrases the
     rest of the way down.

 Nothing here is ever allowed to silence a band completely. Gating a frequency
 to true zero is what produces the warbling "musical noise" that makes cheap
 noise reduction sound worse than the noise did, so a floor is always left in,
 and the gains are smoothed across neighbouring frequencies and frames.

 The constants are deliberately identical to the Kotlin, so a recording cleaned
 on either platform comes out the same.
 */
public enum Denoise {

    /// frame and hop for the short-time transform; hop = frame/4 keeps Hann well-behaved
    private static let frame = 1024
    private static let hop = 256
    private static let bins = 513

    /// frames sampled to learn the noise floor — plenty for a stable estimate
    private static let profileFrames = 1500

    /// the quantile of each bin's own distribution taken as its noise floor
    private static let profileQuantile = 0.15

    public struct Settings {
        public let enabled: Bool
        /// 0 = barely touch it, 1 = as hard as this can push without artefacts
        public let strength: Double
        public let highPass: Bool
        public let gate: Bool

        public init(enabled: Bool, strength: Double, highPass: Bool, gate: Bool) {
            self.enabled = enabled
            self.strength = strength
            self.highPass = highPass
            self.gate = gate
        }
    }

    /// Cleans a mono signal and returns the result, leaving the input untouched
    /// so a caller can still offer the original for comparison.
    public static func apply(_ pcm: [Int16], sampleRate: Int, settings: Settings) -> [Int16] {
        guard settings.enabled, !pcm.isEmpty else { return pcm }
        let strength = min(max(settings.strength, 0), 1)

        var x = pcm.map { Double($0) / 32768.0 }
        if settings.highPass { x = highPassed(x, rate: sampleRate, cutoffHz: 95) }
        if strength > 0.01 { x = spectralGate(x, strength: strength) }
        if settings.gate { x = expanded(x, rate: sampleRate, strength: strength) }

        return x.map { Int16(min(max($0 * 32768.0, -32768), 32767)) }
    }

    // MARK: - high-pass

    /// One biquad, Butterworth-flavoured (Q = 1/sqrt 2), run forwards once.
    private static func highPassed(_ x: [Double], rate: Int, cutoffHz: Double) -> [Double] {
        let w0 = 2.0 * Double.pi * cutoffHz / Double(rate)
        let q = 0.70710678
        let alpha = sin(w0) / (2.0 * q)
        let c = cos(w0)

        let b0 = (1.0 + c) / 2.0
        let b1 = -(1.0 + c)
        let b2 = (1.0 + c) / 2.0
        let a0 = 1.0 + alpha
        let a1 = -2.0 * c
        let a2 = 1.0 - alpha

        var out = [Double](repeating: 0, count: x.count)
        var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0
        for i in 0..<x.count {
            let xn = x[i]
            let yn = (b0 / a0) * xn + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2
            out[i] = yn
            x2 = x1; x1 = xn
            y2 = y1; y1 = yn
        }
        return out
    }

    // MARK: - spectral gating

    private static func hann(_ n: Int) -> [Double] {
        (0..<n).map { 0.5 - 0.5 * cos(2.0 * Double.pi * Double($0) / Double(n)) }
    }

    private static func spectralGate(_ x: [Double], strength: Double) -> [Double] {
        guard x.count >= frame * 2 else { return x }
        let window = hann(frame)
        let fft = Fft(frame)
        let frameCount = (x.count - frame) / hop + 1
        guard frameCount >= 4 else { return x }

        let noise = noiseProfile(x, window: window, fft: fft, frameCount: frameCount)

        // How far above its own floor a frequency has to be before it counts as
        // signal, and how much is left behind when it does not.
        let overSubtract = 1.0 + 2.2 * strength
        let floorGain = 0.32 - 0.28 * strength

        var out = [Double](repeating: 0, count: x.count)
        var norm = [Double](repeating: 0, count: x.count)
        var re = [Double](repeating: 0, count: frame)
        var im = [Double](repeating: 0, count: frame)
        var gain = [Double](repeating: 0, count: bins)
        var smoothed = [Double](repeating: 0, count: bins)
        var previous: [Double]? = nil

        for f in 0..<frameCount {
            let at = f * hop
            for i in 0..<frame {
                re[i] = x[at + i] * window[i]
                im[i] = 0
            }
            fft.forward(&re, &im)

            for b in 0..<bins {
                let mag = (re[b] * re[b] + im[b] * im[b]).squareRoot()
                let threshold = noise[b] * overSubtract
                gain[b] = mag <= 1e-12 ? floorGain : max(floorGain, (mag - threshold) / mag)
            }

            // smoothing across neighbouring bins, then across time, is what keeps
            // the result sounding like a room with the noise turned down rather
            // than a swarm of tones switching on and off
            for b in 0..<bins {
                let lo = max(0, b - 2)
                let hi = min(bins - 1, b + 2)
                var sum = 0.0
                for k in lo...hi { sum += gain[k] }
                smoothed[b] = sum / Double(hi - lo + 1)
            }
            // the harder this pushes, the more it leans on the previous frame's
            // gains: aggressive settings are exactly where bins start flickering
            // between open and shut, and that flicker is what musical noise is
            let now = 0.65 - 0.20 * strength
            if let last = previous {
                for b in 0..<bins { smoothed[b] = now * smoothed[b] + (1 - now) * last[b] }
            }
            previous = smoothed

            for b in 0..<bins {
                let g = smoothed[b]
                re[b] *= g
                im[b] *= g
                // the transform is of a real signal, so the upper half mirrors the lower
                if b >= 1 && b < bins - 1 {
                    let mirror = frame - b
                    re[mirror] *= g
                    im[mirror] *= g
                }
            }

            fft.inverse(&re, &im)
            for i in 0..<frame {
                out[at + i] += re[i] * window[i]
                norm[at + i] += window[i] * window[i]
            }
        }

        // The first and last frames are covered by fewer overlaps than the middle,
        // so dividing straight through by the accumulated window would amplify the
        // ends enormously. Each sample is instead blended towards the original by
        // how fully it was covered, which both fixes the ends and leaves no seam.
        let steady = norm.max() ?? 0
        guard steady > 1e-9 else { return x }
        for i in 0..<out.count {
            let cover = min(max(norm[i] / steady, 0), 1)
            let recon = norm[i] > 1e-9 ? out[i] / norm[i] : 0
            out[i] = recon * cover + x[i] * (1 - cover)
        }
        return out
    }

    /// The noise floor of each frequency, learned from the recording itself.
    ///
    /// Frames are sampled across the whole signal rather than taken from one
    /// spot, so this never depends on the user having been quiet at the start,
    /// and the quiet end of each bin's distribution is what gets used.
    private static func noiseProfile(_ x: [Double], window: [Double], fft: Fft, frameCount: Int) -> [Double] {
        let take = min(frameCount, profileFrames)
        let step = max(1, frameCount / take)
        var rows: [[Double]] = []
        rows.reserveCapacity(take)
        var re = [Double](repeating: 0, count: frame)
        var im = [Double](repeating: 0, count: frame)

        var f = 0
        while f < frameCount && rows.count < take {
            let at = f * hop
            for i in 0..<frame {
                re[i] = x[at + i] * window[i]
                im[i] = 0
            }
            fft.forward(&re, &im)
            var row = [Double](repeating: 0, count: bins)
            for b in 0..<bins { row[b] = (re[b] * re[b] + im[b] * im[b]).squareRoot() }
            rows.append(row)
            f += step
        }

        var profile = [Double](repeating: 0, count: bins)
        guard !rows.isEmpty else { return profile }
        let index = Int(Double(rows.count - 1) * profileQuantile)
        var column = [Double](repeating: 0, count: rows.count)
        for b in 0..<bins {
            for r in 0..<rows.count { column[r] = rows[r][b] }
            column.sort()
            profile[b] = column[index]
        }
        return profile
    }

    // MARK: - expander

    /// Pushes what is left in the gaps further down, with a fast attack and a
    /// slow release so it opens the instant someone speaks and closes gently
    /// afterwards instead of chopping the tail off every word.
    private static func expanded(_ x: [Double], rate: Int, strength: Double) -> [Double] {
        let attack = exp(-1.0 / (0.005 * Double(rate)))
        let release = exp(-1.0 / (0.120 * Double(rate)))
        let threshold = 0.010 + 0.020 * strength
        let depth = 0.25 - 0.20 * strength

        var out = [Double](repeating: 0, count: x.count)
        var env = 0.0
        for i in 0..<x.count {
            let a = abs(x[i])
            env = a > env ? attack * env + (1 - attack) * a : release * env + (1 - release) * a
            let g = env >= threshold ? 1.0 : max(depth, env / threshold)
            out[i] = x[i] * g
        }
        return out
    }

    // MARK: - FFT

    /// In-place iterative radix-2 Cooley-Tukey, with the twiddles worked out once.
    private final class Fft {
        private let n: Int
        private let levels: Int
        private let cosTable: [Double]
        private let sinTable: [Double]

        init(_ n: Int) {
            precondition(n.nonzeroBitCount == 1, "FFT length must be a power of two")
            self.n = n
            self.levels = n.trailingZeroBitCount
            self.cosTable = (0..<(n / 2)).map { cos(2.0 * Double.pi * Double($0) / Double(n)) }
            self.sinTable = (0..<(n / 2)).map { sin(2.0 * Double.pi * Double($0) / Double(n)) }
        }

        func forward(_ re: inout [Double], _ im: inout [Double]) {
            for i in 0..<n {
                let j = Int(UInt32(i).reversedBits >> (32 - UInt32(levels)))
                if j > i {
                    re.swapAt(i, j)
                    im.swapAt(i, j)
                }
            }
            var size = 2
            while size <= n {
                let half = size / 2
                let stride = n / size
                var i = 0
                while i < n {
                    var j = i
                    var k = 0
                    while j < i + half {
                        let l = j + half
                        let c = cosTable[k]
                        let s = -sinTable[k]
                        let tre = re[l] * c - im[l] * s
                        let tim = re[l] * s + im[l] * c
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

        /// The forward transform on conjugated input, conjugated back and scaled.
        func inverse(_ re: inout [Double], _ im: inout [Double]) {
            for i in 0..<n { im[i] = -im[i] }
            forward(&re, &im)
            let scale = 1.0 / Double(n)
            for i in 0..<n {
                re[i] *= scale
                im[i] = -im[i] * scale
            }
        }
    }
}

private extension UInt32 {
    /// Bit-reversal, matching Java's Integer.reverse so both platforms index
    /// the butterflies identically.
    var reversedBits: UInt32 {
        var v = self
        v = (v >> 16) | (v << 16)
        v = ((v & 0xff00ff00) >> 8) | ((v & 0x00ff00ff) << 8)
        v = ((v & 0xf0f0f0f0) >> 4) | ((v & 0x0f0f0f0f) << 4)
        v = ((v & 0xcccccccc) >> 2) | ((v & 0x33333333) << 2)
        v = ((v & 0xaaaaaaaa) >> 1) | ((v & 0x55555555) << 1)
        return v
    }
}
