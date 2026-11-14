package fi.junction.afferent

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.security.MessageDigest

// The parts of the Android AfferentPresence plugin that need no Android API, so they are
// unit-tested on the build machine (AfferentPresenceCoreTest). Everything here reproduces what
// ios/App/App/AfferentPresence.swift hands to demo/js/presence.js: same field names, same
// spelling of UUIDs, manufacturer data and status words. No decisions are made here either;
// the logic is demo/js/presence-core.js.

/** One Bluetooth LE advert, read from the raw bytes of an Android ScanRecord. */
internal object PresenceAdvert {
    /**
     * @property name local name from the advert or its scan response, if any
     * @property mfg manufacturer data as lower-case hex: 2-byte little-endian company id, then
     *   the payload. Exactly what CoreBluetooth returns and `manufacturerFromHex` in
     *   presence-core.js expects.
     * @property uuids advertised service UUIDs and the UUIDs of service data, spelled like
     *   CBUUID.uuidString: "180D" (16 bit), "0000AFF0" (32 bit) or the full upper-case form.
     */
    class Parsed(val name: String?, val mfg: String?, val uuids: List<String>)

    private const val HEX = "0123456789abcdef"

    /**
     * Walks the advertising data structures: [length][type][data ...], repeated. Android puts
     * the scan response right after the advert in the same array and pads with zeros. A
     * structure that runs past the end is dropped together with everything after it.
     */
    fun parse(record: ByteArray?): Parsed {
        val b = record ?: return Parsed(null, null, emptyList())
        var complete: String? = null
        var shortened: String? = null
        var mfg: String? = null
        val uuids = LinkedHashSet<String>()
        var i = 0
        while (i < b.size) {
            val len = b[i].toInt() and 0xFF
            if (len == 0) break
            val end = i + 1 + len
            if (end > b.size) break
            val from = i + 2
            when (b[i + 1].toInt() and 0xFF) {
                0x02, 0x03 -> uuidList(b, from, end, 2, uuids)      // 16-bit service UUIDs
                0x04, 0x05 -> uuidList(b, from, end, 4, uuids)      // 32-bit
                0x06, 0x07 -> uuidList(b, from, end, 16, uuids)     // 128-bit
                0x16 -> uuidAt(b, from, end, 2)?.let(uuids::add)    // service data: its UUID
                0x20 -> uuidAt(b, from, end, 4)?.let(uuids::add)
                0x21 -> uuidAt(b, from, end, 16)?.let(uuids::add)
                0x08 -> shortened = text(b, from, end) ?: shortened
                0x09 -> complete = text(b, from, end) ?: complete
                // The first one wins: CoreBluetooth reports a single manufacturer field.
                0xFF -> if (mfg == null && end - from >= 2) mfg = hex(b, from, end)
            }
            i = end
        }
        return Parsed(complete ?: shortened, mfg, uuids.toList())
    }

    private fun uuidList(b: ByteArray, from: Int, end: Int, width: Int, out: MutableSet<String>) {
        var p = from
        while (p + width <= end) {
            uuidAt(b, p, end, width)?.let(out::add)
            p += width
        }
    }

    /** UUIDs are little-endian on the air; the text form is big-endian and upper-case. */
    private fun uuidAt(b: ByteArray, from: Int, end: Int, width: Int): String? {
        if (from + width > end) return null
        val s = StringBuilder(36)
        for (k in width - 1 downTo 0) {
            val v = b[from + k].toInt() and 0xFF
            s.append(HEX[v shr 4].uppercaseChar()).append(HEX[v and 15].uppercaseChar())
            if (width == 16 && (k == 12 || k == 10 || k == 8 || k == 6)) s.append('-')
        }
        return s.toString()
    }

    private fun text(b: ByteArray, from: Int, end: Int): String? =
        if (end > from) String(b, from, end - from, Charsets.UTF_8) else null

