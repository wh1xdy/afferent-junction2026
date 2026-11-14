import XCTest
@testable import AfferentFingerParser

/// Byte formats: uno-q/SENSORS.md. The golden payloads are the same as in
/// uno-q/modulino-hub/tests/test_ble_payload.py, so both ends are tested against one contract.
final class AfferentFingerParserTests: XCTestCase {
    private func data(_ bytes: [UInt8]) -> Data { Data(bytes) }

    // MARK: 2A37 Heart Rate Measurement

    func testHeartRate8Bit() {
        XCTAssertEqual(AfferentFingerParser.heartRate(data([0x00, 0x48])), 72)
    }

    func testHeartRate16BitFlag() {
        XCTAssertEqual(AfferentFingerParser.heartRate(data([0x01, 0x2C, 0x01])), 300)
    }

    func testHeartRateZeroIsNoReading() {
        XCTAssertNil(AfferentFingerParser.heartRate(data([0x00, 0x00])))
        XCTAssertNil(AfferentFingerParser.heartRate(data([0x01, 0x00, 0x00])))
    }

    func testHeartRateTooShort() {
        XCTAssertNil(AfferentFingerParser.heartRate(data([0x00])))
        XCTAssertNil(AfferentFingerParser.heartRate(data([])))
        XCTAssertNil(AfferentFingerParser.heartRate(nil))
        XCTAssertNil(AfferentFingerParser.heartRate(data([0x01, 0x2C])), "16-bit flag without the second byte")
    }

    func testHeartRateIgnoresOtherFlagBits() {
        // 0x16: contact bits + RR intervals present, value still 8-bit
        XCTAssertEqual(AfferentFingerParser.heartRate(data([0x16, 0x48, 0x20, 0x03])), 72)
    }

    func testHeartRateOnASlice() {
        // a Data slice does not start at index 0
        let slice = data([0xAA, 0xBB, 0x00, 0x48]).suffix(2)
        XCTAssertEqual(AfferentFingerParser.heartRate(slice), 72)
    }

    // MARK: AFF1

