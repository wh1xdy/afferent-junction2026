import Capacitor
import CoreBluetooth

/// Finger pulse sensor on the UNO Q ("Afferent Finger") over Bluetooth LE, for the web layer.
///
/// JS: Capacitor.Plugins.AfferentFinger
///   start()  -> {state}          switches Bluetooth on for this app (first call shows the
///                                permission prompt) and keeps looking for the sensor
///   stop()   -> {}               disconnects and releases Bluetooth
///   status() -> {state, name}
///   event "state":   {state: 'off'|'unauthorized'|'unsupported'|'scanning'|'connecting'|'connected',
///                     name: String|null}                              on every change
///   event "reading": {kind: 'hrm', bpm, t_ms}                         2A37 notification with a pulse
///                    {kind: 'aff1', finger_bpm: [Int|null, Int|null], breathing_per_min: Int|null,
///                     rmssd_ms: Int|null, quality: 0..1|null, presence: 'idle'|'probing'|'active'|null,
///                     payload_len: Int, t_ms}                          AFF1 notification
///   t_ms = wall clock (ms since 1970) when the notification arrived on the phone.
///
/// Rules this plugin keeps (byte formats: uno-q/SENSORS.md, parsing: AfferentFingerParser.swift):
///  - It connects only to a peripheral named exactly "Afferent Finger" that also has the AFF0
///    service. A stranger's heart-rate strap must never be shown as the patient's finger.
///  - It only subscribes to notifications and never asks the peripheral for a stored value, so
///    every "reading" is a value the board sent just now. (A stored value can be minutes old and
///    would be stamped as fresh.)
///  - It reports what the board sent. Staleness, the quality limit and what a value may be used
///    for are decided by the web layer.
@objc(AfferentFingerPlugin)
public class AfferentFingerPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    public let identifier = "AfferentFingerPlugin"
    public let jsName = "AfferentFinger"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    private static let heartRateService = CBUUID(string: "180D")
    private static let measurement = CBUUID(string: "2A37")
    private static let afferentService = CBUUID(string: "AFF0")
    private static let fingerValues = CBUUID(string: "AFF1")
    /// CoreBluetooth never gives up on a connection attempt by itself
    private static let connectTimeout: TimeInterval = 10

    // All of this is touched on the main queue only (plugin calls hop there, the central
    // manager delivers its delegate calls there).
    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var linkState = "off"
    private var linkName: String?
    /// Peripherals this session will not connect to again: the right name but no AFF0 service
    /// (not our board), or service discovery failed three times in a row. Cleared by stop().
    private var ignored = Set<UUID>()
    private var discoveryFailures: [UUID: Int] = [:]
    private var connectAttempt = 0

    // MARK: - Plugin methods

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.central == nil {
                // Created here and not at app start: this is what shows the Bluetooth permission
                // prompt. The web layer (demo/js/finger.js, Finger.arm) calls start() only with the
                // pulse stone switch on and once the patient has opened Settings or Your signals or
                // started a session, never at first launch. The manager reports its state in
                // centralManagerDidUpdateState; until then the state stays "off".
                self.central = CBCentralManager(
                    delegate: self, queue: .main,
                    options: [CBCentralManagerOptionShowPowerAlertKey: false])
            }
            call.resolve(["state": self.linkState])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.connectAttempt += 1                 // cancels a pending connect timeout
            if let central = self.central {
                if central.state == .poweredOn { central.stopScan() }
                if let p = self.peripheral { central.cancelPeripheralConnection(p) }
                central.delegate = nil
            }
            self.peripheral?.delegate = nil
            self.peripheral = nil
            self.central = nil
            self.ignored.removeAll()
            self.discoveryFailures.removeAll()
            self.set(state: "off", name: nil)
            call.resolve()
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["state": self.linkState, "name": self.linkName ?? NSNull()])
        }
    }

    // MARK: - State

    private func set(state newState: String, name newName: String?) {
        guard newState != linkState || newName != linkName else { return }
        linkState = newState
        linkName = newName
        notifyListeners("state", data: ["state": newState, "name": newName ?? NSNull()])
    }

    private func scan() {
        guard let central = central, central.state == .poweredOn else { return }
        connectAttempt += 1
        peripheral?.delegate = nil
        peripheral = nil
        set(state: "scanning", name: nil)
        // The board may already be connected to this phone through another app (the link is
        // shared by iOS); such a peripheral does not advertise, so a scan alone would miss it.
        for p in central.retrieveConnectedPeripherals(withServices: [Self.heartRateService]) {
            if consider(p, advertisedName: nil) { return }
        }
        central.scanForPeripherals(withServices: [Self.heartRateService], options: nil)
    }

    /// Connects when the peripheral is our board. Returns true if a connection was started.
    private func consider(_ p: CBPeripheral, advertisedName: String?) -> Bool {
        guard let central = central, peripheral == nil, !ignored.contains(p.identifier),
              AfferentFingerParser.isAfferentFinger(advertisedName: advertisedName, peripheralName: p.name)
        else { return false }
        central.stopScan()
        peripheral = p
        p.delegate = self
        set(state: "connecting", name: AfferentFingerParser.deviceName)
        central.connect(p, options: nil)
        connectAttempt += 1
        let attempt = connectAttempt
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.connectTimeout) { [weak self] in
            guard let self = self, self.connectAttempt == attempt, self.linkState == "connecting",
                  let central = self.central, let p = self.peripheral else { return }
            central.cancelPeripheralConnection(p)    // out of range or gone: look again
            self.scan()
        }
        return true
    }

    /// Drop the current peripheral and look again. A peripheral that keeps failing is ignored
    /// too, so a broken link cannot turn into an endless connect / fail loop.
    private func drop(_ p: CBPeripheral, ignore: Bool) {
        let failures = (discoveryFailures[p.identifier] ?? 0) + 1
        discoveryFailures[p.identifier] = failures
        if ignore || failures >= 3 { ignored.insert(p.identifier) }
        central?.cancelPeripheralConnection(p)
        if p === peripheral { scan() }
    }

    // MARK: - CBCentralManagerDelegate

    public func centralManagerDidUpdateState(_ c: CBCentralManager) {
        guard c === central else { return }
        switch c.state {
        case .poweredOn:
            scan()
        case .unauthorized:
            lost(state: "unauthorized")
        case .unsupported:
            lost(state: "unsupported")
        default:                                     // powered off, resetting, unknown
            lost(state: "off")
        }
    }

    /// Bluetooth is not usable: any peripheral object is invalid now.
    private func lost(state newState: String) {
        connectAttempt += 1
        peripheral?.delegate = nil
        peripheral = nil
        set(state: newState, name: nil)
    }

    public func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral,
                               advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard c === central else { return }
        _ = consider(p, advertisedName: advertisementData[CBAdvertisementDataLocalNameKey] as? String)
    }

    public func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        guard c === central, p === peripheral else { return }
        // still "connecting": it counts as connected once the AFF0 service is confirmed
        p.discoverServices([Self.heartRateService, Self.afferentService])
    }

    public func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        guard c === central, p === peripheral else { return }
        scan()
    }

    public func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        guard c === central, p === peripheral else { return }
        scan()
    }

    // MARK: - CBPeripheralDelegate

    public func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard p === peripheral else { return }
        if error != nil {
            drop(p, ignore: false)                   // discovery failed: try again
            return
        }
        let services = p.services ?? []
        guard services.contains(where: { $0.uuid == Self.afferentService }) else {
            drop(p, ignore: true)                    // right name, not our board
            return
        }
        connectAttempt += 1                          // connected: the timeout no longer applies
        discoveryFailures[p.identifier] = nil
        set(state: "connected", name: AfferentFingerParser.deviceName)
        for s in services {
            if s.uuid == Self.heartRateService { p.discoverCharacteristics([Self.measurement], for: s) }
            if s.uuid == Self.afferentService { p.discoverCharacteristics([Self.fingerValues], for: s) }
        }
    }

    public func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        guard p === peripheral else { return }
        if error != nil {
            drop(p, ignore: false)                   // "connected" without notifications would never recover
            return
        }
        for ch in s.characteristics ?? [] where ch.uuid == Self.measurement || ch.uuid == Self.fingerValues {
            p.setNotifyValue(true, for: ch)          // notifications only, see the rules above
        }
    }

    public func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        guard p === peripheral, error == nil else { return }
        let tMs = Date().timeIntervalSince1970 * 1000
        if ch.uuid == Self.fingerValues {
            guard let reading = AfferentFingerParser.aff1(ch.value) else { return }
            notifyListeners("reading", data: AfferentFingerParser.aff1Event(reading, tMs: tMs))
        } else if ch.uuid == Self.measurement {
            guard let bpm = AfferentFingerParser.heartRate(ch.value) else { return }
            notifyListeners("reading", data: AfferentFingerParser.hrmEvent(bpm: bpm, tMs: tMs))
        }
    }
}
