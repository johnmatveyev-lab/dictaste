import AVFoundation
import Foundation

/// A cloned voice stored for the local user (xAI Custom Voices).
struct ClonedVoice: Codable, Identifiable, Hashable {
    var id: String // xAI voice_id
    var name: String
    var language: String
    var createdAt: Date

    var displayName: String { "★ \(name)" }
}

/// Client for xAI Custom Voices + TTS (`api.x.ai`).
enum VoiceCloneService {
    static let base = URL(string: "https://api.x.ai/v1")!

    /// Guided script (~90–120s at a natural pace). Shown in the clone dialogue.
    static let guidedScript = """
    Welcome to Dictaste voice cloning. Please read this script naturally, as if you were explaining something to a friend. Pause at the periods. Do not rush.

    I use Dictaste to speak my thoughts and ship clean writing without fighting the keyboard. When I highlight text, I want it read back in my own voice so I can catch awkward phrasing by ear. That is why I am recording this sample.

    The weather today is ordinary, but the work is interesting. I will open the project, review the pull request, and send a short update to the team. If something is unclear, I will ask a question instead of guessing.

    Numbers and names matter: please check page three, call Jordan at extension four-two-one, and schedule Friday at three-thirty. Email support at support@dictaste.com when you need help.

    Thank you for listening. This recording is for my personal Dictaste highlight-to-speak voice only.
    """

    private static let storageKey = "flowReadClonedVoices"

    static func loadLocal() -> [ClonedVoice] {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let list = try? JSONDecoder().decode([ClonedVoice].self, from: data) else {
            return []
        }
        return list.sorted { $0.createdAt > $1.createdAt }
    }

    static func saveLocal(_ voices: [ClonedVoice]) {
        if let data = try? JSONEncoder().encode(voices) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    static func upsertLocal(_ voice: ClonedVoice) {
        var list = loadLocal().filter { $0.id != voice.id }
        list.insert(voice, at: 0)
        saveLocal(list)
    }

    static func removeLocal(id: String) {
        saveLocal(loadLocal().filter { $0.id != id })
    }

    // MARK: - API

    static func listRemote(apiKey: String) async throws -> [ClonedVoice] {
        var req = URLRequest(url: base.appendingPathComponent("custom-voices"))
        req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw CloneError.network
        }
        guard (200...299).contains(http.statusCode) else {
            throw CloneError.api(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let arr = (obj["voices"] as? [[String: Any]]) ?? (obj["data"] as? [[String: Any]]) ?? []
            return arr.compactMap(parseVoice)
        }
        if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return arr.compactMap(parseVoice)
        }
        return []
    }

    static func create(
        apiKey: String,
        name: String,
        audioURL: URL,
        language: String = "en",
        gender: String = "neutral",
        tone: String = "natural",
        useCase: String = "narration"
    ) async throws -> ClonedVoice {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        func field(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        field("name", name)
        field("language", language)
        field("gender", gender)
        field("tone", tone)
        field("use_case", useCase)

        let audioData = try Data(contentsOf: audioURL)
        let filename = audioURL.lastPathComponent
        let mime: String
        switch audioURL.pathExtension.lowercased() {
        case "wav": mime = "audio/wav"
        case "mp3": mime = "audio/mpeg"
        case "m4a", "mp4", "aac": mime = "audio/mp4"
        case "ogg": mime = "audio/ogg"
        case "flac": mime = "audio/flac"
        case "webm": mime = "audio/webm"
        default: mime = "application/octet-stream"
        }

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append(
            "Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n"
                .data(using: .utf8)!
        )
        body.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        var req = URLRequest(url: base.appendingPathComponent("custom-voices"))
        req.httpMethod = "POST"
        req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        req.timeoutInterval = 120

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw CloneError.network }
        guard (200...299).contains(http.statusCode) else {
            throw CloneError.api(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let voice = parseVoice(obj) else {
            throw CloneError.parse
        }
        upsertLocal(voice)
        return voice
    }

    static func delete(apiKey: String, voiceId: String) async throws {
        var req = URLRequest(url: base.appendingPathComponent("custom-voices/\(voiceId)"))
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        let (_, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode) || http.statusCode == 404 else {
            throw CloneError.network
        }
        removeLocal(id: voiceId)
    }

    private static func parseVoice(_ obj: [String: Any]) -> ClonedVoice? {
        let id = (obj["voice_id"] as? String) ?? (obj["id"] as? String)
        guard let id, !id.isEmpty else { return nil }
        let name = (obj["name"] as? String) ?? "My voice"
        let language = (obj["language"] as? String) ?? "en"
        return ClonedVoice(id: id, name: name, language: language, createdAt: Date())
    }

    enum CloneError: LocalizedError {
        case network
        case parse
        case api(Int, String)
        case noKey
        case noAudio

        var errorDescription: String? {
            switch self {
            case .network: return "Network error talking to xAI"
            case .parse: return "Unexpected response from xAI"
            case .api(let code, let body):
                let lower = body.lowercased()
                if code == 403 || lower.contains("enterprise") {
                    return "API cloning may need Enterprise. Clone in console.x.ai Voice Library, then paste the Voice ID below."
                }
                return "xAI error \(code): \(body.prefix(160))"
            case .noKey: return "Add your Grok (xAI) API key first"
            case .noAudio: return "No audio recorded or selected"
            }
        }
    }
}

// MARK: - Mic recorder for guided clone (macOS)

@MainActor
final class VoiceSampleRecorder: NSObject, ObservableObject {
    @Published var isRecording = false
    @Published var level: Float = 0
    @Published var elapsed: TimeInterval = 0
    @Published var lastFileURL: URL?

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var startDate: Date?

    var documentsDir: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Dictaste/VoiceSamples", isDirectory: true)
    }

    func requestMicAccess() async -> Bool {
        await withCheckedContinuation { cont in
            switch AVCaptureDevice.authorizationStatus(for: .audio) {
            case .authorized:
                cont.resume(returning: true)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .audio) { cont.resume(returning: $0) }
            default:
                cont.resume(returning: false)
            }
        }
    }

    func start() throws {
        try FileManager.default.createDirectory(at: documentsDir, withIntermediateDirectories: true)
        let url = documentsDir.appendingPathComponent("sample-\(Int(Date().timeIntervalSince1970)).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 24_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let rec = try AVAudioRecorder(url: url, settings: settings)
        rec.isMeteringEnabled = true
        guard rec.record() else { throw VoiceCloneService.CloneError.noAudio }
        recorder = rec
        lastFileURL = url
        isRecording = true
        startDate = Date()
        elapsed = 0
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let rec = self.recorder else { return }
                rec.updateMeters()
                self.level = rec.averagePower(forChannel: 0)
                if let start = self.startDate {
                    self.elapsed = Date().timeIntervalSince(start)
                }
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        recorder?.stop()
        isRecording = false
        level = 0
    }
}

extension Notification.Name {
    static let dictasteOpenVoiceClone = Notification.Name("dictasteOpenVoiceClone")
}
