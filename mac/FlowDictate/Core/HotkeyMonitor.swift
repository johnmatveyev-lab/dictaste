import AppKit
import CoreGraphics

/// Watches the fn/globe key and left ⌥ system-wide via an active CGEventTap.
/// fn: hold = record, release = insert; any other key while fn is down
/// (fn+arrow etc.) cancels instead of firing. Left ⌥: a clean, quick tap
/// (no other key, mouse, or scroll during the press) fires onToggleTap —
/// combos like ⌥+e or ⌥-click never trigger it.
final class HotkeyMonitor {
    var onPress: (() -> Void)?
    var onRelease: (() -> Void)?
    var onCancel: (() -> Void)?
    var onToggleTap: (() -> Void)?
    var onEscape: (() -> Void)?
    /// Queried synchronously from the tap (main thread) to decide whether to
    /// swallow the Esc key. True while a dictation is in flight.
    var isDictationActiveProvider: (() -> Bool)?

    private(set) var isActive = false
    private var tap: CFMachPort?
    private var fnDown = false
    private var cancelled = false
    private var optionDown = false
    private var optionTapValid = false
    private var optionDownTime: CFAbsoluteTime = 0

    private static let fnKeyCode: Int64 = 63 // kVK_Function
    private static let leftOptionKeyCode: Int64 = 58 // kVK_Option
    private static let tapMaxDuration: CFAbsoluteTime = 0.4

    func startIfPossible() {
        guard !isActive, AXIsProcessTrusted() else { return }
        let mask: CGEventMask =
            (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue) |
            (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue) |
            (1 << CGEventType.scrollWheel.rawValue)
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: mask,
            callback: { _, type, event, refcon in
                guard let refcon else { return Unmanaged.passUnretained(event) }
                let consumed = Unmanaged<HotkeyMonitor>.fromOpaque(refcon)
                    .takeUnretainedValue()
                    .handle(type: type, event: event)
                return consumed ? nil : Unmanaged.passUnretained(event)
            },
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else { return }

        self.tap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        isActive = true
    }

    /// Called by the poll timer: re-enables or fully recreates a dead tap
    /// (e.g. after the system disabled it or Accessibility was re-granted).
    func ensureHealthy() {
        guard isActive, let tap else {
            startIfPossible()
            return
        }
        if !CGEvent.tapIsEnabled(tap: tap) {
            CGEvent.tapEnable(tap: tap, enable: true)
            if !CGEvent.tapIsEnabled(tap: tap) {
                CFMachPortInvalidate(tap)
                self.tap = nil
                isActive = false
                startIfPossible()
            }
        }
    }

    /// Returns true when the event should be swallowed (not passed on).
    private func handle(type: CGEventType, event: CGEvent) -> Bool {
        switch type {
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
        case .flagsChanged:
            switch event.getIntegerValueField(.keyboardEventKeycode) {
            case Self.fnKeyCode:
                let down = event.flags.contains(.maskSecondaryFn)
                if down && !fnDown {
                    fnDown = true
                    cancelled = false
                    DispatchQueue.main.async { self.onPress?() }
                } else if !down && fnDown {
                    fnDown = false
                    let wasCancelled = cancelled
                    cancelled = false
                    if !wasCancelled {
                        DispatchQueue.main.async { self.onRelease?() }
                    }
                }
            case Self.leftOptionKeyCode:
                let down = event.flags.contains(.maskAlternate)
                if down && !optionDown {
                    optionDown = true
                    optionTapValid = true
                    optionDownTime = CFAbsoluteTimeGetCurrent()
                } else if !down && optionDown {
                    optionDown = false
                    if optionTapValid,
                       CFAbsoluteTimeGetCurrent() - optionDownTime < Self.tapMaxDuration {
                        DispatchQueue.main.async { self.onToggleTap?() }
                    }
                }
            default:
                break
            }
        case .keyDown:
            if optionDown { optionTapValid = false }
            // Esc cancels an in-flight dictation and never reaches the app behind it.
            if event.getIntegerValueField(.keyboardEventKeycode) == 53,
               isDictationActiveProvider?() == true {
                if fnDown { cancelled = true }
                DispatchQueue.main.async { self.onEscape?() }
                return true
            }
            if fnDown && !cancelled {
                cancelled = true
                DispatchQueue.main.async { self.onCancel?() }
            }
        case .leftMouseDown, .rightMouseDown, .scrollWheel:
            if optionDown { optionTapValid = false }
        default:
            break
        }
        return false
    }
}
