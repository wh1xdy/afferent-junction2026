import XCTest
@testable import Afferent

/// Same synthetic checks as on the Jetson: a clean pulse must be found and trusted,
/// noise must be flagged unreliable.
final class PulseEstimatorTests: XCTestCase {
    struct LCG { var s: UInt64; mutating func next() -> Double {
        s = s &* 6364136223846793005 &+ 1442695040888963407
        return Double(s >> 11) / Double(1 << 53) } }

    func gaussian(_ r: inout LCG) -> Double {
        sqrt(-2 * log(max(r.next(), 1e-12))) * cos(2 * Double.pi * r.next())
    }

    func samples(bpm: Double, amp: Double, noise: Double, seed: UInt64) -> [PulseSample] {
        var r = LCG(s: seed)
        let base = SIMD3<Double>(150, 110, 90)
        let pulseDir = SIMD3<Double>(0.33, 0.77, 0.53)
        return (0..<200).map { i in
            let t = 1000 + Double(i) / 20 + 0.004 * gaussian(&r)
            func region(_ phase: Double) -> SIMD3<Double> {
                base + pulseDir * amp * sin(2 * .pi * bpm / 60 * t + phase)
                    + SIMD3(noise * gaussian(&r), noise * gaussian(&r), noise * gaussian(&r))
            }
            return PulseSample(t: t, rgb: region(0), cx: 200, cy: 200, d: 100,
                               regions: [region(0.2), region(0.4), region(0.6)])
        }
    }

    func run(_ bpm: Double, amp: Double, noise: Double) -> PulseReading? {
        var history: [Int] = []
        var last: PulseReading?
        for seed in 1...4 {
            last = PulseMath.estimate(samples: samples(bpm: bpm, amp: amp, noise: noise, seed: UInt64(seed)),
                                      history: history, luma: 120, clipped: 0)
            if let b = last?.bpm { history.append(b) }
        }
        return last
    }

    func testFindsCleanPulse() {
        for bpm in [58.0, 72, 95, 130] {
            let r = run(bpm, amp: 0.6, noise: 0.15)
            XCTAssertNotNil(r)
            XCTAssertEqual(Double(r!.bpm), bpm, accuracy: 2, "bpm \(bpm)")
            XCTAssertEqual(r!.trust.label, .reliable, "bpm \(bpm): \(r!.trust)")
        }
    }

    func testNoiseIsUnreliable() {
        let r = run(72, amp: 0.05, noise: 0.6)
        XCTAssertNotNil(r)
        XCTAssertNotEqual(r!.trust.label, .reliable, "\(r!.trust)")
        XCTAssertLessThan(r!.trust.score, 50)
    }

    func testNeedsSixSeconds() {
        let short = Array(samples(bpm: 72, amp: 0.6, noise: 0.1, seed: 9).prefix(80))  // 4 s
        XCTAssertNil(PulseMath.estimate(samples: short, history: [], luma: 120, clipped: 0))
    }
}
