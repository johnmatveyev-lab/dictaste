import Foundation

/// Cloud AI polish: managed license, BYO NVIDIA NIM, and/or BYO OpenAI.
enum CloudPolisher {
    /// Production API base. Override with UserDefaults key `apiBaseURL` for staging.
    static var apiBaseURL: URL {
        if let custom = UserDefaults.standard.string(forKey: "apiBaseURL"),
           let url = URL(string: custom), !custom.isEmpty {
            return url
        }
        // Production API (custom domain optional later)
        return URL(string: "https://dictaste.vercel.app")!
    }

    /// NVIDIA NIM OpenAI-compatible base (build.nvidia.com / NGC key).
    static let nvidiaBaseURL = "https://integrate.api.nvidia.com/v1"

    static var openAIKey: String {
        get { UserDefaults.standard.string(forKey: "openAIAPIKey") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "openAIAPIKey") }
    }

    /// NGC / NVIDIA API key for NIM chat (polish) + Magpie TTS.
    static var nvidiaKey: String {
        get { UserDefaults.standard.string(forKey: "nvidiaAPIKey") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "nvidiaAPIKey") }
    }

    static var nvidiaPolishModel: String {
        get {
            let v = UserDefaults.standard.string(forKey: "nvidiaPolishModel") ?? ""
            return v.isEmpty ? "nvidia/nemotron-mini-4b-instruct" : v
        }
        set { UserDefaults.standard.set(newValue, forKey: "nvidiaPolishModel") }
    }

    static let nvidiaPolishModels = [
        "nvidia/nemotron-mini-4b-instruct",
        "meta/llama-3.1-8b-instruct",
        "meta/llama-3.1-70b-instruct",
        "nvidia/llama-3.3-nemotron-super-49b-v1",
        "meta/llama-3.3-70b-instruct",
    ]

    static var licenseKey: String {
        get { UserDefaults.standard.string(forKey: "proLicenseKey") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "proLicenseKey") }
    }

    static var preferManagedPro: Bool {
        get {
            if UserDefaults.standard.object(forKey: "preferManagedPro") == nil { return true }
            return UserDefaults.standard.bool(forKey: "preferManagedPro")
        }
        set { UserDefaults.standard.set(newValue, forKey: "preferManagedPro") }
    }

    private static let systemPrompt = """
    You are a dictation editor. The user dictates text by voice — often rambling, \
    unstructured, or thinking out loud — and you turn the raw transcript into clean, \
    well-organized written text.
    Rules:
    - Fix grammar, punctuation, and capitalization. Remove filler words (um, uh, \
    you know, like), stutters, false starts, and accidentally repeated words.
    - Remove stray punctuation the speech recognizer inserted mid-sentence.
    - If the dictation bundles two or more distinct points, requests, or requirements \
    together, actively restructure it: one short lead-in sentence stating the core \
    ask, then EACH separate point as its own line starting with "- ". Don't just \
    lightly edit disorganized speech — break it apart so each point is scannable on \
    its own line.
    - If the dictation is already a single clear thought with nothing separable, \
    keep it as one clean sentence or paragraph — don't force bullets that aren't needed.
    - Preserve the user's meaning and intent exactly. Never add information, never \
    answer questions contained in the text, never comment on it. Reorganizing is \
    allowed; inventing content is not.
    - Keep the user's own wording and phrasing where it already reads well.
    - Output ONLY the cleaned/restructured text itself. Never add a preamble, \
    label, or lead-in of your own like "Here's the cleaned version:" or "Sure,". \
    The first character of your output must be the first character of the result.
    """

    /// Managed first (if preferred + licensed), then BYO NVIDIA NIM, then BYO OpenAI.
    static func polish(_ text: String) async -> String? {
        if preferManagedPro, !licenseKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if let result = await polishManaged(text) { return result }
        }
        let nim = nvidiaKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if !nim.isEmpty {
            if let result = await polishNVIDIA(text, apiKey: nim) { return result }
        }
        let key = openAIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if !key.isEmpty {
            return await polishOpenAI(text, apiKey: key)
        }
        return nil
    }

    static func polishManaged(_ text: String) async -> String? {
        let key = licenseKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return nil }
        var request = URLRequest(url: apiBaseURL.appendingPathComponent("api/v1/polish"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: ["text": text])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return nil }
            if http.statusCode == 402 {
                NSLog("Dictaste: polish quota exceeded")
                Task { @MainActor in
                    UsageStore.shared.markQuotaExceeded()
                }
                return nil
            }
            guard (200...299).contains(http.statusCode) else {
                NSLog("Dictaste: managed polish HTTP \(http.statusCode)")
                return nil
            }
            guard
                let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                let polished = json["text"] as? String
            else { return nil }
            if let usage = json["usage"] as? [String: Any] {
                let used = usage["wordsUsed"] as? Int ?? 0
                let limit = usage["wordsLimit"] as? Int
                let plan = usage["plan"] as? String
                let period = usage["period"] as? String
                Task { @MainActor in
                    UsageStore.shared.apply(
                        wordsUsed: used,
                        wordsLimit: limit,
                        plan: plan,
                        period: period
                    )
                }
            }
            return sanity(polished, original: text)
        } catch {
            NSLog("Dictaste: managed polish error \(error.localizedDescription)")
            return nil
        }
    }

    static func polishOpenAI(_ text: String, apiKey: String) async -> String? {
        await polishChatCompletions(
            text: text,
            apiKey: apiKey,
            baseURL: "https://api.openai.com/v1",
            model: UserDefaults.standard.string(forKey: "openAIModel") ?? "gpt-4o-mini",
            label: "OpenAI"
        )
    }

    /// BYO NVIDIA NIM chat (OpenAI-compatible) for unlimited polish on your NGC key.
    static func polishNVIDIA(_ text: String, apiKey: String) async -> String? {
        let primary = nvidiaPolishModel
        let cascade = [primary] + nvidiaPolishModels.filter { $0 != primary }
        for model in cascade {
            if let result = await polishChatCompletions(
                text: text,
                apiKey: apiKey,
                baseURL: nvidiaBaseURL,
                model: model,
                label: "NVIDIA NIM"
            ) {
                return result
            }
        }
        return nil
    }

    private static func polishChatCompletions(
        text: String,
        apiKey: String,
        baseURL: String,
        model: String,
        label: String
    ) async -> String? {
        guard let url = URL(string: "\(baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/chat/completions") else {
            return nil
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 45
        let body: [String: Any] = [
            "model": model,
            "temperature": 0.3,
            "max_tokens": min(4096, max(256, text.count / 2 + 200)),
            "messages": [
                ["role": "system", "content": systemPrompt],
                ["role": "user", "content": "Raw transcript:\n\(text)"],
            ],
        ]
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                NSLog("Dictaste: \(label) polish failed model=\(model)")
                return nil
            }
            guard
                let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                let choices = json["choices"] as? [[String: Any]],
                let message = choices.first?["message"] as? [String: Any],
                let content = message["content"] as? String
            else { return nil }
            return sanity(stripPreamble(content.trimmingCharacters(in: .whitespacesAndNewlines)), original: text)
        } catch {
            NSLog("Dictaste: \(label) polish error \(error.localizedDescription)")
            return nil
        }
    }

    private static func stripPreamble(_ text: String) -> String {
        let pattern = #"^(sure|okay|ok|here'?s?|certainly|of course)[^\n]{0,60}[:\n]\s*"#
        guard let range = text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) else {
            return text
        }
        return String(text[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func sanity(_ polished: String, original: String) -> String? {
        guard !polished.isEmpty, polished.count < original.count * 5 + 400 else { return nil }
        return polished
    }
}
