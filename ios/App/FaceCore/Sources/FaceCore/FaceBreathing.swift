import Foundation

/// Breathing rate from TrueDepth head tracking, ported from the reference (ios/Afferent/Breathing.swift,
/// BreathingMath): each breath moves the head by a millimetre or two (distance to the phone, and
/// up/down). Dominant frequency in 4 to 36 breaths per minute over the last 40 s, from whichever
/// axis has the cleaner peak. Weak on its own; a value is only given when the peak is clear.
public enum FaceBreathing {

    public struct Reading: Equatable {
        public var perMinute: Double
        public var snrDb: Double
        public var amplitudeMM: Double
    }

    /// ts: seconds, ascending. dist: distance to the phone (m). y: vertical position (m).
    /// The reference's `estimate`: the last 40 s, at least 25 s and 100 samples, the axis with
    /// the higher signal-to-noise ratio.
    public static func estimate(ts: [Double], dist: [Double], y: [Double]) -> Reading? {
        guard let tEnd = ts.last, ts.count == dist.count, ts.count == y.count else { return nil }
        var first = 0
        while first < ts.count && ts[first] < tEnd - FaceTuning.breathingWindowS { first += 1 }
        let n = ts.count - first
        guard n >= FaceTuning.breathingMinSamples, tEnd - ts[first] >= FaceTuning.breathingMinWindowS else { return nil }
        let w = Array(ts[first...])
        let a = spectrumPeak(ts: w, xs: Array(dist[first...]))
        let b = spectrumPeak(ts: w, xs: Array(y[first...]))
        switch (a, b) {
        case let (a?, b?): return b.snrDb > a.snrDb ? b : a
        case let (a?, nil): return a
        case let (nil, b?): return b
        default: return nil
        }
    }

    /// The reference's `spectrumPeak`, step for step.
    static func spectrumPeak(ts: [Double], xs: [Double]) -> Reading? {
        let fs = FaceTuning.breathingResampleHz
        guard let t0 = ts.first, let t1 = ts.last, t1 > t0, ts.count >= 3 else { return nil }
        // resample to 10 Hz
        var grid: [Double] = []
        grid.reserveCapacity(Int((t1 - t0) * fs) + 2)
        var x = t0
        while x <= t1 { grid.append(x); x += 1 / fs }
        var y = [Double](repeating: 0, count: grid.count)
        var j = 0
        for (i, g) in grid.enumerated() {
            while j < ts.count - 2 && ts[j + 1] < g { j += 1 }
            let span = ts[j + 1] - ts[j]
            let a = span > 0 ? min(max((g - ts[j]) / span, 0), 1) : 0
            y[i] = xs[j] + (xs[j + 1] - xs[j]) * a
        }
        guard y.count >= 3 else { return nil }
        // high-pass: subtract a 20 s moving average (slow posture drift)
        let k = Int(FaceTuning.breathingHighPassS * fs)
        var pre = [Double](repeating: 0, count: y.count + 1)
        for i in y.indices { pre[i + 1] = pre[i] + y[i] }
        y = y.indices.map { i in
            let a = max(0, i - k / 2), b = min(y.count, i + k / 2 + 1)
            return y[i] - (pre[b] - pre[a]) / Double(b - a)
        }
        let amp = y.map(abs).sorted()[Int(Double(y.count) * 0.9)] * 2 * 1000      // ~peak-to-peak, mm
        for i in y.indices { y[i] *= 0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(y.count - 1)) }
        var freqs: [Double] = [], power: [Double] = []
        var f = FaceTuning.breathingBandHz.lo
        while f <= FaceTuning.breathingBandHz.hi {
            var re = 0.0, im = 0.0
            let w = 2 * Double.pi * f / fs
            for i in y.indices { re += y[i] * cos(w * Double(i)); im -= y[i] * sin(w * Double(i)) }
            freqs.append(f); power.append(re * re + im * im); f += FaceTuning.breathingGridHz
        }
        guard let kmax = power.indices.max(by: { power[$0] < power[$1] }),
              kmax > 1, kmax < power.count - 2 else { return nil }   // peak at the band edge = drift
        let f0 = freqs[kmax]
        var sig = 0.0, rest = 0.0
        for (fi, p) in zip(freqs, power) {
            if abs(fi - f0) <= FaceTuning.breathingPeakHalfWidthHz { sig += p } else { rest += p }
        }
        let snr = 10 * log10(sig / (rest + 1e-12))
        guard snr.isFinite else { return nil }
        return Reading(perMinute: f0 * 60, snrDb: snr, amplitudeMM: amp)
    }
}

/// The head samples of the last 70 s and the rule for when a breathing value is clear.
struct FaceBreathingTracker {
    private let capacity = FaceTuning.breathingSampleCapacity
    private var ts: [Double], dist: [Double], ys: [Double]
    private var head = 0
    private var count = 0
    private var windowT: [Double] = [], windowDist: [Double] = [], windowY: [Double] = []
    private var recent: [FaceBreathing.Reading?] = []

    init() {
        ts = [Double](repeating: 0, count: capacity)
        dist = ts
        ys = ts
        let n = Int(FaceTuning.breathingWindowS * 60) + 60
        windowT.reserveCapacity(n)
        windowDist.reserveCapacity(n)
        windowY.reserveCapacity(n)
        recent.reserveCapacity(FaceTuning.breathingStableEstimates + 1)
    }

    /// t seconds, distance to the phone (m), vertical position in camera space (m)
    mutating func append(t: Double, dist d: Double, y: Double) {
        ts[head] = t
        dist[head] = d
        ys[head] = y
        head += 1
        if head == capacity { head = 0 }
        if count < capacity { count += 1 }
    }

    /// Tracking was lost for a while: the head has moved, start over.
    mutating func clear() {
        head = 0
        count = 0
        recent.removeAll(keepingCapacity: true)
    }

    /// A second without a tracked face: the run of clear estimates starts over.
    mutating func missedSecond() {
        recent.removeAll(keepingCapacity: true)
    }

    /// Called once per second. The reference's estimate, given only when it is clear
    /// (FaceTuning.breathingClearSnrDb and following).
    mutating func clearReading() -> FaceBreathing.Reading? {
        let now = estimate()
        recent.append(now)
        if recent.count > FaceTuning.breathingStableEstimates { recent.removeFirst() }
        guard let r = now, recent.count == FaceTuning.breathingStableEstimates else { return nil }
        for other in recent {
            guard let o = other, o.snrDb > FaceTuning.breathingClearSnrDb,
                  abs(o.perMinute - r.perMinute) <= FaceTuning.breathingStableTolerancePerMin else { return nil }
        }
        return r
    }

    /// The reference's estimate over the samples held, clear or not.
    mutating func estimate() -> FaceBreathing.Reading? {
        guard count > 0 else { return nil }
        windowT.removeAll(keepingCapacity: true)
        windowDist.removeAll(keepingCapacity: true)
        windowY.removeAll(keepingCapacity: true)
        let newest = (head + capacity - 1) % capacity
        let from = ts[newest] - FaceTuning.breathingWindowS
        var i = (head + capacity - count) % capacity
        for _ in 0..<count {
            if ts[i] >= from {
                windowT.append(ts[i])
                windowDist.append(dist[i])
                windowY.append(ys[i])
            }
            i += 1
            if i == capacity { i = 0 }
        }
        return FaceBreathing.estimate(ts: windowT, dist: windowDist, y: windowY)
    }
}
