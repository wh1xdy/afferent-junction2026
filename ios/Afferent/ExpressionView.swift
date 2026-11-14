import ARKit
import SceneKit
import SwiftUI

/// ARKit face tracking (TrueDepth): 52 blendshapes + gaze at 60 Hz -> ExpressionSession.
final class ExpressionTracker: NSObject, ObservableObject, ARSessionDelegate {
    static let duration = 60.0

    @Published var running = false
    @Published var faceTracked = false
    @Published var elapsed = 0.0
    @Published var live: [ExpressionKind: Double] = [:]
    @Published var recentMicro: ExpressionEvent?
    @Published var microCount = 0
    @Published var finished: ExpressionSession.Summary?
    @Published var exportURL: URL?
    @Published var gazeNow: (yaw: Double, pitch: Double) = (0, 0)
    @Published var topShapes: [(String, Double)] = []
    @Published var calibration = GazeCalibration.load()
    @Published var calibrating = false
    @Published var calibrationProgress = 0.0
    private var calPairs: [(eye: Angles, camera: Angles)] = []
    private var calStart: TimeInterval?
    static let calibrationSeconds = 8.0

    func startCalibration() {
        calPairs.removeAll()
        calStart = nil
        calibrationProgress = 0
        calibrating = true
    }

    func resetCalibration() {
        calibration = .identity
        calibration.save()
    }
    @Published var showDebug = false

    let supported = ARFaceTrackingConfiguration.isSupported
    weak var session: ARSession?
    private var expr = ExpressionSession()
    private var t0: TimeInterval?
    // raw recording for offline tuning: t, gaze yaw/pitch, 52 blendshapes (fixed key order)
    private var rec: [[Float]] = []
    private var keys: [String] = []

    func start() {
        expr = ExpressionSession()
        t0 = nil
        rec.removeAll(keepingCapacity: true)
        keys = []
        exportURL = nil
        finished = nil
        microCount = 0
        recentMicro = nil
        running = true
        let cfg = ARFaceTrackingConfiguration()
        cfg.maximumNumberOfTrackedFaces = 1
        session?.run(cfg, options: [.resetTracking, .removeExistingAnchors])
    }

    func stop() {
        running = false
        finished = expr.summary
        exportURL = writeRecording()
    }

