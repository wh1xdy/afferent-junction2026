import XCTest
@testable import Afferent

final class ExpressionTests: XCTestCase {
    /// 60 Hz series: neutral face with small jitter, plus one burst of `burstFrames`
    func run(_ kind: ExpressionKind, burstFrames: Int, amplitude: Double = 0.6) -> [ExpressionEvent] {
        var d = BurstDetector(kind: kind)
        var events: [ExpressionEvent] = []
        for i in 0..<600 {
            let t = Double(i) / 60
            var x = 0.05 + 0.01 * sin(Double(i) * 0.7)
            if i >= 300 && i < 300 + burstFrames { x += amplitude }
            if let e = d.feed(x, t: t) { events.append(e) }
        }
        return events
    }

    func testShortBurstIsMicroExpression() {
        let e = run(.sad, burstFrames: 12)                 // 200 ms
        XCTAssertEqual(e.count, 1)
        XCTAssertTrue(e[0].isMicro)
        XCTAssertEqual(e[0].duration, 0.2, accuracy: 0.04)
    }

    func testLongBurstIsMacroExpression() {
        let e = run(.happy, burstFrames: 90)               // 1.5 s
        XCTAssertEqual(e.count, 1)
        XCTAssertFalse(e[0].isMicro)
    }

    func testJitterIsNotAnExpression() {
        XCTAssertTrue(run(.anger, burstFrames: 0).isEmpty)
        XCTAssertTrue(run(.anger, burstFrames: 12, amplitude: 0.05).isEmpty)  // too small
    }

    func testSessionCountsSmileAndBlinks() {
        var s = ExpressionSession()
        for i in 0..<600 {
            let t = Double(i) / 60
            let smiling = i >= 120 && i < 240                  // 2 s of 10 s
            let blink = i % 180 < 6 ? 0.9 : 0.05               // ~every 3 s
            s.feed(["mouthSmileLeft": smiling ? 0.7 : 0.05, "mouthSmileRight": smiling ? 0.7 : 0.05,
                    "eyeBlinkLeft": blink, "eyeBlinkRight": blink], t: t)
        }
        let sum = s.summary
        XCTAssertEqual(sum.smileShare, 0.2, accuracy: 0.02)
        XCTAssertEqual(s.blinks, 4)
        XCTAssertEqual(sum.macro[.happy], 1)
    }

    func testGazeShiftsAndAversion() {
        var s = ExpressionSession()
        for i in 0..<600 {                                  // 10 s at 60 Hz
            let t = Double(i) / 60
            s.feed([:], t: t)
            // fixate the camera, with a 15 deg saccade away and back every 2 s
            let away = (i / 60) % 2 == 1 && i % 60 < 30      // 0.5 s away in every other second
            s.feedGaze(yaw: away ? 15 : 0.5 * sin(Double(i)), pitch: 0, t: t)
        }
        let sum = s.summary
        XCTAssertEqual(s.gazeShifts, 10)                     // 5 excursions x (out + back)
        XCTAssertEqual(sum.gazeAwayShare, 0.25, accuracy: 0.02)
        let act = Activation.from(sum, restingBpm: 105)
        XCTAssertTrue(act.notes.contains { $0.contains("pulse") })
    }

    func testPHQ9() {
        XCTAssertEqual(PHQ9.score([1, 1, 1, 1, 1, 0, 0, 0, 0]), 5)
        XCTAssertEqual(PHQ9.severity(5), "Mild")
        XCTAssertEqual(PHQ9.severity(22), "Severe")
        XCTAssertTrue(PHQ9.needsUrgentSupport([0, 0, 0, 0, 0, 0, 0, 0, 1]))
        XCTAssertFalse(PHQ9.needsUrgentSupport([2, 2, 2, 2, 2, 2, 2, 2, 0]))   // 16, item 9 = 0
    }
}
