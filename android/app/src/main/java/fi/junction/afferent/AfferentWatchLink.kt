package fi.junction.afferent

import java.util.UUID

// The connection logic of a watch or chest strap (Bluetooth Heart Rate Service), without any Android class: when to
// scan, which device may be connected, when to give up and look again. The Android calls are behind WatchRadio
// (implemented in AfferentWatchPlugin.kt), so AfferentWatchLinkTest runs the whole sequence with a fake radio and a
// fake clock. It reports the same states as ios/App/App/AfferentWatch.swift.

/**
 * The Bluetooth operations the link needs. One connection at a time; every method is called on the same thread as the
 * link's methods.
 */
interface WatchRadio {
    /** Devices connected to this phone, possibly through another app (they do not advertise). */
    fun connectedDevices(): List<FingerDevice>

    /** Start looking for devices that advertise the Heart Rate Service. */
    fun startScan(): Boolean
    fun stopScan()

    /** Start connecting to a device seen in the scan; onConnected or onDisconnected follows. */
    fun connect(address: String): Boolean

    /** Disconnect and release the current connection, if there is one. */
    fun disconnect()

    /** onServicesDiscovered follows. */
    fun discoverServices(): Boolean
    fun hasService(service: UUID): Boolean

    /** Switch notifications on for one characteristic; onSubscribed follows when STARTED. */
    fun subscribe(service: UUID, characteristic: UUID): FingerSubscribe
}

interface WatchLinkListener {
    fun state(state: String, name: String?, id: String?, scanning: Boolean)
    fun device(id: String, name: String, rssi: Int?)
    fun reading(measurement: HeartRateMeasurement, tMs: Long)
}

/**
 * Rules this class keeps (the same as the iOS plugin):
 *  - It connects only to the device the patient chose (connect). A scan for the list connects to nothing; the
 *    Afferent finger box, which also advertises 180D, is never listed.
 *  - It only subscribes to notifications and never reads the stored value: every reading was sent just now.
 *  - It reports what the device sent. Freshness, quality, RMSSD and what a value may be used for are decided by the
 *    web layer (demo/js/hrv.js, sensors.js).
 *  - While the chosen device is not connected it looks for it with a scan and connects when it shows up: the
 *    reconnect. After a failure it waits longer each time (FingerRetry), so a broken device cannot loop.
 *
 * Where it differs from iOS, because Android does not do these things for an app (as AfferentFingerLink):
 *  - In the background it lets go of the scan and the connection after BACKGROUND_GRACE_MS; back in the
 *    foreground it looks again.
 *  - A scan that finds nothing is started again every 20 minutes, and scan starts come out of the app's ScanBudget.
 *
 * States: 'off' (nothing wanted, Bluetooth off, or in the background) | 'unauthorized' | 'unsupported' | 'idle'
 * (Bluetooth on, nothing chosen: only a list) | 'connecting' (looking for the chosen device) | 'connected'.
 * Not thread safe: call everything on one thread.
 */
