import Foundation
import simd

/// What the camera session hands over for one ARKit frame. A plain value: no frame, no mesh
/// and no pixels are in it, only the 52 coefficients and four transforms.
public struct FaceFrame {
    /// seconds, monotonic (ARFrame.timestamp)
    public var time: Double
    /// ARFaceAnchor.isTracked; false also stands for "no face anchor in this frame"
    public var tracked: Bool
    public var shapes: FaceShapeVector
    /// ARFaceAnchor.transform
    public var faceTransform: simd_float4x4
    /// ARFrame.camera.transform
    public var cameraTransform: simd_float4x4
    /// ARFaceAnchor.leftEyeTransform / rightEyeTransform (face frame)
    public var leftEyeTransform: simd_float4x4
    public var rightEyeTransform: simd_float4x4
    /// metres; when nil the distance between face and camera transform is used, as in the reference
    public var distanceM: Double?

    public init(time: Double, tracked: Bool = true, shapes: FaceShapeVector = FaceShapeVector(),
                faceTransform: simd_float4x4 = matrix_identity_float4x4,
                cameraTransform: simd_float4x4 = matrix_identity_float4x4,
                leftEyeTransform: simd_float4x4 = matrix_identity_float4x4,
                rightEyeTransform: simd_float4x4 = matrix_identity_float4x4,
                distanceM: Double? = nil) {
        self.time = time
        self.tracked = tracked
        self.shapes = shapes
        self.faceTransform = faceTransform
        self.cameraTransform = cameraTransform
        self.leftEyeTransform = leftEyeTransform
        self.rightEyeTransform = rightEyeTransform
        self.distanceM = distanceM
    }
}

/// Event "face" of the AfferentFace plugin, once per second. nil = no value (JSON null), never 0.
public struct FacePayload: Equatable {
    /// ms since epoch, the end of the second
    public var tMs: Double
    /// a face was tracked for at least half of this second
    public var tracked: Bool
    /// 0...1 above the person's own baseline, mean of the left and right smile blendshape
    public var smile: Double?
    /// mean absolute blendshape change per second, >= 0
    public var movement: Double?
    /// blinks completed in this second
    public var blinks: Int
    /// 0...1, share of the second with the gaze more than 25 degrees from the screen
    public var gazeAway: Double?
    public var distanceCm: Double?
    public var breathingPerMin: Double?
    public var breathingSnr: Double?

    /// The contract, field for field; NSNull where there is no value.
    public var dictionary: [String: Any] {
        [
            "t_ms": tMs,
            "tracked": tracked,
            "smile": FaceJSON.value(smile),
            "movement": FaceJSON.value(movement),
            "blinks": blinks,
            "gaze_away": FaceJSON.value(gazeAway),
            "distance_cm": FaceJSON.value(distanceCm),
            "breathing_per_min": FaceJSON.value(breathingPerMin),
            "breathing_snr": FaceJSON.value(breathingSnr),
        ]
    }
}

/// Event "micro" of the AfferentFace plugin: one brief facial movement (40 to 500 ms).
public struct FaceMicroPayload: Equatable {
    /// ms since epoch, when the movement began
    public var tMs: Double
    public var durationMs: Double
    public var region: FaceRegion
    /// 0...1, how far above the person's baseline the movement went
    public var peak: Double

    public var dictionary: [String: Any] {
        ["t_ms": tMs, "duration_ms": durationMs, "region": region.rawValue, "peak": peak]
    }
}

public struct FaceOutput {
    public var face: FacePayload?
    public var micro: [FaceMicroPayload] = []
    public var isEmpty: Bool { face == nil && micro.isEmpty }
}

enum FaceJSON {
    static func value(_ v: Double?) -> Any {
        guard let v = v, v.isFinite else { return NSNull() }
        return v
    }

    static func rounded(_ v: Double, _ digits: Int) -> Double {
        let p = pow(10, Double(digits))
        return (v * p).rounded() / p
    }
}

/// The one entry point for the camera session: one `ingest` per ARKit frame, at 60 Hz. It
/// returns a "face" payload once per second and "micro" payloads when a brief facial movement
/// has ended. Everything is the reference app's method (ios/Afferent), see FaceTuning for each
/// constant; where this port differs it says so there.
///
/// Not thread safe: call it from one queue. Per frame it does no sorting and allocates nothing
/// (an array is only created in a frame that has an event); the breathing estimate runs once
/// per second.
///
/// Expects ARKit's 60 Hz: the 5 s baseline of the brief movements is counted in frames, as in
/// the reference.
public final class FaceAggregator {
    /// The per-person gaze fit (FaceGazeCalibration). Identity until one is set.
    public var gazeCalibration: FaceGazeCalibration

    private let now: () -> Double
    private var s = State()

