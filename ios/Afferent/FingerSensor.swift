import CoreBluetooth
import Foundation

/// Reads the finger PulseSensor on the UNO Q over Bluetooth LE.
/// The UNO Q advertises the standard Heart Rate Service (0x180D) as "Afferent Finger";
/// any heart-rate strap would work here too.
final class FingerSensor: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    enum State: Equatable { case off, unauthorized, scanning, connecting, connected }

    @Published var state: State = .off
    @Published var bpm: Int?
    @Published var name: String?
    @Published var lastUpdate: Date?

    private static let heartRateService = CBUUID(string: "180D")
    private static let measurement = CBUUID(string: "2A37")

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
        p.discoverServices([Self.heartRateService])
    }

    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { reset() }
    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) { reset() }

    private func reset() {
        peripheral = nil
        bpm = nil
        scan()
    }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        for s in p.services ?? [] where s.uuid == Self.heartRateService {
            p.discoverCharacteristics([Self.measurement], for: s)
        }
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        for ch in s.characteristics ?? [] where ch.uuid == Self.measurement {
            p.setNotifyValue(true, for: ch)
            p.readValue(for: ch)
        }
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
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