class AfferentWatchLink(
    private val radio: WatchRadio,
    private val timer: FingerTimer,
    private val listener: WatchLinkListener,
    private val scanBudget: ScanBudget = ScanBudget(),
) {
    companion object {
        /** A list scan ends by itself after this long. */
        const val LIST_MS = 30_000L
        /** A connection attempt (connect + service discovery) is given up after this long. */
        const val CONNECT_TIMEOUT_MS = 15_000L
        const val SUBSCRIBE_TIMEOUT_MS = 5_000L
        const val SCAN_REFRESH_MS = 20 * 60_000L
        const val BACKGROUND_GRACE_MS = 5_000L
    }

    var state: String = "off"
        private set
    /** The address of the device the patient chose, or null. */
    var target: String? = null
        private set
    var targetName: String? = null
        private set
    var scanning: Boolean = false
        private set

    private var availability = FingerAvailability.OFF
    private var paused = false
    private var listing = false
    /** The address being connected or connected, or null. */
    private var device: String? = null
    private var subscribing = false
    /** Changes with every step of a connection: a delayed connection task runs only if it still matches. */
    private var attempt = 0
    private var scanTurn = 0
    private var listTurn = 0
    private var backgroundTurn = 0
    private var dropsInARow = 0

    // ── called by the plugin ─────────────────────────────────────────────

    /** List heart-rate devices nearby for LIST_MS (listener.device). Connects to none of them. */
    fun scan(availability: FingerAvailability) {
        listing = true
        val mine = ++listTurn
        timer.after(LIST_MS) {
            if (mine == listTurn) {
                listing = false
                updateScan()
                releaseIfIdle()
            }
        }
        availabilityChanged(availability)
        listConnected()
    }

    fun stopScan() {
        listing = false
        listTurn++
        updateScan()
        releaseIfIdle()
    }

    /** Connect to the chosen device and keep reconnecting until disconnect(). */
    fun connect(address: String, name: String?, availability: FingerAvailability) {
        if (target?.equals(address, ignoreCase = true) != true) dropDevice()
        target = address
        targetName = name
        dropsInARow = 0
        availabilityChanged(availability)
    }

    fun disconnect() {
        target = null
        targetName = null
        dropDevice()
        updateScan()
        releaseIfIdle()
    }

    /** Bluetooth was switched on or off, or the permission changed (also: back in the foreground). */
    fun availabilityChanged(availability: FingerAvailability) {
        this.availability = availability
        if (!wanted() || paused) return
        when (availability) {
            FingerAvailability.ON -> {
                if (state != "connected" && state != "connecting" || target == null) set(base())
                updateScan()
            }
            FingerAvailability.UNAUTHORIZED -> lost("unauthorized")
            FingerAvailability.UNSUPPORTED -> lost("unsupported")
            FingerAvailability.OFF -> lost("off")
        }
    }

    /** The app left the foreground: after a short grace the scan and the connection are released (the choice stays). */
    fun background() {
        val mine = ++backgroundTurn
        timer.after(BACKGROUND_GRACE_MS) { if (mine == backgroundTurn) pause() }
    }

    /** Back in the foreground. */
    fun foreground(availability: FingerAvailability) {
        backgroundTurn++
        paused = false
        availabilityChanged(availability)
    }

    // ── called by the radio ──────────────────────────────────────────────

    fun onScanResult(address: String, advertisedName: String?, deviceName: String?, rssi: Int?) {
        if (!scanning) return
        if (listing) HeartRateParser.listedName(advertisedName, deviceName)?.let { listener.device(address, it, rssi) }
        if (device == null && HeartRateParser.isChosen(address, target)) connectTo(address)
    }

    fun onScanFailed() {
        if (!scanning) return
        scanning = false
        notifyState()
        dropsInARow++
        val mine = ++scanTurn
        timer.after(FingerRetry.delayMs(dropsInARow).coerceAtLeast(1_000)) { if (mine == scanTurn) updateScan() }
    }

    fun onConnected(address: String) {
        if (!address.equals(device, ignoreCase = true) || state != "connecting") return
        if (!radio.discoverServices()) failed()
    }

    fun onDisconnected(address: String) {
        if (!address.equals(device, ignoreCase = true)) return
        failed()
    }

    fun onServicesDiscovered(ok: Boolean) {
        if (device == null || state != "connecting") return
        if (!ok || !radio.hasService(HeartRateParser.HEART_RATE_SERVICE)) {
            failed()
            return
        }
        when (radio.subscribe(HeartRateParser.HEART_RATE_SERVICE, HeartRateParser.HEART_RATE_MEASUREMENT)) {
            FingerSubscribe.STARTED -> {
                subscribing = true
                laterConnection(SUBSCRIBE_TIMEOUT_MS) { if (subscribing) failed() }
            }
            else -> failed()
        }
    }

    fun onSubscribed(ok: Boolean) {
        if (!subscribing || device == null) return
        subscribing = false
        attempt++                                    // the answer came: no timeout
        if (!ok) {
            failed()
            return
        }
        dropsInARow = 0
        set("connected")
    }

    /** A notification. tMs = wall clock (ms since 1970) when it arrived on the phone. */
    fun onValue(characteristic: UUID, value: ByteArray?, tMs: Long) {
        if (state != "connected" || characteristic != HeartRateParser.HEART_RATE_MEASUREMENT) return
        val m = HeartRateParser.measurement(value) ?: return
        listener.reading(m, tMs)
    }

    // ── inside ───────────────────────────────────────────────────────────

    private fun wanted() = listing || target != null

    private fun base() = if (target != null) "connecting" else "idle"

    private fun set(newState: String) {
        if (newState == state) return
        state = newState
        notifyState()
    }

    private fun notifyState() = listener.state(state, targetName, target, scanning)

    /** Scan while the patient wants the list, or while the chosen device is not connected. */
    private fun updateScan() {
        val want = !paused && availability == FingerAvailability.ON && (listing || (target != null && device == null))
        if (want && !scanning) {
            val mine = ++scanTurn
            val wait = scanBudget.take(timer.nowMs())
            if (wait > 0) {
                timer.after(wait) { if (mine == scanTurn) updateScan() }
                return
            }
            if (!radio.startScan()) {
                onScanFailedToStart(mine)
                return
            }
            scanning = true
            notifyState()
            timer.after(SCAN_REFRESH_MS) {           // Android quietens a long scan: start it again
                if (mine == scanTurn && scanning) {
                    radio.stopScan()
                    scanning = false
                    updateScan()
                }
            }
        } else if (!want && scanning) {
            scanTurn++
            radio.stopScan()
            scanning = false
            notifyState()
        }
    }

    private fun onScanFailedToStart(mine: Int) {
        dropsInARow++
        timer.after(FingerRetry.delayMs(dropsInARow).coerceAtLeast(1_000)) { if (mine == scanTurn) updateScan() }
    }

    private fun listConnected() {
        if (!listing || availability != FingerAvailability.ON) return
        for (d in radio.connectedDevices()) {
            HeartRateParser.listedName(null, d.name)?.let { listener.device(d.address, it, null) }
        }
    }

    private fun connectTo(address: String) {
        device = address
        updateScan()                                 // found: no scan needed for it any more
        set("connecting")
        if (!radio.connect(address)) {
            failed()
            return
        }
        laterConnection(CONNECT_TIMEOUT_MS) { if (state == "connecting" && device == address) failed() }
    }

    /** Let go of the connection and look again after a pause that grows with every failure in a row. */
    private fun failed() {
        dropDevice()
        dropsInARow++
        set(base())
        val delay = FingerRetry.delayMs(dropsInARow)
        if (delay == 0L) updateScan() else laterConnection(delay) { updateScan() }
    }

    private fun dropDevice() {
        attempt++
        subscribing = false
        if (device != null) {
            device = null
            radio.disconnect()
        }
    }

    private fun releaseIfIdle() {
        if (wanted()) return
        dropDevice()
        if (scanning) {
            scanTurn++
            radio.stopScan()
            scanning = false
        }
        set("off")
    }

    private fun lost(newState: String) {
        dropDevice()
        if (scanning) {
            scanTurn++
            radio.stopScan()
            scanning = false
        }
        set(newState)
    }

    /** Like releaseIfIdle, but the chosen device is kept for the next foreground(). */
    private fun pause() {
        paused = true
        listing = false
        listTurn++
        lost("off")
    }

    private fun laterConnection(delayMs: Long, task: () -> Unit) {
        val mine = ++attempt
        timer.after(delayMs) { if (mine == attempt) task() }
    }
}
