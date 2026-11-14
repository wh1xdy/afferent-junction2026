import Foundation

/// The last `capacity` values, kept sorted as well, so the median and the median absolute
/// deviation cost no sorting and no allocation per frame. The reference sorts its history
/// twice per frame per channel (BurstDetector.baseline / .mad); this gives the same numbers.
struct FaceRunningWindow {
    let capacity: Int
    private var ring: [Double]
    private var sorted: [Double]
    private var head = 0

    init(capacity: Int) {
        self.capacity = capacity
        ring = [Double](repeating: 0, count: capacity)
        sorted = []
        sorted.reserveCapacity(capacity)
    }

    var count: Int { sorted.count }

    /// Upper median, as the reference takes it (`sorted[count / 2]`); 0 when empty.
    var median: Double { sorted.isEmpty ? 0 : sorted[sorted.count / 2] }

    mutating func push(_ x: Double) {
        let x = x.isFinite ? x : 0
        if sorted.count == capacity {
            sorted.remove(at: lowerBound(ring[head]))
        }
        ring[head] = x
        head += 1
        if head == capacity { head = 0 }
        sorted.insert(x, at: lowerBound(x))
    }

    mutating func removeAll() {
        sorted.removeAll(keepingCapacity: true)
        head = 0
    }

    /// Median of |value - m| over the window (`sorted[count / 2]` of the deviations).
    func medianAbsoluteDeviation(around m: Double) -> Double {
        let n = sorted.count
        guard n > 0 else { return 0 }
        // the deviations left and right of m are each already sorted: merge outwards from m
        var r = lowerBound(m)
        var l = r - 1
        var d = 0.0
        for _ in 0...(n / 2) {
            let dl = l >= 0 ? m - sorted[l] : Double.infinity
            let dr = r < n ? sorted[r] - m : Double.infinity
            if dl <= dr { d = dl; l -= 1 } else { d = dr; r += 1 }
        }
        return d
    }

    private func lowerBound(_ x: Double) -> Int {
        var lo = 0, hi = sorted.count
        while lo < hi {
            let mid = (lo + hi) / 2
            if sorted[mid] < x { lo = mid + 1 } else { hi = mid }
        }
        return lo
    }
}
