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
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.UUID

/**
 * A watch or chest strap over the standard Bluetooth Heart Rate Service, for the web layer. The Android twin of
 * ios/App/App/AfferentWatch.swift: same name, methods, results and events, so demo/js/watch.js runs unchanged.
 *
 * JS: Capacitor.Plugins.AfferentWatch
 *   scan()               -> {state}   lists heart-rate devices nearby for 30 s (event "device"); connects to none
 *   stopScan()           -> {}
 *   connect({id, name})  -> {state, name, id, scanning}   connects to that device (id = its Bluetooth address from a
 *                                     "device" event) and reconnects whenever it is back, until disconnect()
 *   disconnect()         -> {}
 *   status()             -> {state, name, id, scanning}
 *   event "state":   {state: 'off'|'unauthorized'|'unsupported'|'idle'|'connecting'|'connected', name, id, scanning}
 *   event "device":  {id, name, rssi}
 *   event "reading": {kind: 'hr', bpm, contact, energy_kj, rr_ms, t_ms}
 *
 * This file only translates between Android's Bluetooth classes and AfferentWatchLink, which holds the rules and is
 * tested without a phone. Bytes: HeartRateParser.kt. Permissions: the same as AfferentFinger (Nearby devices on
 * Android 12 and later, Location before), asked on the first scan() or connect().
 */
@SuppressLint("MissingPermission")   // every Bluetooth call runs only after granted() and is guarded
@CapacitorPlugin(
    name = "AfferentWatch",
    permissions = [
        Permission(
            alias = AfferentWatchPlugin.NEARBY,
            strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT]
        ),
        Permission(alias = AfferentWatchPlugin.LOCATION, strings = [Manifest.permission.ACCESS_FINE_LOCATION]),
    ]
)
class AfferentWatchPlugin : Plugin() {
    companion object {
        const val NEARBY = "bluetooth"
        const val LOCATION = "location"
        private const val TAG = "AfferentWatch"
    }

    private val main = Handler(Looper.getMainLooper())
    private val radio = Radio()
    private val link = AfferentWatchLink(radio, Timer(), Events(), ScanBudget.app)
    private var receiver: BroadcastReceiver? = null
    /** Calls waiting for the answer to the permission prompt, with what each one asked for. */
    private val waiting = ArrayList<Pair<PluginCall, () -> Unit>>()

    // ── plugin methods ───────────────────────────────────────────────────

    @PluginMethod
    fun scan(call: PluginCall) {
        main.post {
            withPermission(call) {
                watchSwitch()
                link.scan(availability())
                call.resolve(JSObject().put("state", link.state))
            }
        }
    }

    @PluginMethod
    fun stopScan(call: PluginCall) {
        main.post {
            link.stopScan()
            call.resolve()
        }
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val id = call.getString("id")
        if (id == null || !BluetoothAdapter.checkBluetoothAddress(id.uppercase())) {
            call.reject("id is not a device address from a scan", "bad_id")
            return
        }
        val name = call.getString("name")
        main.post {
            withPermission(call) {
                watchSwitch()
                link.connect(id.uppercase(), name, availability())
                call.resolve(AfferentWatchEvents.state(link.state, link.targetName, link.target, link.scanning))
            }
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        main.post {
            link.disconnect()
            if (link.state == "off") unwatchSwitch()
            call.resolve()
        }
    }

    @PluginMethod
    fun status(call: PluginCall) {
        main.post { call.resolve(AfferentWatchEvents.state(link.state, link.targetName, link.target, link.scanning)) }
    }

    @PermissionCallback
    private fun permissionResult(@Suppress("UNUSED_PARAMETER") call: PluginCall?) {
        main.post { answerWaiting() }
    }

    // ── app lifecycle ────────────────────────────────────────────────────

    override fun handleOnResume() {
        main.post { link.foreground(availability()) }
    }

    override fun handleOnPause() {
        main.post { link.background() }
    }

    override fun handleOnDestroy() {
        val stop = {
            link.disconnect()
            link.stopScan()
            unwatchSwitch()
        }
        if (Looper.myLooper() == Looper.getMainLooper()) stop() else main.post(stop)
    }

    // ── permission and the Bluetooth switch ──────────────────────────────

    /** Runs the work now when allowed (or when there is no Bluetooth to ask for); otherwise after the prompt. */
    private fun withPermission(call: PluginCall, work: () -> Unit) {
        if (!supported() || granted()) {
            work()
            return
        }
        waiting.add(call to work)
        if (waiting.size > 1) return
        try {
            requestPermissionForAlias(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) NEARBY else LOCATION, call, "permissionResult")
        } catch (e: Exception) {
            Log.w(TAG, "the permission prompt could not be shown", e)
            answerWaiting()
        }
    }

