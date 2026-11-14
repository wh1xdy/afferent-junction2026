import XCTest
import simd
@testable import FaceCore

/// Synthetic 60 Hz blendshape streams through the one entry point the camera session drives.
final class FaceAggregatorTests: XCTestCase {
    static let brows = ["browInnerUp", "browOuterUp_L", "browOuterUp_R"]
    static let smile = ["mouthSmile_L", "mouthSmile_R"]
    static let blink = ["eyeBlink_L", "eyeBlink_R"]

    /// 10 s at rest, a movement of `frames` frames starting at frame 600, then 4 s at rest.
    private func session(moving names: [String], by delta: Float, frames: Int,
                         eyeYaw: (Int) -> Double = { _ in 0 }) -> Rig {
        let rig = Rig()
        for i in 0..<(600 + frames + 240) {
            var b = rig.resting()
            if i >= 600 && i < 600 + frames { b = b.adding(delta, to: names) }
            rig.feed(b, eyeYaw: eyeYaw(i))
        }
        return rig
    }

    // MARK: brief facial movements

    func testBrowMovementOf200msIsOneEventInTheBrow() {
        let rig = session(moving: Self.brows, by: 0.6, frames: 12)
        XCTAssertEqual(rig.micros.count, 1)
        guard let m = rig.micros.first else { return }
        XCTAssertEqual(m.region, .brow)
        XCTAssertEqual(m.durationMs, 200, accuracy: 20)
        XCTAssertEqual(m.tMs, Rig.ms(frame: 600), accuracy: 1)
        XCTAssertGreaterThan(m.peak, 0.3)
        XCTAssertLessThanOrEqual(m.peak, 1)
    }

    func testBrowMovementOf2sIsNoEvent() {
        XCTAssertTrue(session(moving: Self.brows, by: 0.6, frames: 120).micros.isEmpty)
    }

    func testBrowMovementWhileLookingAwayIsNoEvent() {
        // the eyes turn 35 degrees off the screen from just before the movement to just after it
        let rig = session(moving: Self.brows, by: 0.6, frames: 12) { (590..<630).contains($0) ? 35 : 0 }
        XCTAssertTrue(rig.micros.isEmpty)
        let lookingAway = rig.faces.filter { ($0.gazeAway ?? 0) > 0 }
        XCTAssertEqual(lookingAway.count, 2)                          // frames 590..<630 touch two seconds
        XCTAssertEqual(lookingAway.reduce(0) { $0 + ($1.gazeAway ?? 0) }, 40.0 / 60, accuracy: 0.02)
    }

    func testLookingAwayJustBeforeTheMovementAlsoGivesNoEvent() {
        // the reference drops what begins within 0.3 s of a far gaze: the tracker has not settled
        let rig = session(moving: Self.brows, by: 0.6, frames: 12) { (585..<595).contains($0) ? 35 : 0 }
        XCTAssertTrue(rig.micros.isEmpty)
        let later = session(moving: Self.brows, by: 0.6, frames: 12) { (540..<560).contains($0) ? 35 : 0 }
        XCTAssertEqual(later.micros.count, 1)
    }

    func testSmallMovementAndJitterGiveNoEvent() {
        XCTAssertTrue(session(moving: Self.brows, by: 0.05, frames: 12).micros.isEmpty)
        XCTAssertTrue(session(moving: [], by: 0, frames: 0).micros.isEmpty)
    }

    func testOneFrameSpikeIsNoEvent() {
        XCTAssertTrue(session(moving: Self.brows, by: 0.6, frames: 2).micros.isEmpty)   // 33 ms < 40 ms
    }

    func testOneFacialActionIsOneEvent() {
        // measured on a real face (reference): pulling the lip corners down hard (0.8) also lifts
        // the inner brow, the nose wrinkle (0.3) and the upper lip. One action, one event, at the mouth.
        let rig = Rig()
        for i in 0..<1140 {
            let on = (600..<624).contains(i)                       // 400 ms
            var b = rig.resting(jitter: 0.002)
            b = b.setting(on ? 0.8 : 0.0, for: ["mouthFrown_L", "mouthFrown_R"])
            b = b.setting(on ? 0.22 : 0.07, for: ["browInnerUp"])
            b = b.setting(on ? 0.3 : 0.06, for: ["noseSneer_L", "noseSneer_R"])
            b = b.setting(on ? 0.08 : 0.01, for: ["mouthUpperUp_L", "mouthUpperUp_R"])
            rig.feed(b)
        }
        XCTAssertEqual(rig.micros.map(\.region), [.mouth])
        XCTAssertEqual(rig.micros.first?.durationMs ?? 0, 400, accuracy: 20)
    }