    private fun hex(b: ByteArray, from: Int, end: Int): String {
        val s = StringBuilder((end - from) * 2)
        for (k in from until end) {
            val v = b[k].toInt() and 0xFF
            s.append(HEX[v shr 4]).append(HEX[v and 15])
        }
        return s.toString()
    }
}

/**
 * Every advert heard between two `drain` calls, batched per device: first and last time and
 * the last RSSI values in order (the Swift plugin's `heard` dictionary).
 */
internal class PresenceBook(private val maxDevices: Int = 3000, private val rssiKept: Int = 20) {
    class Heard(val id: String, val first: Double) {
        var last = first
        val rssi = ArrayDeque<Int>()
        var name: String? = null
        var mfg: String? = null
        val uuids = LinkedHashSet<String>()

        /** `name` and `mfg` are left out when unknown, as on iOS (never null, never empty). */
        fun toJson(): JSObject {
            val d = JSObject()
            d.put("id", id.lowercase())
            d.put("first", first)
            d.put("last", last)
            d.put("rssi", JSArray().also { a -> rssi.forEach { a.put(it) } })
            d.put("uuids", JSArray().also { a -> uuids.forEach { a.put(it) } })
            name?.let { d.put("name", it) }
            mfg?.let { d.put("mfg", it) }
            return d
        }
    }

    class Drained(val devices: List<Heard>, val dropped: Int) {
        fun toJson(status: JSObject): JSObject {
            val out = JSObject()
            out.put("devices", JSArray().also { a -> devices.forEach { a.put(it.toJson()) } })
            out.put("dropped", dropped)
            out.put("status", status)
            return out
        }
    }

    private val heard = LinkedHashMap<String, Heard>()
    private var dropped = 0

    /**
     * @param id the sender's Bluetooth address (rotates for phones, like the identifier on iOS)
     * @param rssi dBm; 0 and above means "not available" (127) and the advert is ignored
     * @param now Unix time in seconds
     */
    @Synchronized
    fun observe(id: String, rssi: Int, now: Double, ad: PresenceAdvert.Parsed) {
        if (rssi >= 0) return
        var h = heard[id]
        if (h == null) {
            if (heard.size >= maxDevices) {
                dropped++
                return
            }
            h = Heard(id, now)
            heard[id] = h
        }
        h.last = now
        h.rssi.addLast(rssi)
        while (h.rssi.size > rssiKept) h.rssi.removeFirst()
        ad.name?.let { h.name = it }
        ad.mfg?.let { h.mfg = it }
        h.uuids.addAll(ad.uuids)
    }

    @Synchronized
    fun drain(): Drained {
        val out = Drained(heard.values.toList(), dropped)
        heard.clear()
        dropped = 0
        return out
    }

    @Synchronized
    fun clear() {
        heard.clear()
        dropped = 0
    }
}

/** The `status` object of start(), drain() and the "state" event: the same keys as on iOS. */
internal class PresenceStatus(
    val bluetooth: String,
    val authorization: String,
    val scanning: Boolean,
    val foreground: Boolean,
    val wifi: Boolean,
    val lan: String,
    val lanDevices: Collection<String>,
    val t: Double,
) {
    fun toJson(): JSObject {
        val s = JSObject()
        s.put("bluetooth", bluetooth)
        s.put("authorization", authorization)
        s.put("scanning", scanning)
        s.put("foreground", foreground)
        s.put("wifi", wifi)
        s.put("lan", lan)
        s.put("lanDevices", JSArray().also { a -> lanDevices.forEach { a.put(it) } })
        s.put("t", t)
        return s
    }
}

/** Permission and state rules, kept free of Android classes. */
internal object PresenceRules {
    const val SCAN = "android.permission.BLUETOOTH_SCAN"
    const val FINE = "android.permission.ACCESS_FINE_LOCATION"
    const val COARSE = "android.permission.ACCESS_COARSE_LOCATION"

