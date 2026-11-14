import ARKit
import AVFoundation
import Capacitor
import UIKit
#if canImport(FaceCore)
import FaceCore
#endif

// Gaze calibration, five methods of the AfferentPulse plugin (Capacitor.Plugins.AfferentPulse):
//
//   calibrationStart() -> { screen_w_cm, screen_h_cm, density: 'model' | 'scale' }
//     Begins a run and forgets the dots of an earlier one. Reads the screen from the device
//     (see `screen()` below). Rejects with code 'unavailable' without a TrueDepth camera or
//     when the screen cannot be read.
//
//   calibrationPoint({ x, y, hold_ms }) -> { ok, samples, spread_deg, reason }
//     The person is looking at a dot at (x, y): 0..1 of the page's viewport, x to the right,
//     y down (clientX / innerWidth, clientY / innerHeight). The plugin collects gaze samples
//     from now for hold_ms (300 to 5000, 1000 when left out) and then resolves. Call it once
//     the dot has been on screen long enough for the eyes to arrive; no lead-in is skipped.
//     samples: tracked frames in the hold. spread_deg: how far the eye angles scattered, RMS
//     degrees, null without samples. A dot that is not ok adds nothing and can be shown again.
//     reason: null | 'not_started' | 'not_running' (faceStart() has not been called, no frames) |
//             'busy' (the previous dot is still held) | 'no_face' | 'too_few_samples' (under 20)
//             | 'unsteady' (spread over 3 degrees).
//     Rejects with code 'bad_point' when x or y is not a number in 0..1.
//
//   calibrationFinish() -> { ok, gain_x, gain_y, offset_x_deg, offset_y_deg, residual_deg,
//                            samples, points, reason }
//     Fits true = gain * arkit + offset per axis (x = left and right, y = up and down) over the
//     accepted dots and ends the run. Only an ok fit is stored and used from then on; a fit
//     that is not ok leaves the stored one as it was. The numbers are null when nothing could
//     be fitted, and are given for a rejected fit so it can be looked at.
//     reason: null | 'not_started' | 'busy' | 'too_few_points' (under 5 accepted dots) |
//             'too_few_samples' (under 60 pairs) | 'too_narrow' (the dots span under 8 degrees
//             on both axes) | 'eyes_did_not_follow' (a gain outside 0.5 to 4) |
//             'poor_fit' (over 3 degrees RMS left after the fit).
//
//   calibrationStatus() -> { calibrated, at_ms | null, residual_deg | null }
//     What is stored (UserDefaults "afferent.gazeCalibration").
//
//   calibrationClear() -> {}
//     Removes the stored fit; the gain is 1 again.
//
// The measures need faceStart(); calibration only collects while they run.

/// Face measures from the TrueDepth camera. Not a plugin of its own: the AfferentPulse plugin
/// owns one of these and hands its calls on, so the app has one camera plugin.
///
/// JS: Capacitor.Plugins.AfferentPulse
///   faceStart()  -> {state}     begins the measures: baselines start over
///   faceStop()   -> {}
///   faceStatus() -> {state}
///   state: 'off' | 'starting' | 'tracking' | 'no_face' | 'unavailable' (no TrueDepth camera) | 'denied'
///   event "faceState": {state}                                          on every change
///   event "face", once per second while started:
///     {t_ms, tracked, smile: 0..1|null, movement: >=0|null, blinks: Int, gaze_away: 0..1|null,
///      distance_cm: Number|null, breathing_per_min: Number|null, breathing_snr: Number|null}
///   event "micro", once per brief facial movement (40 to 500 ms):
///     {t_ms, duration_ms, region: 'brow'|'eye'|'cheek'|'nose'|'mouth'|'jaw', peak: 0..1}
///   t_ms = wall clock, ms since 1970: the end of the second ("face"), the start of the movement ("micro").
///
/// Rules this class keeps (the measures themselves: ios/App/FaceCore, ported from ios/Afferent):
///  - It owns no camera. The app has one ARKit face-tracking session (FaceSession); its
///    delegate hands every frame to `ingest(frame:anchor:)` while the measures are started.
///  - It needs a TrueDepth camera. ARKit tracks faces without one on A12 and later, but the
///    session document says `arkit_truedepth`, so without one the state is 'unavailable'.
///  - Of a frame it reads 52 blendshape coefficients and four transforms, inside `ingest`, and
///    keeps neither the frame nor the face mesh nor a pixel. Only the numbers above leave it,
///    and only to the web layer on this phone.
///  - A measure says what the face did (smiling, facial movement, blinks, looking away, a brief
///    movement and where on the face). It names no feeling and draws no conclusion.
///  - A missing value is null, never 0: a second without a tracked face has `tracked: false` and nulls.
final class FaceMeasures {
    private weak var plugin: CAPPlugin?