    func testRegionFollowsTheBlendshapesThatMoved() {
        func region(_ names: [String], _ delta: Float) -> [FaceRegion] {
            session(moving: names, by: delta, frames: 12).micros.map(\.region)
        }
        XCTAssertEqual(region(["browDown_L", "browDown_R"], 0.6), [.brow])
        XCTAssertEqual(region(["noseSneer_L", "noseSneer_R"], 0.5), [.nose])
        XCTAssertEqual(region(["mouthSmile_L", "mouthSmile_R"], 0.5), [.mouth])
        XCTAssertEqual(region(["mouthSmile_L"], 0.4), [.mouth])                    // one lip corner only
        XCTAssertEqual(region(["mouthPress_L", "mouthPress_R"], 0.6), [.mouth])
        XCTAssertEqual(region(["cheekSquint_L", "cheekSquint_R"], 0.7), [.cheek])
        // outer brows a little, eyes wide a lot / jaw dropped a lot: the larger movement names the place
        let eyes = session(moving: ["eyeWide_L", "eyeWide_R"], by: 0.5, frames: 12)
        XCTAssertTrue(eyes.micros.isEmpty)                                         // wide eyes alone: looking around
        let rigEye = Rig(), rigJaw = Rig()
        for i in 0..<900 {
            let on = (600..<612).contains(i)
            let outer = rigEye.resting().adding(on ? 0.25 : 0, to: ["browOuterUp_L", "browOuterUp_R"])
            rigEye.feed(outer.adding(on ? 0.7 : 0, to: ["eyeWide_L", "eyeWide_R"]))
            let outer2 = rigJaw.resting().adding(on ? 0.25 : 0, to: ["browOuterUp_L", "browOuterUp_R"])
            rigJaw.feed(outer2.adding(on ? 0.7 : 0, to: ["jawOpen"]))
        }
        XCTAssertEqual(rigEye.micros.map(\.region), [.eye])
        XCTAssertEqual(rigJaw.micros.map(\.region), [.jaw])
    }

    func testAMovementAcrossATrackingGapIsNoEvent() {
        let rig = Rig()
        for i in 0..<900 {
            if (606..<660).contains(i) { rig.feedNoFace(); continue }             // lost in the middle of it
            rig.feed(i >= 600 && i < 606 ? rig.resting().adding(0.6, to: Self.brows) : rig.resting())
        }
        XCTAssertTrue(rig.micros.isEmpty)
    }

    // MARK: smile

    func testSlightSmileCounts() {
        // measured on a real face: a slight smile is only +0.05 to 0.09 over the person's baseline
        let rig = Rig()
        for i in 0..<(60 * 16) {
            let smiling = (60 * 12..<60 * 15).contains(i)
            rig.feed(rig.resting().adding(smiling ? 0.07 : 0, to: Self.smile))
        }
        XCTAssertEqual(rig.faces.count, 15)
        for (second, f) in rig.faces.enumerated() {
            guard let smile = f.smile else { XCTFail("no smile value in second \(second)"); continue }
            if (12..<15).contains(second) {
                XCTAssertEqual(smile, 0.07, accuracy: 0.01)
                XCTAssertGreaterThan(smile, FaceTuning.smileThreshold)
            } else if second >= 10 {
                XCTAssertLessThan(smile, 0.01)                       // against the person's own median
            } else {
                XCTAssertEqual(smile, 0.03, accuracy: 0.01)          // first 10 s: the reference's fixed 0.02
                XCTAssertLessThan(smile, FaceTuning.smileThreshold)
            }
        }
        XCTAssertEqual(rig.aggregator.smileBaseline, 0.05, accuracy: 0.005)
    }

    func testSlightSmileOf300msIsOneEventAtTheMouth() {
        let rig = session(moving: Self.smile, by: 0.07, frames: 18)
        XCTAssertEqual(rig.micros.map(\.region), [.mouth])
        XCTAssertEqual(rig.micros.first?.durationMs ?? 0, 300, accuracy: 20)
    }

    // MARK: blinks

