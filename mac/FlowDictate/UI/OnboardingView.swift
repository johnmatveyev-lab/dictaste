import SwiftUI
import AppKit

struct OnboardingView: View {
    @ObservedObject var appState: AppState
    private let refresh = Timer.publish(every: 0.7, on: .main, in: .common).autoconnect()
    @State private var showStuckHelp = false
    @State private var lastRecheckFailed = false
    @State private var installError = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                // Step 0 — must run from /Applications for TCC to stick
                locationStep

                // Step 1 — Mic
                stepRow(
                    done: appState.permissions.micGranted,
                    title: "1. Microphone",
                    detail: "Required so Dictaste can hear you. Click Grant, then Allow in the macOS dialog.",
                    buttonTitle: appState.permissions.micGranted ? "Granted ✓" : "Grant Microphone",
                    buttonEnabled: appState.permissions.locationOK && !appState.permissions.micGranted
                ) {
                    appState.permissions.requestMic()
                }

                // Step 2 — Accessibility
                stepRow(
                    done: appState.permissions.axGranted,
                    title: "2. Accessibility",
                    detail: "Required to watch hotkeys and type into any app. In Settings, turn ON the switch next to Dictaste.",
                    buttonTitle: "Open Accessibility Settings",
                    buttonEnabled: appState.permissions.locationOK && !appState.permissions.axGranted
                ) {
                    appState.permissions.requestAccessibility()
                    lastRecheckFailed = false
                }

                if appState.permissions.locationOK && !appState.permissions.axGranted {
                    accessibilityActions
                }

                if appState.permissions.axGranted {
                    Label("Accessibility is on for this app.", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                        .font(.subheadline.weight(.semibold))
                }

                Divider().padding(.vertical, 4)

                // Optional fn
                stepRow(
                    done: appState.permissions.fnKeyFreed,
                    title: "3. Free the fn 🌐 key (optional)",
                    detail: "Recommended for hold-fn dictation. Set “Press 🌐 key to” → Do Nothing. Or skip and use left ⌥.",
                    buttonTitle: "Open Keyboard Settings",
                    buttonEnabled: true
                ) {
                    appState.permissions.openKeyboardSettings()
                }

                HStack(spacing: 12) {
                    if !appState.permissions.fnKeyFreed {
                        Button("Skip — use left ⌥ only") {
                            appState.optionTapEnabled = true
                        }
                    }
                    if appState.permissions.requiredGranted {
                        Button("Done — start dictating") {
                            appState.hotkey.startIfPossible()
                            NSApp.keyWindow?.close()
                        }
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut(.defaultAction)
                    }
                }

                if appState.permissions.requiredGranted {
                    Label {
                        Text("Ready. Hold fn 🌐 or tap left ⌥. Esc cancels.")
                    } icon: {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                    }
                    .font(.headline)
                    .padding(.top, 4)
                } else {
                    Text(appState.modelStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(28)
        }
        .frame(width: 580, height: 560, alignment: .leading)
        .onAppear {
            appState.permissions.refresh()
        }
        .onReceive(refresh) { _ in
            appState.permissions.refresh()
            if appState.permissions.axGranted {
                appState.hotkey.startIfPossible()
                lastRecheckFailed = false
            }
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Set up Dictaste")
                .font(.title.bold())
            Text("Takes under a minute. Microphone + Accessibility are required.")
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var locationStep: some View {
        let ok = appState.permissions.locationOK
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.title2)
                .foregroundStyle(ok ? .green : .orange)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 6) {
                Text(ok ? "0. Installed in Applications" : "0. Move to Applications (required first)")
                    .font(.headline)
                Text(
                    ok
                        ? "Running from Applications so macOS permissions stick after restarts."
                        : "You’re running Dictaste from a temporary location (DMG/Downloads). macOS will not keep Accessibility enabled until it’s in /Applications."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

                Text(appState.permissions.bundlePathDisplay)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .lineLimit(2)
                    .textSelection(.enabled)

                if !ok {
                    HStack(spacing: 8) {
                        Button("Move to Applications & Relaunch") {
                            installError = !appState.permissions.installToApplicationsAndRelaunch()
                        }
                        .buttonStyle(.borderedProminent)
                        Button("I already did — recheck") {
                            appState.permissions.refresh()
                        }
                    }
                    if installError {
                        Text("Couldn’t copy automatically. Drag Dictaste into Applications in Finder, then open it from there.")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            }
        }
        .padding(.bottom, 4)
    }

    private var accessibilityActions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button("I’ve enabled Accessibility — recheck") {
                appState.permissions.recheckAccessibility()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    if appState.permissions.axGranted {
                        appState.hotkey.startIfPossible()
                        lastRecheckFailed = false
                    } else {
                        lastRecheckFailed = true
                        showStuckHelp = true
                    }
                }
            }
            .buttonStyle(.borderedProminent)

            // Most common fix after toggle: full relaunch
            Button("Relaunch Dictaste (fixes most stuck checks)") {
                appState.permissions.relaunch()
            }
            .buttonStyle(.bordered)

            if lastRecheckFailed || showStuckHelp {
                stuckHelpBox
            } else {
                Button("Still not working? Show fix steps") {
                    showStuckHelp = true
                }
                .font(.caption)
            }
        }
        .padding(.leading, 36)
    }

    private var stuckHelpBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Quick fix (takes ~20 seconds)")
                .font(.subheadline.weight(.semibold))
            VStack(alignment: .leading, spacing: 4) {
                Text("1. Click below to open Accessibility settings.")
                Text("2. Find every row named Dictaste (and any duplicate entries).")
                Text("3. Turn each OFF, then click the − button to remove them.")
                Text("4. Click +, select Dictaste in /Applications, add it, turn ON.")
                Text("5. Come back here and click Relaunch Dictaste.")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Button("Open Accessibility list") {
                    appState.permissions.openAccessibilitySettings()
                }
                Button("Copy app path") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(
                        appState.permissions.bundlePathDisplay,
                        forType: .string
                    )
                }
                Button("Relaunch now") {
                    appState.permissions.relaunch()
                }
                .buttonStyle(.borderedProminent)
            }

            Text("Tip: Only enable Dictaste that lives in /Applications — not the DMG or Downloads copy.")
                .font(.caption2)
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.orange.opacity(0.12)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.orange.opacity(0.35)))
    }

    @ViewBuilder
    private func stepRow(
        done: Bool,
        title: String,
        detail: String,
        buttonTitle: String,
        buttonEnabled: Bool,
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
                        .disabled(!buttonEnabled)
                        .padding(.top, 2)
                }
            }
        }
    }
}
