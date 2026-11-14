import Foundation

/// Where on the face a brief movement happened. A place, nothing more.
public enum FaceRegion: String, CaseIterable {
    case brow, eye, cheek, nose, mouth, jaw
}

/// One burst of facial movement in one channel, relative to the person's own baseline.
struct FaceBurst: Equatable {
    var channel: Int
    var start: Double
    var duration: Double
    /// channel value at its highest minus the baseline, blendshape units
    var peak: Double
    /// peak relative to the channel's own minimum rise
    var strength: Double
    var region: FaceRegion

    var end: Double { start + duration }
    var isMicro: Bool { duration >= FaceTuning.microMinS && duration <= FaceTuning.microMaxS }
}

/// Brief facial movements, detected exactly as the reference app does (Expressions.swift:
/// BurstDetector, ExpressionSession.feed and .add), without its naming.
///
/// The six channels are the reference's blendshape combinations, kept with their weights
/// because the thresholds were tuned on them. Each is named here by the facial action units
/// (FACS) it adds up; none of them is given a meaning:
///   0  lip corners up (AU12) + cheek raise (AU6)       0.8 smile + 0.2 cheekSquint
///   1  inner brow up (AU1) + lip corners down (AU15)   0.5 browInnerUp + 0.5 mouthFrown
///   2  brow down (AU4) + lips pressed (AU24)           0.6 browDown + 0.4 mouthPress
///   3  nose wrinkle (AU9) + upper lip up (AU10)        0.6 noseSneer + 0.4 mouthUpperUp
///   4  outer brow up (AU2) + eyes wide (AU5) + jaw open (AU26)
///        0.6 browOuterUp + 0.2 eyeWide + 0.2 jawOpen, times 0.3 unless browOuterUp > 0.2
///        (measured: looking away or up gives eyeWide 0.3 to 0.4 with the outer brows at 0)
///   5  left/right difference of the lip corners         |smileLeft - smileRight|
///
/// Per channel (BurstDetector.feed): baseline = median of the last 5 s; onset above
/// baseline + max(minRise, 4 x MAD); offset below baseline + half of that; 40 to 500 ms is brief.
///
/// One facial action moves several channels (measured: a hard mouthFrown of 0.8 also lifts
/// noseSneer to 0.3). Bursts of different channels that overlap by more than half of the
/// shorter one are one action; the one strongest relative to its own minRise is kept
/// (ExpressionSession.add). So one facial action is one event.
///
/// The region of an event is read from the blendshapes that moved: of the kept channel's
/// parts, the one that rose furthest above its own 5 s median during the burst names it.
struct FaceMicroDetector {
    static let channelCount = 6
    static let componentCount = 12

    static let minRise: [Double] = [
        FaceTuning.minRiseLipCorner, FaceTuning.minRiseDefault, FaceTuning.minRiseDefault,
        FaceTuning.minRiseDefault, FaceTuning.minRiseDefault, FaceTuning.minRiseLipCornerDifference,
    ]
    /// the parts of each channel, as indices into the component list below
    static let componentRange: [Range<Int>] = [0..<2, 2..<4, 4..<6, 6..<8, 8..<11, 11..<12]
    static let componentRegion: [FaceRegion] = [
        .mouth, .cheek,         // 0: mouthSmile, cheekSquint
        .brow, .mouth,          // 1: browInnerUp, mouthFrown
        .brow, .mouth,          // 2: browDown, mouthPress
        .nose, .mouth,          // 3: noseSneer, mouthUpperUp
        .brow, .eye, .jaw,      // 4: browOuterUp, eyeWide, jawOpen
        .mouth,                 // 5: lip corner difference
    ]

    private var channelWindows: [FaceRunningWindow]
    private var componentWindows: [FaceRunningWindow]
    private var values = [Double](repeating: 0, count: channelCount)
    private var components = [Double](repeating: 0, count: componentCount)
    private var active = [Bool](repeating: false, count: channelCount)
    private var start = [Double](repeating: 0, count: channelCount)
    private var peak = [Double](repeating: 0, count: channelCount)
    private var componentBase = [Double](repeating: 0, count: componentCount)
    private var componentPeak = [Double](repeating: 0, count: componentCount)
    /// finished bursts that a still running burst could yet overlap
    private var pending: [FaceBurst] = []
    private var lastFarT = -Double.infinity

    init() {
        channelWindows = (0..<Self.channelCount).map { _ in FaceRunningWindow(capacity: FaceTuning.baselineFrames) }
        componentWindows = (0..<Self.componentCount).map { _ in FaceRunningWindow(capacity: FaceTuning.baselineFrames) }
        pending.reserveCapacity(16)
    }