    /// Session as JSON for offline analysis (AirDrop it to the Mac).
    private func writeRecording() -> URL? {
        let s = expr.summary
        let doc: [String: Any] = [
            "format": "afferent-expressions-v1",
            "hz": 60,
            "columns": ["t", "gaze_yaw_deg", "gaze_pitch_deg", "eye_yaw_raw", "eye_pitch_raw",
                        "cam_yaw", "cam_pitch"] + keys,
            "calibration": ["gainYaw": calibration.gainYaw, "offsetYaw": calibration.offsetYaw,
                            "gainPitch": calibration.gainPitch, "offsetPitch": calibration.offsetPitch],
            "frames": rec.map { $0.map { (Double($0) * 1000).rounded() / 1000 } },
            "events": expr.events.map { ["kind": $0.kind.rawValue, "start": $0.start, "duration": $0.duration, "peak": $0.peak] },
            "summary": ["seconds": s.seconds, "smileShare": s.smileShare, "expressivity": s.expressivity,
                        "gazeDownShare": s.gazeDownShare, "blinksPerMinute": s.blinksPerMinute,
                        "gazeShiftsPerMinute": s.gazeShiftsPerMinute, "gazeAwayShare": s.gazeAwayShare,
                        "eyeWideShare": s.eyeWideShare],
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: doc) else { return nil }
        let f = DateFormatter(); f.dateFormat = "yyyyMMdd-HHmmss"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("afferent-session-\(f.string(from: Date())).json")
        return (try? data.write(to: url)) != nil ? url : nil
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first else {
            DispatchQueue.main.async { self.faceTracked = false }
            return
        }
        var b: [String: Double] = [:]
        for (k, v) in face.blendShapes { b[Self.normalized(k.rawValue)] = v.doubleValue }
        let g = gaze(face, frame)
        let vals = ExpressionKind.values(b)
        let tracked = face.isTracked
        if calibrating && tracked {
            if calStart == nil { calStart = frame.timestamp }
            calPairs.append((Self.eyeAngles(face), Self.cameraAngles(face, frame)))
            let p = (frame.timestamp - (calStart ?? frame.timestamp)) / Self.calibrationSeconds
            if p >= 1 {
                let fitted = GazeCalibration.fit(calPairs)
                DispatchQueue.main.async {
                    self.calibrating = false
                    if let f = fitted { self.calibration = f; f.save() }
                }
            } else {
                DispatchQueue.main.async { self.calibrationProgress = p }
            }
        }
        // debug view works before a session starts too
        guard running else {
            DispatchQueue.main.async {
                self.faceTracked = tracked
                self.gazeNow = g
                self.live = vals
                if self.showDebug { self.topShapes = b.sorted { $0.value > $1.value }.prefix(8).map { ($0.key, $0.value) } }
            }
            return
        }
        let t = frame.timestamp
        if t0 == nil { t0 = t }
        let before = expr.events.count
        expr.feed(b, t: t)
        if tracked { expr.feedGaze(yaw: g.yaw, pitch: g.pitch, t: t) }
        if keys.isEmpty { keys = b.keys.sorted() }
        let raw = Self.eyeAngles(face), cam = Self.cameraAngles(face, frame)
        rec.append([Float(t - (t0 ?? t)), Float(g.yaw), Float(g.pitch), Float(raw.yaw), Float(raw.pitch),
                    Float(cam.yaw), Float(cam.pitch)] + keys.map { Float(b[$0] ?? 0) })
        let newMicro = expr.events.dropFirst(before).last { $0.isMicro }
        let el = t - (t0 ?? t)
        DispatchQueue.main.async {
            self.faceTracked = tracked
            self.elapsed = el
            self.live = vals
            self.gazeNow = g
            if self.showDebug {
                self.topShapes = b.sorted { $0.value > $1.value }.prefix(8).map { ($0.key, $0.value) }
            }
            if let m = newMicro { self.recentMicro = m; self.microCount += 1 }
            if el >= Self.duration && self.running { self.stop() }
        }
    }

    /// ARKit raw values are "mouthSmile_L"; the analysis uses "mouthSmileLeft".
    static func normalized(_ k: String) -> String {
        if k.hasSuffix("_L") { return String(k.dropLast(2)) + "Left" }
        if k.hasSuffix("_R") { return String(k.dropLast(2)) + "Right" }
        return k
    }

    /// Gaze relative to the camera, in degrees (0,0 = looking straight into the lens).
    /// direction to the camera in the face frame
    static func cameraAngles(_ face: ARFaceAnchor, _ frame: ARFrame) -> Angles {
        let cam = simd_mul(simd_inverse(face.transform), frame.camera.transform.columns.3)
        return GazeMath.angles(SIMD3<Float>(cam.x, cam.y, cam.z))
    }

    /// ARKit's (uncorrected) eye direction in the face frame, both eyes averaged
    static func eyeAngles(_ face: ARFaceAnchor) -> Angles {
        GazeMath.angles(GazeMath.eyeForward(face.leftEyeTransform) + GazeMath.eyeForward(face.rightEyeTransform))
    }

    /// Calibrated gaze relative to the camera, in degrees (0,0 = looking into the lens).
    func gaze(_ face: ARFaceAnchor, _ frame: ARFrame) -> (yaw: Double, pitch: Double) {
        let e = calibration.apply(Self.eyeAngles(face))
        let c = Self.cameraAngles(face, frame)
        return (e.yaw - c.yaw, e.pitch - c.pitch)
    }
}