    private struct State {
        var lastT = -Double.infinity
        var epochOffset: Double?
        var windowStart: Double?
        var lastTrackedT: Double?
        var lost = false
        // this second
        var trackedTime = 0.0
        var frames = 0
        var smileSum = 0.0
        var blinks = 0
        var gazeFrames = 0
        var farFrames = 0
        var distanceSum = 0.0
        var distanceFrames = 0
        var moveSum = 0.0
        var moveTime = 0.0
        // smile baseline
        var calibrationStart: Double?
        var calibrationSmile: [Double] = []
        var smileBaseline: Double?
        // blinks
        var blinkClosed = false
        // movement: 0.1 s means of every blendshape
        var blockStart = 0.0
        var blockFrames = 0
        var blockSum = FaceShapeVector()
        var previousBlock = FaceShapeVector()
        var hasPreviousBlock = false
        var gaze = FaceGazeTracker()
        var micro = FaceMicroDetector()
        var breathing = FaceBreathingTracker()

        init() {
            calibrationSmile.reserveCapacity(Int(FaceTuning.smileCalibrationS * 60) * 2)
        }
    }

    /// scratch for the brief movements that ended in the current frame
    private var bursts: [FaceBurst] = []

    /// `now`: seconds since 1970, read once at the first frame to place the frame clock in wall time.
    public init(gazeCalibration: FaceGazeCalibration = .identity,
                now: @escaping () -> Double = { Date().timeIntervalSince1970 }) {
        self.gazeCalibration = gazeCalibration
        self.now = now
        bursts.reserveCapacity(8)
    }

    /// Forget everything: a new session, a new baseline.
    public func reset() {
        s = State()
        bursts.removeAll(keepingCapacity: true)
    }

    /// The smile baseline in use: the person's own after the first 10 s, the reference's fixed
    /// 0.02 before.
    public var smileBaseline: Double { s.smileBaseline ?? FaceTuning.smileFallbackBaseline }

    /// One frame with a face anchor, blendshapes under ARKit's names ("mouthSmile_L").
    @discardableResult
    public func ingest(time: Double, blendShapes: [String: Float],
                       faceTransform: simd_float4x4, cameraTransform: simd_float4x4,
                       leftEyeTransform: simd_float4x4, rightEyeTransform: simd_float4x4,
                       distanceM: Double? = nil, tracked: Bool = true) -> FaceOutput {
        ingest(FaceFrame(time: time, tracked: tracked, shapes: FaceBlendShapes.vector(from: blendShapes),
                         faceTransform: faceTransform, cameraTransform: cameraTransform,
                         leftEyeTransform: leftEyeTransform, rightEyeTransform: rightEyeTransform,
                         distanceM: distanceM))
    }

    /// A frame without a face anchor: the seconds keep rolling, with `tracked: false` and nulls.
    @discardableResult
    public func ingestNoFace(time: Double) -> FaceOutput {
        ingest(FaceFrame(time: time, tracked: false))
    }

    @discardableResult
    public func ingest(_ f: FaceFrame) -> FaceOutput {
        var out = FaceOutput()
        let t = f.time
        guard t.isFinite, t > s.lastT else { return out }
        s.lastT = t
        if s.epochOffset == nil { s.epochOffset = now() - t }
        closeSecond(t, &out)

        guard f.tracked else {
            if let last = s.lastTrackedT, t - last > FaceTuning.trackingGapS { trackingLost(t, &out) }
            return out
        }
        if let last = s.lastTrackedT {
            let dt = t - last
            if dt > FaceTuning.trackingGapS {
                trackingLost(t, &out)
                if dt > FaceTuning.breathingGapS { s.breathing.clear() }
            } else {
                s.trackedTime += dt
            }
        }
        s.lastTrackedT = t
        s.lost = false
        s.frames += 1

        // gaze relative to the camera, corrected per person, then relative to where the person mostly looks
        var far = false
        let eye = gazeCalibration.apply(FaceGazeMath.eyeAngles(left: f.leftEyeTransform, right: f.rightEyeTransform))
        let camera = FaceGazeMath.cameraAngles(face: f.faceTransform, camera: f.cameraTransform)
        if eye.isFinite, camera.isFinite {
            let away = s.gaze.feed(yaw: eye.yaw - camera.yaw, pitch: eye.pitch - camera.pitch, t: t)
            far = away > FaceTuning.farDeg
            s.gazeFrames += 1
            if far { s.farFrames += 1 }
        }

        // distance and head position in camera space (TrueDepth), the breathing signal
        let rel = simd_make_float3(f.faceTransform.columns.3) - simd_make_float3(f.cameraTransform.columns.3)
        let measured = Double(simd_length(rel))
        if measured.isFinite, measured > 0 {
            let up = simd_make_float3(f.cameraTransform.columns.1)
            s.breathing.append(t: t, dist: measured, y: Double(simd_dot(rel, up)))
        }
        let distance = f.distanceM ?? measured
        if distance.isFinite, distance > 0 {
            s.distanceSum += distance
            s.distanceFrames += 1
        }

        // smile: mean of both lip corners, against the median of the first 10 s
        let smile = Double(f.shapes[FaceBlendShapes.mouthSmileL] + f.shapes[FaceBlendShapes.mouthSmileR]) / 2
        s.smileSum += smile
        if s.smileBaseline == nil { calibrateSmile(smile, t) }

        // blinks: closed above 0.6, counted when the eyes are open again below 0.4
        let blink = Double(f.shapes[FaceBlendShapes.eyeBlinkL] + f.shapes[FaceBlendShapes.eyeBlinkR]) / 2
        if !s.blinkClosed && blink > FaceTuning.blinkClosed {
            s.blinkClosed = true
        } else if s.blinkClosed && blink < FaceTuning.blinkOpen {
            s.blinkClosed = false
            s.blinks += 1
        }

        // movement: absolute change between 0.1 s means, over all 52 blendshapes
        if s.blockFrames > 0 && t - s.blockStart >= FaceTuning.movementBlockS - 0.001 {
            let mean = s.blockSum / Float(s.blockFrames)
            if s.hasPreviousBlock {
                let d = mean - s.previousBlock
                s.moveSum += Double(d.replacing(with: -d, where: d .< 0).sum())
                s.moveTime += t - s.blockStart
            }
            s.previousBlock = mean
            s.hasPreviousBlock = true
            s.blockFrames = 0
        }
        if s.blockFrames == 0 {
            s.blockStart = t
            s.blockSum = FaceShapeVector()
        }
        s.blockSum += f.shapes
        s.blockFrames += 1

        // brief facial movements
        s.micro.feed(f.shapes, t: t, lookingFarAway: far, into: &bursts)
        emitBursts(&out)
        return out
    }

