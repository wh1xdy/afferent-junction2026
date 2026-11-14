import Foundation

/// Breathing rate from TrueDepth head tracking: each breath moves the head/face by a few
/// millimetres (distance to the phone and up/down). Dominant frequency in 6-36 breaths/min
/// over the last 30 s, from whichever axis has the cleaner signal. Experimental: validate
/// with paced breathing (e.g. 6/min = 5 s in, 5 s out).
enum BreathingMath {
    static let band = (lo: 0.1, hi: 0.6)          // Hz = 6-36 breaths/min
    static let windowS = 30.0, minWindowS = 20.0

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
        let n = Double(y.count)
        let mt = grid.reduce(0, +) / n, my = y.reduce(0, +) / n
        let vt = grid.reduce(0) { $0 + ($1 - mt) * ($1 - mt) }
        let slope = zip(grid, y).reduce(0) { $0 + ($1.0 - mt) * ($1.1 - my) } / max(vt, 1e-9)
        for i in y.indices { y[i] -= my + slope * (grid[i] - mt) }
        let amp = y.map(abs).sorted()[Int(Double(y.count) * 0.9)] * 2 * 1000      // ~peak-to-peak, mm
        for i in y.indices { y[i] *= 0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(y.count - 1)) }
        var freqs: [Double] = [], power: [Double] = []
        var f = band.lo
        while f <= band.hi {
            var re = 0.0, im = 0.0
            for i in y.indices { let w = 2 * Double.pi * f * Double(i) / fs; re += y[i] * cos(w); im -= y[i] * sin(w) }
            freqs.append(f); power.append(re * re + im * im); f += 0.005
        }
        guard let k = power.indices.max(by: { power[$0] < power[$1] }) else { return nil }
        let f0 = freqs[k]
        var sig = 0.0, rest = 0.0
        for (fi, p) in zip(freqs, power) { if abs(fi - f0) <= 0.03 { sig += p } else { rest += p } }
        return Reading(perMinute: Int((f0 * 60).rounded()), snr: 10 * log10(sig / (rest + 1e-12)), amplitudeMM: amp)
    }
}