struct FaceTrackingView: UIViewRepresentable {
    let tracker: ExpressionTracker
    var eyeDebug = false

    func makeCoordinator() -> EyeArrows { EyeArrows() }

    func makeUIView(context: Context) -> ARSCNView {
        let v = ARSCNView()
        v.session.delegate = tracker
        v.delegate = context.coordinator          // SceneKit side: eye arrows on the face anchor
        v.automaticallyUpdatesLighting = true
        v.rendersContinuously = true
        tracker.session = v.session
        if tracker.supported {
            v.session.run(ARFaceTrackingConfiguration())
        }
        return v
    }
    func updateUIView(_ uiView: ARSCNView, context: Context) {
        context.coordinator.visible = eyeDebug
        context.coordinator.calibration = tracker.calibration
    }
    static func dismantleUIView(_ uiView: ARSCNView, coordinator: EyeArrows) { uiView.session.pause() }
}

/// Debug overlay: ARKit's face mesh (wireframe), an arrow out of each eye along its eye
/// transform (+z = gaze direction) and a dot at lookAtPoint, where the two gaze rays meet.
final class EyeArrows: NSObject, ARSCNViewDelegate {
    var visible = false { didSet { root?.isHidden = !visible } }
    var calibration = GazeCalibration.identity
    private var root: SCNNode?
    private let left = EyeArrows.arrow(color: .cyan)
    private let right = EyeArrows.arrow(color: .magenta)
    private let focus: SCNNode = {
        let n = SCNNode(geometry: SCNSphere(radius: 0.006))
        n.geometry?.firstMaterial?.diffuse.contents = UIColor.yellow
        n.geometry?.firstMaterial?.lightingModel = .constant
        return n
    }()

    static func arrow(color: UIColor, length: CGFloat = 0.15) -> SCNNode {
        let m = SCNMaterial()
        m.diffuse.contents = color
        m.lightingModel = .constant
        let shaft = SCNNode(geometry: SCNCylinder(radius: 0.0012, height: length))
        shaft.geometry?.materials = [m]
        shaft.position = SCNVector3(0, 0, Float(length / 2))
        shaft.eulerAngles.x = .pi / 2                   // cylinder axis y -> z (gaze)
        let tip = SCNNode(geometry: SCNCone(topRadius: 0, bottomRadius: 0.004, height: 0.012))
        tip.geometry?.materials = [m]
        tip.position = SCNVector3(0, 0, Float(length) + 0.006)
        tip.eulerAngles.x = .pi / 2
        let n = SCNNode()
        n.addChildNode(shaft)
        n.addChildNode(tip)
        return n
    }

    private var mesh: ARSCNFaceGeometry?

    func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
        guard anchor is ARFaceAnchor else { return nil }
        let n = SCNNode()
        let r = SCNNode()
        r.addChildNode(left); r.addChildNode(right); r.addChildNode(focus)
        // what ARKit "sees": its fitted 3D face model as a wireframe
        if let dev = renderer.device, let g = ARSCNFaceGeometry(device: dev) {
            g.firstMaterial?.fillMode = .lines
            g.firstMaterial?.diffuse.contents = UIColor.green.withAlphaComponent(0.55)
            g.firstMaterial?.lightingModel = .constant
            mesh = g
            r.addChildNode(SCNNode(geometry: g))
        }
        r.isHidden = !visible
        n.addChildNode(r)
        root = r
        return n
    }

    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        guard let face = anchor as? ARFaceAnchor else { return }
        mesh?.update(from: face.geometry)
        // arrow at each eye, along the calibrated gaze direction (ARKit's own eye rotation is too small)
        for (node, t) in [(left, face.leftEyeTransform), (right, face.rightEyeTransform)] {
            let dir = GazeMath.direction(calibration.apply(GazeMath.angles(GazeMath.eyeForward(t))))
            node.simdPosition = simd_make_float3(t.columns.3)
            node.simdOrientation = simd_quatf(from: SIMD3<Float>(0, 0, 1), to: dir)
        }
        // focus: 30 cm along the averaged calibrated gaze from between the eyes
        let mid = (simd_make_float3(face.leftEyeTransform.columns.3) + simd_make_float3(face.rightEyeTransform.columns.3)) / 2
        let e = calibration.apply(GazeMath.angles(GazeMath.eyeForward(face.leftEyeTransform) + GazeMath.eyeForward(face.rightEyeTransform)))
        focus.simdPosition = mid + GazeMath.direction(e) * 0.3
    }
}

