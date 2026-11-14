package fi.junction.afferent

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * The same cases as ios/App/FingerTests (AfferentFingerParserTests.swift), one test per iOS
 * test with the same name. Byte formats: uno-q/SENSORS.md. The golden payloads are the same as
 * in uno-q/modulino-hub/tests/test_ble_payload.py, so all three ends are tested against one
 * contract. Runs on the build machine: ./gradlew testDebugUnitTest
 */
class AfferentFingerParserTest {
    private fun data(vararg bytes: Int): ByteArray = ByteArray(bytes.size) { bytes[it].toByte() }

    // ── 2A37 Heart Rate Measurement ──────────────────────────────────────

    @Test
    fun heartRate8Bit() {
        assertEquals(72, AfferentFingerParser.heartRate(data(0x00, 0x48)))
    }

    @Test
    fun heartRate16BitFlag() {
        assertEquals(300, AfferentFingerParser.heartRate(data(0x01, 0x2C, 0x01)))
    }

    @Test
    fun heartRateZeroIsNoReading() {
        assertNull(AfferentFingerParser.heartRate(data(0x00, 0x00)))
        assertNull(AfferentFingerParser.heartRate(data(0x01, 0x00, 0x00)))
    }

    @Test
    fun heartRateTooShort() {
        assertNull(AfferentFingerParser.heartRate(data(0x00)))
        assertNull(AfferentFingerParser.heartRate(data()))
        assertNull(AfferentFingerParser.heartRate(null))
        assertNull("16-bit flag without the second byte", AfferentFingerParser.heartRate(data(0x01, 0x2C)))
    }

    @Test
    fun heartRateIgnoresOtherFlagBits() {
        // 0x16: contact bits + RR intervals present, value still 8-bit
        assertEquals(72, AfferentFingerParser.heartRate(data(0x16, 0x48, 0x20, 0x03)))
    }

    @Test
    fun heartRateOnASlice() {
        // iOS: a Data slice that does not start at index 0. Here: a copied range.
        val slice = data(0xAA, 0xBB, 0x00, 0x48).copyOfRange(2, 4)
        assertEquals(72, AfferentFingerParser.heartRate(slice))
    }

    @Test
    fun heartRateAbove127IsNotNegative() {
        // Android only: a Kotlin Byte is signed
        assertEquals(200, AfferentFingerParser.heartRate(data(0x00, 0xC8)))
        assertEquals(0xFFFF, AfferentFingerParser.heartRate(data(0x01, 0xFF, 0xFF)))
    }

    // ── AFF1 ─────────────────────────────────────────────────────────────

