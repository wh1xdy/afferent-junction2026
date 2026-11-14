import CoreBluetooth
import Foundation

/// Reads the finger PulseSensors on the UNO Q over Bluetooth LE.
/// The UNO Q advertises "Afferent Finger": the standard Heart Rate Service (0x180D) carries
/// the fused reading of both sensors; custom AFF0/AFF1 carries each sensor [finger 1, finger 2].
/// Any heart-rate strap works for the main reading too.
final class FingerSensor: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    enum State: Equatable { case off, unauthorized, scanning, connecting, connected }

    @Published var state: State = .off
    @Published var bpm: Int?
    @Published var sensors: [Int?] = [nil, nil]   // per sensor, detail only
    @Published var name: String?
    @Published var lastUpdate: Date?
    @Published var sensorsUpdate: Date?

    private static let heartRateService = CBUUID(string: "180D")
    private static let measurement = CBUUID(string: "2A37")
    private static let afferentService = CBUUID(string: "AFF0")   // both fingers: [bpm1, bpm2]
    private static let bothFingers = CBUUID(string: "AFF1")

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    /// stale after 5 s without a beat (finger off, sensor unplugged)
    var freshBpm: Int? {
        guard let bpm, let t = lastUpdate, Date().timeIntervalSince(t) < 5 else { return nil }
        return bpm
    }

    var freshSensors: [Int?] {
        guard let t = sensorsUpdate, Date().timeIntervalSince(t) < 5 else { return [nil, nil] }
        return sensors
    }

    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        switch c.state {
        case .poweredOn: scan()
        case .unauthorized: state = .unauthorized
        default: state = .off
        }
    }

    private func scan() {
        state = .scanning
        // prefer our board by name, but accept any heart-rate peripheral
        central.scanForPeripherals(withServices: [Self.heartRateService])
    }

    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let advName = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? p.name
        if peripheral != nil && advName != "Afferent Finger" { return }
        c.stopScan()
        peripheral = p
        name = advName
        p.delegate = self
        state = .connecting
        c.connect(p)
    }

    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        state = .connected
        p.discoverServices([Self.heartRateService, Self.afferentService])
    }

    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { reset() }
    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) { reset() }

    private func reset() {
        peripheral = nil
        bpm = nil
        sensors = [nil, nil]
        scan()
    }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        for s in p.services ?? [] {
            if s.uuid == Self.heartRateService { p.discoverCharacteristics([Self.measurement], for: s) }
            if s.uuid == Self.afferentService { p.discoverCharacteristics([Self.bothFingers], for: s) }
        }
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        for ch in s.characteristics ?? [] where ch.uuid == Self.measurement || ch.uuid == Self.bothFingers {
            p.setNotifyValue(true, for: ch)
            p.readValue(for: ch)
        }
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        if ch.uuid == Self.bothFingers {
            // [finger 1, finger 2], 0 = no reading
            guard let d = ch.value, d.count >= 2 else { return }
            let b = [UInt8](d)
            sensors = [b[0] > 0 ? Int(b[0]) : nil, b[1] > 0 ? Int(b[1]) : nil]
            sensorsUpdate = Date()
            return
        }
        guard let v = Self.parse(ch.value) else { return }
        bpm = v
        lastUpdate = Date()
    }

    /// Heart Rate Measurement (0x2A37): flags bit 0 = 16-bit value
    static func parse(_ data: Data?) -> Int? {
        guard let d = data, d.count >= 2 else { return nil }
        let bytes = [UInt8](d)
        let value = bytes[0] & 0x01 == 0 ? Int(bytes[1]) : (d.count >= 3 ? Int(bytes[1]) | Int(bytes[2]) << 8 : nil)
        guard let v = value, v > 0 else { return nil }
        return v
    }
}
