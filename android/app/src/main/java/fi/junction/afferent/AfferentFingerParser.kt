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
    /**
     * HRV: RMSSD in milliseconds, 1..254. null also when the board sent 255, which means
     * "above 254 ms" (one byte cannot carry it) and is not a reading of 255 ms.
     */
    val rmssd: Int?,
    /**
     * fused rhythm quality 0..1. null when the payload has no quality byte (4-byte v1 firmware)
     * or the board says "not available" (255). Unknown is never reported as a number.
     */
    val quality: Double?,
    /** "idle" | "probing" | "active". null for a v1 payload or code 0 (unknown). */
    val presence: String?,
    /**
     * true: the board says the two clips are on two different people (Heart Duel), so the fused
     * pulse, HRV and breathing are not one person's. null for a v1/v2 payload (unknown).
     */
    val twoHearts: Boolean?,
    /** number of bytes received: 4 = v1 firmware, 6 = v2, 7 = v3 */
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
    /** AFF1 byte 3: 255 = RMSSD above 254 ms, a marker and not a value */
    const val RMSSD_OVER_RANGE = 255
    /** AFF1 byte 6, bit 0: two people on the clips (uno-q/modulino-hub/ble.py FLAG_TWO_HEARTS) */
    const val FLAG_TWO_HEARTS = 0x01

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
     * AFF1: [finger 1 bpm, finger 2 bpm, breaths/min, RMSSD ms, quality %, presence code, flags].
     * Bytes 0..3: 0 = no reading. Byte 3 (RMSSD): 255 = above 254 ms -> null, never "255 ms".
     * Byte 4: 0..100, 255 (or anything above 100) = not available.
     * Byte 5: 1 idle, 2 probing, 3 active, anything else = unknown.
     * Byte 6 (v3): bit 0 = two people on the clips; without the byte nobody knows -> null.
     * null below 2 bytes; a byte that was not sent gives a null field.
     */
    fun aff1(data: ByteArray?): FingerAff1? {
        if (data == null || data.size < 2) return null
        fun reading(i: Int): Int? = if (i < data.size && u8(data[i]) > 0) u8(data[i]) else null
        val rmssd = reading(3)?.takeIf { it != RMSSD_OVER_RANGE }
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
        val twoHearts = if (data.size >= 7) u8(data[6]) and FLAG_TWO_HEARTS != 0 else null
        return FingerAff1(reading(0), reading(1), reading(2), rmssd, quality, presence, twoHearts, data.size)
    }

    /**
     * True only for our own board: the advertised name or the device's name is exactly
     * "Afferent Finger". Any other heart-rate device (a stranger's chest strap or watch) is not
     * the patient's finger and must never be connected.
     */
    fun isAfferentFinger(advertisedName: String?, peripheralName: String?): Boolean =
        advertisedName == DEVICE_NAME || peripheralName == DEVICE_NAME

    // The board also advertises Wendy Net, from the same Bluetooth address: service
    // WENDY_NET_SERVICE, name "wendyos-uno-q". A Wendy Net peer that connects by address can land
    // on our "Afferent Finger" advertisement, and while that link lasts it is off the air: only
    // Wendy Net's is left. Connected through Wendy Net's advertisement, the phone still finds
    // our services (one GATT server for the whole board).

    /** Wendy Net's Bluetooth service (seen in the board's advertisement, 2026-11-14). */
    val WENDY_NET_SERVICE: UUID = UUID.fromString("7565e9eb-4c20-4b67-9272-d708b397b631")
    /** The name the board advertises with Wendy Net's service (WendyOS on an Arduino UNO Q). */
    const val WENDY_BOARD_NAME = "wendyos-uno-q"
    /** What the plugin scans for: Heart Rate and Wendy Net. */
    val SCAN_SERVICES: List<UUID> = listOf(HEART_RATE_SERVICE, WENDY_NET_SERVICE)

    /**
     * True for a device worth connecting to and checking for the AFF0 service (which is still
     * required before anything is trusted):
     *  - named exactly "Afferent Finger" (advertised or device name), or
     *  - advertising Wendy Net's service and named exactly "wendyos-uno-q".
     * Anything else, also another Wendy device or a heart-rate strap, is never connected.
     */
    fun mayBeAfferentBoard(advertisedName: String?, deviceName: String?, wendyNet: Boolean): Boolean =
        isAfferentFinger(advertisedName, deviceName) ||
            (wendyNet && (advertisedName == WENDY_BOARD_NAME || deviceName == WENDY_BOARD_NAME))

    private fun u8(b: Byte): Int = b.toInt() and 0xFF
}
