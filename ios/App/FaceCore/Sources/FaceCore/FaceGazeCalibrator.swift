import Foundation
import simd

/// How the app's picture sits on the glass.
public enum FaceScreenOrientation: String {
    case portrait
    /// the phone's top edge is on the person's left (UIInterfaceOrientation.landscapeRight)
    case landscapeTopLeft
    /// the phone's top edge is on the person's right (UIInterfaceOrientation.landscapeLeft)
    case landscapeTopRight
    case upsideDown
}

/// The phone's screen in metres and where the front camera's lens is on it, so that a dot given
/// as a share of the screen becomes a point in ARKit's camera space. Lengths are of the glass
/// in its own portrait orientation; nothing here is a default, the app fills it from the device.
public struct FaceScreenGeometry: Equatable {
    public var widthM: Double
    public var heightM: Double
    /// the lens, metres from the left and from the top edge of the screen in portrait
    public var lensXM: Double
    public var lensYM: Double

    public init(widthM: Double, heightM: Double, lensXM: Double, lensYM: Double) {
        self.widthM = widthM
        self.heightM = heightM
        self.lensXM = lensXM
        self.lensYM = lensYM
    }

    public var isValid: Bool {
        [widthM, heightM, lensXM, lensYM].allSatisfy { $0.isFinite } && widthM > 0.02 && heightM > 0.02
    }

    /// A dot at (x, y), each 0...1 of the picture as the person sees it (x to the right, y down),
    /// as shares of the glass in portrait.
    public static func portraitShare(x: Double, y: Double, orientation: FaceScreenOrientation) -> (x: Double, y: Double) {
        switch orientation {
        case .portrait: return (x, y)
        case .landscapeTopLeft: return (1 - y, x)
        case .landscapeTopRight: return (y, 1 - x)
        case .upsideDown: return (1 - x, 1 - y)
        }
    }

    /// The dot in the space of ARKit's front camera, metres. That space is fixed to the phone:
    /// +x runs along the long side from the camera towards the Home-button end, the camera looks
    /// along -z at the person, so +y is the screen's left edge as the person sees it in portrait
    /// (the same frame AfferentEyes reads head pitch in). The screen is taken to lie in the
    /// lens plane, z = 0.
    public func cameraPoint(x: Double, y: Double, orientation: FaceScreenOrientation = .portrait) -> SIMD3<Float> {
        let p = Self.portraitShare(x: x, y: y, orientation: orientation)
        let right = p.x * widthM - lensXM
        let down = p.y * heightM - lensYM
        return SIMD3<Float>(Float(down), Float(-right), 0)
    }
}

/// Why a dot or a fit was not accepted. The raw values go to the web layer as they are.
public enum FaceCalibrationReason: String {
    /// calibrationStart was not called, or the screen's size is not known
    case notStarted = "not_started"
    /// the face measures are not running, so there are no frames
    case notRunning = "not_running"
    /// a dot is still being held
    case busy
    /// no tracked face during the hold
    case noFace = "no_face"
    /// fewer tracked frames than a dot needs, or fewer pairs than a fit needs
    case tooFewSamples = "too_few_samples"
    /// the eyes did not stay on the dot
    case unsteady
    /// fewer accepted dots than a fit needs
    case tooFewPoints = "too_few_points"
    /// the dots covered less than the reference's 8 degrees on both axes, so no gain could be fitted
    case tooNarrow = "too_narrow"
    /// the eyes did not follow the dots: the fitted gain is outside the range the reference allows
    case eyesDidNotFollow = "eyes_did_not_follow"
    /// the corrected gaze stays too far from the dots
    case poorFit = "poor_fit"
}

public struct FaceCalibrationPointResult: Equatable {
    public var ok: Bool
    public var samples: Int
    /// RMS distance of ARKit's eye angles from their mean during the hold, degrees
    public var spreadDeg: Double?
    public var reason: FaceCalibrationReason?

    public init(ok: Bool, samples: Int, spreadDeg: Double?, reason: FaceCalibrationReason?) {
        self.ok = ok
        self.samples = samples
        self.spreadDeg = spreadDeg
        self.reason = reason
    }

    public var dictionary: [String: Any] {
        ["ok": ok, "samples": samples, "spread_deg": FaceJSON.value(spreadDeg.map { FaceJSON.rounded($0, 2) }),
         "reason": reason.map { $0.rawValue as Any } ?? NSNull()]
    }
}

public struct FaceCalibrationResult: Equatable {
    public var ok: Bool
    /// the fit, also when it was not good enough to keep; nil when there was nothing to fit
    public var calibration: FaceGazeCalibration?
    public var points: Int
    public var reason: FaceCalibrationReason?

    public init(ok: Bool, calibration: FaceGazeCalibration?, points: Int, reason: FaceCalibrationReason?) {
        self.ok = ok
        self.calibration = calibration
        self.points = points
        self.reason = reason
    }

    /// x = yaw (left and right), y = pitch (up and down)
    public var dictionary: [String: Any] {
        func r(_ v: Double?, _ digits: Int) -> Any { FaceJSON.value(v.map { FaceJSON.rounded($0, digits) }) }
        return ["ok": ok,
                "gain_x": r(calibration?.gainYaw, 3), "gain_y": r(calibration?.gainPitch, 3),
                "offset_x_deg": r(calibration?.offsetYaw, 2), "offset_y_deg": r(calibration?.offsetPitch, 2),
                "residual_deg": r(calibration?.residualDeg, 2),
                "samples": calibration?.samples ?? 0, "points": points,
                "reason": reason.map { $0.rawValue as Any } ?? NSNull()]
    }
}

