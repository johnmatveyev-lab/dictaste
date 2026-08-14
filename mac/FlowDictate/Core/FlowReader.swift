import AppKit
import ApplicationServices
import AVFoundation
import Foundation

/// Flow Read — auto-speak selected text via System / OpenAI / Gemini / Grok / NVIDIA voices.
@MainActor
final class FlowReader: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    enum Provider: String, CaseIterable, Identifiable, Hashable {
        case system
        case openai
        case gemini
        case grok
        case nvidia

        var id: String { rawValue }

        var label: String {
            switch self {
            case .system: return "System (free)"
            case .openai: return "OpenAI"
            case .gemini: return "Gemini"
            case .grok: return "Grok (xAI)"
            case .nvidia: return "NVIDIA (Magpie)"
            }
        }
    }

    enum State: Equatable {
        case idle
        case loading
        case playing
        case paused
        case error(String)
    }

    enum KeyTestStatus: Equatable {
        case untested
        case testing
        case ok(String)
        case fail(String)
    }

    @Published var state: State = .idle
    @Published var text: String = ""
    @Published var progress: Double = 0
    @Published var activeVoiceName: String = ""

    @Published var provider: Provider = {
        if let raw = UserDefaults.standard.string(forKey: "flowReadProvider"),
           let p = Provider(rawValue: raw) { return p }
        return .system
    }() {
        didSet { UserDefaults.standard.set(provider.rawValue, forKey: "flowReadProvider") }
    }

    @Published var rate: Double = {
        let v = UserDefaults.standard.double(forKey: "flowReadRate")
        return v > 0 ? min(2, max(0.5, v)) : 1.0
    }() {
        didSet { UserDefaults.standard.set(rate, forKey: "flowReadRate") }
    }

    @Published var systemVoiceIdentifier: String = UserDefaults.standard.string(forKey: "flowReadSystemVoice") ?? "" {
        didSet { UserDefaults.standard.set(systemVoiceIdentifier, forKey: "flowReadSystemVoice") }
    }
    @Published var openAIVoice: String = UserDefaults.standard.string(forKey: "flowReadOpenAIVoice") ?? "nova" {
        didSet { UserDefaults.standard.set(openAIVoice, forKey: "flowReadOpenAIVoice") }
    }
    @Published var geminiVoice: String = UserDefaults.standard.string(forKey: "flowReadGeminiVoice") ?? "Kore" {
        didSet { UserDefaults.standard.set(geminiVoice, forKey: "flowReadGeminiVoice") }
    }
    @Published var grokVoice: String = UserDefaults.standard.string(forKey: "flowReadGrokVoice") ?? "Ara" {
        didSet { UserDefaults.standard.set(grokVoice, forKey: "flowReadGrokVoice") }
    }
    @Published var nvidiaVoice: String = UserDefaults.standard.string(forKey: "flowReadNvidiaVoice") ?? "English-US.Female-1" {
        didSet { UserDefaults.standard.set(nvidiaVoice, forKey: "flowReadNvidiaVoice") }
    }

    /// When true, start speaking as soon as text is selected (skips the Read button).
    /// Default is false — show a Read chip near the cursor instead.
    @Published var autoReadEnabled: Bool = {
        if UserDefaults.standard.object(forKey: "flowReadAuto") == nil { return false }
        return UserDefaults.standard.bool(forKey: "flowReadAuto")
    }() {
        didSet { UserDefaults.standard.set(autoReadEnabled, forKey: "flowReadAuto") }
    }

    @Published var openAIKeyStatus: KeyTestStatus = .untested
    @Published var geminiKeyStatus: KeyTestStatus = .untested
    @Published var grokKeyStatus: KeyTestStatus = .untested
    @Published var nvidiaKeyStatus: KeyTestStatus = .untested

    static let openAIVoices = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]
    static let geminiVoices = [
        "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
        "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
        "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
        "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
        "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
    ]
    static let grokVoices = ["Ara", "Eve", "Leo", "Rex", "Sal"]
    /// Magpie multilingual speaker IDs commonly accepted by NIM TTS.
    static let nvidiaVoices = [
        "English-US.Female-1",
        "English-US.Male-1",
        "English-US.Female-Calm",
        "English-US.Male-Calm",
        "English-US.Female-Neutral",
        "English-US.Male-Neutral",
    ]
    static let nvidiaTTSModels = [
        "nvidia/magpie-tts-multilingual",
        "magpie-tts-multilingual",
    ]

    private let synthesizer = AVSpeechSynthesizer()
    private var audioPlayer: AVAudioPlayer?
    private var speakTask: Task<Void, Never>?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    var systemVoices: [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("en") }
            .sorted { $0.name < $1.name }
    }

    var voicesForCurrentProvider: [String] {
        switch provider {
        case .system: return systemVoices.map(\.name)
        case .openai: return Self.openAIVoices
        case .gemini: return Self.geminiVoices
        case .grok:
            let cloned = VoiceCloneService.loadLocal().map(\.id)
            return Self.grokVoices + cloned
        case .nvidia: return Self.nvidiaVoices
        }
    }

    /// Display label for a Grok built-in or cloned voice_id.
    func grokVoiceLabel(_ id: String) -> String {
        if let c = VoiceCloneService.loadLocal().first(where: { $0.id == id }) {
            return c.displayName
        }
        return id.capitalized
    }

    // MARK: - API keys (shared prefs)

    static var openAIKey: String {
        get { UserDefaults.standard.string(forKey: "openAIAPIKey") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "openAIAPIKey") }
    }
    static var geminiKey: String {
        get { UserDefaults.standard.string(forKey: "geminiAPIKey") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "geminiAPIKey") }
    }
    static var grokKey: String {
        get { UserDefaults.standard.string(forKey: "grokAPIKey") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "grokAPIKey") }
    }
    /// Shared with CloudPolisher.nvidiaKey (NIM polish + Magpie TTS).
    static var nvidiaKey: String {
        get { CloudPolisher.nvidiaKey }
        set { CloudPolisher.nvidiaKey = newValue }
    }

    func stop(clearText: Bool = true) {
        speakTask?.cancel()
        speakTask = nil
        synthesizer.stopSpeaking(at: .immediate)
        audioPlayer?.stop()
        audioPlayer = nil
        state = .idle
        progress = 0
        if clearText {
            text = ""
            activeVoiceName = ""
        }
    }

    func pause() {
        switch provider {
        case .system:
            if synthesizer.isSpeaking {
                synthesizer.pauseSpeaking(at: .word)
                state = .paused
            }
        case .openai, .gemini, .grok, .nvidia:
            audioPlayer?.pause()
            state = .paused
        }
    }

    func resume() {
        switch provider {
        case .system:
            synthesizer.continueSpeaking()
            state = .playing
        case .openai, .gemini, .grok, .nvidia:
            audioPlayer?.play()
            state = .playing
        }
    }

    func togglePlayPause() {
        switch state {
        case .playing: pause()
        case .paused: resume()
        case .idle where !text.isEmpty: speak(text)
        default: break
        }
    }

    func reloadSettingsFromDefaults() {
        if let raw = UserDefaults.standard.string(forKey: "flowReadProvider"),
           let p = Provider(rawValue: raw) {
            provider = p
        }
        let r = UserDefaults.standard.double(forKey: "flowReadRate")
        if r > 0 { rate = min(2, max(0.5, r)) }
        systemVoiceIdentifier = UserDefaults.standard.string(forKey: "flowReadSystemVoice") ?? systemVoiceIdentifier
        openAIVoice = UserDefaults.standard.string(forKey: "flowReadOpenAIVoice") ?? openAIVoice
        geminiVoice = UserDefaults.standard.string(forKey: "flowReadGeminiVoice") ?? geminiVoice
        grokVoice = UserDefaults.standard.string(forKey: "flowReadGrokVoice") ?? grokVoice
        nvidiaVoice = UserDefaults.standard.string(forKey: "flowReadNvidiaVoice") ?? nvidiaVoice
        if UserDefaults.standard.object(forKey: "flowReadAuto") != nil {
            autoReadEnabled = UserDefaults.standard.bool(forKey: "flowReadAuto")
        }
    }

    func speak(_ raw: String) {
        reloadSettingsFromDefaults()
        let cleaned = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            state = .error("No text selected")
            return
        }
        speakTask?.cancel()
        synthesizer.stopSpeaking(at: .immediate)
        audioPlayer?.stop()
        audioPlayer = nil
        text = cleaned
        progress = 0
        state = .loading

        switch provider {
        case .system:
            speakSystem(cleaned)
        case .openai:
            speakTask = Task { await speakOpenAI(cleaned) }
        case .gemini:
            speakTask = Task { await speakGemini(cleaned) }
        case .grok:
            speakTask = Task { await speakGrok(cleaned) }
        case .nvidia:
            speakTask = Task { await speakNVIDIA(cleaned) }
        }
    }

    // MARK: - Connection tests

    func testOpenAI(key: String) async {
        openAIKeyStatus = .testing
        let k = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !k.isEmpty else {
            openAIKeyStatus = .fail("Paste an API key first")
            return
        }
        var req = URLRequest(url: URL(string: "https://api.openai.com/v1/models")!)
        req.setValue("Bearer \(k)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 12
        do {
            let (_, res) = try await URLSession.shared.data(for: req)
            guard let http = res as? HTTPURLResponse else {
                openAIKeyStatus = .fail("No response")
                return
            }
            openAIKeyStatus = (200...299).contains(http.statusCode)
                ? .ok("OpenAI connected")
                : .fail("HTTP \(http.statusCode) — check key")
        } catch {
            openAIKeyStatus = .fail(error.localizedDescription)
        }
    }

    func testGemini(key: String) async {
        geminiKeyStatus = .testing
        let k = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !k.isEmpty else {
            geminiKeyStatus = .fail("Paste an API key first")
            return
        }
        let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models?key=\(k)")!
        var req = URLRequest(url: url)
        req.timeoutInterval = 12
        do {
            let (_, res) = try await URLSession.shared.data(for: req)
            guard let http = res as? HTTPURLResponse else {
                geminiKeyStatus = .fail("No response")
                return
            }
            geminiKeyStatus = (200...299).contains(http.statusCode)
                ? .ok("Gemini connected")
                : .fail("HTTP \(http.statusCode) — check key")
        } catch {
            geminiKeyStatus = .fail(error.localizedDescription)
        }
    }

    func testGrok(key: String) async {
        grokKeyStatus = .testing
        let k = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !k.isEmpty else {
            grokKeyStatus = .fail("Paste an API key first")
            return
        }
        // OpenAI-compatible models list
        var req = URLRequest(url: URL(string: "https://api.x.ai/v1/models")!)
        req.setValue("Bearer \(k)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 12
        do {
            let (_, res) = try await URLSession.shared.data(for: req)
            guard let http = res as? HTTPURLResponse else {
                grokKeyStatus = .fail("No response")
                return
            }
            grokKeyStatus = (200...299).contains(http.statusCode)
                ? .ok("Grok connected")
                : .fail("HTTP \(http.statusCode) — check key")
        } catch {
            grokKeyStatus = .fail(error.localizedDescription)
        }
    }

    func testNVIDIA(key: String) async {
        nvidiaKeyStatus = .testing
        let k = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !k.isEmpty else {
            nvidiaKeyStatus = .fail("Paste an NVIDIA / NGC API key first")
            return
        }
        var req = URLRequest(url: URL(string: "\(CloudPolisher.nvidiaBaseURL)/models")!)
        req.setValue("Bearer \(k)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 15
        do {
            let (_, res) = try await URLSession.shared.data(for: req)
            guard let http = res as? HTTPURLResponse else {
                nvidiaKeyStatus = .fail("No response")
                return
            }
            // Some NIM keys return 200 with a list; others 404 on /models but still work for chat.
            if (200...299).contains(http.statusCode) {
                nvidiaKeyStatus = .ok("NVIDIA NIM connected")
            } else if http.statusCode == 404 || http.statusCode == 401 || http.statusCode == 403 {
                // Probe chat with a tiny completion
                if await CloudPolisher.polishNVIDIA("ok", apiKey: k) != nil {
                    nvidiaKeyStatus = .ok("NVIDIA NIM chat works")
                } else {
                    nvidiaKeyStatus = .fail("HTTP \(http.statusCode) — check NGC key at build.nvidia.com")
                }
            } else {
                nvidiaKeyStatus = .fail("HTTP \(http.statusCode) — check key")
            }
        } catch {
            nvidiaKeyStatus = .fail(error.localizedDescription)
        }
    }

    // MARK: - System

    private func speakSystem(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * Float(rate)
        if let voice = systemVoices.first(where: { $0.identifier == systemVoiceIdentifier })
            ?? AVSpeechSynthesisVoice(language: "en-US") {
            utterance.voice = voice
            activeVoiceName = voice.name
        } else {
            activeVoiceName = "System"
        }
        synthesizer.speak(utterance)
        state = .playing
    }

    // MARK: - NVIDIA Magpie TTS (NIM)

    private func speakNVIDIA(_ text: String) async {
        let apiKey = Self.nvidiaKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !apiKey.isEmpty else {
            state = .error("Add an NVIDIA API key in Settings (build.nvidia.com)")
            return
        }
        let voice = nvidiaVoice.trimmingCharacters(in: .whitespacesAndNewlines)
        activeVoiceName = "NVIDIA · \(voice)"

        // 1) OpenAI-compatible /v1/audio/speech on integrate.api.nvidia.com
        for model in Self.nvidiaTTSModels {
            if let data = try? await nvidiaSpeechOpenAICompat(
                text: text, apiKey: apiKey, model: model, voice: voice
            ) {
                do {
                    try playAudioData(data)
                    return
                } catch { /* try next */ }
            }
        }
        // 2) Magpie invoke-style body (text + voice)
        if let data = try? await nvidiaMagpieInvoke(text: text, apiKey: apiKey, voice: voice) {
            do {
                try playAudioData(data)
                return
            } catch {
                if !Task.isCancelled { state = .error(error.localizedDescription) }
                return
            }
        }
        if !Task.isCancelled {
            state = .error("NVIDIA TTS failed — check NGC key and Magpie access on build.nvidia.com")
        }
    }

    private func nvidiaSpeechOpenAICompat(
        text: String, apiKey: String, model: String, voice: String
    ) async throws -> Data? {
        guard let url = URL(string: "\(CloudPolisher.nvidiaBaseURL)/audio/speech") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/octet-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 90
        let body: [String: Any] = [
            "model": model,
            "input": text,
            "voice": voice,
            "response_format": "mp3",
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            return nil
        }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let b64 = obj["audio"] as? String
                ?? obj["audio_base64"] as? String
                ?? (obj["output"] as? [String: Any])?["audio"] as? String,
               let decoded = Data(base64Encoded: b64) {
                return decoded
            }
        }
        return data.count > 64 ? data : nil
    }

    private func nvidiaMagpieInvoke(text: String, apiKey: String, voice: String) async throws -> Data? {
        // Hosted Magpie endpoint variants used by build.nvidia.com
        let urls = [
            "https://integrate.api.nvidia.com/v1/audio/nvidia/magpie-tts-multilingual",
            "https://ai.api.nvidia.com/v1/audio/nvidia/magpie-tts-multilingual",
        ]
        for urlStr in urls {
            guard let url = URL(string: urlStr) else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.timeoutInterval = 90
            let body: [String: Any] = [
                "text": text,
                "voice": voice,
                "quality": "high",
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                continue
            }
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let b64 = obj["audio"] as? String
                    ?? obj["audio_base64"] as? String
                    ?? (obj["data"] as? [String: Any])?["audio"] as? String,
                   let decoded = Data(base64Encoded: b64) {
                    return decoded
                }
            }
            if data.count > 64 { return data }
        }
        return nil
    }

    // MARK: - OpenAI

    private func speakOpenAI(_ text: String) async {
        let apiKey = Self.openAIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        // Prefer BYO; fall back to managed server TTS if licensed
        if apiKey.isEmpty {
            await speakManagedPremium(text, voice: openAIVoice)
            return
        }
        activeVoiceName = "OpenAI · \(openAIVoice)"
        var request = URLRequest(url: URL(string: "https://api.openai.com/v1/audio/speech")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 60
        let body: [String: Any] = [
            "model": "gpt-4o-mini-tts",
            "input": text,
            "voice": openAIVoice,
            "speed": rate,
            "response_format": "mp3",
        ]
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                state = .error("OpenAI TTS failed — check key / quota")
                return
            }
            try playAudioData(data)
        } catch {
            if !Task.isCancelled { state = .error(error.localizedDescription) }
        }
    }

    private func speakManagedPremium(_ text: String, voice: String) async {
        let key = CloudPolisher.licenseKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else {
            state = .error("Add an OpenAI key or Pro license for neural voices")
            return
        }
        activeVoiceName = "Premium · \(voice)"
        var request = URLRequest(url: CloudPolisher.apiBaseURL.appendingPathComponent("api/v1/tts"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 60
        let body: [String: Any] = ["text": text, "voice": voice, "speed": rate]
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                state = .error("Network error")
                return
            }
            if http.statusCode == 403 {
                state = .error("Use System voice or paste your own API key")
                return
            }
            if http.statusCode == 402 {
                state = .error("Premium read limit reached — use System voice")
                return
            }
            guard (200...299).contains(http.statusCode),
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let b64 = json["audioBase64"] as? String,
                  let audioData = Data(base64Encoded: b64)
            else {
                let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                state = .error(msg ?? "Premium TTS failed")
                return
            }
            if let usage = json["usage"] as? [String: Any] {
                UsageStore.shared.applyTTS(
                    charsUsed: usage["ttsCharsUsed"] as? Int ?? 0,
                    charsLimit: usage["ttsCharsLimit"] as? Int
                )
            }
            try playAudioData(audioData)
        } catch {
            if !Task.isCancelled { state = .error(error.localizedDescription) }
        }
    }

    // MARK: - Gemini

    private func speakGemini(_ text: String) async {
        let apiKey = Self.geminiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !apiKey.isEmpty else {
            state = .error("Add a Gemini API key in Settings")
            return
        }
        activeVoiceName = "Gemini · \(geminiVoice)"
        // Gemini 2.5 Flash Preview TTS via generateContent
        let model = "gemini-2.5-flash-preview-tts"
        let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent?key=\(apiKey)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60
        let body: [String: Any] = [
            "contents": [
                ["parts": [["text": text]]],
            ],
            "generationConfig": [
                "responseModalities": ["AUDIO"],
                "speechConfig": [
                    "voiceConfig": [
                        "prebuiltVoiceConfig": [
                            "voiceName": geminiVoice,
                        ],
                    ],
                ],
            ],
        ]
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let candidates = json["candidates"] as? [[String: Any]],
                  let content = candidates.first?["content"] as? [String: Any],
                  let parts = content["parts"] as? [[String: Any]],
                  let inline = parts.first?["inlineData"] as? [String: Any]
                    ?? parts.first?["inline_data"] as? [String: Any],
                  let b64 = inline["data"] as? String,
                  let audioData = Data(base64Encoded: b64)
            else {
                let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                    .flatMap { $0["error"] as? [String: Any] }?["message"] as? String
                state = .error(msg ?? "Gemini TTS failed — check key / model access")
                return
            }
            // Gemini returns PCM often — wrap if needed; try play as-is, fallback wav header
            try playAudioData(audioData)
        } catch {
            if !Task.isCancelled { state = .error(error.localizedDescription) }
        }
    }

    // MARK: - Grok (xAI) — built-in + custom cloned voices

    private func speakGrok(_ text: String) async {
        let apiKey = Self.grokKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !apiKey.isEmpty else {
            state = .error("Add a Grok (xAI) API key in Settings")
            return
        }
        let voiceId = grokVoice.trimmingCharacters(in: .whitespacesAndNewlines)
        let builtIn = Set(Self.grokVoices.map { $0.lowercased() })
        let isCloned = VoiceCloneService.loadLocal().contains(where: { $0.id == voiceId })
            || (voiceId.count >= 6 && !builtIn.contains(voiceId.lowercased()))
        activeVoiceName = isCloned ? "My voice · \(voiceId)" : "Grok · \(voiceId)"

        // Primary: documented TTS endpoint with voice_id
        if let data = try? await grokTTS(text: text, apiKey: apiKey, voiceId: voiceId, useV1TTS: true) {
            do {
                try playAudioData(data)
                return
            } catch { /* try alternate */ }
        }
        // Fallback: OpenAI-compatible speech path
        if let data = try? await grokTTS(text: text, apiKey: apiKey, voiceId: voiceId, useV1TTS: false) {
            do {
                try playAudioData(data)
                return
            } catch {
                if !Task.isCancelled { state = .error(error.localizedDescription) }
                return
            }
        }
        if !Task.isCancelled {
            state = .error("Grok TTS failed — check API key and voice id")
        }
    }

    private func grokTTS(text: String, apiKey: String, voiceId: String, useV1TTS: Bool) async throws -> Data? {
        let url = useV1TTS
            ? URL(string: "https://api.x.ai/v1/tts")!
            : URL(string: "https://api.x.ai/v1/audio/speech")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 60
        let body: [String: Any]
        if useV1TTS {
            body = [
                "text": text,
                "voice_id": voiceId.lowercased(),
                "language": "en",
            ]
        } else {
            body = [
                "model": "grok-tts",
                "input": text,
                "voice": voiceId.lowercased(),
                "speed": rate,
                "response_format": "mp3",
            ]
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            return nil
        }
        // /v1/tts may return raw audio or JSON envelope with base64
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let b64 = obj["audio"] as? String ?? obj["audio_base64"] as? String,
               let decoded = Data(base64Encoded: b64) {
                return decoded
            }
        }
        return data
    }

    private func playAudioData(_ data: Data) throws {
        // Try raw; if fails, wrap PCM16 mono 24k as WAV (Gemini often returns PCM)
        do {
            let player = try AVAudioPlayer(data: data)
            configurePlayer(player)
        } catch {
            let wav = Self.wrapPCM16AsWAV(data, sampleRate: 24_000)
            let player = try AVAudioPlayer(data: wav)
            configurePlayer(player)
        }
    }

    private func configurePlayer(_ player: AVAudioPlayer) {
        player.delegate = self
        player.enableRate = true
        player.rate = Float(rate)
        player.prepareToPlay()
        player.play()
        audioPlayer = player
        state = .playing
        Task {
            while let p = self.audioPlayer, p.isPlaying {
                self.progress = p.duration > 0 ? p.currentTime / p.duration : 0
                try? await Task.sleep(for: .milliseconds(100))
            }
        }
    }

    private static func wrapPCM16AsWAV(_ pcm: Data, sampleRate: Int) -> Data {
        var data = Data()
        let channels: Int16 = 1
        let bitsPerSample: Int16 = 16
        let byteRate = sampleRate * Int(channels) * Int(bitsPerSample) / 8
        let blockAlign = channels * bitsPerSample / 8
        let dataSize = UInt32(pcm.count)
        let riffSize = UInt32(36 + pcm.count)

        func append(_ s: String) { data.append(contentsOf: s.utf8) }
        func appendU32(_ v: UInt32) {
            var le = v.littleEndian
            data.append(Data(bytes: &le, count: 4))
        }
        func appendU16(_ v: UInt16) {
            var le = v.littleEndian
            data.append(Data(bytes: &le, count: 2))
        }

        append("RIFF")
        appendU32(riffSize)
        append("WAVE")
        append("fmt ")
        appendU32(16)
        appendU16(1) // PCM
        appendU16(UInt16(channels))
        appendU32(UInt32(sampleRate))
        appendU32(UInt32(byteRate))
        appendU16(UInt16(blockAlign))
        appendU16(UInt16(bitsPerSample))
        append("data")
        appendU32(dataSize)
        data.append(pcm)
        return data
    }

    // MARK: - Delegates

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            self.state = .idle
            self.progress = 1
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            if case .error = self.state { return }
            self.state = .idle
        }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in
            let total = max(1, utterance.speechString.count)
            self.progress = min(1, Double(characterRange.location + characterRange.length) / Double(total))
        }
    }
}

extension FlowReader: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.state = .idle
            self.progress = 1
        }
    }
}
