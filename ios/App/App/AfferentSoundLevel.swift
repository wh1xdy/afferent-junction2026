import AVFoundation
import Capacitor

/// Room sound level for demo/js/sound.js: one short window of the microphone (about 4 s), as one A-weighted level per
/// 100 ms (AfferentSoundLevelMeter). Numbers only: inside the input tap every sample is filtered, squared into the block
/// sum and dropped. Nothing is recorded, written, logged or sent; the call resolves with the block levels.
///
/// The music and ambience play in the web view's own audio session, which WebKit keeps in its own process ('ambient',
/// and 'play-and-record' while Talk is open; music.js). This window never touches that session. It uses the app's own:
/// - play and record, mixed with others: it interrupts nothing and ducks nothing (no voice processing, no duck option);
/// - default to speaker: the phone never moves its sound to the earpiece;
/// - Bluetooth A2DP and AirPlay allowed: headphones stay on their music profile, never switched to the call profile;
/// - the default mode, not measurement mode, which changes the speaker's own output processing.
/// Afterwards it is deactivated (mixable, so nobody is told to resume) and its category, mode, options and route sharing
/// policy are put back exactly as they were, unless something else has changed it in the meantime.
///
/// The microphone also hears the phone's own speaker. `quiet: false` from the web layer says Afferent is making sound:
/// then the window only runs with headphones, or on the speaker with echo-cancelled input (iPhones from 2024 on); otherwise
/// it resolves `skipped` without opening the microphone.
@objc(AfferentSoundLevelPlugin)
public class AfferentSoundLevelPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AfferentSoundLevelPlugin"
    public let jsName = "AfferentSoundLevel"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "measure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private struct Saved {
        let category: AVAudioSession.Category
        let mode: AVAudioSession.Mode
        let options: AVAudioSession.CategoryOptions
        let policy: AVAudioSession.RouteSharingPolicy
        let echo: Bool
    }

    private final class Window {
        let call: CAPPluginCall
        let engine = AVAudioEngine()
        let saved: Saved
        let lock = NSLock()
        var meter: SoundLevelMeter?
        var route = "speaker"
        var echo = false
        var interrupted = false
        var tapped = false
        var done: DispatchWorkItem?
        var observers: [NSObjectProtocol] = []
        init(call: CAPPluginCall, saved: Saved) { self.call = call; self.saved = saved }
    }

    private static let options: AVAudioSession.CategoryOptions = [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP, .allowAirPlay]
    private let queue = DispatchQueue(label: "fi.junction.afferent.soundlevel")
    private var window: Window?
    // stop() raises it: a measure asked for before that, still waiting for the permission prompt, does not start
    private var generation = 0

    private func permission() -> String {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        default: return "undetermined"
        }
    }

    /// Where the phone's sound goes now: headphones (wired, Bluetooth), the phone's own speaker, or something else in the
    /// room (AirPlay, HDMI, line out, a car, USB audio), which the microphone hears like the speaker.
    private static func route(_ session: AVAudioSession) -> String {
        let outs = session.currentRoute.outputs.map(\.portType)
        let phones: Set<AVAudioSession.Port> = [.headphones, .bluetoothA2DP, .bluetoothLE, .bluetoothHFP]
        if outs.contains(where: phones.contains) { return "headphones" }
        if outs.isEmpty || outs.allSatisfy({ $0 == .builtInSpeaker || $0 == .builtInReceiver }) { return "speaker" }
        return "external"
    }

    @objc func status(_ call: CAPPluginCall) {
        queue.async {
            call.resolve(["permission": self.permission(), "route": Self.route(AVAudioSession.sharedInstance()), "measuring": self.window != nil])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        queue.async {
            self.generation += 1
            if let w = self.window { self.finish(w, aborted: true) }
            call.resolve()
        }
    }

    @objc func measure(_ call: CAPPluginCall) {
        let seconds = max(1, min(10, call.getDouble("seconds") ?? 4))
        let blockSeconds = max(0.02, min(1, (call.getDouble("blockMs") ?? 100) / 1000))
        let quiet = call.getBool("quiet") ?? false
        queue.async {
            if let w = self.window { self.finish(w, aborted: true) }
            let gen = self.generation
            switch AVAudioApplication.shared.recordPermission {
            case .granted:
                self.begin(call, seconds: seconds, blockSeconds: blockSeconds, quiet: quiet)
            case .denied:
                call.resolve(["permission": "denied"])
            default:
                AVAudioApplication.requestRecordPermission { ok in
                    self.queue.async {
                        if !ok { call.resolve(["permission": "denied"]) }
                        else if gen != self.generation { call.resolve(["aborted": true, "permission": "granted"]) }
                        else { self.begin(call, seconds: seconds, blockSeconds: blockSeconds, quiet: quiet) }
                    }
                }
            }
        }
    }

    // On `queue`.
    private func begin(_ call: CAPPluginCall, seconds: Double, blockSeconds: Double, quiet: Bool) {
        if let w = window { finish(w, aborted: true) }
        let session = AVAudioSession.sharedInstance()
        var echoBefore = false
        if #available(iOS 18.2, *) { echoBefore = session.prefersEchoCancelledInput }
        let saved = Saved(category: session.category, mode: session.mode, options: session.categoryOptions,
                          policy: session.routeSharingPolicy, echo: echoBefore)
        let w = Window(call: call, saved: saved)
        let skip = { (route: String, active: Bool) in
            self.restore(w, wasActive: active)
            call.resolve(["skipped": true, "route": route, "echo_cancelled": false, "permission": "granted"])
        }
        do {
            try session.setCategory(.playAndRecord, mode: .default, policy: .default, options: Self.options)
        } catch {
            call.resolve(["error": "session", "permission": "granted"])
            return
        }
        w.route = Self.route(session)
        // Afferent is making sound: only headphones or echo-cancelled speaker input keep it out of the reading.
        var wantEcho = false
        if !quiet && w.route != "headphones" {
            if w.route == "speaker", #available(iOS 18.2, *), session.isEchoCancelledInputAvailable { wantEcho = true }
            else { skip(w.route, false); return }
        }
        if #available(iOS 18.2, *), wantEcho != echoBefore { try? session.setPrefersEchoCancelledInput(wantEcho) }
        do { try session.setActive(true) } catch { restore(w, wasActive: false); call.resolve(["error": "active", "permission": "granted"]); return }
        if #available(iOS 18.2, *) { w.echo = wantEcho && session.isEchoCancelledInputEnabled }
        if wantEcho && !w.echo { skip(w.route, true); return }

        let input = w.engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            restore(w, wasActive: true)
            call.resolve(["error": "input", "permission": "granted"])
            return
        }
        w.meter = SoundLevelMeter(sampleRate: format.sampleRate, blockSeconds: blockSeconds)
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak w] buffer, _ in
            guard let w, let ch = buffer.floatChannelData?[0] else { return }
            let n = Int(buffer.frameLength)
            w.lock.lock()
            w.meter?.process(UnsafeBufferPointer(start: ch, count: n))
            w.lock.unlock()
        }
        w.tapped = true
        let center = NotificationCenter.default
        let cut: (Notification) -> Void = { [weak self, weak w] _ in
            self?.queue.async { if let self, let w, self.window === w { w.interrupted = true; self.finish(w, aborted: false) } }
        }
        w.observers = [
            center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: nil, using: cut),
            center.addObserver(forName: .AVAudioEngineConfigurationChange, object: w.engine, queue: nil, using: cut),
        ]
        do {
            w.engine.prepare()
            try w.engine.start()
        } catch {
            finish(w, aborted: true, error: "engine")
            return
        }
        window = w
        let done = DispatchWorkItem { [weak self, weak w] in
            guard let self, let w, self.window === w else { return }
            self.finish(w, aborted: false)
        }
        w.done = done
        queue.asyncAfter(deadline: .now() + seconds, execute: done)
    }

    // On `queue`. Stops the window, puts the session back and answers the call: the block levels, or `aborted`.
    private func finish(_ w: Window, aborted: Bool, error: String? = nil) {
        if window === w { window = nil }
        w.done?.cancel()
        w.observers.forEach { NotificationCenter.default.removeObserver($0) }
        w.observers = []
        if w.tapped { w.engine.inputNode.removeTap(onBus: 0); w.tapped = false }
        w.engine.stop()
        w.lock.lock()
        let blocks = w.meter?.blocks ?? []
        w.meter = nil
        w.lock.unlock()
        restore(w, wasActive: true)
        if let error { w.call.resolve(["error": error, "permission": "granted"]); return }
        if aborted { w.call.resolve(["aborted": true, "permission": "granted"]); return }
        w.call.resolve([
            "blocks": blocks.map { ($0 * 10).rounded() / 10 }, "route": w.route, "echo_cancelled": w.echo, "interrupted": w.interrupted, "permission": "granted",
        ])
    }

    /// Back to the session as it was: deactivated first while it is still mixable, so nobody is interrupted or told to
    /// resume, then the saved category, mode, options and policy. Only if it is still the session this window set up:
    /// if something else has changed it since, that change stands.
    private func restore(_ w: Window, wasActive: Bool) {
        let session = AVAudioSession.sharedInstance()
        guard session.category == .playAndRecord, session.categoryOptions.contains(.mixWithOthers) else { return }
        if wasActive { try? session.setActive(false, options: []) }
        if #available(iOS 18.2, *), session.prefersEchoCancelledInput != w.saved.echo { try? session.setPrefersEchoCancelledInput(w.saved.echo) }
        try? session.setCategory(w.saved.category, mode: w.saved.mode, policy: w.saved.policy, options: w.saved.options)
    }
}
