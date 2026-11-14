// Heart Duel bridge: "Afferent Finger" (Bluetooth LE) -> http://localhost:8765 (page + Server-Sent Events).
//
//   swiftc -O bridge.swift -o heart-duel
//   ./heart-duel            real sensor
//   ./heart-duel --demo     no Bluetooth, two simulated players (the page shows SIMULATED)
//
// It forwards what the sensor sends, byte for byte, with the time it arrived. Deciding what
// is fresh enough to show is the page's job (game.js), so that logic has one tested home.
// Everything runs on the main queue: no locks.
//
// Stream (GET /events):
//   event: status  data: {"mode":"ble"|"demo","link":"...","aff1":bool,"t":ms}   on change and every second
//   event: aff1    data: {"t":ms,"kind":"read"|"notify"|"snapshot","b":[f1,f2,breath,rmssd]}
//   event: hr      data: {"t":ms,"kind":"read"|"notify"|"snapshot","bpm":n}       fused pulse (2A37)
// link: starting | bluetooth-off | unauthorized | unsupported | scanning | connecting | subscribing | connected

import CoreBluetooth
import Foundation
import Network

// ── options ─────────────────────────────────────────────────────────────────────────

var demo = false
var port: UInt16 = 8765
var pagePath: String? = nil
var runFor: Double? = nil
var quiet = false

func usage() -> Never {
    print("""
    usage: heart-duel [--demo] [--port 8765] [--page index.html] [--for seconds] [--quiet]
      --demo     no Bluetooth: two simulated players, the page shows a SIMULATED badge
      --port     local port to serve on (default 8765, loopback only)
      --page     the page to serve (default: index.html next to this program)
      --for      stop after this many seconds and print what was received
      --quiet    do not log every packet
    """)
    exit(2)
}

var args = Array(CommandLine.arguments.dropFirst())
while !args.isEmpty {
    let a = args.removeFirst()
    func value() -> String { if args.isEmpty { usage() }; return args.removeFirst() }
    switch a {
    case "--demo": demo = true
    case "--quiet": quiet = true
    case "--port": guard let p = UInt16(value()), p > 0 else { usage() }; port = p
    case "--page": pagePath = value()
    case "--for": guard let s = Double(value()), s > 0 else { usage() }; runFor = s
    default: usage()
    }
}

setvbuf(stdout, nil, _IOLBF, 0)
let started = DispatchTime.now().uptimeNanoseconds
func nowMs() -> Int { Int((DispatchTime.now().uptimeNanoseconds - started) / 1_000_000) }
func log(_ s: String) { print(String(format: "%7.2f  ", Double(nowMs()) / 1000) + s) }

func findPage() -> URL {
    var candidates: [URL] = []
    if let p = pagePath { candidates.append(URL(fileURLWithPath: p)) }
    else {
        let exe = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        candidates.append(exe.deletingLastPathComponent().appendingPathComponent("index.html"))
        candidates.append(URL(fileURLWithPath: "index.html"))
    }
    for c in candidates where FileManager.default.isReadableFile(atPath: c.path) { return c }
    print("heart-duel: page not found (looked for \(candidates.map { $0.path }.joined(separator: ", "))). Use --page.")
    exit(1)
}
let pageURL = findPage()

// ── state + stream ──────────────────────────────────────────────────────────────────

final class Hub {
    let mode: String
    private(set) var link = "starting"
    var aff1Found = false
    private(set) var lastAff1: [UInt8]? = nil
    private(set) var lastHR: Int? = nil
    private var clients: [ObjectIdentifier: NWConnection] = [:]
    private(set) var counts: [String: Int] = [:]

    init(mode: String) { self.mode = mode }

    var statusJSON: String {
        "{\"mode\":\"\(mode)\",\"link\":\"\(link)\",\"aff1\":\(aff1Found),\"t\":\(nowMs())}"
    }
    var stateJSON: String {
        let a = lastAff1.map { "[\($0.map(String.init).joined(separator: ","))]" } ?? "null"
        return "{\"mode\":\"\(mode)\",\"link\":\"\(link)\",\"aff1\":\(aff1Found),\"t\":\(nowMs()),"
            + "\"lastAff1\":\(a),\"lastHr\":\(lastHR.map(String.init) ?? "null"),\"clients\":\(clients.count)}"
    }

