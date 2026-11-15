import ARKit
import Capacitor
import WebKit

@objc(AfferentEyesPlugin)
public class AfferentEyesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AfferentEyesPlugin"
    public let jsName = "AfferentEyes"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var lastSent: TimeInterval = 0
    /// main queue: start() was called and stop() was not (also while the camera prompt is up)
    private var wanted = false

    /// Rejects with code 'unauthorized' when the camera is not allowed, as AfferentPulse.start does:
    /// ARKit would otherwise run without frames and the web layer (Sensors.startCamera) would never
    /// fall back to touch input.
    @objc func start(_ call: CAPPluginCall) {
        guard FaceSession.supported else {
            call.reject("needs ARKit face tracking")
            return
        }
        DispatchQueue.main.async { self.wanted = true }
        FaceSession.authorize { ok in
            guard ok else {
                self.wanted = false
                call.reject("camera permission denied", "unauthorized")
                return
            }
            if self.wanted { self.hold() }
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.wanted = false
            FaceSession.shared.release(.eyes)
            call.resolve()
        }
    }

    /// Main queue.
    private func hold() {
        FaceSession.shared.hold(.eyes, anchors: { [weak self] session, anchors in self?.eyes(session, anchors) })
    }

    private func pitchDegrees(face: ARFaceAnchor, camera: ARCamera?) -> Double? {
        guard let camera = camera else { return nil }
        let rel = simd_mul(simd_inverse(camera.transform), face.transform)
        let forward = rel.columns.2
        return Double(atan2(-forward.x, forward.z)) * 180.0 / Double.pi
    }

    private func eyes(_ session: ARSession, _ anchors: [ARAnchor]) {
        guard let face = anchors.compactMap({ $0 as? ARFaceAnchor }).first else { return }
        let now = CACurrentMediaTime()
        guard now - lastSent >= 1.0 / 30.0 else { return }
        lastSent = now
        let frame = session.currentFrame
        let blinkL = face.blendShapes[.eyeBlinkLeft]?.doubleValue ?? 0
        let blinkR = face.blendShapes[.eyeBlinkRight]?.doubleValue ?? 0
        var data: [String: Any] = [
            "blink_l": blinkL,
            "blink_r": blinkR,
            "openness": max(0, min(1, 1 - (blinkL + blinkR) / 2)),
            "tracked": face.isTracked,
            "t": now,
        ]
        if let pitch = pitchDegrees(face: face, camera: frame?.camera) {
            data["pitch_deg"] = pitch
        }
        if let light = frame?.lightEstimate {
            data["ambient"] = max(0, min(1, Double(light.ambientIntensity) / 2000.0))
        }
        DispatchQueue.main.async { self.notifyListeners("eyes", data: data) }
    }
}

class AfferentViewController: CAPBridgeViewController {
    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.mediaTypesRequiringUserActionForPlayback = []
        return config
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AfferentFingerPlugin())
        bridge?.registerPluginInstance(AfferentPresencePlugin())
        bridge?.registerPluginInstance(AfferentEyesPlugin())
        bridge?.registerPluginInstance(AfferentPulsePlugin())
        bridge?.registerPluginInstance(AfferentHapticsPlugin())
        bridge?.registerPluginInstance(AfferentWatchPlugin())
        bridge?.registerPluginInstance(AfferentHealthPlugin())
    }
}
