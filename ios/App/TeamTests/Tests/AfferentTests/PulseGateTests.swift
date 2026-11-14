import XCTest
@testable import Afferent

final class PulseGateTests: XCTestCase {
    func frozen() -> [PulseSample] {
        let base = SIMD3<Double>(150, 110, 90), dir = SIMD3<Double>(0.33, 0.77, 0.53)
        return (0..<200).map { i in
            let t = 1000 + Double(i) / 20
            func region(_ phase: Double) -> SIMD3<Double> { base + dir * 0.6 * sin(2 * .pi * 72 / 60 * t + phase) }
            return PulseSample(t: t, rgb: region(0), cx: 200, cy: 200, d: 100,
                               regions: [region(0.2), region(0.4), region(0.6)])
        }
    }

    func testTheEstimatorAloneKeepsTrustingAFrozenBuffer() {
        let samples = frozen()
        var history: [Int] = []
        var scores: [Int] = []
        for _ in 0..<8 {
            let r = PulseMath.estimate(samples: samples, history: history, luma: 120, clipped: 0)
            XCTAssertEqual(r?.bpm, 72)
            if let r { history.append(r.bpm); scores.append(r.trust.score) }
        }
        XCTAssertEqual(scores.count, 8)
        XCTAssertGreaterThanOrEqual(scores.last ?? 0, scores.first ?? 100)
        XCTAssertGreaterThanOrEqual(scores.last ?? 0, 70)
    }

    func testAStalledBufferIsNotEstimated() {
        let last = frozen().last!.t
        XCTAssertEqual(PulseGate.step(now: last, lastAppended: last), .estimate)
        XCTAssertEqual(PulseGate.step(now: last + 0.05, lastAppended: last), .estimate)
        XCTAssertEqual(PulseGate.step(now: last + 1.0, lastAppended: last), .estimate)
        XCTAssertEqual(PulseGate.step(now: last + 1.05, lastAppended: last), .hold)
        XCTAssertEqual(PulseGate.step(now: last + 2.0, lastAppended: last), .hold)
        XCTAssertEqual(PulseGate.step(now: last + 2.05, lastAppended: last), .reset)
        XCTAssertEqual(PulseGate.step(now: last + 60, lastAppended: last), .reset)
        XCTAssertEqual(PulseGate.step(now: last, lastAppended: 0), .reset)
    }

    func testEverySecondOfAStallGivesNoReading() {
        let samples = frozen(), last = samples.last!.t
        var history: [Int] = []
        var readings = 0
        for s in 0..<8 {
            guard PulseGate.step(now: last + Double(s), lastAppended: last) == .estimate else { continue }
            if let r = PulseMath.estimate(samples: samples, history: history, luma: 120, clipped: 0) {
                history.append(r.bpm)
                readings += 1
            }
        }
        XCTAssertEqual(readings, 2)
    }

    func testMeasuringNeedsTheExposureLocked() {
        XCTAssertTrue(PulseGate.held(exposureLocked: true, whiteBalanceLocked: true, whiteBalanceLockable: true))
        XCTAssertTrue(PulseGate.held(exposureLocked: true, whiteBalanceLocked: false, whiteBalanceLockable: false))
        XCTAssertFalse(PulseGate.held(exposureLocked: true, whiteBalanceLocked: false, whiteBalanceLockable: true))
        XCTAssertFalse(PulseGate.held(exposureLocked: false, whiteBalanceLocked: true, whiteBalanceLockable: true))
        XCTAssertFalse(PulseGate.held(exposureLocked: false, whiteBalanceLocked: false, whiteBalanceLockable: false))
    }

