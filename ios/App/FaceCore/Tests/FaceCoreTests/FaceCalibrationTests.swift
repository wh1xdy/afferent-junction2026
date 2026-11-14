import XCTest
import simd
@testable import FaceCore

/// A person in front of a phone held upright, looking at dots on its screen. ARKit's camera
/// space: +x down the screen, +y to the person's left, the person at -z. ARKit reports 40 % of
/// the real eye rotation plus an offset, as the reference's own test assumes.
final class FaceCalibrationTests: XCTestCase {
    /// iPhone 14 Pro: 1179 x 2556 px at 460 px per inch, lens in the island
    static let screen = FaceScreenGeometry(widthM: 0.0651, heightM: 0.1411, lensXM: 0.03255, lensYM: 0.005)
    static let grid: [(Double, Double)] = [(0.5, 0.5), (0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9), (0.5, 0.1), (0.5, 0.9), (0.1, 0.5), (0.9, 0.5)]

    /// The face 4 cm below the lens, `distance` away, upright, turned by yaw and pitch (degrees, in its own frame).
    static func face(distance: Double = 0.30, yaw: Double = 0, pitch: Double = 0) -> simd_float4x4 {
        var m = matrix_identity_float4x4
        m.columns.0 = SIMD4<Float>(0, 1, 0, 0)          // the face's left is the screen's left edge
        m.columns.1 = SIMD4<Float>(-1, 0, 0, 0)         // the face's up is up the screen
        m.columns.2 = SIMD4<Float>(0, 0, 1, 0)          // out of the face, towards the phone
        m.columns.3 = SIMD4<Float>(0.04, 0, Float(-distance), 1)
        let ry = simd_float4x4(simd_quatf(angle: Float(yaw * .pi / 180), axis: SIMD3<Float>(0, 1, 0)))
        let rx = simd_float4x4(simd_quatf(angle: Float(pitch * .pi / 180), axis: SIMD3<Float>(1, 0, 0)))
        return m * ry * rx
    }

    /// Where the eyes really point, in the face frame, when the person looks at the dot.
    static func truth(x: Double, y: Double, face: simd_float4x4, screen: FaceScreenGeometry = FaceCalibrationTests.screen) -> FaceAngles {
        let right = Float(x * screen.widthM - screen.lensXM), down = Float(y * screen.heightM - screen.lensYM)
        let v = simd_inverse(face) * SIMD4<Float>(down, -right, 0, 1)
        return FaceGazeMath.angles(SIMD3<Float>(v.x, v.y, v.z))
    }

    struct Person {
        var gain = 0.4, offsetYaw = 3.0, offsetPitch = -2.0
        /// tracker jitter per frame, degrees peak to peak
        var jitter = 0.3
        /// how far beside the dot the person looks, per dot, degrees peak to peak
        var miss = 0.0
        /// 1 = the eyes go to the dot, 0 = they stay where they were
        var follows = 1.0
    }

    /// Runs one calibration: `frames` tracked frames per dot.
    static func run(dots: [(Double, Double)] = FaceCalibrationTests.grid, frames: Int = 60, person: Person = Person(),
                    distance: Double = 0.30, head: (Int) -> (yaw: Double, pitch: Double) = { _ in (0, 0) },
                    seed: UInt64 = 1) -> (points: [FaceCalibrationPointResult], result: FaceCalibrationResult) {
        let c = FaceGazeCalibrator(geometry: screen)
        var noise = Noise(seed: seed)
        var t = 5_000.0
        var points: [FaceCalibrationPointResult] = []
        c.start()
        for (i, dot) in dots.enumerated() {
            let pose = head(i)
            let f = face(distance: distance, yaw: pose.yaw, pitch: pose.pitch)
            let at = truth(x: dot.0, y: dot.1, face: f), rest = truth(x: 0.5, y: 0.5, face: f)
            let missYaw = person.miss * noise.next(), missPitch = person.miss * noise.next()
            XCTAssertTrue(c.beginPoint(x: dot.0, y: dot.1))
            for _ in 0..<frames {
                t += 1.0 / 60
                let yaw = rest.yaw + person.follows * (at.yaw - rest.yaw) + missYaw
                let pitch = rest.pitch + person.follows * (at.pitch - rest.pitch) + missPitch
                let eye = Rig.eye(yaw: person.gain * yaw + person.offsetYaw + person.jitter * noise.next(),
                                  pitch: person.gain * pitch + person.offsetPitch + person.jitter * noise.next())
                c.add(FaceFrame(time: t, faceTransform: f, leftEyeTransform: eye, rightEyeTransform: eye))
            }
            points.append(c.endPoint())
        }
        return (points, c.finish())
    }

