import AppKit
import ServiceManagement
import SwiftUI

struct DictationRecord: Codable, Identifiable, Equatable {
    let id: UUID
    let text: String
    let date: Date
    let duration: TimeInterval
}

@MainActor
final class AppState: ObservableObject {
    enum Phase: Equatable {
        case idle
        case recording
        case transcribing
        case polishing
        case inserting
        case reading
        case error(String)
    }

    enum TriggerSource {
        case holdFn   // hold fn to talk, release to insert
        case toggleTap // tap left ⌥ to start, tap again to stop
    }

    @Published var phase: Phase = .idle
    @Published var triggerSource: TriggerSource = .holdFn
    @Published var optionTapEnabled: Bool = (UserDefaults.standard.object(forKey: "optionTapEnabled") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(optionTapEnabled, forKey: "optionTapEnabled") }
    }
    @Published var polishEnabled: Bool = (UserDefaults.standard.object(forKey: "polishEnabled") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(polishEnabled, forKey: "polishEnabled") }
    }
    @Published var agentEnabled = false
    @Published var volatileText = ""
    @Published var levelHistory: [Float] = []
    @Published var currentLevel: Float = 0
    @Published var modelStatus = "Checking speech model…"
    @Published var modelReady = false
    @Published var history: [DictationRecord] = []
    var usage = UsageStore.shared

    let permissions = PermissionsModel()
    let hotkey = HotkeyMonitor()
    let polisher = TextPolisher()
    let flowReader = FlowReader()

    private let recorder = AudioRecorder()
    private let inserter = TextInserter()
    private var hud: HUDController?
    private var onboardingWindow: NSWindow?
    private var vocabularyWindow: NSWindow?
    private var accountWindow: NSWindow?
    private var pollTimer: Timer?
    private var pressTime = Date.distantPast
    private var sessionTask: Task<TranscriptionSession, Error>?
    private var dismissTask: Task<Void, Never>?
    private var backgroundActivity: NSObjectProtocol?
    private var readerWatchTask: Task<Void, Never>?
    /// Fingerprint of text we already auto-read (avoid re-loop on same highlight).
    private var lastReadFingerprint: String = ""
    private var readingEventMonitors: [Any] = []
    private let selectionMonitor = SelectionMonitor()

    private static let historyKey = "dictationHistory"
    private static let agentPlistName = "com.johnmatveyev.flowdictate.plist"
    private static let agentOptOutKey = "backgroundAgentOptOut"

    func start() {
        hud = HUDController(appState: self)
        // Always-visible mini pill; expands only while dictating.
        hud?.show()
        loadHistory()
        permissions.refresh()
        // Only block on mic + accessibility. fn key is optional.
        // Also force setup if not in /Applications (TCC Accessibility won't stick).
        if !permissions.requiredGranted || !permissions.locationOK {
            showOnboarding()
        }

        // Never let App Nap idle the hotkey listener.
        backgroundActivity = ProcessInfo.processInfo.beginActivity(
            options: [.background, .automaticTerminationDisabled],
            reason: "Listening for the dictation hotkey"
        )
        registerBackgroundAgent()

        hotkey.onPress = { [weak self] in self?.beginDictation(source: .holdFn) }
        hotkey.onRelease = { [weak self] in
            guard let self, self.triggerSource == .holdFn else { return }
            self.endDictation()
        }
        hotkey.onCancel = { [weak self] in
            guard let self, self.triggerSource == .holdFn else { return }
            self.cancelDictation()
        }
        hotkey.onToggleTap = { [weak self] in self?.handleToggleTap() }
        hotkey.onEscape = { [weak self] in
            guard let self else { return }
            if self.phase == .reading {
                self.stopFlowRead()
            } else {
                self.cancelDictation()
            }
        }
        hotkey.isDictationActiveProvider = { [weak self] in
            MainActor.assumeIsolated {
                switch self?.phase {
                case .recording, .transcribing, .polishing, .reading: return true
                default: return false
                }
            }
        }
        hotkey.startIfPossible()

        installReadingKeyMonitors()
        startSelectionMonitor()

        recorder.onLevel = { [weak self] level in
            guard let self, self.phase == .recording else { return }
            self.currentLevel = level
            self.levelHistory.append(level)
            if self.levelHistory.count > 28 { self.levelHistory.removeFirst() }
        }

        // Keep permission state fresh and the event tap alive.
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                let axBefore = self.permissions.axGranted
                self.permissions.refresh()
                if self.permissions.axGranted {
                    // Newly granted after relaunch — start listeners immediately.
                    if !axBefore {
                        self.hotkey.startIfPossible()
                    }
                    self.hotkey.ensureHealthy()
                    if !self.selectionMonitor.isRunning {
                        self.selectionMonitor.start()
                    }
                }
                self.agentEnabled = SMAppService.agent(plistName: Self.agentPlistName).status == .enabled
            }
        }

        polisher.prewarm()

        Task {
            do {
                try await SpeechModel.ensureInstalled()
                modelStatus = "Speech model ready"
                modelReady = true
            } catch {
                modelStatus = "Speech model failed: \(error.localizedDescription)"
            }
        }

        Task {
            await usage.refreshFromServer()
        }
    }

    // MARK: - HUD design preview (--hud-preview)

    func startHUDPreview() {
        hud = HUDController(appState: self)
        hud?.show()
        Task { await runPreviewLoop() }
    }

    private func runPreviewLoop() async {
        let sample = "So I was thinking we should move the meeting to Tuesday because the client isn't available on Monday"
            .split(separator: " ").map(String.init)
        var t = 0.0
        while !Task.isCancelled {
            phase = .recording
            triggerSource = .toggleTap
            volatileText = ""
            levelHistory = []
            hud?.show()
            for index in sample.indices {
                volatileText = sample[0...index].joined(separator: " ")
                for _ in 0..<4 {
                    t += 0.31
                    let level = Float(0.4 + 0.28 * sin(t) + Double.random(in: 0...0.28))
                    currentLevel = min(1, max(0.05, level))
                    levelHistory.append(currentLevel)
                    if levelHistory.count > 28 { levelHistory.removeFirst() }
                    try? await Task.sleep(for: .milliseconds(70))
                }
            }
            phase = .polishing
            try? await Task.sleep(for: .seconds(1.4))
            volatileText = "So I was thinking we should move the meeting to Tuesday, since the client isn't available on Monday."
            phase = .inserting
            try? await Task.sleep(for: .seconds(2))
        }
    }

    // MARK: - Always-on background agent

    /// launchd agent: starts the app at login and relaunches it after a crash.
    /// Quitting from the menu (clean exit) stays quit until next login.
    private func registerBackgroundAgent() {
        // Migrate off the v1 plain login item.
        if SMAppService.mainApp.status == .enabled {
            try? SMAppService.mainApp.unregister()
        }
        let agent = SMAppService.agent(plistName: Self.agentPlistName)
        if agent.status != .enabled,
           UserDefaults.standard.object(forKey: Self.agentOptOutKey) == nil {
            try? agent.register()
        }
        agentEnabled = agent.status == .enabled
    }

    func setAgentEnabled(_ enabled: Bool) {
        let agent = SMAppService.agent(plistName: Self.agentPlistName)
        if enabled {
            UserDefaults.standard.removeObject(forKey: Self.agentOptOutKey)
            try? agent.register()
        } else {
            UserDefaults.standard.set(true, forKey: Self.agentOptOutKey)
            try? agent.unregister()
        }
        agentEnabled = agent.status == .enabled
    }

    // MARK: - Dictation lifecycle

    private func handleToggleTap() {
        guard optionTapEnabled else { return }
        switch phase {
        case .idle, .inserting:
            beginDictation(source: .toggleTap)
        case .recording:
            endDictation()
        default:
            break
        }
    }

    // MARK: - Highlight-to-speak

    /// Space = play/pause, Esc = cancel (reading mode only).
    private func installReadingKeyMonitors() {
        let global = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            Task { @MainActor in
                _ = self?.handleReadingKey(event)
            }
        }
        let local = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            // Local monitor runs on main; swallow handled keys.
            var handled = false
            if Thread.isMainThread {
                handled = self?.handleReadingKey(event) ?? false
            }
            return handled ? nil : event
        }
        if let global { readingEventMonitors.append(global) }
        if let local { readingEventMonitors.append(local) }
    }

    /// Returns true if the key was handled (should not propagate).
    @discardableResult
    private func handleReadingKey(_ event: NSEvent) -> Bool {
        guard phase == .reading else { return false }
        // Space without cmd/ctrl/opt → play/pause
        if event.keyCode == 49,
           event.modifierFlags.intersection([.command, .control, .option]).isEmpty {
            flowReader.togglePlayPause()
            return true
        }
        // Esc → cancel + clear + neutral
        if event.keyCode == 53 {
            stopFlowRead()
            return true
        }
        return false
    }

    /// Mouse drag-highlight → capture text → auto-read (no menu, no Notes).
    private func startSelectionMonitor() {
        selectionMonitor.onSelection = { [weak self] text in
            self?.handleAutoSelection(text)
        }
        if permissions.axGranted {
            selectionMonitor.start()
        }
        // Also (re)start when AX becomes granted via poll timer path below.
    }

    private func handleAutoSelection(_ text: String) {
        flowReader.reloadSettingsFromDefaults()
        guard flowReader.autoReadEnabled else { return }
        switch phase {
        case .recording, .transcribing, .polishing, .inserting:
            return
        default:
            break
        }
        // Already reading this exact text
        if phase == .reading, flowReader.text == text { return }
        // New drag of different text while reading → switch
        // Same text after natural finish: SelectionMonitor dedupes until re-drag (resetDedupe on Esc)
        startFlowRead(text: text)
    }

    /// Manual trigger from menu (still supported).
    func startFlowReadFromSelection() {
        if phase == .recording || phase == .transcribing || phase == .polishing {
            return
        }
        Task { @MainActor in
            // Prefer live AX; fall back to clipboard steal once.
            var text = SelectionReader.selectedText()
            if text == nil || text?.isEmpty == true {
                text = await SelectionReader.selectedTextViaClipboardSteal()
            }
            guard let text, !text.isEmpty else {
                self.phase = .error("Highlight text with your mouse")
                self.hud?.show()
                self.dismissTask?.cancel()
                self.dismissTask = Task {
                    try? await Task.sleep(for: .seconds(1.4))
                    guard !Task.isCancelled else { return }
                    if case .error = self.phase { self.finishCycle() }
                }
                return
            }
            self.startFlowRead(text: text)
        }
    }

    func startFlowRead(text: String) {
        dismissTask?.cancel()
        if phase == .recording { cancelDictation() }
        lastReadFingerprint = text
        phase = .reading
        volatileText = text
        hud?.show()
        hud?.setInteractive(true)
        flowReader.speak(text)
        readerWatchTask?.cancel()
        readerWatchTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(200))
                if self.phase != .reading { break }
                switch self.flowReader.state {
                case .idle:
                    // Finished naturally → neutral mini pill
                    if !self.flowReader.text.isEmpty {
                        try? await Task.sleep(for: .milliseconds(300))
                        if self.phase == .reading, case .idle = self.flowReader.state {
                            self.finishReadingNeutral()
                        }
                    }
                    return
                case .error(let msg):
                    self.phase = .error(msg)
                    self.hud?.setInteractive(true)
                    try? await Task.sleep(for: .seconds(2.0))
                    if case .error = self.phase { self.finishCycle() }
                    return
                default:
                    break
                }
            }
        }
    }

    /// Esc / stop: cancel audio, clear, back to neutral.
    func stopFlowRead() {
        readerWatchTask?.cancel()
        readerWatchTask = nil
        flowReader.stop(clearText: true)
        // Allow re-drag of the same text to read again
        lastReadFingerprint = ""
        selectionMonitor.resetDedupe()
        hud?.setInteractive(false)
        switch phase {
        case .reading, .error:
            finishCycle()
        default:
            break
        }
    }

    /// Natural end of speech — same neutral state.
    private func finishReadingNeutral() {
        readerWatchTask?.cancel()
        readerWatchTask = nil
        flowReader.stop(clearText: false)
        hud?.setInteractive(false)
        if phase == .reading {
            finishCycle()
        }
    }

    func beginDictation(source: TriggerSource) {
        if phase == .reading { stopFlowRead() }
        if phase == .inserting { dismissTask?.cancel(); finishCycle() }
        guard phase == .idle else { return }
        guard permissions.micGranted else { showOnboarding(); return }

        triggerSource = source
        phase = .recording
        volatileText = ""
        levelHistory = []
        currentLevel = 0
        pressTime = Date()
        NSSound(named: "Pop")?.play()
        hud?.show()

        do {
            let (format, buffers) = try recorder.start()
            sessionTask = Task {
                let session = try await TranscriptionSession(
                    inputFormat: format,
                    buffers: buffers,
                    onVolatile: { text in
                        Task { @MainActor [weak self] in
                            guard let self, self.phase == .recording || self.phase == .transcribing else { return }
                            self.volatileText = text
                        }
                    }
                )
                return session
            }
        } catch {
            fail("Mic error: \(error.localizedDescription)")
        }
    }

    func endDictation() {
        guard phase == .recording else { return }
        // Accidental tap — under 0.25s of hold means it wasn't a dictation.
        guard Date().timeIntervalSince(pressTime) >= 0.25 else {
            cancelDictation()
            return
        }
        let duration = Date().timeIntervalSince(pressTime)
        phase = .transcribing
        recorder.stop()

        Task {
            do {
                guard let sessionTask else { throw DictationError.noSession }
                let session = try await sessionTask.value
                let raw = try await session.finish()
                let cleaned = VocabularyCorrector.apply(TextCleaner.clean(raw))
                guard phase == .transcribing else { return }
                guard !cleaned.isEmpty else {
                    fail("No speech detected")
                    return
                }

                var finalText = cleaned
                if polishEnabled {
                    // Managed free-tier hard stop: still insert raw cleaned text
                    let managedBlocked = usage.isAtLimit
                        && !CloudPolisher.licenseKey.isEmpty
                        && CloudPolisher.preferManagedPro
                        && CloudPolisher.openAIKey.isEmpty
                        && !polisher.isAvailable
                    if !managedBlocked {
                        phase = .polishing
                        volatileText = cleaned
                        // Order: Apple Intelligence (on-device, unlimited) → managed / BYO → raw
                        if polisher.isAvailable, let apple = await polisher.polish(cleaned) {
                            finalText = apple
                        } else if let cloud = await CloudPolisher.polish(cleaned) {
                            finalText = cloud
                        }
                        guard phase == .polishing else { return }
                    }
                }

                volatileText = finalText
                phase = .inserting
                inserter.insert(finalText + " ")
                addToHistory(finalText, duration: duration)
                dismissTask = Task {
                    try? await Task.sleep(for: .seconds(0.9))
                    guard !Task.isCancelled else { return }
                    finishCycle()
                }
            } catch {
                fail("Transcription failed: \(error.localizedDescription)")
            }
        }
    }

    func cancelDictation() {
        recorder.stop()
        let task = sessionTask
        sessionTask = nil
        Task { (try? await task?.value)?.cancel() }
        finishCycle()
    }

    private func finishCycle() {
        phase = .idle
        volatileText = ""
        levelHistory = []
        currentLevel = 0
        sessionTask = nil
        hud?.setInteractive(false)
        // Stay visible as the minimized green pill (do not hide).
        hud?.show()
    }

    private func fail(_ message: String) {
        recorder.stop()
        phase = .error(message)
        dismissTask = Task {
            try? await Task.sleep(for: .seconds(1.8))
            guard !Task.isCancelled else { return }
            finishCycle()
        }
    }

    // MARK: - History

    private func addToHistory(_ text: String, duration: TimeInterval) {
        history.insert(DictationRecord(id: UUID(), text: text, date: .now, duration: duration), at: 0)
        if history.count > 20 { history.removeLast(history.count - 20) }
        if let data = try? JSONEncoder().encode(history) {
            UserDefaults.standard.set(data, forKey: Self.historyKey)
        }
    }

    private func loadHistory() {
        guard let data = UserDefaults.standard.data(forKey: Self.historyKey),
              let records = try? JSONDecoder().decode([DictationRecord].self, from: data) else { return }
        history = records
    }

    // MARK: - Onboarding window

    func showOnboarding() {
        if onboardingWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 600, height: 600),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "Set Up Dictaste"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: OnboardingView(appState: self))
            window.center()
            onboardingWindow = window
        }
        // Refresh content if window already existed (permission state may have changed).
        onboardingWindow?.contentView = NSHostingView(rootView: OnboardingView(appState: self))
        onboardingWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func showVocabulary() {
        if vocabularyWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 480, height: 380),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "Custom Vocabulary"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: VocabularyView())
            window.center()
            vocabularyWindow = window
        }
        vocabularyWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func showAccount() {
        if accountWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 480, height: 440),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "Account & AI Polish"
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: AccountView())
            window.center()
            accountWindow = window
        }
        accountWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
