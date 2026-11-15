import XCTest
@testable import Afferent

/// The room sound meter (ios/App/App/AfferentSoundLevelMeter.swift) on synthetic sines: the A-weighting curve against
/// IEC 61672 (within 1 dB from 50 Hz to 10 kHz), RMS to dBFS, one level per 100 ms block, and silence as the floor.
/// The same numbers as demo/tests/sound.test.js checks for the web layer's copy of the filter.
final class SoundLevelMeterTests: XCTestCase {
    func sine(_ f: Double, amplitude: Double = 1, seconds: Double = 2, rate: Double = 48000) -> [Float] {
        (0..<Int(seconds * rate)).map { Float(amplitude * sin(2 * .pi * f * Double($0) / rate)) }
    }

    func level(_ f: Double, amplitude: Double = 1, rate: Double = 48000) -> Double {
        var m = SoundLevelMeter(sampleRate: rate)
        m.process(sine(f, amplitude: amplitude, rate: rate))
        let steady = m.blocks.dropFirst(5)
        return 10 * log10(steady.map { pow(10, $0 / 10) }.reduce(0, +) / Double(steady.count))
    }

    func testTheWeightingFollowsTheACurve() {
        // IEC 61672 A-weighting, dB
        let curve: [(Double, Double)] = [(50, -30.2), (100, -19.1), (250, -8.6), (500, -3.2), (1000, 0), (2000, 1.2), (4000, 1.0), (8000, -1.1), (10000, -2.5)]
        for rate in [48000.0, 44100.0] {
            let m = SoundLevelMeter(sampleRate: rate)
            for (f, a) in curve {
                XCTAssertEqual(m.response(at: f), a, accuracy: 1.0, "\(f) Hz at \(rate)")
                // a full-scale sine is -3 dBFS before weighting
                XCTAssertEqual(level(f, rate: rate) + 3.0103, a, accuracy: 1.0, "\(f) Hz sine at \(rate)")
            }
        }
    }

    func testRmsToDbfsAndOneBlockPer100ms() {
        var m = SoundLevelMeter(sampleRate: 48000)
        XCTAssertEqual(m.blockLength, 4800)
        m.process(sine(1000, amplitude: 0.1, seconds: 1))
        XCTAssertEqual(m.blocks.count, 10)
        XCTAssertEqual(m.blocks.last!, -23.0103, accuracy: 0.05, "0.1 of full scale: 20 log10(0.1/sqrt 2)")
        XCTAssertEqual(level(1000, amplitude: 0.01) - level(1000, amplitude: 0.1), -20, accuracy: 0.05, "ten times quieter is 20 dB down")
    }

    func testSilenceIsTheFloor() {
        var m = SoundLevelMeter(sampleRate: 48000)
        m.process([Float](repeating: 0, count: 9600))
        XCTAssertEqual(m.blocks, [SoundLevelMeter.floorDb, SoundLevelMeter.floorDb])
        XCTAssertEqual(SoundLevelMeter.dbfs(meanSquare: 0), SoundLevelMeter.floorDb)
        XCTAssertEqual(SoundLevelMeter.dbfs(meanSquare: 1), 0)
    }

    func testALowSampleRateLeavesOutTheTopSections() {
        let m = SoundLevelMeter(sampleRate: 16000)
        XCTAssertEqual(m.response(at: 1000), 0, accuracy: 0.01)
        XCTAssertEqual(m.response(at: 100), -19.1, accuracy: 1.0)
        XCTAssertFalse(m.response(at: 4000).isNaN)
    }
}
