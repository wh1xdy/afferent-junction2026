import XCTest
@testable import WatchCore

/// The watch side of the app: the full 2A37 parser and the device listing rule of AfferentWatch
/// (ios/App/App/HeartRateParser.swift), and the sleep arithmetic of AfferentHealth (HealthMath.swift).
/// The byte vectors are the same as in android HeartRateParserTest.kt.
final class HeartRateParserTests: XCTestCase {
    private func m(_ bytes: [UInt8]) -> HeartRateMeasurement? { HeartRateParser.measurement(Data(bytes)) }

    func testEightBitPulseOnly() {
        XCTAssertEqual(m([0x00, 0x48]), HeartRateMeasurement(bpm: 72, contact: nil, energyKJ: nil, rrMs: []))
    }

    func testSixteenBitPulse() {
        XCTAssertEqual(m([0x01, 0x2C, 0x01])?.bpm, 300)
        XCTAssertNil(m([0x01, 0x2C]), "16-bit flag without its second byte")
    }

    func testZeroIsNoPulseButTheRestCounts() {
        XCTAssertEqual(m([0x16, 0x00, 0x00, 0x04]), HeartRateMeasurement(bpm: nil, contact: true, energyKJ: nil, rrMs: [1000]))
    }

    func testContactBits() {
        XCTAssertNil(m([0x00, 60])?.contact, "bit 2 clear: contact not reported")
        XCTAssertNil(m([0x02, 60])?.contact, "bit 1 without bit 2 means nothing")
        XCTAssertEqual(m([0x04, 60])?.contact, false)
        XCTAssertEqual(m([0x06, 60])?.contact, true)
    }

    func testEnergyAndIntervals() {
        // flags: contact reported + detected, energy, RR. 64 bpm, 300 kJ, RR 1024/1024 s and 820/1024 s.
        let r = m([0x1E, 0x40, 0x2C, 0x01, 0x00, 0x04, 0x34, 0x03])
        XCTAssertEqual(r, HeartRateMeasurement(bpm: 64, contact: true, energyKJ: 300, rrMs: [1000, 800.8]))
    }

    func testSixteenBitPulseWithIntervals() {
        // a Polar strap style packet: 16-bit pulse 61, RR 1000 ms (1024), 984.4 ms (1008)
        XCTAssertEqual(m([0x11, 0x3D, 0x00, 0x00, 0x04, 0xF0, 0x03]), HeartRateMeasurement(bpm: 61, contact: nil, energyKJ: nil, rrMs: [1000, 984.4]))
    }

    func testCutOffFields() {
        XCTAssertEqual(m([0x18, 0x40, 0x2C]), HeartRateMeasurement(bpm: 64, contact: nil, energyKJ: nil, rrMs: []),
                       "energy cut off: no energy and no intervals after it")
        XCTAssertEqual(m([0x10, 0x40, 0x00, 0x04, 0x34]), HeartRateMeasurement(bpm: 64, contact: nil, energyKJ: nil, rrMs: [1000]),
                       "half an interval at the end is dropped")
        XCTAssertEqual(m([0x10, 0x40, 0x00, 0x00, 0x00, 0x04])?.rrMs, [1000], "an interval of 0 is no interval")
    }

    func testTooShort() {
        XCTAssertNil(m([0x00]))
        XCTAssertNil(m([]))
        XCTAssertNil(HeartRateParser.measurement(nil))
    }

    func testListingRule() {
        XCTAssertEqual(HeartRateParser.listedName(advertisedName: "Forerunner 265", peripheralName: nil), "Forerunner 265")
        XCTAssertEqual(HeartRateParser.listedName(advertisedName: nil, peripheralName: " Polar H10 1A2B3C4D "), "Polar H10 1A2B3C4D")
        XCTAssertNil(HeartRateParser.listedName(advertisedName: "Afferent Finger", peripheralName: nil), "the finger box is not a watch")
        XCTAssertNil(HeartRateParser.listedName(advertisedName: nil, peripheralName: "Afferent Finger"))
        XCTAssertNil(HeartRateParser.listedName(advertisedName: "wendyos-uno-q", peripheralName: "Afferent Finger"))
        XCTAssertNil(HeartRateParser.listedName(advertisedName: "TICKR", peripheralName: "wendyos-uno-q"), "either name is enough to leave it out")
        XCTAssertNil(HeartRateParser.listedName(advertisedName: "  ", peripheralName: nil), "no name: not offered")
        XCTAssertNil(HeartRateParser.listedName(advertisedName: nil, peripheralName: nil))
    }

    func testOnlyTheChosenDevice() {
        let a = UUID(), b = UUID()
        XCTAssertTrue(HeartRateParser.isChosen(a, chosen: a))
        XCTAssertFalse(HeartRateParser.isChosen(b, chosen: a))
        XCTAssertFalse(HeartRateParser.isChosen(a, chosen: nil), "nothing chosen: nothing is connected")
    }

    func testEventsUseNullNotZero() {
        let r = HeartRateParser.readingEvent(HeartRateMeasurement(bpm: nil, contact: nil, energyKJ: nil, rrMs: []), tMs: 5)
        XCTAssertTrue(r["bpm"] is NSNull)
        XCTAssertTrue(r["contact"] is NSNull)
        XCTAssertTrue(r["energy_kj"] is NSNull)
        XCTAssertEqual(r["rr_ms"] as? [Double], [])
        XCTAssertEqual(r["kind"] as? String, "hr")
        let id = UUID()
        XCTAssertTrue(HeartRateParser.deviceEvent(id: id, name: "x", rssi: 127)["rssi"] is NSNull, "127: CoreBluetooth has no RSSI")
        XCTAssertEqual(HeartRateParser.deviceEvent(id: id, name: "x", rssi: -61)["rssi"] as? Int, -61)
        XCTAssertEqual(HeartRateParser.deviceEvent(id: id, name: "x", rssi: nil)["id"] as? String, id.uuidString)
    }
}

final class HealthMathTests: XCTestCase {
    private let min = 60_000.0
    private func s(_ a: Double, _ b: Double) -> HealthSpan { HealthSpan(start: a * min, end: b * min) }

    func testOverlapsCountOnce() {
        XCTAssertEqual(HealthMath.coveredMinutes([s(0, 60), s(30, 90), s(120, 150)]), 120)
        XCTAssertEqual(HealthMath.coveredMinutes([s(0, 60), s(0, 60)]), 60, "the watch and the phone wrote the same hour")
        XCTAssertEqual(HealthMath.coveredMinutes([s(10, 20), s(0, 60)]), 60)
        XCTAssertEqual(HealthMath.coveredMinutes([s(50, 40)]), 0, "a span that ends before it starts is ignored")
        XCTAssertEqual(HealthMath.coveredMinutes([]), 0)
    }

    func testLastNightOnly() {
        // a nap two days ago, then a night from 23:00 to 06:30 with a gap
        let day = 24 * 60.0
        let night = HealthMath.lastNight([s(0, 40), s(2 * day + 23 * 60, 2 * day + 26 * 60), s(2 * day + 26 * 60 + 15, 2 * day + 30 * 60 + 30)])
        XCTAssertEqual(night, HealthNight(start: (2 * day + 23 * 60) * min, end: (2 * day + 30 * 60 + 30) * min, minutes: 180 + 255))
        XCTAssertNil(HealthMath.lastNight([]))
    }
}