    // MARK: - Geometry

    func testADotOnTheScreenBecomesAPointInCameraSpace() {
        let s = Self.screen
        let lens = s.cameraPoint(x: s.lensXM / s.widthM, y: s.lensYM / s.heightM)
        XCTAssertEqual(simd_length(lens), 0, accuracy: 1e-6)
        let bottomRight = s.cameraPoint(x: 1, y: 1)
        XCTAssertEqual(Double(bottomRight.x), 0.1411 - 0.005, accuracy: 1e-6)     // down the screen is +x
        XCTAssertEqual(Double(bottomRight.y), -0.03255, accuracy: 1e-6)           // the person's right is -y
        XCTAssertEqual(bottomRight.z, 0)
        let topLeft = s.cameraPoint(x: 0, y: 0)
        XCTAssertEqual(Double(topLeft.x), -0.005, accuracy: 1e-6)
        XCTAssertEqual(Double(topLeft.y), 0.03255, accuracy: 1e-6)
    }

    func testTheDirectionToADotIsInTheFaceFrame() {
        let f = Self.face()
        let lens = FaceGazeMath.pointAngles(face: f, camera: matrix_identity_float4x4, cameraPoint: .zero)
        let camera = FaceGazeMath.cameraAngles(face: f, camera: matrix_identity_float4x4)
        XCTAssertEqual(lens.yaw, camera.yaw, accuracy: 1e-4)
        XCTAssertEqual(lens.pitch, camera.pitch, accuracy: 1e-4)
        XCTAssertGreaterThan(lens.pitch, 5)                         // the lens is above a face that is 4 cm below it
        func at(_ x: Double, _ y: Double) -> FaceAngles {
            FaceGazeMath.pointAngles(face: f, camera: matrix_identity_float4x4, cameraPoint: Self.screen.cameraPoint(x: x, y: y))
        }
        XCTAssertLessThan(at(0.5, 0.9).pitch, at(0.5, 0.1).pitch - 15)   // further down the screen is further down for the eyes
        XCTAssertGreaterThan(at(0.1, 0.5).yaw, at(0.9, 0.5).yaw + 8)     // the person's left is the face's +x
        let direct = Self.truth(x: 0.2, y: 0.7, face: Self.face(yaw: 12, pitch: -6))
        let viaCore = FaceGazeMath.pointAngles(face: Self.face(yaw: 12, pitch: -6), camera: matrix_identity_float4x4,
                                               cameraPoint: Self.screen.cameraPoint(x: 0.2, y: 0.7))
        XCTAssertEqual(direct.yaw, viaCore.yaw, accuracy: 1e-3)
        XCTAssertEqual(direct.pitch, viaCore.pitch, accuracy: 1e-3)
    }

    func testAPictureTurnedOnTheGlassStillLandsOnTheSameGlass() {
        typealias G = FaceScreenGeometry
        // the picture's top left corner
        XCTAssertTrue(G.portraitShare(x: 0, y: 0, orientation: .portrait) == (0, 0))
        XCTAssertTrue(G.portraitShare(x: 0, y: 0, orientation: .landscapeTopLeft) == (1, 0))    // phone's top right corner
        XCTAssertTrue(G.portraitShare(x: 0, y: 0, orientation: .landscapeTopRight) == (0, 1))   // phone's bottom left corner
        XCTAssertTrue(G.portraitShare(x: 0, y: 0, orientation: .upsideDown) == (1, 1))
        // the picture's right edge, a quarter down
        XCTAssertTrue(G.portraitShare(x: 1, y: 0.25, orientation: .landscapeTopLeft) == (0.75, 1))
        XCTAssertTrue(G.portraitShare(x: 1, y: 0.25, orientation: .landscapeTopRight) == (0.25, 0))
        let s = Self.screen
        XCTAssertEqual(s.cameraPoint(x: 0, y: 0, orientation: .landscapeTopLeft), s.cameraPoint(x: 1, y: 0))
    }

