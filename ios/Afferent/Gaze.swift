import Foundation
import simd

/// Gaze from ARKit eye transforms, corrected per person.
///
/// ARKit underestimates eye rotation: when the head turns but the eyes stay on the phone, the
/// eyes counter-rotate, yet ARKit's eye transforms follow the head (observed on device).
/// Calibration: the person keeps looking at the phone while moving their head. During that,
/// the true eye direction (relative to the face) is the direction to the camera, so a linear
/// fit per axis  true = gain * arkit + offset  undoes the underestimation.
struct Angles: Equatable { var yaw: Double; var pitch: Double }   // degrees, face frame

enum GazeMath {
    static let deg = 180 / Double.pi

    /// direction -> yaw/pitch (face frame: +z out of the face, +y up, +x to the face's left)
    static func angles(_ v: SIMD3<Float>) -> Angles {
        let n = simd_normalize(v)
        return Angles(yaw: Double(atan2(n.x, n.z)) * deg, pitch: Double(atan2(n.y, n.z)) * deg)
    }

    /// yaw/pitch -> unit direction, inverse of `angles`
    static func direction(_ a: Angles) -> SIMD3<Float> {
        let ty = tan(a.yaw / deg), tp = tan(a.pitch / deg)
        return simd_normalize(SIMD3<Float>(Float(ty), Float(tp), 1))
    }

    /// eye forward (its +z axis) in the face frame
    static func eyeForward(_ eyeTransform: simd_float4x4) -> SIMD3<Float> {
        simd_make_float3(eyeTransform.columns.2)
    }
}

struct GazeCalibration: Codable, Equatable {
    var gainYaw = 1.0, offsetYaw = 0.0
    var gainPitch = 1.0, offsetPitch = 0.0
    var residualDeg: Double?           // RMS error after the fit (how well arrows hit the phone)
    var samples = 0

    static let identity = GazeCalibration()

    func apply(_ e: Angles) -> Angles {
        Angles(yaw: gainYaw * e.yaw + offsetYaw, pitch: gainPitch * e.pitch + offsetPitch)
    }

    /// pairs of (ARKit eye angles, direction to the camera) while the person looks at the phone
    static func fit(_ pairs: [(eye: Angles, camera: Angles)]) -> GazeCalibration? {
        guard pairs.count >= 60 else { return nil }
        func axis(_ e: [Double], _ c: [Double]) -> (Double, Double)? {
            let me = e.reduce(0, +) / Double(e.count), mc = c.reduce(0, +) / Double(c.count)
            let ve = e.reduce(0) { $0 + ($1 - me) * ($1 - me) }
            let cov = zip(e, c).reduce(0) { $0 + ($1.0 - me) * ($1.1 - mc) }
            let spreadC = (c.max() ?? 0) - (c.min() ?? 0)
            // not enough head movement on this axis: keep gain 1, only fix the offset
            guard ve > 1e-6, spreadC >= 8 else { return (1, mc - me) }
            let gain = min(max(cov / ve, 0.5), 4)
            return (gain, mc - gain * me)
        }
        guard let y = axis(pairs.map(\.eye.yaw), pairs.map(\.camera.yaw)),
              let p = axis(pairs.map(\.eye.pitch), pairs.map(\.camera.pitch)) else { return nil }
        var cal = GazeCalibration(gainYaw: y.0, offsetYaw: y.1, gainPitch: p.0, offsetPitch: p.1)
        let sq = pairs.reduce(0.0) { acc, pr in
            let a = cal.apply(pr.eye)
            return acc + pow(a.yaw - pr.camera.yaw, 2) + pow(a.pitch - pr.camera.pitch, 2)
        }
        cal.residualDeg = sqrt(sq / Double(pairs.count))
        cal.samples = pairs.count
        return cal
    }

    // persisted per device/person
    private static let key = "afferent.gazeCalibration"
    static func load() -> GazeCalibration {
        guard let d = UserDefaults.standard.data(forKey: key),
              let c = try? JSONDecoder().decode(GazeCalibration.self, from: d) else { return .identity }
        return c
    }
    func save() {
        if let d = try? JSONEncoder().encode(self) { UserDefaults.standard.set(d, forKey: Self.key) }
    }
}
