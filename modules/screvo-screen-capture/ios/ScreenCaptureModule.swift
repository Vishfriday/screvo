import ExpoModulesCore
import Foundation

/**
 The iOS half of the Screvo capture module.

 What it does today is the part that ports cleanly: noise cancellation, which is
 pure signal processing and behaves identically to the Android build.

 What it deliberately does *not* do yet is screen recording. On iOS that is not
 a matter of porting MediaProjection — `RPScreenRecorder` can only record the
 app it lives in, so capturing another app needs a Broadcast Upload Extension:
 a separate target, its own entitlements, and a flow the user starts from
 Control Centre rather than from inside Screvo. That reshapes the product, so
 it is a decision rather than a translation, and the module reports the feature
 as unavailable instead of pretending.

 Cutting and gallery writes are likewise absent: `isAvailable` returning false
 and the missing functions make the JavaScript fall back to the paths that do
 work, exactly as it already does on an out-of-date Android build.
 */
public final class ScreenCaptureModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ScrevoScreenCapture")

        // screen capture is not implemented on iOS; the editor reads this and
        // offers importing a recording instead
        Function("isAvailable") { () -> Bool in false }

        Function("isRecording") { () -> Bool in false }

        /// Renders a few seconds of a recording's own sound, cleaned, as a WAV
        /// the app can play. Noise reduction is the one setting nobody can judge
        /// from a slider, so the editor offers it to listen to.
        AsyncFunction("denoisePreview") { (
            sourceUri: String,
            atSec: Double,
            lengthSec: Double,
            settings: [String: Any]
        ) -> [String: Any] in
            let path = sourceUri.replacingOccurrences(of: "file://", with: "")
            guard FileManager.default.fileExists(atPath: path) else {
                throw CaptureUnavailableException("The recording file is gone")
            }

            let length = min(max(lengthSec, 1), 20)
            guard let decoded = AudioDecoder.decode(path: path, maxSeconds: atSec + length + 1) else {
                throw CaptureUnavailableException("This recording has no sound to clean")
            }

            let rate = decoded.sampleRate
            let from = min(max(Int(atSec * Double(rate)), 0), decoded.samples.count)
            let count = min(Int(length * Double(rate)), decoded.samples.count - from)
            guard count > 0 else {
                throw CaptureUnavailableException("There is no sound at this point")
            }

            let slice = Array(decoded.samples[from..<(from + count)])
            let clean = Denoise.apply(slice, sampleRate: rate, settings: Denoise.Settings(
                enabled: settings["enabled"] as? Bool ?? false,
                strength: settings["strength"] as? Double ?? 0.6,
                highPass: settings["highPass"] as? Bool ?? true,
                gate: settings["gate"] as? Bool ?? false
            ))

            let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("previews", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let out = dir.appendingPathComponent("denoise_\(Int(Date().timeIntervalSince1970 * 1000)).wav")
            try AudioDecoder.wav(clean, rate: rate).write(to: out)

            return ["uri": out.absoluteString, "durationSec": Double(count) / Double(rate)]
        }
    }
}

final class CaptureUnavailableException: Exception {
    private let reason: String
    init(_ reason: String) {
        self.reason = reason
        super.init()
    }
    override var description: String { reason }
}