struct ExpressionView: View {
    @StateObject private var tracker = ExpressionTracker()
    @ObservedObject var finger: FingerSensor
    var lastCameraBpm: Int?

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()
            if !tracker.supported {
                Text("Face tracking needs a TrueDepth camera (iPhone X or newer).")
                    .multilineTextAlignment(.center).padding()
            } else if let s = tracker.finished {
                ExpressionReport(summary: s, pulse: finger.freshBpm ?? lastCameraBpm, export: tracker.exportURL) { tracker.start() }
            } else {
                VStack(spacing: 16) {
                    Text("EXPRESSIONS").font(.system(size: 13, weight: .semibold)).tracking(4)
                        .foregroundStyle(.black.opacity(0.45)).padding(.top, 8)
                    FaceTrackingView(tracker: tracker, eyeDebug: tracker.showDebug)
                        .frame(width: tracker.showDebug ? 320 : 200, height: tracker.showDebug ? 420 : 260)
                        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .stroke(tracker.faceTracked ? Color.green.opacity(0.7) : Color.black.opacity(0.1), lineWidth: 3))
                    if tracker.running {
                        Text(prompt).font(.headline).multilineTextAlignment(.center).padding(.horizontal, 24)
                        ProgressView(value: min(tracker.elapsed / ExpressionTracker.duration, 1))
                            .frame(width: 220).tint(.black.opacity(0.7))
                        liveBars
                        Text(tracker.recentMicro.map { "micro-expression: \($0.kind.label) (\(Int($0.duration * 1000)) ms)" } ?? " ")
                            .font(.caption.monospacedDigit()).foregroundStyle(.purple)
                        Text("\(tracker.microCount) micro-expressions").font(.caption2).foregroundStyle(.black.opacity(0.4))
                        if tracker.showDebug { debugPanel }
                    } else {
                        Text("A 60-second session: relax, think of something good, then of your week. We look at facial movement and your eyes — on the phone, nothing is stored or sent.")
                            .font(.footnote).multilineTextAlignment(.center).foregroundStyle(.black.opacity(0.6))
                            .padding(.horizontal, 28)
                        Button("Start session") { tracker.start() }
                            .buttonStyle(.borderedProminent).tint(.black)
                        Toggle("Debug: face mesh, eye arrows, raw values", isOn: $tracker.showDebug)
                            .font(.footnote).frame(width: 260)
                        if tracker.showDebug { debugPanel }
                    }
                    Spacer()
                }
            }
        }
        .preferredColorScheme(.light)
    }

    /// what the face tracking sees right now: gaze + the strongest raw blendshapes
    private var debugPanel: some View {
        VStack(alignment: .leading, spacing: 2) {
            if tracker.calibrating {
                Text("Keep looking at the phone and slowly move your head around…")
                    .font(.caption.weight(.semibold)).foregroundStyle(.purple)
                ProgressView(value: tracker.calibrationProgress).tint(.purple)
            } else {
                HStack {
                    Button("Calibrate gaze") { tracker.startCalibration() }
                        .font(.caption.weight(.semibold)).buttonStyle(.bordered).tint(.purple)
                    if let r = tracker.calibration.residualDeg {
                        Text(String(format: "gain %.1f×/%.1f×  error %.0f°", tracker.calibration.gainYaw, tracker.calibration.gainPitch, r))
                            .font(.caption2.monospacedDigit())
                        Button("Reset") { tracker.resetCalibration() }.font(.caption2)
                    } else {
                        Text("not calibrated").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            Text(String(format: "gaze yaw %+.0f°  pitch %+.0f°", tracker.gazeNow.yaw, tracker.gazeNow.pitch))
                .font(.caption.monospacedDigit().weight(.semibold))
            ForEach(tracker.topShapes, id: \.0) { name, v in
                HStack(spacing: 6) {
                    Text(name).frame(width: 130, alignment: .leading)
                    Capsule().fill(Color.green.opacity(0.7)).frame(width: 100 * v, height: 5)
                    Text(String(format: "%.2f", v))
                }
                .font(.caption2.monospacedDigit())
            }
        }
        .foregroundStyle(.black.opacity(0.7))
        .frame(width: 300, alignment: .leading)
    }

    private var prompt: String {
        switch tracker.elapsed {
        case ..<20: return "Look at the screen and relax."
        case ..<40: return "Think of something that made you happy recently."
        default: return "Now think about how your week has been."
        }
    }

    private var liveBars: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(ExpressionKind.allCases, id: \.self) { k in
                HStack(spacing: 8) {
                    Text(k.label).font(.caption2).frame(width: 90, alignment: .leading)
                    GeometryReader { g in
                        Capsule().fill(Color.black.opacity(0.08))
                            .overlay(alignment: .leading) {
                                Capsule().fill(Color.black.opacity(0.7))
                                    .frame(width: g.size.width * min(tracker.live[k] ?? 0, 1))
                            }
                    }.frame(height: 6)
                }
            }
        }
        .frame(width: 260)
    }
}