    // BluetoothAdapter.STATE_*
    private const val STATE_OFF = 10
    private const val STATE_TURNING_ON = 11
    private const val STATE_ON = 12
    private const val STATE_TURNING_OFF = 13

    /**
     * @property mustHave permissions without which a scan returns nothing
     * @property ask what to request in one dialog round (Android 12+ ignores a request for
     *   fine location that does not also ask for coarse)
     * @property needsLocationOn the system Location switch must be on for scan results
     */
    class Plan(val mustHave: List<String>, val ask: List<String>, val needsLocationOn: Boolean)

    /**
     * What an unfiltered Bluetooth LE scan needs on this Android version.
     *
     * Android 12+ (API 31): BLUETOOTH_SCAN. If the manifest declares it with
     * usesPermissionFlags="neverForLocation" that is all (Android then withholds iBeacon and
     * Eddystone adverts); without the flag, fine location and the Location switch as well.
     * Android 7 to 11: fine location and the Location switch.
     */
    fun scanPlan(sdk: Int, neverForLocation: Boolean): Plan = when {
        sdk >= 31 && neverForLocation -> Plan(listOf(SCAN), listOf(SCAN), false)
        sdk >= 31 -> Plan(listOf(SCAN, FINE), listOf(SCAN, COARSE, FINE), true)
        else -> Plan(listOf(FINE), listOf(FINE), true)
    }

    /**
     * CBManagerAuthorization words. "restricted" (iOS: the user cannot change it in the app's
     * settings) stands for the two Android cases with the same meaning: a permission missing
     * from the manifest, and the system Location switch being off when scans depend on it.
     */
    fun authorization(granted: Boolean, declared: Boolean, refused: Boolean, locationOff: Boolean): String = when {
        granted && !locationOff -> "allowedAlways"
        granted || !declared -> "restricted"
        refused -> "denied"
        else -> "notDetermined"
    }

    /** CBManagerState words; "off" = the plugin is not started (no CBCentralManager on iOS). */
    fun bluetooth(wanted: Boolean, hasAdapter: Boolean, authorization: String, adapterState: Int): String = when {
        !wanted -> "off"
        !hasAdapter -> "unsupported"
        authorization == "notDetermined" -> "unknown"
        authorization != "allowedAlways" -> "unauthorized"
        adapterState == STATE_ON -> "poweredOn"
        adapterState == STATE_OFF -> "poweredOff"
        adapterState == STATE_TURNING_ON || adapterState == STATE_TURNING_OFF -> "resetting"
        else -> "unknown"
    }
}

/**
 * A scan that Android refused or throttled looks like a running one: no error, no adverts. So
 * a scan counts as working only while it hears something. After `limitMs` without any advert
 * the plugin reports scanning = false, which presence.js reads as "could not look" and not as
 * "the bedside unit is gone", and starts the scan again.
 */
internal class ScanSilence(private val limitMs: Long = 60_000) {
    private var since = -1L

    /** A scan started. Starting it again because of the silence does not reset the silence. */
    fun started(nowMs: Long) {
        if (since < 0) since = nowMs
    }

    fun heard(nowMs: Long) {
        since = nowMs
    }

    /** The scan was stopped for another reason: app in the background, stop(), Bluetooth off. */
    fun ended() {
        since = -1
    }

    fun silent(nowMs: Long): Boolean = since >= 0 && nowMs - since >= limitMs
}

/** Home Wi-Fi: which stay-at-home devices answer Bonjour, as hashes. */
internal object PresenceLan {
    /** The list of the Swift plugin (and of NSBonjourServices in Info.plist), same order. */
    val homeServiceTypes = listOf(
        "_airplay._tcp", "_raop._tcp", "_googlecast._tcp", "_spotify-connect._tcp", "_sonos._tcp",
        "_hap._tcp", "_hap._udp", "_homekit._tcp", "_matter._tcp", "_meshcop._udp", "_hue._tcp",
        "_ipp._tcp", "_ipps._tcp", "_printer._tcp", "_pdl-datastream._tcp", "_uscan._tcp",
        "_amzn-wplay._tcp", "_androidtvremote2._tcp",
    )

