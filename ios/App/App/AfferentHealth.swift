import Capacitor
import HealthKit

/// Apple Watch through Apple Health, read only, for the web layer (demo/js/health.js). An Apple Watch sends no heart
/// rate over Bluetooth; it saves samples in Apple Health, the pulse every few minutes. These are context with their
/// age, never a live pulse: the web layer never lets them drive the game.
///
/// JS: Capacitor.Plugins.AfferentHealth
///   status()  -> {available, reason: null|'no_healthkit'|'no_entitlement'|'error'}   asks nothing, shows nothing
///   request() -> {ok, reason}   the read-only permission sheet (iOS shows it once per type; it never tells an app
///                                which types the person allowed to be read, so a refused type just reads as empty)
///   read()    -> {heart_rate: {bpm, end_ms, device}|null, heart_rate_recent: [{bpm, end_ms, device}] (last 2 h, newest first),
///                 resting_hr: {bpm, end_ms, device}|null, hrv_sdnn: {ms, end_ms, device}|null,
///                 respiratory_rate: {per_min, end_ms, device}|null,
///                 sleep: {asleep_min, in_bed_min, start_ms, end_ms, device}|null, t_ms}
///
/// Without the HealthKit entitlement in the signed app (com.apple.developer.healthkit, App.entitlements), HealthKit
/// refuses every call; status() then says no_entitlement and the app keeps working without Apple Health.
@objc(AfferentHealthPlugin)
public class AfferentHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AfferentHealthPlugin"
    public let jsName = "AfferentHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
    ]

    private lazy var store = HKHealthStore()
    private static let hour: TimeInterval = 3600
    private static let perMinute = HKUnit.count().unitDivided(by: .minute())

    private static var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        let ids: [HKQuantityTypeIdentifier] = [.heartRate, .restingHeartRate, .heartRateVariabilitySDNN, .respiratoryRate]
        for id in ids { if let t = HKObjectType.quantityType(forIdentifier: id) { types.insert(t) } }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        return types
    }

    /// HealthKit's answer when the signed app lacks the entitlement: "Missing com.apple.developer.healthkit entitlement."
    private static func reason(_ error: Error) -> String {
        let text = (error as NSError).localizedDescription.lowercased()
        return text.contains("entitlement") ? "no_entitlement" : "error"
    }

    // MARK: - Plugin methods

    @objc func status(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["available": false, "reason": "no_healthkit"])
            return
        }
        // Asks HealthKit whether a request would show the sheet: no UI, and it fails without the entitlement.
        store.getRequestStatusForAuthorization(toShare: [], read: Self.readTypes) { _, error in
            if let error = error {
                call.resolve(["available": false, "reason": Self.reason(error)])
            } else {
                call.resolve(["available": true, "reason": NSNull()])
            }
        }
    }

    @objc func request(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["ok": false, "reason": "no_healthkit"])
            return
        }
        // Read only: nothing is ever written to Apple Health.
        store.requestAuthorization(toShare: nil, read: Self.readTypes) { ok, error in
            if let error = error {
                call.resolve(["ok": false, "reason": Self.reason(error)])
            } else {
                call.resolve(["ok": ok, "reason": NSNull()])
            }
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not on this device", "no_healthkit")
            return
        }
        let now = Date()
        let group = DispatchGroup()
        let lock = NSLock()
        var out: [String: Any] = [:]
        func put(_ key: String, _ value: Any) { lock.lock(); out[key] = value; lock.unlock() }

        group.enter()
        quantities(.heartRate, since: now.addingTimeInterval(-6 * Self.hour), limit: 60) { samples in
            let rows = samples.map { Self.row($0, key: "bpm", unit: Self.perMinute) }
            put("heart_rate", rows.first ?? NSNull())
            let recent = samples.filter { $0.endDate >= now.addingTimeInterval(-2 * Self.hour) }
            put("heart_rate_recent", recent.map { Self.row($0, key: "bpm", unit: Self.perMinute) })
            group.leave()
        }
        let latest: [(HKQuantityTypeIdentifier, String, String, HKUnit)] = [
            (.restingHeartRate, "resting_hr", "bpm", Self.perMinute),
            (.heartRateVariabilitySDNN, "hrv_sdnn", "ms", HKUnit.secondUnit(with: .milli)),
            (.respiratoryRate, "respiratory_rate", "per_min", Self.perMinute),
        ]
        for (id, name, key, unit) in latest {
            group.enter()
            quantities(id, since: now.addingTimeInterval(-7 * 24 * Self.hour), limit: 1) { samples in
                put(name, samples.first.map { Self.row($0, key: key, unit: unit) } ?? NSNull())
                group.leave()
            }
        }
        group.enter()
        sleep(since: now.addingTimeInterval(-36 * Self.hour)) { night in
            put("sleep", night ?? NSNull())
            group.leave()
        }
        group.notify(queue: .main) {
            out["t_ms"] = now.timeIntervalSince1970 * 1000
            call.resolve(out)
        }
    }

    // MARK: - Queries

    private static func ms(_ d: Date) -> Double { d.timeIntervalSince1970 * 1000 }

    /// Where a sample came from: the device model ("Watch") when HealthKit knows it, else the product or app name.
    private static func device(_ s: HKSample) -> Any {
        s.device?.model ?? s.sourceRevision.productType ?? s.sourceRevision.source.name
    }

    private static func row(_ s: HKQuantitySample, key: String, unit: HKUnit) -> [String: Any] {
        [key: s.quantity.doubleValue(for: unit), "end_ms": ms(s.endDate), "device": device(s)]
    }

    /// Newest first. An error (also a type the person did not allow, which HealthKit shows as no samples) gives none.
    private func quantities(_ id: HKQuantityTypeIdentifier, since: Date, limit: Int, done: @escaping ([HKQuantitySample]) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { done([]); return }
        let predicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: [])
        let newest = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: [newest]) { _, samples, _ in
            done((samples as? [HKQuantitySample]) ?? [])
        }
        store.execute(q)
    }

    /// The last night: asleep minutes (all asleep stages, overlaps once) and in-bed minutes over the same hours.
    private func sleep(since: Date, done: @escaping ([String: Any]?) -> Void) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { done(nil); return }
        let predicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: [])
        let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            let all = (samples as? [HKCategorySample]) ?? []
            let asleepValues = Set(HKCategoryValueSleepAnalysis.allAsleepValues.map { $0.rawValue })
            let asleep = all.filter { asleepValues.contains($0.value) }
            let span = { (s: HKCategorySample) in HealthSpan(start: Self.ms(s.startDate), end: Self.ms(s.endDate)) }
            guard let night = HealthMath.lastNight(asleep.map(span)) else { done(nil); return }
            let inBed = all.filter { $0.value == HKCategoryValueSleepAnalysis.inBed.rawValue }
                .map(span).filter { $0.end >= night.start && $0.start <= night.end }
            let source = asleep.max(by: { $0.endDate < $1.endDate }).map(Self.device) ?? NSNull()
            done([
                "asleep_min": night.minutes.rounded(),
                "in_bed_min": inBed.isEmpty ? NSNull() : HealthMath.coveredMinutes(inBed).rounded() as Any,
                "start_ms": night.start, "end_ms": night.end, "device": source,
            ])
        }
        store.execute(q)
    }
}
