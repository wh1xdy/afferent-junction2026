package fi.junction.afferent

import java.util.UUID

// Byte formats of the UNO Q finger sensor ("Afferent Finger", uno-q/SENSORS.md).
// The Kotlin twin of ios/App/App/AfferentFingerParser.swift. Plain Kotlin, no Android classes:
// AfferentFingerParserTest runs it on the build machine (./gradlew testDebugUnitTest).

/** One AFF1 notification. null = the board reported no value for that field. */
data class FingerAff1(
    /** finger 1 / finger 2 pulse, beats per minute */
    val finger1: Int?,
    val finger2: Int?,
    /** breaths per minute, from the heart-rate rhythm */
    val breathing: Int?,
    /** HRV: RMSSD in milliseconds */
    val rmssd: Int?,
    /**
     * fused rhythm quality 0..1. null when the payload has no quality byte (4-byte v1 firmware)
     * or the board says "not available" (255). Unknown is never reported as a number.
     */
    val quality: Double?,
    /** "idle" | "probing" | "active". null for a v1 payload or code 0 (unknown). */
    val presence: String?,
    /** number of bytes received: 4 = v1 firmware, 6 = v2 */
    val length: Int,
)

object AfferentFingerParser {
    /** The only peripheral this app reads a finger pulse from. */
    const val DEVICE_NAME = "Afferent Finger"

    val HEART_RATE_SERVICE: UUID = uuid16(0x180D)
    val HEART_RATE_MEASUREMENT: UUID = uuid16(0x2A37)
    val AFFERENT_SERVICE: UUID = uuid16(0xAFF0)
    val FINGER_VALUES: UUID = uuid16(0xAFF1)
    /** Client Characteristic Configuration: the descriptor that switches notifications on */
    val CLIENT_CONFIG: UUID = uuid16(0x2902)

    /** A 16-bit Bluetooth UUID in its full form, 0000xxxx-0000-1000-8000-00805f9b34fb. */
    fun uuid16(short: Int): UUID =
        UUID((short.toLong() and 0xFFFF) shl 32 or 0x1000L, -0x7FFFFF7FA064CB05L)

    /** Heart Rate Measurement (0x2A37): flags bit 0 = 16-bit value. 0 = no reading -> null. */
    fun heartRate(data: ByteArray?): Int? {
        if (data == null || data.size < 2) return null
        val value = if (data[0].toInt() and 0x01 == 0) {
            u8(data[1])
        } else {
            if (data.size >= 3) u8(data[1]) or (u8(data[2]) shl 8) else return null
        }
        return if (value > 0) value else null
    }

    /**
     * AFF1: [finger 1 bpm, finger 2 bpm, breaths/min, RMSSD ms, quality %, presence code].
     * Bytes 0..3: 0 = no reading. Byte 4: 0..100, 255 (or anything above 100) = not available.
     * Byte 5: 1 idle, 2 probing, 3 active, anything else = unknown.
     * null below 2 bytes; a byte that was not sent gives a null field.
     */
    fun aff1(data: ByteArray?): FingerAff1? {
        if (data == null || data.size < 2) return null
        fun reading(i: Int): Int? = if (i < data.size && u8(data[i]) > 0) u8(data[i]) else null
        val quality = if (data.size >= 5 && u8(data[4]) <= 100) u8(data[4]) / 100.0 else null
        val presence = if (data.size >= 6) {
            when (u8(data[5])) {
                1 -> "idle"
                2 -> "probing"
                3 -> "active"
                else -> null
            }
        } else {
            null
        }
        return FingerAff1(reading(0), reading(1), reading(2), reading(3), quality, presence, data.size)
    }

    /**
     * True only for our own board: the advertised name or the device's name is exactly
     * "Afferent Finger". Any other heart-rate device (a stranger's chest strap or watch) is not
     * the patient's finger and must never be connected.
     */
    fun isAfferentFinger(advertisedName: String?, peripheralName: String?): Boolean =
        advertisedName == DEVICE_NAME || peripheralName == DEVICE_NAME

    private fun u8(b: Byte): Int = b.toInt() and 0xFF
}