struct ExpressionReport: View {
    let summary: ExpressionSession.Summary
    let pulse: Int?
    let export: URL?
    let again: () -> Void

    var body: some View {
        let act = Activation.from(summary, restingBpm: pulse)
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Session summary").font(.title2.bold())
                Text("These are measurements of facial behaviour, not a diagnosis. Moods vary, and faces differ a lot between people. If you've been feeling low, the Check-in tab and talking to someone you trust or a professional are better guides than any camera.")
                    .font(.footnote).foregroundStyle(.black.opacity(0.6))

                section("Expression") {
                    row("Smiling", "\(Int(summary.smileShare * 100)) % of the time")
                    row("Facial movement", String(format: "%.3f", summary.expressivity))
                    row("Looking down", "\(Int(summary.gazeDownShare * 100)) %")
                }
                section("Eyes") {
                    row("Blinks", "\(Int(summary.blinksPerMinute)) / min")
                    row("Gaze shifts", "\(Int(summary.gazeShiftsPerMinute)) / min")
                    row("Looking away", "\(Int(summary.gazeAwayShare * 100)) %")
                    row("Eyes wide", "\(Int(summary.eyeWideShare * 100)) %")
                }
                section("Activation \(act.score)/100") {
                    if let pulse { row("Pulse", "\(pulse) BPM") }
                    if act.notes.isEmpty { Text("Nothing stands out.").font(.subheadline) }
                    ForEach(act.notes, id: \.self) { Text("• \($0)").font(.subheadline) }
                }
                section("Micro-expressions (40–500 ms)") {
                    ForEach(ExpressionKind.allCases, id: \.self) { k in
                        row(k.label, "\(summary.micro[k] ?? 0) micro · \(summary.macro[k] ?? 0) longer")
                    }
                }
                HStack {
                    Button("New session", action: again).buttonStyle(.borderedProminent).tint(.black)
                    if let export {
                        ShareLink(item: export) { Label("Export data", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered).tint(.black)
                    }
                }
            }
            .padding(24)
        }
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption.weight(.semibold)).tracking(1.5).foregroundStyle(.black.opacity(0.45))
            c()
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack { Text(k); Spacer(); Text(v).monospacedDigit().foregroundStyle(.black.opacity(0.7)) }
            .font(.subheadline)
    }
}
