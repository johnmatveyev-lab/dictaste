import SwiftUI

/// Lets John fix words the speech engine reliably mishears (e.g. "cloud code"
/// → "Claude Code"). Apple's on-device transcriber has no vocabulary-hinting
/// API, so this is a plain text-replacement list applied after transcription.
struct VocabularyView: View {
    @State private var text = VocabularyCorrector.rulesText
    @State private var saved = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Custom Vocabulary")
                    .font(.title2.bold())
                Text("One correction per line: mishear => correct. Only add words the engine consistently gets wrong — common words are risky to auto-replace.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            TextEditor(text: $text)
                .font(.system(.body, design: .monospaced))
                .frame(minHeight: 220)
                .padding(6)
                .background(Color(nsColor: .textBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator))

            HStack {
                Button("Reset to Default") {
                    text = VocabularyCorrector.defaultRulesText
                }
                Spacer()
                if saved {
                    Text("Saved").font(.caption).foregroundStyle(.secondary)
                }
                Button("Save") {
                    VocabularyCorrector.rulesText = text
                    saved = true
                    Task {
                        try? await Task.sleep(for: .seconds(1.5))
                        saved = false
                    }
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(width: 480, height: 380)
    }
}