    private func calibrateSmile(_ smile: Double, _ t: Double) {
        guard let start = s.calibrationStart else {
            s.calibrationStart = t
            s.calibrationSmile.append(smile)
            return
        }
        if t - start < FaceTuning.smileCalibrationS {
            s.calibrationSmile.append(smile)
        } else if s.calibrationSmile.count >= FaceTuning.smileCalibrationMinFrames {
            s.calibrationSmile.sort()
            s.smileBaseline = s.calibrationSmile[s.calibrationSmile.count / 2]
            s.calibrationSmile = []
        } else {
            s.calibrationStart = t
            s.calibrationSmile.removeAll(keepingCapacity: true)
            s.calibrationSmile.append(smile)
        }
    }

    private func trackingLost(_ t: Double, _ out: inout FaceOutput) {
        guard !s.lost else { return }
        s.lost = true
        s.blinkClosed = false
        s.blockFrames = 0
        s.hasPreviousBlock = false
        s.micro.trackingLost(t: t, into: &bursts)
        emitBursts(&out)
    }

    private func emitBursts(_ out: inout FaceOutput) {
        guard !bursts.isEmpty else { return }
        for b in bursts {
            out.micro.append(FaceMicroPayload(tMs: epochMs(b.start),
                                              durationMs: (b.duration * 1000).rounded(),
                                              region: b.region,
                                              peak: FaceJSON.rounded(min(max(b.peak, 0), 1), 3)))
        }
        bursts.removeAll(keepingCapacity: true)
    }

    private func epochMs(_ t: Double) -> Double {
        ((t + (s.epochOffset ?? 0)) * 1000).rounded()
    }

    private func closeSecond(_ t: Double, _ out: inout FaceOutput) {
        guard let start = s.windowStart else {
            s.windowStart = t
            return
        }
        guard t - start >= 1 else { return }
        let tracked = s.trackedTime >= FaceTuning.trackedShare
        var p = FacePayload(tMs: epochMs(start + 1), tracked: tracked, smile: nil, movement: nil, blinks: s.blinks,
                            gazeAway: nil, distanceCm: nil, breathingPerMin: nil, breathingSnr: nil)
        if tracked {
            if s.frames > 0 {
                p.smile = FaceJSON.rounded(min(max(s.smileSum / Double(s.frames) - smileBaseline, 0), 1), 3)
            }
            if s.moveTime > 0 {
                p.movement = FaceJSON.rounded(s.moveSum / Double(FaceBlendShapes.count) / s.moveTime, 4)
            }
            if s.gazeFrames > 0 {
                p.gazeAway = FaceJSON.rounded(Double(s.farFrames) / Double(s.gazeFrames), 3)
            }
            if s.distanceFrames > 0 {
                p.distanceCm = FaceJSON.rounded(s.distanceSum / Double(s.distanceFrames) * 100, 1)
            }
            if let b = s.breathing.clearReading() {
                p.breathingPerMin = FaceJSON.rounded(b.perMinute, 1)
                p.breathingSnr = FaceJSON.rounded(b.snrDb, 1)
            }
        } else {
            s.breathing.missedSecond()
        }
        out.face = p
        s.trackedTime = 0
        s.frames = 0
        s.smileSum = 0
        s.blinks = 0
        s.gazeFrames = 0
        s.farFrames = 0
        s.distanceSum = 0
        s.distanceFrames = 0
        s.moveSum = 0
        s.moveTime = 0
        s.windowStart = t - (start + 1) >= 1 ? t : start + 1
    }
}
