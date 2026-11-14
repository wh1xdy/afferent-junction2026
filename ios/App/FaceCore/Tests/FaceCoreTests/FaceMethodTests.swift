import XCTest
import simd
@testable import FaceCore

/// The methods under the aggregator, checked against the reference app's own algorithms.
final class FaceMethodTests: XCTestCase {

    // MARK: breathing from head motion

    /// 60 Hz head positions: a breath of `mm` millimetres towards the phone (a third of it up and
    /// down), slow leaning of 0.3 mm/s and 0.4 mm of sensor noise, as in the reference's own test.
    private func breathe(perMinute: Double?, mm: Double = 1, seconds: Int = 60, seed: UInt64 = 1,
                         sway: Double = 0) -> Rig {
        let rig = Rig()
        var n = Noise(seed: seed)
        for i in 0..<(seconds * 60 + 1) {
            let t = Double(i) / 60
            var breath = 0.0
            if let rate = perMinute {
                let phase: Double = 2 * Double.pi * rate / 60 * t
                breath = mm / 1000 * sin(phase)
            }
            let swayPhase: Double = 2 * Double.pi * 0.02 * t
            let slow: Double = 0.0003 * t + sway * sin(swayPhase)
            rig.feedHead(distance: 0.30 + slow + breath + 0.0004 * n.next(),
                         vertical: 0.3 * breath + 0.0004 * n.next())
        }
        return rig
    }

    func testBreathingAt6PerMinuteIsRecovered() {
        let rig = breathe(perMinute: 6)
        XCTAssertEqual(rig.faces.count, 60)
        XCTAssertTrue(rig.faces.prefix(25).allSatisfy { $0.breathingPerMin == nil && $0.breathingSnr == nil })
        let values = rig.faces.compactMap(\.breathingPerMin)
        XCTAssertGreaterThanOrEqual(values.count, 25)                // from about 32 s on
        for v in values { XCTAssertEqual(v, 6, accuracy: 1) }
        XCTAssertGreaterThan(rig.faces.last?.breathingSnr ?? 0, FaceTuning.breathingClearSnrDb)
    }

    func testBreathingAt15PerMinuteIsRecovered() {
        let rig = breathe(perMinute: 15)
        let values = rig.faces.compactMap(\.breathingPerMin)
        XCTAssertGreaterThanOrEqual(values.count, 25)
        for v in values { XCTAssertEqual(v, 15, accuracy: 1) }
        XCTAssertGreaterThan(rig.faces.last?.breathingSnr ?? 0, FaceTuning.breathingClearSnrDb)
    }

    func testNoiseAloneGivesNoBreathing() {
        for seed in 1...6 as ClosedRange<UInt64> {
            let rig = breathe(perMinute: nil, seconds: 70, seed: seed)
            XCTAssertEqual(rig.faces.count, 70)
            XCTAssertTrue(rig.faces.allSatisfy { $0.breathingPerMin == nil && $0.breathingSnr == nil }, "seed \(seed)")
            XCTAssertTrue(rig.faces.allSatisfy { $0.dictionary["breathing_per_min"] is NSNull })
        }
    }

    func testSlowPostureDriftGivesNoBreathing() {
        // leaning in and swaying 3 mm once in 50 s: below the band, not a breath
        let rig = breathe(perMinute: nil, seconds: 70, sway: 0.003)
        XCTAssertTrue(rig.faces.allSatisfy { $0.breathingPerMin == nil })
    }

    func testBreathingStartsOverAfterLosingTheFace() {
        let rig = Rig()
        var n = Noise(seed: 3)
        for i in 0..<(80 * 60 + 1) {
            let t = Double(i) / 60
            if (40 * 60..<42 * 60).contains(i) { rig.feedNoFace(); continue }
            rig.feedHead(distance: 0.30 + 0.001 * sin(2 * Double.pi * 0.25 * t) + 0.0004 * n.next(), vertical: 0.0004 * n.next())
        }
        XCTAssertNotNil(rig.faces[39].breathingPerMin)
        XCTAssertTrue(rig.faces[40..<72].allSatisfy { $0.breathingPerMin == nil })    // 25 s of new data, 8 clear in a row
        XCTAssertEqual(rig.faces.last?.breathingPerMin ?? 0, 15, accuracy: 1)
    }

    func testEstimateIsTheReferenceEstimate() {
        // the reference's own test: 12 breaths per minute, 35 s
        var r = 1
        func noise() -> Double { r = (r &* 1103515245 &+ 12345) & 0x7fffffff; return Double(r) / Double(0x7fffffff) - 0.5 }
        var ts: [Double] = [], dist: [Double] = [], y: [Double] = []
        for i in 0..<(60 * 35) {
            let t = Double(i) / 60
            ts.append(t)
            dist.append(0.30 + 0.0003 * t + 0.001 * sin(2 * .pi * 0.2 * t) + 0.0004 * noise())
            y.append(0.0004 * noise())
        }
        let b = FaceBreathing.estimate(ts: ts, dist: dist, y: y)
        XCTAssertNotNil(b)
        XCTAssertEqual(b?.perMinute ?? 0, 12, accuracy: 1)
        XCTAssertGreaterThan(b?.snrDb ?? -1, 0)
        XCTAssertNil(FaceBreathing.estimate(ts: Array(ts.prefix(60 * 20)), dist: Array(dist.prefix(60 * 20)), y: Array(y.prefix(60 * 20))))
    }

