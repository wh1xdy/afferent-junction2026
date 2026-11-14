import Foundation

/// Every constant of the face measures in one place, with where it came from.
///
/// "Reference" is the native app in ios/Afferent, tuned on real TrueDepth recordings (exports
/// analysed with ios/tools/analyze_session.py). Values marked NEW do not exist in the reference
/// and have not been tuned on a real face.
public enum FaceTuning {

    // MARK: Brief facial movements (reference: Expressions.swift, BurstDetector + ExpressionSession)

    /// A brief facial movement lasts 40 to 500 ms (ExpressionEvent.isMicro). Longer ones are
    /// detected the same way but never reported.
    public static let microMinS = 0.04
    public static let microMaxS = 0.5
    /// Baseline = median of the channel's last 300 frames, 5 s at 60 Hz (BurstDetector.historyLen).
    public static let baselineFrames = 300
    /// No onset before the baseline holds 30 frames (BurstDetector.feed, `history.count >= 30`).
    public static let warmupFrames = 30
    /// Onset above baseline + max(minRise, 4 x median absolute deviation); offset below
    /// baseline + half of that (BurstDetector.feed).
    public static let madFactor = 4.0
    /// Rise above the person's own baseline, in blendshape units, per channel (BurstDetector.minRise).
    /// Measured on a real face: a slight smile is only +0.05 to 0.09 (a big one +0.77), so the
    /// lip-corner channel gets 0.04 and the left/right lip-corner difference 0.05; all others 0.10.
    public static let minRiseLipCorner = 0.04
    public static let minRiseLipCornerDifference = 0.05
    public static let minRiseDefault = 0.10
    /// One facial action moves several channels. Two bursts are the same action when they
    /// overlap by more than half of the shorter one; the one strongest relative to its own
    /// minRise is kept (ExpressionSession.add).
    public static let overlapShare = 0.5

    // MARK: Gaze (reference: Expressions.swift ExpressionSession.feedGaze, Gaze.swift)

    /// Beyond 25 degrees from where the person mostly looks, ARKit's blendshapes are unreliable
    /// (ExpressionSession.farDeg). The contract uses the same limit for `gaze_away`.
    public static let farDeg = 25.0
    /// A burst is dropped when the gaze was that far away at any time from 0.3 s before its
    /// onset until it ended (ExpressionSession.feed, `farUntil = t + 0.3`).
    public static let farHoldS = 0.3
    /// "At the screen" = running median of the gaze, sampled at 10 Hz over the last 60 s
    /// (ExpressionSession.feedGaze: every 6th frame, 600 values). People hold the phone below
    /// eye level, so it is neither 0 degrees nor fixed.
    public static let gazeHistoryStepS = 0.1
    public static let gazeHistoryCount = 600
    /// Gaze calibration fit (Gaze.swift, GazeCalibration.fit): at least 60 pairs; an axis with
    /// less than 8 degrees of head movement keeps gain 1; gain limited to 0.5...4.
    public static let calibrationMinPairs = 60
    public static let calibrationMinSpreadDeg = 8.0
    public static let calibrationGainRange = 0.5...4.0
    /// The reference ran its calibration for 8 s of tracked frames (ExpressionView.calibrationSeconds).
    /// Here it is a number of dots; these are the limits around that. All NEW, the reference
    /// stored whatever its fit returned, and none is tuned on a real face:
    /// one dot is held 0.3 to 5 s (1 s when the caller gives nothing),
    public static let calibrationHoldRangeS = 0.3...5.0
    public static let calibrationHoldDefaultS = 1.0
    /// a dot counts with at least 20 tracked frames (a third of a second),
    public static let calibrationMinPointSamples = 20
    /// whose ARKit eye angles stay within 3 degrees RMS of their mean (the eyes left the dot otherwise),
    public static let calibrationMaxPointSpreadDeg = 3.0
    /// a fit needs 5 such dots (four corners and the middle),
    public static let calibrationMinPoints = 5
    /// and is kept only when it leaves no more than 3 degrees RMS between the corrected gaze and the dots.
    public static let calibrationMaxResidualDeg = 3.0

