import Foundation

/// Facial-behaviour analysis from ARKit blendshapes (0...1, 60 Hz).
///
/// Not a diagnosis. Research links depression to *behavioural* differences on average
/// (less smiling, lower expressivity, more AU1+AU15 "sadness" activity, more downward gaze;
/// e.g. Girard et al. 2014, Cohn et al. 2009) — useful as context next to a validated
/// self-report (PHQ-9), never on its own.
///
/// Expression channels are FACS action-unit approximations built from blendshapes.
enum ExpressionKind: String, CaseIterable, Codable {
    case happy, sad, anger, disgust, surprise, contempt

    var label: String {
        switch self {
        case .happy: return "Smile"
        case .sad: return "Sadness"
        case .anger: return "Anger"
        case .disgust: return "Disgust"
        case .surprise: return "Surprise / fear"
        case .contempt: return "Contempt"
        }
    }

    /// FACS-style composite from ARKit blendshape names
    static func values(_ b: [String: Double]) -> [ExpressionKind: Double] {
        func v(_ k: String) -> Double { b[k] ?? 0 }
        let smileL = v("mouthSmileLeft"), smileR = v("mouthSmileRight")
        return [
            .happy: (smileL + smileR) / 2 * 0.8 + (v("cheekSquintLeft") + v("cheekSquintRight")) / 2 * 0.2, // AU12 + AU6
            .sad: 0.5 * v("browInnerUp") + 0.5 * (v("mouthFrownLeft") + v("mouthFrownRight")) / 2,         // AU1 + AU15
            .anger: 0.6 * (v("browDownLeft") + v("browDownRight")) / 2 + 0.4 * (v("mouthPressLeft") + v("mouthPressRight")) / 2, // AU4 + AU24
            .disgust: 0.6 * (v("noseSneerLeft") + v("noseSneerRight")) / 2 + 0.4 * (v("mouthUpperUpLeft") + v("mouthUpperUpRight")) / 2, // AU9 + AU10
            // AU5 + AU2 + AU26: outer brow raise (AU2), not inner (AU1) - inner brow is also sadness,
            // so a sad micro-expression used to fire "surprise" as well
            .surprise: 0.4 * (v("eyeWideLeft") + v("eyeWideRight")) / 2 + 0.3 * (v("browOuterUpLeft") + v("browOuterUpRight")) / 2 + 0.3 * v("jawOpen"),
            .contempt: abs(smileL - smileR),                                                                     // unilateral AU12/14
        ]
    }
}

struct ExpressionEvent: Equatable {
    let kind: ExpressionKind
    let start: Double
    let duration: Double
    let peak: Double
    var isMicro: Bool { duration >= 0.04 && duration <= 0.5 }
}

/// Finds brief expression bursts in one channel against the person's own baseline.
/// Onset: value rises above baseline + threshold; offset: falls back below baseline + threshold/2
/// (hysteresis). Bursts of 40-500 ms are micro-expressions, longer ones macro-expressions.
struct BurstDetector {
    let kind: ExpressionKind
    var history: [Double] = []          // last ~5 s for the baseline
    var active: (start: Double, peak: Double)?
    let historyLen = 300                 // 5 s at 60 Hz
    /// blendshape units above the person's baseline. Measured on a real face: a slight smile
    /// is only +0.05-0.09 (big smile +0.77), so smile gets a low threshold.
    var minRise: Double {
        switch kind {
        case .happy: return 0.04
        case .contempt: return 0.05
        default: return 0.10
        }
    }

    mutating func feed(_ x: Double, t: Double) -> ExpressionEvent? {
        let base = baseline()
        history.append(x)
        if history.count > historyLen { history.removeFirst(history.count - historyLen) }
        let thr = max(minRise, 4 * mad(around: base))
        if let a = active {
            active = (a.start, max(a.peak, x))
            if x < base + thr / 2 {
                active = nil
                let dur = t - a.start
                if dur >= 0.04 { return ExpressionEvent(kind: kind, start: a.start, duration: dur, peak: max(a.peak, x) - base) }
            }
        } else if history.count >= 30 && x > base + thr {
            active = (t, x)
        }
        return nil
    }

    func baseline() -> Double {
        guard !history.isEmpty else { return 0 }
        let s = history.sorted()
        return s[s.count / 2]
    }

    func mad(around m: Double) -> Double {
        guard !history.isEmpty else { return 0 }
        let d = history.map { abs($0 - m) }.sorted()
        return d[d.count / 2]
    }
}

/// One measurement session: per-frame blendshapes in, summary out.
struct ExpressionSession {
    private(set) var detectors = ExpressionKind.allCases.map { BurstDetector(kind: $0) }
    private(set) var events: [ExpressionEvent] = []
    private(set) var frames = 0
    private(set) var start: Double?
    private(set) var lastT = 0.0
    private var smileFrames = 0, gazeDownFrames = 0
    private var calHappy: [Double] = []
    private var baseHappy: Double?

