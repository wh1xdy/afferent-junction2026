package fi.junction.afferent

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.tan

/**
 * The level math of the room sound window (AfferentSoundLevelPlugin), free of Android classes so it is tested on the
 * build machine. Samples in, one A-weighted level per block out, in dB re full scale. The same sections as
 * demo/js/sound.js aweight() and ios/App/App/AfferentSoundLevelMeter.swift: the IEC 61672 A-weighting poles as
 * first-order sections, each prewarped through the bilinear transform, the whole made 0 dB at 1 kHz.
 * No sample is kept: each one is filtered, squared into the running block sum and dropped.
 */
class SoundLevelMeter(val sampleRate: Double, blockSeconds: Double = 0.1) {

    private class Section(highPass: Boolean, corner: Double, fs: Double) {
        val b0: Double
        val b1: Double
        val a1: Double
        var x1 = 0.0
        var y1 = 0.0

        init {
            val k = 2 * fs
            val w = k * tan(PI * corner / fs)
            val d = k + w
            b0 = if (highPass) k / d else w / d
            b1 = if (highPass) -k / d else w / d
            a1 = (w - k) / d
        }

        fun step(x: Double): Double {
            val y = b0 * x + b1 * x1 - a1 * y1
            x1 = x
            y1 = y
            return y
        }

        fun magnitude(omega: Double): Double {
            val c = cos(omega)
            val s = sin(omega)
            return hypot(b0 + b1 * c, b1 * s) / hypot(1 + a1 * c, a1 * s)
        }
    }

    val blockLength: Int = max(1, (sampleRate * blockSeconds).roundToInt())
    // the 12194 Hz sections only where the sample rate can hold them
    private val sections: List<Section> = POLES.filter { it.first || it.second < 0.45 * sampleRate }
        .map { Section(it.first, it.second, sampleRate) }
    private val gain: Double = 1.0 / sections.fold(1.0) { g, s -> g * s.magnitude(2 * PI * 1000 / sampleRate) }
    private var sum = 0.0
    private var count = 0

    /** One level per finished block, in dBFS (A-weighted mean square; a full-scale 1 kHz sine is -3 dB). */
    val blocks = ArrayList<Double>()

    /** The weighting's gain at a frequency, in dB (0 at 1 kHz). */
    fun response(frequency: Double): Double {
        val omega = 2 * PI * frequency / sampleRate
        return 20 * log10(gain * sections.fold(1.0) { g, s -> g * s.magnitude(omega) })
    }

    /** 16-bit PCM, as AudioRecord reads it. */
    fun process(samples: ShortArray, length: Int = samples.size) {
        for (i in 0 until length) add(samples[i] / 32768.0)
    }

    fun process(samples: FloatArray, length: Int = samples.size) {
        for (i in 0 until length) add(samples[i].toDouble())
    }

    private fun add(x: Double) {
        var v = x
        for (s in sections) v = s.step(v)
        v *= gain
        sum += v * v
        count++
        if (count == blockLength) {
            blocks.add(dbfs(sum / count))
            sum = 0.0
            count = 0
        }
    }

    companion object {
        const val FLOOR_DB = -120.0
        private val POLES = listOf(
            true to 20.598997, true to 20.598997, true to 107.65265, true to 737.86223, false to 12194.217, false to 12194.217,
        )

        fun dbfs(meanSquare: Double): Double = if (meanSquare > 0) max(FLOOR_DB, 10 * log10(meanSquare)) else FLOOR_DB
    }
}
