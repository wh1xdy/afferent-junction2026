package fi.junction.afferent

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Radios for Settings > Home and visitors: the Android twin of ios/App/App/AfferentPresence.swift.
 * Same JS interface, so demo/js/presence.js runs unchanged:
 *
 *   start({lan}) -> status      drain() -> {devices, status, dropped}      stop()      event "state"
 *
 * No decisions here (those are demo/js/presence-core.js). The plugin reports what Android lets
 * an app see, only between start() and stop() and only while the app is in the foreground:
 *   - Bluetooth LE adverts from an unfiltered scan, batched per device between two drain calls
 *   - whether the phone is on Wi-Fi
 *   - which stay-at-home devices (TV, speakers, printer, smart home) answer Bonjour on this
 *     Wi-Fi, as salted SHA-256 prefixes, never names
 *
 * Where Android differs from iOS:
 *   - `id` of a device is its Bluetooth address (iOS: a per-phone UUID). Both rotate for phones.
 *   - `mfg` carries Apple's Continuity bytes for every Apple device in range. iOS hides most of
 *     those from apps, so the phone classifier in presence-core.js sees more here.
 *   - Permissions are asked by start() (iOS asks when the Bluetooth manager is created), and
 *     start() answers after the dialog. `authorization: "restricted"` also covers "the system
 *     Location switch is off" on phones where scans depend on it (see PresenceRules).
 *   - NsdManager allows ten discoveries at a time, so the 18 service types are browsed in two
 *     alternating batches; `lan` stays "starting" for the first 20 s (see LanRounds).
 *   - The SSID is not read: the JS contract has no field for it, and it would need the location
 *     permission. Not possible on Android without root, as on iOS: the ARP table.
 *
 * Everything below runs on the main thread: plugin calls are posted to it, scan results and
 * lifecycle calls arrive on it, network and NSD callbacks are posted to it.
 */
@CapacitorPlugin(
    name = "AfferentPresence",
    permissions = [
        Permission(alias = AfferentPresencePlugin.ALIAS_SCAN, strings = [PresenceRules.SCAN]),
        Permission(alias = AfferentPresencePlugin.ALIAS_FINE, strings = [PresenceRules.FINE]),
        Permission(alias = AfferentPresencePlugin.ALIAS_COARSE, strings = [PresenceRules.COARSE]),
    ],
)
class AfferentPresencePlugin : Plugin() {
    companion object {
        private const val TAG = "AfferentPresence"
        const val ALIAS_SCAN = "bluetoothScan"
        const val ALIAS_FINE = "location"
        const val ALIAS_COARSE = "coarseLocation"

        /** Android turns a scan that has run for 30 minutes into one that hears nothing. */
        private const val SCAN_REFRESH_MS = 20 * 60 * 1000L
        private const val SCAN_RETRY_MS = 30_000L

        /** A scan that has heard nothing for this long does not count as scanning (ScanSilence). */
        private const val SCAN_SILENCE_MS = 60_000L

        /** One batch of Bonjour types is browsed this long; answers arrive within a second or two. */
        private const val LAN_WINDOW_MS = 10_000L
    }

    private val main = Handler(Looper.getMainLooper())
    private val book = PresenceBook()
    private val budget = ScanBudget.app   // shared with the finger plugin: the limit is per app
    private val silence = ScanSilence(SCAN_SILENCE_MS)
    private val lan = LanRounds()

    private var wanted = false
    private var wantLan = true
    private var foreground = false
    private var scanning = false
    private var asked = false

    private var radioReceiver: BroadcastReceiver? = null
    private var wifiCallback: ConnectivityManager.NetworkCallback? = null
    private var wifiWatchFailed = false
    private val wifiNetworks = HashSet<Network>()
    private var onWifi = false
    private val browsers = HashMap<String, Browser>()

    // ── JS API ────────────────────────────────────────────────────────────

    @PluginMethod
    fun start(call: PluginCall) {
        val lanWanted = call.getBoolean("lan", true) ?: true
        main.post {
            wanted = true
            wantLan = lanWanted
            watchRadios()
            val plan = plan()
            if (foreground && !granted(plan) && mayAsk(plan)) {
                // The dialog pauses the activity; permissionsAnswered resolves the call.
                asked = true
                requestPermissionForAliases(plan.ask.map(::alias).toTypedArray(), call, "permissionsAnswered")
                return@post
            }
            resume()
            call.resolve(status())
        }
    }

