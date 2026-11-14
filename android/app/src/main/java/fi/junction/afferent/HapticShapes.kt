package fi.junction.afferent

import kotlin.math.roundToInt

/**
 * The haptic vocabulary of demo/js/haptics.js for Android, as plain data so the JVM tests can check it.
 * AfferentHapticsPlugin turns it into VibrationEffects, the best form the phone has first:
 *   - a composition of primitives (Android 11+, when the motor has every primitive of the word): closest to iOS,
 *   - an amplitude waveform (Android 8+ with amplitude control): soft tails and swells as amplitude steps,
 *   - on/off pulses (any vibrator), the same lengths as the router's navigator.vibrate fallback.
 * The numbers follow the Core Haptics patterns in ios/App/App/AfferentHaptics.swift: soft, rounded, never buzzy.
 */
object HapticShapes {
    /** Every one-shot word of the vocabulary. The router's "heart" plays through AfferentHapticsPlugin.beat. */
    val WORDS = listOf("touch", "tick", "hit", "bright", "miss", "land", "rise", "success", "complete", "rhythm")

    enum class Primitive(val ms: Int) { CLICK(12), TICK(8), LOW_TICK(10), THUD(60), QUICK_RISE(150), SLOW_RISE(300), QUICK_FALL(80) }

    /** One primitive of a composition: its scale before gain (0..1) and the pause before it (ms). */
    data class Step(val primitive: Primitive, val scale: Float, val delayMs: Int = 0)

    /** A waveform for VibrationEffect.createWaveform: segment lengths (ms) and amplitudes (0 is off, 1..255). */
    class Wave(val timings: LongArray, val amplitudes: IntArray) {
        val totalMs: Long get() = timings.sum()
    }

    fun composition(word: String): List<Step>? = when (word) {
        "touch" -> listOf(Step(Primitive.LOW_TICK, 0.7f))
        "tick" -> listOf(Step(Primitive.TICK, 0.5f))
        "hit" -> listOf(Step(Primitive.CLICK, 0.55f))
        "bright" -> listOf(Step(Primitive.CLICK, 0.55f), Step(Primitive.TICK, 0.55f, 40))
        "miss" -> listOf(Step(Primitive.THUD, 0.32f))
        "land" -> listOf(Step(Primitive.THUD, 0.65f))
        "rise" -> listOf(Step(Primitive.QUICK_RISE, 0.4f), Step(Primitive.CLICK, 0.65f))
        "success" -> listOf(Step(Primitive.CLICK, 0.7f), Step(Primitive.QUICK_FALL, 0.35f), Step(Primitive.CLICK, 1f, 30), Step(Primitive.QUICK_FALL, 0.2f))
        "complete" -> listOf(
            Step(Primitive.SLOW_RISE, 0.4f), Step(Primitive.CLICK, 0.8f), Step(Primitive.QUICK_FALL, 0.45f),
            Step(Primitive.CLICK, 1f, 30), Step(Primitive.QUICK_FALL, 0.3f), Step(Primitive.QUICK_FALL, 0.15f, 60),
        )
        "rhythm" -> listOf(Step(Primitive.LOW_TICK, 0.8f))
        else -> null
    }

    /** How long a composition lasts, roughly (the primitives' lengths depend on the motor). */
    fun compositionMs(steps: List<Step>): Long = steps.sumOf { (it.delayMs + it.primitive.ms).toLong() }

    /** Segments of (ms, strength 0..1) before gain, for motors with amplitude control. */
    private fun segments(word: String): List<Pair<Int, Double>>? = when (word) {
        "touch" -> listOf(12 to 0.32)
        "tick" -> listOf(7 to 0.45)
        "hit" -> listOf(12 to 0.62, 24 to 0.22)
        "bright" -> listOf(12 to 0.62, 20 to 0.2, 18 to 0.0, 8 to 0.45)
        "miss" -> listOf(25 to 0.14, 40 to 0.22, 45 to 0.08)
        "land" -> listOf(16 to 0.85, 40 to 0.38, 60 to 0.14)
        "rise" -> listOf(60 to 0.08, 60 to 0.2, 60 to 0.34, 60 to 0.46, 14 to 0.72)
        "success" -> listOf(14 to 0.75, 40 to 0.5, 60 to 0.4, 14 to 1.0, 80 to 0.3, 120 to 0.12)
        "complete" -> listOf(
            120 to 0.06, 120 to 0.16, 120 to 0.3, 100 to 0.46, 14 to 0.8, 60 to 0.5, 60 to 0.42,
            14 to 1.0, 120 to 0.3, 200 to 0.16, 300 to 0.06,
        )
        "rhythm" -> listOf(10 to 0.5, 20 to 0.18)
        else -> null
    }