    func testWhyThereIsNoCameraPulse() {
        typealias Why = PulseGate.Why
        let ok = (luma: 120.0, clipped: 0.0)
        func why(tracked: Bool = true, locked: Bool = true, settle: Double = 0, light: (luma: Double, clipped: Double)? = ok,
                 fresh: Bool = true, buffered: Double = 10, reading: (trust: Int, motion: Double)? = nil) -> Why {
            PulseGate.why(tracked: tracked, locked: locked, settleLeftS: settle, light: light, fresh: fresh, bufferedS: buffered, reading: reading)
        }
        XCTAssertEqual(why(reading: (72, 0.01)), Why())
        XCTAssertEqual(why(reading: (40, 0.2)), Why())
        XCTAssertEqual(why(tracked: false, reading: (90, 0)), Why(reason: .noFace))
        XCTAssertEqual(why(locked: false, settle: 2.8, light: nil, buffered: 0), Why(reason: .exposureNotLocked, warmupLeftS: 8.8))
        XCTAssertEqual(why(locked: false, settle: -3, light: nil, buffered: 0), Why(reason: .exposureNotLocked, warmupLeftS: 6))
        XCTAssertEqual(why(buffered: 0), Why(reason: .warmingUp, warmupLeftS: 6))
        XCTAssertEqual(why(buffered: 2.54), Why(reason: .warmingUp, warmupLeftS: 3.5))
        XCTAssertEqual(why(buffered: 6), Why(reason: .weakSignal))
        XCTAssertEqual(why(light: (30, 0), buffered: 2), Why(reason: .tooDark))
        XCTAssertEqual(why(light: (230, 0), buffered: 2), Why(reason: .tooBright))
        XCTAssertEqual(why(light: (180, 0.2), reading: (25, 0.01)), Why(reason: .tooBright))
        XCTAssertEqual(why(light: (255, 1), fresh: false), Why(reason: .tooBright))
        XCTAssertEqual(why(fresh: false, buffered: 0), Why(reason: .noFace))
        XCTAssertEqual(why(reading: (39, 0.2)), Why(reason: .moving))
        XCTAssertEqual(why(reading: (39, 0.01)), Why(reason: .weakSignal))
        XCTAssertEqual(why(light: (30, 0), reading: (55, 0.01)), Why())
    }

    // Under auto exposure (the face camera has no lock) the window starts over when ARKit moves the exposure.
    // The limits are those of camera-pulse 02cfb46, the version seen measuring on an iPhone 14 Pro.
    func testAutoExposureStepsThatRestartTheWindow() {
        let base = (duration: 1.0 / 60, offset: 0.0)
        XCTAssertFalse(PulseGate.exposureMoved(from: nil, to: base), "the first frame only sets the baseline")
        XCTAssertFalse(PulseGate.exposureMoved(from: base, to: base))
        XCTAssertFalse(PulseGate.exposureMoved(from: base, to: (base.duration * 1.039, 0.0)))
        XCTAssertTrue(PulseGate.exposureMoved(from: base, to: (base.duration * 1.041, 0.0)))
        XCTAssertTrue(PulseGate.exposureMoved(from: base, to: (base.duration * 0.95, 0.0)))
        XCTAssertFalse(PulseGate.exposureMoved(from: base, to: (base.duration, 0.149)))
        XCTAssertTrue(PulseGate.exposureMoved(from: base, to: (base.duration, -0.151)))
        XCTAssertFalse(PulseGate.exposureMoved(from: (0, 0), to: (1.0 / 30, 0)), "no duration yet: only the offset counts")
    }

    func testTheLightWordUsesTheReasonLimits() {
        XCTAssertEqual(PulseGate.level(luma: 120, clipped: 0), "ok")
        XCTAssertEqual(PulseGate.level(luma: 50, clipped: 0), "ok")
        XCTAssertEqual(PulseGate.level(luma: 49.9, clipped: 0), "dark")
        XCTAssertEqual(PulseGate.level(luma: 215, clipped: 0), "ok")
        XCTAssertEqual(PulseGate.level(luma: 215.1, clipped: 0), "bright")
        XCTAssertEqual(PulseGate.level(luma: 120, clipped: 0.06), "bright", "clipped skin is too bright even when the mean is not")
        XCTAssertEqual(PulseGate.level(luma: 30, clipped: 0.06), "bright")
    }

    func testTheReasonsReadAsPlainWords() {
        let all: [PulseGate.Reason] = [.off, .unsupported, .unauthorized, .noFace, .exposureNotLocked, .tooDark, .tooBright, .moving, .warmingUp, .weakSignal]
        XCTAssertEqual(all.map(\.rawValue), ["off", "unsupported", "unauthorized", "no_face", "exposure_not_locked", "too_dark", "too_bright",
                                             "moving", "warming_up", "weak_signal"])
    }
}
