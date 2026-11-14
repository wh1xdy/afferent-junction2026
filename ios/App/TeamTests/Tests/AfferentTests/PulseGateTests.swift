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
}