    init(plugin: CAPPlugin) { self.plugin = plugin }

    /// Where the per-person gaze fit is kept (FaceGazeCalibration as JSON), the reference
    /// app's key. Without it the gaze gain is 1, and "at the screen" is still the person's own
    /// running median.
    private static let calibrationKey = "afferent.gazeCalibration"
    /// The session delegate has been silent this long: the seconds are closed without a face.
    private static let silence: TimeInterval = 1.0

    /// ARKit's blendshape keys and the lane each one has in a FaceShapeVector, built once.
    private static let lanes: [(ARFaceAnchor.BlendShapeLocation, Int)] =
        FaceBlendShapes.names.enumerated().map { (ARFaceAnchor.BlendShapeLocation(rawValue: $0.element), $0.offset) }

    private let queue = DispatchQueue(label: "afferent.face", qos: .userInitiated)
    private let lock = NSLock()
    // behind `lock`
    private var running = false
    private var state = "off"
    // on `queue` only
    private let aggregator = FaceAggregator()
    private var lastIngest: TimeInterval = 0
    private var watchdog: DispatchSourceTimer?
    private var calibrator: FaceGazeCalibrator?
    /// the page's viewport as shares of the picture on the glass
    private var viewport = CGRect(x: 0, y: 0, width: 1, height: 1)
    private var holdCall: CAPPluginCall?
    private var holdFrom: TimeInterval = 0
    private var holdUntil: TimeInterval = 0

    // MARK: - Plugin methods (AfferentPulse hands these on)

