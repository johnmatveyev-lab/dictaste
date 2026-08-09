import AppKit
import ApplicationServices
import CoreGraphics

/// Watches for mouse text-selection (drag-highlight) system-wide and reports
/// the selected string as soon as the drag ends — no copy/paste into Notes.
@MainActor
final class SelectionMonitor {
    /// Fired on main when a new non-empty selection is confirmed after mouse-up.
    var onSelection: ((String) -> Void)?

    private var mouseDownMonitor: Any?
    private var mouseUpMonitor: Any?
    private var mouseDraggedMonitor: Any?
    private var localMouseUpMonitor: Any?

    private var dragStart: NSPoint?
    private var didDrag = false
    private var lastEmitted = ""
    private var captureTask: Task<Void, Never>?
    private(set) var isRunning = false

    /// Minimum characters to treat as intentional selection.
    private let minChars = 4
    /// Minimum drag distance in points (avoids accidental clicks).
    private let minDrag: CGFloat = 6

    func start() {
        guard !isRunning else { return }
        guard AXIsProcessTrusted() else { return }
        isRunning = true

        mouseDownMonitor = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            Task { @MainActor in
                self?.dragStart = NSEvent.mouseLocation
                self?.didDrag = false
            }
        }
        mouseDraggedMonitor = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDragged) { [weak self] _ in
            Task { @MainActor in
                self?.didDrag = true
            }
        }
        mouseUpMonitor = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseUp) { [weak self] event in
            Task { @MainActor in
                self?.handleMouseUp(event)
            }
        }
        localMouseUpMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseDragged, .leftMouseUp]) { [weak self] event in
            Task { @MainActor in
                switch event.type {
                case .leftMouseDown:
                    self?.dragStart = NSEvent.mouseLocation
                    self?.didDrag = false
                case .leftMouseDragged:
                    self?.didDrag = true
                case .leftMouseUp:
                    self?.handleMouseUp(event)
                default:
                    break
                }
            }
            return event
        }
    }

    func stop() {
        if let m = mouseDownMonitor { NSEvent.removeMonitor(m) }
        if let m = mouseUpMonitor { NSEvent.removeMonitor(m) }
        if let m = mouseDraggedMonitor { NSEvent.removeMonitor(m) }
        if let m = localMouseUpMonitor { NSEvent.removeMonitor(m) }
        mouseDownMonitor = nil
        mouseUpMonitor = nil
        mouseDraggedMonitor = nil
        localMouseUpMonitor = nil
        captureTask?.cancel()
        isRunning = false
    }

    private func handleMouseUp(_ event: NSEvent) {
        let dragged: Bool
        if let start = dragStart {
            let end = NSEvent.mouseLocation
            let dx = abs(end.x - start.x)
            let dy = abs(end.y - start.y)
            dragged = didDrag || dx > minDrag || dy > minDrag
        } else {
            dragged = didDrag
        }
        dragStart = nil
        let wasDrag = didDrag
        didDrag = false
        guard dragged || wasDrag else { return }

        // Delay so the host app commits the selection range.
        captureTask?.cancel()
        captureTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(50))
            guard let self, !Task.isCancelled else { return }

            if let text = await self.captureSelection(), text.count >= self.minChars {
                self.emit(text)
                return
            }
            // Second chance — some apps lag
            try? await Task.sleep(for: .milliseconds(100))
            guard !Task.isCancelled else { return }
            if let text = await self.captureSelection(), text.count >= self.minChars {
                self.emit(text)
            }
        }
    }

    private func emit(_ text: String) {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalized.count >= minChars else { return }
        if normalized == lastEmitted { return }
        lastEmitted = normalized
        onSelection?(normalized)
    }

    /// Forget last emit so the same highlight can be re-read after Esc / re-drag.
    func resetDedupe() {
        lastEmitted = ""
    }

    private func captureSelection() async -> String? {
        // 1) Accessibility first (no clipboard side effects)
        if let ax = SelectionReader.selectedText(), ax.count >= minChars {
            return ax
        }
        // 2) Silent ⌘C + restore — works in Chrome, Slack, Electron, browsers, etc.
        return await SelectionReader.selectedTextViaClipboardSteal()
    }
}

// MARK: - SelectionReader (AX + clipboard)

enum SelectionReader {
    /// Best-effort selected text from the focused UI element.
    static func selectedText() -> String? {
        let system = AXUIElementCreateSystemWide()

        if let t = selectedText(inFocusedOf: system) { return t }

        var appRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(system, kAXFocusedApplicationAttribute as CFString, &appRef) == .success,
           let app = appRef {
            let appEl = app as! AXUIElement
            if let t = selectedText(inFocusedOf: appEl) { return t }

            var winRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(appEl, kAXFocusedWindowAttribute as CFString, &winRef) == .success,
               let win = winRef {
                if let t = selectedText(inFocusedOf: win as! AXUIElement) { return t }
            }
        }
        return nil
    }

    private static func selectedText(inFocusedOf element: AXUIElement) -> String? {
        var focused: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
           let f = focused {
            return selectedText(from: f as! AXUIElement)
        }
        return selectedText(from: element)
    }

    private static func selectedText(from element: AXUIElement) -> String? {
        var selected: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &selected) == .success,
           let str = selected as? String {
            let t = str.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty { return t }
        }

        var rangeRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &rangeRef) == .success,
           let rangeVal = rangeRef {
            var full: CFTypeRef?
            if AXUIElementCopyParameterizedAttributeValue(
                element,
                kAXStringForRangeParameterizedAttribute as CFString,
                rangeVal,
                &full
            ) == .success,
               let str = full as? String {
                let t = str.trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty { return t }
            }
        }
        return nil
    }

    /// Copies selection with ⌘C, reads pasteboard, restores previous clipboard.
    static func selectedTextViaClipboardSteal() async -> String? {
        await withCheckedContinuation { cont in
            DispatchQueue.main.async {
                let pb = NSPasteboard.general
                let saved = savePasteboard(pb)

                guard postCommandC() else {
                    cont.resume(returning: nil)
                    return
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                    let text = pb.string(forType: .string)?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    restorePasteboard(pb, items: saved)
                    if let text, text.count >= 4 {
                        cont.resume(returning: text)
                    } else {
                        cont.resume(returning: nil)
                    }
                }
            }
        }
    }

    private struct SavedItem {
        let types: [(NSPasteboard.PasteboardType, Data)]
    }

    private static func savePasteboard(_ pb: NSPasteboard) -> [SavedItem] {
        (pb.pasteboardItems ?? []).map { item in
            SavedItem(types: item.types.compactMap { type in
                item.data(forType: type).map { (type, $0) }
            })
        }
    }

    private static func restorePasteboard(_ pb: NSPasteboard, items: [SavedItem]) {
        pb.clearContents()
        guard !items.isEmpty else { return }
        let restored: [NSPasteboardItem] = items.map { saved in
            let item = NSPasteboardItem()
            for (type, data) in saved.types {
                item.setData(data, forType: type)
            }
            return item
        }
        pb.writeObjects(restored)
    }

    private static func postCommandC() -> Bool {
        guard let source = CGEventSource(stateID: .combinedSessionState) else { return false }
        let cKey: CGKeyCode = 8 // kVK_ANSI_C
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: cKey, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: cKey, keyDown: false)
        else { return false }
        down.flags = .maskCommand
        up.flags = .maskCommand
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
        return true
    }
}
