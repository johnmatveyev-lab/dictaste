import Foundation

/// Rewrites raw dictation into clean written text.
/// Uses Apple Intelligence on macOS 26+ when available; otherwise returns nil
/// so the caller uses cloud polish / basic cleanup (works on macOS 13+).
final class TextPolisher {
    private let backend: any TextPolisherBackend

    init() {
        if #available(macOS 26.0, *) {
            backend = AppleIntelligencePolisherBackend()
        } else {
            backend = NoOpTextPolisherBackend()
        }
    }

    var isAvailable: Bool { backend.isAvailable }

    /// Human-readable reason polish is off, or nil when it's ready.
    var unavailabilityReason: String? { backend.unavailabilityReason }

    /// Loads the model into memory so the first dictation isn't slow.
    func prewarm() { backend.prewarm() }

    func polish(_ text: String) async -> String? {
        await backend.polish(text)
    }
}

protocol TextPolisherBackend: AnyObject {
    var isAvailable: Bool { get }
    var unavailabilityReason: String? { get }
    func prewarm()
    func polish(_ text: String) async -> String?
}

final class NoOpTextPolisherBackend: TextPolisherBackend {
    var isAvailable: Bool { false }
    var unavailabilityReason: String? {
        "On-device Apple Intelligence polish needs macOS 26+. Cloud / BYO polish still works."
    }
    func prewarm() {}
    func polish(_ text: String) async -> String? { nil }
}