    @Test
    fun aff1V1FourBytes() {
        assertEquals(
            FingerAff1(finger1 = 71, finger2 = 73, breathing = 6, rmssd = 46, quality = null, presence = null, twoHearts = null, length = 4),
            AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E))
        )
    }

    @Test
    fun aff1V2SixBytes() {
        // the golden v2 payload: 47 49 06 2E 3E 03
        val r = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03))!!
        assertEquals(71, r.finger1)
        assertEquals(73, r.finger2)
        assertEquals(6, r.breathing)
        assertEquals(46, r.rmssd)
        assertEquals(0.62, r.quality!!, 1e-9)
        assertEquals("active", r.presence)
        assertNull("a v2 board does not say whether two people wear the clips", r.twoHearts)
        assertEquals(6, r.length)
    }

    @Test
    fun aff1V3SevenBytesTwoHearts() {
        assertEquals(
            FingerAff1(finger1 = 64, finger2 = 92, breathing = null, rmssd = null, quality = 0.41, presence = "active", twoHearts = true, length = 7),
            AfferentFingerParser.aff1(data(0x40, 0x5C, 0x00, 0x00, 0x29, 0x03, 0x01))
        )
        val one = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03, 0x00))!!
        assertEquals(false, one.twoHearts)
        assertEquals("active", one.presence)
    }

    @Test
    fun aff1TwoHeartsIsBitZeroOnly() {
        // other bits are reserved: they never set the flag
        assertEquals(false, AfferentFingerParser.aff1(data(0, 0, 0, 0, 255, 1, 0xFE))!!.twoHearts)
        assertEquals(true, AfferentFingerParser.aff1(data(0, 0, 0, 0, 255, 1, 0x03))!!.twoHearts)
    }

    @Test
    fun aff1RmssdAboveTheByteIsNoReading() {
        // ble.py RMSSD_OVER: 255 = above 254 ms. It must never reach the app as a measured 255 ms.
        assertEquals(255, AfferentFingerParser.RMSSD_OVER_RANGE)
        val over = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0xFF, 0x3E, 0x03))
        assertNotNull(over)
        assertNull(over!!.rmssd)
        assertEquals("the other fields are untouched", 71, over.finger1)
        assertEquals(6, over.breathing)
        assertEquals(254, AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0xFE, 0x3E, 0x03))!!.rmssd)
        assertNull("also in a 4-byte payload", AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0xFF))!!.rmssd)
        assertSame(JSONObject.NULL, AfferentFingerEvents.aff1(over, 1).get("rmssd_ms"))
    }

    @Test
    fun aff1QualityNotAvailable() {
        val r = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0xFF, 0x03))
        assertNotNull(r)
        assertNull(r!!.quality)
        assertEquals("active", r.presence)
    }

    @Test
    fun aff1QualityAboveHundredIsNotANumber() {
        // outside the contract (0..100, 255): never report a quality above 1
        assertNull(AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x65, 0x03))!!.quality)
        assertEquals(1.0, AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x64, 0x03))!!.quality!!, 0.0)
    }

    @Test
    fun aff1QualityZeroIsZeroNotMissing() {
        assertEquals(0.0, AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x00, 0x03))!!.quality!!, 0.0)
    }

    @Test
    fun aff1QualityJustBelowTheLimit() {
        // A7: below 0.3 is unreliable; 29 % must compare as below
        val q = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x1D, 0x03))!!.quality ?: 1.0
        assertTrue(q < 0.3)
    }

    @Test
    fun aff1PresenceCodes() {
        fun presence(code: Int): String? =
            AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x3E, code))!!.presence
        assertNull("code 0 = unknown", presence(0))
        assertEquals("idle", presence(1))
        assertEquals("probing", presence(2))
        assertEquals("active", presence(3))
        assertNull(presence(4))
        assertNull(presence(255))
    }

    @Test
    fun aff1IdleNoReadings() {
        assertEquals(
            FingerAff1(finger1 = null, finger2 = null, breathing = null, rmssd = null, quality = null, presence = "idle", twoHearts = null, length = 6),
            AfferentFingerParser.aff1(data(0x00, 0x00, 0x00, 0x00, 0xFF, 0x01))
        )
    }

    @Test
    fun aff1TwoBytesFingersOnly() {
        assertEquals(
            FingerAff1(finger1 = 71, finger2 = 73, breathing = null, rmssd = null, quality = null, presence = null, twoHearts = null, length = 2),
            AfferentFingerParser.aff1(data(0x47, 0x49))
        )
    }

    @Test
    fun aff1FiveBytesHasQualityButNoPresence() {
        val r = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x3E))!!
        assertEquals(0.62, r.quality!!, 1e-9)
        assertNull(r.presence)
        assertEquals(5, r.length)
    }

    @Test
    fun aff1TooShort() {
        assertNull(AfferentFingerParser.aff1(data(0x47)))
        assertNull(AfferentFingerParser.aff1(data()))
        assertNull(AfferentFingerParser.aff1(null))
    }

    @Test
    fun aff1LongerPayloadKeepsTheKnownFields() {
        // a later firmware may append bytes
        val r = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03, 0x99))!!
        assertEquals(71, r.finger1)
        assertEquals("active", r.presence)
        assertEquals(7, r.length)
        val longer = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03, 0x00, 0x99))!!
        assertEquals(false, longer.twoHearts)
        assertEquals(8, longer.length)
    }

    @Test
    fun aff1OnASlice() {
        val slice = data(0xAA, 0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03).copyOfRange(1, 7)
        assertEquals(71, AfferentFingerParser.aff1(slice)!!.finger1)
        assertEquals("active", AfferentFingerParser.aff1(slice)!!.presence)
    }

    @Test
    fun aff1ValuesAbove127AreNotNegative() {
        // Android only: a Kotlin Byte is signed
        // RMSSD 0xFE: 0xFF there is the "above 254 ms" marker (aff1RmssdAboveTheByteIsNoReading)
        val r = AfferentFingerParser.aff1(data(0xC8, 0xFF, 0x80, 0xFE, 0x64, 0x03))!!
        assertEquals(listOf(200, 255, 128, 254), listOf(r.finger1, r.finger2, r.breathing, r.rmssd))
        assertEquals(1.0, r.quality!!, 0.0)
    }

    // ── Device name ──────────────────────────────────────────────────────

    @Test
    fun nameMatchingAcceptsOnlyAfferentFinger() {
        assertEquals("Afferent Finger", AfferentFingerParser.DEVICE_NAME)
        assertTrue(AfferentFingerParser.isAfferentFinger("Afferent Finger", null))
        assertTrue(AfferentFingerParser.isAfferentFinger(null, "Afferent Finger"))
        assertTrue(AfferentFingerParser.isAfferentFinger("Afferent Finger", "uno-q"))
        assertFalse(AfferentFingerParser.isAfferentFinger(null, null))
        assertFalse(AfferentFingerParser.isAfferentFinger("Polar H10 8A3B2C1D", "Polar H10"))
        assertFalse(AfferentFingerParser.isAfferentFinger("afferent finger", null))
        assertFalse(AfferentFingerParser.isAfferentFinger("Afferent Finger 2", null))
        assertFalse(AfferentFingerParser.isAfferentFinger(" Afferent Finger", null))
        assertFalse(AfferentFingerParser.isAfferentFinger("", ""))
    }

    // ── Bluetooth identifiers (Android only: iOS takes the short form) ────

    @Test
    fun uuidsAreTheOnesTheBoardUses() {
        // uno-q/modulino-hub/ble.py: HRS, HRM, AFF_SVC, AFF_BOTH
        assertEquals(UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb"), AfferentFingerParser.HEART_RATE_SERVICE)
        assertEquals(UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb"), AfferentFingerParser.HEART_RATE_MEASUREMENT)
        assertEquals(UUID.fromString("0000aff0-0000-1000-8000-00805f9b34fb"), AfferentFingerParser.AFFERENT_SERVICE)
        assertEquals(UUID.fromString("0000aff1-0000-1000-8000-00805f9b34fb"), AfferentFingerParser.FINGER_VALUES)
        assertEquals(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"), AfferentFingerParser.CLIENT_CONFIG)
    }

    // ── Results and events sent to the web layer ─────────────────────────

    /** JSON with sorted keys, as JSONSerialization .sortedKeys gives in the iOS tests. */
    private fun json(value: Any?): String = when (value) {
        is JSONObject -> value.keys().asSequence().sorted()
            .joinToString(",", "{", "}") { "\"$it\":${json(value.get(it))}" }
        is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { json(value.get(it)) }
        is String -> "\"$value\""
        JSONObject.NULL -> "null"
        null -> throw AssertionError("a Kotlin null inside an event: the key would be dropped")
        else -> value.toString()
    }

    @Test
    fun hrmEvent() {
        assertEquals("""{"bpm":72,"kind":"hrm","t_ms":1000}""", json(AfferentFingerEvents.hrm(72, 1_000)))
    }

    @Test
    fun aff1EventV2() {
        val r = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x32, 0x03))!!
        val e = AfferentFingerEvents.aff1(r, 1_000)
        assertEquals(
            setOf("kind", "finger_bpm", "breathing_per_min", "rmssd_ms", "quality", "presence", "two_hearts", "payload_len", "t_ms"),
            e.keys().asSequence().toSet()
        )
        assertEquals(
            """{"breathing_per_min":6,"finger_bpm":[71,73],"kind":"aff1","payload_len":6,""" +
                """"presence":"active","quality":0.5,"rmssd_ms":46,"t_ms":1000,"two_hearts":null}""",
            json(e)
        )
    }

    @Test
    fun aff1EventV3TwoHearts() {
        val r = AfferentFingerParser.aff1(data(0x40, 0x5C, 0x00, 0x00, 0x32, 0x03, 0x01))!!
        assertEquals(
            """{"breathing_per_min":null,"finger_bpm":[64,92],"kind":"aff1","payload_len":7,""" +
                """"presence":"active","quality":0.5,"rmssd_ms":null,"t_ms":1000,"two_hearts":true}""",
            json(AfferentFingerEvents.aff1(r, 1_000))
        )
    }

    @Test
    fun aff1EventUsesNullForMissingValues() {
        // v1 firmware, finger 2 without a reading: unknown stays null, never 0 or a default
        val r = AfferentFingerParser.aff1(data(0x47, 0x00, 0x00, 0x00))!!
        val e = AfferentFingerEvents.aff1(r, 1_000)
        assertEquals(
            """{"breathing_per_min":null,"finger_bpm":[71,null],"kind":"aff1","payload_len":4,""" +
                """"presence":null,"quality":null,"rmssd_ms":null,"t_ms":1000,"two_hearts":null}""",
            json(e)
        )
        assertSame(JSONObject.NULL, e.get("quality"))
        assertSame(JSONObject.NULL, e.get("presence"))
        assertSame(JSONObject.NULL, e.get("two_hearts"))
    }

    @Test
    fun aff1EventOfTheGoldenPayload() {
        val r = AfferentFingerParser.aff1(data(0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03))!!
        assertEquals(
            """{"breathing_per_min":6,"finger_bpm":[71,73],"kind":"aff1","payload_len":6,""" +
                """"presence":"active","quality":0.62,"rmssd_ms":46,"t_ms":1700000000123,"two_hearts":null}""",
            json(AfferentFingerEvents.aff1(r, 1_700_000_000_123))
        )
    }

    @Test
    fun stateEventAndResults() {
        // start() -> {state}; status() and the "state" event -> {state, name}, name null when unknown
        assertEquals("""{"state":"scanning"}""", json(AfferentFingerEvents.startResult("scanning")))
        assertEquals("""{"name":null,"state":"scanning"}""", json(AfferentFingerEvents.state("scanning", null)))
        assertEquals(
            """{"name":"Afferent Finger","state":"connected"}""",
            json(AfferentFingerEvents.state("connected", "Afferent Finger"))
        )
        // what a listener's JavaScript receives is the text of the object
        val wire = JSONObject(AfferentFingerEvents.state("off", null).toString())
        assertTrue(wire.has("name"))
        assertTrue(wire.isNull("name"))
    }
}