    func setLink(_ new: String) {
        guard new != link else { return }
        link = new
        if new != "connected" { lastAff1 = nil; lastHR = nil }   // a held value says nothing once the link is gone
        if new == "starting" || new == "scanning" { aff1Found = false }
        log("link: \(new)")
        send("status", statusJSON)
    }

    func aff1(_ bytes: [UInt8], kind: String) {
        lastAff1 = bytes
        counts["AFF1 \(kind)", default: 0] += 1
        if !quiet { log("AFF1 \(kind)  \(bytes)") }
        send("aff1", aff1JSON(bytes, kind))
    }

    func hr(_ bpm: Int, kind: String) {
        lastHR = bpm
        counts["2A37 \(kind)", default: 0] += 1
        if !quiet { log("2A37 \(kind)  bpm \(bpm)") }
        send("hr", "{\"t\":\(nowMs()),\"kind\":\"\(kind)\",\"bpm\":\(bpm)}")
    }

    private func aff1JSON(_ b: [UInt8], _ kind: String) -> String {
        "{\"t\":\(nowMs()),\"kind\":\"\(kind)\",\"b\":[\(b.map(String.init).joined(separator: ","))]}"
    }

    func tick() { send("status", statusJSON) }

    func add(_ c: NWConnection) {
        clients[ObjectIdentifier(c)] = c
        var hello = "retry: 1000\n\n" + frame("status", statusJSON)
        // What the sensor last said, marked as a snapshot: the page uses it as a baseline only.
        if let b = lastAff1 { hello += frame("aff1", aff1JSON(b, "snapshot")) }
        if let h = lastHR { hello += frame("hr", "{\"t\":\(nowMs()),\"kind\":\"snapshot\",\"bpm\":\(h)}") }
        write(c, hello)
        log("page connected (\(clients.count) open)")
    }

    func remove(_ c: NWConnection) {
        if clients.removeValue(forKey: ObjectIdentifier(c)) != nil { log("page disconnected (\(clients.count) open)") }
        c.cancel()
    }

    private func frame(_ event: String, _ json: String) -> String { "event: \(event)\ndata: \(json)\n\n" }
    private func send(_ event: String, _ json: String) { let f = frame(event, json); for c in clients.values { write(c, f) } }
    private func write(_ c: NWConnection, _ s: String) {
        c.send(content: s.data(using: .utf8), completion: .contentProcessed { [weak self] err in
            if err != nil { self?.remove(c) }
        })
    }

    func summary() -> String {
        let parts = counts.sorted { $0.key < $1.key }.map { "\($0.key): \($0.value)" }
        return "received: " + (parts.isEmpty ? "nothing" : parts.joined(separator: ", "))
            + "; last AFF1: \(lastAff1.map { "\($0)" } ?? "none"); link at exit: \(link)"
    }
}

// ── local web server (loopback only) ────────────────────────────────────────────────

final class Server {
    let hub: Hub
    var listeners: [NWListener] = []

    init(hub: Hub) { self.hub = hub }

