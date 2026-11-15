import Capacitor
import CoreBluetooth

/// A watch or chest strap over the standard Bluetooth Heart Rate Service, for the web layer: a Garmin watch with
/// "Broadcast heart rate" (or Virtual HR) on, a Polar or Wahoo strap, any device that sends 180D / 2A37.
///
/// JS: Capacitor.Plugins.AfferentWatch (demo/js/watch.js)
///   scan()               -> {state}   lists heart-rate devices nearby for 30 s (event "device"). The first call shows
///                                     the Bluetooth permission prompt. Connects to none of them.
///   stopScan()           -> {}
///   connect({id, name})  -> {state, name, id, scanning}   connects to that device and reconnects whenever it is back in
///                                     range, until disconnect(). id = the CBPeripheral identifier from a "device" event.
///   disconnect()         -> {}        lets go of the device, and of Bluetooth when no scan runs
///   status()             -> {state, name, id, scanning}
///   event "state":   {state: 'off'|'unauthorized'|'unsupported'|'idle'|'connecting'|'connected', name, id, scanning}
///   event "device":  {id, name, rssi}
///   event "reading": {kind: 'hr', bpm, contact, energy_kj, rr_ms, t_ms}   every 2A37 notification, parsed in full
///   t_ms = wall clock (ms since 1970) when the notification arrived on the phone.
///
/// Rules (bytes and the listing rule: HeartRateParser.swift):
///  - It connects only to the device the patient chose (connect({id})). A scan only lists; nothing seen in a scan is
///    connected by itself. The Afferent finger box, which also advertises 180D, is never listed (AfferentFinger owns it).
///  - It only subscribes to notifications and never reads the stored value, so every reading is one the device sent
///    just now.
///  - It reports what the device sent. Freshness, quality, RMSSD and what a value may be used for are decided by the
///    web layer (demo/js/hrv.js, sensors.js).
///  - A pending CoreBluetooth connect never times out: iOS connects as soon as the chosen device is in range again,
///    which is the reconnect. After a failed setup it tries again after a pause.
@objc(AfferentWatchPlugin)
public class AfferentWatchPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    public let identifier = "AfferentWatchPlugin"
    public let jsName = "AfferentWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    private static let heartRateService = CBUUID(string: "180D")
    private static let measurement = CBUUID(string: "2A37")
    private static let scanSeconds: TimeInterval = 30
    private static let retrySeconds: TimeInterval = 5

    // Main queue only: plugin calls hop there and the central manager delivers there.
    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    /// The device the patient chose, and its name as listed.
    private var target: UUID?
    private var targetName: String?
    /// scan() was called and has not ended; `scanning` = the radio scans right now (for the list, or for the target).
    private var listing = false
    private var scanning = false
    private var scanTurn = 0
    private var retryTurn = 0
    private var linkState = "off"
    /// Peripherals seen in this session: connect() needs the object.
    private var seen: [UUID: CBPeripheral] = [:]

    // MARK: - Plugin methods

    @objc func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.listing = true
            self.scanTurn += 1
            let turn = self.scanTurn
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.scanSeconds) { [weak self] in
                guard let self = self, self.scanTurn == turn else { return }
                self.listing = false
                self.updateScan()
            }
            self.ensureCentral()
            self.updateScan()
            self.listConnected()
            call.resolve(["state": self.linkState])
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.listing = false
            self.scanTurn += 1
            self.updateScan()
            self.releaseIfIdle()
            call.resolve()
        }
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let raw = call.getString("id"), let id = UUID(uuidString: raw) else {
            call.reject("id is not a device id from a scan", "bad_id")
            return
        }
        let name = call.getString("name")
        DispatchQueue.main.async {
            if self.target != id { self.dropPeripheral() }
            self.target = id
            self.targetName = name
            self.ensureCentral()
            self.connectIfReady()
            call.resolve(self.stateData())
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.target = nil
            self.targetName = nil
            self.dropPeripheral()
            self.updateScan()
            self.releaseIfIdle()
            call.resolve()
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.stateData()) }
    }

    // MARK: - State

    private func stateData() -> [String: Any] {
        HeartRateParser.stateEvent(state: linkState, name: targetName ?? peripheral?.name, id: target, scanning: scanning)
    }

    private func set(_ state: String) {
        linkState = state
        notifyListeners("state", data: stateData())
    }

    /// Created on the first scan() or connect(), never at app start: this is what shows the Bluetooth prompt.
    private func ensureCentral() {
        guard central == nil else { return }
        central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionShowPowerAlertKey: false])
    }

    /// Nothing chosen and no list wanted: Bluetooth is let go.
    private func releaseIfIdle() {
        guard target == nil, !listing, let c = central else { return }
        if c.state == .poweredOn { c.stopScan() }
        c.delegate = nil
        central = nil
        scanning = false
        seen.removeAll()
        set("off")
    }

    private func dropPeripheral() {
        retryTurn += 1
        if let p = peripheral {
            p.delegate = nil
            central?.cancelPeripheralConnection(p)
        }
        peripheral = nil
    }

    /// Scan while the patient wants the list, or while the chosen device is unknown to iOS and has to be found again.
    private func updateScan() {
        guard let c = central, c.state == .poweredOn else { scanning = false; return }
        let want = listing || (target != nil && peripheral == nil)
        if want && !scanning {
            c.scanForPeripherals(withServices: [Self.heartRateService], options: nil)
            scanning = true
            notifyListeners("state", data: stateData())
        } else if !want && scanning {
            c.stopScan()
            scanning = false
            notifyListeners("state", data: stateData())
        }
    }

    /// Heart-rate devices this phone is already connected to (through another app) do not advertise: list them too.
    private func listConnected() {
        guard listing, let c = central, c.state == .poweredOn else { return }
        for p in c.retrieveConnectedPeripherals(withServices: [Self.heartRateService]) {
            seen[p.identifier] = p
            if let name = HeartRateParser.listedName(advertisedName: nil, peripheralName: p.name) {
                notifyListeners("device", data: HeartRateParser.deviceEvent(id: p.identifier, name: name, rssi: nil))
            }
        }
    }

    private func connectIfReady() {
        guard let c = central, c.state == .poweredOn, let id = target else { return }
        if let p = peripheral, p.identifier == id {
            if p.state == .disconnected { c.connect(p, options: nil) }
            if linkState != "connected" { set("connecting") }
            return
        }
        // The object: from this session's scan, or from iOS, which knows every device this app has seen before.
        guard let p = seen[id] ?? c.retrievePeripherals(withIdentifiers: [id]).first else {
            set("connecting")
            updateScan()                         // not known right now: look for it (only it is connected)
            return
        }
        peripheral = p
        p.delegate = self
        set("connecting")
        c.connect(p, options: nil)               // pending until the device is in range: no timeout
        updateScan()
    }

    /// Setting the link up failed: let go and try again after a pause, so a broken device cannot loop.
    private func retryLater() {
        dropPeripheral()
        set(target == nil ? "idle" : "connecting")
        let turn = retryTurn
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.retrySeconds) { [weak self] in
            guard let self = self, self.retryTurn == turn else { return }
            self.connectIfReady()
        }
    }

    // MARK: - CBCentralManagerDelegate

    public func centralManagerDidUpdateState(_ c: CBCentralManager) {
        guard c === central else { return }
        switch c.state {
        case .poweredOn:
            set(target == nil ? "idle" : "connecting")
            scanning = false
            updateScan()
            listConnected()
            connectIfReady()
        case .unauthorized:
            lost("unauthorized")
        case .unsupported:
            lost("unsupported")
        default:
            lost("off")
        }
    }

    /// Bluetooth is not usable: every peripheral object is invalid now.
    private func lost(_ state: String) {
        retryTurn += 1
        peripheral?.delegate = nil
        peripheral = nil
        seen.removeAll()
        scanning = false
        set(state)
    }

    public func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral,
                               advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard c === central else { return }
        seen[p.identifier] = p
        let advertised = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        if listing, let name = HeartRateParser.listedName(advertisedName: advertised, peripheralName: p.name) {
            notifyListeners("device", data: HeartRateParser.deviceEvent(id: p.identifier, name: name, rssi: RSSI.intValue))
        }
        if HeartRateParser.isChosen(p.identifier, chosen: target), peripheral == nil { connectIfReady() }
    }

    public func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        guard c === central, p === peripheral else { return }
        p.discoverServices([Self.heartRateService])
    }

    public func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        guard c === central, p === peripheral else { return }
        retryLater()
    }

    public func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        guard c === central, p === peripheral, target != nil else { return }
        set("connecting")
        c.connect(p, options: nil)               // out of range or switched off: connect again when it is back
    }

    // MARK: - CBPeripheralDelegate

    public func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard p === peripheral else { return }
        guard error == nil, let s = p.services?.first(where: { $0.uuid == Self.heartRateService }) else {
            retryLater()                          // not a heart-rate device (any more), or discovery failed
            return
        }
        p.discoverCharacteristics([Self.measurement], for: s)
    }

    public func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        guard p === peripheral else { return }
        guard error == nil, let ch = s.characteristics?.first(where: { $0.uuid == Self.measurement }) else {
            retryLater()
            return
        }
        p.setNotifyValue(true, for: ch)          // notifications only, never a stored value
    }

    public func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor ch: CBCharacteristic, error: Error?) {
        guard p === peripheral, ch.uuid == Self.measurement else { return }
        if error != nil || !ch.isNotifying {
            retryLater()
            return
        }
        set("connected")
    }

    public func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        guard p === peripheral, error == nil, ch.uuid == Self.measurement,
              HeartRateParser.isChosen(p.identifier, chosen: target),
              let m = HeartRateParser.measurement(ch.value) else { return }
        notifyListeners("reading", data: HeartRateParser.readingEvent(m, tMs: Date().timeIntervalSince1970 * 1000))
    }
}
