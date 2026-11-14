import Capacitor
import CoreHaptics

@objc(AfferentHapticsPlugin)
public class AfferentHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AfferentHapticsPlugin"
    public let jsName = "AfferentHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        // The vocabulary of every game event (extension at the end of this file, demo/js/haptics.js routes to it).
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dragStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dragMove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dragStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "breath", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "warm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "holdStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "holdStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "success", returnType: CAPPluginReturnPromise),
    ]

    private var engine: CHHapticEngine?
    private var hold: CHHapticAdvancedPatternPlayer?
    // The vocabulary's state: the drag hum, the patterns built so far (by word, strength and sharpness).
    // A breath swell plays in the hold slot, so the kindle and the heartbeat treat it as a hold.
    private var drag: CHHapticAdvancedPatternPlayer?
    private var dragLevel: Float = 0
    private var dragSeen = 0
    private var shapes: [String: CHHapticPattern] = [:]

    private var supported: Bool { CHHapticEngine.capabilitiesForHardware().supportsHaptics }

    private func ready() -> CHHapticEngine? {
        guard supported else { return nil }
        if let engine { return engine }
        guard let made = try? CHHapticEngine() else { return nil }
        made.playsHapticsOnly = true
        made.isAutoShutdownEnabled = true
        made.resetHandler = { [weak self] in
            self?.hold = nil
            self?.drag = nil
            try? self?.engine?.start()
        }
        made.stoppedHandler = { [weak self] _ in self?.hold = nil; self?.drag = nil }
        engine = made
        return made
    }

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["haptics": supported])
    }

    @objc func holdStart(_ call: CAPPluginCall) {
        let ms = max(80, min(5000, call.getDouble("durationMs") ?? 900))
        let from = max(0, min(1, call.getDouble("from") ?? 0))
        DispatchQueue.main.async {
            guard let engine = self.ready() else { call.resolve(["played": false]); return }
            self.stopHold()
            let d = ms / 1000
            let i0 = Float(0.08 + 0.42 * from), s0 = Float(0.10 + 0.22 * from)
            let event = CHHapticEvent(eventType: .hapticContinuous, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 1),
            ], relativeTime: 0, duration: d)
            let intensity = CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [
                .init(relativeTime: 0, value: i0),
                .init(relativeTime: d * 0.6, value: max(i0, 0.30)),
                .init(relativeTime: d, value: 0.55),
            ], relativeTime: 0)
            let sharpness = CHHapticParameterCurve(parameterID: .hapticSharpnessControl, controlPoints: [
                .init(relativeTime: 0, value: s0),
                .init(relativeTime: d, value: 0.32),
            ], relativeTime: 0)
            do {
                try engine.start()
                let pattern = try CHHapticPattern(events: [event], parameterCurves: [intensity, sharpness])
                let player = try engine.makeAdvancedPlayer(with: pattern)
                try player.start(atTime: CHHapticTimeImmediate)
                self.hold = player
                call.resolve(["played": true])
            } catch {
                call.resolve(["played": false])
            }
        }
    }

    @objc func holdStop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopHold()
            call.resolve()
        }
    }

    @objc func success(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopHold()
            guard let engine = self.ready() else { call.resolve(["played": false]); return }
            let events = [
                CHHapticEvent(eventType: .hapticTransient, parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.75),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.35),
                ], relativeTime: 0),
                CHHapticEvent(eventType: .hapticContinuous, parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2),
                ], relativeTime: 0.02, duration: 0.32),
                CHHapticEvent(eventType: .hapticTransient, parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.55),
                ], relativeTime: 0.13),
            ]
            let bloom = CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [
                .init(relativeTime: 0.02, value: 1.0),
                .init(relativeTime: 0.12, value: 0.7),
                .init(relativeTime: 0.34, value: 0.0),
            ], relativeTime: 0)
            do {
                try engine.start()
                let player = try engine.makePlayer(with: CHHapticPattern(events: events, parameterCurves: [bloom]))
                try player.start(atTime: CHHapticTimeImmediate)
                call.resolve(["played": true])
            } catch {
                call.resolve(["played": false])
            }
        }
    }

    private func stopHold() {
        try? hold?.stop(atTime: CHHapticTimeImmediate)
        hold = nil
    }
}

// MARK: - The vocabulary