    // MARK: baseline window

    func testRunningWindowGivesTheSameMedianAndSpreadAsSorting() {
        var n = Noise(seed: 9)
        var window = FaceRunningWindow(capacity: 300)
        var history: [Double] = []
        for i in 0..<2000 {
            let x = i % 7 == 0 ? 0.05 : 0.05 + n.next() * (i % 400 < 60 ? 1.0 : 0.02)       // repeats and bursts
            let base = history.isEmpty ? 0 : history.sorted()[history.count / 2]
            XCTAssertEqual(window.median, base)
            history.append(x)
            if history.count > 300 { history.removeFirst(history.count - 300) }
            window.push(x)
            let mad = history.map { abs($0 - base) }.sorted()[history.count / 2]
            XCTAssertEqual(window.medianAbsoluteDeviation(around: base), mad)
            XCTAssertEqual(window.count, history.count)
        }
    }

    // MARK: brief movements against the reference algorithm

    /// The reference's detector and overlap rule (Expressions.swift, BurstDetector and
    /// ExpressionSession.add), written the slow way it is there: sort the history every frame,
    /// keep every event of the session in one list.
    private struct ReferenceDetector {
        let minRise: Double
        var history: [Double] = []
        var active: (start: Double, peak: Double)?

        mutating func feed(_ x: Double, t: Double) -> (start: Double, duration: Double, peak: Double)? {
            let base = history.isEmpty ? 0 : history.sorted()[history.count / 2]
            history.append(x)
            if history.count > 300 { history.removeFirst(history.count - 300) }
            let thr = max(minRise, 4 * history.map { abs($0 - base) }.sorted()[history.count / 2])
            if let a = active {
                active = (a.start, max(a.peak, x))
                if x < base + thr / 2 {
                    active = nil
                    let dur = t - a.start
                    if dur >= 0.04 { return (a.start, dur, max(a.peak, x) - base) }
                }
            } else if history.count >= 30 && x > base + thr {
                active = (t, x)
            }
            return nil
        }
    }

    private struct ReferenceEvent: Equatable {
        var channel: Int, start: Double, duration: Double, peak: Double
    }

    private struct ReferenceSession {
        var detectors = FaceMicroDetector.minRise.map { ReferenceDetector(minRise: $0) }
        var events: [ReferenceEvent] = []
        var strengths: [Double] = []
        var lastFar = -Double.infinity

        mutating func feed(_ values: [Double], t: Double, far: Bool) {
            if far { lastFar = t }
            for i in detectors.indices {
                guard let e = detectors[i].feed(values[i], t: t) else { continue }
                if lastFar + 0.3 > e.start { continue }
                add(ReferenceEvent(channel: i, start: e.start, duration: e.duration, peak: e.peak), minRise: detectors[i].minRise)
            }
        }

        mutating func add(_ e: ReferenceEvent, minRise: Double) {
            let strength = e.peak / minRise
            let end = e.start + e.duration
            let overlapping = events.indices.filter { i in
                let o = events[i]
                let overlap = min(end, o.start + o.duration) - max(e.start, o.start)
                return o.channel != e.channel && overlap > 0.5 * min(e.duration, o.duration)
            }
            if overlapping.contains(where: { strengths[$0] >= strength }) { return }
            for i in overlapping.reversed() { events.remove(at: i); strengths.remove(at: i) }
            events.append(e)
            strengths.append(strength)
        }
    }