    func testBlinksAreCountedInTheSecondTheyComplete() {
        let rig = Rig()
        for i in 0..<(60 * 11) {
            let closed = i % 180 >= 30 && i % 180 < 36 && i < 600         // 100 ms, every 3 s: 4 blinks
            rig.feed(closed ? rig.resting().setting(0.9, for: Self.blink) : rig.resting())
        }
        XCTAssertEqual(rig.faces.map(\.blinks), [1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
    }

    func testRestingEyelidsAndHalfClosedEyesAreNoBlinks() {
        let rig = Rig()
        for i in 0..<300 {
            rig.feed(rig.resting().setting(i % 60 < 10 ? 0.55 : 0.3, for: Self.blink))   // never above 0.6
        }
        XCTAssertEqual(rig.faces.reduce(0) { $0 + $1.blinks }, 0)
    }

    // MARK: gaze

    func testGazeAwayIsMeasuredFromWhereThePersonMostlyLooks() {
        // the phone is held below eye level: the eyes rest 12 degrees down, that is "at the screen"
        let rig = Rig()
        for i in 0..<(60 * 6) {
            let away = (60 * 4..<60 * 4 + 30).contains(i)                  // half of the fifth second
            rig.feed(rig.resting(), eyeYaw: away ? 30 : 0, eyePitch: -12)
        }
        XCTAssertEqual(rig.faces.map { $0.gazeAway ?? -1 }, [0, 0, 0, 0, 0.5])
    }

    func testGazeCorrectionIsApplied() {
        // ARKit reports 40 % of the real eye rotation: 12 degrees on its scale are 30 real ones
        let fitted = FaceGazeCalibration(gainYaw: 2.5, offsetYaw: 0, gainPitch: 2.5, offsetPitch: 0)
        let corrected = Rig(calibration: fitted), raw = Rig()
        for i in 0..<300 {
            let yaw = (180..<240).contains(i) ? 12.0 : 0
            corrected.feed(corrected.resting(), eyeYaw: yaw)
            raw.feed(raw.resting(), eyeYaw: yaw)
        }
        XCTAssertEqual(corrected.faces.map { $0.gazeAway ?? -1 }, [0, 0, 0, 1])
        XCTAssertEqual(raw.faces.map { $0.gazeAway ?? -1 }, [0, 0, 0, 0])
    }

    // MARK: movement, distance

    func testMovementIsAbsoluteChangePerSecond() {
        // a face that does not move at all: 0. One of the 52 coefficients travelling 0.26 per
        // second: 0.26 / 52 = 0.005 (the first second of it reads lower: the 0.1 s means lag)
        let rig = Rig()
        var b = rig.resting(jitter: 0)
        for i in 0..<(60 * 5) {
            if i >= 120 && i < 240 { b["jawOpen"] = Float(0.05 + 0.26 * Double(i - 120) / 60) }
            rig.feed(b)
        }
        XCTAssertEqual(rig.faces.count, 4)
        XCTAssertEqual(rig.faces[0].movement ?? -1, 0, accuracy: 1e-6)
        XCTAssertEqual(rig.faces[1].movement ?? -1, 0, accuracy: 1e-6)
        XCTAssertEqual(rig.faces[2].movement ?? -1, 0.0045, accuracy: 0.0005)
        XCTAssertEqual(rig.faces[3].movement ?? -1, 0.005, accuracy: 0.0002)
    }

    func testAnExpressiveFaceMovesMoreThanAStillOne() {
        let still = Rig(), lively = Rig()
        for i in 0..<300 {
            still.feed(still.resting())
            let swing = Float(0.3 + 0.3 * sin(2 * Double.pi * Double(i) / 60))
            lively.feed(lively.resting().adding(swing, to: Self.smile + Self.brows + ["jawOpen", "cheekSquint_L", "cheekSquint_R"]))
        }
        let a = still.faces.compactMap(\.movement), b = lively.faces.compactMap(\.movement)
        XCTAssertEqual(a.count, 4)
        XCTAssertEqual(b.count, 4)
        XCTAssertGreaterThan(b.min() ?? 0, 5 * (a.max() ?? 1))
    }

    func testDistanceInCentimetres() {
        let rig = Rig()
        for i in 0..<180 { rig.feed(rig.resting(), distance: i < 60 ? 0.30 : 0.42) }
        XCTAssertEqual(rig.faces.map { $0.distanceCm ?? -1 }, [30, 42])
    }

    // MARK: nothing measured is null, not 0

    func testUntrackedSecondsCarryNullNeverZero() throws {
        let rig = Rig()
        for i in 0..<(60 * 5) {
            switch i {
            case ..<60: rig.feed(rig.resting())
            case ..<180: rig.feedNoFace()                                   // no face anchor at all
            default: rig.feed(rig.resting(), tracked: false)                // an anchor ARKit lost track of
            }
        }
        XCTAssertEqual(rig.faces.map(\.tracked), [true, false, false, false])
        for f in rig.faces.dropFirst() {
            XCTAssertNil(f.smile)
            XCTAssertNil(f.movement)
            XCTAssertNil(f.gazeAway)
            XCTAssertNil(f.distanceCm)
            XCTAssertNil(f.breathingPerMin)
            XCTAssertNil(f.breathingSnr)
            XCTAssertEqual(f.blinks, 0)
            let d = f.dictionary
            for key in ["smile", "movement", "gaze_away", "distance_cm", "breathing_per_min", "breathing_snr"] {
                XCTAssertTrue(d[key] is NSNull, "\(key) must be null")
            }
            let json = String(data: try JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]), encoding: .utf8) ?? ""
            XCTAssertTrue(json.contains("\"smile\":null"), json)
            XCTAssertTrue(json.contains("\"tracked\":false"), json)
        }
    }

