package fi.junction.afferent

import java.util.UUID

// The connection logic of the finger sensor, without any Android class: which device may be
// connected, in which order things happen, when to give up and look again. The Android calls
// are behind FingerRadio (implemented in AfferentFingerPlugin.kt), so AfferentFingerLinkTest
// can run the whole sequence on the build machine with a fake radio and a fake clock.
//
// It follows ios/App/App/AfferentFinger.swift step by step and reports the same states.

/** What the phone's Bluetooth can do for this app right now. */
enum class FingerAvailability {
    /** no Bluetooth LE hardware                      -> state "unsupported" */
    UNSUPPORTED,
    /** the person has not allowed Bluetooth (yet)    -> state "unauthorized" */
    UNAUTHORIZED,
    /** Bluetooth is switched off                     -> state "off" */
    OFF,
    /** usable                                        -> scanning / connecting / connected */
    ON,
}

/** A device the phone already holds a Bluetooth LE connection to. */
data class FingerDevice(val address: String, val name: String?)

enum class FingerSubscribe {
    /** the request is on its way; FingerLink.onSubscribed follows */
    STARTED,
    /** the peripheral has no such characteristic (or it cannot notify): skip it */
    ABSENT,
    /** the request could not be made */
    FAILED,
}

/**
 * The Bluetooth operations the link needs. One connection at a time; every method is called
 * on the same thread as the FingerLink methods.
 */
interface FingerRadio {
    /** Devices connected to this phone, possibly through another app (they do not advertise). */
    fun connectedDevices(): List<FingerDevice>

    /** Start looking for peripherals that advertise the Heart Rate Service. */
    fun startScan(): Boolean
    fun stopScan()

    /** Start connecting; FingerLink.onConnected or onDisconnected follows. */
    fun connect(address: String): Boolean

    /** Disconnect and release the current connection, if there is one. */
    fun disconnect()

    /** FingerLink.onServicesDiscovered follows. */
    fun discoverServices(): Boolean
    fun hasService(service: UUID): Boolean

    /** Switch notifications on for one characteristic. Only one request may be under way. */
    fun subscribe(service: UUID, characteristic: UUID): FingerSubscribe
}

interface FingerTimer {
    /** A clock that only moves forward, in milliseconds. */
    fun nowMs(): Long
    fun after(delayMs: Long, task: () -> Unit)
}

interface FingerLinkListener {
    fun state(state: String, name: String?)
    fun hrm(bpm: Int, tMs: Long)
    fun aff1(reading: FingerAff1, tMs: Long)
}

/** How long to wait before looking again after the n-th failure in a row. */
object FingerRetry {
    private val delaysMs = longArrayOf(0, 1_000, 2_000, 4_000, 8_000)
    const val MAX_DELAY_MS = 15_000L

    fun delayMs(failuresInARow: Int): Long = when {
        failuresInARow <= 0 -> 0
        failuresInARow <= delaysMs.size -> delaysMs[failuresInARow - 1]
        else -> MAX_DELAY_MS
    }
}

/**
 * Android stops delivering scan results to an app that starts more than 5 scans within
 * 30 seconds, without an error on older versions. This keeps the app one below that limit.
 */
class ScanStartLimiter(private val maxStarts: Int = 4, private val windowMs: Long = 30_000) {
    private val starts = ArrayDeque<Long>()

    /** 0 = a scan may start now, otherwise how long to wait first. */
    fun waitMs(nowMs: Long): Long {
        while (starts.isNotEmpty() && nowMs - starts.first() >= windowMs) starts.removeFirst()
        return if (starts.size < maxStarts) 0 else starts.first() + windowMs - nowMs
    }

    fun started(nowMs: Long) {
        starts.addLast(nowMs)
    }
}

/**
 * Rules this class keeps (the same as the iOS plugin):
 *  - It connects only to a device named exactly "Afferent Finger" that also has the AFF0
 *    service. A stranger's heart-rate strap must never be shown as the patient's finger.
 *  - It only subscribes to notifications and never asks the peripheral for a stored value, so
 *    every reading is a value the board sent just now. (A stored value can be minutes old and
 *    would be stamped as fresh.)
 *  - It reports what the board sent. Staleness, the quality limit and what a value may be used
 *    for are decided by the web layer.
 *
 * Not thread safe: call everything on one thread.
 */