    func testEventsAreTheReferenceAlgorithmsEvents() {
        var total = 0
        for seed in 1...4 as ClosedRange<UInt64> {
            var n = Noise(seed: seed)
            func pick(_ k: Int) -> Int { min(Int((n.next() + 0.5) * Double(k)), k - 1) }
            // 40 s of six channels: jitter, plus movements of 1 to 3 channels at once with
            // staggered starts and ends, 30 ms to 1.5 s long, sometimes with the gaze far away
            let frames = 40 * 60
            var signal = [[Double]](repeating: [Double](repeating: 0, count: 6), count: frames)
            var far = [Bool](repeating: false, count: frames)
            for i in 0..<frames { for c in 0..<6 { signal[i][c] = 0.03 + 0.01 * Double(c) + 0.02 * n.next() } }
            var at = 120
            while at < frames - 400 {
                let length = [2, 3, 6, 12, 20, 29, 31, 45, 90][pick(9)]
                for _ in 0...pick(3) {
                    let c = pick(6), amp = 0.03 + 0.6 * (n.next() + 0.5), from = at + pick(12)
                    for i in from..<(from + length + pick(4)) { signal[i][c] += amp }
                }
                if pick(6) == 0 { for i in (at - 10)..<(at + 5) { far[i] = true } }
                at += length + 20 + pick(160)
            }
            var reference = ReferenceSession()
            var detector = FaceMicroDetector()
            var out: [FaceBurst] = []
            let parts = [Double](repeating: 0, count: FaceMicroDetector.componentCount)
            for i in 0..<frames {
                let t = Double(i) / 60
                reference.feed(signal[i], t: t, far: far[i])
                detector.feed(values: signal[i], components: parts, t: t, lookingFarAway: far[i], into: &out)
            }
            let expected = reference.events.filter { $0.duration >= 0.04 && $0.duration <= 0.5 }
                .sorted { $0.start < $1.start }
            let got = out.map { ReferenceEvent(channel: $0.channel, start: $0.start, duration: $0.duration, peak: $0.peak) }
                .sorted { $0.start < $1.start }
            XCTAssertEqual(got, expected, "seed \(seed)")
            XCTAssertTrue(out.allSatisfy(\.isMicro))
            total += expected.count
        }
        print("compared \(total) brief movements with the reference algorithm")
        XCTAssertGreaterThan(total, 30)           // the comparison is not empty
    }

    // MARK: gaze

    func testGazeCalibrationUndoesUnderestimation() {
        // the reference's own test: ARKit reports only 40 % of the real eye rotation, plus an offset
        var pairs: [(eye: FaceAngles, camera: FaceAngles)] = []
        for i in 0..<240 {
            let t = Double(i) / 30
            let cam = FaceAngles(yaw: 20 * sin(t), pitch: 12 * cos(0.7 * t))
            pairs.append((FaceAngles(yaw: 0.4 * cam.yaw + 3, pitch: 0.4 * cam.pitch - 2), cam))
        }
        guard let cal = FaceGazeCalibration.fit(pairs) else { return XCTFail("no fit") }
        XCTAssertEqual(cal.gainYaw, 2.5, accuracy: 0.05)
        XCTAssertEqual(cal.gainPitch, 2.5, accuracy: 0.05)
        XCTAssertLessThan(cal.residualDeg ?? 99, 0.5)
        let corrected = cal.apply(FaceAngles(yaw: 0.4 * 15 + 3, pitch: 0.4 * -8 - 2))
        XCTAssertEqual(corrected.yaw, 15, accuracy: 0.3)
        XCTAssertEqual(corrected.pitch, -8, accuracy: 0.3)
        XCTAssertNil(FaceGazeCalibration.fit(Array(pairs.prefix(59))))
        let decoded = try? JSONDecoder().decode(FaceGazeCalibration.self, from: JSONEncoder().encode(cal))
        XCTAssertEqual(decoded, cal)
    }

    func testCalibrationKeepsGainOneWithoutHeadMovement() {
        let pairs = (0..<120).map { i -> (eye: FaceAngles, camera: FaceAngles) in
            let wobble = sin(Double(i))
            return (FaceAngles(yaw: 1 + 0.5 * wobble, pitch: -3), FaceAngles(yaw: 4 + wobble, pitch: -9))
        }
        let cal = FaceGazeCalibration.fit(pairs)
        XCTAssertEqual(cal?.gainYaw, 1)
        XCTAssertEqual(cal?.gainPitch, 1)
        XCTAssertEqual(cal?.offsetPitch ?? 0, -6, accuracy: 1e-9)
    }

    func testAnglesRoundTrip() {
        let a = FaceAngles(yaw: 23, pitch: -11)
        let b = FaceGazeMath.angles(FaceGazeMath.direction(a))
        XCTAssertEqual(b.yaw, a.yaw, accuracy: 0.01)
        XCTAssertEqual(b.pitch, a.pitch, accuracy: 0.01)
    }

    func testGazeIsRelativeToTheCamera() {
        // head turned 20 degrees, eyes still on the phone: the eyes counter-rotate, the gaze stays at 0
        let turn = simd_float4x4(simd_quatf(angle: 20 * .pi / 180, axis: SIMD3<Float>(0, 1, 0)))
        var face = turn
        face.columns.3 = SIMD4<Float>(0, 0, -0.3, 1)
        let camera = FaceGazeMath.cameraAngles(face: face, camera: matrix_identity_float4x4)
        XCTAssertEqual(abs(camera.yaw), 20, accuracy: 0.01)
        let eye = Rig.eye(yaw: camera.yaw, pitch: camera.pitch)
        let eyes = FaceGazeMath.eyeAngles(left: eye, right: eye)
        XCTAssertEqual(eyes.yaw - camera.yaw, 0, accuracy: 0.01)
        XCTAssertEqual(eyes.pitch - camera.pitch, 0, accuracy: 0.01)
    }
}
