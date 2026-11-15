package fi.junction.afferent

import kotlin.math.PI
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Runs on the build machine (./gradlew testDebugUnitTest), no device needed. The room sound meter on synthetic sines:
 * the A-weighting curve against IEC 61672 (within 1 dB from 50 Hz to 10 kHz), RMS to dBFS and one level per 100 ms,
 * the same numbers as ios/App/TeamTests SoundLevelMeterTests and demo/tests/sound.test.js.
 */
class SoundLevelMeterTest {
    private fun sine(f: Double, amplitude: Double = 1.0, seconds: Double = 2.0, rate: Int = 44100) =
        ShortArray((seconds * rate).toInt()) { (amplitude * 32767 * sin(2 * PI * f * it / rate)).toInt().toShort() }

    private fun level(f: Double, amplitude: Double = 1.0, rate: Int = 44100): Double {
        val m = SoundLevelMeter(rate.toDouble())
        m.process(sine(f, amplitude, rate = rate))
        val steady = m.blocks.drop(5)
        return 10 * log10(steady.sumOf { 10.0.pow(it / 10) } / steady.size)
    }

    @Test
    fun theWeightingFollowsTheACurve() {
        val curve = listOf(50.0 to -30.2, 100.0 to -19.1, 250.0 to -8.6, 500.0 to -3.2, 1000.0 to 0.0, 2000.0 to 1.2, 4000.0 to 1.0, 8000.0 to -1.1, 10000.0 to -2.5)
        for (rate in listOf(44100, 48000)) {
            val m = SoundLevelMeter(rate.toDouble())
            for ((f, a) in curve) {
                assertEquals("$f Hz at $rate", a, m.response(f), 1.0)
                assertEquals("$f Hz sine at $rate", a, level(f, rate = rate) + 3.0103, 1.0)
            }
        }
    }

    @Test
    fun rmsToDbfsAndOneBlockPer100ms() {
        val m = SoundLevelMeter(44100.0)
        assertEquals(4410, m.blockLength)
        m.process(sine(1000.0, 0.1, 1.0))
        assertEquals(10, m.blocks.size)
        assertEquals(-23.01, m.blocks.last(), 0.05)
        assertEquals(-20.0, level(1000.0, 0.01) - level(1000.0, 0.1), 0.1)
    }

    @Test
    fun silenceIsTheFloor() {
        val m = SoundLevelMeter(44100.0)
        m.process(ShortArray(8820))
        assertEquals(listOf(SoundLevelMeter.FLOOR_DB, SoundLevelMeter.FLOOR_DB), m.blocks)
        assertEquals(0.0, SoundLevelMeter.dbfs(1.0), 1e-9)
    }
}