    /** NsdManager refuses the 11th concurrent discovery of one client (FAILURE_MAX_LIMIT). */
    const val BATCH = 9

    /**
     * Same key as AfferentPresencePlugin.deviceKey in Swift (the test holds values computed
     * with that function): the plain lower-cased name, for _raop the part after "@", hashed
     * with a fixed prefix; 8 bytes as hex. The patient's device names never leave this function.
     */
    fun deviceKey(type: String, name: String): String {
        var n = name
        if (type.startsWith("_raop")) {
            val at = n.indexOf('@')
            if (at >= 0) n = n.substring(at + 1)
        }
        // Swift's CharacterSet.whitespaces: tab and Unicode space separators, not line breaks.
        val plain = n.trim { it == '\t' || Character.getType(it) == Character.SPACE_SEPARATOR.toInt() }.lowercase()
        val digest = MessageDigest.getInstance("SHA-256").digest(("afferent-home:$plain").toByteArray(Charsets.UTF_8))
        return digest.take(8).joinToString("") { "%02x".format(it.toInt() and 0xFF) }
    }
}

/**
 * Bookkeeping for browsing more service types than NsdManager allows at once: the types are
 * browsed in batches, one batch per time window, round and round.
 *
 * A device counts as visible while it answered in the open window or in one of the last two
 * finished windows of its type, so one lost multicast answer does not make the home Wi-Fi
 * look gone. `state` uses the words of the Swift plugin's `lan` field; it is "starting" until
 * every type has had one window, because before that "not seen" would only mean "not asked".
 */
internal class LanRounds(
    types: List<String> = PresenceLan.homeServiceTypes,
    batchSize: Int = PresenceLan.BATCH,
) {
    val batches: List<List<String>> = types.chunked(batchSize)

    var browsing = false
        private set
    private var round = 0
    private var finished = 0
    private val health = HashMap<String, String>()
    private val live = HashMap<String, MutableSet<String>>()
    private val settled = HashMap<String, Set<String>>()
    private val before = HashMap<String, Set<String>>()

    /** Starts browsing; returns the types of the first window. */
    fun begin(): List<String> {
        end()
        browsing = true
        return open()
    }

    /** Closes the open window and opens the next; returns the types to browse now. */
    fun next(): List<String> {
        if (!browsing) return emptyList()
        for ((type, keys) in live) {
            before[type] = settled[type] ?: emptySet()
            settled[type] = keys
        }
        finished++
        round = (round + 1) % batches.size
        return open()
    }

    fun end() {
        browsing = false
        round = 0
        finished = 0
        health.clear()
        live.clear()
        settled.clear()
        before.clear()
    }

    private fun open(): List<String> {
        live.clear()
        val types = batches.getOrElse(round) { emptyList() }
        types.forEach { live[it] = HashSet() }
        return types
    }

    fun started(type: String) {
        if (type in live) health[type] = "ready"
    }

    fun failed(type: String, denied: Boolean = false) {
        if (type in live) health[type] = if (denied) "denied" else "failed"
    }

    fun found(type: String, name: String) {
        live[type]?.add(PresenceLan.deviceKey(type, name))
    }

    fun lost(type: String, name: String) {
        live[type]?.remove(PresenceLan.deviceKey(type, name))
    }

    /** "off" | "starting" | "ready" | "denied" | "failed", as on iOS. */
    val state: String
        get() = when {
            !browsing -> "off"
            health.containsValue("denied") -> "denied"
            finished < batches.size -> "starting"
            health.containsValue("ready") -> "ready"
            else -> "failed"
        }

    fun devices(): Set<String> {
        val out = LinkedHashSet<String>()
        before.values.forEach(out::addAll)
        settled.values.forEach(out::addAll)
        live.values.forEach(out::addAll)
        return out
    }
}