    /// The reference's blendshape combinations (ExpressionKind.values) and their parts.
    static func channels(_ s: FaceShapeVector, values x: inout [Double], components c: inout [Double]) {
        typealias B = FaceBlendShapes
        func pair(_ l: Int, _ r: Int) -> Double { Double(s[l] + s[r]) / 2 }
        let smileL = Double(s[B.mouthSmileL]), smileR = Double(s[B.mouthSmileR])
        c[0] = (smileL + smileR) / 2
        c[1] = pair(B.cheekSquintL, B.cheekSquintR)
        c[2] = Double(s[B.browInnerUp])
        c[3] = pair(B.mouthFrownL, B.mouthFrownR)
        c[4] = pair(B.browDownL, B.browDownR)
        c[5] = pair(B.mouthPressL, B.mouthPressR)
        c[6] = pair(B.noseSneerL, B.noseSneerR)
        c[7] = pair(B.mouthUpperUpL, B.mouthUpperUpR)
        c[8] = pair(B.browOuterUpL, B.browOuterUpR)
        c[9] = pair(B.eyeWideL, B.eyeWideR)
        c[10] = Double(s[B.jawOpen])
        c[11] = abs(smileL - smileR)
        x[0] = c[0] * 0.8 + c[1] * 0.2
        x[1] = 0.5 * c[2] + 0.5 * c[3]
        x[2] = 0.6 * c[4] + 0.4 * c[5]
        x[3] = 0.6 * c[6] + 0.4 * c[7]
        let raw = 0.6 * c[8] + 0.2 * c[9] + 0.2 * c[10]
        x[4] = c[8] > 0.2 ? raw : 0.3 * raw
        x[5] = c[11]
    }

    /// One tracked frame. `lookingFarAway`: gaze more than 25 degrees from where the person
    /// mostly looks. Brief movements that can no longer change are appended to `out`.
    mutating func feed(_ shapes: FaceShapeVector, t: Double, lookingFarAway: Bool, into out: inout [FaceBurst]) {
        Self.channels(shapes, values: &values, components: &components)
        feedChannels(t: t, lookingFarAway: lookingFarAway, into: &out)
    }

    /// For tests: the channel values directly (their parts are taken as given).
    mutating func feed(values x: [Double], components c: [Double], t: Double, lookingFarAway: Bool,
                       into out: inout [FaceBurst]) {
        for i in 0..<Self.channelCount { values[i] = x[i] }
        for i in 0..<Self.componentCount { components[i] = c[i] }
        feedChannels(t: t, lookingFarAway: lookingFarAway, into: &out)
    }

    private mutating func feedChannels(t: Double, lookingFarAway: Bool, into out: inout [FaceBurst]) {
        if lookingFarAway { lastFarT = t }
        for ch in 0..<Self.channelCount {
            let x = values[ch]
            let base = channelWindows[ch].median
            channelWindows[ch].push(x)
            let thr = max(Self.minRise[ch], FaceTuning.madFactor * channelWindows[ch].medianAbsoluteDeviation(around: base))
            let parts = Self.componentRange[ch]
            if active[ch] {
                peak[ch] = max(peak[ch], x)
                for k in parts { componentPeak[k] = max(componentPeak[k], components[k]) }
                guard x < base + thr / 2 else { continue }
                active[ch] = false
                let duration = t - start[ch]
                guard duration >= FaceTuning.microMinS else { continue }
                // blendshapes are unreliable that far off: nothing that began or ran while looking away
                guard lastFarT + FaceTuning.farHoldS <= start[ch] else { continue }
                var region = Self.componentRegion[parts.lowerBound]
                var furthest = -Double.infinity
                for k in parts where componentPeak[k] - componentBase[k] > furthest {
                    furthest = componentPeak[k] - componentBase[k]
                    region = Self.componentRegion[k]
                }
                let rise = peak[ch] - base
                add(FaceBurst(channel: ch, start: start[ch], duration: duration, peak: rise,
                              strength: rise / Self.minRise[ch], region: region))
            } else if channelWindows[ch].count >= FaceTuning.warmupFrames && x > base + thr {
                active[ch] = true
                start[ch] = t
                peak[ch] = x
                for k in parts {
                    componentBase[k] = componentWindows[k].median
                    componentPeak[k] = components[k]
                }
            }
        }
        for k in 0..<Self.componentCount { componentWindows[k].push(components[k]) }
        settle(t: t, into: &out)
    }

    /// Tracking was lost: running bursts are dropped, finished ones are settled.
    mutating func trackingLost(t: Double, into out: inout [FaceBurst]) {
        for ch in 0..<Self.channelCount { active[ch] = false }
        settle(t: t, into: &out)
    }

    /// ExpressionSession.add: overlapping bursts of different channels are one action.
    private mutating func add(_ e: FaceBurst) {
        var beaten = false
        for o in pending where Self.overlaps(e, o) && o.strength >= e.strength { beaten = true }
        if beaten { return }
        pending.removeAll { Self.overlaps(e, $0) }
        pending.append(e)
    }

    private static func overlaps(_ e: FaceBurst, _ o: FaceBurst) -> Bool {
        let overlap = min(e.end, o.end) - max(e.start, o.start)
        return o.channel != e.channel && overlap > FaceTuning.overlapShare * min(e.duration, o.duration)
    }

    /// The reference resolves overlaps in a list it keeps for the whole session. Here an event
    /// leaves as soon as no running burst can still overlap it, which gives the same result:
    /// a burst that ends later overlaps it only if it began before this one ended, and by
    /// more than half of the shorter of the two.
    private mutating func settle(t: Double, into out: inout [FaceBurst]) {
        guard !pending.isEmpty else { return }
        var i = 0
        while i < pending.count {
            let e = pending[i]
            var open = false
            for ch in 0..<Self.channelCount where active[ch] && ch != e.channel && start[ch] < e.end {
                let overlap = e.end - max(e.start, start[ch])
                if overlap > FaceTuning.overlapShare * min(e.duration, t - start[ch]) { open = true }
            }
            if open { i += 1; continue }
            pending.remove(at: i)
            if e.isMicro { out.append(e) }
        }
    }
}
