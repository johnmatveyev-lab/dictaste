import AVFoundation

final class AudioRecorder {
    var onLevel: ((Float) -> Void)?

    private var engine: AVAudioEngine?
    private var continuation: AsyncStream<AVAudioPCMBuffer>.Continuation?
    private var smoothedLevel: Float = 0

    /// Starts the mic and returns the capture format plus a stream of PCM buffers.
    /// A fresh engine per session picks up input-device changes automatically.
    func start() throws -> (AVAudioFormat, AsyncStream<AVAudioPCMBuffer>) {
        let engine = AVAudioEngine()
        self.engine = engine
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw DictationError.noMicrophone
        }

        let (stream, continuation) = AsyncStream.makeStream(of: AVAudioPCMBuffer.self)
        self.continuation = continuation

        smoothedLevel = 0
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            continuation.yield(buffer)
            guard let self else { return }
            let raw = AudioRecorder.rmsLevel(buffer)
            // Fast attack, slow release — bars jump on speech, fall gently after.
            self.smoothedLevel = raw > self.smoothedLevel
                ? self.smoothedLevel * 0.35 + raw * 0.65
                : self.smoothedLevel * 0.82 + raw * 0.18
            let level = self.smoothedLevel
            DispatchQueue.main.async { self.onLevel?(level) }
        }
        engine.prepare()
        try engine.start()
        return (format, stream)
    }

    func stop() {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        continuation?.finish()
        continuation = nil
    }

    /// RMS mapped to 0…1 across roughly -55dB…-10dB — tuned so normal speech
    /// visibly moves the HUD waveform, near-silence stays near zero.
    private static func rmsLevel(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let data = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        let n = Int(buffer.frameLength)
        var sum: Float = 0
        var count = 0
        var i = 0
        while i < n {
            sum += data[i] * data[i]
            count += 1
            i += 8
        }
        let rms = sqrt(sum / Float(max(count, 1)))
        let db = 20 * log10(max(rms, 1e-6))
        return max(0, min(1, (db + 55) / 45))
    }
}