    func testTheScreenSizeComesFromThePixelCountAndTheModel() {
        let pro = FaceScreenDensity.pixelsPerInch(model: "iPhone15,2", nativeScale: 3, pad: false)       // iPhone 14 Pro
        XCTAssertEqual(pro.ppi, 460)
        XCTAssertEqual(pro.source, .model)
        XCTAssertEqual(FaceScreenDensity.metres(pixels: 1179, ppi: pro.ppi), 0.0651, accuracy: 0.0001)
        XCTAssertEqual(FaceScreenDensity.metres(pixels: 2556, ppi: pro.ppi), 0.1411, accuracy: 0.0001)
        XCTAssertEqual(FaceScreenDensity.pixelsPerInch(model: "iPhone14,4", nativeScale: 3, pad: false).ppi, 476)   // 13 mini
        XCTAssertEqual(FaceScreenDensity.pixelsPerInch(model: "iPhone12,1", nativeScale: 2, pad: false).ppi, 326)   // 11
        // a model that is not in the list is answered by its class, and says so
        let unknown = FaceScreenDensity.pixelsPerInch(model: "iPhone99,1", nativeScale: 3, pad: false)
        XCTAssertEqual(unknown.ppi, 460)
        XCTAssertEqual(unknown.source, .scale)
        XCTAssertEqual(FaceScreenDensity.pixelsPerInch(model: "iPhone99,2", nativeScale: 2, pad: false).ppi, 326)
        XCTAssertEqual(FaceScreenDensity.pixelsPerInch(model: "iPad13,4", nativeScale: 2, pad: true).ppi, 264)
        XCTAssertEqual(FaceScreenDensity.Source.model.rawValue, "model")
        XCTAssertEqual(FaceScreenDensity.Source.scale.rawValue, "scale")
    }

    // MARK: - The fit

    func testGoodDataIsFittedAndKept() {
        let r = Self.run()
        XCTAssertTrue(r.points.allSatisfy { $0.ok && $0.samples == 60 && $0.reason == nil })
        XCTAssertLessThan(r.points.map { $0.spreadDeg ?? 99 }.max() ?? 99, 0.5)
        XCTAssertTrue(r.result.ok)
        XCTAssertNil(r.result.reason)
        XCTAssertEqual(r.result.points, 9)
        let cal = r.result.calibration!
        XCTAssertEqual(cal.gainYaw, 2.5, accuracy: 0.1)
        XCTAssertEqual(cal.gainPitch, 2.5, accuracy: 0.05)
        XCTAssertEqual(cal.offsetYaw, -7.5, accuracy: 0.5)          // true = (arkit - 3) / 0.4
        XCTAssertEqual(cal.offsetPitch, 5, accuracy: 0.3)
        XCTAssertLessThan(cal.residualDeg!, 0.5)
        XCTAssertEqual(cal.samples, 540)
        // the corrected gaze lands on a dot that was not part of the fit
        let at = Self.truth(x: 0.3, y: 0.7, face: Self.face())
        let corrected = cal.apply(FaceAngles(yaw: 0.4 * at.yaw + 3, pitch: 0.4 * at.pitch - 2))
        XCTAssertEqual(corrected.yaw, at.yaw, accuracy: 0.3)
        XCTAssertEqual(corrected.pitch, at.pitch, accuracy: 0.3)
        let d = r.result.dictionary
        XCTAssertEqual(Set(d.keys), ["ok", "gain_x", "gain_y", "offset_x_deg", "offset_y_deg", "residual_deg", "samples", "points", "reason"])
        XCTAssertEqual(d["ok"] as? Bool, true)
        XCTAssertTrue(d["reason"] is NSNull)
        XCTAssertEqual(d["gain_x"] as! Double, cal.gainYaw, accuracy: 0.001)
    }

    func testTheMiddleAndFourCornersAreEnough() {
        let r = Self.run(dots: Array(Self.grid.prefix(5)))
        XCTAssertTrue(r.result.ok)
        XCTAssertEqual(r.result.calibration!.gainPitch, 2.5, accuracy: 0.1)
    }

