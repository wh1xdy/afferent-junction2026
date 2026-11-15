import Capacitor
import Network

/// Settings › Home hub › Find on this Wi-Fi (demo/js/hubfind.js). The home hub's LAN door on the Jetson
/// (jetson/home_hub/door) announces `_afferent-hub._tcp` with Bonjour. This browses for it for a few seconds
/// and resolves each one to an IPv4 address and a port, because the hub answers on its address, not on a
/// DNS name (hub/afferent_hub/home_guard.py). Resolving opens one TCP connection to the door and closes it
/// at once; nothing is sent.
///
/// The advert names no key (the hub's pairing token never goes into Bonjour); the web layer keeps the key
/// it already has. The type is listed in Info.plist NSBonjourServices, and the first browse shows iOS's
/// Local Network prompt (NSLocalNetworkUsageDescription). Only while the app asks: no background browsing.
///
/// JS: find({timeoutMs}) -> {state: "ok" | "denied" | "failed", hubs: [{name, host, port}]}
@objc(AfferentHubFinderPlugin)
public class AfferentHubFinderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AfferentHubFinderPlugin"
    public let jsName = "AfferentHubFinder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "find", returnType: CAPPluginReturnPromise),
    ]

    static let serviceType = "_afferent-hub._tcp"
    /// once a hub is resolved, the others get this long to answer before the search ends early
    private static let settleMs = 600

    private final class Search {
        let call: CAPPluginCall
        let browser: NWBrowser
        var state = "ok"
        var seen: Set<NWEndpoint> = []
        var resolving: [NWEndpoint: NWConnection] = [:]
        var hubs: [[String: Any]] = []
        var done = false
        init(call: CAPPluginCall, browser: NWBrowser) { self.call = call; self.browser = browser }
    }

    private let q = DispatchQueue(label: "fi.junction.afferent.hubfinder")
    private var search: Search?

    @objc func find(_ call: CAPPluginCall) {
        let ms = min(max(call.getInt("timeoutMs") ?? 4000, 1000), 10000)
        q.async {
            if let old = self.search { self.finish(old) }
            let params = NWParameters()
            params.includePeerToPeer = false
            let browser = NWBrowser(for: .bonjour(type: AfferentHubFinderPlugin.serviceType, domain: nil), using: params)
            let s = Search(call: call, browser: browser)
            self.search = s
            browser.stateUpdateHandler = { [weak self] st in self?.browserChanged(s, st) }
            browser.browseResultsChangedHandler = { [weak self] results, _ in self?.resultsChanged(s, results) }
            browser.start(queue: self.q)
            self.q.asyncAfter(deadline: .now() + .milliseconds(ms)) { [weak self] in self?.finish(s) }
        }
    }

    private func browserChanged(_ s: Search, _ st: NWBrowser.State) {
        guard !s.done else { return }
        switch st {
        case .failed(let err), .waiting(let err):
            // -65570 PolicyDenied: Local Network permission off. -65555 NoAuth: type missing in NSBonjourServices.
            if case .dns(let code) = err, code == -65570 { s.state = "denied" } else { s.state = "failed" }
            finish(s)
        default:
            return
        }
    }

    private func resultsChanged(_ s: Search, _ results: Set<NWBrowser.Result>) {
        guard !s.done else { return }
        for r in results where !s.seen.contains(r.endpoint) {
            s.seen.insert(r.endpoint)
            resolve(s, r.endpoint)
        }
    }

    /// The service endpoint to an IPv4 address and port: connect over TCP, read where the path went, close.
    private func resolve(_ s: Search, _ endpoint: NWEndpoint) {
        guard case let .service(name, _, _, _) = endpoint else { return }
        let params = NWParameters.tcp
        if let ip = params.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options { ip.version = .v4 }
        params.prohibitedInterfaceTypes = [.cellular]
        let c = NWConnection(to: endpoint, using: params)
        s.resolving[endpoint] = c
        c.stateUpdateHandler = { [weak self] st in
            guard let self, !s.done else { AfferentHubFinderPlugin.drop(c); return }
            switch st {
            case .ready:
                if case let .hostPort(host, port)? = c.currentPath?.remoteEndpoint, case let .ipv4(addr) = host {
                    let ip = addr.rawValue.map { String($0) }.joined(separator: ".")
                    if !s.hubs.contains(where: { ($0["host"] as? String) == ip && ($0["port"] as? Int) == Int(port.rawValue) }) {
                        s.hubs.append(["name": name, "host": ip, "port": Int(port.rawValue)])
                    }
                }
                self.done(s, endpoint)
            case .failed, .waiting, .cancelled:
                self.done(s, endpoint)
            default:
                return
            }
        }
        c.start(queue: q)
    }

    /// handlers hold the search and the connection: cleared, so nothing outlives the search
    private static func drop(_ c: NWConnection) {
        c.stateUpdateHandler = nil
        c.cancel()
    }

    private func done(_ s: Search, _ endpoint: NWEndpoint) {
        if let c = s.resolving.removeValue(forKey: endpoint) { AfferentHubFinderPlugin.drop(c) }
        if !s.hubs.isEmpty && s.resolving.isEmpty {
            q.asyncAfter(deadline: .now() + .milliseconds(AfferentHubFinderPlugin.settleMs)) { [weak self] in
                guard let self, s.resolving.isEmpty else { return }
                self.finish(s)
            }
        }
    }

    private func finish(_ s: Search) {
        guard !s.done else { return }
        s.done = true
        s.browser.stateUpdateHandler = nil
        s.browser.browseResultsChangedHandler = nil
        s.browser.cancel()
        s.resolving.values.forEach(AfferentHubFinderPlugin.drop)
        s.resolving.removeAll()
        if search === s { search = nil }
        s.call.resolve(["state": s.state, "hubs": s.hubs])
    }
}