/// The per-person gaze fit, run on dots. The reference app (ExpressionView.startCalibration)
/// had the person look at the phone for 8 s while moving the head and fitted, per axis,
/// true = gain * arkit + offset against the direction to the camera. Here the person looks at
/// dots whose place on the glass is known, so the true direction is the one to the dot; the
/// fit, its 60 pairs, its 8 degrees of spread per axis and its gain range are the reference's
/// (FaceGazeCalibration.fit). Turning the head between dots widens the spread, as there.
///
/// Not thread safe: use it from the queue that feeds it.
public final class FaceGazeCalibrator {
    public let geometry: FaceScreenGeometry
    public let orientation: FaceScreenOrientation
    public private(set) var started = false
    public private(set) var points = 0
    public var holding: Bool { target != nil }

    private var pairs: [(eye: FaceAngles, camera: FaceAngles)] = []
    private var target: SIMD3<Float>?
    private var held: [(eye: FaceAngles, camera: FaceAngles)] = []

    public init(geometry: FaceScreenGeometry, orientation: FaceScreenOrientation = .portrait) {
        self.geometry = geometry
        self.orientation = orientation
    }

    /// A new run: every dot so far is forgotten.
    public func start() {
        started = geometry.isValid
        points = 0
        pairs.removeAll()
        target = nil
        held.removeAll()
    }

    /// The person now looks at the dot at (x, y), 0...1 of the picture. false when not started,
    /// a dot is already held, or the place is not on the screen.
    @discardableResult
    public func beginPoint(x: Double, y: Double) -> Bool {
        guard started, target == nil, (0...1).contains(x), (0...1).contains(y) else { return false }
        target = geometry.cameraPoint(x: x, y: y, orientation: orientation)
        held.removeAll(keepingCapacity: true)
        return true
    }

    /// One frame while a dot is held; frames without a tracked face add nothing.
    public func add(_ f: FaceFrame) {
        guard let p = target, f.tracked else { return }
        let eye = FaceGazeMath.eyeAngles(left: f.leftEyeTransform, right: f.rightEyeTransform)
        let dot = FaceGazeMath.pointAngles(face: f.faceTransform, camera: f.cameraTransform, cameraPoint: p)
        guard eye.isFinite, dot.isFinite else { return }
        held.append((eye, dot))
    }

    /// The dot that is being held is dropped.
    public func cancelPoint() {
        target = nil
        held.removeAll(keepingCapacity: true)
    }

    /// The hold is over. A dot that is not ok adds nothing to the fit and can be shown again.
    public func endPoint() -> FaceCalibrationPointResult {
        guard started, target != nil else {
            return FaceCalibrationPointResult(ok: false, samples: 0, spreadDeg: nil, reason: .notStarted)
        }
        target = nil
        let n = held.count
        guard n > 0 else { return FaceCalibrationPointResult(ok: false, samples: 0, spreadDeg: nil, reason: .noFace) }
        let my = held.reduce(0) { $0 + $1.eye.yaw } / Double(n), mp = held.reduce(0) { $0 + $1.eye.pitch } / Double(n)
        let spread = sqrt(held.reduce(0) { $0 + pow($1.eye.yaw - my, 2) + pow($1.eye.pitch - mp, 2) } / Double(n))
        guard n >= FaceTuning.calibrationMinPointSamples else {
            return FaceCalibrationPointResult(ok: false, samples: n, spreadDeg: spread, reason: .tooFewSamples)
        }
        guard spread <= FaceTuning.calibrationMaxPointSpreadDeg else {
            return FaceCalibrationPointResult(ok: false, samples: n, spreadDeg: spread, reason: .unsteady)
        }
        pairs.append(contentsOf: held)
        points += 1
        return FaceCalibrationPointResult(ok: true, samples: n, spreadDeg: spread, reason: nil)
    }

    /// The fit over every accepted dot. The run ends here either way; `ok` says whether the fit
    /// may be kept.
    public func finish() -> FaceCalibrationResult {
        guard started else { return FaceCalibrationResult(ok: false, calibration: nil, points: 0, reason: .notStarted) }
        started = false
        target = nil
        let n = points
        guard n >= FaceTuning.calibrationMinPoints else {
            return FaceCalibrationResult(ok: false, calibration: nil, points: n, reason: .tooFewPoints)
        }
        guard let fit = FaceGazeCalibration.fitDetail(pairs) else {
            return FaceCalibrationResult(ok: false, calibration: nil, points: n, reason: .tooFewSamples)
        }
        guard fit.slopeYaw != nil || fit.slopePitch != nil else {
            return FaceCalibrationResult(ok: false, calibration: fit.calibration, points: n, reason: .tooNarrow)
        }
        let range = FaceTuning.calibrationGainRange
        for slope in [fit.slopeYaw, fit.slopePitch] {
            if let s = slope, !range.contains(s) {
                return FaceCalibrationResult(ok: false, calibration: fit.calibration, points: n, reason: .eyesDidNotFollow)
            }
        }
        guard let residual = fit.calibration.residualDeg, residual <= FaceTuning.calibrationMaxResidualDeg else {
            return FaceCalibrationResult(ok: false, calibration: fit.calibration, points: n, reason: .poorFit)
        }
        return FaceCalibrationResult(ok: true, calibration: fit.calibration, points: n, reason: nil)
    }
}