    func testAff1V1FourBytes() {
        let r = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E]))
        XCTAssertEqual(r, FingerAff1(finger1: 71, finger2: 73, breathing: 6, rmssd: 46,
                                     quality: nil, presence: nil, twoHearts: nil, length: 4))
    }

    func testAff1V2SixBytes() {
        let r = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03]))
        XCTAssertEqual(r?.finger1, 71)
        XCTAssertEqual(r?.finger2, 73)
        XCTAssertEqual(r?.breathing, 6)
        XCTAssertEqual(r?.rmssd, 46)
        XCTAssertEqual(r?.quality ?? -1, 0.62, accuracy: 1e-9)
        XCTAssertEqual(r?.presence, "active")
        XCTAssertNil(r?.twoHearts, "a v2 board does not say whether two people wear the clips")
        XCTAssertEqual(r?.length, 6)
    }

    func testAff1V3SevenBytesTwoHearts() {
        let r = AfferentFingerParser.aff1(data([0x40, 0x5C, 0x00, 0x00, 0x29, 0x03, 0x01]))
        XCTAssertEqual(r, FingerAff1(finger1: 64, finger2: 92, breathing: nil, rmssd: nil,
                                     quality: 0.41, presence: "active", twoHearts: true, length: 7))
        let one = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03, 0x00]))
        XCTAssertEqual(one?.twoHearts, false)
        XCTAssertEqual(one?.presence, "active")
    }

    func testAff1TwoHeartsIsBitZeroOnly() {
        // other bits are reserved: they never set the flag
        XCTAssertEqual(AfferentFingerParser.aff1(data([0, 0, 0, 0, 255, 1, 0xFE]))?.twoHearts, false)
        XCTAssertEqual(AfferentFingerParser.aff1(data([0, 0, 0, 0, 255, 1, 0x03]))?.twoHearts, true)
    }

    func testAff1RmssdAboveTheByteIsNoReading() {
        // ble.py RMSSD_OVER: 255 = above 254 ms. It must never reach the app as a measured 255 ms.
        XCTAssertEqual(AfferentFingerParser.rmssdOverRange, 255)
        let over = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0xFF, 0x3E, 0x03]))
        XCTAssertNotNil(over)
        XCTAssertNil(over?.rmssd)
        XCTAssertEqual(over?.finger1, 71, "the other fields are untouched")
        XCTAssertEqual(over?.breathing, 6)
        XCTAssertEqual(AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0xFE, 0x3E, 0x03]))?.rmssd, 254)
        XCTAssertNil(AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0xFF]))?.rmssd, "also in a 4-byte payload")
        let event = AfferentFingerParser.aff1Event(over!, tMs: 1)
        XCTAssertTrue(event["rmssd_ms"] is NSNull)
    }

    func testAff1QualityNotAvailable() {
        let r = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0xFF, 0x03]))
        XCTAssertNotNil(r)
        XCTAssertNil(r?.quality)
        XCTAssertEqual(r?.presence, "active")
    }

    func testAff1QualityAboveHundredIsNotANumber() {
        // outside the contract (0...100, 255): never report a quality above 1
        XCTAssertNil(AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x65, 0x03]))?.quality)
        XCTAssertEqual(AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x64, 0x03]))?.quality, 1.0)
    }

    func testAff1QualityZeroIsZeroNotMissing() {
        XCTAssertEqual(AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x00, 0x03]))?.quality, 0.0)
    }

    func testAff1QualityJustBelowTheLimit() {
        // A7: below 0.3 is unreliable; 29 % must compare as below
        let q = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x1D, 0x03]))?.quality ?? 1
        XCTAssertLessThan(q, 0.3)
    }

    func testAff1PresenceCodes() {
        func presence(_ code: UInt8) -> String? {
            AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x3E, code]))?.presence
        }
        XCTAssertNil(presence(0), "code 0 = unknown")
        XCTAssertEqual(presence(1), "idle")
        XCTAssertEqual(presence(2), "probing")
        XCTAssertEqual(presence(3), "active")
        XCTAssertNil(presence(4))
        XCTAssertNil(presence(255))
    }

    func testAff1IdleNoReadings() {
        let r = AfferentFingerParser.aff1(data([0x00, 0x00, 0x00, 0x00, 0xFF, 0x01]))
        XCTAssertEqual(r, FingerAff1(finger1: nil, finger2: nil, breathing: nil, rmssd: nil,
                                     quality: nil, presence: "idle", twoHearts: nil, length: 6))
    }

    func testAff1TwoBytesFingersOnly() {
        let r = AfferentFingerParser.aff1(data([0x47, 0x49]))
        XCTAssertEqual(r, FingerAff1(finger1: 71, finger2: 73, breathing: nil, rmssd: nil,
                                     quality: nil, presence: nil, twoHearts: nil, length: 2))
    }

    func testAff1FiveBytesHasQualityButNoPresence() {
        let r = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x3E]))
        XCTAssertEqual(r?.quality ?? -1, 0.62, accuracy: 1e-9)
        XCTAssertNil(r?.presence)
        XCTAssertEqual(r?.length, 5)
    }

    func testAff1TooShort() {
        XCTAssertNil(AfferentFingerParser.aff1(data([0x47])))
        XCTAssertNil(AfferentFingerParser.aff1(data([])))
        XCTAssertNil(AfferentFingerParser.aff1(nil))
    }

    func testAff1LongerPayloadKeepsTheKnownFields() {
        // a later firmware may append bytes
        let r = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03, 0x99]))
        XCTAssertEqual(r?.finger1, 71)
        XCTAssertEqual(r?.presence, "active")
        XCTAssertEqual(r?.length, 7)
        let longer = AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03, 0x00, 0x99]))
        XCTAssertEqual(longer?.twoHearts, false)
        XCTAssertEqual(longer?.length, 8)
    }

    func testAff1OnASlice() {
        let slice = data([0xAA, 0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03]).dropFirst()
        XCTAssertEqual(AfferentFingerParser.aff1(slice)?.finger1, 71)
        XCTAssertEqual(AfferentFingerParser.aff1(slice)?.presence, "active")
    }

    // MARK: Device name

    func testNameMatchingAcceptsOnlyAfferentFinger() {
        XCTAssertEqual(AfferentFingerParser.deviceName, "Afferent Finger")
        XCTAssertTrue(AfferentFingerParser.isAfferentFinger(advertisedName: "Afferent Finger", peripheralName: nil))
        XCTAssertTrue(AfferentFingerParser.isAfferentFinger(advertisedName: nil, peripheralName: "Afferent Finger"))
        XCTAssertTrue(AfferentFingerParser.isAfferentFinger(advertisedName: "Afferent Finger", peripheralName: "uno-q"))
        XCTAssertFalse(AfferentFingerParser.isAfferentFinger(advertisedName: nil, peripheralName: nil))
        XCTAssertFalse(AfferentFingerParser.isAfferentFinger(advertisedName: "Polar H10 8A3B2C1D", peripheralName: "Polar H10"))
        XCTAssertFalse(AfferentFingerParser.isAfferentFinger(advertisedName: "afferent finger", peripheralName: nil))
        XCTAssertFalse(AfferentFingerParser.isAfferentFinger(advertisedName: "Afferent Finger 2", peripheralName: nil))
        XCTAssertFalse(AfferentFingerParser.isAfferentFinger(advertisedName: " Afferent Finger", peripheralName: nil))
        XCTAssertFalse(AfferentFingerParser.isAfferentFinger(advertisedName: "", peripheralName: ""))
    }

    // MARK: Found through Wendy Net's advertisement

    private func may(_ adv: String?, _ gap: String?, wendy: Bool) -> Bool {
        AfferentFingerParser.mayBeAfferentBoard(advertisedName: adv, peripheralName: gap, wendyNet: wendy)
    }

    func testOurAdvertisementStillMatches() {
        XCTAssertTrue(may("Afferent Finger", nil, wendy: false))           // scan for 180D, as before
        XCTAssertTrue(may(nil, "Afferent Finger", wendy: false))           // connected through another app
    }

    func testTheBoardSeenOnlyThroughWendyNet() {
        // what a Mac saw on 2026-11-14 while a Wendy Net peer held the link through our
        // advertisement: local name "wendyos-uno-q", service 7565E9EB, GAP name "Afferent Finger"
        XCTAssertTrue(may("wendyos-uno-q", "Afferent Finger", wendy: true))
        XCTAssertTrue(may("wendyos-uno-q", nil, wendy: true))              // a phone that never connected
        XCTAssertTrue(may(nil, "wendyos-uno-q", wendy: true))              // found among connected peripherals
        XCTAssertTrue(may(nil, "Afferent Finger", wendy: true))
    }

    func testNeverAnUnrelatedDevice() {
        XCTAssertFalse(may("wendyos-uno-q", nil, wendy: false), "the name alone, without Wendy Net's service")
        XCTAssertFalse(may("wendyos-hackathon-device-12", nil, wendy: true), "another Wendy device")
        XCTAssertFalse(may("wendyos-jetson", "wendyos-jetson", wendy: true))
        XCTAssertFalse(may(nil, nil, wendy: true), "Wendy Net's service without a name")
        XCTAssertFalse(may("WendyOS-UNO-Q", nil, wendy: true))
        XCTAssertFalse(may("wendyos-uno-q-2", nil, wendy: true))
        XCTAssertFalse(may("Polar H10 8A3B2C1D", "Polar H10", wendy: false))
        XCTAssertFalse(may("Polar H10 8A3B2C1D", "Polar H10", wendy: true))
    }

    func testWendyNetServiceInAnAdvertisement() {
        XCTAssertEqual(AfferentFingerParser.wendyNetService, "7565E9EB-4C20-4B67-9272-D708B397B631")
        XCTAssertTrue(AfferentFingerParser.advertisesWendyNet(["7565E9EB-4C20-4B67-9272-D708B397B631"]))
        XCTAssertTrue(AfferentFingerParser.advertisesWendyNet(["180D", "7565e9eb-4c20-4b67-9272-d708b397b631"]))
        XCTAssertFalse(AfferentFingerParser.advertisesWendyNet(["180D"]))
        XCTAssertFalse(AfferentFingerParser.advertisesWendyNet([]))
        XCTAssertEqual(AfferentFingerParser.scanServices, ["180D", "7565E9EB-4C20-4B67-9272-D708B397B631"])
    }

    // MARK: Events sent to the web layer

    private func json(_ event: [String: Any]) throws -> String {
        XCTAssertTrue(JSONSerialization.isValidJSONObject(event))
        let d = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
        return String(decoding: d, as: UTF8.self)
    }

    func testHrmEvent() throws {
        let e = AfferentFingerParser.hrmEvent(bpm: 72, tMs: 1_000)
        XCTAssertEqual(try json(e), #"{"bpm":72,"kind":"hrm","t_ms":1000}"#)
    }

    func testAff1EventV2() throws {
        let r = try XCTUnwrap(AfferentFingerParser.aff1(data([0x47, 0x49, 0x06, 0x2E, 0x32, 0x03])))
        let e = AfferentFingerParser.aff1Event(r, tMs: 1_000)
        XCTAssertEqual(Set(e.keys), ["kind", "finger_bpm", "breathing_per_min", "rmssd_ms",
                                     "quality", "presence", "two_hearts", "payload_len", "t_ms"])
        XCTAssertEqual(try json(e),
                       #"{"breathing_per_min":6,"finger_bpm":[71,73],"kind":"aff1","payload_len":6,"#
                       + #""presence":"active","quality":0.5,"rmssd_ms":46,"t_ms":1000,"two_hearts":null}"#)
    }

    func testAff1EventV3TwoHearts() throws {
        let r = try XCTUnwrap(AfferentFingerParser.aff1(data([0x40, 0x5C, 0x00, 0x00, 0x32, 0x03, 0x01])))
        let e = AfferentFingerParser.aff1Event(r, tMs: 1_000)
        XCTAssertEqual(try json(e),
                       #"{"breathing_per_min":null,"finger_bpm":[64,92],"kind":"aff1","payload_len":7,"#
                       + #""presence":"active","quality":0.5,"rmssd_ms":null,"t_ms":1000,"two_hearts":true}"#)
    }

    func testAff1EventUsesNullForMissingValues() throws {
        // v1 firmware, finger 2 without a reading: unknown stays null, never 0 or a default
        let r = try XCTUnwrap(AfferentFingerParser.aff1(data([0x47, 0x00, 0x00, 0x00])))
        let e = AfferentFingerParser.aff1Event(r, tMs: 1_000)
        XCTAssertEqual(try json(e),
                       #"{"breathing_per_min":null,"finger_bpm":[71,null],"kind":"aff1","payload_len":4,"#
                       + #""presence":null,"quality":null,"rmssd_ms":null,"t_ms":1000,"two_hearts":null}"#)
        XCTAssertTrue(e["quality"] is NSNull)
        XCTAssertTrue(e["presence"] is NSNull)
        XCTAssertTrue(e["two_hearts"] is NSNull)
    }
}
