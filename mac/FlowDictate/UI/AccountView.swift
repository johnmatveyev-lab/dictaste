import AVFoundation
import SwiftUI

struct AccountView: View {
    @State private var licenseKey = CloudPolisher.licenseKey
    @State private var openAIKey = FlowReader.openAIKey
    @State private var geminiKey = FlowReader.geminiKey
    @State private var grokKey = FlowReader.grokKey
    @State private var preferManaged = CloudPolisher.preferManagedPro
    @State private var saved = false
    @State private var refreshing = false
    @ObservedObject private var usage = UsageStore.shared
    /// Settings mirror — persists via UserDefaults keys shared with live FlowReader.
    @State private var provider: FlowReader.Provider = {
        if let raw = UserDefaults.standard.string(forKey: "flowReadProvider"),
           let p = FlowReader.Provider(rawValue: raw) { return p }
        return .system
    }()
    @State private var rate: Double = {
        let v = UserDefaults.standard.double(forKey: "flowReadRate")
        return v > 0 ? v : 1.0
    }()
    @State private var systemVoiceId = UserDefaults.standard.string(forKey: "flowReadSystemVoice") ?? ""
    @State private var openAIVoice = UserDefaults.standard.string(forKey: "flowReadOpenAIVoice") ?? "nova"
    @State private var geminiVoice = UserDefaults.standard.string(forKey: "flowReadGeminiVoice") ?? "Kore"
    @State private var grokVoice = UserDefaults.standard.string(forKey: "flowReadGrokVoice") ?? "Ara"
    @State private var autoRead: Bool = {
        if UserDefaults.standard.object(forKey: "flowReadAuto") == nil { return true }
        return UserDefaults.standard.bool(forKey: "flowReadAuto")
    }()
    @State private var tester = FlowReader()
    @State private var showVoiceClone = false
    @State private var clonedVoices: [ClonedVoice] = VoiceCloneService.loadLocal()

