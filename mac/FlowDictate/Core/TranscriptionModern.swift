import AVFoundation
import Speech

/// macOS 26+ SpeechAnalyzer / SpeechTranscriber path.
@available(macOS 26.0, *)
enum ModernSpeechSupport {
    static func ensureInstalled() async throws {
        let locale = try await supportedEnglishLocale()
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [],
            attributeOptions: []
        )
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
    }

    static func supportedEnglishLocale() async throws -> Locale {
        let supported = await SpeechTranscriber.supportedLocales
        if let exact = supported.first(where: { $0.identifier(.bcp47) == "en-US" }) {
            return exact
        }
        if let anyEnglish = supported.first(where: { $0.language.languageCode?.identifier == "en" }) {
            return anyEnglish
        }
        throw DictationError.localeUnsupported
    }
}

@available(macOS 26.0, *)
final class ModernTranscriptionSession: TranscriptionSessionImpl {
    private let analyzer: SpeechAnalyzer
    private let inputContinuation: AsyncStream<AnalyzerInput>.Continuation
    private let feedTask: Task<Void, Never>
    private let resultsTask: Task<String, Error>

    init(
        inputFormat: AVAudioFormat,
        buffers: AsyncStream<AVAudioPCMBuffer>,
        onVolatile: (@Sendable (String) -> Void)?
    ) async throws {
        let locale = try await ModernSpeechSupport.supportedEnglishLocale()
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer

        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            throw DictationError.noAnalyzerFormat
        }
        let converter = AudioBufferConverter(from: inputFormat, to: analyzerFormat)

        let (inputSequence, inputContinuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.inputContinuation = inputContinuation

        resultsTask = Task {
            var finalText = ""
            for try await result in transcriber.results {
                let piece = String(result.text.characters)
                if result.isFinal {
                    finalText += piece
                    onVolatile?(finalText)
                } else {
                    onVolatile?(finalText + piece)
                }
            }
            return finalText
        }

        feedTask = Task {
            for await buffer in buffers {
                guard !Task.isCancelled else { break }
                if let converted = converter.convert(buffer) {
                    inputContinuation.yield(AnalyzerInput(buffer: converted))
                }
            }
        }

        try await analyzer.start(inputSequence: inputSequence)
    }

    func finish() async throws -> String {
        await feedTask.value
        inputContinuation.finish()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
        return try await withTimeout(seconds: 15) { [resultsTask] in
            try await resultsTask.value
        }
    }

    func cancel() {
        feedTask.cancel()
        inputContinuation.finish()
        resultsTask.cancel()
        let analyzer = self.analyzer
        Task { await analyzer.cancelAndFinishNow() }
    }
}