    func testTooFewPointsGiveNoFit() {
        let four = Self.run(dots: Array(Self.grid.prefix(4)))
        XCTAssertFalse(four.result.ok)
        XCTAssertEqual(four.result.reason, .tooFewPoints)
        XCTAssertNil(four.result.calibration)
        XCTAssertEqual(four.result.points, 4)
        let d = four.result.dictionary
        XCTAssertEqual(d["ok"] as? Bool, false)
        XCTAssertEqual(d["reason"] as? String, "too_few_points")
        for k in ["gain_x", "gain_y", "offset_x_deg", "offset_y_deg", "residual_deg"] { XCTAssertTrue(d[k] is NSNull, k) }
    }

    func testADotHeldTooBrieflyDoesNotCount() {
        let r = Self.run(frames: 12)
        XCTAssertTrue(r.points.allSatisfy { !$0.ok && $0.reason == .tooFewSamples && $0.samples == 12 })
        XCTAssertEqual(r.result.reason, .tooFewPoints)
        XCTAssertEqual(r.result.points, 0)
    }

    func testADotWithoutAFaceDoesNotCount() {
        let c = FaceGazeCalibrator(geometry: Self.screen)
        c.start()
        XCTAssertTrue(c.beginPoint(x: 0.5, y: 0.5))
        for i in 0..<60 { c.add(FaceFrame(time: 5_000 + Double(i) / 60, tracked: false)) }
        let p = c.endPoint()
        XCTAssertEqual(p, FaceCalibrationPointResult(ok: false, samples: 0, spreadDeg: nil, reason: .noFace))
        XCTAssertTrue(p.dictionary["spread_deg"] is NSNull)
        XCTAssertEqual(p.dictionary["reason"] as? String, "no_face")
    }

    func testNothingRunsBeforeStartOrOffTheScreenOrTwiceAtOnce() {
        let c = FaceGazeCalibrator(geometry: Self.screen)
        XCTAssertFalse(c.beginPoint(x: 0.5, y: 0.5))
        XCTAssertEqual(c.endPoint().reason, .notStarted)
        XCTAssertEqual(c.finish().reason, .notStarted)
        c.start()
        XCTAssertFalse(c.beginPoint(x: 1.2, y: 0.5))
        XCTAssertFalse(c.beginPoint(x: 0.5, y: -0.1))
        XCTAssertFalse(c.beginPoint(x: .nan, y: 0.5))
        XCTAssertTrue(c.beginPoint(x: 0.5, y: 0.5))
        XCTAssertTrue(c.holding)
        XCTAssertFalse(c.beginPoint(x: 0.1, y: 0.1))
        // a screen whose size is not known cannot start
        let unknown = FaceGazeCalibrator(geometry: FaceScreenGeometry(widthM: 0, heightM: 0, lensXM: 0, lensYM: 0))
        unknown.start()
        XCTAssertFalse(unknown.started)
        XCTAssertFalse(unknown.beginPoint(x: 0.5, y: 0.5))
    }

    func testEyesThatWanderDuringADotAreRejected() {
        // the eyes jump around by several degrees while the dot is held: no dot is accepted
        let r = Self.run(person: Person(jitter: 14))
        XCTAssertTrue(r.points.allSatisfy { !$0.ok && $0.reason == .unsteady })
        XCTAssertGreaterThan(r.points.map { $0.spreadDeg ?? 0 }.min() ?? 0, FaceTuning.calibrationMaxPointSpreadDeg)
        XCTAssertFalse(r.result.ok)
        XCTAssertEqual(r.result.reason, .tooFewPoints)
    }

    func testNoisyDataIsRejectedAndTheFitIsReportedButNotOk() {
        // steady on every dot, but looking up to 6 degrees beside it: the dots are accepted, the fit is not
        for seed in 1...6 {
            let r = Self.run(person: Person(miss: 12), seed: UInt64(seed))
            XCTAssertTrue(r.points.allSatisfy { $0.ok }, "seed \(seed)")
            XCTAssertFalse(r.result.ok, "seed \(seed)")
            XCTAssertTrue(r.result.reason == .poorFit || r.result.reason == .eyesDidNotFollow, "seed \(seed): \(String(describing: r.result.reason))")
            XCTAssertNotNil(r.result.calibration, "seed \(seed)")
        }
    }

