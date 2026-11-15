import Foundation

/// The level math of the room sound window (AfferentSoundLevel.swift), kept free of AVFoundation so the offline tests
/// (ios/App/TeamTests) run the shipped code. Samples in, one A-weighted level per block out, in dB re full scale.
/// The same sections as demo/js/sound.js aweight() and android SoundLevelMeter.kt: the IEC 61672 A-weighting poles as
/// first-order sections, each prewarped through the bilinear transform, the whole made 0 dB at 1 kHz. No sample is kept:
/// each one is filtered, squared into the running block sum and dropped.
public struct SoundLevelMeter {
    public static let floorDb = -120.0

    struct Section {
        let b0: Double, b1: Double, a1: Double
        var x1 = 0.0, y1 = 0.0

        init(highPass: Bool, corner f: Double, sampleRate fs: Double) {
            let k = 2 * fs, w = k * tan(Double.pi * f / fs), d = k + w
            b0 = highPass ? k / d : w / d
            b1 = highPass ? -k / d : w / d
            a1 = (w - k) / d
        }

        mutating func step(_ x: Double) -> Double {
            let y = b0 * x + b1 * x1 - a1 * y1
            x1 = x
            y1 = y
            return y
        }

        func magnitude(_ omega: Double) -> Double {
            let c = cos(omega), s = sin(omega)
            return hypot(b0 + b1 * c, b1 * s) / hypot(1 + a1 * c, a1 * s)
        }
    }

    static let poles: [(highPass: Bool, corner: Double)] = [
        (true, 20.598997), (true, 20.598997), (true, 107.65265), (true, 737.86223), (false, 12194.217), (false, 12194.217),
    ]

    public let sampleRate: Double
    public let blockLength: Int
    private var sections: [Section]
    private let gain: Double
    private var sum = 0.0
    private var count = 0
    /// One level per finished block, in dBFS (A-weighted mean square; a full-scale 1 kHz sine is -3 dB).
    public private(set) var blocks: [Double] = []

    public init(sampleRate: Double, blockSeconds: Double = 0.1) {
        self.sampleRate = sampleRate
        blockLength = max(1, Int((sampleRate * blockSeconds).rounded()))
        // the 12194 Hz sections only where the sample rate can hold them
        let made = Self.poles.filter { $0.highPass || $0.corner < 0.45 * sampleRate }
            .map { Section(highPass: $0.highPass, corner: $0.corner, sampleRate: sampleRate) }
        sections = made
        let omega = 2 * Double.pi * 1000 / sampleRate
        gain = 1 / made.reduce(1.0) { $0 * $1.magnitude(omega) }
    }

    /// The weighting's gain at a frequency, in dB (0 at 1 kHz).
    public func response(at frequency: Double) -> Double {
        let omega = 2 * Double.pi * frequency / sampleRate
        return 20 * log10(gain * sections.reduce(1.0) { $0 * $1.magnitude(omega) })
    }

    public static func dbfs(meanSquare: Double) -> Double {
        meanSquare > 0 ? max(floorDb, 10 * log10(meanSquare)) : floorDb
    }

    public mutating func process(_ samples: UnsafeBufferPointer<Float>) {
        for x in samples {
            var v = Double(x)
            for i in sections.indices { v = sections[i].step(v) }
            v *= gain
            sum += v * v
            count += 1
            if count == blockLength {
                blocks.append(Self.dbfs(meanSquare: sum / Double(count)))
                sum = 0
                count = 0
            }
        }
    }

    public mutating func process(_ samples: [Float]) {
        samples.withUnsafeBufferPointer { process($0) }
    }
}
