package fi.junction.afferent

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.UUID

/**
 * Finger pulse sensor on the UNO Q ("Afferent Finger") over Bluetooth LE, for the web layer.
 * The Android twin of ios/App/App/AfferentFinger.swift: same name, methods, results and events,
 * so demo/js/finger.js runs unchanged.
 *
 * JS: Capacitor.Plugins.AfferentFinger
 *   start()  -> {state}          switches Bluetooth on for this app (the first call shows the
 *                                permission prompt) and keeps looking for the sensor
 *   stop()   -> {}               disconnects and releases Bluetooth
 *   status() -> {state, name}
 *   event "state":   {state: 'off'|'unauthorized'|'unsupported'|'scanning'|'connecting'|'connected',
 *                     name: String|null}                              on every change
 *   event "reading": {kind: 'hrm', bpm, t_ms}                         2A37 notification with a pulse
 *                    {kind: 'aff1', finger_bpm: [Int|null, Int|null], breathing_per_min: Int|null,
 *                     rmssd_ms: Int|null, quality: 0..1|null, presence: 'idle'|'probing'|'active'|null,
 *                     two_hearts: Boolean|null, payload_len: Int, t_ms}  AFF1 notification
 *   t_ms = wall clock (ms since 1970) when the notification arrived on the phone.
 *
 * How the iOS states map to Android:
 *   unsupported   the phone has no Bluetooth LE
 *   unauthorized  the person did not allow it: Nearby devices (Android 12 and later) or
 *                 Location (Android 11 and earlier, where a Bluetooth scan needs it)
 *   off           Bluetooth is switched off, or the plugin is stopped, or the app has been in
 *                 the background for a few seconds (the scan and the connection are released
 *                 there, as iOS does by suspending the app; back in the app it looks again)
 *
 * This file only translates between Android's Bluetooth classes and AfferentFingerLink, which
 * holds the rules (which device, in which order, when to give up) and is tested without a
 * phone. Byte formats: AfferentFingerParser.kt, uno-q/SENSORS.md.
 */
@SuppressLint("MissingPermission")   // every Bluetooth call runs only after granted() and is guarded
@CapacitorPlugin(
    name = "AfferentFinger",
    permissions = [
        // Android 12 (API 31) and later
        Permission(
            alias = AfferentFingerPlugin.NEARBY,
            strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT]
        ),
        // Android 7 to 11 (API 24 to 30): scan results are only delivered with location access
        Permission(alias = AfferentFingerPlugin.LOCATION, strings = [Manifest.permission.ACCESS_FINE_LOCATION]),
    ]
)
class AfferentFingerPlugin : Plugin() {
    companion object {
        const val NEARBY = "bluetooth"
        const val LOCATION = "location"
        private const val TAG = "AfferentFinger"
    }

    // Everything below is touched on the main thread only: plugin calls, permission results,
    // scan results, connection callbacks and timers all hop there first (as on iOS, where the
    // central manager delivers on the main queue).
    private val main = Handler(Looper.getMainLooper())
    private val radio = Radio()
    private val link = AfferentFingerLink(radio, Timer(), Events(), ScanBudget.app)

    /** start() was called and stop() was not: the web layer wants the sensor. */
    private var wanted = false
    /** start() calls that wait for the answer to the permission prompt */
    private val waiting = ArrayList<PluginCall>()
    private var receiver: BroadcastReceiver? = null
    /** Between handleOnPause and handleOnResume: another app, the home screen, screen off. */
    private var paused = false

    // ── plugin methods ───────────────────────────────────────────────────

    @PluginMethod
    fun start(call: PluginCall) {
        main.post {
            wanted = true
            if (!supported() || granted()) {
                begin()
                call.resolve(AfferentFingerEvents.startResult(link.state))
                return@post
            }
            // Asked here and not at app start, so the prompt appears only when the finger
            // sensor is switched on. The call is answered when the person has chosen.
            waiting.add(call)
            if (waiting.size > 1) return@post
            try {
                requestPermissionForAlias(permissionAlias(), call, "permissionResult")
            } catch (e: Exception) {
                Log.w(TAG, "the permission prompt could not be shown", e)
                answerWaiting()
            }
        }
    }

    @PermissionCallback
    private fun permissionResult(@Suppress("UNUSED_PARAMETER") call: PluginCall?) {
        main.post { answerWaiting() }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        main.post {
            shutDown()
            call.resolve()
        }
    }

    @PluginMethod
    fun status(call: PluginCall) {
        main.post { call.resolve(AfferentFingerEvents.state(link.state, link.name)) }
    }

    // ── app lifecycle ────────────────────────────────────────────────────

    /** Back in the app, e.g. from Settings where the permission or Bluetooth was changed. */
    override fun handleOnResume() {
        main.post {
            paused = false
            if (wanted && waiting.isEmpty()) begin()
        }
    }

    /** No Bluetooth work in the background: the link lets go after a short grace period. */
    override fun handleOnPause() {
        main.post {
            paused = true
            link.background()
        }
    }

