import AVFoundation
import Foundation

/**
 Decodes any audio iOS can read into mono 16-bit PCM — the counterpart of the
 Android `AudioDecoder.kt`, which does the same through MediaCodec.

 The mixer downstream only speaks raw PCM, so whatever arrives — the audio track
 of a screen recording, an m4a the user picked as a music bed — is brought to
 one shape here: mono, signed 16-bit, at whatever rate the file was encoded at.
 The caller resamples to the rate it is mixing into.
 */
enum AudioDecoder {

    struct Pcm {
        let samples: [Int16]
        let sampleRate: Int
    }

    /// Decodes up to `maxSeconds`. Returns nil when the file has no audio track
    /// or cannot be read, so the caller can carry on without it rather than
    /// failing the whole export.
    static func decode(path: String, maxSeconds: Double = 600) -> Pcm? {
        let url = URL(fileURLWithPath: path)
        let asset = AVURLAsset(url: url)
        guard let track = asset.tracks(withMediaType: .audio).first else { return nil }

        // whatever the source rate is, ask for mono float and convert — asking
        // the reader for Int16 directly is not supported on every format
        let rate = Int(track.naturalTimeScale) > 0 ? 44_100 : 44_100
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
            AVNumberOfChannelsKey: 1,
            AVSampleRateKey: rate,
        ]

        guard let reader = try? AVAssetReader(asset: asset) else { return nil }
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
        guard reader.canAdd(output) else { return nil }
        reader.add(output)
        guard reader.startReading() else { return nil }

        let cap = Int(maxSeconds * Double(rate))
        var out = [Int16]()
        out.reserveCapacity(min(cap, rate * 30))

        while out.count < cap, let buffer = output.copyNextSampleBuffer() {
            guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
            var length = 0
            var pointer: UnsafeMutablePointer<Int8>?
            guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil,
                                              totalLengthOut: &length, dataPointerOut: &pointer) == kCMBlockBufferNoErr,
                  let raw = pointer else { continue }

            raw.withMemoryRebound(to: Float.self, capacity: length / MemoryLayout<Float>.size) { floats in
                let count = min(length / MemoryLayout<Float>.size, cap - out.count)
                for i in 0..<count {
                    let v = max(-1, min(1, floats[i]))
                    out.append(Int16(v * 32767))
                }
            }
        }
        reader.cancelReading()

        guard !out.isEmpty else { return nil }
        return Pcm(samples: out, sampleRate: rate)
    }

    /// Wraps mono 16-bit samples in a RIFF header so a player will take them.
    static func wav(_ pcm: [Int16], rate: Int) -> Data {
        var data = Data()
        let bytes = pcm.count * 2
        func ascii(_ s: String) { data.append(contentsOf: Array(s.utf8)) }
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }

        ascii("RIFF"); u32(UInt32(36 + bytes)); ascii("WAVE")
        ascii("fmt "); u32(16); u16(1); u16(1)
        u32(UInt32(rate)); u32(UInt32(rate * 2)); u16(2); u16(16)
        ascii("data"); u32(UInt32(bytes))
        for s in pcm { withUnsafeBytes(of: s.littleEndian) { data.append(contentsOf: $0) } }
        return data
    }
}