    func start() {
        var ready = 0, failed = 0
        let hosts: [NWEndpoint.Host] = [.ipv4(.loopback), .ipv6(.loopback)]
        for host in hosts {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            params.requiredLocalEndpoint = .hostPort(host: host, port: NWEndpoint.Port(rawValue: port)!)
            guard let l = try? NWListener(using: params) else { failed += 1; continue }
            l.newConnectionHandler = { [weak self] c in self?.accept(c) }
            l.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    ready += 1
                    if ready == 1 { log("serving http://localhost:\(port)  (page: \(pageURL.path))") }
                case .failed(let e):
                    failed += 1
                    if failed == hosts.count { print("heart-duel: cannot listen on port \(port): \(e). Is another heart-duel running? Try --port."); exit(1) }
                default: break
                }
            }
            l.start(queue: .main)
            listeners.append(l)
        }
        if listeners.isEmpty { print("heart-duel: cannot listen on port \(port)"); exit(1) }
    }

    private func accept(_ c: NWConnection) {
        c.start(queue: .main)
        read(c, Data())
    }

    private func read(_ c: NWConnection, _ soFar: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, done, err in
            guard let self = self else { return }
            var buf = soFar
            if let d = data { buf.append(d) }
            if let end = buf.range(of: Data("\r\n\r\n".utf8)) {
                self.respond(c, String(decoding: buf[..<end.lowerBound], as: UTF8.self))
            } else if done || err != nil || buf.count > 16384 {
                c.cancel()
            } else {
                self.read(c, buf)
            }
        }
    }

    private func respond(_ c: NWConnection, _ head: String) {
        let parts = (head.components(separatedBy: "\r\n").first ?? "").split(separator: " ")
        guard parts.count >= 2 else { return reply(c, "400 Bad Request", "text/plain", Data("bad request\n".utf8)) }
        let path = String(parts[1].split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
        guard parts[0] == "GET" else { return reply(c, "405 Method Not Allowed", "text/plain", Data("GET only\n".utf8)) }
        switch path {
        case "/", "/index.html":
            // Read on every request, so the page can be edited without restarting the bridge.
            guard let page = try? Data(contentsOf: pageURL) else {
                return reply(c, "500 Internal Server Error", "text/plain", Data("cannot read \(pageURL.path)\n".utf8))
            }
            reply(c, "200 OK", "text/html; charset=utf-8", page)
        case "/state":
            reply(c, "200 OK", "application/json", Data((hub.stateJSON + "\n").utf8))
        case "/events":
            let h = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\n\r\n"
            c.send(content: Data(h.utf8), completion: .contentProcessed { _ in })
            hub.add(c)
            watch(c)
        default:
            reply(c, "404 Not Found", "text/plain", Data("not found\n".utf8))
        }
    }

    // An event stream only ends when the browser goes away: wait for that.
    private func watch(_ c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 1024) { [weak self] _, _, done, err in
            if done || err != nil { self?.hub.remove(c) } else { self?.watch(c) }
        }
    }

    private func reply(_ c: NWConnection, _ status: String, _ type: String, _ body: Data) {
        var out = Data("HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".utf8)
        out.append(body)
        c.send(content: out, completion: .contentProcessed { _ in c.cancel() })
    }
}

// ── Bluetooth LE ────────────────────────────────────────────────────────────────────