    @PermissionCallback
    private fun permissionsAnswered(call: PluginCall?) {
        // Posted, so it runs after the activity is resumed again and the scan has started.
        main.post {
            resume()
            val s = status()
            call?.resolve(s)
            notifyListeners("state", s)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        main.post {
            shutDown()
            call.resolve()
        }
    }

    @PluginMethod
    fun drain(call: PluginCall) {
        main.post {
            resume()
            call.resolve(book.drain().toJson(status()))
        }
    }

    // ── lifecycle: radios run only while JS asked for them and the app is in front ────

    override fun handleOnResume() {
        super.handleOnResume()
        foreground = true
        resume()
    }

    override fun handleOnPause() {
        super.handleOnPause()
        foreground = false
        pause()
    }

    override fun handleOnDestroy() {
        shutDown()
        super.handleOnDestroy()
    }

    private fun resume() {
        if (!wanted || !foreground) return
        // Bluetooth, a permission or the Location switch may have changed since the scan began.
        if (scanning && (adapterState(adapter()) != BluetoothAdapter.STATE_ON || !mayScan())) stopScan()
        startScan()
        if (wantLan && onWifi && !lan.browsing) startBrowsing()
    }

    private fun pause() {
        stopScan()
        stopBrowsing()
    }

    private fun shutDown() {
        wanted = false
        pause()
        unwatchRadios()
        book.clear()
    }

    private fun status(): JSObject {
        val plan = plan()
        val authorization = PresenceRules.authorization(
            granted = granted(plan),
            declared = declared(plan),
            refused = asked || refusedBefore(plan),
            locationOff = plan.needsLocationOn && !locationOn(),
        )
        val adapter = adapter()
        return PresenceStatus(
            bluetooth = PresenceRules.bluetooth(wanted, adapter != null, authorization, adapterState(adapter)),
            authorization = authorization,
            scanning = scanning && !silence.silent(SystemClock.elapsedRealtime()),
            foreground = foreground,
            wifi = onWifi,
            lan = if (wifiWatchFailed && wanted) "failed" else lan.state,
            lanDevices = lan.devices(),
            t = nowS(),
        ).toJson()
    }

    private fun nowS() = System.currentTimeMillis() / 1000.0

    // ── permissions ───────────────────────────────────────────────────────

    /** Permission name -> its flags, as declared in the merged AndroidManifest. */
    private val manifest: Map<String, Int> by lazy {
        try {
            val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
            val names = info.requestedPermissions ?: emptyArray()
            val flags = info.requestedPermissionsFlags ?: IntArray(0)
            names.indices.associate { names[it] to (flags.getOrNull(it) ?: 0) }
        } catch (e: PackageManager.NameNotFoundException) {
            emptyMap()
        }
    }

    private fun plan(): PresenceRules.Plan {
        val never = ((manifest[PresenceRules.SCAN] ?: 0) and PackageInfo.REQUESTED_PERMISSION_NEVER_FOR_LOCATION) != 0
        return PresenceRules.scanPlan(Build.VERSION.SDK_INT, never)
    }

    private fun granted(plan: PresenceRules.Plan) = plan.mustHave.all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun declared(plan: PresenceRules.Plan) = plan.ask.all { it in manifest }

    private fun alias(permission: String) = when (permission) {
        PresenceRules.SCAN -> ALIAS_SCAN
        PresenceRules.FINE -> ALIAS_FINE
        else -> ALIAS_COARSE
    }

    private fun capacitorState(permission: String): PermissionState? = getPermissionState(alias(permission))

    /** Refused once (Android may ask a second time) or for good. */
    private fun refusedBefore(plan: PresenceRules.Plan) = plan.mustHave.any {
        val s = capacitorState(it)
        s == PermissionState.DENIED || s == PermissionState.PROMPT_WITH_RATIONALE
    }

    /** Asking for something that is not in the manifest, or was refused for good, shows nothing. */
    private fun mayAsk(plan: PresenceRules.Plan) =
        declared(plan) && plan.mustHave.none { capacitorState(it) == PermissionState.DENIED }

    private fun locationOn(): Boolean {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
        return LocationManagerCompat.isLocationEnabled(lm)
    }

    // ── Bluetooth ─────────────────────────────────────────────────────────

    private fun adapter(): BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    @SuppressLint("MissingPermission")
    private fun adapterState(adapter: BluetoothAdapter?): Int = try {
        adapter?.state ?: -1
    } catch (e: SecurityException) {
        -1
    }

    private fun mayScan(): Boolean {
        val plan = plan()
        return granted(plan) && (!plan.needsLocationOn || locationOn())
    }

    private val scanSettings: ScanSettings by lazy {
        // Every advert, continuously, so RSSI can be smoothed: what iOS does in the foreground
        // with AllowDuplicates. Legacy adverts only (the default), which is what phones and the
        // bedside unit send.
        ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE)
            .setReportDelay(0)
            .build()
    }

