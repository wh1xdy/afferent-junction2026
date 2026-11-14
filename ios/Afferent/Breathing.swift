import Foundation

/// Breathing rate from TrueDepth head tracking: each breath moves the head/face by a few
/// millimetres (distance to the phone and up/down). Dominant frequency in 4-36 breaths/min
/// over the last 40 s, from whichever axis has the cleaner signal. Weak on its own; the
/// heart-rate rhythm from the finger sensors is preferred when available. Experimental: validate
/// with paced breathing (e.g. 6/min = 5 s in, 5 s out).
enum BreathingMath {
    static let band = (lo: 0.07, hi: 0.6)         // Hz = 4-36 breaths/min (6/min paced breathing is inside)
    static let windowS = 40.0, minWindowS = 25.0

    struct Reading: Equatable { var perMinute: Int; var snr: Double; var amplitudeMM: Double }

    /// samples: (t seconds, distance m, vertical m)
    static func estimate(_ samples: [(t: Double, dist: Double, y: Double)]) -> Reading? {
        guard let tEnd = samples.last?.t else { return nil }
        let w = samples.filter { $0.t >= tEnd - windowS }
        guard let t0 = w.first?.t, tEnd - t0 >= minWindowS, w.count >= 100 else { return nil }
        return [w.map(\.dist), w.map(\.y)].compactMap { spectrumPeak(ts: w.map(\.t), xs: $0) }
            .max { $0.snr < $1.snr }
    }

    static func spectrumPeak(ts: [Double], xs: [Double]) -> Reading? {
        // resample to 10 Hz, remove the linear trend (slowly leaning towards/away from the phone)
        let fs = 10.0
        guard let t0 = ts.first, let t1 = ts.last, t1 > t0, ts.count >= 3 else { return nil }
        var grid: [Double] = []; var x = t0
        while x <= t1 { grid.append(x); x += 1 / fs }
        var y = [Double](repeating: 0, count: grid.count); var j = 0
        for (i, g) in grid.enumerated() {
            while j < ts.count - 2 && ts[j + 1] < g { j += 1 }
            let span = ts[j + 1] - ts[j]
            let a = span > 0 ? min(max((g - ts[j]) / span, 0), 1) : 0
            y[i] = xs[j] + (xs[j + 1] - xs[j]) * a
        }
        // high-pass: subtract a 20 s moving average. A straight-line detrend left the head's slow
        // posture drift (13 mm over 35 s, measured) in the band and won over the 1-2 mm breaths.
        let k = Int(20 * fs)
        var pre = [Double](repeating: 0, count: y.count + 1)
        for i in y.indices { pre[i + 1] = pre[i] + y[i] }
        y = y.indices.map { i in
            let a = max(0, i - k / 2), b = min(y.count, i + k / 2 + 1)
            return y[i] - (pre[b] - pre[a]) / Double(b - a)
        }
        let amp = y.map(abs).sorted()[Int(Double(y.count) * 0.9)] * 2 * 1000      // ~peak-to-peak, mm
        for i in y.indices { y[i] *= 0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(y.count - 1)) }
        var freqs: [Double] = [], power: [Double] = []
        var f = band.lo
        while f <= band.hi {
            var re = 0.0, im = 0.0
            for i in y.indices { let w = 2 * Double.pi * f * Double(i) / fs; re += y[i] * cos(w); im -= y[i] * sin(w) }
            freqs.append(f); power.append(re * re + im * im); f += 0.005
        }
        guard let kmax = power.indices.max(by: { power[$0] < power[$1] }),
              kmax > 1, kmax < power.count - 2 else { return nil }   // peak at the band edge = drift
        let f0 = freqs[kmax]
        var sig = 0.0, rest = 0.0
        for (fi, p) in zip(freqs, power) { if abs(fi - f0) <= 0.03 { sig += p } else { rest += p } }
        return Reading(perMinute: Int((f0 * 60).rounded()), snr: 10 * log10(sig / (rest + 1e-12)), amplitudeMM: amp)
    }
}

/// Which breathing reading to show: the heart-rate rhythm from the finger sensors (UNO Q,
/// sent with a positive signal only) or head motion from TrueDepth when its signal is clear.
enum BreathingSource: String { case heartRhythm = "heart rhythm", headMotion = "head motion" }

func clearestBreathing(finger: Int?, head: BreathingMath.Reading?) -> (perMinute: Int, source: BreathingSource)? {
    if let f = finger, f > 0 { return (f, .heartRhythm) }
    if let h = head, h.snr > 0 { return (h.perMinute, .headMotion) }
    return nil
}
