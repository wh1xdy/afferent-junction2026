import ARKit
import AVFoundation
import Capacitor

/// Camera pulse from the app's one ARKit face session (FaceSession), for the web layer.
///
/// JS: Capacitor.Plugins.AfferentPulse
///   start()  -> {state: 'on' | 'off'}   rejects with code 'unsupported' or 'unauthorized'
///   stop()   -> {}
///   status() -> {state: 'on' | 'off' | 'unsupported' | 'unauthorized', measuring: Bool,
///                reason: String | null, warmup_s_left: Number | null, face: Bool | null,
///                locked: Bool, t_ms: Number | null}
///   event "pulse", once per second while on:
///     {source: 'rppg', t_ms, face, locked, with_eyes, bpm: Int | null, reason, warmup_s_left,
///      trust: {score, label, reasons}, window_s, regions_bpm, snr_db, motion, face_luma}   (the last six only with a reading)
///   reason: null while a camera pulse is measured (trust 40 or more), otherwise why not:
///     'no_face'             no tracked face, or the face is not fully in the picture
///     'exposure_not_locked' exposure and white balance are still settling or could not be locked
///     'too_dark' | 'too_bright'   skin luma under 50 / over 215 of 255, or over 5 % clipped
///     'moving'              the head moves too much for the estimate
///     'warming_up'          the buffer holds less than 6 s
///     'weak_signal'         6 s are there and none of the above, but the estimate is not trusted
///     'off' | 'unsupported' | 'unauthorized'   only in status()
///   warmup_s_left: seconds until a first estimate is possible, with 'exposure_not_locked' and
///     'warming_up'; null otherwise.
///
/// Per frame, on the session's frame queue: 20 times a second the skin patches are read from the
/// frame's pixel buffer inside the call. No frame, buffer or mesh is kept or passed on.
@objc(AfferentPulsePlugin)
public class AfferentPulsePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AfferentPulsePlugin"
    public let jsName = "AfferentPulse"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    private static let settleS = 2.8
    private static let badLightS = 5
    private static let relockEveryS = 30.0

    private let work = DispatchQueue(label: "afferent.pulse")

    // behind `lock`; written on the main queue only
    private let lock = NSLock()
    private var running = false
    private var locked = false
    private var epoch = 0

    // behind `sampling`: the frame queue takes it only when it is free, the estimate holds it
    private let sampling = NSLock()
    private let pulse = FacePulse()
    private var since: Double?

    // frame queue
    private var lastFace = 0.0
    private var lastSample = 0.0
    private var lastEmit = 0.0

    // main queue
    private var wanted = false
    private var lastRelock = 0.0
    private var badLight = 0
    private var last: (why: PulseGate.Why, face: Bool?, tMs: Int?) = (PulseGate.Why(reason: .off), nil, nil)

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *), FaceSession.supported else {
            call.reject("needs iOS 16 and a TrueDepth camera", "unsupported")
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

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var state = self.flags().running ? "on" : "off"
            var why = self.last.why
            if #available(iOS 16.0, *), FaceSession.supported {
                let auth = AVCaptureDevice.authorizationStatus(for: .video)
                if auth == .denied || auth == .restricted { state = "unauthorized"; why = PulseGate.Why(reason: .unauthorized) }
            } else {
                state = "unsupported"
                why = PulseGate.Why(reason: .unsupported)
            }
            call.resolve([
                "state": state,
                "measuring": state == "on" && why.reason == nil,
                "reason": why.reason.map { $0.rawValue as Any } ?? NSNull(),
                "warmup_s_left": why.warmupLeftS.map { $0 as Any } ?? NSNull(),
                "face": self.last.face.map { $0 as Any } ?? NSNull(),
                "locked": self.flags().locked,
                "t_ms": self.last.tMs.map { $0 as Any } ?? NSNull(),
            ])
        }
    }

    private func flags() -> (running: Bool, locked: Bool, epoch: Int) {
        lock.lock()
        defer { lock.unlock() }
        return (running, locked, epoch)
    }

    private func set(running: Bool? = nil, locked: Bool? = nil, bump: Bool = false) {
        lock.lock()
        if let running { self.running = running }
        if let locked { self.locked = locked }
        if bump { epoch += 1 }
        lock.unlock()
    }

    private func clear() {
        work.async {
            self.sampling.lock()
            self.pulse.reset()
            self.since = nil
            self.sampling.unlock()
        }
    }

    private func begin() {
        wanted = true
        guard !flags().running else { return }
        set(running: true)
        last = (PulseGate.Why(reason: .exposureNotLocked, warmupLeftS: Self.settleS + PulseMath.minWindowS), nil, nil)
        FaceSession.shared.hold(.pulse, frames: { [weak self] frame, face in self?.feed(frame, face) })
        FaceSession.shared.onRun = { [weak self] in self?.relock() }
        relock()
    }

    private func end() {
        wanted = false
        guard flags().running else { return }
        set(running: false, locked: false, bump: true)
        last = (PulseGate.Why(reason: .off), nil, nil)
        FaceSession.shared.onRun = nil
        FaceSession.shared.release(.pulse)
        clear()
        exposure(locked: false)
    }

    private func relock() {
        guard flags().running else { return }
        set(locked: false, bump: true)
        let mine = flags().epoch
        badLight = 0
        lastRelock = CACurrentMediaTime()
        clear()
        exposure(locked: false)
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleS) { [weak self] in
            guard let self else { return }
            let now = self.flags()
            guard now.running, now.epoch == mine else { return }
            guard self.exposure(locked: true) else { self.relock(); return }
            self.clear()
            self.set(locked: true)
        }
    }

    @discardableResult
    private func exposure(locked: Bool) -> Bool {
        guard #available(iOS 16.0, *),
              let dev = ARFaceTrackingConfiguration.configurableCaptureDeviceForPrimaryCamera,
              (try? dev.lockForConfiguration()) != nil else { return false }
        let exp: AVCaptureDevice.ExposureMode = locked ? .locked : .continuousAutoExposure
        let wb: AVCaptureDevice.WhiteBalanceMode = locked ? .locked : .continuousAutoWhiteBalance
        if dev.isExposureModeSupported(exp) { dev.exposureMode = exp }
        if dev.isWhiteBalanceModeSupported(wb) { dev.whiteBalanceMode = wb }
        dev.unlockForConfiguration()
        return !locked || exposureHeld()
    }

    private func exposureHeld() -> Bool {
        guard #available(iOS 16.0, *),
              let dev = ARFaceTrackingConfiguration.configurableCaptureDeviceForPrimaryCamera else { return false }
        return PulseGate.held(exposureLocked: dev.exposureMode == .locked,
                              whiteBalanceLocked: dev.whiteBalanceMode == .locked,
                              whiteBalanceLockable: dev.isWhiteBalanceModeSupported(.locked))
    }

    /// Frame queue. Everything read from the frame is read here; nothing of it leaves this call.
    private func feed(_ frame: ARFrame, _ anchor: ARFaceAnchor?) {
        let now = flags()
        guard now.running else { return }
        let t = frame.timestamp
        let face = anchor?.isTracked == true ? anchor : nil
        if let face {
            if lastFace > 0, t - lastFace > PulseGate.lostS { clear() }
            lastFace = t
            if now.locked, t - lastSample >= 1 / PulseMath.sampleHz, sampling.`try`() {
                lastSample = t
                let before = pulse.lastAppended
                pulse.feed(frame: frame, face: face)
                if since == nil, pulse.lastAppended != before { since = pulse.lastAppended }
                sampling.unlock()
            }
        }
        guard t - lastEmit >= 1 else { return }
        lastEmit = t
        let tracked = face != nil
        work.async { self.second(t, tracked: tracked, locked: now.locked, epoch: now.epoch) }
    }

    /// Work queue, once a second: the estimate, off the frame queue.
    private func second(_ t: Double, tracked: Bool, locked: Bool, epoch mine: Int) {
        let held = !locked || exposureHeld()
        let measuring = tracked && locked && held
        var reading: PulseReading?
        sampling.lock()
        if measuring {
            switch PulseGate.step(now: t, lastAppended: pulse.lastAppended) {
            case .estimate: reading = pulse.estimate()
            case .hold: break
            case .reset: pulse.reset(); since = nil
            }
        }
        let luma = pulse.luma, clipped = pulse.clipped
        let buffered = since.map { pulse.lastAppended - $0 } ?? 0
        let fresh = t - pulse.lastAppended <= PulseGate.freshS
        sampling.unlock()
        DispatchQueue.main.async {
            let now = self.flags()
            guard now.running, now.epoch == mine else { return }
            let light = measuring && luma.isFinite ? (luma: luma, clipped: clipped) : nil
            let why = PulseGate.why(tracked: tracked, locked: locked && held,
                                    settleLeftS: Self.settleS - (CACurrentMediaTime() - self.lastRelock), light: light,
                                    fresh: fresh, bufferedS: buffered, reading: reading.map { ($0.trust.score, $0.motion) })
            self.emit(reading, tracked: tracked, locked: locked && held, light: light, why: why)
            if !held { self.relock() }
        }
    }

    private func emit(_ reading: PulseReading?, tracked: Bool, locked: Bool, light: (luma: Double, clipped: Double)?, why: PulseGate.Why) {
        let tMs = Int(Date().timeIntervalSince1970 * 1000)
        var data: [String: Any] = [
            "source": "rppg",
            "t_ms": tMs,
            "face": tracked,
            "locked": locked,
            "with_eyes": FaceSession.shared.holds(.eyes),
            "bpm": reading.map { $0.bpm as Any } ?? NSNull(),
            "reason": why.reason.map { $0.rawValue as Any } ?? NSNull(),
            "warmup_s_left": why.warmupLeftS.map { $0 as Any } ?? NSNull(),
        ]
        if let r = reading {
            data["trust"] = ["score": r.trust.score, "label": r.trust.label.rawValue, "reasons": r.trust.reasons]
            data["window_s"] = r.windowSeconds
            data["regions_bpm"] = r.regionsBpm.map { $0.map { $0 as Any } ?? NSNull() }
            if r.snr.isFinite { data["snr_db"] = r.snr }
            if r.motion.isFinite { data["motion"] = r.motion }
        }
        if let l = light {
            data["face_luma"] = l.luma / 255
            let bad = l.clipped > PulseGate.clippedShare || l.luma > PulseGate.brightLuma || l.luma < PulseGate.darkLuma
            badLight = bad ? badLight + 1 : 0
        }
        last = (why, tracked, tMs)
        notifyListeners("pulse", data: data)
        if badLight >= Self.badLightS, CACurrentMediaTime() - lastRelock >= Self.relockEveryS { relock() }
    }
}
