package fi.junction.afferent

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Runs on the build machine (./gradlew testDebugUnitTest), no device needed. */
class HapticShapesTest {

    /** The words the router (demo/js/haptics.js) plays through play(); heart goes through beat(). */
    @Test
    fun everyWebWordHasAnAndroidShape() {
        val js = listOf("../../demo/js/haptics.js", "../demo/js/haptics.js", "demo/js/haptics.js").map(::File).firstOrNull { it.exists() }
        assertNotNull("demo/js/haptics.js not found from ${File(".").absolutePath}", js)
        val vocab = Regex("""const VOCAB = \{(.*?)\n  \};""", RegexOption.DOT_MATCHES_ALL).find(js!!.readText())!!.groupValues[1]
        val words = Regex("""^\s{4}(\w+): \{""", RegexOption.MULTILINE).findAll(vocab).map { it.groupValues[1] }.toSet()
        assertEquals(words - "heart", HapticShapes.WORDS.toSet())
    }

    @Test
    fun everyWordHasAllThreeForms() {
        for (w in HapticShapes.WORDS) {
            val c = HapticShapes.composition(w)
            assertTrue("$w has no composition", !c.isNullOrEmpty())
            for (s in c!!) assertTrue("$w: scale ${s.scale}", s.scale in 0f..1f && s.delayMs >= 0)
            for (gain in listOf(0.3, 0.7, 1.0)) {
                val wave = HapticShapes.waveform(w, gain)!!
                assertEquals(wave.timings.size, wave.amplitudes.size)
                assertTrue("$w: a segment with no length", wave.timings.all { it > 0 })
                assertTrue("$w: amplitude out of range", wave.amplitudes.all { it in 0..255 })
                assertTrue("$w: silent at gain $gain", wave.amplitudes.any { it > 0 })
                val p = HapticShapes.pulses(w, gain)!!
                assertEquals("$w: pulses start with the off time", 0L, p[0])
                assertTrue("$w: pulses", p.size % 2 == 0 && p.drop(1).all { it > 0 })
            }
        }
    }

    /** Soft, never buzzy: no word lasts long, and the dull ones stay low. */
    @Test
    fun wordsStaySoft() {
        for (w in HapticShapes.WORDS) {
            val wave = HapticShapes.waveform(w, 1.0)!!
            assertTrue("$w lasts ${wave.totalMs} ms", wave.totalMs <= if (w == "complete") 1400 else 450)
        }
        assertTrue(HapticShapes.waveform("miss", 1.0)!!.amplitudes.max() < HapticShapes.waveform("hit", 1.0)!!.amplitudes.max())
        assertTrue(HapticShapes.waveform("touch", 1.0)!!.amplitudes.max() < 100)
        assertEquals(HapticShapes.Primitive.THUD, HapticShapes.composition("miss")!!.single().primitive)
    }

    @Test
    fun gainScalesStrength() {
        for (w in HapticShapes.WORDS) {
            val soft = HapticShapes.waveform(w, 0.5)!!.amplitudes.max()
            val full = HapticShapes.waveform(w, 1.0)!!.amplitudes.max()
            assertTrue("$w: $soft vs $full", soft < full)
        }
    }

    /** The kindle swell and the breath follow the iOS curves: rising, ending where iOS ends. */
    @Test
    fun rampsFollowTheIosCurves() {
        val hold = HapticShapes.ramp(HapticShapes.holdPoints(0.0), 900, 1.0)
        assertEquals(900L, hold.totalMs)
        assertTrue(hold.amplitudes.first() < hold.amplitudes.last())
        assertEquals(HapticShapes.amplitude(0.55), hold.amplitudes.last(), 3)
        val late = HapticShapes.ramp(HapticShapes.holdPoints(0.8), 180, 1.0)
        assertTrue("a hold picked up late starts stronger", late.amplitudes.first() > hold.amplitudes.first())

        val inhale = HapticShapes.breath(true, 4000, 0.7)
        assertEquals(4000L, inhale.totalMs)
        assertEquals("the inhale starts from nothing", 0, inhale.amplitudes.first())
        assertTrue(inhale.amplitudes.toList().zipWithNext().all { (a, b) -> b >= a })
        val exhale = HapticShapes.breath(false, 6000, 0.7)
        assertTrue("the exhale fades within its first 60%", exhale.totalMs <= 12 + 3200)
        assertEquals("and ends quiet", 0, exhale.amplitudes.last())
    }

    @Test
    fun humFollowsProgress() {
        assertTrue(HapticShapes.hum(0.0) < HapticShapes.hum(0.5))
        assertTrue(HapticShapes.hum(1.0) <= 0.5)
        assertEquals(HapticShapes.hum(1.0), HapticShapes.hum(3.0), 1e-9)
    }

    @Test
    fun amplitudeKeepsOffOffAndLowAudible() {
        assertEquals(0, HapticShapes.amplitude(0.0))
        assertEquals(0, HapticShapes.amplitude(0.02))
        assertEquals(12, HapticShapes.amplitude(0.04))
        assertEquals(255, HapticShapes.amplitude(2.0))
    }

    private fun assertEquals(expected: Int, actual: Int, delta: Int) =
        assertTrue("expected $expected ± $delta, was $actual", kotlin.math.abs(expected - actual) <= delta)
}