    func testASecondTrackedForLessThanHalfIsNotTracked() {
        let rig = Rig()
        for i in 0..<180 {
            if i < 60 + 20 { rig.feed(rig.resting()) } else { rig.feedNoFace() }       // 0.33 s of the second
        }
        XCTAssertEqual(rig.faces.map(\.tracked), [true, false])
        XCTAssertNil(rig.faces[1].smile)
    }

    // MARK: the contract, field for field

    func testFacePayloadMatchesTheContract() throws {
        let rig = Rig()
        for _ in 0..<(60 * 3 + 1) { rig.feed(rig.resting()) }
        XCTAssertEqual(rig.faces.count, 3)                                   // once per second
        XCTAssertEqual(rig.faces.map(\.tMs), [1, 2, 3].map { (Rig.epoch + $0) * 1000 })
        let d = rig.faces[0].dictionary
        XCTAssertEqual(Set(d.keys), ["t_ms", "tracked", "smile", "movement", "blinks", "gaze_away",
                                     "distance_cm", "breathing_per_min", "breathing_snr"])
        XCTAssertEqual(d["tracked"] as? Bool, true)
        XCTAssertEqual(d["blinks"] as? Int, 0)
        XCTAssertNotNil(d["smile"] as? Double)
        XCTAssertNotNil(d["movement"] as? Double)
        XCTAssertEqual(d["gaze_away"] as? Double, 0)
        XCTAssertEqual(d["distance_cm"] as? Double, 30)
        XCTAssertTrue(d["breathing_per_min"] is NSNull)                      // not clear after 3 s
        XCTAssertTrue(d["breathing_snr"] is NSNull)
        XCTAssertTrue(JSONSerialization.isValidJSONObject(d))
    }

    func testMicroPayloadMatchesTheContract() {
        let rig = session(moving: Self.brows, by: 0.6, frames: 12)
        guard let d = rig.micros.first?.dictionary else { return XCTFail("no event") }
        XCTAssertEqual(Set(d.keys), ["t_ms", "duration_ms", "region", "peak"])
        XCTAssertEqual(d["region"] as? String, "brow")
        XCTAssertEqual(Set(FaceRegion.allCases.map(\.rawValue)), ["brow", "eye", "cheek", "nose", "mouth", "jaw"])
        XCTAssertTrue(JSONSerialization.isValidJSONObject(d))
    }

    func testResetStartsANewSession() {
        let rig = Rig()
        for _ in 0..<700 { rig.feed(rig.resting().adding(0.2, to: Self.smile)) }
        XCTAssertEqual(rig.aggregator.smileBaseline, 0.25, accuracy: 0.01)
        rig.aggregator.reset()
        XCTAssertEqual(rig.aggregator.smileBaseline, FaceTuning.smileFallbackBaseline)
    }

    // MARK: names

    func testARKitNamesAndTheReferenceSpellingAreBothRead() {
        XCTAssertEqual(FaceBlendShapes.names.count, 52)
        XCTAssertEqual(Set(FaceBlendShapes.names).count, 52)
        XCTAssertEqual(FaceBlendShapes.index(of: "mouthSmile_L"), FaceBlendShapes.index(of: "mouthSmileLeft"))
        XCTAssertEqual(FaceBlendShapes.index(of: "eyeBlink_R"), FaceBlendShapes.index(of: "eyeBlinkRight"))
        XCTAssertNotNil(FaceBlendShapes.index(of: "jawOpen"))
        XCTAssertNil(FaceBlendShapes.index(of: "notAShape"))
        let v = FaceBlendShapes.vector(from: ["mouthSmile_L": 0.4, "jawOpen": .nan, "notAShape": 1])
        XCTAssertEqual(v[FaceBlendShapes.mouthSmileL], 0.4)
        XCTAssertEqual(v.sum(), 0.4)
    }
}
