import AVFoundation
import Vision
import UIKit

/// Front camera -> Vision face landmarks -> skin RGB of forehead + cheeks at 20 Hz
/// -> PulseMath every second. Mirrors jetson/vision/rppg.py.
final class PulseCamera: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    enum State: Equatable { case idle, noPermission, noCamera, running }

    @Published var state: State = .idle
    @Published var faceFound = false
    @Published var reading: PulseReading?
    @Published var windowSeconds: Double = 0
    @Published var locked = false

    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "pulse.camera")
    private var device: AVCaptureDevice?

    private var samples: [PulseSample] = []
    private var history: [Int] = []
    private var face: (cx: Double, cy: Double, d: Double)?
    private var faceT = 0.0, faceSeen = 0.0, lastSample = 0.0, lastEstimate = 0.0
    private var luma = 128.0, clipped = 0.0

    // ── setup ───────────────────────────────────────────────────────────
    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: configure()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in
                DispatchQueue.main.async { ok ? self.configure() : (self.state = .noPermission) }
            }
        default: state = .noPermission
        }
    }

    func stop() { queue.async { self.session.stopRunning() } }

    private func configure() {
        queue.async {
            guard let dev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
                  let input = try? AVCaptureDeviceInput(device: dev) else {
                DispatchQueue.main.async { self.state = .noCamera }
                return
            }
            self.device = dev
            self.session.beginConfiguration()
            self.session.sessionPreset = .hd1280x720
            if self.session.canAddInput(input) { self.session.addInput(input) }
            let out = AVCaptureVideoDataOutput()
            out.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            out.alwaysDiscardsLateVideoFrames = true
            out.setSampleBufferDelegate(self, queue: self.queue)
            if self.session.canAddOutput(out) { self.session.addOutput(out) }
            if let conn = out.connection(with: .video), conn.isVideoRotationAngleSupported(90) {
                conn.videoRotationAngle = 90          // upright portrait buffers
            }
            self.session.commitConfiguration()
            try? dev.lockForConfiguration()
            dev.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 30)
            dev.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 30)
            dev.unlockForConfiguration()
            self.session.startRunning()
            DispatchQueue.main.async { self.state = .running }
            self.lockExposureSoon()
        }
    }

    /// Every auto-adjustment changes skin colour far more than a heartbeat: let auto exposure
    /// settle on the face for 2.5 s, then lock exposure, white balance and focus.
    func lockExposureSoon() {
        DispatchQueue.main.async { self.locked = false }
        queue.async {
            guard let dev = self.device else { return }
            try? dev.lockForConfiguration()
            if dev.isExposureModeSupported(.continuousAutoExposure) { dev.exposureMode = .continuousAutoExposure }
            if dev.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) { dev.whiteBalanceMode = .continuousAutoWhiteBalance }
            dev.unlockForConfiguration()
        }
        queue.asyncAfter(deadline: .now() + 2.5) {
            guard let dev = self.device else { return }
            try? dev.lockForConfiguration()
            if dev.isExposureModeSupported(.locked) { dev.exposureMode = .locked }
            if dev.isWhiteBalanceModeSupported(.locked) { dev.whiteBalanceMode = .locked }
            if dev.isFocusModeSupported(.locked) { dev.focusMode = .locked }
            dev.unlockForConfiguration()
            self.samples.removeAll(); self.history.removeAll()
            DispatchQueue.main.async { self.locked = true; self.reading = nil }
        }
    }

    // ── per frame ───────────────────────────────────────────────────────
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let t = CACurrentMediaTime()
        if face == nil || t - faceT > 0.25 {
            faceT = t
            locateFace(pb, t)
        }
        if t - lastSample >= 1 / PulseMath.sampleHz, let f = face {
            lastSample = t
            sample(pb, f, t)
        }
        if t - lastEstimate >= 1 {
            lastEstimate = t
            estimate()
        }
    }

    private func locateFace(_ pb: CVPixelBuffer, _ t: Double) {
        let req = VNDetectFaceLandmarksRequest()
        try? VNImageRequestHandler(cvPixelBuffer: pb, orientation: .up).perform([req])
        let W = Double(CVPixelBufferGetWidth(pb)), H = Double(CVPixelBufferGetHeight(pb))
        let best = (req.results ?? []).max { $0.boundingBox.width < $1.boundingBox.width }
        if let obs = best, let le = obs.landmarks?.leftEye, let re = obs.landmarks?.rightEye {
            let size = CGSize(width: W, height: H)
            func center(_ r: VNFaceLandmarkRegion2D) -> (Double, Double) {
                let p = r.pointsInImage(imageSize: size)
                let x = p.map { Double($0.x) }.reduce(0, +) / Double(p.count)
                let y = p.map { Double($0.y) }.reduce(0, +) / Double(p.count)
                return (x, H - y)                       // Vision is bottom-left origin
            }
            let (lx, ly) = center(le), (rx, ry) = center(re)
            var f = ((lx + rx) / 2, (ly + ry) / 2, hypot(lx - rx, ly - ry))
            if f.2 >= 20 {
                if let p = face {                       // smooth so ROI jitter doesn't modulate the signal
                    f = (p.cx + 0.3 * (f.0 - p.cx), p.cy + 0.3 * (f.1 - p.cy), p.d + 0.3 * (f.2 - p.d))
                }
                face = (f.0, f.1, f.2); faceSeen = t
            }
        } else if t - faceSeen > 2 {
            face = nil
            samples.removeAll()
        }
        let found = face != nil
        DispatchQueue.main.async { if self.faceFound != found { self.faceFound = found } }
    }

    /// forehead + two cheeks, skin filter by luma percentiles (works under any light colour)
    private func sample(_ pb: CVPixelBuffer, _ f: (cx: Double, cy: Double, d: Double), _ t: Double) {
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pb)?.assumingMemoryBound(to: UInt8.self) else { return }
        let W = CVPixelBufferGetWidth(pb), H = CVPixelBufferGetHeight(pb), stride = CVPixelBufferGetBytesPerRow(pb)
        let boxes: [(Double, Double, Double, Double)] = [(-0.55, -1.10, 0.55, -0.45),
                                                         (-0.95, 0.35, -0.35, 0.95),
                                                         (0.35, 0.35, 0.95, 0.95)]
        var px: [[(Double, Double, Double, Double)]] = []   // per region: (r, g, b, luma)
        var hist = [Int](repeating: 0, count: 256)
        var nClip = 0, nAll = 0
        for (x0, y0, x1, y1) in boxes {
            let a = max(0, Int(f.cx + x0 * f.d)), b = min(W, Int(f.cx + x1 * f.d))
            let c = max(0, Int(f.cy + y0 * f.d)), e = min(H, Int(f.cy + y1 * f.d))
            var reg: [(Double, Double, Double, Double)] = []
            if b > a && e > c {
                for y in Swift.stride(from: c, to: e, by: 2) {
                    let row = base + y * stride
                    for x in Swift.stride(from: a, to: b, by: 2) {
                        let p = row + x * 4
                        let bb = Double(p[0]), gg = Double(p[1]), rr = Double(p[2])
                        let l = 0.299 * rr + 0.587 * gg + 0.114 * bb
                        reg.append((rr, gg, bb, l))
                        hist[min(255, Int(l))] += 1
                        nAll += 1
                        if max(rr, gg, bb) >= 250 { nClip += 1 }
                    }
                }
            }
            px.append(reg)
        }
        guard nAll > 50 else { return }
        func percentile(_ q: Double) -> Double {
            var acc = 0
            let target = Int(q * Double(nAll))
            for (i, n) in hist.enumerated() { acc += n; if acc >= target { return Double(i) } }
            return 255
        }
        let lo = percentile(0.15), hi = percentile(0.95)
        var all = SIMD3<Double>.zero, nKept = 0, lumaSum = 0.0
        var regions: [SIMD3<Double>?] = []
        for reg in px {
            var s = SIMD3<Double>.zero, n = 0
            for (r, g, b, l) in reg {
                lumaSum += l
                if l >= lo && l <= hi && max(r, g, b) < 250 { s += SIMD3(r, g, b); n += 1 }
            }
            all += s; nKept += n
            regions.append(n > 30 ? s / Double(n) : nil)
        }
        guard nKept > 50 else { return }
        luma = lumaSum / Double(nAll)
        clipped = Double(nClip) / Double(nAll)
        samples.append(PulseSample(t: t, rgb: all / Double(nKept), cx: f.cx, cy: f.cy, d: f.d, regions: regions))
        if samples.count > 400 { samples.removeFirst(samples.count - 400) }
    }

    private func estimate() {
        let span = (samples.last?.t ?? 0) - (samples.first?.t ?? 0)
        let r = PulseMath.estimate(samples: samples, history: history, luma: luma, clipped: clipped)
        if let r { history.append(r.bpm); if history.count > 8 { history.removeFirst() } }
        DispatchQueue.main.async {
            self.windowSeconds = min(span, PulseMath.windowS)
            self.reading = self.faceFound ? r : nil
        }
    }
}
