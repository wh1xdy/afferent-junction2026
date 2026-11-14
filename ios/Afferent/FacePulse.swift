import ARKit

/// Camera pulse inside the ARKit face-tracking session: forehead + cheek skin sampled at
/// points on the 3D face mesh (so the regions stay on the same skin when the head turns),
/// from ARKit's own camera frames at 20 Hz, then the same PulseMath as the Pulse tab.
final class FacePulse {
    private(set) var regionVertices: [[Int]] = []      // forehead, cheek L, cheek R (mesh indices)
    private var samples: [PulseSample] = []
    private var history: [Int] = []
    private var lastSample = 0.0
    private(set) var luma = 128.0, clipped = 0.0
    /// frame time of the newest sample in the buffer: estimate() only describes the present while this is recent
    private(set) var lastAppended = 0.0

    func reset() { samples.removeAll(); history.removeAll() }

    func prepare(_ g: ARFaceGeometry) { if regionVertices.isEmpty { selectRegions(g) } }

    /// pick mesh vertices once (face frame, metres: +y up, +z out of the face)
    private func selectRegions(_ g: ARFaceGeometry) {
        func pick(_ ok: (SIMD3<Float>) -> Bool) -> [Int] { g.vertices.indices.filter { ok(g.vertices[$0]) } }
        let forehead = pick { $0.y > 0.035 && $0.y < 0.07 && abs($0.x) < 0.035 && $0.z > 0.015 }
        let cheekL = pick { $0.y > -0.03 && $0.y < 0.005 && $0.x > 0.028 && $0.x < 0.055 && $0.z > 0.0 }
        let cheekR = pick { $0.y > -0.03 && $0.y < 0.005 && $0.x < -0.028 && $0.x > -0.055 && $0.z > 0.0 }
        regionVertices = [forehead, cheekL, cheekR]
    }

    func feed(frame: ARFrame, face: ARFaceAnchor) {
        let t = frame.timestamp
        guard t - lastSample >= 1 / PulseMath.sampleHz, face.isTracked else { return }
        lastSample = t
        if regionVertices.isEmpty { selectRegions(face.geometry) }
        let pb = frame.capturedImage
        guard CVPixelBufferGetPlaneCount(pb) >= 2 else { return }
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        let W = CVPixelBufferGetWidthOfPlane(pb, 0), H = CVPixelBufferGetHeightOfPlane(pb, 0)
        guard let yBase = CVPixelBufferGetBaseAddressOfPlane(pb, 0)?.assumingMemoryBound(to: UInt8.self),
              let cBase = CVPixelBufferGetBaseAddressOfPlane(pb, 1)?.assumingMemoryBound(to: UInt8.self) else { return }
        let yStride = CVPixelBufferGetBytesPerRowOfPlane(pb, 0), cStride = CVPixelBufferGetBytesPerRowOfPlane(pb, 1)
        let size = CGSize(width: W, height: H)

        var regions: [SIMD3<Double>?] = []
        var all = SIMD3<Double>.zero, nAll = 0, lumaSum = 0.0, nClip = 0, nPix = 0
        var centers: [CGPoint] = []
        let verts = face.geometry.vertices
        for idxs in regionVertices {
            var s = SIMD3<Double>.zero, n = 0, cx = 0.0, cy = 0.0, nc = 0
            for i in idxs where i < verts.count {
                let world = face.transform * SIMD4<Float>(verts[i], 1)
                // capturedImage is in sensor (landscape) orientation
                let p = frame.camera.projectPoint(simd_make_float3(world), orientation: .landscapeRight, viewportSize: size)
                let px = Int(p.x), py = Int(p.y)
                guard px >= 1, py >= 1, px < W - 1, py < H - 1 else { continue }
                cx += Double(px); cy += Double(py); nc += 1
                for dy in -1...1 { for dx in -1...1 {           // 3x3 patch around each vertex
                    let x = px + dx, y = py + dy
                    let Y = Double(yBase[y * yStride + x])
                    let cb = Double(cBase[(y / 2) * cStride + (x / 2) * 2]) - 128
                    let cr = Double(cBase[(y / 2) * cStride + (x / 2) * 2 + 1]) - 128
                    lumaSum += Y; nPix += 1
                    if Y >= 250 { nClip += 1; continue }
                    s += SIMD3(Y + 1.402 * cr, Y - 0.344 * cb - 0.714 * cr, Y + 1.772 * cb)   // full-range YCbCr -> RGB
                    n += 1
                } }
            }
            regions.append(n > 20 ? s / Double(n) : nil)
            all += s; nAll += n
            centers.append(nc > 0 ? CGPoint(x: cx / Double(nc), y: cy / Double(nc)) : .zero)
        }
        // before the guard: a fully clipped face gives no sample, and that has to show as overexposed
        if nPix > 0 { luma = lumaSum / Double(nPix); clipped = Double(nClip) / Double(nPix) }
        guard nAll > 50, centers.count == 3 else { return }
        let d = hypot(Double(centers[1].x - centers[2].x), Double(centers[1].y - centers[2].y))
        samples.append(PulseSample(t: t, rgb: all / Double(nAll), cx: Double(centers[0].x), cy: Double(centers[0].y),
                                   d: max(d, 1), regions: regions))
        lastAppended = t
        if samples.count > 400 { samples.removeFirst(samples.count - 400) }
    }

    func estimate() -> PulseReading? {
        let r = PulseMath.estimate(samples: samples, history: history, luma: luma, clipped: clipped)
        if let r { history.append(r.bpm); if history.count > 8 { history.removeFirst() } }
        return r
    }
}