/// A transient tap (d == 0) or a continuous hum of d seconds, at t seconds, before strength and sharpness are applied.
fileprivate struct HapticNote {
    let t: Double, i: Float, s: Float, d: Double
}

/// The notes of one word, with one intensity curve (a multiplier, 1 wherever a tap sits) and one sharpness curve (added).
fileprivate struct HapticShape {
    var notes: [HapticNote]
    var level: [(Double, Float)] = []
    var edge: [(Double, Float)] = []
}

fileprivate func note(_ t: Double, _ i: Float, _ s: Float, _ d: Double = 0) -> HapticNote { HapticNote(t: t, i: i, s: s, d: d) }

/// The words of demo/js/haptics.js. Soft and rounded on purpose: low sharpness, short soft tails instead of buzz.
fileprivate let hapticVocabulary: [String: HapticShape] = {
    var v: [String: HapticShape] = [:]
    // a soft round tap: finger down, a grab, a neutral answer
    v["touch"] = HapticShape(notes: [note(0, 0.36, 0.2)])
    // a quiet crisp detent: a step, a count, a ratchet
    v["tick"] = HapticShape(notes: [note(0, 0.42, 0.58)])
    // crisp but light: a catch, a correct answer; a short soft tail keeps it round
    v["hit"] = HapticShape(notes: [note(0, 0.62, 0.42), note(0.004, 0.26, 0.2, 0.05)],
                           level: [(0, 1), (0.004, 1), (0.054, 0.1)])
    // a hit with a small, brighter sparkle after it: a perfect catch
    v["bright"] = HapticShape(notes: [note(0, 0.62, 0.42), note(0.004, 0.26, 0.2, 0.04), note(0.05, 0.42, 0.8)],
                              level: [(0, 1), (0.004, 1), (0.044, 0.2), (0.05, 1)])
    // soft and dull, never a punishment: no tap at all, only a low, round bump
    v["miss"] = HapticShape(notes: [note(0, 0.34, 0.04, 0.12)],
                            level: [(0, 0.35), (0.025, 1), (0.12, 0)])
    // a rounder, fuller thud: a landing, a deep bell, a shutter thrown open
    v["land"] = HapticShape(notes: [note(0, 0.85, 0.26), note(0.004, 0.44, 0.1, 0.16)],
                            level: [(0, 1), (0.004, 1), (0.06, 0.5), (0.16, 0)])
    // a short swell into a tap: a step up, a fever, light coming back
    v["rise"] = HapticShape(notes: [note(0, 1, 0.22, 0.24), note(0.24, 0.72, 0.5)],
                            level: [(0, 0.08), (0.2, 0.46), (0.235, 0.5), (0.24, 1)],
                            edge: [(0, -0.08), (0.235, 0.12), (0.24, 0)])
    // the kindle's reward, the same notes as success() in the class above
    v["success"] = HapticShape(notes: [note(0, 0.75, 0.35), note(0.02, 0.5, 0.2, 0.32), note(0.13, 1.0, 0.55)],
                               level: [(0.02, 1.0), (0.12, 0.7), (0.34, 0)])
    // the end of a game: a swell that builds, a tap, a warm bloom, a brighter tap, a long soft afterglow
    v["complete"] = HapticShape(notes: [note(0, 1, 0.12, 0.46), note(0.46, 0.8, 0.36), note(0.48, 0.55, 0.2, 0.36),
                                        note(0.6, 1.0, 0.56), note(0.62, 0.32, 0.08, 0.7)],
                                level: [(0, 0.05), (0.3, 0.3), (0.45, 0.48), (0.46, 1), (0.5, 0.9), (0.58, 0.62),
                                        (0.6, 1), (0.64, 0.8), (0.9, 0.35), (1.32, 0)],
                                edge: [(0, 0), (0.45, 0.15), (0.46, 0)])
    // a soft round beat: count-ins, rhythm games
    v["rhythm"] = HapticShape(notes: [note(0, 0.52, 0.3), note(0.003, 0.2, 0.15, 0.035)],
                              level: [(0, 1), (0.003, 1), (0.038, 0)])
    return v
}()

