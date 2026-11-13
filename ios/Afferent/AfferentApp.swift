import SwiftUI
import AVFoundation

@main
struct AfferentApp: App {
    var body: some Scene {
        WindowGroup { RootView() }
    }
}

struct RootView: View {
    @StateObject private var finger = FingerSensor()
    @State private var lastCameraBpm: Int?
    var body: some View {
        TabView {
            PulseView(finger: finger, lastBpm: $lastCameraBpm)
                .tabItem { Label("Pulse", systemImage: "heart.fill") }
            ExpressionView(finger: finger, lastCameraBpm: lastCameraBpm)
                .tabItem { Label("Expressions", systemImage: "face.smiling") }
            CheckInView()
                .tabItem { Label("Check-in", systemImage: "list.bullet.clipboard") }
        }
        .tint(.black)
    }
}

/// Camera preview for SwiftUI
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.preview.session = session
        v.preview.videoGravity = .resizeAspectFill
        return v
    }
    func updateUIView(_ uiView: PreviewView, context: Context) {}
}

struct PulseView: View {
    @StateObject private var cam = PulseCamera()
    @ObservedObject var finger: FingerSensor
    @Binding var lastBpm: Int?
    @State private var tick = Date()
    @State private var savedBrightness: CGFloat = 0.5

    var body: some View {
        ZStack {
            // The white screen is the light source: even, broadband light on the face
            // (coloured room light has little green, where the pulse signal lives).
            Color.white.ignoresSafeArea()
            VStack(spacing: 20) {
                Text("AFFERENT")
                    .font(.system(size: 13, weight: .semibold)).tracking(4)
                    .foregroundStyle(.black.opacity(0.45))
                    .padding(.top, 8)

                CameraPreview(session: cam.session)
                    .frame(width: 180, height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(cam.faceFound ? Color.green.opacity(0.7) : Color.black.opacity(0.1), lineWidth: 3))

                bpmBlock
                trustBlock
                fingerBlock
                Spacer()
                Text(hint)
                    .font(.footnote).multilineTextAlignment(.center)
                    .foregroundStyle(.black.opacity(0.5))
                    .padding(.horizontal, 32)
                Button("Re-lock camera") { cam.lockExposureSoon() }
                    .font(.footnote.weight(.medium))
                    .tint(.black.opacity(0.6))
                    .padding(.bottom, 12)
            }
        }
        .preferredColorScheme(.light)
        .onChange(of: cam.reading?.bpm) { _, v in if let v, cam.reading?.trust.label == .reliable { lastBpm = v } }
        .onAppear {
            savedBrightness = UIScreen.main.brightness
            UIScreen.main.brightness = 1.0
            UIApplication.shared.isIdleTimerDisabled = true
            cam.start()
        }
        .onDisappear {
            UIScreen.main.brightness = savedBrightness
            UIApplication.shared.isIdleTimerDisabled = false
            cam.stop()
        }
    }

    private var bpmBlock: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(cam.reading.map { "\($0.bpm)" } ?? "—")
                .font(.system(size: 96, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.black.opacity(cam.reading?.trust.label == .reliable ? 1 : 0.35))
                .contentTransition(.numericText())
                .animation(.snappy, value: cam.reading?.bpm)
            Text("BPM").font(.headline).foregroundStyle(.black.opacity(0.4))
        }
    }

    @ViewBuilder private var trustBlock: some View {
        if let r = cam.reading {
            VStack(spacing: 6) {
                Text("\(r.trust.label.rawValue.uppercased())  \(r.trust.score)")
                    .font(.caption.weight(.bold)).tracking(1.5)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(badgeColor(r.trust.label), in: Capsule())
                    .foregroundStyle(r.trust.label == .uncertain ? .black : .white)
                Text(r.trust.reasons.first ?? "forehead and cheeks agree")
                    .font(.caption).foregroundStyle(.black.opacity(0.55))
                Text("regions " + r.regionsBpm.map { $0.map(String.init) ?? "–" }.joined(separator: " · "))
                    .font(.caption2.monospacedDigit()).foregroundStyle(.black.opacity(0.35))
            }
        } else {
            ProgressView(value: min(cam.windowSeconds / PulseMath.minWindowS, 1))
                .frame(width: 160).tint(.black.opacity(0.6))
        }
    }

    /// Finger PulseSensors on the UNO Q over Bluetooth, as a live reference for the camera.
    private var fingerBlock: some View {
        let _ = tick                      // re-evaluate staleness every second
        let f1 = finger.freshBpm, f2 = finger.freshBpm2
        let cam = self.cam.reading?.bpm
        return VStack(spacing: 8) {
            if f1 == nil && f2 == nil {
                fingerRow(label: fingerStatus, bpm: nil, cam: nil)
            }
            if let f1 { fingerRow(label: "Finger 1", bpm: f1, cam: cam) }
            if let f2 { fingerRow(label: "Finger 2", bpm: f2, cam: cam) }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { tick = $0 }
    }

    private func fingerRow(label: String, bpm: Int?, cam: Int?) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "hand.point.up.left.fill").foregroundStyle(.red.opacity(0.8))
            Text(bpm.map { "\(label) \($0)" } ?? label)
                .font(.subheadline.weight(.semibold)).monospacedDigit()
            if let bpm, let cam {
                Text("Δ \(abs(cam - bpm))")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(abs(cam - bpm) <= 5 ? .green : .orange)
            }
        }
        .foregroundStyle(.black.opacity(0.75))
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Color.black.opacity(0.05), in: Capsule())
    }

    private var fingerStatus: String {
        switch finger.state {
        case .off: return "Bluetooth off"
        case .unauthorized: return "Bluetooth not allowed"
        case .scanning: return "Looking for finger sensor…"
        case .connecting: return "Connecting…"
        case .connected: return "Finger sensor: no pulse yet"
        }
    }

    private var hint: String {
        switch cam.state {
        case .noPermission: return "Camera access is off. Enable it in Settings › Afferent."
        case .noCamera: return "No front camera available (the simulator has none)."
        default:
            if !cam.faceFound { return "Hold the phone 25–35 cm from your face, at eye level." }
            if !cam.locked { return "Locking exposure on your face…" }
            if cam.reading == nil { return "Keep still — measuring for \(Int(PulseMath.minWindowS)) seconds." }
            return "Keep still. The reading uses the last 10 seconds."
        }
    }

    private func badgeColor(_ l: Trust.Label) -> Color {
        switch l {
        case .reliable: return .green
        case .uncertain: return .yellow
        case .unreliable: return .red
        }
    }
}
