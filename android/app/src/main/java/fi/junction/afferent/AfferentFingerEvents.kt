package fi.junction.afferent

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import org.json.JSONObject

/**
 * The results and events of the AfferentFinger plugin, exactly as the web layer receives them
 * on iOS (ios/App/App/AfferentFinger.swift, AfferentFingerParser.swift).
 *
 * A missing value is JSON null (JSONObject.NULL, the counterpart of NSNull), never 0, never a
 * made-up default and never a dropped key: put(key, null) would remove the key and JavaScript
 * would see undefined.
 */
object AfferentFingerEvents {
    /** start() -> {state} */
    fun startResult(state: String): JSObject = JSObject().put("state", state)

    /** status() and the "state" event: {state, name: String|null} */
    fun state(state: String, name: String?): JSObject =
        JSObject().put("state", state).put("name", js(name))

    /** 2A37 notification with a pulse: {kind: "hrm", bpm, t_ms} */
    fun hrm(bpm: Int, tMs: Long): JSObject =
        JSObject().put("kind", "hrm").put("bpm", bpm).put("t_ms", tMs)

    /**
     * AFF1 notification: {kind: "aff1", finger_bpm: [f1, f2], breathing_per_min, rmssd_ms,
     * quality, presence, two_hearts, payload_len, t_ms}
     */
    fun aff1(r: FingerAff1, tMs: Long): JSObject =
        JSObject()
            .put("kind", "aff1")
            .put("finger_bpm", JSArray().put(js(r.finger1)).put(js(r.finger2)))
            .put("breathing_per_min", js(r.breathing))
            .put("rmssd_ms", js(r.rmssd))
            .put("quality", js(r.quality))
            .put("presence", js(r.presence))
            .put("two_hearts", js(r.twoHearts))
            .put("payload_len", r.length)
            .put("t_ms", tMs)

    private fun js(value: Any?): Any = value ?: JSONObject.NULL
}
