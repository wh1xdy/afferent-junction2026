import Foundation
import simd
@testable import FaceCore

/// Deterministic noise, -0.5...0.5
struct Noise {
    var state: UInt64
    init(seed: UInt64 = 1) { state = seed &* 7919 &+ 13 }
    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double((state >> 11) & 0x1FFFFFFFFFFFFF) / Double(1 << 53) - 0.5
    }
}

/// A synthetic TrueDepth session at 60 Hz: the phone's camera at the origin, the face in front
/// of it, both eyes turned by a given angle. Collects what the aggregator hands back.
final class Rig {
    static let epoch = 1_700_000_000.0
    static let startTime = 5_000.0          // ARFrame.timestamp is time since boot, not wall time

    let aggregator: FaceAggregator
    var frame = 0
    var faces: [FacePayload] = []
    var micros: [FaceMicroPayload] = []
    private var noise: Noise

    init(calibration: FaceGazeCalibration = .identity, seed: UInt64 = 1) {
        aggregator = FaceAggregator(gazeCalibration: calibration, now: { Rig.epoch })
        noise = Noise(seed: seed)
    }

    var time: Double { Rig.startTime + Double(frame) / 60 }

    /// ms since epoch of frame `i`
    static func ms(frame i: Int) -> Double { ((epoch + Double(i) / 60) * 1000).rounded() }

    /// A resting face under ARKit's names: every coefficient a little above 0 with tracker
    /// jitter, the eyelids at their measured resting 0.25.
    func resting(jitter: Double = 0.004) -> [String: Float] {
        var b: [String: Float] = [:]
        for name in FaceBlendShapes.names {
            let base = name.hasPrefix("eyeBlink") ? 0.25 : 0.05
            b[name] = Float(base + jitter * 2 * noise.next())
        }
        return b
    }

    static func eye(yaw: Double, pitch: Double) -> simd_float4x4 {
        var m = matrix_identity_float4x4
        let d = FaceGazeMath.direction(FaceAngles(yaw: yaw, pitch: pitch))
        m.columns.2 = SIMD4<Float>(d.x, d.y, d.z, 0)
        return m
    }

    static func face(distance: Double, vertical: Double = 0) -> simd_float4x4 {
        var m = matrix_identity_float4x4
        m.columns.3 = SIMD4<Float>(0, Float(vertical), Float(-distance), 1)
        return m
    }

    /// One frame with a face. `eyeYaw` / `eyePitch`: ARKit's eye direction in the face frame, degrees.
    @discardableResult
    func feed(_ shapes: [String: Float], eyeYaw: Double = 0, eyePitch: Double = 0,
              distance: Double = 0.30, vertical: Double = 0, tracked: Bool = true) -> FaceOutput {
        let eye = Rig.eye(yaw: eyeYaw, pitch: eyePitch)
        let out = aggregator.ingest(time: time, blendShapes: shapes,
                                    faceTransform: Rig.face(distance: distance, vertical: vertical),
                                    cameraTransform: matrix_identity_float4x4,
                                    leftEyeTransform: eye, rightEyeTransform: eye, tracked: tracked)
        collect(out)
        return out
    }

    /// One frame of a face that only moves its head: the same resting coefficients every frame.
    func feedHead(distance: Double, vertical: Double) {
        if restingShapes == nil { restingShapes = FaceBlendShapes.vector(from: resting(jitter: 0)) }
        collect(aggregator.ingest(FaceFrame(time: time, shapes: restingShapes ?? FaceShapeVector(),
                                            faceTransform: Rig.face(distance: distance, vertical: vertical))))
    }
    private var restingShapes: FaceShapeVector?

    @discardableResult
    func feedNoFace() -> FaceOutput {
        let out = aggregator.ingestNoFace(time: time)
        collect(out)
        return out
    }

    private func collect(_ out: FaceOutput) {
        if let f = out.face { faces.append(f) }
        micros.append(contentsOf: out.micro)
        frame += 1
    }
}

extension Dictionary where Key == String, Value == Float {
    /// add to the named coefficients (ARKit names)
    func adding(_ delta: Float, to names: [String]) -> [String: Float] {
        var b = self
        for n in names { b[n, default: 0] += delta }
        return b
    }

    func setting(_ value: Float, for names: [String]) -> [String: Float] {
        var b = self
        for n in names { b[n] = value }
        return b
    }
}
