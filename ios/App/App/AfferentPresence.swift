import Capacitor
import CoreBluetooth
import CryptoKit
import Network
import UIKit

/// Radios for Settings › Home and visitors (off until the patient turns it on).
///
/// No decisions here. The logic is demo/js/presence-core.js, a port of Vlad's
/// jetson/presence/core.py; this plugin only reports what iOS lets an app see, and only while
/// the app is in the foreground:
///   - Bluetooth LE adverts from an unfiltered scan (own CBCentralManager, independent of any
///     other Bluetooth plugin in the app), batched per device between two `drain` calls
///   - whether the phone is on Wi-Fi (NWPathMonitor)
///   - which stay-at-home devices (TV, speakers, printer, smart home) answer Bonjour on this
///     Wi-Fi, as salted SHA-256 prefixes, never names
///
/// Not possible on iOS, so not here: Wi-Fi scanning and the ARP table (no API); the SSID/BSSID
/// (NEHotspotNetwork needs the Access Wi-Fi Information entitlement, and personal teams cannot
/// sign it: Xcode refuses the provisioning profile); unfiltered BLE scans in the background
/// (iOS delivers nothing without a service filter there).
///
/// JS: start({lan}) -> status, drain() -> {devices, status, dropped}, stop(), event "state".
@objc(AfferentPresencePlugin)
public class AfferentPresencePlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate {
    public let identifier = "AfferentPresencePlugin"
    public let jsName = "AfferentPresence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise),
    ]

    /// Device types that stay at home. Each must also be listed in Info.plist NSBonjourServices,
    /// or iOS refuses to browse it. Left out on purpose: types laptops, iPads and phones
    /// announce (_companion-link, _ssh, _smb, _device-info), since those travel.
    static let homeServiceTypes = [
        "_airplay._tcp", "_raop._tcp", "_googlecast._tcp", "_spotify-connect._tcp", "_sonos._tcp",
        "_hap._tcp", "_hap._udp", "_homekit._tcp", "_matter._tcp", "_meshcop._udp", "_hue._tcp",
        "_ipp._tcp", "_ipps._tcp", "_printer._tcp", "_pdl-datastream._tcp", "_uscan._tcp",
        "_amzn-wplay._tcp", "_androidtvremote2._tcp",
    ]
    private static let maxDevices = 3000      // per drain; a crowded hall reached ~440 in 15 s
    private static let rssiKept = 20          // last RSSI values per device per drain

    private struct Heard {
        var first: Double
        var last: Double
        var rssi: [Int]
        var name: String?
        var mfg: String?
        var uuids: Set<String>
    }

    private let q = DispatchQueue(label: "afferent.presence")
    private var wanted = false
    private var wantLan = true
    private var foreground = false
    private var central: CBCentralManager?
    private var heard: [UUID: Heard] = [:]
    private var dropped = 0
    private var path: NWPathMonitor?
    private var onWifi = false
    private var browsers: [String: NWBrowser] = [:]
    private var browserHealth: [String: String] = [:]
    private var visibleByType: [String: Set<String>] = [:]
    private var lanState = "off"
    private var observing = false

    /// Called from start(): independent of whether the bridge calls load() for instances.
    private func observeLifecycle() {
        guard !observing else { return }
        observing = true
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(willResignActive), name: UIApplication.willResignActiveNotification, object: nil)
    }

    @objc private func didBecomeActive() { q.async { self.foreground = true; self.resume() } }
    @objc private func willResignActive() { q.async { self.foreground = false; self.pause() } }

    // MARK: JS API

    @objc func start(_ call: CAPPluginCall) {
        let lan = call.getBool("lan") ?? true
        DispatchQueue.main.async {
            self.observeLifecycle()
            let active = UIApplication.shared.applicationState == .active
            self.q.async {
                self.wanted = true
                self.wantLan = lan
                self.foreground = active
                if self.central == nil {
                    // Creating the manager is what shows the Bluetooth permission prompt the first time.
                    self.central = CBCentralManager(delegate: self, queue: self.q,
                                                    options: [CBCentralManagerOptionShowPowerAlertKey: false])
                }
                if self.path == nil {
                    let m = NWPathMonitor(requiredInterfaceType: .wifi)
                    m.pathUpdateHandler = { [weak self] p in
                        guard let self else { return }
                        let wifi = p.status == .satisfied
                        guard wifi != self.onWifi else { return }
                        self.onWifi = wifi
                        self.stopBrowsing()
                        self.resume()
                    }
                    m.start(queue: self.q)
                    self.path = m
                }
                self.resume()
                call.resolve(self.status())
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        q.async {
            self.wanted = false
            self.pause()
            self.central?.delegate = nil
            self.central = nil
            self.path?.cancel()
            self.path = nil
            self.onWifi = false
            self.heard.removeAll()
            self.dropped = 0
            call.resolve()
        }
    }

    @objc func drain(_ call: CAPPluginCall) {
        q.async {
            let devices: [[String: Any]] = self.heard.map { id, h in
                var d: [String: Any] = ["id": id.uuidString.lowercased(), "first": h.first, "last": h.last,
                                        "rssi": h.rssi, "uuids": Array(h.uuids)]
                if let n = h.name { d["name"] = n }
                if let m = h.mfg { d["mfg"] = m }
                return d
            }
            let dropped = self.dropped
            self.heard.removeAll(keepingCapacity: true)
            self.dropped = 0
            call.resolve(["devices": devices, "dropped": dropped, "status": self.status()])
        }
    }

    // MARK: lifecycle

    /// Radios run only while JS asked for them and the app is in the foreground.
    private func resume() {
        guard wanted, foreground else { return }
        if let c = central, c.state == .poweredOn, !c.isScanning {
            // Unfiltered and with duplicates: every advert, so RSSI can be smoothed. Foreground only.
            c.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        }
        if wantLan, onWifi, browsers.isEmpty { startBrowsing() }
    }

    private func pause() {
        if let c = central, c.state == .poweredOn, c.isScanning { c.stopScan() }
        stopBrowsing()
    }

    private func status() -> [String: Any] {
        [
            "bluetooth": Self.name(central?.state),
            "authorization": Self.name(CBManager.authorization),
            "scanning": central?.isScanning ?? false,
            "foreground": foreground,
            "wifi": onWifi,
            "lan": lanState,
            "lanDevices": Array(visibleByType.values.reduce(into: Set<String>()) { $0.formUnion($1) }),
            "t": Date().timeIntervalSince1970,
        ]
    }

    // MARK: Bluetooth

    public func centralManagerDidUpdateState(_ c: CBCentralManager) {
        if c.state == .poweredOn { resume() }
        notifyListeners("state", data: status())
    }

    public func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral,
                               advertisementData ad: [String: Any], rssi RSSI: NSNumber) {
        let rssi = RSSI.intValue
        guard rssi < 0 else { return }   // 127 = RSSI not available
        let now = Date().timeIntervalSince1970
        var h: Heard
        if let old = heard[p.identifier] {
            h = old
        } else {
            guard heard.count < Self.maxDevices else { dropped += 1; return }
            h = Heard(first: now, last: now, rssi: [], name: nil, mfg: nil, uuids: [])
        }
        h.last = now
        h.rssi.append(rssi)
        if h.rssi.count > Self.rssiKept { h.rssi.removeFirst(h.rssi.count - Self.rssiKept) }
        if let n = ad[CBAdvertisementDataLocalNameKey] as? String ?? p.name { h.name = n }
        if let m = ad[CBAdvertisementDataManufacturerDataKey] as? Data, m.count >= 2 {
            h.mfg = m.map { String(format: "%02x", $0) }.joined()
        }
        for u in (ad[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? [])
            + (ad[CBAdvertisementDataOverflowServiceUUIDsKey] as? [CBUUID] ?? []) {
            h.uuids.insert(u.uuidString)
        }
        if let sd = ad[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data] {
            for u in sd.keys { h.uuids.insert(u.uuidString) }
        }
        heard[p.identifier] = h
    }

    // MARK: home Wi-Fi (Bonjour)

    private func startBrowsing() {
        stopBrowsing()
        lanState = "starting"
        for type in Self.homeServiceTypes {
            let params = NWParameters()
            params.includePeerToPeer = false
            let b = NWBrowser(for: .bonjour(type: type, domain: nil), using: params)
            b.stateUpdateHandler = { [weak self] s in self?.browserChanged(type, s) }
            b.browseResultsChangedHandler = { [weak self] results, _ in self?.resultsChanged(type, results) }
            browsers[type] = b
            b.start(queue: q)
        }
    }

    private func stopBrowsing() {
        let old = browsers
        browsers.removeAll()
        old.values.forEach { $0.cancel() }
        browserHealth.removeAll()
        visibleByType.removeAll()
        lanState = "off"
    }

    private func browserChanged(_ type: String, _ s: NWBrowser.State) {
        guard browsers[type] != nil else { return }
        switch s {
        case .ready: browserHealth[type] = "ready"
        case .failed(let err), .waiting(let err):
            // -65570 PolicyDenied: Local Network permission off. -65555 NoAuth: type missing in NSBonjourServices.
            if case .dns(let code) = err, code == -65570 { browserHealth[type] = "denied" } else { browserHealth[type] = "failed" }
        default: return
        }
        let h = Array(browserHealth.values)
        if h.contains("denied") { lanState = "denied" }
        else if h.contains("ready") { lanState = "ready" }
        else if h.count == browsers.count { lanState = "failed" }
        else { lanState = "starting" }
    }

    private func resultsChanged(_ type: String, _ results: Set<NWBrowser.Result>) {
        guard browsers[type] != nil else { return }
        visibleByType[type] = Set(results.compactMap { r -> String? in
            if case let .service(name, _, _, _) = r.endpoint { return Self.deviceKey(type: type, name: name) }
            return nil
        })
    }

    /// One device announces several types (a HomePod: _airplay "Kitchen", _raop "A1B2C3D4E5F6@Kitchen"),
    /// so key on the plain lower-cased name, then keep only a hash: the patient's device names
    /// never leave this function.
    static func deviceKey(type: String, name: String) -> String {
        var n = Substring(name)
        if type.hasPrefix("_raop"), let at = n.firstIndex(of: "@") { n = n[n.index(after: at)...] }
        let plain = n.trimmingCharacters(in: .whitespaces).lowercased()
        let digest = SHA256.hash(data: Data(("afferent-home:" + plain).utf8))
        return digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: names

    private static func name(_ state: CBManagerState?) -> String {
        guard let state else { return "off" }
        switch state {
        case .poweredOn: return "poweredOn"
        case .poweredOff: return "poweredOff"
        case .unauthorized: return "unauthorized"
        case .unsupported: return "unsupported"
        case .resetting: return "resetting"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }

    private static func name(_ a: CBManagerAuthorization) -> String {
        switch a {
        case .allowedAlways: return "allowedAlways"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }
}
