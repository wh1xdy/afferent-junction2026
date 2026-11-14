import Foundation
import simd

/// Gaze from ARKit's eye transforms, corrected per person. Ported from the reference
/// (ios/Afferent/Gaze.swift and the gaze part of Expressions.swift / ExpressionView.swift).
///
/// Two corrections, both from the reference:
///  1. ARKit underestimates eye rotation (its eye transforms follow the head when the eyes stay
///     on the phone). A per-person linear fit per axis, true = gain * arkit + offset, undoes that
///     (`FaceGazeCalibration`). It is fitted while the person keeps looking at the phone and
///     moves the head; without a stored fit the gain is 1.
///  2. "At the screen" is where the person mostly looks: the running median of the gaze over the
///     last 60 s (`FaceGazeTracker`). People hold the phone below eye level.
public struct FaceAngles: Equatable {
    public var yaw: Double
    public var pitch: Double

    public init(yaw: Double, pitch: Double) {
        self.yaw = yaw
        self.pitch = pitch
    }

    var isFinite: Bool { yaw.isFinite && pitch.isFinite }
}

public enum FaceGazeMath {
    static let deg = 180 / Double.pi

    /// direction -> yaw/pitch in degrees (face frame: +z out of the face, +y up, +x to the face's left)
    public static func angles(_ v: SIMD3<Float>) -> FaceAngles {
        let n = simd_normalize(v)
        return FaceAngles(yaw: Double(atan2(n.x, n.z)) * deg, pitch: Double(atan2(n.y, n.z)) * deg)
    }

    /// yaw/pitch -> unit direction, inverse of `angles`
    public static func direction(_ a: FaceAngles) -> SIMD3<Float> {
        let ty = tan(a.yaw / deg), tp = tan(a.pitch / deg)
        return simd_normalize(SIMD3<Float>(Float(ty), Float(tp), 1))
    }

    /// eye forward (its +z axis) in the face frame
    static func eyeForward(_ eyeTransform: simd_float4x4) -> SIMD3<Float> {
        simd_make_float3(eyeTransform.columns.2)
    }

    /// ARKit's uncorrected eye direction in the face frame, both eyes averaged
    /// (ARFaceAnchor.leftEyeTransform / rightEyeTransform).
    public static func eyeAngles(left: simd_float4x4, right: simd_float4x4) -> FaceAngles {
        angles(eyeForward(left) + eyeForward(right))
    }

    /// Direction from the face to the camera, in the face frame (ARFaceAnchor.transform,
    /// ARFrame.camera.transform).
    public static func cameraAngles(face: simd_float4x4, camera: simd_float4x4) -> FaceAngles {
        let cam = simd_mul(simd_inverse(face), camera.columns.3)
        return angles(SIMD3<Float>(cam.x, cam.y, cam.z))
    }
}

public struct FaceGazeCalibration: Codable, Equatable {
    public var gainYaw = 1.0, offsetYaw = 0.0
    public var gainPitch = 1.0, offsetPitch = 0.0
    /// RMS error after the fit, degrees
    public var residualDeg: Double?
    public var samples = 0

    public static let identity = FaceGazeCalibration()

    public init(gainYaw: Double = 1, offsetYaw: Double = 0, gainPitch: Double = 1, offsetPitch: Double = 0) {
        self.gainYaw = gainYaw
        self.offsetYaw = offsetYaw
        self.gainPitch = gainPitch
        self.offsetPitch = offsetPitch
    }

    public func apply(_ e: FaceAngles) -> FaceAngles {
        FaceAngles(yaw: gainYaw * e.yaw + offsetYaw, pitch: gainPitch * e.pitch + offsetPitch)
    }

    /// pairs of (ARKit eye angles, direction to the camera) while the person looks at the phone
    public static func fit(_ pairs: [(eye: FaceAngles, camera: FaceAngles)]) -> FaceGazeCalibration? {
        guard pairs.count >= FaceTuning.calibrationMinPairs else { return nil }
        func axis(_ e: [Double], _ c: [Double]) -> (Double, Double) {
            let me = e.reduce(0, +) / Double(e.count), mc = c.reduce(0, +) / Double(c.count)
            let ve = e.reduce(0) { $0 + ($1 - me) * ($1 - me) }
            let cov = zip(e, c).reduce(0) { $0 + ($1.0 - me) * ($1.1 - mc) }
            let spreadC = (c.max() ?? 0) - (c.min() ?? 0)
            // not enough head movement on this axis: keep gain 1, only fix the offset
            guard ve > 1e-6, spreadC >= FaceTuning.calibrationMinSpreadDeg else { return (1, mc - me) }
            let r = FaceTuning.calibrationGainRange
            let gain = min(max(cov / ve, r.lowerBound), r.upperBound)
            return (gain, mc - gain * me)
        }
        let y = axis(pairs.map(\.eye.yaw), pairs.map(\.camera.yaw))
        let p = axis(pairs.map(\.eye.pitch), pairs.map(\.camera.pitch))
        var cal = FaceGazeCalibration(gainYaw: y.0, offsetYaw: y.1, gainPitch: p.0, offsetPitch: p.1)
        let sq = pairs.reduce(0.0) { acc, pr in
            let a = cal.apply(pr.eye)
            return acc + pow(a.yaw - pr.camera.yaw, 2) + pow(a.pitch - pr.camera.pitch, 2)
        }
        cal.residualDeg = sqrt(sq / Double(pairs.count))
        cal.samples = pairs.count
        return cal
    }
}

/// How far the gaze is from where the person mostly looks (ExpressionSession.feedGaze).
struct FaceGazeTracker {
    private var historyYaw = FaceRunningWindow(capacity: FaceTuning.gazeHistoryCount)
    private var historyPitch = FaceRunningWindow(capacity: FaceTuning.gazeHistoryCount)
    private var lastHistoryT = -Double.infinity

    /// yaw/pitch: calibrated gaze relative to the camera, degrees. Returns degrees away from
    /// the running median.
    mutating func feed(yaw: Double, pitch: Double, t: Double) -> Double {
        if t - lastHistoryT >= FaceTuning.gazeHistoryStepS - 0.001 {      // 10 Hz is plenty for a median
            lastHistoryT = t
            historyYaw.push(yaw)
            historyPitch.push(pitch)
        }
        return hypot(yaw - historyYaw.median, pitch - historyPitch.median)
    }
}
