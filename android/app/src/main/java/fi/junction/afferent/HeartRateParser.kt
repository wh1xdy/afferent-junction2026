package fi.junction.afferent

// The standard Bluetooth Heart Rate Measurement (0x2A37) of a watch or chest strap, parsed in full, and which
// heart-rate devices may be offered to the patient. The Kotlin twin of ios/App/App/HeartRateParser.swift. Plain
// Kotlin, no Android classes: HeartRateParserTest runs it on the build machine (./gradlew testDebugUnitTest).
//
// 2A37: byte 0 = flags, then the fields the flags announce, in this order:
//   bit 0   heart rate is UINT16 (else UINT8)
//   bit 1   skin contact detected            } only meaningful with bit 2
//   bit 2   skin contact is reported
//   bit 3   energy expended, UINT16 kJ
//   bit 4   one or more RR intervals, UINT16 each, in 1/1024 s, oldest first
// All multi-byte values are little endian.

/** One 2A37 notification. null / empty = the device did not send that field. */
data class HeartRateMeasurement(
    /** beats per minute; null when the device sent 0 (no reading) */
    val bpm: Int?,
    /** true: skin contact; false: no skin contact; null: the device does not report contact */
    val contact: Boolean?,
    /** energy expended in kJ since the device's last reset */
    val energyKJ: Int?,
    /** beat-to-beat intervals in milliseconds (converted from 1/1024 s, one decimal), oldest first */
    val rrMs: List<Double>,
)

object HeartRateParser {
    val HEART_RATE_SERVICE = AfferentFingerParser.HEART_RATE_SERVICE
    val HEART_RATE_MEASUREMENT = AfferentFingerParser.HEART_RATE_MEASUREMENT

    /**
     * The Afferent finger box advertises the Heart Rate Service too (AfferentFingerParser): it is never offered as a
     * watch, under either of its names.
     */
    val BOX_NAMES = setOf(AfferentFingerParser.DEVICE_NAME, AfferentFingerParser.WENDY_BOARD_NAME)

    /**
     * null below 2 bytes, or when a 16-bit heart rate is cut off. A field cut off after the heart rate is left out
     * (null energy, no further intervals); the heart rate and contact still count.
     */
    fun measurement(data: ByteArray?): HeartRateMeasurement? {
        if (data == null || data.size < 2) return null
        val flags = u8(data[0])
        fun u16(i: Int) = u8(data[i]) or (u8(data[i + 1]) shl 8)
        var i: Int
        val bpm: Int
        if (flags and 0x01 != 0) {
            if (data.size < 3) return null
            bpm = u16(1)
            i = 3
        } else {
            bpm = u8(data[1])
            i = 2
        }
        val contact = if (flags and 0x04 != 0) flags and 0x02 != 0 else null
        var energy: Int? = null
        val rr = ArrayList<Double>()
        var complete = true
        if (flags and 0x08 != 0) {
            if (i + 1 < data.size) {
                energy = u16(i)
                i += 2
            } else {
                complete = false
            }
        }
        if (complete && flags and 0x10 != 0) {
            while (i + 1 < data.size) {
                val raw = u16(i)
                i += 2
                if (raw > 0) rr.add(Math.round(raw * 1000.0 / 1024.0 * 10) / 10.0)
            }
        }
        return HeartRateMeasurement(if (bpm > 0) bpm else null, contact, energy, rr)
    }

    /**
     * The name to offer a heart-rate device under, or null when it is not offered: no name (it could not be told
     * apart from a neighbour's), or the Afferent finger box under either name.
     */
    fun listedName(advertisedName: String?, deviceName: String?): String? {
        if (listOf(advertisedName, deviceName).any { it != null && it.trim() in BOX_NAMES }) return null
        val name = (advertisedName ?: deviceName)?.trim() ?: ""
        return name.ifEmpty { null }
    }

    /** Whether a device is the one the patient chose. Nothing else is ever connected. */
    fun isChosen(address: String, chosen: String?): Boolean = chosen != null && address.equals(chosen, ignoreCase = true)

    private fun u8(b: Byte): Int = b.toInt() and 0xFF
}