class AfferentFingerLink(
    private val radio: FingerRadio,
    private val timer: FingerTimer,
    private val listener: FingerLinkListener,
) {
    companion object {
        /** A connection attempt (connect + service discovery) is given up after this long. */
        const val CONNECT_TIMEOUT_MS = 10_000L
        /** Android answers a notification request with a callback; if it never comes, start over. */
        const val SUBSCRIBE_TIMEOUT_MS = 5_000L
        /** A device that fails this many times in a row is left alone until stop(). */
        const val MAX_FAILURES = 3
    }

    /** 'off' | 'unauthorized' | 'unsupported' | 'scanning' | 'connecting' | 'connected' */
    var state: String = "off"
        private set

    /** "Afferent Finger" while connecting or connected, otherwise null */
    var name: String? = null
        private set

    private var running = false
    private var scanning = false
    private var device: String? = null
    /** Changes whenever the situation changes; a delayed task only runs if it still matches. */
    private var attempt = 0
    /**
     * Devices this session will not connect to again: the right name but no AFF0 service (not
     * our board), or setting up the connection failed three times in a row. Cleared by stop().
     */
    private val ignored = HashSet<String>()
    private val setupFailures = HashMap<String, Int>()
    /** Lost or failed connections since the last reading: sets the wait before the next scan. */
    private var dropsInARow = 0
    private val scanStarts = ScanStartLimiter()
    private val toSubscribe = ArrayDeque<Pair<UUID, UUID>>()
    private var subscribing = false

    // ── called by the plugin ─────────────────────────────────────────────

    /** Keep looking for the sensor from now on. Calling it again while it runs changes nothing. */
    fun start(availability: FingerAvailability) {
        running = true
        availabilityChanged(availability)
    }

    /** Bluetooth was switched on or off, or the permission changed. */
    fun availabilityChanged(availability: FingerAvailability) {
        if (!running) return
        when (availability) {
            FingerAvailability.ON ->
                if (state != "scanning" && state != "connecting" && state != "connected") {
                    dropsInARow = 0
                    scan()
                }
            FingerAvailability.UNAUTHORIZED -> lost("unauthorized")
            FingerAvailability.UNSUPPORTED -> lost("unsupported")
            FingerAvailability.OFF -> lost("off")
        }
    }

    /** Disconnect and release Bluetooth. */
    fun stop() {
        running = false
        release()
        ignored.clear()
        setupFailures.clear()
        dropsInARow = 0
        set("off", null)
    }

    // ── called by the radio ──────────────────────────────────────────────

    /** A peripheral that advertises the Heart Rate Service was seen. */
    fun onScanResult(address: String, advertisedName: String?, deviceName: String?) {
        if (scanning) consider(address, advertisedName, deviceName)
    }

    /** The scan could not start or was stopped by the system. */
    fun onScanFailed() {
        if (!scanning) return
        scanning = false
        lookAgainLater()
    }

    fun onConnected(address: String) {
        if (address != device || state != "connecting") return
        // still "connecting": it counts as connected once the AFF0 service is confirmed
        if (!radio.discoverServices()) drop(ignore = false)
    }

    /** The connection was lost, or the attempt to connect failed. */
    fun onDisconnected(address: String) {
        if (address != device) return
        lookAgainLater()
    }

    fun onServicesDiscovered(ok: Boolean) {
        if (device == null || state != "connecting") return
        if (!ok) {
            drop(ignore = false)                     // discovery failed: try again
            return
        }
        if (!radio.hasService(AfferentFingerParser.AFFERENT_SERVICE)) {
            drop(ignore = true)                      // right name, not our board
            return
        }
        attempt++                                    // connected: the timeout no longer applies
        set("connected", AfferentFingerParser.DEVICE_NAME)
        toSubscribe.clear()
        toSubscribe.addLast(AfferentFingerParser.HEART_RATE_SERVICE to AfferentFingerParser.HEART_RATE_MEASUREMENT)
        toSubscribe.addLast(AfferentFingerParser.AFFERENT_SERVICE to AfferentFingerParser.FINGER_VALUES)
        subscribeNext()
    }

    /** The answer to FingerRadio.subscribe. */
    fun onSubscribed(ok: Boolean) {
        if (!subscribing || state != "connected") return
        subscribing = false
        attempt++                                    // the answer came: no timeout
        if (ok) subscribeNext() else drop(ignore = false)
    }

    /** A notification. tMs = wall clock (ms since 1970) when it arrived on the phone. */
    fun onValue(characteristic: UUID, value: ByteArray?, tMs: Long) {
        if (state != "connected") return
        if (characteristic == AfferentFingerParser.FINGER_VALUES) {
            val reading = AfferentFingerParser.aff1(value) ?: return
            dropsInARow = 0
            listener.aff1(reading, tMs)
        } else if (characteristic == AfferentFingerParser.HEART_RATE_MEASUREMENT) {
            val bpm = AfferentFingerParser.heartRate(value) ?: return
            dropsInARow = 0
            listener.hrm(bpm, tMs)
        }
    }

    // ── inside ───────────────────────────────────────────────────────────

    private fun set(newState: String, newName: String?) {
        if (newState == state && newName == name) return
        state = newState
        name = newName
        listener.state(newState, newName)
    }

    /** Let go of the scan, the connection and every pending timer. */
    private fun release() {
        attempt++
        if (scanning) {
            scanning = false
            radio.stopScan()
        }
        if (device != null) {
            device = null
            radio.disconnect()
        }
        toSubscribe.clear()
        subscribing = false
    }

    /** Bluetooth is not usable: any connection is invalid now. */
    private fun lost(newState: String) {
        release()
        set(newState, null)
    }

    private fun scan() {
        release()
        set("scanning", null)
        // The board may already be connected to this phone through another app; such a
        // peripheral does not advertise, so a scan alone would miss it.
        for (d in radio.connectedDevices()) {
            if (consider(d.address, null, d.name)) return
        }
        val now = timer.nowMs()
        val wait = scanStarts.waitMs(now)
        if (wait > 0) {
            later(wait) { scan() }
            return
        }
        scanStarts.started(now)
        if (radio.startScan()) scanning = true else lookAgainLater()
    }

    /** Connects when the device is our board. Returns true if it was taken. */
    private fun consider(address: String, advertisedName: String?, deviceName: String?): Boolean {
        if (!running || device != null || state != "scanning" || address in ignored ||
            !AfferentFingerParser.isAfferentFinger(advertisedName, deviceName)
        ) return false
        release()
        device = address
        set("connecting", AfferentFingerParser.DEVICE_NAME)
        if (!radio.connect(address)) {
            lookAgainLater()
            return true
        }
        later(CONNECT_TIMEOUT_MS) {
            if (state == "connecting") lookAgainLater()          // out of range or gone
        }
        return true
    }

    /**
     * Give up on the current device and look again. A device that keeps failing is ignored, so
     * a broken link cannot turn into an endless connect / fail loop.
     */
    private fun drop(ignore: Boolean) {
        val address = device ?: return
        val failures = (setupFailures[address] ?: 0) + 1
        setupFailures[address] = failures
        if (ignore || failures >= MAX_FAILURES) ignored.add(address)
        lookAgainLater()
    }

    /** Back to "scanning"; the scan itself starts after a pause that grows with every failure. */
    private fun lookAgainLater() {
        release()
        set("scanning", null)
        dropsInARow++
        val delay = FingerRetry.delayMs(dropsInARow)
        if (delay == 0L) scan() else later(delay) { scan() }
    }

    private fun subscribeNext() {
        while (true) {
            val next = toSubscribe.removeFirstOrNull()
            if (next == null) {
                device?.let { setupFailures.remove(it) }         // everything is set up
                return
            }
            when (radio.subscribe(next.first, next.second)) {
                FingerSubscribe.ABSENT -> continue
                FingerSubscribe.FAILED -> {
                    drop(ignore = false)
                    return
                }
                FingerSubscribe.STARTED -> {
                    subscribing = true
                    later(SUBSCRIBE_TIMEOUT_MS) { if (subscribing) drop(ignore = false) }
                    return
                }
            }
        }
    }

    /** Runs the task after the delay unless anything else has happened in between. */
    private fun later(delayMs: Long, task: () -> Unit) {
        val mine = ++attempt
        timer.after(delayMs) { if (mine == attempt && running) task() }
    }
}
