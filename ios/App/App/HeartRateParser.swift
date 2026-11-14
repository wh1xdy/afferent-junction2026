import Foundation

// The standard Bluetooth Heart Rate Measurement (0x2A37) of a watch or chest strap, parsed in full, and which
// heart-rate devices may be offered to the patient. Foundation only: this file is also compiled on macOS by the test
// package in ios/App/FingerTests (`cd ios/App/FingerTests && swift test`). The Kotlin twin is HeartRateParser.kt.
//
// 2A37: byte 0 = flags, then the fields the flags announce, in this order:
//   bit 0   heart rate is UINT16 (else UINT8)
//   bit 1   skin contact detected            } only meaningful with bit 2
//   bit 2   skin contact is reported
//   bit 3   energy expended, UINT16 kJ
//   bit 4   one or more RR intervals, UINT16 each, in 1/1024 s, oldest first
// All multi-byte values are little endian.

/// One 2A37 notification. nil / empty = the device did not send that field.
struct HeartRateMeasurement: Equatable {
    /// beats per minute; nil when the device sent 0 (no reading)
    let bpm: Int?
    /// true: skin contact; false: no skin contact; nil: the device does not report contact
    let contact: Bool?
    /// energy expended in kJ since the device's last reset
    let energyKJ: Int?
    /// beat-to-beat intervals in milliseconds (converted from 1/1024 s, one decimal), oldest first
    let rrMs: [Double]
}

enum HeartRateParser {
    /// The Afferent finger box advertises the Heart Rate Service too (AfferentFingerParser): it is never offered as
    /// a watch, under either of its names.
    static let boxNames: Set<String> = ["Afferent Finger", "wendyos-uno-q"]

    /// nil below 2 bytes, or when a 16-bit heart rate is cut off. A field cut off after the heart rate is left out
    /// (nil energy, no further intervals); the heart rate and contact still count.
    static func measurement(_ data: Data?) -> HeartRateMeasurement? {
        guard let data = data, data.count >= 2 else { return nil }
        let b = [UInt8](data)
        let flags = b[0]
        func u16(_ i: Int) -> Int { Int(b[i]) | Int(b[i + 1]) << 8 }
        var i: Int
        let bpm: Int
        if flags & 0x01 != 0 {
            guard b.count >= 3 else { return nil }
            bpm = u16(1)
            i = 3
        } else {
            bpm = Int(b[1])
            i = 2
        }
        let contact: Bool? = flags & 0x04 != 0 ? flags & 0x02 != 0 : nil
        var energy: Int?
        var rr: [Double] = []
        var complete = true
        if flags & 0x08 != 0 {
            if i + 1 < b.count {
                energy = u16(i)
                i += 2
            } else {
                complete = false
            }
        }
        if complete && flags & 0x10 != 0 {
            while i + 1 < b.count {
                let raw = u16(i)
                i += 2
                if raw > 0 { rr.append((Double(raw) * 1000.0 / 1024.0 * 10).rounded() / 10) }
            }
        }
        return HeartRateMeasurement(bpm: bpm > 0 ? bpm : nil, contact: contact, energyKJ: energy, rrMs: rr)
    }

    /// The name to offer a heart-rate device under, or nil when it is not offered: no name (it could not be told apart
    /// from a neighbour's), or the Afferent finger box under either name.
    static func listedName(advertisedName: String?, peripheralName: String?) -> String? {
        for n in [advertisedName, peripheralName] {
            if let n = n, boxNames.contains(n.trimmingCharacters(in: .whitespacesAndNewlines)) { return nil }
        }
        let name = (advertisedName ?? peripheralName)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return name.isEmpty ? nil : name
    }

    /// Whether a peripheral is the one the patient chose. Nothing else is ever connected.
    static func isChosen(_ id: UUID, chosen: UUID?) -> Bool { chosen != nil && id == chosen }

    // The events of the AfferentWatch plugin, as the web layer (demo/js/watch.js) receives them.
    // A missing value is JSON null (NSNull), never 0.

    private static func js(_ value: Any?) -> Any { value ?? NSNull() }

    /// "reading": {kind: "hr", bpm, contact, energy_kj, rr_ms, t_ms}
    static func readingEvent(_ m: HeartRateMeasurement, tMs: Double) -> [String: Any] {
        return ["kind": "hr", "bpm": js(m.bpm), "contact": js(m.contact), "energy_kj": js(m.energyKJ), "rr_ms": m.rrMs, "t_ms": tMs]
    }

    /// "device": {id, name, rssi}. rssi 127 means "not available" in CoreBluetooth.
    static func deviceEvent(id: UUID, name: String, rssi: Int?) -> [String: Any] {
        let r: Int? = rssi.flatMap { $0 == 127 || $0 >= 0 ? nil : $0 }
        return ["id": id.uuidString, "name": name, "rssi": js(r)]
    }

    /// "state" and status(): {state, name, id, scanning}
    static func stateEvent(state: String, name: String?, id: UUID?, scanning: Bool) -> [String: Any] {
        return ["state": state, "name": js(name), "id": js(id?.uuidString), "scanning": scanning]
    }
}
