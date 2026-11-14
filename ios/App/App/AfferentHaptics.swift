import Capacitor
import CoreHaptics

@objc(AfferentHapticsPlugin)
public class AfferentHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AfferentHapticsPlugin"
    public let jsName = "AfferentHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "holdStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "holdStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "success", returnType: CAPPluginReturnPromise),
    ]

    private var engine: CHHapticEngine?
    private var hold: CHHapticAdvancedPatternPlayer?

    private var supported: Bool { CHHapticEngine.capabilitiesForHardware().supportsHaptics }

    private func ready() -> CHHapticEngine? {
        guard supported else { return nil }
        if let engine { return engine }
        guard let made = try? CHHapticEngine() else { return nil }
        made.playsHapticsOnly = true
        made.isAutoShutdownEnabled = true
        made.resetHandler = { [weak self] in
            self?.hold = nil
            try? self?.engine?.start()
        }
        made.stoppedHandler = { [weak self] _ in self?.hold = nil }
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