extension AfferentHapticsPlugin {
    /// One word of the vocabulary: { name, gain (0..1, strength), sharp (-0.5..0.5, added to sharpness) }.
    /// Calm and night arrive here as a lower gain and a negative sharp (demo/js/haptics.js decides).
    @objc func play(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? ""
        let gain = Float(max(0.05, min(1, call.getDouble("gain") ?? 0.9)))
        let sharp = Float(max(-0.5, min(0.5, call.getDouble("sharp") ?? 0)))
        DispatchQueue.main.async {
            guard let engine = self.ready(), let pattern = self.pattern(name, gain: gain, sharp: sharp) else {
                call.resolve(["played": false]); return
            }
            do {
                try engine.start()
                try engine.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
                call.resolve(["played": true])
            } catch {
                call.resolve(["played": false])
            }
        }
    }

    /// A soft hum while pulling, pouring or lifting: { level (0..1, the progress), gain, sharp }.
    /// It starts from nothing, follows dragMove, fades on dragStop, and fades by itself after 10 s without a move.
    @objc func dragStart(_ call: CAPPluginCall) {
        let level = Float(max(0, min(1, call.getDouble("level") ?? 0)))
        let gain = Float(max(0.05, min(1, call.getDouble("gain") ?? 0.9)))
        let sharp = Float(max(-0.5, min(0.5, call.getDouble("sharp") ?? 0)))
        DispatchQueue.main.async {
            self.endDrag(fade: 0)
            guard let engine = self.ready() else { call.resolve(["played": false]); return }
            let hum = CHHapticEvent(eventType: .hapticContinuous, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: gain),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: max(0, min(1, 0.12 + sharp))),
            ], relativeTime: 0, duration: 30)
            do {
                try engine.start()
                let player = try engine.makeAdvancedPlayer(with: CHHapticPattern(events: [hum], parameters: []))
                player.loopEnabled = true
                try player.sendParameters([CHHapticDynamicParameter(parameterID: .hapticIntensityControl, value: 0, relativeTime: 0)], atTime: CHHapticTimeImmediate)
                try player.start(atTime: CHHapticTimeImmediate)
                try player.scheduleParameterCurve(self.curve(.hapticIntensityControl, [(0, 0), (0.08, self.humLevel(level))]), atTime: CHHapticTimeImmediate)
                try player.scheduleParameterCurve(self.curve(.hapticSharpnessControl, [(0, 0), (0.08, self.humEdge(level))]), atTime: CHHapticTimeImmediate)
                self.drag = player
                self.dragLevel = level
                self.watchDrag()
                call.resolve(["played": true])
            } catch {
                call.resolve(["played": false])
            }
        }
    }

    @objc func dragMove(_ call: CAPPluginCall) {
        let level = Float(max(0, min(1, call.getDouble("level") ?? 0)))
        DispatchQueue.main.async {
            guard let player = self.drag else { call.resolve(["played": false]); return }
            let from = self.dragLevel
            self.dragLevel = level
            do {
                try player.scheduleParameterCurve(self.curve(.hapticIntensityControl, [(0, self.humLevel(from)), (0.06, self.humLevel(level))]), atTime: CHHapticTimeImmediate)
                try player.scheduleParameterCurve(self.curve(.hapticSharpnessControl, [(0, self.humEdge(from)), (0.06, self.humEdge(level))]), atTime: CHHapticTimeImmediate)
                self.watchDrag()
                call.resolve(["played": true])
            } catch {
                call.resolve(["played": false])
            }
        }
    }

    @objc func dragStop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.endDrag(fade: 0.14)
            call.resolve()
        }
    }

    /// One half of a breath, timed by the breath guide: { phase: "in" | "out", durationMs, gain, sharp }.
    /// "in" swells slowly over the inhale and eases near the top; "out" marks the turn with one soft tap and fades
    /// over the first part of the exhale, then leaves the rest of it quiet. It plays in the hold slot, so a heartbeat
    /// touch waits for the fade to end.
    @objc func breath(_ call: CAPPluginCall) {
        let inhale = call.getString("phase") != "out"
        let d = max(0.6, min(12, (call.getDouble("durationMs") ?? 4000) / 1000))
        let gain = Float(max(0.05, min(1, call.getDouble("gain") ?? 0.7)))
        let sharp = Float(max(-0.5, min(0.5, call.getDouble("sharp") ?? 0)))
        DispatchQueue.main.async {
            guard let engine = self.ready() else { call.resolve(["played": false]); return }
            self.stopHold()
            let shape: HapticShape
            if inhale {
                shape = HapticShape(notes: [note(0, 1, 0.08, d)],
                                    level: [(0, 0), (0.12 * d, 0.1), (0.55 * d, 0.3), (0.9 * d, 0.46), (d, 0.5)],
                                    edge: [(0, 0), (d, 0.14)])
            } else {
                let f = min(0.6 * d, 3.2)
                shape = HapticShape(notes: [note(0, 0.3, 0.14), note(0.01, 1, 0.2, f)],
                                    level: [(0, 1), (0.01, 0.5), (0.3 * f, 0.32), (0.7 * f, 0.1), (f, 0)],
                                    edge: [(0.01, 0), (f, -0.12)])
            }
            do {
                try engine.start()
                let player = try engine.makeAdvancedPlayer(with: self.build(shape, gain: gain, sharp: sharp))
                let id = ObjectIdentifier(player as AnyObject)
                player.completionHandler = { [weak self] _ in
                    DispatchQueue.main.async {
                        if let h = self?.hold, ObjectIdentifier(h as AnyObject) == id { self?.hold = nil }
                    }
                }
                try player.start(atTime: CHHapticTimeImmediate)
                self.hold = player
                call.resolve(["played": true])
            } catch {
                call.resolve(["played": false])
            }
        }
    }

    /// Ends every continuous pattern: a page goes to the background, a phase of the session ends.
    @objc func stopAll(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopHold()
            self.endDrag(fade: 0.08)
            call.resolve()
        }
    }

    /// { on }: keep the engine running while a session is open, so the first tap of each game is on time;
    /// off lets it sleep again when idle.
    @objc func warm(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? true
        DispatchQueue.main.async {
            guard let engine = self.ready() else { call.resolve(); return }
            engine.isAutoShutdownEnabled = !on
            if on { try? engine.start() }
            call.resolve()
        }
    }

    fileprivate func pattern(_ name: String, gain: Float, sharp: Float) -> CHHapticPattern? {
        let key = "\(name)|\(Int((gain * 20).rounded()))|\(Int((sharp * 20).rounded()))"
        if let made = shapes[key] { return made }
        guard let shape = hapticVocabulary[name], let made = try? build(shape, gain: gain, sharp: sharp) else { return nil }
        shapes[key] = made
        return made
    }

    fileprivate func build(_ shape: HapticShape, gain: Float, sharp: Float) throws -> CHHapticPattern {
        let unit = { (x: Float) -> Float in max(0, min(1, x)) }
        let events: [CHHapticEvent] = shape.notes.map { n in
            let parameters = [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: unit(n.i * gain)),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: unit(n.s + sharp)),
            ]
            return n.d > 0
                ? CHHapticEvent(eventType: .hapticContinuous, parameters: parameters, relativeTime: n.t, duration: n.d)
                : CHHapticEvent(eventType: .hapticTransient, parameters: parameters, relativeTime: n.t)
        }
        var curves: [CHHapticParameterCurve] = []
        if !shape.level.isEmpty { curves.append(curve(.hapticIntensityControl, shape.level)) }
        if !shape.edge.isEmpty { curves.append(curve(.hapticSharpnessControl, shape.edge)) }
        return try CHHapticPattern(events: events, parameterCurves: curves)
    }

    fileprivate func curve(_ id: CHHapticDynamicParameter.ID, _ points: [(Double, Float)]) -> CHHapticParameterCurve {
        let controls = points.map { CHHapticParameterCurve.ControlPoint(relativeTime: $0.0, value: $0.1) }
        return CHHapticParameterCurve(parameterID: id, controlPoints: controls, relativeTime: 0)
    }

    /// The hum for a progress: barely there at the start, never more than half strength; a little brighter as it grows.
    fileprivate func humLevel(_ level: Float) -> Float { 0.14 + 0.36 * level }
    fileprivate func humEdge(_ level: Float) -> Float { 0.2 * level }

    fileprivate func watchDrag() {
        dragSeen += 1
        let seen = dragSeen
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
            if self.dragSeen == seen { self.endDrag(fade: 0.3) }
        }
    }

    fileprivate func endDrag(fade: Double) {
        guard let player = drag else { return }
        drag = nil
        dragSeen += 1
        if fade > 0, let engine {
            try? player.scheduleParameterCurve(curve(.hapticIntensityControl, [(0, humLevel(dragLevel)), (fade, 0)]), atTime: CHHapticTimeImmediate)
            try? player.stop(atTime: engine.currentTime + fade + 0.02)
        } else {
            try? player.stop(atTime: CHHapticTimeImmediate)
        }
    }
}
