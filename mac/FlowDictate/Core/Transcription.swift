import AVFoundation
import Speech

enum DictationError: LocalizedError {
    case noMicrophone
    case noSession
    case localeUnsupported
    case noAnalyzerFormat
    case timeout
    case speechAuthDenied

    var errorDescription: String? {
        switch self {
        case .noMicrophone: return "No microphone available"
        case .noSession: return "No transcription session"
        case .localeUnsupported: return "English dictation isn't supported on this Mac"
        case .noAnalyzerFormat: return "Speech engine has no usable audio format"
        case .timeout: return "Timed out waiting for the transcript"
        case .speechAuthDenied: return "Speech recognition permission denied"
        }
    }
}

/// One-time (per boot of the app) check that speech assets are ready.
enum SpeechModel {
    static func ensureInstalled() async throws {
        if #available(macOS 26.0, *) {
            try await ModernSpeechSupport.ensureInstalled()
            return
        }
        // Legacy SFSpeechRecognizer: request auth + warm locale
        let status = await withCheckedContinuation { (cont: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
        }
        guard status == .authorized else { throw DictationError.speechAuthDenied }
        guard SFSpeechRecognizer(locale: Locale(identifier: "en-US")) != nil
                || SFSpeechRecognizer(locale: Locale(identifier: "en")) != nil else {
            throw DictationError.localeUnsupported
        }
    }

    static func supportedEnglishLocale() async throws -> Locale {
        if #available(macOS 26.0, *) {
            return try await ModernSpeechSupport.supportedEnglishLocale()
        }
        return Locale(identifier: "en-US")
    }
}

/// Unified session: modern SpeechAnalyzer on macOS 26+, SFSpeech on older.
final class TranscriptionSession {
    private let impl: any TranscriptionSessionImpl

    init(
        inputFormat: AVAudioFormat,
        buffers: AsyncStream<AVAudioPCMBuffer>,
        onVolatile: (@Sendable (String) -> Void)?
    ) async throws {
        if #available(macOS 26.0, *) {
            impl = try await ModernTranscriptionSession(
                inputFormat: inputFormat,
                buffers: buffers,
                onVolatile: onVolatile
            )
        } else {
            impl = try await LegacyTranscriptionSession(
                inputFormat: inputFormat,
                buffers: buffers,
                onVolatile: onVolatile
            )
        }
    }

    func finish() async throws -> String { try await impl.finish() }
    func cancel() { impl.cancel() }
}

protocol TranscriptionSessionImpl: AnyObject {
    func finish() async throws -> String
    func cancel()
}

// MARK: - Legacy (macOS 13+)

final class LegacyTranscriptionSession: TranscriptionSessionImpl {
    private let request: SFSpeechAudioBufferRecognitionRequest
    private var task: SFSpeechRecognitionTask?
    private var feedTask: Task<Void, Never>?
    private var finalText = ""
    private var continuation: CheckedContinuation<String, Error>?
    private let lock = NSLock()

    init(
        inputFormat: AVAudioFormat,
        buffers: AsyncStream<AVAudioPCMBuffer>,
        onVolatile: (@Sendable (String) -> Void)?
    ) async throws {
        let status = SFSpeechRecognizer.authorizationStatus()
        if status != .authorized {
            let granted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0 == .authorized) }
            }
            guard granted else { throw DictationError.speechAuthDenied }
        }

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
                ?? SFSpeechRecognizer(locale: Locale(identifier: "en"))
                ?? SFSpeechRecognizer() else {
            throw DictationError.localeUnsupported
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        let outFormat =
            AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: false)
            ?? inputFormat
        let converter = AudioBufferConverter(from: inputFormat, to: outFormat)

        // Capture box so recognitionTask can be started after full init if needed.
        let lock = self.lock
        self.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                let text = result.bestTranscription.formattedString
                onVolatile?(text)
                if result.isFinal {
                    lock.lock()
                    self.finalText = text
                    let cont = self.continuation
                    self.continuation = nil
                    lock.unlock()
                    cont?.resume(returning: text)
                }
            } else if let error {
                lock.lock()
                let cont = self.continuation
                self.continuation = nil
                lock.unlock()
                cont?.resume(throwing: error)
            }
        }

        self.feedTask = Task {
            for await buffer in buffers {
                guard !Task.isCancelled else { break }
                if let converted = converter.convert(buffer) {
                    request.append(converted)
                } else {
                    request.append(buffer)
                }
            }
        }
    }

    func finish() async throws -> String {
        await feedTask?.value
        request.endAudio()
        return try await withTimeout(seconds: 15) {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
                self.lock.lock()
                if !self.finalText.isEmpty {
                    let text = self.finalText
                    self.lock.unlock()
                    cont.resume(returning: text)
                } else {
                    self.continuation = cont
                    self.lock.unlock()
                }
            }
        }
    }

    func cancel() {
        feedTask?.cancel()
        task?.cancel()
        request.endAudio()
        lock.lock()
        let cont = continuation
        continuation = nil
        lock.unlock()
        cont?.resume(throwing: CancellationError())
    }
}

// MARK: - Shared helpers

/// Converts mic/file buffers to the analyzer's preferred format (rate + sample type).
final class AudioBufferConverter {
    private let converter: AVAudioConverter?
    private let outputFormat: AVAudioFormat

    init(from inputFormat: AVAudioFormat, to outputFormat: AVAudioFormat) {
        self.outputFormat = outputFormat
        converter = inputFormat == outputFormat ? nil : AVAudioConverter(from: inputFormat, to: outputFormat)
    }

    func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let converter else { return buffer }
        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 16
        guard let output = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return nil }
        var error: NSError?
        var consumed = false
        converter.convert(to: output, error: &error) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }
        return error == nil ? output : nil
    }
}

enum FileTranscriber {
    static func transcribe(url: URL) async throws -> String {
        let file = try AVAudioFile(forReading: url)
        let format = file.processingFormat
        let (stream, continuation) = AsyncStream.makeStream(of: AVAudioPCMBuffer.self)
        let session = try await TranscriptionSession(inputFormat: format, buffers: stream, onVolatile: nil)

        let chunkFrames: AVAudioFrameCount = 4096
        while file.framePosition < file.length {
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: chunkFrames) else { break }
            try file.read(into: buffer, frameCount: chunkFrames)
            guard buffer.frameLength > 0 else { break }
            continuation.yield(buffer)
        }
        continuation.finish()
        return try await session.finish()
    }
}

func withTimeout<T: Sendable>(seconds: Double, _ operation: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(for: .seconds(seconds))
            throw DictationError.timeout
        }
        guard let result = try await group.next() else { throw DictationError.timeout }
        group.cancelAll()
        return result
    }
}
