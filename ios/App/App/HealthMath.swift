import Foundation

// Sleep from Apple Health: which samples make up the last night and how many minutes they cover. Foundation only, so
// ios/App/FingerTests runs it on macOS (`swift test`). Apple Watch, the iPhone and other apps can all write sleep, often
// for the same hours, so overlapping samples are counted once.

/// One sample's time span, in ms since 1970.
struct HealthSpan: Equatable {
    let start: Double
    let end: Double
}

/// The last night: its first start, its last end and the minutes it covers.
struct HealthNight: Equatable {
    let start: Double
    let end: Double
    let minutes: Double
}

enum HealthMath {
    /// A night is the samples that end within 16 h before the latest end.
    static let nightSpanMs: Double = 16 * 3600 * 1000

    /// Minutes covered by the spans, overlaps counted once. Spans that end before they start are ignored.
    static func coveredMinutes(_ spans: [HealthSpan]) -> Double {
        let ok = spans.filter { $0.end > $0.start }.sorted { $0.start < $1.start }
        var total = 0.0
        var cur: HealthSpan?
        for s in ok {
            if let c = cur, s.start <= c.end {
                cur = HealthSpan(start: c.start, end: max(c.end, s.end))
            } else {
                if let c = cur { total += c.end - c.start }
                cur = s
            }
        }
        if let c = cur { total += c.end - c.start }
        return total / 60000
    }

    /// The last night of the spans, or nil when there are none.
    static func lastNight(_ spans: [HealthSpan], span: Double = nightSpanMs) -> HealthNight? {
        let ok = spans.filter { $0.end > $0.start }
        guard let last = ok.map({ $0.end }).max() else { return nil }
        let night = ok.filter { $0.end >= last - span }
        guard let first = night.map({ $0.start }).min() else { return nil }
        return HealthNight(start: first, end: last, minutes: coveredMinutes(night))
    }
}