    private var systemVoices: [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("en") }
            .sorted { $0.name < $1.name }
    }

    var body: some View {
        Form {
            Section {
                Text("Drag to highlight text anywhere — reading starts when you release the mouse. Space = pause/play · Esc = stop. No copy/paste needed.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Section("Usage") {
                HStack {
                    Text("Plan")
                    Spacer()
                    Text(usage.plan.capitalized).foregroundStyle(.secondary)
                }
                HStack {
                    Text("Polish")
                    Spacer()
                    Text(usage.meterLabel)
                        .foregroundStyle(usage.isAtLimit ? .orange : .secondary)
                        .monospacedDigit()
                }
                ProgressView(value: usage.fraction)
                    .tint(usage.isAtLimit ? .orange : Color(red: 0.18, green: 0.82, blue: 0.42))
                HStack {
                    Text("Premium highlight-to-speak")
                    Spacer()
                    Text(usage.ttsMeterLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                if usage.ttsCharsLimit != nil {
                    ProgressView(value: usage.ttsFraction)
                        .tint(Color(red: 0.35, green: 0.65, blue: 1.0))
                }
                Button(refreshing ? "Refreshing…" : "Refresh usage") {
                    refreshing = true
                    Task {
                        await usage.refreshFromServer()
                        refreshing = false
                    }
                }
                .disabled(refreshing || licenseKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Link("Upgrade / manage plan…", destination: URL(string: "https://dictaste.vercel.app/pricing")!)
            }

            Section("License & polish") {
                SecureField("License key (fd_live_…)", text: $licenseKey)
                    .textFieldStyle(.roundedBorder)
                Toggle("Prefer managed polish when licensed", isOn: $preferManaged)
                Link("Open dashboard…", destination: URL(string: "https://dictaste.vercel.app/dashboard")!)
            }

            Section("Highlight-to-speak") {
                Toggle("Auto-read when text is selected", isOn: $autoRead)
                Picker("Provider", selection: $provider) {
                    ForEach(FlowReader.Provider.allCases) { p in
                        Text(p.label).tag(p)
                    }
                }
                HStack {
                    Text("Speed")
                    Slider(value: $rate, in: 0.5...2.0, step: 0.1)
                    Text(String(format: "%.1f×", rate))
                        .monospacedDigit()
                        .frame(width: 36)
                }
                voicePicker
            }

            Section("Clone my voice (xAI)") {
                Text("Record a short script or upload audio, then use your voice for highlight-to-speak via Grok TTS.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Open voice clone…") {
                    showVoiceClone = true
                }
                if !clonedVoices.isEmpty {
                    Picker("Cloned voice", selection: $grokVoice) {
                        ForEach(clonedVoices) { v in
                            Text(v.displayName).tag(v.id)
                        }
                    }
                    Text("Also set Provider to Grok (xAI) above.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Section("OpenAI API key") {
                SecureField("sk-…", text: $openAIKey)
                    .textFieldStyle(.roundedBorder)
                keyTestRow(status: tester.openAIKeyStatus) {
                    Task { await tester.testOpenAI(key: openAIKey) }
                }
            }

            Section("Gemini API key") {
                SecureField("AIza…", text: $geminiKey)
                    .textFieldStyle(.roundedBorder)
                keyTestRow(status: tester.geminiKeyStatus) {
                    Task { await tester.testGemini(key: geminiKey) }
                }
            }

            Section("Grok (xAI) API key") {
                SecureField("xai-…", text: $grokKey)
                    .textFieldStyle(.roundedBorder)
                keyTestRow(status: tester.grokKeyStatus) {
                    Task { await tester.testGrok(key: grokKey) }
                }
            }

            Section {
                HStack {
                    Button("Save") { saveAll() }
                        .keyboardShortcut(.defaultAction)
                    Button("Save & test all keys") {
                        saveAll()
                        Task {
                            await tester.testOpenAI(key: openAIKey)
                            await tester.testGemini(key: geminiKey)
                            await tester.testGrok(key: grokKey)
                        }
                    }
                }
                if saved {
                    Label("Saved", systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
        }
        .formStyle(.grouped)
        .padding()
        .frame(width: 520, height: 760)
        .task {
            await usage.refreshFromServer()
            clonedVoices = VoiceCloneService.loadLocal()
        }
        .sheet(isPresented: $showVoiceClone, onDismiss: {
            clonedVoices = VoiceCloneService.loadLocal()
            if let raw = UserDefaults.standard.string(forKey: "flowReadGrokVoice") {
                grokVoice = raw
            }
            if let raw = UserDefaults.standard.string(forKey: "flowReadProvider"),
               let p = FlowReader.Provider(rawValue: raw) {
                provider = p
            }
            grokKey = FlowReader.grokKey
        }) {
            VoiceCloneView()
        }
        .onReceive(NotificationCenter.default.publisher(for: .dictasteOpenVoiceClone)) { _ in
            showVoiceClone = true
        }
    }

    @ViewBuilder
    private var voicePicker: some View {
        switch provider {
        case .system:
            Picker("System voice", selection: $systemVoiceId) {
                Text("Default").tag("")
                ForEach(systemVoices, id: \.identifier) { v in
                    Text("\(v.name)").tag(v.identifier)
                }
            }
        case .openai:
            Picker("OpenAI voice", selection: $openAIVoice) {
                ForEach(FlowReader.openAIVoices, id: \.self) { v in
                    Text(v.capitalized).tag(v)
                }
            }
            Text("Uses your OpenAI key. If empty, Pro managed TTS is tried.")
                .font(.caption).foregroundStyle(.secondary)
        case .gemini:
            Picker("Gemini voice", selection: $geminiVoice) {
                ForEach(FlowReader.geminiVoices, id: \.self) { v in
                    Text(v).tag(v)
                }
            }
            Text("Requires a Gemini API key with TTS model access.")
                .font(.caption).foregroundStyle(.secondary)
        case .grok:
            Picker("Grok voice", selection: $grokVoice) {
                ForEach(FlowReader.grokVoices, id: \.self) { v in
                    Text(v).tag(v)
                }
                if !clonedVoices.isEmpty {
                    Divider()
                    ForEach(clonedVoices) { v in
                        Text(v.displayName).tag(v.id)
                    }
                }
            }
            Text("Built-in voices or your cloned voice_id. Requires an xAI API key.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func keyTestRow(status: FlowReader.KeyTestStatus, test: @escaping () -> Void) -> some View {
        HStack {
            Button("Test connection", action: test)
            Spacer()
            switch status {
            case .untested:
                Text("Not tested").font(.caption).foregroundStyle(.secondary)
            case .testing:
                ProgressView().controlSize(.small)
                Text("Testing…").font(.caption).foregroundStyle(.secondary)
            case .ok(let msg):
                Label(msg, systemImage: "checkmark.seal.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            case .fail(let msg):
                Label(msg, systemImage: "xmark.octagon.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
            }
        }
    }

    private func saveAll() {
        CloudPolisher.licenseKey = licenseKey.trimmingCharacters(in: .whitespacesAndNewlines)
        CloudPolisher.preferManagedPro = preferManaged
        CloudPolisher.openAIKey = openAIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        FlowReader.openAIKey = openAIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        FlowReader.geminiKey = geminiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        FlowReader.grokKey = grokKey.trimmingCharacters(in: .whitespacesAndNewlines)

        UserDefaults.standard.set(provider.rawValue, forKey: "flowReadProvider")
        UserDefaults.standard.set(rate, forKey: "flowReadRate")
        UserDefaults.standard.set(systemVoiceId, forKey: "flowReadSystemVoice")
        UserDefaults.standard.set(openAIVoice, forKey: "flowReadOpenAIVoice")
        UserDefaults.standard.set(geminiVoice, forKey: "flowReadGeminiVoice")
        UserDefaults.standard.set(grokVoice, forKey: "flowReadGrokVoice")
        UserDefaults.standard.set(autoRead, forKey: "flowReadAuto")
        saved = true
        Task { await usage.refreshFromServer() }
    }
}
