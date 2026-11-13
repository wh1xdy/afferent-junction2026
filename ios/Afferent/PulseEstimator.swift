import Foundation

/// Remote PPG maths, ported 1:1 from the Jetson (jetson/vision/rppg.py), validated there
/// against a finger PulseSensor (mean abs. difference 1.8 BPM).
///
/// POS (Wang et al. 2017, "Algorithmic Principles of Remote PPG") on face-region RGB means,
/// dominant frequency in 45-180 BPM, and a single-camera trust score: forehead and both
/// cheeks are three independent measurements of the same pulse.
struct PulseSample {
    var t: Double                    // seconds
    var rgb: SIMD3<Double>           // all regions, skin-filtered mean
    var cx: Double, cy: Double, d: Double   // point between the eyes, eye distance (px)
    var regions: [SIMD3<Double>?]    // forehead, cheek, cheek
}

struct Trust: Equatable {
    enum Label: String { case reliable, uncertain, unreliable }
    var score: Int
    var label: Label
    var reasons: [String]
}

struct PulseReading: Equatable {
    var bpm: Int
    var snr: Double
    var regionsBpm: [Int?]
    var motion: Double
    var trust: Trust
    var windowSeconds: Double
}

enum PulseMath {
    static let sampleHz = 20.0
    static let windowS = 10.0
    static let minWindowS = 6.0
    static let band = (lo: 0.75, hi: 3.0)

