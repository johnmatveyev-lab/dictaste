import ServiceManagement
import SwiftUI

struct MenuBarView: View {
    @ObservedObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            usageMeter

            Divider()

            if appState.history.isEmpty {
                Text("Hold fn 🌐, or tap left ⌥ to start and stop. Esc cancels.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                Text("Recent — click to copy")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(appState.history.prefix(6)) { record in
                    HistoryRow(record: record)
                }
            }

            Divider()

            Toggle("AI Polish", isOn: Binding(
                get: { appState.polishEnabled },
                set: { appState.polishEnabled = $0 }
            ))
            .toggleStyle(.checkbox)
            Text(polishStatusLine)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Toggle("Tap left ⌥ to start/stop", isOn: Binding(
                get: { appState.optionTapEnabled },
                set: { appState.optionTapEnabled = $0 }
            ))
            .toggleStyle(.checkbox)

            Toggle("Start at login & auto-restart", isOn: Binding(
                get: { appState.agentEnabled },
                set: { appState.setAgentEnabled($0) }
            ))
            .toggleStyle(.checkbox)

            Divider()

            Button("Highlight-to-speak selection") {
                appState.startFlowReadFromSelection()
            }
            Text("Drag-highlight text → auto-reads · Space pause · Esc stop")
                .font(.caption2)
                .foregroundStyle(.secondary)
            if appState.phase == .reading {
                Button("Stop reading") {
                    appState.stopFlowRead()
                }
            }

            Button("Account & Settings…") {
                appState.showAccount()
            }

            Button("Clone my voice…") {
                appState.showAccount()
                // Sheet is opened from Account settings; user taps “Open voice clone…”
                // Deep-open: post notification for AccountView to present clone sheet.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    NotificationCenter.default.post(name: .dictasteOpenVoiceClone, object: nil)
                }
            }

            Button("Custom Vocabulary…") {
                appState.showVocabulary()
            }

            Button("Permissions Setup…") {
                appState.showOnboarding()
            }

            Button("Quit Dictaste") {
                NSApp.terminate(nil)
            }
        }
        .padding(12)
        .frame(width: 320)
        .task {
            await appState.usage.refreshFromServer()
        }
    }

    @ViewBuilder
    private var usageMeter: some View {
        let usage = appState.usage
        if usage.wordsLimit != nil || !CloudPolisher.licenseKey.isEmpty {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text("AI polish")
                        .font(.caption.weight(.medium))
                    Spacer()
                    Text(usage.meterLabel)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(usage.isAtLimit ? .orange : .secondary)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.primary.opacity(0.08))
                        Capsule()
                            .fill(meterColor(usage.fraction))
                            .frame(width: max(4, geo.size.width * usage.fraction))
                    }
                }
                .frame(height: 5)
                if usage.isAtLimit {
                    Text("Free limit reached — upgrade to keep polishing, or keep dictating without polish.")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                } else if usage.isNearLimit {
                    Text("Approaching today's free limit.")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func meterColor(_ fraction: Double) -> Color {
        if fraction >= 1 { return .orange }
        if fraction >= 0.8 { return Color.orange.opacity(0.85) }
        return Color(red: 0.18, green: 0.82, blue: 0.42)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform.circle.fill")
                .font(.title3)
                .foregroundStyle(
                    LinearGradient(colors: [Color(red: 0.30, green: 0.85, blue: 0.48),
                                            Color(red: 0.08, green: 0.58, blue: 0.33)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                )
            Text("Dictaste")
                .font(.headline)
            Spacer()
            statusChip
        }
    }

    private var polishStatusLine: String {
        if appState.usage.isAtLimit {
            return "Polish paused — free word limit reached. Upgrade in Account."
        }
        if appState.polisher.isAvailable {
            return "Using Apple Intelligence (on-device, unlimited)."
        }
        if !CloudPolisher.licenseKey.isEmpty, CloudPolisher.preferManagedPro {
            return "Using managed polish (free 2,000 words/day or Pro)."
        }
        if !CloudPolisher.openAIKey.isEmpty {
            return "Using your OpenAI API key."
        }
        if let reason = appState.polisher.unavailabilityReason {
            return "\(reason). Add a free license key in Account."
        }
        return "Sign up free for 2,000 words/day of AI polish, or use Apple Intelligence."
    }

    private var statusChip: some View {
        let (label, color): (String, Color) = {
            if !appState.permissions.allGranted { return ("Setup needed", .orange) }
            if !appState.modelReady { return ("Preparing…", .orange) }
            if appState.usage.isAtLimit { return ("Limit", .orange) }
            switch appState.phase {
            case .recording: return ("Recording", .red)
            case .transcribing, .polishing: return ("Working…", .blue)
            default: return ("Ready", .green)
            }
        }()
        return Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
}

private struct HistoryRow: View {
    let record: DictationRecord
    @State private var hovering = false
    @State private var copied = false

    var body: some View {
        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(record.text, forType: .string)
            copied = true
            Task {
                try? await Task.sleep(for: .seconds(1))
                copied = false
            }
        } label: {
            HStack {
                Text(record.text)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer()
                if copied {
                    Image(systemName: "checkmark")
                        .font(.caption2)
                        .foregroundStyle(.green)
                } else if hovering {
                    Image(systemName: "doc.on.doc")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(hovering ? Color.primary.opacity(0.08) : .clear)
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}
