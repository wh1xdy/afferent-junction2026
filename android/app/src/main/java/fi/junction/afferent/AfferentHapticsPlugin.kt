package fi.junction.afferent

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.annotation.RequiresApi
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * The Android twin of ios/App/App/AfferentHaptics.swift, with the same JS interface, so demo/js/haptics.js
 * routes every game event here before it tries the Capacitor Haptics plugin:
 *
 *   available() -> { haptics, continuous, primitives }
 *   play({ name, gain, sharp })           one word of the vocabulary (HapticShapes.WORDS)
 *   holdStart({ durationMs, from }), holdStop(), success()     the kindle
 *   dragStart({ level, gain }), dragMove({ level }), dragStop() a hum that follows progress
 *   breath({ phase, durationMs, gain })   the breath guide
 *   beat({ strength, gapMs })             one heartbeat, the twin of the heartbeat's iOS method
 *   stopAll(), warm({ on })
 *
 * Where Android differs from iOS:
 *   - Sharpness has no control here; the word picks its primitives instead (THUD and LOW_TICK are the dull ones).
 *   - A vibration replaces the one playing, so a word played during a drag hum pauses it, and the hum comes back after.
 *   - Continuous patterns need a motor with amplitude control; `continuous` is false without one, and the router then
 *     ticks instead.
 * Everything runs on the main thread, as on iOS.
 */
@CapacitorPlugin(name = "AfferentHaptics")
class AfferentHapticsPlugin : Plugin() {
    private val main = Handler(Looper.getMainLooper())
    private var vibrator: Vibrator? = null
    private var holdUntil = 0L
    private var dragOn = false
    private var dragLevel = 0.0
    private var dragGain = 0.9
    private var dragAmp = 0
    private var dragSentAt = 0L
    private var dragSeen = 0
    private var resume: Runnable? = null

    override fun load() {
        vibrator = findVibrator(context)
    }