final class Finger: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    static let name = "Afferent Finger"
    static let heartRate = CBUUID(string: "180D"), measurement = CBUUID(string: "2A37")
    static let custom = CBUUID(string: "AFF0"), both = CBUUID(string: "AFF1")

    let hub: Hub
    var central: CBCentralManager!
    var peripheral: CBPeripheral?
    var attempt = 0
    var readFirst: Set<CBUUID> = []      // characteristics whose connect-time read has not come back yet
    var servicesPending = 0              // services whose characteristics are still being discovered
    var ignored: Set<UUID> = []

    init(hub: Hub) {
        self.hub = hub
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func scan() {
        guard central.state == .poweredOn else { return }
        if let p = peripheral { central.cancelPeripheralConnection(p) }
        peripheral = nil
        readFirst = []
        attempt += 1
        hub.setLink("scanning")
        // A peripheral that another app on this Mac already holds does not advertise: ask the system first.
        if let held = central.retrieveConnectedPeripherals(withServices: [Finger.heartRate]).first(where: { $0.name == Finger.name }) {
            log("\(Finger.name) is already connected to this Mac: joining that link")
            connect(held)
            return
        }
        central.scanForPeripherals(withServices: [Finger.heartRate])
    }

    func connect(_ p: CBPeripheral) {
        central.stopScan()
        peripheral = p
        p.delegate = self
        hub.setLink("connecting")
        central.connect(p)
        // CoreBluetooth never gives up on a connect by itself.
        let mine = attempt
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            guard let self = self, self.attempt == mine, self.hub.link != "connected" else { return }
            log("no connection after 12 s: scanning again")
            self.scan()
        }
    }

    func scanSoon() { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.scan() } }

    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        switch c.state {
        case .poweredOn: scan()
        case .poweredOff: peripheral = nil; hub.setLink("bluetooth-off")
        case .unauthorized:
            peripheral = nil; hub.setLink("unauthorized")
            log("Bluetooth is not allowed for this terminal: System Settings > Privacy & Security > Bluetooth")
        case .unsupported: hub.setLink("unsupported")
        default: peripheral = nil; hub.setLink("starting")
        }
    }

    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData ad: [String: Any], rssi: NSNumber) {
        let advertised = ad[CBAdvertisementDataLocalNameKey] as? String
        guard advertised == Finger.name || p.name == Finger.name else {
            // Any heart-rate strap or watch nearby also advertises 180D.
            if ignored.insert(p.identifier).inserted { log("ignoring another heart-rate device: \(advertised ?? p.name ?? "unnamed")") }
            return
        }
        guard peripheral == nil else { return }
        log("found \(Finger.name) (RSSI \(rssi))")
        connect(p)
    }

    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        hub.setLink("subscribing")
        p.discoverServices([Finger.heartRate, Finger.custom])
    }

    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        log("connect failed: \(error?.localizedDescription ?? "unknown")")
        peripheral = nil
        scanSoon()
    }

    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        guard p == peripheral else { return }
        log("disconnected: \(error?.localizedDescription ?? "closed")")
        peripheral = nil
        hub.setLink("scanning")
        scanSoon()
    }

    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        let services = p.services ?? []
        if !services.contains(where: { $0.uuid == Finger.custom }) {
            log("service AFF0 not found: this sensor has no per-finger values, the game cannot run on it")
        }
        servicesPending = 0
        for s in services {
            if s.uuid == Finger.heartRate { servicesPending += 1; p.discoverCharacteristics([Finger.measurement], for: s) }
            if s.uuid == Finger.custom { servicesPending += 1; p.discoverCharacteristics([Finger.both], for: s) }
        }
        if servicesPending == 0 { log("no heart-rate service on this device: scanning again"); scanSoon() }
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        for ch in s.characteristics ?? [] where ch.uuid == Finger.measurement || ch.uuid == Finger.both {
            if ch.uuid == Finger.both { hub.aff1Found = true }
            // Read once, and subscribe only when that read is back: CoreBluetooth reports reads and
            // notifications through the same callback, and the page must know which is which.
            readFirst.insert(ch.uuid)
            p.readValue(for: ch)
        }
        servicesPending -= 1
        if servicesPending == 0 { hub.setLink("connected") }
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
        let kind = readFirst.remove(ch.uuid) != nil ? "read" : "notify"
        if kind == "read" { p.setNotifyValue(true, for: ch) }
        if let e = error { log("\(ch.uuid) \(kind) failed: \(e.localizedDescription)"); return }
        let bytes = [UInt8](ch.value ?? Data())
        if ch.uuid == Finger.both {
            guard bytes.count >= 4 else { log("AFF1 \(kind): unexpected length \(bytes)"); return }
            hub.aff1(Array(bytes[0..<4]), kind: kind)
        } else if ch.uuid == Finger.measurement {
            // Heart Rate Measurement: bit 0 of the flags selects 8 or 16 bit BPM.
            guard bytes.count >= 2 else { log("2A37 \(kind): unexpected length \(bytes)"); return }
            let wide = bytes[0] & 1 == 1
            guard !wide || bytes.count >= 3 else { return }
            hub.hr(wide ? Int(bytes[1]) | Int(bytes[2]) << 8 : Int(bytes[1]), kind: kind)
        }
    }

    func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor ch: CBCharacteristic, error: Error?) {
        if let e = error { log("subscribe \(ch.uuid) failed: \(e.localizedDescription)") }
        else { log("subscribed to \(ch.uuid)") }
    }
}

