package fi.junction.afferent

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Room sound level for demo/js/sound.js: one short window of the microphone (about 4 s), as one A-weighted level per
 * 100 ms (SoundLevelMeter). The Android twin of ios/App/App/AfferentSoundLevel.swift: same name, methods and results.
 * Numbers only: each buffer read from AudioRecord is filtered and squared into the block sums, then zeroed; nothing is
 * recorded, written, logged or sent.
 *
 * JS: Capacitor.Plugins.AfferentSoundLevel
 *   status()  -> {permission: 'granted'|'denied'|'undetermined', route: 'headphones'|'speaker'|'external', measuring}
 *   measure({seconds, blockMs, quiet}) -> {blocks: [dBFS], route, echo_cancelled: false, interrupted, permission}
 *                                         or {skipped: true, route} (Afferent makes sound the microphone would hear)
 *                                         or {aborted: true} (stop() came first) or {permission: 'denied'} or {error}
 *   stop()    -> {}   ends the window that runs (Talk takes the microphone)
 *
 * AudioRecord with the VOICE_RECOGNITION source, which the Android CDD calibrates (90 dB SPL at 1 kHz gives an RMS
 * of 2500 for 16-bit samples) and keeps free of noise suppression and automatic gain, at 44.1 kHz, the one rate every
 * phone must record at. Recording takes no audio focus and changes no audio mode, so the music in the web view plays
 * on as it was, on the same output. There is no echo cancelling for media here, so with Afferent making sound only
 * headphones keep it out of the reading.
 */
@CapacitorPlugin(
    name = "AfferentSoundLevel",
    permissions = [Permission(alias = AfferentSoundLevelPlugin.MIC, strings = [Manifest.permission.RECORD_AUDIO])]
)
class AfferentSoundLevelPlugin : Plugin() {

    private class Window(val call: PluginCall, val seconds: Double, val blockSeconds: Double) {
        @Volatile var stopped = false
    }

    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var running: Window? = null
    // stop() raises it; a measure asked for before that (and still waiting for the permission prompt) does not start
    @Volatile private var generation = 0

    private fun permission(): String = when (getPermissionState(MIC)) {
        PermissionState.GRANTED -> "granted"
        PermissionState.DENIED -> "denied"
        else -> "undetermined"
    }

    /** Where the phone's sound goes: headphones (wired, USB, Bluetooth), something else in the room, or the speaker. */
    private fun route(): String {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return "speaker"
        val types = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }.toSet()
        if (types.any { it in HEADPHONES }) return "headphones"
        if (types.any { it in EXTERNAL }) return "external"
        return "speaker"
    }

    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(JSObject().put("permission", permission()).put("route", route()).put("measuring", running != null))
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        generation++
        running?.stopped = true
        call.resolve()
    }

    @PluginMethod
    fun measure(call: PluginCall) {
        call.data.put("gen", generation)
        if (getPermissionState(MIC) == PermissionState.GRANTED) start(call)
        else requestPermissionForAlias(MIC, call, "micResult")
    }

    @PermissionCallback
    private fun micResult(call: PluginCall) {
        if (getPermissionState(MIC) == PermissionState.GRANTED) start(call)
        else call.resolve(JSObject().put("permission", "denied"))
    }

    private fun start(call: PluginCall) {
        if (call.data.optInt("gen", generation) != generation) {
            call.resolve(JSObject().put("aborted", true).put("permission", "granted"))
            return
        }
        val seconds = (call.getDouble("seconds") ?: 4.0).coerceIn(1.0, 10.0)
        val blockSeconds = ((call.getDouble("blockMs") ?: 100.0) / 1000).coerceIn(0.02, 1.0)
        val quiet = call.getBoolean("quiet") ?: false
        val route = route()
        if (!quiet && route != "headphones") {
            call.resolve(JSObject().put("skipped", true).put("route", route).put("echo_cancelled", false).put("permission", "granted"))
            return
        }
        running?.stopped = true
        val w = Window(call, seconds, blockSeconds)
        running = w
        worker.execute { record(w, route) }
    }

    @SuppressLint("MissingPermission")  // only reached with RECORD_AUDIO granted (start)
    private fun record(w: Window, route: String) {
        val min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (min <= 0) return answer(w, error = "input")
        val rec = try {
            AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(min, RATE / 2))
        } catch (e: Exception) {
            null
        }
        if (rec == null || rec.state != AudioRecord.STATE_INITIALIZED) {
            rec?.release()
            return answer(w, error = "input")
        }
        val meter = SoundLevelMeter(RATE.toDouble(), w.blockSeconds)
        val buf = ShortArray(RATE / 10)
        val end = SystemClock.elapsedRealtime() + (w.seconds * 1000).roundToInt()
        var interrupted = false
        try {
            rec.startRecording()
            if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) interrupted = true
            while (!interrupted && !w.stopped && SystemClock.elapsedRealtime() < end) {
                val n = rec.read(buf, 0, buf.size)
                if (n < 0) interrupted = true else meter.process(buf, n)
            }
        } catch (e: Exception) {
            interrupted = true
        } finally {
            try { rec.stop() } catch (e: Exception) {}
            rec.release()
            buf.fill(0)
        }
        if (w.stopped) return answer(w, aborted = true)
        answer(w, blocks = meter.blocks, route = route, interrupted = interrupted)
    }

    private fun answer(w: Window, blocks: List<Double>? = null, route: String = "speaker", interrupted: Boolean = false, aborted: Boolean = false, error: String? = null) {
        if (running === w) running = null
        val out = JSObject().put("permission", "granted")
        when {
            aborted -> out.put("aborted", true)
            error != null -> out.put("error", error)
            else -> {
                val list = JSArray()
                for (b in blocks.orEmpty()) list.put((b * 10).roundToInt() / 10.0)
                out.put("blocks", list).put("route", route).put("echo_cancelled", false).put("interrupted", interrupted)
            }
        }
        w.call.resolve(out)
    }

    override fun handleOnDestroy() {
        running?.stopped = true
        worker.shutdown()
        super.handleOnDestroy()
    }

    companion object {
        const val MIC = "microphone"
        private const val RATE = 44100
        private val HEADPHONES = setOf(
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_BLE_HEADSET,
        )
        private val EXTERNAL = setOf(
            AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_LINE_ANALOG, AudioDeviceInfo.TYPE_LINE_DIGITAL, AudioDeviceInfo.TYPE_DOCK,
            AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_ACCESSORY, AudioDeviceInfo.TYPE_BLE_SPEAKER,
        )
    }
}