    // MARK: Smile (reference: Expressions.swift ExpressionSession.feed)

    /// Personal baseline = median over the first 10 s (ExpressionSession.calibrationS).
    public static let smileCalibrationS = 10.0
    /// Baseline used until those 10 s have passed (the `?? 0.02` in the same place).
    public static let smileFallbackBaseline = 0.02
    /// Smiling = more than 0.04 above the baseline (the `+ 0.04` in the same place). The web
    /// layer uses this on the 1 Hz `smile` value for `smile_share`.
    public static let smileThreshold = 0.04

    // MARK: Blinks (reference: Expressions.swift ExpressionSession.feed)

    /// Closed above 0.6, open again below 0.4: resting eyeBlink is 0.2 to 0.3 on real faces.
    public static let blinkClosed = 0.6
    public static let blinkOpen = 0.4

    // MARK: Breathing from head motion (reference: Breathing.swift, BreathingMath)

    /// 0.07 to 0.6 Hz = 4 to 36 breaths per minute (6/min paced breathing is inside).
    public static let breathingBandHz = (lo: 0.07, hi: 0.6)
    /// Last 40 s, at least 25 s and 100 samples.
    public static let breathingWindowS = 40.0
    public static let breathingMinWindowS = 25.0
    public static let breathingMinSamples = 100
    /// Resampled to 10 Hz; high-pass = minus a 20 s moving average (a straight-line detrend left
    /// the head's posture drift, measured 13 mm over 35 s, in the band).
    public static let breathingResampleHz = 10.0
    public static let breathingHighPassS = 20.0
    /// Spectrum on a 0.005 Hz grid; signal = power within 0.03 Hz of the peak; a peak in the two
    /// outermost bins on either side is drift and gives no reading.
    public static let breathingGridHz = 0.005
    public static let breathingPeakHalfWidthHz = 0.03
    /// The head samples kept: 70 s at 60 Hz (ExpressionView.swift, `60 * 70`).
    public static let breathingSampleCapacity = 60 * 70

    // MARK: NEW in this port (not in the reference, not tuned on a real face)

    /// A breathing value is given only when the peak is clear: more than 3 dB, and for 8
    /// estimates in a row (one per second) within 1.5 breaths per minute of the current one.
    /// The reference shows head-motion breathing as soon as one estimate has snr > 0 dB
    /// (`clearestBreathing`). Simulated, 100 sessions of 70 s each: with the reference's rule,
    /// 0.4 mm of sensor noise alone gave a rate in 1.6 % of the seconds and a randomly swaying
    /// head (a random walk of 0.02 to 0.05 mm per frame) in 30 to 35 %; with this rule 0 % and
    /// 2 to 3 %. A 1 mm breath is found either way, here about 7 s later (from 32 s on).
    public static let breathingClearSnrDb = 3.0
    public static let breathingStableEstimates = 8
    public static let breathingStableTolerancePerMin = 1.5

    /// Frames further apart than this are a tracking gap: running bursts are cancelled, an open
    /// blink is forgotten and no change is measured across the gap.
    public static let trackingGapS = 0.25
    /// A tracking gap this long restarts the breathing window (the head has moved meanwhile).
    public static let breathingGapS = 1.0
    /// `movement` is measured between 0.1 s means of each blendshape, so that frame-to-frame
    /// tracker jitter at 60 Hz does not add up to a movement of its own.
    public static let movementBlockS = 0.1
    /// A second counts as tracked when a face was tracked for at least half of it (contract).
    public static let trackedShare = 0.5
    /// The smile baseline needs at least this many frames from its 10 s; otherwise the 10 s restart.
    public static let smileCalibrationMinFrames = 30
}