// ── --demo: two simulated players, sent the way the real sensor sends ───────────────
// One AFF1 notification per simulated heartbeat, plus one whenever breathing or HRV change.
// These numbers are made up. The page marks the whole screen SIMULATED in this mode.

final class Demo {
    struct Player {
        var base: Double, swing: Double, period: Double, offset: Double
        var startsAt: Double
        var wander = 0.0, surge = 0.0, nextSurge: Double
        var nextBeat: Double
        var bpm = 0.0
    }

    let hub: Hub
    var bytes: [UInt8] = [0, 0, 0, 0]
    var players: [Player]
    var timer: DispatchSourceTimer?
    var lastSlow = 0.0

    init(hub: Hub) {
        self.hub = hub
        players = [
            Player(base: 73, swing: 5, period: 47, offset: 0.0, startsAt: 1.5, nextSurge: 22, nextBeat: 1.5),
            Player(base: 78, swing: 6, period: 31, offset: 2.1, startsAt: 4.0, nextSurge: 37, nextBeat: 4.0),
        ]
    }

    func start() {
        hub.aff1Found = true
        hub.setLink("connected")
        hub.aff1(bytes, kind: "read")
        let t = DispatchSource.makeTimerSource(queue: .main)
        t.schedule(deadline: .now(), repeating: .milliseconds(40))
        t.setEventHandler { [weak self] in self?.step() }
        t.resume()
        timer = t
    }

    func step() {
        let t = Double(nowMs()) / 1000
        for i in players.indices {
            var p = players[i]
            guard t >= p.startsAt else { continue }
            p.wander = p.wander * 0.995 + Double.random(in: -0.12...0.12)
            p.surge *= 0.994                                  // a surge fades over about 10 s
            if t >= p.nextSurge { p.surge += Double.random(in: 7...13); p.nextSurge = t + Double.random(in: 25...50) }
            p.bpm = p.base + p.swing * sin(2 * .pi * t / p.period + p.offset) + p.wander + p.surge
            if t >= p.nextBeat {
                p.nextBeat = t + 60 / p.bpm * Double.random(in: 0.97...1.03)
                bytes[i] = UInt8(max(40, min(180, p.bpm.rounded())))
                hub.aff1(bytes, kind: "notify")
            }
            players[i] = p
        }
        guard t - lastSlow >= 1 else { return }
        lastSlow = t
        let live = [0, 1].filter { bytes[$0] > 0 }
        guard !live.isEmpty else { return }
        hub.hr(live.map { Int(bytes[$0]) }.reduce(0, +) / live.count, kind: "notify")
        let since = t - players[0].startsAt
        let breath = since > 12 ? UInt8((13 + 2 * sin(t / 19)).rounded()) : 0
        let hrv = since > 20 ? UInt8((41 + 7 * sin(t / 27)).rounded()) : 0
        if breath != bytes[2] { bytes[2] = breath; hub.aff1(bytes, kind: "notify") }
        if hrv != bytes[3] { bytes[3] = hrv; hub.aff1(bytes, kind: "notify") }
    }
}

// ── run ─────────────────────────────────────────────────────────────────────────────

let hub = Hub(mode: demo ? "demo" : "ble")
let server = Server(hub: hub)
server.start()

let heartbeat = DispatchSource.makeTimerSource(queue: .main)
heartbeat.schedule(deadline: .now() + 1, repeating: 1)
heartbeat.setEventHandler { hub.tick() }
heartbeat.resume()

var finger: Finger? = nil
var simulation: Demo? = nil
if demo {
    log("DEMO: simulated players, no Bluetooth")
    simulation = Demo(hub: hub)
    simulation?.start()
} else {
    finger = Finger(hub: hub)
}

func finish() -> Never {
    log(hub.summary())
    exit(0)
}
signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)
let signals = [SIGINT, SIGTERM].map { sig -> DispatchSourceSignal in
    let s = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    s.setEventHandler { finish() }
    s.resume()
    return s
}
if let seconds = runFor { DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { finish() } }

dispatchMain()
