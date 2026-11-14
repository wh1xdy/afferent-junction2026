import UIKit

/// The screen as a variable light source for camera pulse.
///
/// - Start: brightness follows how dark the room is, continuously (camera ISO on a log scale:
///   bright room ~15 %, dark room ~60 %) - no fixed steps, no dazzling.
/// - While measuring: a slow controller keeps the *face* well exposed (luma ~105-145) as the
///   room or the distance changes. Max 2 %/s: a ramp that slow has no energy in the pulse band
///   (0.75-3 Hz) and POS normalises it out, whereas a step would look like a heartbeat.
/// Call from the main thread (UIScreen).
final class ScreenLight {
    static let shared = ScreenLight()
    private var saved: CGFloat?
    private var last = Date()
    let minLevel: CGFloat = 0.12, maxLevel: CGFloat = 0.85
    let maxRatePerSecond: CGFloat = 0.02

    var level: CGFloat { UIScreen.main.brightness }

    func begin() {
        if saved == nil { saved = UIScreen.main.brightness }
        UIScreen.main.brightness = 0.4
        last = Date()
    }

    /// continuous starting point from ambient light; iso = auto-exposure ISO before locking
    func setFromAmbient(iso: Float) {
        // ISO 50 -> 15 %, ISO 1600 -> 60 %, log-linear in between
        let x = (log2(Double(max(iso, 25))) - log2(50)) / (log2(1600) - log2(50))
        UIScreen.main.brightness = clamp(CGFloat(0.15 + 0.45 * min(max(x, 0), 1)))
        last = Date()
    }

    /// slow closed loop on the measured face brightness (0-255 luma)
    func track(faceLuma: Double) {
        let now = Date()
        let dt = CGFloat(min(now.timeIntervalSince(last), 0.5))
        last = now
        let target = 125.0, deadband = 20.0
        let err = target - faceLuma
        guard abs(err) > deadband else { return }
        let step = min(maxRatePerSecond * dt, abs(CGFloat(err)) / 255 * dt)
        UIScreen.main.brightness = clamp(level + (err > 0 ? step : -step))
    }

    func end() {
        if let s = saved { UIScreen.main.brightness = s }
        saved = nil
    }

    private func clamp(_ v: CGFloat) -> CGFloat { min(max(v, minLevel), maxLevel) }
}
