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
            s.feedGaze(yaw: away ? 15 : 0.5 * sin(Double(i)), pitch: -6, t: t)   // phone below eye level
        }
        let sum = s.summary
        XCTAssertEqual(s.gazeShifts, 10)                     // 5 excursions x (out + back)
        XCTAssertEqual(sum.gazeAwayShare, 0.25, accuracy: 0.05)      // running median pitch -6 = "at the screen"
        let act = Activation.from(sum, restingBpm: 105)
        XCTAssertTrue(act.notes.contains { $0.contains("pulse") })
    }

    func testSadDoesNotTriggerSurprise() {
        let sad = ExpressionKind.values(["browInnerUp": 0.7, "mouthFrownLeft": 0.6, "mouthFrownRight": 0.6])
        XCTAssertGreaterThan(sad[.sad]!, 0.5)
        XCTAssertLessThan(sad[.surprise]!, 0.05)
    }

    func testFrownDoesNotAlsoCountAsDisgust() {
        // real data: a hard frown (mouthFrown 0.8) also raises noseSneer to ~0.3
        var s = ExpressionSession()
        for i in 0..<900 {
            let t = Double(i) / 60
            let frown = (600..<624).contains(i)                  // 400 ms
            s.feed(["mouthFrownLeft": frown ? 0.8 : 0.0, "mouthFrownRight": frown ? 0.8 : 0.0,
                    "browInnerUp": frown ? 0.22 : 0.07, "noseSneerLeft": frown ? 0.3 : 0.06,
                    "noseSneerRight": frown ? 0.3 : 0.06, "mouthUpperUpLeft": frown ? 0.08 : 0.01,
                    "mouthUpperUpRight": frown ? 0.08 : 0.01], t: t)
        }
        XCTAssertEqual(s.events.map(\.kind), [.sad])
    }

    func testWideEyesWithoutBrowsIsNotSurprise() {
        // real data: looking away gave eyeWide 0.3-0.4 with outer brows ~0
        let lookAway = ExpressionKind.values(["eyeWideLeft": 0.4, "eyeWideRight": 0.4])
        XCTAssertLessThan(lookAway[.surprise]!, 0.05)
        let raised = ExpressionKind.values(["browOuterUpLeft": 0.86, "browOuterUpRight": 0.86,
                                            "eyeWideLeft": 0.78, "eyeWideRight": 0.78, "browInnerUp": 0.5])
        XCTAssertGreaterThan(raised[.surprise]!, raised[.sad]!)
    }

    func testGazeCalibrationUndoesUnderestimation() {
        // ARKit reports only 40 % of the real eye rotation, plus a 3 deg offset
        var pairs: [(eye: Angles, camera: Angles)] = []
        for i in 0..<240 {
            let t = Double(i) / 30
            let cam = Angles(yaw: 20 * sin(t), pitch: 12 * cos(0.7 * t))    // head moving around
            pairs.append((Angles(yaw: 0.4 * cam.yaw + 3, pitch: 0.4 * cam.pitch - 2), cam))
        }
        let cal = GazeCalibration.fit(pairs)!
        XCTAssertEqual(cal.gainYaw, 2.5, accuracy: 0.05)
        XCTAssertEqual(cal.gainPitch, 2.5, accuracy: 0.05)
        XCTAssertLessThan(cal.residualDeg!, 0.5)
        let corrected = cal.apply(Angles(yaw: 0.4 * 15 + 3, pitch: 0.4 * -8 - 2))
        XCTAssertEqual(corrected.yaw, 15, accuracy: 0.3)
        XCTAssertEqual(corrected.pitch, -8, accuracy: 0.3)
    }

    func testAnglesRoundTrip() {
        let a = Angles(yaw: 23, pitch: -11)
        let b = GazeMath.angles(GazeMath.direction(a))
        XCTAssertEqual(b.yaw, a.yaw, accuracy: 0.01)
        XCTAssertEqual(b.pitch, a.pitch, accuracy: 0.01)
    }

    func testBreathingFromHeadMotion() {
        // 12 breaths/min: head moves ~2 mm towards the phone, plus slow leaning and sensor noise
        var r = 1
        func noise() -> Double { r = (r &* 1103515245 &+ 12345) & 0x7fffffff; return Double(r) / Double(0x7fffffff) - 0.5 }
        var s: [(t: Double, dist: Double, y: Double)] = []
        for i in 0..<(60 * 35) {
            let t = Double(i) / 60
            let breath = 0.001 * sin(2 * .pi * 0.2 * t)
            s.append((t, 0.30 + 0.0003 * t + breath + 0.0004 * noise(), 0.0004 * noise()))
        }
        let b = BreathingMath.estimate(s)
        XCTAssertNotNil(b)
        XCTAssertEqual(Double(b!.perMinute), 12, accuracy: 1)
        XCTAssertGreaterThan(b!.snr, 0)
    }

    func testARKitNamesAreNormalized() {
        XCTAssertEqual(ExpressionTracker.normalized("mouthSmile_L"), "mouthSmileLeft")
        XCTAssertEqual(ExpressionTracker.normalized("eyeBlink_R"), "eyeBlinkRight")
        XCTAssertEqual(ExpressionTracker.normalized("jawOpen"), "jawOpen")
    }

    func testPHQ9() {
        XCTAssertEqual(PHQ9.score([1, 1, 1, 1, 1, 0, 0, 0, 0]), 5)
        XCTAssertEqual(PHQ9.severity(5), "Mild")
        XCTAssertEqual(PHQ9.severity(22), "Severe")
        XCTAssertTrue(PHQ9.needsUrgentSupport([0, 0, 0, 0, 0, 0, 0, 0, 1]))
        XCTAssertFalse(PHQ9.needsUrgentSupport([2, 2, 2, 2, 2, 2, 2, 2, 0]))   // 16, item 9 = 0
    }
}
