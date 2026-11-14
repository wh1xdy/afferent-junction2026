import Foundation

enum PulseGate {
    static let freshS = 1.0
    static let lostS = 2.0

    // the limits PulseMath.trust uses for its own reasons
    static let darkLuma = 50.0
    static let brightLuma = 215.0
    static let clippedShare = 0.05
    static let movingMotion = 0.075
    static let minTrust = 40

    enum Step: Equatable { case estimate, hold, reset }

    static func step(now: Double, lastAppended: Double) -> Step {
        let gap = now - lastAppended
        if gap <= freshS { return .estimate }
        return gap > lostS ? .reset : .hold
    }

    static func held(exposureLocked: Bool, whiteBalanceLocked: Bool, whiteBalanceLockable: Bool) -> Bool {
        exposureLocked && (whiteBalanceLocked || !whiteBalanceLockable)
    }

    /// Why there is no camera pulse right now. nil = one is being measured.
    enum Reason: String {
        case off, unsupported, unauthorized
        case noFace = "no_face"
        case exposureNotLocked = "exposure_not_locked"
        case tooDark = "too_dark"
        case tooBright = "too_bright"
        case moving
        case warmingUp = "warming_up"
        case weakSignal = "weak_signal"
    }

    struct Why: Equatable {
        var reason: Reason?
        var warmupLeftS: Double?
    }

    /// One second of the plugin, in the order a person can do something about it.
    /// - settleLeftS: seconds until the exposure lock is tried (only read while not locked)
    /// - light: mean skin luma 0...255 and the share of clipped pixels, nil before the first sample
    /// - fresh: a sample reached the buffer within `freshS`
    /// - bufferedS: seconds of samples in the buffer
    /// - reading: this second's estimate, its trust score 0...100 and head motion
    static func why(tracked: Bool, locked: Bool, settleLeftS: Double = 0, light: (luma: Double, clipped: Double)?,
                    fresh: Bool, bufferedS: Double, reading: (trust: Int, motion: Double)?) -> Why {
        func left(_ s: Double) -> Double { (max(0, s) * 10).rounded() / 10 }
        guard tracked else { return Why(reason: .noFace) }
        guard locked else { return Why(reason: .exposureNotLocked, warmupLeftS: left(max(0, settleLeftS) + PulseMath.minWindowS)) }
        if let r = reading, r.trust >= minTrust { return Why() }
        if let l = light {
            if l.clipped > clippedShare || l.luma > brightLuma { return Why(reason: .tooBright) }
            if l.luma < darkLuma { return Why(reason: .tooDark) }
        }
        if let r = reading { return Why(reason: r.motion > movingMotion ? .moving : .weakSignal) }
        guard fresh else { return Why(reason: .noFace) }
        if bufferedS < PulseMath.minWindowS { return Why(reason: .warmingUp, warmupLeftS: left(PulseMath.minWindowS - bufferedS)) }
        return Why(reason: .weakSignal)
    }
}
