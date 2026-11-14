package fi.junction.afferent

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The full 2A37 parser and the device listing rule (HeartRateParser.kt), and the events of the AfferentWatch plugin.
 * The byte vectors are the same as in ios/App/FingerTests/Tests/WatchCoreTests/WatchCoreTests.swift.
 */
class HeartRateParserTest {
    private fun m(vararg bytes: Int) = HeartRateParser.measurement(ByteArray(bytes.size) { bytes[it].toByte() })

    @Test
    fun eightBitPulseOnly() {
        assertEquals(HeartRateMeasurement(72, null, null, emptyList()), m(0x00, 0x48))
    }

    @Test
    fun sixteenBitPulse() {
        assertEquals(300, m(0x01, 0x2C, 0x01)?.bpm)
        assertNull("16-bit flag without its second byte", m(0x01, 0x2C))
    }

    @Test
    fun zeroIsNoPulseButTheRestCounts() {
        assertEquals(HeartRateMeasurement(null, true, null, listOf(1000.0)), m(0x16, 0x00, 0x00, 0x04))
    }

    @Test
    fun contactBits() {
        assertNull("bit 2 clear: contact not reported", m(0x00, 60)?.contact)
        assertNull("bit 1 without bit 2 means nothing", m(0x02, 60)?.contact)
        assertEquals(false, m(0x04, 60)?.contact)
        assertEquals(true, m(0x06, 60)?.contact)
    }

    @Test
    fun energyAndIntervals() {
        // contact reported + detected, energy, RR. 64 bpm, 300 kJ, RR 1024/1024 s and 820/1024 s.
        assertEquals(HeartRateMeasurement(64, true, 300, listOf(1000.0, 800.8)), m(0x1E, 0x40, 0x2C, 0x01, 0x00, 0x04, 0x34, 0x03))
    }

    @Test
    fun sixteenBitPulseWithIntervals() {
        assertEquals(HeartRateMeasurement(61, null, null, listOf(1000.0, 984.4)), m(0x11, 0x3D, 0x00, 0x00, 0x04, 0xF0, 0x03))
    }

    @Test
    fun cutOffFields() {
        assertEquals("energy cut off: no energy and no intervals after it", HeartRateMeasurement(64, null, null, emptyList()), m(0x18, 0x40, 0x2C))
        assertEquals("half an interval at the end is dropped", HeartRateMeasurement(64, null, null, listOf(1000.0)), m(0x10, 0x40, 0x00, 0x04, 0x34))
        assertEquals("an interval of 0 is no interval", listOf(1000.0), m(0x10, 0x40, 0x00, 0x00, 0x00, 0x04)?.rrMs)
    }

    @Test
    fun tooShort() {
        assertNull(m(0x00))
        assertNull(m())
        assertNull(HeartRateParser.measurement(null))
    }

    @Test
    fun listingRule() {
        assertEquals("Forerunner 265", HeartRateParser.listedName("Forerunner 265", null))
        assertEquals("Polar H10 1A2B3C4D", HeartRateParser.listedName(null, " Polar H10 1A2B3C4D "))
        assertNull("the finger box is not a watch", HeartRateParser.listedName("Afferent Finger", null))
        assertNull(HeartRateParser.listedName(null, "Afferent Finger"))
        assertNull(HeartRateParser.listedName("wendyos-uno-q", "Afferent Finger"))
        assertNull("either name is enough to leave it out", HeartRateParser.listedName("TICKR", "wendyos-uno-q"))
        assertNull("no name: not offered", HeartRateParser.listedName("  ", null))
        assertNull(HeartRateParser.listedName(null, null))
    }

    @Test
    fun onlyTheChosenDevice() {
        assertTrue(HeartRateParser.isChosen("AA:BB:CC:DD:EE:01", "aa:bb:cc:dd:ee:01"))
        assertFalse(HeartRateParser.isChosen("AA:BB:CC:DD:EE:02", "AA:BB:CC:DD:EE:01"))
        assertFalse("nothing chosen: nothing is connected", HeartRateParser.isChosen("AA:BB:CC:DD:EE:01", null))
    }

    @Test
    fun eventsUseNullNotZero() {
        val r = JSONObject(AfferentWatchEvents.reading(HeartRateMeasurement(null, null, null, emptyList()), 5).toString())
        for (k in listOf("bpm", "contact", "energy_kj")) assertTrue("$k is null, never left out", r.has(k) && r.isNull(k))
        assertEquals(0, r.getJSONArray("rr_ms").length())
        assertEquals("hr", r.getString("kind"))
        val full = JSONObject(AfferentWatchEvents.reading(HeartRateMeasurement(64, true, 300, listOf(1000.0, 800.8)), 7).toString())
        assertEquals(800.8, full.getJSONArray("rr_ms").getDouble(1), 1e-9)
        assertEquals(true, full.getBoolean("contact"))
        assertTrue(JSONObject(AfferentWatchEvents.device("A", "x", 127).toString()).isNull("rssi"))
        assertEquals(-61, JSONObject(AfferentWatchEvents.device("A", "x", -61).toString()).getInt("rssi"))
        val st = JSONObject(AfferentWatchEvents.state("idle", null, null, true).toString())
        assertTrue(st.isNull("name") && st.isNull("id") && st.getBoolean("scanning"))
    }
}
