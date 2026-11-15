import Foundation

/// The screen as a variable light for the face camera, for the camera pulse. Ported from the reference app's
/// ios/Afferent/ScreenLight.swift. Foundation only (no UIKit): the plugin (AfferentPulse.swift) hands it a way to read and
/// set the screen brightness, so the same file runs in `cd ios/App/TeamTests && swift test`.
///
/// From the reference:
///  - begin: the person's brightness is kept, the screen goes to 40 %.
///  - 2 s later, once: a starting point from how dark the room is, continuous on a log scale, bright room 15 %, dark 60 %.
///    The reference read the camera's ISO; the ARKit face camera does not give it (AfferentPulse.swift), so this reads
///    ARKit's ambient light estimate instead (lumens, about 1000 in a well lit room): 1000 or more is 15 %, 31 or less
///    (five octaves darker, the span of the reference's ISO 50 to 1600) is 60 %. NEW mapping, not tuned on a phone.
///  - from 3 s on, once a second: a slow closed loop on the skin's mean luma (0-255, the camera pulse's own skin pixels)
///    towards 125, nothing within 20 of it, at most 2 % a second and at most a 0.5 s step (so 1 % per once-a-second call,
///    as in the reference). A ramp that slow has no energy in the pulse band; a step would look like a heartbeat.
///  - limits 12 % to 85 %; end puts the person's own brightness back.
/// NEW here, not in the reference:
///  - never darker than the person's own brightness: the light only adds, so it never dims a screen they set brighter;
///  - a lower limit when the web layer asks for one (`max`: at night with Dim light on it asks for 35 %);
///  - when the brightness differs by more than 0.1 from what this last set, the person moved it themselves: the light
///    stops and leaves their brightness alone, also at the end (`takenOver`), until the next begin.
/// Call from the main queue (the screen's brightness is UIKit's).
final class FaceLight {
    static let minLevel = 0.12, maxLevel = 0.85, startLevel = 0.4
    static let ambientAfterS = 2.0, trackAfterS = 3.0
    static let darkLevel = 0.60, brightLevel = 0.15
    static let ambientBrightLumens = 1000.0, ambientSpanOctaves = 5.0
    static let targetLuma = 125.0, deadbandLuma = 20.0
    static let maxRatePerSecond = 0.02, maxStepS = 0.5
    static let takenOverDelta = 0.1

    private let read: () -> Double
    private let write: (Double) -> Void

    /// the person's own brightness while the light is on; nil when off
    private(set) var saved: Double?
    /// the person moved the brightness while the light was on; cleared by the next begin
    private(set) var takenOver = false
    private var lastSet: Double?
    private var cap = FaceLight.maxLevel
    private var startedAt = 0.0
    private var lastStep: Double?
    private var ambientDone = false

    init(read: @escaping () -> Double, write: @escaping (Double) -> Void) {
        self.read = read
        self.write = write
    }

    var on: Bool { saved != nil }
    /// what this set last, while on
    var level: Double? { on ? lastSet : nil }
    /// begun and still waiting for its one starting point from the room
    var wantsAmbient: Bool { on && !ambientDone }

    /// The ambient light (lumens) -> the starting level, before the floor and the limits.
    static func ambientLevel(lumens: Double) -> Double {
        let octaves = log2(ambientBrightLumens) - log2(max(lumens, 1))
        let x = min(max(octaves / ambientSpanOctaves, 0), 1)
        return brightLevel + (darkLevel - brightLevel) * x
    }

    /// Starts (or, when already on, only changes the limit). max: the highest level, nil for 85 %. now: seconds.
    /// Returns true when it just started.
    @discardableResult
    func begin(now: Double, max limit: Double? = nil) -> Bool {
        cap = min(max(limit ?? Self.maxLevel, Self.minLevel), Self.maxLevel)
        if on {
            if stillOurs(), let l = lastSet, clamp(l) != l { set(l) }
            return false
        }
        let own = read()
        guard own.isFinite else { return false }
        saved = min(max(own, 0), 1)
        takenOver = false
        lastSet = nil
        startedAt = now
        lastStep = now
        ambientDone = false
        set(Self.startLevel)
        return true
    }

    /// Once, from ambientAfterS after begin: the starting point from the room.
    func ambient(lumens: Double, now: Double) {
        guard on, !ambientDone, now - startedAt >= Self.ambientAfterS, lumens.isFinite, lumens > 0, stillOurs() else { return }
        ambientDone = true
        lastStep = now
        set(Self.ambientLevel(lumens: lumens))
    }

    /// Once a second while the camera pulse measures: the slow loop on the skin's mean luma (0...255).
    func track(faceLuma: Double, now: Double) {
        guard on, now - startedAt >= Self.trackAfterS, faceLuma.isFinite, stillOurs() else { return }
        let dt = min(max(now - (lastStep ?? now), 0), Self.maxStepS)
        lastStep = now
        let err = Self.targetLuma - faceLuma
        guard abs(err) > Self.deadbandLuma, dt > 0, let l = lastSet else { return }
        let step = min(Self.maxRatePerSecond * dt, abs(err) / 255 * dt)
        set(l + (err > 0 ? step : -step))
    }

    /// Off: the person's own brightness back, unless they moved it themselves meanwhile. Returns whether it restored.
    @discardableResult
    func end() -> Bool {
        guard let own = saved else { return false }
        let ours = stillOurs()
        saved = nil
        lastSet = nil
        guard ours else { return false }
        write(own)
        return true
    }

    // never under the person's own level, never over the limit; the own level wins when it is above the limit
    private func clamp(_ v: Double) -> Double {
        let floor = max(Self.minLevel, saved ?? Self.minLevel)
        return min(max(v, floor), max(cap, floor))
    }

    private func set(_ v: Double) {
        let x = clamp(v)
        lastSet = x
        write(x)
    }

    /// false (and off, leaving the brightness as it is) when the person moved it since this last set it.
    private func stillOurs() -> Bool {
        guard on, let l = lastSet else { return on }
        let now = read()
        guard now.isFinite, abs(now - l) > Self.takenOverDelta else { return true }
        saved = nil
        lastSet = nil
        takenOver = true
        return false
    }
}
