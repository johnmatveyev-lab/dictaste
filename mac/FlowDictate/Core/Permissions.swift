import AppKit
import AVFoundation

@MainActor
final class PermissionsModel: ObservableObject {
    @Published var micGranted = false
    @Published var axGranted = false
    /// True when the fn key is set to "Do Nothing" in System Settings › Keyboard.
    @Published var fnKeyFreed = false

    /// Mic + Accessibility are required. fn key is optional (recommended for hold-fn).
    var requiredGranted: Bool { micGranted && axGranted }

    /// Back-compat for older call sites.
    var allGranted: Bool { requiredGranted }

    func refresh() {
        micGranted = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        // Prefer the options form so macOS re-evaluates after Settings changes.
        axGranted = AXIsProcessTrustedWithOptions(
            [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false] as CFDictionary
        )
        let fnUsage = UserDefaults(suiteName: "com.apple.HIToolbox")?
            .object(forKey: "AppleFnUsageType") as? Int
        // 0 = Do Nothing. Missing or other values = not free.
        fnKeyFreed = fnUsage == 0
    }

    func requestMic() {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        switch status {
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                Task { @MainActor in self.refresh() }
            }
        case .denied, .restricted:
            openPrivacyPane("Privacy_Microphone")
        case .authorized:
            refresh()
        @unknown default:
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                Task { @MainActor in self.refresh() }
            }
        }
    }

    func requestAccessibility() {
        // Prompt system dialog if possible
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
        // Always open Settings so user can flip the toggle for this binary
        openPrivacyPane("Privacy_Accessibility")
        refresh()
    }

    func openKeyboardSettings() {
        // macOS Ventura+ keyboard pane
        let candidates = [
            "x-apple.systempreferences:com.apple.Keyboard-Settings.extension",
            "x-apple.systempreferences:com.apple.preference.keyboard",
        ]
        for s in candidates {
            if let url = URL(string: s) {
                NSWorkspace.shared.open(url)
                return
            }
        }
    }

    func openPrivacyPane(_ pane: String) {
        // e.g. Privacy_Accessibility, Privacy_Microphone
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") {
            NSWorkspace.shared.open(url)
        }
    }

    /// Soft-set fn usage to Do Nothing when the user opts in from onboarding.
    func setFnKeyToDoNothing() {
        if let defaults = UserDefaults(suiteName: "com.apple.HIToolbox") {
            defaults.set(0, forKey: "AppleFnUsageType")
            defaults.synchronize()
        }
        refresh()
        // Still open Settings so user can confirm (HIToolbox writes can be ignored on some OS versions)
        openKeyboardSettings()
    }
}