    private val retryScan = Runnable { resume() }
    private val refreshScan = Runnable {
        if (scanning) {
            stopScan(keepSilence = true)
            resume()
        }
    }
    private val checkSilence: Runnable = object : Runnable {
        override fun run() {
            if (!scanning) return
            if (!silence.silent(SystemClock.elapsedRealtime())) {
                main.postDelayed(this, SCAN_SILENCE_MS)
                return
            }
            // No advert for a minute: Android may have refused or throttled the scan without
            // an error. It no longer counts as scanning (status) and is started again.
            Log.w(TAG, "the Bluetooth scan hears nothing, starting it again")
            stopScan(keepSilence = true)
            resume()
            notifyListeners("state", status())
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = heard(result)

        override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::heard)

        @SuppressLint("MissingPermission")
        override fun onScanFailed(errorCode: Int) {
            Log.w(TAG, "Bluetooth scan failed, code $errorCode")
            if (errorCode == SCAN_FAILED_ALREADY_STARTED) return
            scanning = false
            silence.ended()
            main.removeCallbacks(refreshScan)
            main.removeCallbacks(checkSilence)
            try {
                adapter()?.bluetoothLeScanner?.stopScan(this)
            } catch (e: RuntimeException) {
                // nothing to stop
            }
            main.removeCallbacks(retryScan)
            main.postDelayed(retryScan, SCAN_RETRY_MS)
            notifyListeners("state", status())
        }
    }

    private fun heard(result: ScanResult) {
        if (!scanning) return
        val address = result.device?.address ?: return
        silence.heard(SystemClock.elapsedRealtime())
        book.observe(address, result.rssi, nowS(), PresenceAdvert.parse(result.scanRecord?.bytes))
    }

    @SuppressLint("MissingPermission")
    private fun startScan() {
        if (scanning) return
        val adapter = adapter() ?: return
        if (adapterState(adapter) != BluetoothAdapter.STATE_ON || !mayScan()) return
        main.removeCallbacks(retryScan)
        val wait = budget.take(SystemClock.elapsedRealtime())
        if (wait > 0) {
            main.postDelayed(retryScan, wait)
            return
        }
        try {
            val scanner = adapter.bluetoothLeScanner ?: return
            // Unfiltered: Android pauses such a scan by itself when the screen turns off.
            scanner.startScan(null, scanSettings, scanCallback)
            scanning = true
            silence.started(SystemClock.elapsedRealtime())
            main.removeCallbacks(refreshScan)
            main.postDelayed(refreshScan, SCAN_REFRESH_MS)
            main.removeCallbacks(checkSilence)
            main.postDelayed(checkSilence, SCAN_SILENCE_MS)
        } catch (e: RuntimeException) {   // SecurityException, or Bluetooth went off just now
            Log.w(TAG, "Bluetooth scan did not start: $e")
        }
    }

