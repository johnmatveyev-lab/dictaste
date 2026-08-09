import SwiftUI

struct OnboardingView: View {
    @ObservedObject var appState: AppState
    private let refresh = Timer.publish(every: 0.8, on: .main, in: .common).autoconnect()
    @State private var showRestartHint = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Set up Dictaste")
                    .font(.title.bold())
                Text("Two required permissions. Then hold fn 🌐 or tap left ⌥ to dictate.")
                    .foregroundStyle(.secondary)
            }

            stepRow(
                done: appState.permissions.micGranted,
                title: "1. Microphone (required)",
                detail: "So Dictaste can hear you. Click Grant, then Allow in the system dialog.",
                buttonTitle: appState.permissions.micGranted ? "Granted" : "Grant Microphone"
            ) {
                appState.permissions.requestMic()
            }

            stepRow(
                done: appState.permissions.axGranted,
                title: "2. Accessibility (required)",
                detail: "Lets Dictaste watch hotkeys and type into the focused field. Turn ON the switch next to Dictaste, then click “I’ve enabled it” below.",
                buttonTitle: "Open Accessibility Settings"
            ) {
                appState.permissions.requestAccessibility()
                showRestartHint = true
            }

            if showRestartHint && !appState.permissions.axGranted {
                Text("After enabling Accessibility, click “I’ve enabled it”. If it still shows incomplete, quit Dictaste from the menu bar and reopen it.")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !appState.permissions.axGranted {
                Button("I’ve enabled Accessibility — recheck") {
                    appState.permissions.refresh()
                    if appState.permissions.axGranted {
                        appState.hotkey.startIfPossible()
                        showRestartHint = false
                    } else {
                        showRestartHint = true
                    }
                }
                .buttonStyle(.borderedProminent)
            }

            Divider()

            stepRow(
                done: appState.permissions.fnKeyFreed,
                title: "3. Free up the fn 🌐 key (optional)",
                detail: "Recommended if you want hold-fn to dictate. Set “Press 🌐 key to” → Do Nothing. You can skip this and use left ⌥ instead.",
                buttonTitle: "Open Keyboard Settings"
            ) {
                appState.permissions.openKeyboardSettings()
            }

            HStack(spacing: 12) {
                if !appState.permissions.fnKeyFreed {
                    Button("Skip — use left ⌥ only") {
                        appState.optionTapEnabled = true
                        // Don't block setup on fn key
                    }
                }
                if appState.permissions.requiredGranted {
                    Button("Done — start dictating") {
                        appState.hotkey.startIfPossible()
                        // Close onboarding window
                        NSApp.keyWindow?.close()
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                }
            }

            Divider()

            if appState.permissions.requiredGranted {
                Label {
                    Text("Ready. Hold fn 🌐 or tap left ⌥. Esc cancels. \(appState.modelStatus)")
                } icon: {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                }
                .font(.headline)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text(appState.modelStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Path: \(Bundle.main.bundlePath)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(2)
                }
            }
        }
        .padding(28)
        .frame(width: 560, alignment: .leading)
        .onAppear {
            appState.permissions.refresh()
        }
        .onReceive(refresh) { _ in
            appState.permissions.refresh()
            if appState.permissions.axGranted {
                appState.hotkey.startIfPossible()
            }
        }
    }

    @ViewBuilder
    private func stepRow(
        done: Bool,
        title: String,
        detail: String,
        buttonTitle: String,
        action: @escaping () -> Void
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .font(.title2)
                .foregroundStyle(done ? .green : .secondary)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if !done {
                    Button(buttonTitle, action: action)
                        .padding(.top, 2)
                }
            }
        }
    }
}