    func start(_ call: CAPPluginCall) {
        guard FaceSession.supported, FaceSession.trueDepth else {
            set(state: "unavailable")
            call.resolve(["state": "unavailable"])
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            begin(call)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted { self.begin(call) } else { self.refuse(call) }
            }
        default:
            refuse(call)
        }
    }

    func stop(_ call: CAPPluginCall) {
        lock.lock()
        let wasRunning = running
        running = false
        lock.unlock()
        queue.async {
            self.watchdog?.cancel()
            self.watchdog = nil
            self.endHold(.notRunning)
            self.aggregator.reset()
            self.set(state: "off")              // after the last frame already on the queue
        }
        DispatchQueue.main.async {
            if wasRunning { FaceSession.shared.release(.face) }
            call.resolve()
        }
    }

    func status(_ call: CAPPluginCall) {
        call.resolve(["state": currentState()])
    }

    private func begin(_ call: CAPPluginCall) {
        lock.lock()
        let wasRunning = running
        running = true
        lock.unlock()
        if !wasRunning {
            let calibration = Self.storedCalibration() ?? .identity
            queue.async {
                self.aggregator.reset()
                self.aggregator.gazeCalibration = calibration
                self.lastIngest = CACurrentMediaTime()
                self.startWatchdog()
                self.set(state: "starting")
            }
        }
        DispatchQueue.main.async {
            if !wasRunning {
                FaceSession.shared.hold(.face, frames: { [weak self] frame, face in self?.ingest(frame: frame, anchor: face) })
            }
            call.resolve(["state": wasRunning ? self.currentState() : "starting"])
        }
    }

    private func refuse(_ call: CAPPluginCall) {
        set(state: "denied")
        call.resolve(["state": "denied"])
    }

    // MARK: - Gaze calibration

    func calibrationStart(_ call: CAPPluginCall) {
        guard FaceSession.supported, FaceSession.trueDepth else {
            call.reject("needs a TrueDepth camera", "unavailable")
            return
        }
        DispatchQueue.main.async {
            guard let screen = self.screen() else {
                call.reject("the screen could not be read", "unavailable")
                return
            }
            self.queue.async {
                self.endHold(.notStarted)
                let c = FaceGazeCalibrator(geometry: screen.geometry, orientation: screen.orientation)
                c.start()
                self.calibrator = c
                self.viewport = screen.viewport
                call.resolve([
                    "screen_w_cm": (screen.geometry.widthM * 1000).rounded() / 10,
                    "screen_h_cm": (screen.geometry.heightM * 1000).rounded() / 10,
                    "density": screen.density.rawValue,
                ])
            }
        }
    }

    func calibrationPoint(_ call: CAPPluginCall) {
        guard let x = call.getDouble("x"), let y = call.getDouble("y"), (0...1).contains(x), (0...1).contains(y) else {
            call.reject("x and y are 0 to 1 of the page", "bad_point")
            return
        }
        let range = FaceTuning.calibrationHoldRangeS
        let hold = min(max((call.getDouble("hold_ms") ?? FaceTuning.calibrationHoldDefaultS * 1000) / 1000, range.lowerBound), range.upperBound)
        lock.lock()
        let on = running
        lock.unlock()
        queue.async {
            func no(_ reason: FaceCalibrationReason) {
                call.resolve(FaceCalibrationPointResult(ok: false, samples: 0, spreadDeg: nil, reason: reason).dictionary)
            }
            guard let c = self.calibrator, c.started else { no(.notStarted); return }
            guard on else { no(.notRunning); return }
            guard self.holdCall == nil else { no(.busy); return }
            let v = self.viewport
            let px = Double(v.minX) + x * Double(v.width), py = Double(v.minY) + y * Double(v.height)
            guard c.beginPoint(x: min(max(px, 0), 1), y: min(max(py, 0), 1)) else { no(.notStarted); return }
            self.holdCall = call
            self.holdFrom = CACurrentMediaTime()
            self.holdUntil = self.holdFrom + hold
        }
    }

    func calibrationFinish(_ call: CAPPluginCall) {
        queue.async {
            guard self.holdCall == nil else {
                call.resolve(FaceCalibrationResult(ok: false, calibration: nil, points: self.calibrator?.points ?? 0, reason: .busy).dictionary)
                return
            }
            guard let c = self.calibrator else {
                call.resolve(FaceCalibrationResult(ok: false, calibration: nil, points: 0, reason: .notStarted).dictionary)
                return
            }
            let result = c.finish()
            self.calibrator = nil
            if result.ok, var fit = result.calibration {
                fit.atMs = (Date().timeIntervalSince1970 * 1000).rounded()
                if let data = try? JSONEncoder().encode(fit) { UserDefaults.standard.set(data, forKey: Self.calibrationKey) }
                self.aggregator.gazeCalibration = fit
            }
            call.resolve(result.dictionary)
        }
    }

    func calibrationStatus(_ call: CAPPluginCall) {
        let fit = Self.storedCalibration()
        call.resolve([
            "calibrated": fit != nil,
            "at_ms": fit?.atMs.map { $0 as Any } ?? NSNull(),
            "residual_deg": fit?.residualDeg.map { (($0 * 100).rounded() / 100) as Any } ?? NSNull(),
        ])
    }

    func calibrationClear(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: Self.calibrationKey)
        queue.async {
            self.aggregator.gazeCalibration = .identity
            call.resolve()
        }
    }

    /// On `queue`. Closes the dot that is being held, if any, and answers its call.
    private func endHold(_ refused: FaceCalibrationReason? = nil) {
        guard let call = holdCall else { return }
        holdCall = nil
        if let refused {
            calibrator?.cancelPoint()
            call.resolve(FaceCalibrationPointResult(ok: false, samples: 0, spreadDeg: nil, reason: refused).dictionary)
        } else {
            let result = calibrator?.endPoint() ?? FaceCalibrationPointResult(ok: false, samples: 0, spreadDeg: nil, reason: .notStarted)
            call.resolve(result.dictionary)
        }
    }

    /// Main queue. The screen in metres, read from the device, not assumed:
    ///  - size: the panel's pixel count (UIScreen.nativeBounds, always portrait) divided by the
    ///    pixel density of this hardware model (hw.machine looked up in FaceScreenDensity,
    ///    Apple's published figures; `density` says whether the model was in the list);
    ///  - lens: the front camera sits in the notch or island, which is what the safe-area inset
    ///    on that edge makes room for, so it is taken half that inset down from the top edge
    ///    and in the middle left to right. Its real place a few millimetres to one side is not
    ///    something the device reports; it shifts every dot by the same small angle and ends up
    ///    in the fitted offset, not in the gain;
    ///  - orientation and the page's viewport: from the window scene and the web view's frame.
    private func screen() -> (geometry: FaceScreenGeometry, orientation: FaceScreenOrientation, viewport: CGRect, density: FaceScreenDensity.Source)? {
        guard let web = plugin?.webView, let window = web.window, window.bounds.width > 0, window.bounds.height > 0 else { return nil }
        let ui = window.windowScene?.screen ?? UIScreen.main
        let density = FaceScreenDensity.pixelsPerInch(model: Self.model(), nativeScale: Double(ui.nativeScale),
                                                      pad: UIDevice.current.userInterfaceIdiom == .pad)
        let widthM = FaceScreenDensity.metres(pixels: Double(ui.nativeBounds.width), ppi: density.ppi)
        let heightM = FaceScreenDensity.metres(pixels: Double(ui.nativeBounds.height), ppi: density.ppi)
        let insets = window.safeAreaInsets
        let notchPt = Double(max(insets.top, insets.left, insets.right))
        let longPt = Double(max(ui.bounds.width, ui.bounds.height))
        let geometry = FaceScreenGeometry(widthM: widthM, heightM: heightM, lensXM: widthM / 2, lensYM: notchPt / 2 / longPt * heightM)
        guard geometry.isValid else { return nil }
        let orientation: FaceScreenOrientation
        switch window.windowScene?.interfaceOrientation {
        case .landscapeRight: orientation = .landscapeTopLeft
        case .landscapeLeft: orientation = .landscapeTopRight
        case .portraitUpsideDown: orientation = .upsideDown
        default: orientation = .portrait
        }
        let frame = web.convert(web.bounds, to: nil)
        let viewport = CGRect(x: frame.minX / window.bounds.width, y: frame.minY / window.bounds.height,
                              width: frame.width / window.bounds.width, height: frame.height / window.bounds.height)
        return (geometry, orientation, viewport, density.source)
    }

    private static func model() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        var size = 0
        sysctlbyname("hw.machine", nil, &size, nil, 0)
        guard size > 0 else { return "" }
        var chars = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.machine", &chars, &size, nil, 0)
        return String(cString: chars)
    }

    // MARK: - Frames

    /// Called by the app's one ARKit session (FaceSession) for every frame, face or no face, on
    /// its frame queue. It copies 52 numbers and four transforms out of the frame and returns;
    /// the work happens on this class's own queue. The frame and the anchor are not kept.
    func ingest(frame: ARFrame, anchor: ARFaceAnchor?) {
        lock.lock()
        let on = running
        lock.unlock()
        guard on else { return }
        var f = FaceFrame(time: frame.timestamp, tracked: false)
        if let face = anchor {
            f.tracked = face.isTracked
            f.faceTransform = face.transform
            f.cameraTransform = frame.camera.transform
            f.leftEyeTransform = face.leftEyeTransform
            f.rightEyeTransform = face.rightEyeTransform
            let shapes = face.blendShapes
            for (location, lane) in Self.lanes {
                if let v = shapes[location]?.floatValue, v.isFinite { f.shapes[lane] = v }
            }
        }
        queue.async {
            self.lastIngest = f.time
            self.process(f)
        }
    }

    /// On `queue`.
    private func process(_ f: FaceFrame) {
        lock.lock()
        let on = running
        lock.unlock()
        guard on else { return }
        if holdCall != nil {
            if f.time >= holdFrom, f.time <= holdUntil { calibrator?.add(f) }
            if f.time >= holdUntil { endHold() }
        }
        let out = aggregator.ingest(f)
        if out.isEmpty { return }
        for m in out.micro { plugin?.notifyListeners("micro", data: m.dictionary) }
        if let face = out.face {
            set(state: face.tracked ? "tracking" : "no_face")
            plugin?.notifyListeners("face", data: face.dictionary)
        }
    }

    /// If the session delegate stops calling (no session, session interrupted), the seconds
    /// still close, as seconds without a face, and a held dot still ends. ARFrame.timestamp and
    /// CACurrentMediaTime are the same clock (time since boot).
    private func startWatchdog() {
        watchdog?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 0.5, repeating: 0.5)
        timer.setEventHandler { [weak self] in
            guard let self = self else { return }
            let now = CACurrentMediaTime()
            if now - self.lastIngest > Self.silence { self.process(FaceFrame(time: now, tracked: false)) }
        }
        timer.resume()
        watchdog = timer
    }

    // MARK: - State

    private func currentState() -> String {
        lock.lock()
        defer { lock.unlock() }
        return state
    }

    private func set(state newState: String) {
        lock.lock()
        let changed = state != newState
        state = newState
        lock.unlock()
        if changed { plugin?.notifyListeners("faceState", data: ["state": newState]) }
    }

    private static func storedCalibration() -> FaceGazeCalibration? {
        guard let data = UserDefaults.standard.data(forKey: calibrationKey) else { return nil }
        return try? JSONDecoder().decode(FaceGazeCalibration.self, from: data)
    }
}
