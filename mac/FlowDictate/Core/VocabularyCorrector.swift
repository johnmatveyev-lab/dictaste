import Foundation

/// Fixes known speech-recognition mishears (e.g. "cloud code" → "Claude Code")
/// that AI polish can't reliably catch, since the wrong word is usually a
/// common, grammatically valid one. Apple's on-device SpeechTranscriber has no
/// custom-vocabulary API, so this is a plain, user-editable phrase correction
/// list applied right after transcription.
enum VocabularyCorrector {
    private static let key = "customVocabularyRules"

    /// One rule per line, format: "mishear => correct". Blank lines and lines
    /// starting with # are ignored.
    static let defaultRulesText = """
    cloud code => Claude Code
    """

    static var rulesText: String {
        get { UserDefaults.standard.string(forKey: key) ?? defaultRulesText }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    private struct Rule {
        let pattern: NSRegularExpression
        let replacement: String
    }

    private static func parseRules(_ text: String) -> [Rule] {
        text.split(separator: "\n").compactMap { line -> Rule? in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty, !trimmed.hasPrefix("#"),
                  let arrowRange = trimmed.range(of: "=>") else { return nil }
            let wrong = trimmed[trimmed.startIndex..<arrowRange.lowerBound]
                .trimmingCharacters(in: .whitespaces)
            let correct = trimmed[arrowRange.upperBound...]
                .trimmingCharacters(in: .whitespaces)
            guard !wrong.isEmpty, !correct.isEmpty else { return nil }
            let escaped = NSRegularExpression.escapedPattern(for: wrong)
            guard let regex = try? NSRegularExpression(
                pattern: #"\b\#(escaped)\b"#,
                options: [.caseInsensitive]
            ) else { return nil }
            return Rule(pattern: regex, replacement: correct)
        }
    }

    static func apply(_ text: String) -> String {
        var result = text
        for rule in parseRules(rulesText) {
            let range = NSRange(result.startIndex..., in: result)
            result = rule.pattern.stringByReplacingMatches(
                in: result, options: [], range: range, withTemplate: rule.replacement
            )
        }
        return result
    }
}
