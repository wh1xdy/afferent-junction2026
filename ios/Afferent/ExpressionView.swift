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

    let supported = ARFaceTrackingConfiguration.isSupported
    weak var session: ARSession?
    private var expr = ExpressionSession()
    private var t0: TimeInterval?

    func start() {
        expr = ExpressionSession()
        t0 = nil
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
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard running, let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first else {
            DispatchQueue.main.async { self.faceTracked = false }
            return
        }
        let t = frame.timestamp
        if t0 == nil { t0 = t }
        var b: [String: Double] = [:]
        for (k, v) in face.blendShapes { b[k.rawValue] = v.doubleValue }
        let before = expr.events.count
        expr.feed(b, t: t)
        if face.isTracked { expr.feedGaze(yaw: Self.gaze(face, frame).yaw, pitch: Self.gaze(face, frame).pitch, t: t) }
        let newMicro = expr.events.dropFirst(before).last { $0.isMicro }
        let el = t - (t0 ?? t)
        let vals = ExpressionKind.values(b)
        DispatchQueue.main.async {
            self.faceTracked = face.isTracked
            self.elapsed = el
            self.live = vals
            if let m = newMicro { self.recentMicro = m; self.microCount += 1 }
            if el >= Self.duration && self.running { self.stop() }
        }
    }

    /// Gaze relative to the camera, in degrees (0,0 = looking straight into the lens).
    static func gaze(_ face: ARFaceAnchor, _ frame: ARFrame) -> (yaw: Double, pitch: Double) {
        let g = simd_normalize(face.lookAtPoint)
        let cam = simd_mul(simd_inverse(face.transform), frame.camera.transform.columns.3)
        let c = simd_normalize(SIMD3<Float>(cam.x, cam.y, cam.z))
        let deg = 180 / Double.pi
        let yaw = (Double(atan2(g.x, g.z)) - Double(atan2(c.x, c.z))) * deg
        let pitch = (Double(atan2(g.y, g.z)) - Double(atan2(c.y, c.z))) * deg
        return (yaw, pitch)
    }
}

struct FaceTrackingView: UIViewRepresentable {
    let tracker: ExpressionTracker
    func makeUIView(context: Context) -> ARSCNView {
        let v = ARSCNView()
        v.session.delegate = tracker
        v.automaticallyUpdatesLighting = true
        tracker.session = v.session
        if tracker.supported {
            v.session.run(ARFaceTrackingConfiguration())
        }
        return v
    }
    func updateUIView(_ uiView: ARSCNView, context: Context) {}
    static func dismantleUIView(_ uiView: ARSCNView, coordinator: ()) { uiView.session.pause() }
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
                ExpressionReport(summary: s, pulse: finger.freshBpm ?? lastCameraBpm) { tracker.start() }
            } else {
                VStack(spacing: 16) {
                    Text("EXPRESSIONS").font(.system(size: 13, weight: .semibold)).tracking(4)
                        .foregroundStyle(.black.opacity(0.45)).padding(.top, 8)
                    FaceTrackingView(tracker: tracker)
                        .frame(width: 200, height: 260)
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
                    } else {
                        Text("A 60-second session: relax, think of something good, then of your week. We look at facial movement and your eyes — on the phone, nothing is stored or sent.")
                            .font(.footnote).multilineTextAlignment(.center).foregroundStyle(.black.opacity(0.6))
                            .padding(.horizontal, 28)
                        Button("Start session") { tracker.start() }
                            .buttonStyle(.borderedProminent).tint(.black)
                    }
                    Spacer()
                }
            }
        }
        .preferredColorScheme(.light)
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
                Button("New session", action: again).buttonStyle(.borderedProminent).tint(.black)
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
