import AppKit
import CoreGraphics

/// Inserts text into whatever field has focus: stash the clipboard, put the
/// transcript on it, synthesize ⌘V, then restore the original clipboard.
@MainActor
final class TextInserter {
    private struct SavedItem {
        let types: [(NSPasteboard.PasteboardType, Data)]
    }

    func insert(_ text: String) {
        let pasteboard = NSPasteboard.general
        let saved = save(pasteboard)

        pasteboard.clearContents()
        // Transient marker keeps clipboard managers from recording the transcript.
        pasteboard.setString("", forType: NSPasteboard.PasteboardType("org.nspasteboard.TransientType"))
        pasteboard.setString(text, forType: .string)

        if postCommandV() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.restore(pasteboard, items: saved)
            }
        }
        // If ⌘V couldn't be posted, the text stays on the clipboard as a fallback.
    }

    private func postCommandV() -> Bool {
        guard let source = CGEventSource(stateID: .combinedSessionState) else { return false }
        let vKey: CGKeyCode = 9
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: false) else {
            return false
        }
        down.flags = .maskCommand
        up.flags = .maskCommand
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
        return true
    }

    private func save(_ pasteboard: NSPasteboard) -> [SavedItem] {
        (pasteboard.pasteboardItems ?? []).map { item in
            SavedItem(types: item.types.compactMap { type in
                item.data(forType: type).map { (type, $0) }
            })
        }
    }

    private func restore(_ pasteboard: NSPasteboard, items: [SavedItem]) {
        pasteboard.clearContents()
        guard !items.isEmpty else { return }
        let restored: [NSPasteboardItem] = items.map { saved in
            let item = NSPasteboardItem()
            for (type, data) in saved.types {
                item.setData(data, forType: type)
            }
            return item
        }
        pasteboard.writeObjects(restored)
    }
}