    @Suppress("DEPRECATION")
    private fun findVibrator(ctx: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
        else ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

    private fun ready(): Vibrator? = vibrator?.takeIf { it.hasVibrator() }
    private fun amplitudes(v: Vibrator) = Build.VERSION.SDK_INT >= 26 && v.hasAmplitudeControl()
    private fun holding() = SystemClock.uptimeMillis() < holdUntil
    private fun played(ok: Boolean) = JSObject().put("played", ok)
    private fun gain(call: PluginCall, fallback: Double = 0.9) = (call.getDouble("gain") ?: fallback).coerceIn(0.05, 1.0)

    @PluginMethod
    fun available(call: PluginCall) {
        main.post {
            val v = ready()
            call.resolve(
                JSObject()
                    .put("haptics", v != null)
                    .put("continuous", v != null && amplitudes(v))
                    .put("primitives", v != null && Build.VERSION.SDK_INT >= 30 && primitives(v, HapticShapes.Primitive.entries))
            )
        }
    }

    @PluginMethod
    fun play(call: PluginCall) {
        val word = call.getString("name") ?: ""
        val gain = gain(call)
        main.post { call.resolve(played(playWord(word, gain))) }
    }

    @PluginMethod
    fun holdStart(call: PluginCall) {
        val ms = (call.getDouble("durationMs") ?: 900.0).coerceIn(80.0, 5000.0).toInt()
        val from = call.getDouble("from") ?: 0.0
        main.post {
            val v = ready()
            if (v == null || !amplitudes(v)) { call.resolve(played(false)); return@post }
            wave(v, HapticShapes.ramp(HapticShapes.holdPoints(from), ms, 1.0))
            holdUntil = SystemClock.uptimeMillis() + ms
            call.resolve(played(true))
        }
    }

    @PluginMethod
    fun holdStop(call: PluginCall) {
        main.post {
            if (holding()) { holdUntil = 0; vibrator?.cancel() }
            call.resolve()
        }
    }

    @PluginMethod
    fun success(call: PluginCall) {
        main.post {
            holdUntil = 0
            call.resolve(played(playWord("success", 1.0)))
        }
    }

    @PluginMethod
    fun dragStart(call: PluginCall) {
        val level = (call.getDouble("level") ?: 0.0).coerceIn(0.0, 1.0)
        val gain = gain(call)
        main.post {
            val v = ready()
            if (v == null || !amplitudes(v)) { call.resolve(played(false)); return@post }
            dragOn = true; dragLevel = level; dragGain = gain
            hum(v)
            watchDrag()
            call.resolve(played(true))
        }
    }

    @PluginMethod
    fun dragMove(call: PluginCall) {
        val level = (call.getDouble("level") ?: 0.0).coerceIn(0.0, 1.0)
        main.post {
            val v = ready()
            if (!dragOn || v == null) { call.resolve(played(false)); return@post }
            dragLevel = level
            watchDrag()
            val a = HapticShapes.amplitude(HapticShapes.hum(level) * dragGain)
            // A new waveform only when the change can be felt, and not more than 20 times a second.
            if (Math.abs(a - dragAmp) >= 6 && SystemClock.uptimeMillis() - dragSentAt >= 50 && resume == null) hum(v)
            call.resolve(played(true))
        }
    }

    @PluginMethod
    fun dragStop(call: PluginCall) {
        main.post {
            endDrag(true)
            call.resolve()
        }
    }

    @PluginMethod
    fun breath(call: PluginCall) {
        val inhale = call.getString("phase") != "out"
        val ms = (call.getDouble("durationMs") ?: 4000.0).coerceIn(600.0, 12000.0).toInt()
        val gain = gain(call, 0.7)
        main.post {
            val v = ready()
            if (v == null || !amplitudes(v)) { call.resolve(played(false)); return@post }
            val w = HapticShapes.breath(inhale, ms, gain)
            wave(v, w)
            holdUntil = SystemClock.uptimeMillis() + w.totalMs
            call.resolve(played(true))
        }
    }

    /** One heartbeat. Like iOS it never plays over a hold or a breath. */
    @PluginMethod
    fun beat(call: PluginCall) {
        val strength = call.getDouble("strength") ?: 0.6
        val gap = (call.getDouble("gapMs") ?: 160.0).coerceIn(90.0, 300.0).toInt()
        main.post {
            val v = ready()
            if (v == null || holding()) { call.resolve(played(false)); return@post }
            if (Build.VERSION.SDK_INT >= 31 && primitives(v, listOf(HapticShapes.Primitive.LOW_TICK))) {
                compose(v, listOf(
                    HapticShapes.Step(HapticShapes.Primitive.LOW_TICK, (0.55 * strength).toFloat()),
                    HapticShapes.Step(HapticShapes.Primitive.LOW_TICK, (0.32 * strength).toFloat(), gap - HapticShapes.Primitive.LOW_TICK.ms),
                ), 1.0)
            } else if (amplitudes(v)) wave(v, HapticShapes.beat(strength, gap))
            else pulse(v, longArrayOf(0, 10, gap.toLong(), 6))
            resumeDragAfter(gap + 40L)
            call.resolve(played(true))
        }
    }

    @PluginMethod
    fun stopAll(call: PluginCall) {
        main.post {
            val was = dragOn || holding()
            endDrag(false)
            holdUntil = 0
            if (was) vibrator?.cancel()
            call.resolve()
        }
    }

    /** Android keeps no engine to warm; the call exists so the router does not need to ask. */
    @PluginMethod
    fun warm(call: PluginCall) {
        call.resolve()
    }

    /** Plays one word in the best form this phone has. */
    private fun playWord(word: String, gain: Double): Boolean {
        val v = ready() ?: return false
        val steps = HapticShapes.composition(word) ?: return false
        val ms = when {
            Build.VERSION.SDK_INT >= 30 && primitives(v, steps.map { it.primitive }) -> compose(v, steps, gain)
            amplitudes(v) -> HapticShapes.waveform(word, gain)?.let { wave(v, it) } ?: return false
            else -> HapticShapes.pulses(word, gain)?.let { pulse(v, it) } ?: return false
        }
        resumeDragAfter(ms + 10)
        return true
    }

    private fun primitives(v: Vibrator, list: Collection<HapticShapes.Primitive>): Boolean {
        if (Build.VERSION.SDK_INT < 30) return false
        val ids = list.map { primitiveId(it) ?: return false }
        return v.areAllPrimitivesSupported(*ids.toIntArray())
    }

    private fun primitiveId(p: HapticShapes.Primitive): Int? = when (p) {
        HapticShapes.Primitive.CLICK -> if (Build.VERSION.SDK_INT >= 30) VibrationEffect.Composition.PRIMITIVE_CLICK else null
        HapticShapes.Primitive.TICK -> if (Build.VERSION.SDK_INT >= 30) VibrationEffect.Composition.PRIMITIVE_TICK else null
        HapticShapes.Primitive.QUICK_RISE -> if (Build.VERSION.SDK_INT >= 30) VibrationEffect.Composition.PRIMITIVE_QUICK_RISE else null
        HapticShapes.Primitive.SLOW_RISE -> if (Build.VERSION.SDK_INT >= 30) VibrationEffect.Composition.PRIMITIVE_SLOW_RISE else null
        HapticShapes.Primitive.QUICK_FALL -> if (Build.VERSION.SDK_INT >= 30) VibrationEffect.Composition.PRIMITIVE_QUICK_FALL else null
        HapticShapes.Primitive.LOW_TICK -> if (Build.VERSION.SDK_INT >= 31) VibrationEffect.Composition.PRIMITIVE_LOW_TICK else null
        HapticShapes.Primitive.THUD -> if (Build.VERSION.SDK_INT >= 31) VibrationEffect.Composition.PRIMITIVE_THUD else null
    }

    @RequiresApi(30)
    private fun compose(v: Vibrator, steps: List<HapticShapes.Step>, gain: Double): Long {
        val c = VibrationEffect.startComposition()
        for (s in steps) c.addPrimitive(primitiveId(s.primitive) ?: continue, (s.scale * gain).toFloat().coerceIn(0f, 1f), s.delayMs.coerceAtLeast(0))
        v.vibrate(c.compose())
        return HapticShapes.compositionMs(steps)
    }

    @Suppress("DEPRECATION")
    private fun wave(v: Vibrator, w: HapticShapes.Wave): Long {
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(w.timings, w.amplitudes, -1))
        else v.vibrate(w.timings.filterIndexed { i, _ -> w.amplitudes[i] > 0 }.sum())
        return w.totalMs
    }

