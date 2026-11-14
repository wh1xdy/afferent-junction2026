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
            session.run(ARFaceTrackingConfiguration(), options: [.resetTracking, .removeExistingAnchors])
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

    public func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        guard let face = anchors.compactMap({ $0 as? ARFaceAnchor }).first else { return }
        let now = CACurrentMediaTime()
        guard now - lastSent >= 1.0 / 30.0 else { return }
        lastSent = now
        notifyListeners("eyes", data: [
            "blink_l": face.blendShapes[.eyeBlinkLeft]?.doubleValue ?? 0,
            "blink_r": face.blendShapes[.eyeBlinkRight]?.doubleValue ?? 0,
            "tracked": face.isTracked,
            "t": now,
        ])
    }
}

class AfferentViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AfferentEyesPlugin())
    }
}
