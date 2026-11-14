import Foundation

// Byte formats of the UNO Q finger sensor ("Afferent Finger", uno-q/SENSORS.md).
// Foundation only: this file is also compiled on macOS by the test package in
// ios/App/FingerTests (`cd ios/App/FingerTests && swift test`).

/// One AFF1 notification. nil = the board reported no value for that field.
struct FingerAff1: Equatable {
    /// finger 1 / finger 2 pulse, beats per minute
    let finger1: Int?
    let finger2: Int?
    /// breaths per minute, from the heart-rate rhythm
    let breathing: Int?
    /// HRV: RMSSD in milliseconds, 1...254. nil also when the board sent 255, which means
    /// "above 254 ms" (one byte cannot carry it) and is not a reading of 255 ms.
    let rmssd: Int?
    /// fused rhythm quality 0...1. nil when the payload has no quality byte (4-byte v1 firmware)
    /// or the board says "not available" (255). Unknown is never reported as a number.
    let quality: Double?
    /// "idle" | "probing" | "active". nil for a v1 payload or code 0 (unknown).
    let presence: String?
    /// number of bytes received: 4 = v1 firmware, 6 = v2
    let length: Int
}

enum AfferentFingerParser {
    /// The only peripheral this app reads a finger pulse from.
    static let deviceName = "Afferent Finger"
    /// AFF1 byte 3 when RMSSD is above 254 ms (uno-q/modulino-hub/ble.py RMSSD_OVER).
    static let rmssdOverRange = 255

    /// Heart Rate Measurement (0x2A37): flags bit 0 = 16-bit value. 0 = no reading -> nil.
    static func heartRate(_ data: Data?) -> Int? {
        guard let data = data, data.count >= 2 else { return nil }
        let b = [UInt8](data)
        let value: Int?
        if b[0] & 0x01 == 0 {
            value = Int(b[1])
        } else {
            value = b.count >= 3 ? Int(b[1]) | Int(b[2]) << 8 : nil
        }
        guard let v = value, v > 0 else { return nil }
        return v
    }

    /// AFF1: [finger 1 bpm, finger 2 bpm, breaths/min, RMSSD ms, quality %, presence code].
    /// Bytes 0...3: 0 = no reading. Byte 3 (RMSSD): 255 = above 254 ms -> nil, never "255 ms".
    /// Byte 4: 0...100, 255 (or anything above 100) = not available.
    /// Byte 5: 1 idle, 2 probing, 3 active, anything else = unknown.
    /// nil below 2 bytes; a byte that was not sent gives a nil field.
    static func aff1(_ data: Data?) -> FingerAff1? {
        guard let data = data, data.count >= 2 else { return nil }
        let b = [UInt8](data)
        func reading(_ i: Int) -> Int? {
            guard i < b.count, b[i] > 0 else { return nil }
            return Int(b[i])
        }
        var rmssd = reading(3)
        if rmssd == rmssdOverRange { rmssd = nil }
        var quality: Double?
        if b.count >= 5, b[4] <= 100 {
            quality = Double(b[4]) / 100.0
        }
        var presence: String?
        if b.count >= 6 {
            switch b[5] {
            case 1: presence = "idle"
            case 2: presence = "probing"
            case 3: presence = "active"
            default: presence = nil
            }
        }
        return FingerAff1(finger1: reading(0), finger2: reading(1), breathing: reading(2),
                          rmssd: rmssd, quality: quality, presence: presence, length: b.count)
    }

    /// True only for our own board: the advertised name or the peripheral's name is exactly
    /// "Afferent Finger". Any other heart-rate device (a stranger's chest strap or watch) is not
    /// the patient's finger and must never be connected.
    static func isAfferentFinger(advertisedName: String?, peripheralName: String?) -> Bool {
        return advertisedName == deviceName || peripheralName == deviceName
    }

    // The "reading" events of the AfferentFinger plugin, as the web layer receives them.
    // A missing value is JSON null (NSNull), never 0 and never a made-up default.

    /// 2A37 notification with a pulse: {kind: "hrm", bpm, t_ms}
    static func hrmEvent(bpm: Int, tMs: Double) -> [String: Any] {
        return ["kind": "hrm", "bpm": bpm, "t_ms": tMs]
    }

    /// AFF1 notification: {kind: "aff1", finger_bpm: [f1, f2], breathing_per_min, rmssd_ms,
    /// quality, presence, payload_len, t_ms}
    static func aff1Event(_ r: FingerAff1, tMs: Double) -> [String: Any] {
        func js(_ value: Any?) -> Any { return value ?? NSNull() }
        return [
            "kind": "aff1",
            "finger_bpm": [js(r.finger1), js(r.finger2)],
            "breathing_per_min": js(r.breathing),
            "rmssd_ms": js(r.rmssd),
            "quality": js(r.quality),
            "presence": js(r.presence),
            "payload_len": r.length,
            "t_ms": tMs,
        ]
    }
}
