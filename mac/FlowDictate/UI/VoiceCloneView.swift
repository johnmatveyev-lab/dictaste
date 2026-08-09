import AppKit
import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

/// Dialogue: guided script + record/upload → xAI custom voice → select for highlight-to-speak.
struct VoiceCloneView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var voiceName = "My Dictaste voice"
    @State private var grokKey = FlowReader.grokKey
    @State private var status: String?
    @State private var error: String?
    @State private var busy = false
    @State private var cloned: [ClonedVoice] = VoiceCloneService.loadLocal()
    @State private var selectedId = UserDefaults.standard.string(forKey: "flowReadGrokVoice") ?? "Ara"
    @State private var pastedVoiceId = ""
    @StateObject private var recorder = VoiceSampleRecorder()
    @State private var previewPlayer: AVAudioPlayer?

    private let builtIn = FlowReader.grokVoices

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    keySection
                    scriptSection
                    recordSection
                    uploadSection
                    createSection
                    pasteIdSection
                    selectSection
                }
                .padding(16)
            }
            Divider()
            footer
        }
        .frame(width: 560, height: 720)
        .task {
            await refreshRemote()
        }
        .onDisappear {
            recorder.stop()
            previewPlayer?.stop()
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Clone my voice")
                    .font(.title2.weight(.semibold))
                Text("Uses your xAI API key · Custom voice for highlight-to-speak")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Done") {
                applySelectionAndClose()
            }
            .keyboardShortcut(.cancelAction)
        }
        .padding(16)
    }

    private var footer: some View {
        HStack {
            if busy { ProgressView().controlSize(.small) }
            if let status {
                Text(status).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            if let error {
                Text(error).font(.caption).foregroundStyle(.orange).lineLimit(3)
            }
            Spacer()
            Button("Use selected voice") {
                applySelectionAndClose()
            }
            .keyboardShortcut(.defaultAction)
            .disabled(selectedId.isEmpty)
        }
        .padding(12)
    }

    private var keySection: some View {
        GroupBox("xAI API key") {
            VStack(alignment: .leading, spacing: 8) {
                SecureField("xai-…", text: $grokKey)
                    .textFieldStyle(.roundedBorder)
                Text("Required. Keys stay on this Mac. API voice create may need Enterprise; console clone + paste ID always works.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(6)
        }
    }

    private var scriptSection: some View {
        GroupBox("Words to read (guided recording)") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Read aloud naturally for about 60–120 seconds. Quiet room, one speaker.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ScrollView {
                    Text(VoiceCloneService.guidedScript)
                        .font(.body)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                }
                .frame(height: 140)
                .background(Color(nsColor: .textBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                Button("Copy script") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(VoiceCloneService.guidedScript, forType: .string)
                    status = "Script copied"
                }
                .font(.caption)
            }
            .padding(6)
        }
    }

    private var recordSection: some View {
        GroupBox("Record") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    if recorder.isRecording {
                        Button("Stop recording") {
                            recorder.stop()
                            status = "Recorded \(Int(recorder.elapsed))s — ready to create"
                        }
                        .tint(.red)
                    } else {
                        Button("Start recording") {
                            Task { await startRecording() }
                        }
                    }
                    Text(timeString(recorder.elapsed))
                        .monospacedDigit()
                        .foregroundStyle(recorder.isRecording ? .red : .secondary)
                    Spacer()
                    if recorder.isRecording {
                        ProgressView(value: Double(max(0, min(1, (recorder.level + 50) / 50))))
                            .frame(width: 80)
                    }
                }
                if let url = recorder.lastFileURL {
                    HStack {
                        Text(url.lastPathComponent)
                            .font(.caption)
                            .lineLimit(1)
                        Button("Play sample") { playPreview(url) }
                        Button("Clear") {
                            previewPlayer?.stop()
                            recorder.lastFileURL = nil
                        }
                    }
                }
            }
            .padding(6)
        }
    }

    private var uploadSection: some View {
        GroupBox("Or upload a recording") {
            VStack(alignment: .leading, spacing: 8) {
                Text("WAV / M4A / MP3 / FLAC · max ~120 seconds · single speaker")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Choose audio file…") {
                    pickFile()
                }
            }
            .padding(6)
        }
    }

    private var createSection: some View {
        GroupBox("Create voice on xAI") {
            VStack(alignment: .leading, spacing: 8) {
                TextField("Voice name", text: $voiceName)
                    .textFieldStyle(.roundedBorder)
                Button(busy ? "Creating…" : "Create cloned voice") {
                    Task { await createFromSample() }
                }
                .disabled(busy || recorder.lastFileURL == nil || grokKey.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(6)
        }
    }

    private var pasteIdSection: some View {
        GroupBox("Already cloned in console?") {
            VStack(alignment: .leading, spacing: 8) {
                Text("console.x.ai → Voice Library → ⋯ → Copy Voice ID")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack {
                    TextField("Paste voice_id", text: $pastedVoiceId)
                        .textFieldStyle(.roundedBorder)
                    Button("Add") {
                        let id = pastedVoiceId.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !id.isEmpty else { return }
                        let v = ClonedVoice(
                            id: id,
                            name: voiceName.isEmpty ? "Console voice" : voiceName,
                            language: "en",
                            createdAt: Date()
                        )
                        VoiceCloneService.upsertLocal(v)
                        cloned = VoiceCloneService.loadLocal()
                        selectedId = id
                        status = "Added \(id) — select Grok provider to use it"
                    }
                }
            }
            .padding(6)
        }
    }

    private var selectSection: some View {
        GroupBox("Select voice for reading aloud") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Built-in Grok voices")
                    .font(.caption.weight(.semibold))
                Picker("Built-in", selection: $selectedId) {
                    ForEach(builtIn, id: \.self) { v in
                        Text(v).tag(v)
                    }
                }
                .labelsHidden()
                .pickerStyle(.radioGroup)

                if !cloned.isEmpty {
                    Divider()
                    Text("My cloned voices")
                        .font(.caption.weight(.semibold))
                    ForEach(cloned) { v in
                        HStack {
                            Button {
                                selectedId = v.id
                            } label: {
                                Label(v.displayName, systemImage: selectedId == v.id ? "checkmark.circle.fill" : "circle")
                            }
                            .buttonStyle(.plain)
                            Spacer()
                            Text(v.id)
                                .font(.caption2.monospaced())
                                .foregroundStyle(.secondary)
                            Button("Delete", role: .destructive) {
                                Task { await deleteVoice(v) }
                            }
                            .font(.caption)
                        }
                    }
                }

                Button("Refresh from xAI") {
                    Task { await refreshRemote() }
                }
                .font(.caption)
            }
            .padding(6)
        }
    }

    // MARK: - Actions

    private func startRecording() async {
        error = nil
        let ok = await recorder.requestMicAccess()
        guard ok else {
            error = "Microphone permission denied — enable for Dictaste in System Settings"
            return
        }
        do {
            try recorder.start()
            status = "Recording… read the script above"
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func pickFile() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.audio]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            // Copy into app support so upload path stays valid
            do {
                try FileManager.default.createDirectory(
                    at: recorder.documentsDir,
                    withIntermediateDirectories: true
                )
                let dest = recorder.documentsDir.appendingPathComponent(url.lastPathComponent)
                if FileManager.default.fileExists(atPath: dest.path) {
                    try FileManager.default.removeItem(at: dest)
                }
                try FileManager.default.copyItem(at: url, to: dest)
                recorder.lastFileURL = dest
                status = "Ready to create from \(dest.lastPathComponent)"
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func createFromSample() async {
        error = nil
        busy = true
        defer { busy = false }
        let key = grokKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else {
            error = VoiceCloneService.CloneError.noKey.localizedDescription
            return
        }
        FlowReader.grokKey = key
        guard let url = recorder.lastFileURL else {
            error = VoiceCloneService.CloneError.noAudio.localizedDescription
            return
        }
        do {
            status = "Uploading to xAI…"
            let voice = try await VoiceCloneService.create(
                apiKey: key,
                name: voiceName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? "My Dictaste voice"
                    : voiceName,
                audioURL: url
            )
            cloned = VoiceCloneService.loadLocal()
            selectedId = voice.id
            status = "Created \(voice.displayName) (\(voice.id)). Select it and click Use selected voice."
        } catch {
            self.error = error.localizedDescription
            status = nil
        }
    }

    private func refreshRemote() async {
        let key = grokKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else {
            cloned = VoiceCloneService.loadLocal()
            return
        }
        do {
            let remote = try await VoiceCloneService.listRemote(apiKey: key)
            for v in remote { VoiceCloneService.upsertLocal(v) }
            cloned = VoiceCloneService.loadLocal()
            status = "Synced \(remote.count) custom voice(s) from xAI"
        } catch {
            // Local list still usable
            cloned = VoiceCloneService.loadLocal()
        }
    }

    private func deleteVoice(_ v: ClonedVoice) async {
        let key = grokKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if !key.isEmpty {
            try? await VoiceCloneService.delete(apiKey: key, voiceId: v.id)
        } else {
            VoiceCloneService.removeLocal(id: v.id)
        }
        cloned = VoiceCloneService.loadLocal()
        if selectedId == v.id { selectedId = "Ara" }
    }

    private func playPreview(_ url: URL) {
        previewPlayer?.stop()
        previewPlayer = try? AVAudioPlayer(contentsOf: url)
        previewPlayer?.play()
    }

    private func applySelectionAndClose() {
        FlowReader.grokKey = grokKey.trimmingCharacters(in: .whitespacesAndNewlines)
        UserDefaults.standard.set(FlowReader.Provider.grok.rawValue, forKey: "flowReadProvider")
        UserDefaults.standard.set(selectedId, forKey: "flowReadGrokVoice")
        UserDefaults.standard.set(true, forKey: "flowReadAuto")
        dismiss()
    }

    private func timeString(_ t: TimeInterval) -> String {
        let s = Int(t)
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
