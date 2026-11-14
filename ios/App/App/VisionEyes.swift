import AVFoundation
import Vision

struct EyesReading {
    var tracked: Bool
    var openness: Double = 1
    var blinkL: Double = 0
    var blinkR: Double = 0
    var pitchDeg: Double?
    var faceLuma: Double?
    var t: Double
}

struct LightReading {
    var faceLuma: Double
    var iso: Double
    var exposureMs: Double
    var level: String
}

final class EyeOpenness {
    private var refs: [Double] = []
    private var lastRefT = 0.0

    func openness(ear: Double, t: Double) -> Double {
        if t - lastRefT >= 0.2 {
            lastRefT = t
            refs.append(ear)
            if refs.count > 300 { refs.removeFirst(refs.count - 300) }
        }
        let s = refs.sorted()
        let open = s.count >= 10 ? s[Int(Double(s.count - 1) * 0.8)] : max(ear, 0.25)
        let rel = ear / max(open, 1e-3)
        return min(max((rel - 0.3) / 0.6, 0), 1)
    }

    static func aspect(_ p: [CGPoint]) -> Double? {
        guard p.count >= 4 else { return nil }
        var a = p[0], b = p[1], best = -1.0
        for i in p.indices { for j in p.indices where j > i {
            let d = hypot(p[i].x - p[j].x, p[i].y - p[j].y)
            if d > best { best = d; a = p[i]; b = p[j] }
        } }
        guard best > 1 else { return nil }
        let ux = (b.x - a.x) / best, uy = (b.y - a.y) / best
        let side = p.map { ($0.x - a.x) * -uy + ($0.y - a.y) * ux }
        return Double((side.max() ?? 0) - (side.min() ?? 0)) / best
    }
}

final class PulseFrameTap: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let camera: PulseCamera
    private let queue = DispatchQueue(label: "pulse.eyes")
    private let lock = NSLock()
    private var busy = false
    private let left = EyeOpenness(), right = EyeOpenness()
    private var lastLight = 0.0
    private var device: AVCaptureDevice?
    var onEyes: ((EyesReading) -> Void)?
    var onLight: ((LightReading) -> Void)?

    init(camera: PulseCamera) { self.camera = camera }

    @discardableResult
    func install() -> Bool {
        guard let out = camera.session.outputs.compactMap({ $0 as? AVCaptureVideoDataOutput }).first,
              let q = out.sampleBufferCallbackQueue else { return false }
        device = camera.session.inputs.compactMap { ($0 as? AVCaptureDeviceInput)?.device }.first
        out.setSampleBufferDelegate(self, queue: q)
        return true
    }

    func uninstall() {
        camera.session.outputs.compactMap { $0 as? AVCaptureVideoDataOutput }.forEach { $0.setSampleBufferDelegate(nil, queue: nil) }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        camera.captureOutput(output, didOutput: sampleBuffer, from: connection)
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lock.lock()
        if busy { lock.unlock(); return }
        busy = true
        lock.unlock()
        let t = CACurrentMediaTime()
        queue.async {
            self.process(pb, t)
            self.lock.lock(); self.busy = false; self.lock.unlock()
        }
    }

    private func process(_ pb: CVPixelBuffer, _ t: Double) {
        let req = VNDetectFaceLandmarksRequest()
        try? VNImageRequestHandler(cvPixelBuffer: pb, orientation: .up).perform([req])
        let size = CGSize(width: CVPixelBufferGetWidth(pb), height: CVPixelBufferGetHeight(pb))
        guard let obs = (req.results ?? []).max(by: { $0.boundingBox.width < $1.boundingBox.width }),
              let le = obs.landmarks?.leftEye, let re = obs.landmarks?.rightEye,
              let earL = EyeOpenness.aspect(le.pointsInImage(imageSize: size)),
              let earR = EyeOpenness.aspect(re.pointsInImage(imageSize: size)) else {
            onEyes?(EyesReading(tracked: false, t: t))
            return
        }
        let oL = left.openness(ear: earL, t: t), oR = right.openness(ear: earR, t: t)
        let luma = Self.luma(pb, obs.boundingBox)
        let pitch = obs.pitch.map { -$0.doubleValue * 180 / .pi }
        onEyes?(EyesReading(tracked: true, openness: (oL + oR) / 2, blinkL: 1 - oL, blinkR: 1 - oR,
                            pitchDeg: pitch, faceLuma: luma.map { $0 / 255 }, t: t))
        if let luma, t - lastLight >= 0.5, let dev = device {
            lastLight = t
            let level = luma < 50 ? "dark" : luma > 215 ? "bright" : "ok"
            onLight?(LightReading(faceLuma: luma / 255, iso: Double(dev.iso),
                                  exposureMs: dev.exposureDuration.seconds * 1000, level: level))
        }
    }

    static func luma(_ pb: CVPixelBuffer, _ box: CGRect) -> Double? {
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard CVPixelBufferGetPixelFormatType(pb) == kCVPixelFormatType_32BGRA,
              let base = CVPixelBufferGetBaseAddress(pb)?.assumingMemoryBound(to: UInt8.self) else { return nil }
        let W = CVPixelBufferGetWidth(pb), H = CVPixelBufferGetHeight(pb), row = CVPixelBufferGetBytesPerRow(pb)
        let x0 = max(0, Int(box.minX * CGFloat(W))), x1 = min(W, Int(box.maxX * CGFloat(W)))
        let y0 = max(0, Int((1 - box.maxY) * CGFloat(H))), y1 = min(H, Int((1 - box.minY) * CGFloat(H)))
        guard x1 > x0, y1 > y0 else { return nil }
        var sum = 0.0, n = 0
        for y in stride(from: y0, to: y1, by: 6) {
            let r = base + y * row
            for x in stride(from: x0, to: x1, by: 6) {
                let p = r + x * 4
                sum += 0.299 * Double(p[2]) + 0.587 * Double(p[1]) + 0.114 * Double(p[0])
                n += 1
            }
        }
        return n > 0 ? sum / Double(n) : nil
    }
}
