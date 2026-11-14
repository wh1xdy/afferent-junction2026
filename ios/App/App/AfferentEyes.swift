import ARKit
import Capacitor

@objc(AfferentEyesPlugin)
public class AfferentEyesPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "AfferentEyesPlugin"
    public let jsName = "AfferentEyes"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var session: ARSession?
    private var lastSent: TimeInterval = 0

    @objc func start(_ call: CAPPluginCall) {
        guard ARFaceTrackingConfiguration.isSupported else {
            call.reject("TrueDepth camera not available")
            return
        }
        DispatchQueue.main.async {
            let session = ARSession()
            session.delegate = self
            let config = ARFaceTrackingConfiguration()
            config.isLightEstimationEnabled = true
            session.run(config, options: [.resetTracking, .removeExistingAnchors])
            self.session = session
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.session?.pause()
            self.session = nil
            call.resolve()
        }
    }

    private func pitchDegrees(face: ARFaceAnchor, camera: ARCamera?) -> Double? {
        guard let camera = camera else { return nil }
        let rel = simd_mul(simd_inverse(camera.transform), face.transform)
        let forward = rel.columns.2
        return Double(atan2(-forward.x, forward.z)) * 180.0 / Double.pi
    }

    public func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
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
        notifyListeners("eyes", data: data)
    }
}

class AfferentViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AfferentFingerPlugin())
        bridge?.registerPluginInstance(AfferentEyesPlugin())
    }
}