    /** keepSilence: the scan is only being replaced, so how long it has heard nothing still counts. */
    @SuppressLint("MissingPermission")
    private fun stopScan(keepSilence: Boolean = false) {
        main.removeCallbacks(retryScan)
        main.removeCallbacks(refreshScan)
        main.removeCallbacks(checkSilence)
        if (!keepSilence) silence.ended()
        if (!scanning) return
        scanning = false
        try {
            adapter()?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (e: RuntimeException) {
            // Bluetooth is off: the scan is gone already
        }
    }

    // ── Bluetooth switch, Location switch, Wi-Fi ──────────────────────────

    private fun watchRadios() {
        if (radioReceiver == null) {
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context, intent: Intent) {
                    if (!wanted) return
                    if (intent.action == BluetoothAdapter.ACTION_STATE_CHANGED &&
                        intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1) != BluetoothAdapter.STATE_ON
                    ) {
                        // The system dropped the scan together with Bluetooth.
                        scanning = false
                        silence.ended()
                        main.removeCallbacks(refreshScan)
                        main.removeCallbacks(checkSilence)
                    }
                    resume()
                    notifyListeners("state", status())
                }
            }
            val filter = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
            filter.addAction(LocationManager.MODE_CHANGED_ACTION)
            try {
                // Both are broadcasts only the system can send.
                ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
                radioReceiver = receiver
            } catch (e: RuntimeException) {
                // Without it a switch is noticed at the next drain(), which calls resume().
                Log.w(TAG, "cannot watch the Bluetooth and Location switches: $e")
            }
        }
        if (wifiCallback == null) {
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = wifiSeen(this, network, true)
                override fun onLost(network: Network) = wifiSeen(this, network, false)
            }
            try {
                val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                val wifi = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
                cm.registerNetworkCallback(wifi, callback)
                wifiCallback = callback
                wifiWatchFailed = false
            } catch (e: RuntimeException) {
                // Unknown is not "not on Wi-Fi": status reports lan "failed", which JS reads as
                // "could not look".
                Log.w(TAG, "cannot watch Wi-Fi: $e")
                wifiWatchFailed = true
            }
        }
    }

    private fun unwatchRadios() {
        radioReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (e: RuntimeException) {
                // not registered
            }
        }
        radioReceiver = null
        wifiCallback?.let {
            try {
                (context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it)
            } catch (e: RuntimeException) {
                // not registered
            }
        }
        wifiCallback = null
        wifiWatchFailed = false
        wifiNetworks.clear()
        onWifi = false
    }

    /** Called on a ConnectivityManager thread. */
    private fun wifiSeen(from: ConnectivityManager.NetworkCallback, network: Network, up: Boolean) {
        main.post {
            if (wifiCallback !== from) return@post
            if (up) wifiNetworks.add(network) else wifiNetworks.remove(network)
            val wifi = wifiNetworks.isNotEmpty()
            if (wifi == onWifi) return@post
            onWifi = wifi
            stopBrowsing()   // another network: what answered before says nothing about this one
            resume()
        }
    }

    // ── home Wi-Fi (Bonjour through NsdManager) ───────────────────────────

    /** One discovery of one service type. Its callbacks arrive on an NsdManager thread. */
    private inner class Browser(val type: String) : NsdManager.DiscoveryListener {
        @Volatile var closed = false
        @Volatile var registered = true

        private fun onMain(block: () -> Unit) {
            main.post { if (!closed) block() }
        }

        override fun onDiscoveryStarted(serviceType: String) = onMain { lan.started(type) }

        override fun onServiceFound(info: NsdServiceInfo) {
            val name = info.serviceName ?: return
            onMain { lan.found(type, name) }
        }

        override fun onServiceLost(info: NsdServiceInfo) {
            val name = info.serviceName ?: return
            onMain { lan.lost(type, name) }
        }

        override fun onDiscoveryStopped(serviceType: String) {
            registered = false
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            registered = false
            Log.w(TAG, "Bonjour browse of $type did not start, code $errorCode")
            onMain { lan.failed(type) }
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
            registered = false
        }
    }

    private val nextLanWindow = Runnable {
        if (lan.browsing) {
            closeBrowsers()
            openBrowsers(lan.next())
        }
    }

    private fun startBrowsing() {
        stopBrowsing()
        openBrowsers(lan.begin())
    }

    private fun stopBrowsing() {
        main.removeCallbacks(nextLanWindow)
        closeBrowsers()
        lan.end()
    }

    private fun openBrowsers(types: List<String>) {
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
        for (type in types) {
            if (nsd == null) {
                lan.failed(type)
                continue
            }
            val browser = Browser(type)
            try {
                nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, browser)
                browsers[type] = browser
            } catch (e: SecurityException) {
                Log.w(TAG, "Bonjour browse of $type not allowed: $e")
                lan.failed(type, denied = true)
            } catch (e: RuntimeException) {
                Log.w(TAG, "Bonjour browse of $type did not start: $e")
                lan.failed(type)
            }
        }
        main.postDelayed(nextLanWindow, LAN_WINDOW_MS)
    }

    private fun closeBrowsers() {
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
        for (browser in browsers.values) {
            browser.closed = true
            if (!browser.registered) continue
            try {
                nsd?.stopServiceDiscovery(browser)
            } catch (e: RuntimeException) {
                // already stopped
            }
        }
        browsers.clear()
    }
}