    private fun answerWaiting() {
        val calls = ArrayList(waiting)
        waiting.clear()
        for ((_, work) in calls) work()
    }

    private fun watchSwitch() {
        if (receiver != null || !supported()) return
        val r = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val s = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                main.post {
                    if (receiver !== this) return@post
                    when (s) {
                        BluetoothAdapter.STATE_ON -> link.availabilityChanged(availability())
                        BluetoothAdapter.STATE_OFF, BluetoothAdapter.STATE_TURNING_OFF -> link.availabilityChanged(FingerAvailability.OFF)
                    }
                }
            }
        }
        try {
            ContextCompat.registerReceiver(appContext(), r, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
            receiver = r
        } catch (e: Exception) {
            Log.w(TAG, "cannot watch the Bluetooth switch", e)
        }
    }

    private fun unwatchSwitch() {
        receiver?.let { try { appContext().unregisterReceiver(it) } catch (e: Exception) { Log.w(TAG, "unregister failed", e) } }
        receiver = null
        radio.forget()
    }

    private fun appContext(): Context = context.applicationContext

    private fun adapter(): BluetoothAdapter? =
        (appContext().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private fun supported(): Boolean =
        appContext().packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE) && adapter() != null

    private fun has(permission: String): Boolean =
        ContextCompat.checkSelfPermission(appContext(), permission) == PackageManager.PERMISSION_GRANTED

    private fun granted(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            has(Manifest.permission.BLUETOOTH_SCAN) && has(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            has(Manifest.permission.ACCESS_FINE_LOCATION)
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

    private inner class Events : WatchLinkListener {
        override fun state(state: String, name: String?, id: String?, scanning: Boolean) =
            notifyListeners("state", AfferentWatchEvents.state(state, name, id, scanning))

        override fun device(id: String, name: String, rssi: Int?) =
            notifyListeners("device", AfferentWatchEvents.device(id, name, rssi))

        override fun reading(measurement: HeartRateMeasurement, tMs: Long) =
            notifyListeners("reading", AfferentWatchEvents.reading(measurement, tMs))
    }

    private inner class Timer : FingerTimer {
        override fun nowMs(): Long = SystemClock.elapsedRealtime()
        override fun after(delayMs: Long, task: () -> Unit) {
            main.postDelayed({ task() }, delayMs)
        }
    }

    // ── link -> Android Bluetooth ────────────────────────────────────────

    private inner class Radio : WatchRadio {
        private var scan: ScanCallback? = null
        private var gatt: BluetoothGatt? = null
        /** devices seen in this session, by address: connect() uses the object the scan gave (with its address type) */
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
            val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(HeartRateParser.HEART_RATE_SERVICE)).build())
            val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
            val callback = ScanEvents()
            scan = callback
            scanner.startScan(filters, settings, callback)
            true
        }

        override fun stopScan() {
            val callback = scan ?: return
            scan = null
            guarded("stop scan", Unit) { adapter()?.bluetoothLeScanner?.stopScan(callback) }
        }

        override fun connect(address: String): Boolean = guarded("connect", false) {
            val device = seen[address] ?: adapter()?.getRemoteDevice(address) ?: return@guarded false
            gatt = device.connectGatt(appContext(), false, GattEvents(), BluetoothDevice.TRANSPORT_LE)
            gatt != null
        }

        override fun disconnect() {
            val g = gatt ?: return
            gatt = null
            guarded("disconnect", Unit) { g.disconnect() }
            guarded("close", Unit) { g.close() }
        }

        override fun discoverServices(): Boolean = guarded("discover services", false) { gatt?.discoverServices() == true }

        override fun hasService(service: UUID): Boolean = gatt?.getService(service) != null

        override fun subscribe(service: UUID, characteristic: UUID): FingerSubscribe =
            guarded("subscribe", FingerSubscribe.FAILED) {
                val g = gatt ?: return@guarded FingerSubscribe.FAILED
                val ch = g.getService(service)?.getCharacteristic(characteristic) ?: return@guarded FingerSubscribe.ABSENT
                val value = when {
                    ch.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 -> BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    ch.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0 -> BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                    else -> return@guarded FingerSubscribe.ABSENT
                }
                // Notifications only: the stored value is never read.
                if (!g.setCharacteristicNotification(ch, true)) return@guarded FingerSubscribe.FAILED
                val descriptor = ch.getDescriptor(AfferentFingerParser.CLIENT_CONFIG) ?: return@guarded FingerSubscribe.FAILED
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
                    link.onScanResult(device.address, result.scanRecord?.deviceName, name, result.rssi)
                }
            }
        }

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

            override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) {
                notified(g, ch.uuid, value)
            }

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