    /// POS on unevenly sampled RGB means -> (f0 Hz, SNR dB)
    static func pos(ts: [Double], rgb: [SIMD3<Double>]) -> (f0: Double, snr: Double)? {
        guard ts.count >= 20, let t0 = ts.first, let t1 = ts.last, t1 > t0 else { return nil }
        // uniform resampling
        var grid: [Double] = []
        var x = t0
        while x < t1 { grid.append(x); x += 1 / sampleHz }
        var c = [SIMD3<Double>](repeating: .zero, count: grid.count)
        var j = 0
        for (i, g) in grid.enumerated() {
            while j < ts.count - 2 && ts[j + 1] < g { j += 1 }
            let span = ts[j + 1] - ts[j]
            let a = span > 0 ? min(max((g - ts[j]) / span, 0), 1) : 0
            c[i] = rgb[j] + (rgb[j + 1] - rgb[j]) * a
        }
        let n = c.count
        let L = Int(1.6 * sampleHz)
        guard n > L else { return nil }
        var h = [Double](repeating: 0, count: n)
        for i in 0...(n - L) {
            var mean = SIMD3<Double>.zero
            for k in i..<(i + L) { mean += c[k] }
            mean /= Double(L)
            var s0 = [Double](repeating: 0, count: L), s1 = s0
            for k in 0..<L {
                let cn = c[i + k] / (mean + 1e-9)          // temporal normalisation
                s0[k] = cn.y - cn.z                          // P = [[0,1,-1],[-2,1,1]]
                s1[k] = -2 * cn.x + cn.y + cn.z
            }
            let a = std(s0) / (std(s1) + 1e-9)
            var hh = (0..<L).map { s0[$0] + a * s1[$0] }
            let m = hh.reduce(0, +) / Double(L)
            for k in 0..<L { hh[k] -= m; h[i + k] += hh[k] }
        }
        // detrend: 1 s moving average (numpy convolve "same", zero-padded edges)
        let k = Int(sampleHz)
        var trend = [Double](repeating: 0, count: n)
        for i in 0..<n {
            var s = 0.0
            for q in (i - k / 2)..<(i - k / 2 + k) where q >= 0 && q < n { s += h[q] }
            trend[i] = s / Double(k)
        }
        var y = (0..<n).map { h[$0] - trend[$0] }
        let ym = y.reduce(0, +) / Double(n)
        for i in 0..<n {
            let w = 0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(n - 1))   // Hann
            y[i] = (y[i] - ym) * w
        }
        // band power by direct DFT on a 0.005 Hz grid (same as zero-padded FFT)
        var freqs: [Double] = [], power: [Double] = []
        var f = band.lo
        while f <= band.hi {
            var re = 0.0, im = 0.0
            let w = 2 * Double.pi * f / sampleHz
            for i in 0..<n { re += y[i] * cos(w * Double(i)); im -= y[i] * sin(w * Double(i)) }
            freqs.append(f); power.append(re * re + im * im)
            f += 0.005
        }
        guard let kMax = power.indices.max(by: { power[$0] < power[$1] }) else { return nil }
        let f0 = freqs[kMax]
        var sig = 0.0, rest = 0.0
        for (fi, p) in zip(freqs, power) {
            if abs(fi - f0) <= 0.1 || abs(fi - 2 * f0) <= 0.1 { sig += p } else { rest += p }
        }
        return (f0, 10 * log10(sig / (rest + 1e-12)))
    }

    static func trust(snr: Double, regionsBpm: [Int?], bpm: Int, history: [Int],
                      motion: Double, luma: Double, clipped: Double) -> Trust {
        var reasons: [String] = []
        let sig = min(max((snr + 2) / 8, 0), 1)
        if sig < 0.5 { reasons.append("weak pulse signal") }
        let valid = regionsBpm.compactMap { $0 }
        let agree = valid.filter { abs($0 - bpm) <= 6 }.count
        let reg = valid.isEmpty ? 0 : Double(agree) / Double(valid.count)
        if agree * 3 < 2 * valid.count { reasons.append("face regions disagree (\(agree)/\(valid.count))") }
        var stab = 0.3
        if history.count >= 3 {
            let spread = std(history.suffix(5).map(Double.init))
            stab = min(max(1 - spread / 8, 0), 1)
            if stab < 0.5 { reasons.append("reading jumping (±\(Int(spread.rounded())) BPM)") }
        } else {
            reasons.append("still settling")
        }
        let still = min(max(1 - motion / 0.15, 0), 1)
        if still < 0.5 { reasons.append("head moving") }
        var expo = 1.0
        if clipped > 0.05 || luma > 215 { expo = 0.5; reasons.append("face overexposed") }
        else if luma < 50 { expo = 0.5; reasons.append("face too dark") }
        let score = Int((100 * expo * (0.30 * sig + 0.30 * reg + 0.20 * stab + 0.20 * still)).rounded())
        let label: Trust.Label = score >= 70 ? .reliable : score >= 40 ? .uncertain : .unreliable
        return Trust(score: score, label: label, reasons: reasons)
    }

    static func estimate(samples: [PulseSample], history: [Int], luma: Double, clipped: Double) -> PulseReading? {
        guard let tEnd = samples.last?.t else { return nil }
        let win = samples.filter { $0.t >= tEnd - windowS }
        guard let tStart = win.first?.t, tEnd - tStart >= minWindowS else { return nil }
        let ts = win.map(\.t)
        guard let main = pos(ts: ts, rgb: win.map(\.rgb)) else { return nil }
        let bpm = Int((main.f0 * 60).rounded())
        var regionsBpm: [Int?] = []
        for r in 0..<3 {
            let series = win.map { $0.regions.count > r ? $0.regions[r] : nil }
            if series.contains(where: { $0 == nil }) { regionsBpm.append(nil); continue }
            regionsBpm.append(pos(ts: ts, rgb: series.map { $0! }).map { Int(($0.f0 * 60).rounded()) })
        }
        let ds = win.map(\.d)
        let motion = sqrt(variance(win.map(\.cx)) + variance(win.map(\.cy))) / max(ds.reduce(0, +) / Double(ds.count), 1)
        let tr = trust(snr: main.snr, regionsBpm: regionsBpm, bpm: bpm, history: history + [bpm],
                       motion: motion, luma: luma, clipped: clipped)
        return PulseReading(bpm: bpm, snr: main.snr, regionsBpm: regionsBpm, motion: motion,
                            trust: tr, windowSeconds: tEnd - tStart)
    }

    static func variance(_ v: [Double]) -> Double {
        guard !v.isEmpty else { return 0 }
        let m = v.reduce(0, +) / Double(v.count)
        return v.reduce(0) { $0 + ($1 - m) * ($1 - m) } / Double(v.count)
    }

    static func std(_ v: [Double]) -> Double { sqrt(variance(v)) }
}
