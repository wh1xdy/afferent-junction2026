import ARKit
import AVFoundation
import Capacitor

final class FaceFrames {
    static let shared = FaceFrames()
    var onFrame: ((ARFrame) -> Void)?
    var onEyes: ((Bool) -> Void)?
    private(set) var eyes = false

    func eyesSession(_ on: Bool) {
        guard eyes != on else { return }
        eyes = on
        onEyes?(on)
    }
}

@objc(AfferentPulsePlugin)
public class AfferentPulsePlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "AfferentPulsePlugin"
    public let jsName = "AfferentPulse"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private static let settleS = 2.8
    private static let faceLostS = 2.0
    private static let badLightS = 5
    private static let relockEveryS = 30.0
    private static let maxQueued = 3

    private let pulse = FacePulse()
    private let work = DispatchQueue(label: "afferent.pulse")
    private var session: ARSession?
    private var wanted = false
    private var running = false
    private var locked = false
    private var epoch = 0
    private var queued = 0
    private var lastFace = 0.0
    private var lastSample = 0.0
    private var lastEmit = 0.0
    private var lastRelock = 0.0
    private var badLight = 0

    @objc func start(_ call: CAPPluginCall) {
        guard ARFaceTrackingConfiguration.isSupported else {
            call.reject("TrueDepth camera not available", "unsupported")
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            DispatchQueue.main.async {
                self.begin()
                call.resolve(["state": "on"])
            }
        case .notDetermined:
            DispatchQueue.main.async { self.wanted = true }
            AVCaptureDevice.requestAccess(for: .video) { ok in
                DispatchQueue.main.async {
                    guard ok else {
                        self.wanted = false
                        call.reject("camera permission denied", "unauthorized")
                        return
                    }
                    guard self.wanted else { call.resolve(["state": "off"]); return }
                    self.begin()
                    call.resolve(["state": "on"])
                }
            }
        default:
            call.reject("camera permission denied", "unauthorized")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.end()
            call.resolve()
        }
    }

    private func begin() {
        wanted = true
        guard !running else { return }
        running = true
        FaceFrames.shared.onFrame = { [weak self] frame in self?.feed(frame) }
        FaceFrames.shared.onEyes = { [weak self] on in self?.eyesChanged(on) }
        if !FaceFrames.shared.eyes { runOwn() }
        relock()
    }

    private func end() {
        wanted = false
        guard running else { return }
        running = false
        epoch += 1
        FaceFrames.shared.onFrame = nil
        FaceFrames.shared.onEyes = nil
        session?.pause()
        session = nil
        locked = false
        work.async { self.pulse.reset() }
        exposure(locked: false)
    }

    private func runOwn() {
        let own = ARSession()
        own.delegate = self
        let config = ARFaceTrackingConfiguration()
        config.maximumNumberOfTrackedFaces = 1
        own.run(config, options: [.resetTracking, .removeExistingAnchors])
        session = own
    }

    private func eyesChanged(_ on: Bool) {
        guard running else { return }
        if on {
            session?.pause()
            session = nil
        } else {
            runOwn()
        }
        relock()
    }

    private func relock() {
        epoch += 1
        let mine = epoch
        locked = false
        badLight = 0
        lastRelock = CACurrentMediaTime()
        work.async { self.pulse.reset() }
        exposure(locked: false)
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleS) { [weak self] in
            guard let self, self.running, self.epoch == mine else { return }
            self.exposure(locked: true)
            self.work.async { self.pulse.reset() }
            self.locked = true
        }
    }

    private func exposure(locked: Bool) {
        guard #available(iOS 16.0, *),
              let dev = ARFaceTrackingConfiguration.configurableCaptureDeviceForPrimaryCamera,
              (try? dev.lockForConfiguration()) != nil else { return }
        let exp: AVCaptureDevice.ExposureMode = locked ? .locked : .continuousAutoExposure
        let wb: AVCaptureDevice.WhiteBalanceMode = locked ? .locked : .continuousAutoWhiteBalance
        if dev.isExposureModeSupported(exp) { dev.exposureMode = exp }
        if dev.isWhiteBalanceModeSupported(wb) { dev.whiteBalanceMode = wb }
        dev.unlockForConfiguration()
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard session === self.session else { return }
        feed(frame)
    }

    public func sessionInterruptionEnded(_ session: ARSession) {
        guard running, session === self.session else { return }
        relock()
    }

    private func feed(_ frame: ARFrame) {
        guard running else { return }
        let t = frame.timestamp
        let face = frame.anchors.compactMap { $0 as? ARFaceAnchor }.first { $0.isTracked }
        if let face {
            if lastFace > 0, t - lastFace > Self.faceLostS { work.async { self.pulse.reset() } }
            lastFace = t
            if locked, t - lastSample >= 1 / PulseMath.sampleHz, queued < Self.maxQueued {
                lastSample = t
                queued += 1
                work.async {
                    self.pulse.feed(frame: frame, face: face)
                    DispatchQueue.main.async { self.queued -= 1 }
                }
            }
        }
        guard t - lastEmit >= 1 else { return }
        lastEmit = t
        let tracked = face != nil, measuring = tracked && locked, mine = epoch
        work.async {
            let reading = measuring ? self.pulse.estimate() : nil
            let luma = self.pulse.luma, clipped = self.pulse.clipped
            DispatchQueue.main.async {
                guard self.running, self.epoch == mine else { return }
                self.emit(reading, tracked: tracked, measuring: measuring, luma: luma, clipped: clipped)
            }
        }
    }

    private func emit(_ reading: PulseReading?, tracked: Bool, measuring: Bool, luma: Double, clipped: Double) {
        var data: [String: Any] = [
            "source": "rppg",
            "t_ms": Int(Date().timeIntervalSince1970 * 1000),
            "face": tracked,
            "locked": locked,
            "with_eyes": FaceFrames.shared.eyes,
            "bpm": reading.map { $0.bpm as Any } ?? NSNull(),
        ]
        if let r = reading {
            data["trust"] = ["score": r.trust.score, "label": r.trust.label.rawValue, "reasons": r.trust.reasons]
            data["window_s"] = r.windowSeconds
            data["regions_bpm"] = r.regionsBpm.map { $0.map { $0 as Any } ?? NSNull() }
            if r.snr.isFinite { data["snr_db"] = r.snr }
            if r.motion.isFinite { data["motion"] = r.motion }
        }
        if measuring, luma.isFinite {
            data["face_luma"] = luma / 255
            badLight = clipped > 0.05 || luma > 215 || luma < 50 ? badLight + 1 : 0
        }
        notifyListeners("pulse", data: data)
        if badLight >= Self.badLightS, CACurrentMediaTime() - lastRelock >= Self.relockEveryS { relock() }
    }
}
