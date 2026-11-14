import ARKit

enum FaceUser: Hashable { case eyes, pulse, face }

/// The app's one ARKit face-tracking session. The eyes (game input), the camera pulse and the
/// face measures all read the same frames from this one delegate; nobody else creates an
/// ARSession. It runs while at least one of them holds it and pauses when the last lets go.
///
/// Frames arrive on `frames`, a serial queue that is not the main queue. A sink reads what it
/// needs inside the call and returns: it must not keep the ARFrame, the anchor or the pixel
/// buffer, and must not hop to another queue with them (ARKit stops delivering when frames are
/// held).
final class FaceSession: NSObject, ARSessionDelegate {
    static let shared = FaceSession()
    static var supported: Bool { ARFaceTrackingConfiguration.isSupported }

    typealias FrameSink = (ARFrame, ARFaceAnchor?) -> Void
    typealias AnchorSink = (ARSession, [ARAnchor]) -> Void

    let frames = DispatchQueue(label: "afferent.face.frames", qos: .userInteractive)

    /// Main queue: the session was (re)started or came back from an interruption, so the
    /// camera's exposure and white balance are automatic again.
    var onRun: (() -> Void)?

    private static let retryS = 1.0
    private static let maxRetries = 3

    private let lock = NSLock()
    private var frameSinks: [FaceUser: FrameSink] = [:]
    private var anchorSinks: [FaceUser: AnchorSink] = [:]
    private var delivered = false

    private var session: ARSession?
    private var users = Set<FaceUser>()
    private var failures = 0

    /// Main queue.
    var running: Bool { !users.isEmpty }

    /// Main queue.
    func holds(_ user: FaceUser) -> Bool { users.contains(user) }

    /// Main queue. Holding twice replaces the sinks.
    func hold(_ user: FaceUser, frames: FrameSink? = nil, anchors: AnchorSink? = nil) {
        lock.lock()
        frameSinks[user] = frames
        anchorSinks[user] = anchors
        lock.unlock()
        let first = users.isEmpty
        users.insert(user)
        if first { failures = 0; run() }
    }

    /// Main queue.
    func release(_ user: FaceUser) {
        lock.lock()
        frameSinks[user] = nil
        anchorSinks[user] = nil
        lock.unlock()
        guard users.remove(user) != nil, users.isEmpty else { return }
        session?.pause()
    }

    private func run() {
        let s = session ?? ARSession()
        if session == nil {
            s.delegate = self
            s.delegateQueue = frames
            session = s
        }
        let config = ARFaceTrackingConfiguration()
        config.isLightEstimationEnabled = true
        config.maximumNumberOfTrackedFaces = 1
        lock.lock()
        delivered = false
        lock.unlock()
        s.run(config, options: [.resetTracking, .removeExistingAnchors])
        onRun?()
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        lock.lock()
        let sinks = Array(frameSinks.values)
        let firstFrame = !delivered
        delivered = true
        lock.unlock()
        if firstFrame { DispatchQueue.main.async { self.failures = 0 } }
        guard !sinks.isEmpty else { return }
        let face = frame.anchors.lazy.compactMap { $0 as? ARFaceAnchor }.first
        for sink in sinks { sink(frame, face) }
    }

    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        lock.lock()
        let sinks = Array(anchorSinks.values)
        lock.unlock()
        for sink in sinks { sink(session, anchors) }
    }

    func sessionInterruptionEnded(_ session: ARSession) {
        DispatchQueue.main.async {
            guard self.running else { return }
            self.onRun?()
        }
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            guard self.running, self.failures < Self.maxRetries else { return }
            self.failures += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.retryS) {
                if self.running { self.run() }
            }
        }
    }
}