    @Suppress("DEPRECATION")
    private fun pulse(v: Vibrator, timings: LongArray): Long {
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(timings, -1))
        else v.vibrate(timings, -1)
        return timings.sum()
    }

    /** The drag hum: one long segment that repeats until it is replaced or cancelled. */
    private fun hum(v: Vibrator) {
        if (Build.VERSION.SDK_INT < 26) return
        dragAmp = HapticShapes.amplitude(HapticShapes.hum(dragLevel) * dragGain)
        dragSentAt = SystemClock.uptimeMillis()
        v.vibrate(VibrationEffect.createWaveform(longArrayOf(1000), intArrayOf(dragAmp), 0))
    }

    /** A word replaced the hum; it comes back once the word has played. */
    private fun resumeDragAfter(ms: Long) {
        if (!dragOn) return
        resume?.let { main.removeCallbacks(it) }
        val r = Runnable { resume = null; if (dragOn) ready()?.let { hum(it) } }
        resume = r
        main.postDelayed(r, ms)
    }

    /** A hum nobody moves for 10 s ends by itself, in case a page forgets it. */
    private fun watchDrag() {
        val seen = ++dragSeen
        main.postDelayed({ if (dragSeen == seen && dragOn) endDrag(true) }, 10_000)
    }

    private fun endDrag(fade: Boolean) {
        if (!dragOn) return
        dragOn = false
        dragSeen++
        resume?.let { main.removeCallbacks(it) }
        resume = null
        val v = vibrator ?: return
        if (fade && Build.VERSION.SDK_INT >= 26 && amplitudes(v)) {
            val a = dragAmp
            v.vibrate(VibrationEffect.createWaveform(longArrayOf(40, 40, 40), intArrayOf((a * 0.6).toInt().coerceAtLeast(1), (a * 0.35).toInt().coerceAtLeast(1), (a * 0.15).toInt().coerceAtLeast(1)), -1))
        } else v.cancel()
    }
}