    override fun handleOnDestroy() {
        if (Looper.myLooper() == Looper.getMainLooper()) shutDown() else main.post { shutDown() }
    }

    // ── state ────────────────────────────────────────────────────────────

    private fun answerWaiting() {
        if (wanted) begin()
        val calls = ArrayList(waiting)
        waiting.clear()
        for (c in calls) c.resolve(AfferentFingerEvents.startResult(link.state))
    }

    /** Tell the link what Bluetooth can do right now; it starts or stops looking accordingly. */
    private fun begin() {
        if (receiver == null && supported()) {
            val r = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val s = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    main.post {
                        if (receiver !== this) return@post
                        when (s) {
                            BluetoothAdapter.STATE_ON -> link.availabilityChanged(availability())
                            BluetoothAdapter.STATE_OFF, BluetoothAdapter.STATE_TURNING_OFF ->
                                link.availabilityChanged(FingerAvailability.OFF)
                        }
                    }
                }
            }
            try {
                ContextCompat.registerReceiver(
                    appContext(), r, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED),
                    ContextCompat.RECEIVER_NOT_EXPORTED
                )
                receiver = r
            } catch (e: Exception) {
                Log.w(TAG, "cannot watch the Bluetooth switch", e)
            }
        }
        link.start(availability())
        if (paused) link.background()
    }

    private fun shutDown() {
        wanted = false
        link.stop()
        radio.forget()
        receiver?.let {
            try { appContext().unregisterReceiver(it) } catch (e: Exception) { Log.w(TAG, "unregister failed", e) }
        }
        receiver = null
    }

    private fun appContext(): Context = context.applicationContext

    private fun adapter(): BluetoothAdapter? =
        (appContext().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private fun supported(): Boolean =
        appContext().packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) && adapter() != null

    private fun permissionAlias(): String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) NEARBY else LOCATION

    private fun has(permission: String): Boolean =
        ContextCompat.checkSelfPermission(appContext(), permission) == PackageManager.PERMISSION_GRANTED

    private fun granted(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            has(Manifest.permission.BLUETOOTH_SCAN) && has(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            has(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    private fun locationOn(): Boolean {
        val manager = appContext().getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
        return LocationManagerCompat.isLocationEnabled(manager)
    }

    private fun availability(): FingerAvailability = try {
        when {
            !supported() -> FingerAvailability.UNSUPPORTED
            !granted() -> FingerAvailability.UNAUTHORIZED
            adapter()?.isEnabled != true -> FingerAvailability.OFF
            else -> FingerAvailability.ON
        }
    } catch (e: SecurityException) {
        FingerAvailability.UNAUTHORIZED
    }

    // ── link -> web layer ────────────────────────────────────────────────

    private inner class Events : FingerLinkListener {
        override fun state(state: String, name: String?) =
            notifyListeners("state", AfferentFingerEvents.state(state, name))

        override fun hrm(bpm: Int, tMs: Long) =
            notifyListeners("reading", AfferentFingerEvents.hrm(bpm, tMs))

        override fun aff1(reading: FingerAff1, tMs: Long) =
            notifyListeners("reading", AfferentFingerEvents.aff1(reading, tMs))
    }

    private inner class Timer : FingerTimer {
        override fun nowMs(): Long = SystemClock.elapsedRealtime()
        override fun after(delayMs: Long, task: () -> Unit) {
            main.postDelayed({ task() }, delayMs)
        }
    }

    // ── link -> Android Bluetooth ────────────────────────────────────────

    private inner class Radio : FingerRadio {
        private var scan: ScanCallback? = null
        private var gatt: BluetoothGatt? = null
        /** devices seen in this session, by address: connect() needs the object the scan gave */
        private val seen = HashMap<String, BluetoothDevice>()

        fun forget() = seen.clear()

        override fun connectedDevices(): List<FingerDevice> = guarded("connected devices", emptyList()) {
            val manager = appContext().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            (manager?.getConnectedDevices(BluetoothProfile.GATT) ?: emptyList()).map {
                seen[it.address] = it
                FingerDevice(it.address, it.name)
            }
        }

        override fun startScan(): Boolean = guarded("start scan", false) {
            val scanner = adapter()?.bluetoothLeScanner ?: return@guarded false
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && !locationOn()) {
                // Not a state of its own on iOS, so the link stays "scanning" (which is true).
                Log.w(TAG, "Location is switched off: Android 11 and earlier then deliver no scan results")
            }
            // Heart Rate finds our own advertisement; Wendy Net's finds the board while a Wendy
            // Net peer holds a link through ours (that advertisement is then off the air).
            // Several filters: a result matches any of them.
            val filters = AfferentFingerParser.SCAN_SERVICES.map {
                ScanFilter.Builder().setServiceUuid(ParcelUuid(it)).build()
            }
            val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
            val callback = ScanEvents()
            scan = callback
            scanner.startScan(filters, settings, callback)
            true
        }

        override fun stopScan() {
            val callback = scan ?: return
            scan = null
            // throws when Bluetooth was switched off in the meantime: the scan is gone anyway
            guarded("stop scan", Unit) { adapter()?.bluetoothLeScanner?.stopScan(callback) }
        }

        override fun connect(address: String): Boolean = guarded("connect", false) {
            val device = seen[address] ?: return@guarded false
            // autoConnect = false: a direct attempt. AfferentFingerLink has its own timeout and
            // looks again by itself, which also finds the board after it was restarted.
            gatt = device.connectGatt(appContext(), false, GattEvents(), BluetoothDevice.TRANSPORT_LE)
            gatt != null
        }

        override fun disconnect() {
            val g = gatt ?: return
            gatt = null                              // callbacks of this connection are ignored from here
            guarded("disconnect", Unit) { g.disconnect() }
            guarded("close", Unit) { g.close() }
        }

        override fun discoverServices(): Boolean = guarded("discover services", false) {
            gatt?.discoverServices() == true
        }

        override fun hasService(service: UUID): Boolean = gatt?.getService(service) != null

        override fun subscribe(service: UUID, characteristic: UUID): FingerSubscribe =
            guarded("subscribe", FingerSubscribe.FAILED) {
                val g = gatt ?: return@guarded FingerSubscribe.FAILED
                val ch = g.getService(service)?.getCharacteristic(characteristic)
                    ?: return@guarded FingerSubscribe.ABSENT
                val value = when {
                    ch.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 ->
                        BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    ch.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0 ->
                        BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                    else -> return@guarded FingerSubscribe.ABSENT
                }
                // Two steps: tell Android to deliver the notifications to this app, then write
                // the descriptor that makes the peripheral send them. Notifications only: the
                // stored value is never read (see the rules in AfferentFingerLink).
                if (!g.setCharacteristicNotification(ch, true)) return@guarded FingerSubscribe.FAILED
                val descriptor = ch.getDescriptor(AfferentFingerParser.CLIENT_CONFIG)
                    ?: return@guarded FingerSubscribe.FAILED
                val sent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    g.writeDescriptor(descriptor, value) == BluetoothStatusCodes.SUCCESS
                } else {
                    @Suppress("DEPRECATION")
                    descriptor.value = value
                    @Suppress("DEPRECATION")
                    g.writeDescriptor(descriptor)
                }
                if (sent) FingerSubscribe.STARTED else FingerSubscribe.FAILED
            }

        /** Android's Bluetooth calls throw when the permission or the adapter went away. */
        private inline fun <T> guarded(what: String, fallback: T, block: () -> T): T = try {
            block()
        } catch (e: Exception) {
            Log.w(TAG, "$what failed", e)
            fallback
        }

        private inner class ScanEvents : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) = found(result)

            override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach { found(it) }

            override fun onScanFailed(errorCode: Int) {
                if (errorCode == SCAN_FAILED_ALREADY_STARTED) return
                Log.w(TAG, "scan failed, code $errorCode")
                main.post {
                    if (scan !== this) return@post
                    scan = null
                    link.onScanFailed()
                }
            }

            private fun found(result: ScanResult) {
                main.post {
                    if (scan !== this) return@post
                    val device = result.device ?: return@post
                    seen[device.address] = device
                    val name = guarded("device name", null as String?) { device.name }
                    val wendyNet = result.scanRecord?.serviceUuids
                        ?.contains(ParcelUuid(AfferentFingerParser.WENDY_NET_SERVICE)) == true
                    link.onScanResult(device.address, result.scanRecord?.deviceName, name, wendyNet)
                }
            }
        }

        // Called on Android's Bluetooth threads. Each callback takes what it needs (the bytes
        // of a notification are only valid during the call) and continues on the main thread.
        private inner class GattEvents : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                main.post {
                    if (g !== gatt) return@post
                    val address = g.device.address
                    if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                        link.onConnected(address)
                    } else if (status != BluetoothGatt.GATT_SUCCESS || newState == BluetoothProfile.STATE_DISCONNECTED) {
                        link.onDisconnected(address)
                    }
                }
            }

            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                main.post { if (g === gatt) link.onServicesDiscovered(status == BluetoothGatt.GATT_SUCCESS) }
            }

            override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
                if (descriptor.uuid != AfferentFingerParser.CLIENT_CONFIG) return
                main.post { if (g === gatt) link.onSubscribed(status == BluetoothGatt.GATT_SUCCESS) }
            }

            /** Android 13 (API 33) and later; the system then does not call the one below. */
            override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) {
                notified(g, ch.uuid, value)
            }

            /** Android 12 and earlier. */
            @Deprecated("Deprecated in API 33; still the only callback before it")
            @Suppress("DEPRECATION")
            override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
                notified(g, ch.uuid, ch.value?.copyOf())
            }

            private fun notified(g: BluetoothGatt, characteristic: UUID, value: ByteArray?) {
                val tMs = System.currentTimeMillis()
                main.post { if (g === gatt) link.onValue(characteristic, value, tMs) }
            }
        }
    }
}
