import Foundation

enum PulseGate {
    static let freshS = 1.0
    static let lostS = 2.0

    enum Step: Equatable { case estimate, hold, reset }

    static func step(now: Double, lastAppended: Double) -> Step {
        let gap = now - lastAppended
        if gap <= freshS { return .estimate }
        return gap > lostS ? .reset : .hold
    }

    static func held(exposureLocked: Bool, whiteBalanceLocked: Bool, whiteBalanceLockable: Bool) -> Bool {
        exposureLocked && (whiteBalanceLocked || !whiteBalanceLockable)
    }
}
