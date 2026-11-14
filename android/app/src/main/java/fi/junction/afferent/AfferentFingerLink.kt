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
 * Rules this class keeps (the same as the iOS plugin):
 *  - It connects only to a device named exactly "Afferent Finger" that also has the AFF0
 *    service. A stranger's heart-rate strap must never be shown as the patient's finger.
 *  - It only subscribes to notifications and never asks the peripheral for a stored value, so
 *    every reading is a value the board sent just now. (A stored value can be minutes old and
 *    would be stamped as fresh.)
 *  - It reports what the board sent. Staleness, the quality limit and what a value may be used
 *    for are decided by the web layer.
 *
 * Where it differs from iOS, because Android does not do these things for an app:
 *  - In the background (background()) it lets go of the scan and the connection. iOS suspends
 *    an app without a Bluetooth background mode; Android would keep scanning with the screen
 *    off and hold the board's only connection.
 *  - A scan that finds nothing is started again every 20 minutes (SCAN_REFRESH_MS).
 *  - Scan starts are counted against the app's budget (ScanBudget).
 *
 * Not thread safe: call everything on one thread.
 *
 * @param scanBudget the plugin passes ScanBudget.app, which it shares with the presence plugin
 */
class AfferentFingerLink(
    private val radio: FingerRadio,
    private val timer: FingerTimer,
    private val listener: FingerLinkListener,
    private val scanBudget: ScanBudget = ScanBudget(),
) {
    companion object {
        /** A connection attempt (connect + service discovery) is given up after this long. */
        const val CONNECT_TIMEOUT_MS = 10_000L
        /** Android answers a notification request with a callback; if it never comes, start over. */
        const val SUBSCRIBE_TIMEOUT_MS = 5_000L
        /** A device whose setup fails this many times in a row is left alone for REST_MS. */
        const val MAX_FAILURES = 3
        /**
         * Not for good: Android counts more kinds of failure than iOS (an unanswered request
         * at the edge of range is one), and the patient has no way to clear a lockout.
         */
        const val REST_MS = 60_000L
        /**
         * Android turns a scan that has run for 30 minutes into one that hears little or
         * nothing, so a scan that is still looking is replaced before that.
         */
        const val SCAN_REFRESH_MS = 20 * 60_000L
        /**
         * How long the link is kept after the app left the foreground, so a permission dialog
         * or a short look at another app does not end a running session. Well below the ten
         * seconds or so after which Android may freeze a background app, timers included.
         */
        const val BACKGROUND_GRACE_MS = 5_000L
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
    /** Changes when the app comes back to the foreground: cancels a pending pause(). */
    private var backgroundTurn = 0
    /** The right name but no AFF0 service: not our board. Left alone until stop(). */
    private val ignored = HashSet<String>()
    /** Setting up the connection failed MAX_FAILURES times in a row: left alone until this time. */
    private val restUntil = HashMap<String, Long>()
    private val setupFailures = HashMap<String, Int>()
    /** Lost or failed connections since the last reading: sets the wait before the next scan. */
    private var dropsInARow = 0
    private val toSubscribe = ArrayDeque<Pair<UUID, UUID>>()
    private var subscribing = false

    // ── called by the plugin ─────────────────────────────────────────────

    /**
     * Keep looking for the sensor from now on. Calling it again while it runs changes nothing,
     * except that it counts as "the app is in the foreground (again)".
     */
    fun start(availability: FingerAvailability) {
        backgroundTurn++
        running = true
        availabilityChanged(availability)
    }

    /**
     * The app left the foreground (another app, the home screen, the screen switched off).
     * Unless start() is called within BACKGROUND_GRACE_MS, the scan and the connection are
     * released and the state becomes "off"; the next start() looks for the board again.
     */
    fun background() {
        if (!running) return
        val mine = ++backgroundTurn
        timer.after(BACKGROUND_GRACE_MS) { if (mine == backgroundTurn && running) pause() }
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
        backgroundTurn++
        running = false
        release()
        ignored.clear()
        restUntil.clear()
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

    /** Like stop(), but what is known about the devices nearby is kept for the next start(). */
    private fun pause() {
        running = false
        release()
        dropsInARow = 0
        set("off", null)
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
        val wait = scanBudget.take(timer.nowMs())
        if (wait > 0) {
            later(wait) { scan() }
            return
        }
        if (!radio.startScan()) {
            lookAgainLater()
            return
        }
        scanning = true
        later(SCAN_REFRESH_MS) { scan() }            // cancelled by whatever happens before
    }

    /** Connects when the device is our board. Returns true if it was taken. */
    private fun consider(address: String, advertisedName: String?, deviceName: String?): Boolean {
        if (!running || device != null || state != "scanning" || address in ignored ||
            !AfferentFingerParser.isAfferentFinger(advertisedName, deviceName) || resting(address)
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

    private fun resting(address: String): Boolean {
        val until = restUntil[address] ?: return false
        if (timer.nowMs() < until) return true
        restUntil.remove(address)
        return false
    }

    /**
     * Give up on the current device and look again. ignore = it is not our board: never again
     * in this session. Otherwise a device that keeps failing is left alone for a while, so a
     * broken link cannot turn into an endless connect / fail loop, and then gets new attempts.
     */
    private fun drop(ignore: Boolean) {
        val address = device ?: return
        if (ignore) {
            ignored.add(address)
        } else {
            val failures = (setupFailures[address] ?: 0) + 1
            if (failures < MAX_FAILURES) {
                setupFailures[address] = failures
            } else {
                setupFailures.remove(address)
                restUntil[address] = timer.nowMs() + REST_MS
            }
        }
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
