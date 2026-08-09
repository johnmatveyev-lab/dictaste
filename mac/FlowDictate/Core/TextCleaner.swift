import Foundation

enum TextCleaner {
    /// Strips filler words, tidies whitespace/punctuation spacing, capitalizes.
    /// The speech engine already provides punctuation and capitalization.
    static func clean(_ raw: String) -> String {
        var text = raw

        // Filler words: um, uh, erm, hmm and friends, plus a trailing comma/period.
        text = text.replacingOccurrences(
            of: #"(?i)\b(um+|uh+|erm+|hm+|mm+-?hm+)\b[,.]?\s*"#,
            with: "",
            options: .regularExpression
        )
        // Collapse runs of spaces, fix space before punctuation.
        text = text.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
        text = text.replacingOccurrences(of: #"\s+([,.!?;:])"#, with: "$1", options: .regularExpression)
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)

        // Re-capitalize the first letter (filler removal can expose a lowercase start).
        if let first = text.first, first.isLowercase {
            text = first.uppercased() + text.dropFirst()
        }
        return text
    }
}