    private var blinkClosed = false
    private(set) var blinks = 0
    private var sums = [String: Double](), sumsSq = [String: Double]()
    // eyes / gaze (degrees; 0,0 = looking at the camera)
    private var lastGaze: (t: Double, yaw: Double, pitch: Double)?
    private(set) var gazeShifts = 0             // saccade-like jumps > 3 deg at > 60 deg/s
    private var shiftCooldownUntil = 0.0
    private var gazeAwayFrames = 0, eyeWideFrames = 0, gazeFrames = 0
    // Personal baselines from the first `calibrationS` seconds ("look at the screen"):
    // people hold the phone below eye level, so "at the screen" is not 0 deg / not lookDown 0.
    static let calibrationS = 10.0
    static let awayDeg = 7.0           // measured: looking away read 5-12 deg in ARKit
    private var calYaw: [Double] = [], calPitch: [Double] = [], calDown: [Double] = []
    private var baseGaze: (yaw: Double, pitch: Double)?
    private var baseDown: Double?

    private static func median(_ v: [Double]) -> Double {
        let s = v.sorted(); return s.isEmpty ? 0 : s[s.count / 2]
    }

    /// gaze yaw/pitch in degrees relative to the camera (ARFaceAnchor.lookAtPoint)
    mutating func feedGaze(yaw: Double, pitch: Double, t: Double) {
        gazeFrames += 1
        if let s = start, t - s < Self.calibrationS {
            calYaw.append(yaw); calPitch.append(pitch)
        } else if baseGaze == nil {
            baseGaze = (Self.median(calYaw), Self.median(calPitch))
        }
        let b = baseGaze ?? (0, 0)
        if hypot(yaw - b.yaw, pitch - b.pitch) > Self.awayDeg { gazeAwayFrames += 1 }
        if let g = lastGaze, t > g.t {
            let jump = hypot(yaw - g.yaw, pitch - g.pitch)
            let speed = jump / (t - g.t)
            if jump > 3 && speed > 60 && t >= shiftCooldownUntil {
                gazeShifts += 1
                shiftCooldownUntil = t + 0.1     // one shift = one saccade, not every frame of it
            }
        }
        lastGaze = (t, yaw, pitch)
    }

    mutating func feed(_ b: [String: Double], t: Double) {
        if start == nil { start = t }
        lastT = t
        frames += 1
        let vals = ExpressionKind.values(b)
        let happy = vals[.happy] ?? 0
        for i in detectors.indices {
            guard let e = detectors[i].feed(vals[detectors[i].kind] ?? 0, t: t) else { continue }
            add(e, minRise: detectors[i].minRise)
        }
        if let s = start, t - s < Self.calibrationS { calHappy.append(happy) }
        else if baseHappy == nil { baseHappy = Self.median(calHappy) }
        if happy > (baseHappy ?? 0.02) + 0.04 { smileFrames += 1 }
        let down = ((b["eyeLookDownLeft"] ?? 0) + (b["eyeLookDownRight"] ?? 0)) / 2
        if let s = start, t - s < Self.calibrationS { calDown.append(down) }
        else if baseDown == nil { baseDown = Self.median(calDown) }
        if down > (baseDown ?? 0.2) + 0.15 { gazeDownFrames += 1 }
        let blink = ((b["eyeBlinkLeft"] ?? 0) + (b["eyeBlinkRight"] ?? 0)) / 2
        if ((b["eyeWideLeft"] ?? 0) + (b["eyeWideRight"] ?? 0)) / 2 > 0.4 { eyeWideFrames += 1 }
        if !blinkClosed && blink > 0.6 { blinkClosed = true; blinks += 1 }
        if blinkClosed && blink < 0.4 { blinkClosed = false }   // resting eyeBlink is 0.2-0.3 on real faces
        for (k, v) in b {
            sums[k, default: 0] += v
            sumsSq[k, default: 0] += v * v
        }
    }

    /// One facial action moves several blendshapes (a hard frown also wrinkles the nose, a big
    /// smile raises the upper lip), so overlapping bursts of different kinds are the same action:
    /// keep the one that is strongest relative to its own threshold. Measured on a real face:
    /// 5 frowns (mouthFrown 0.8) each also fired "disgust" via noseSneer 0.3.
    private var strengths: [Double] = []
    private mutating func add(_ e: ExpressionEvent, minRise: Double) {
        let strength = e.peak / minRise
        let end = e.start + e.duration
        let overlapping = events.indices.filter { i in
            let o = events[i]
            let overlap = min(end, o.start + o.duration) - max(e.start, o.start)
            return o.kind != e.kind && overlap > 0.5 * min(e.duration, o.duration)
        }
        if overlapping.contains(where: { strengths[$0] >= strength }) { return }
        for i in overlapping.reversed() { events.remove(at: i); strengths.remove(at: i) }
        events.append(e)
        strengths.append(strength)
    }