    fun waveform(word: String, gain: Double): Wave? = segments(word)?.let { s ->
        Wave(s.map { it.first.toLong() }.toLongArray(), s.map { amplitude(it.second * gain) }.toIntArray())
    }

    /** On/off timings for createWaveform(timings, -1): off first, then on, off, on... The on parts shrink with the gain. */
    fun pulses(word: String, gain: Double): LongArray? {
        val on = when (word) {
            "touch" -> listOf(7)
            "tick" -> listOf(5)
            "hit" -> listOf(12)
            "bright" -> listOf(12, 40, 5)
            "miss" -> listOf(9)
            "land" -> listOf(20)
            "rise" -> listOf(6, 50, 9, 50, 14)
            "success" -> listOf(10, 70, 14, 70, 22)
            "complete" -> listOf(6, 60, 10, 60, 14, 90, 24)
            "rhythm" -> listOf(8)
            else -> return null
        }
        val k = 0.5 + 0.5 * gain.coerceIn(0.0, 1.0)
        return (listOf(0L) + on.mapIndexed { i, ms -> if (i % 2 == 0) maxOf(3L, (ms * k).roundToInt().toLong()) else ms.toLong() }).toLongArray()
    }

    /** A strength (0..1) as an amplitude. Below 3% is off; anything else at least 12, the least most motors render. */
    fun amplitude(x: Double): Int {
        val v = x.coerceIn(0.0, 1.0)
        return if (v < 0.03) 0 else maxOf(12, (v * 255).roundToInt())
    }

    /** A curve through (fraction of the duration, strength) points, sampled every stepMs. */
    fun ramp(points: List<Pair<Double, Double>>, durationMs: Int, gain: Double, stepMs: Int = 20): Wave {
        val n = maxOf(1, (durationMs + stepMs - 1) / stepMs)
        val timings = LongArray(n) { i -> minOf(stepMs, durationMs - i * stepMs).coerceAtLeast(1).toLong() }
        val amps = IntArray(n) { i -> amplitude(at(points, (i * stepMs + stepMs / 2.0) / durationMs) * gain) }
        return Wave(timings, amps)
    }

    private fun at(points: List<Pair<Double, Double>>, x: Double): Double {
        if (x <= points.first().first) return points.first().second
        for (i in 1 until points.size) {
            val (x0, y0) = points[i - 1]
            val (x1, y1) = points[i]
            if (x <= x1) return if (x1 == x0) y1 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        }
        return points.last().second
    }

    /** The kindle's swell, as AfferentHaptics.holdStart on iOS: from the progress it starts at to 0.55 at the end. */
    fun holdPoints(from: Double): List<Pair<Double, Double>> {
        val i0 = 0.08 + 0.42 * from.coerceIn(0.0, 1.0)
        return listOf(0.0 to i0, 0.6 to maxOf(i0, 0.3), 1.0 to 0.55)
    }

    /** The inhale swells slowly and eases near the top. */
    val BREATH_IN = listOf(0.0 to 0.0, 0.12 to 0.1, 0.55 to 0.3, 0.9 to 0.46, 1.0 to 0.5)

    /** The exhale: one soft tap at the turn, then a fade over the first 60% of it (at most 3.2 s), then quiet. */
    fun breath(inhale: Boolean, durationMs: Int, gain: Double): Wave {
        if (inhale) return ramp(BREATH_IN, durationMs, gain, 40)
        val fade = ramp(listOf(0.0 to 0.5, 0.3 to 0.32, 0.7 to 0.1, 1.0 to 0.0), minOf((durationMs * 0.6).roundToInt(), 3200), gain, 40)
        return Wave(longArrayOf(12L) + fade.timings, intArrayOf(amplitude(0.3 * gain)) + fade.amplitudes)
    }

    /** The drag hum for a progress (0..1): barely there at the start, never more than half strength. */
    fun hum(level: Double): Double = 0.14 + 0.36 * level.coerceIn(0.0, 1.0)

    /** One heartbeat: a soft lub and a quieter dub, gap ms apart (the twin of AfferentHaptics.beat on iOS). */
    fun beat(strength: Double, gapMs: Int): Wave {
        val s = strength.coerceIn(0.1, 1.0)
        return Wave(longArrayOf(14, (gapMs - 14).coerceAtLeast(40).toLong(), 12), intArrayOf(amplitude(0.55 * s), 0, amplitude(0.32 * s)))
    }
}