    func testEyesThatDoNotFollowTheDotsAreRejected() {
        let r = Self.run(person: Person(follows: 0))
        XCTAssertTrue(r.points.allSatisfy { $0.ok })
        XCTAssertFalse(r.result.ok)
        XCTAssertEqual(r.result.reason, .eyesDidNotFollow)
        XCTAssertEqual(r.result.dictionary["reason"] as? String, "eyes_did_not_follow")
    }

    func testDotsInOnePlaceGiveNoGain() {
        let r = Self.run(dots: Array(repeating: (0.5, 0.5), count: 6))
        XCTAssertTrue(r.points.allSatisfy { $0.ok })
        XCTAssertFalse(r.result.ok)
        XCTAssertEqual(r.result.reason, .tooNarrow)
    }

    func testHeadTurnedDataIsFittedInTheFaceFrame() {
        // the head is turned differently at every dot; the eyes still go to the dot
        let poses: [(Double, Double)] = [(0, 0), (15, 8), (-15, 8), (-12, -10), (14, -9), (6, 10), (-5, -8), (18, 0), (-18, 2)]
        let r = Self.run(head: { (poses[$0].0, poses[$0].1) })
        XCTAssertTrue(r.points.allSatisfy { $0.ok })
        XCTAssertTrue(r.result.ok, String(describing: r.result.reason))
        let cal = r.result.calibration!
        XCTAssertEqual(cal.gainYaw, 2.5, accuracy: 0.05)
        XCTAssertEqual(cal.gainPitch, 2.5, accuracy: 0.05)
        XCTAssertLessThan(cal.residualDeg!, 0.5)
    }

    func testAtArmsLengthTheScreenAloneIsTooNarrowSideways() {
        // 50 cm away the dots span under 8 degrees left to right: that gain stays 1, as in the reference
        let still = Self.run(distance: 0.50)
        XCTAssertEqual(still.result.calibration!.gainYaw, 1)
        XCTAssertEqual(still.result.calibration!.gainPitch, 2.5, accuracy: 0.1)
        // turning the head between the dots widens it again
        let poses: [(Double, Double)] = [(0, 0), (15, 0), (-15, 0), (-12, 0), (14, 0), (6, 0), (-5, 0), (18, 0), (-18, 0)]
        let turned = Self.run(distance: 0.50, head: { (poses[$0].0, poses[$0].1) })
        XCTAssertTrue(turned.result.ok)
        XCTAssertEqual(turned.result.calibration!.gainYaw, 2.5, accuracy: 0.05)
    }

    func testANewRunForgetsTheOldDots() {
        let c = FaceGazeCalibrator(geometry: Self.screen)
        c.start()
        XCTAssertTrue(c.beginPoint(x: 0.5, y: 0.5))
        let eye = Rig.eye(yaw: 0, pitch: 0)
        for i in 0..<60 { c.add(FaceFrame(time: 5_000 + Double(i) / 60, faceTransform: Self.face(), leftEyeTransform: eye, rightEyeTransform: eye)) }
        XCTAssertTrue(c.endPoint().ok)
        XCTAssertEqual(c.points, 1)
        c.start()
        XCTAssertEqual(c.points, 0)
        XCTAssertEqual(c.finish().reason, .tooFewPoints)
        XCTAssertFalse(c.started)
    }

    // MARK: - What is stored

    func testAStoredFitKeepsItsTimeAndReadsTheReferenceFormat() throws {
        var cal = Self.run().result.calibration!
        cal.atMs = 1_700_000_000_000
        let back = try JSONDecoder().decode(FaceGazeCalibration.self, from: JSONEncoder().encode(cal))
        XCTAssertEqual(back, cal)
        XCTAssertEqual(back.atMs, 1_700_000_000_000)
        // what the reference app's GazeCalibration.save() writes: no time
        let reference = #"{"gainYaw":2.1,"offsetYaw":-3,"gainPitch":1.8,"offsetPitch":4,"residualDeg":1.2,"samples":480}"#
        let old = try JSONDecoder().decode(FaceGazeCalibration.self, from: Data(reference.utf8))
        XCTAssertEqual(old.gainYaw, 2.1)
        XCTAssertNil(old.atMs)
    }
}