    var seconds: Double { start.map { lastT - $0 } ?? 0 }

    struct Summary: Equatable {
        var seconds: Double
        var smileShare: Double          // fraction of time smiling
        var expressivity: Double        // mean std of all blendshapes (facial movement)
        var gazeDownShare: Double
        var blinksPerMinute: Double
        var gazeShiftsPerMinute: Double  // saccade-like jumps
        var gazeAwayShare: Double        // looking > 7 deg away from where the person looked during calibration
        var eyeWideShare: Double
        var micro: [ExpressionKind: Int]
        var macro: [ExpressionKind: Int]
    }

    var summary: Summary {
        let n = Double(max(frames, 1))
        var stds: [Double] = []
        for (k, s) in sums {
            let m = s / n
            stds.append(sqrt(max((sumsSq[k] ?? 0) / n - m * m, 0)))
        }
        var micro = [ExpressionKind: Int](), macro = [ExpressionKind: Int]()
        for e in events { if e.isMicro { micro[e.kind, default: 0] += 1 } else { macro[e.kind, default: 0] += 1 } }
        let minutes = max(seconds / 60, 1e-6)
        return Summary(seconds: seconds,
                       smileShare: Double(smileFrames) / n,
                       expressivity: stds.isEmpty ? 0 : stds.reduce(0, +) / Double(stds.count),
                       gazeDownShare: Double(gazeDownFrames) / n,
                       blinksPerMinute: Double(blinks) / minutes,
                       gazeShiftsPerMinute: Double(gazeShifts) / minutes,
                       gazeAwayShare: Double(gazeAwayFrames) / Double(max(gazeFrames, 1)),
                       eyeWideShare: Double(eyeWideFrames) / n,
                       micro: micro, macro: macro)
    }
}

/// Physiological/behavioural *activation* (stress/arousal) — not "nervous", which a camera
/// can't know. Each marker is compared with a typical resting range; together with the
/// camera pulse they form a rough activation picture.
struct Activation: Equatable {
    var score: Int                      // 0-100
    var notes: [String]

    static func from(_ s: ExpressionSession.Summary, restingBpm: Int?) -> Activation {
        var parts: [Double] = [], notes: [String] = []
        // typical resting blink rate ~15-20/min (Bentivoglio et al. 1997)
        let blink = min(max((s.blinksPerMinute - 18) / 20, 0), 1)
        parts.append(blink); if blink > 0.5 { notes.append("frequent blinking (\(Int(s.blinksPerMinute))/min)") }
        let shifts = min(max((s.gazeShiftsPerMinute - 40) / 80, 0), 1)
        parts.append(shifts); if shifts > 0.5 { notes.append("restless gaze (\(Int(s.gazeShiftsPerMinute)) shifts/min)") }
        let away = min(max((s.gazeAwayShare - 0.2) / 0.5, 0), 1)
        parts.append(away); if away > 0.5 { notes.append("often looking away (\(Int(s.gazeAwayShare * 100)) %)") }
        if let bpm = restingBpm {
            let hr = min(max((Double(bpm) - 80) / 30, 0), 1)
            parts.append(hr); if hr > 0.5 { notes.append("elevated pulse (\(bpm) BPM)") }
        }
        let score = Int((100 * parts.reduce(0, +) / Double(max(parts.count, 1))).rounded())
        return Activation(score: score, notes: notes)
    }
}

/// PHQ-9 (Kroenke, Spitzer & Williams 2001; public domain, Pfizer). Validated self-report screener.
enum PHQ9 {
    static let prompt = "Over the last 2 weeks, how often have you been bothered by any of the following problems?"
    static let items = [
        "Little interest or pleasure in doing things",
        "Feeling down, depressed, or hopeless",
        "Trouble falling or staying asleep, or sleeping too much",
        "Feeling tired or having little energy",
        "Poor appetite or overeating",
        "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
        "Trouble concentrating on things, such as reading the newspaper or watching television",
        "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
        "Thoughts that you would be better off dead or of hurting yourself in some way",
    ]
    static let options = ["Not at all", "Several days", "More than half the days", "Nearly every day"]

    static func score(_ answers: [Int]) -> Int { answers.reduce(0, +) }

    static func severity(_ score: Int) -> String {
        switch score {
        case ..<5: return "Minimal"
        case 5..<10: return "Mild"
        case 10..<15: return "Moderate"
        case 15..<20: return "Moderately severe"
        default: return "Severe"
        }
    }

    /// item 9 > 0 or a severe total: show crisis resources immediately
    static func needsUrgentSupport(_ answers: [Int]) -> Bool {
        (answers.count == 9 && answers[8] > 0) || score(answers) >= 20
    }
}
