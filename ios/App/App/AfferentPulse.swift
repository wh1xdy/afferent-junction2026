import Capacitor
import Combine

@objc(AfferentPulsePlugin)
public class AfferentPulsePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AfferentPulsePlugin"
    public let jsName = "AfferentPulse"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "relock", returnType: CAPPluginReturnPromise),
    ]

    private var camera: PulseCamera?
    private var tap: PulseFrameTap?
    private var subs = Set<AnyCancellable>()
    private var light: LightReading?
    private var lastEyes = 0.0
    private var pending: CAPPluginCall?

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.camera?.state == .running { call.resolve(); return }
            self.teardown()
            let cam = PulseCamera()
            self.camera = cam
            self.pending = call
            cam.$state.dropFirst().sink { [weak plugin = self, weak cam] state in
                guard let plugin, let cam, plugin.camera === cam else { return }
                switch state {
                case .running:
                    plugin.attach(cam)
                    plugin.pending?.resolve(); plugin.pending = nil
                case .noPermission: plugin.teardown("camera permission denied")
                case .noCamera: plugin.teardown("no front camera")
                case .idle: break
                }
            }.store(in: &self.subs)
            ScreenLight.shared.begin()
            cam.start()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardown()
            call.resolve()
        }
    }

    @objc func relock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let cam = self.camera else { call.reject("not running"); return }
            cam.lockExposureSoon()
            call.resolve()
        }
    }

    private func teardown(_ reason: String = "stopped") {
        pending?.reject(reason)
        pending = nil
        subs.removeAll()
        tap?.uninstall()
        camera?.stop()
        camera = nil
        tap = nil
        light = nil
        ScreenLight.shared.end()
    }

    private func attach(_ cam: PulseCamera) {
        let tap = PulseFrameTap(camera: cam)
        tap.onEyes = { [weak self, weak tap] e in
            DispatchQueue.main.async { if let self, let tap, self.tap === tap { self.emitEyes(e) } }
        }
        tap.onLight = { [weak self, weak tap] l in
            DispatchQueue.main.async { if let self, let tap, self.tap === tap { self.light = l } }
        }
        tap.install()
        self.tap = tap
        cam.$reading.sink { [weak self, weak cam] r in
            guard let self, let cam else { return }
            self.emitPulse(r, cam)
        }.store(in: &subs)
    }

    private func emitEyes(_ e: EyesReading) {
        guard e.t - lastEyes >= 1.0 / 30.0 else { return }
        lastEyes = e.t
        var data: [String: Any] = ["tracked": e.tracked, "t": e.t, "source": "vision"]
        if e.tracked {
            data["blink_l"] = e.blinkL
            data["blink_r"] = e.blinkR
            data["openness"] = e.openness
            if let p = e.pitchDeg { data["pitch_deg"] = p }
            if let l = e.faceLuma { data["ambient"] = l }
        }
        notifyListeners("eyes", data: data)
    }

    private func emitPulse(_ r: PulseReading?, _ cam: PulseCamera) {
        var data: [String: Any] = [
            "source": "rppg",
            "t": CACurrentMediaTime(),
            "face": cam.faceFound,
            "locked": cam.locked,
            "window_s": cam.windowSeconds,
            "bpm": r.map { $0.bpm as Any } ?? NSNull(),
            "quality": r.map { Double($0.trust.score) / 100 } ?? 0,
        ]
        if let r {
            data["trust"] = ["score": r.trust.score, "label": r.trust.label.rawValue, "reasons": r.trust.reasons]
            data["snr"] = r.snr
            data["motion"] = r.motion
            data["regions_bpm"] = r.regionsBpm.map { $0.map { $0 as Any } ?? NSNull() }
        }
        if let l = light {
            data["light"] = ["face_luma": l.faceLuma, "level": l.level, "iso": l.iso, "exposure_ms": l.exposureMs]
        }
        notifyListeners("pulse", data: data)
    }
}
