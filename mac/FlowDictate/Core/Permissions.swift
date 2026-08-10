import AppKit
import AVFoundation
import ApplicationServices

/// Microphone + Accessibility are required for dictation.
/// macOS TCC is path/signature sensitive: running from a DMG then moving to
/// /Applications often leaves Accessibility "on" for the wrong binary.
@MainActor
final class PermissionsModel: ObservableObject {
    @Published var micGranted = false
    @Published var speechGranted = false
    @Published var axGranted = false
    /// True when the fn key is set to "Do Nothing" in System Settings › Keyboard.
    @Published var fnKeyFreed = false
    /// App is running from /Applications (required for stable Accessibility TCC).
    @Published var installedInApplications = false
    @Published var bundlePathDisplay = ""

    /// Mic + Accessibility are required. fn key is optional (recommended for hold-fn).
    var requiredGranted: Bool { micGranted && axGranted }

    /// Back-compat for older call sites.
    var allGranted: Bool { requiredGranted }

    /// True when setup can proceed past install location.
    var locationOK: Bool { installedInApplications || isDevBuild }

    /// Debug / Xcode builds often live outside /Applications.
    private var isDevBuild: Bool {
        let p = Bundle.main.bundlePath
        return p.contains("DerivedData") || p.contains("/build/") || p.hasSuffix(".appex")
    }

    func refresh() {
        let path = Bundle.main.bundlePath
        bundlePathDisplay = path
        installedInApplications = path.hasPrefix("/Applications/")

        micGranted = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized

        // Speech recognition (on-device STT) — not always required to show as step,
        // but we track it for diagnostics.
        if #available(macOS 10.15, *) {
            // SFSpeechRecognizer auth is optional; many paths use Apple Speech without this.
            speechGranted = true
        }

        // Prefer the options form so macOS re-evaluates after Settings changes.
        // Never prompt during passive refresh — only on explicit request.
        axGranted = AXIsProcessTrustedWithOptions(
            [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false] as CFDictionary
        )

        let fnUsage = UserDefaults(suiteName: "com.apple.HIToolbox")?
            .object(forKey: "AppleFnUsageType") as? Int
        // 0 = Do Nothing. Missing or other values = not free.
        fnKeyFreed = fnUsage == 0
    }

    // MARK: - Microphone

    func requestMic() {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        switch status {
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                Task { @MainActor in self.refresh() }
            }
        case .denied, .restricted:
            openMicrophoneSettings()
            // Re-check after user returns from Settings
            scheduleRecheck(times: 20, every: 0.75)
        case .authorized:
            refresh()
        @unknown default:
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                Task { @MainActor in self.refresh() }
            }
        }
    }

    // MARK: - Accessibility

    /// Opens system prompt (if any) + Privacy › Accessibility, then polls until granted.
    func requestAccessibility() {
        // If not in Applications, TCC grant is fragile — still open settings but caller should warn.
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
        openAccessibilitySettings()
        scheduleRecheck(times: 40, every: 0.6)
    }

    /// Passive recheck without system prompt (for “I’ve enabled it” button).
    func recheckAccessibility() {
        refresh()
        if !axGranted {
            // Brief delay — sometimes TCC updates a beat after the toggle.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                self?.refresh()
            }
        }
    }

    // MARK: - Settings deep links (macOS 13+)

    func openAccessibilitySettings() {
        openPrivacyURLs([
            // Ventura / Sonoma / Sequoia Privacy & Security › Accessibility
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            "x-apple.systempreferences:com.apple.preference.security?Privacy",
        ])
    }

    func openMicrophoneSettings() {
        openPrivacyURLs([
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
            "x-apple.systempreferences:com.apple.preference.security?Privacy",
        ])
    }

    func openKeyboardSettings() {
        openPrivacyURLs([
            "x-apple.systempreferences:com.apple.Keyboard-Settings.extension",
            "x-apple.systempreferences:com.apple.preference.keyboard",
        ])
    }

    private func openPrivacyURLs(_ candidates: [String]) {
        for s in candidates {
            if let url = URL(string: s), NSWorkspace.shared.open(url) {
                return
            }
        }
        // Last resort: open System Settings app
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.systempreferences")
            ?? NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Preferences") {
            NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
        }
    }

    // MARK: - Install location

    /// Copy this .app into /Applications and relaunch (required for reliable Accessibility).
    @discardableResult
    func installToApplicationsAndRelaunch() -> Bool {
        let src = Bundle.main.bundleURL
        let dest = URL(fileURLWithPath: "/Applications/Dictaste.app")
        let fm = FileManager.default
        do {
            if fm.fileExists(atPath: dest.path) {
                try fm.removeItem(at: dest)
            }
            try fm.copyItem(at: src, to: dest)
        } catch {
            // Try open Installer-style: reveal Applications and ask user to drag
            NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications"))
            NSWorkspace.shared.activateFileViewerSelecting([src])
            return false
        }
        relaunch(from: dest.path)
        return true
    }

    /// Quit and reopen so macOS re-evaluates Accessibility for this process.
    func relaunch(from path: String? = nil) {
        let appPath = path ?? Bundle.main.bundlePath
        let escaped = appPath.replacingOccurrences(of: "\"", with: "\\\"")
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        // Delay so this process can exit cleanly before reopen
        task.arguments = ["-c", "sleep 0.8; /usr/bin/open -n \"\(escaped)\""]
        try? task.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            NSApp.terminate(nil)
        }
    }

    /// Soft-set fn usage to Do Nothing when the user opts in from onboarding.
    func setFnKeyToDoNothing() {
        if let defaults = UserDefaults(suiteName: "com.apple.HIToolbox") {
            defaults.set(0, forKey: "AppleFnUsageType")
            defaults.synchronize()
        }
        refresh()
        openKeyboardSettings()
    }

    // MARK: - Polling

    private func scheduleRecheck(times: Int, every: TimeInterval) {
        guard times > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + every) { [weak self] in
            guard let self else { return }
            self.refresh()
            if !self.requiredGranted {
                self.scheduleRecheck(times: times - 1, every: every)
            }
        }
    }
}
