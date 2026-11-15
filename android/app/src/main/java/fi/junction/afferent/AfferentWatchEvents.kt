package fi.junction.afferent

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import org.json.JSONObject

/**
 * The results and events of the AfferentWatch plugin, exactly as the web layer receives them on iOS
 * (ios/App/App/AfferentWatch.swift, HeartRateParser.swift). A missing value is JSON null, never 0 and never a
 * dropped key.
 */
object AfferentWatchEvents {
    /** "state" and status(): {state, name, id, scanning} */
    fun state(state: String, name: String?, id: String?, scanning: Boolean): JSObject =
        JSObject().put("state", state).put("name", js(name)).put("id", js(id)).put("scanning", scanning)

    /** "device": {id, name, rssi}. Android reports 127 when it has no RSSI. */
    fun device(id: String, name: String, rssi: Int?): JSObject =
        JSObject().put("id", id).put("name", name).put("rssi", js(rssi?.takeIf { it < 0 && it != 127 }))

    /** "reading": {kind: "hr", bpm, contact, energy_kj, rr_ms, t_ms} */
    fun reading(m: HeartRateMeasurement, tMs: Long): JSObject {
        val rr = JSArray()
        for (x in m.rrMs) rr.put(x)
        return JSObject()
            .put("kind", "hr")
            .put("bpm", js(m.bpm))
            .put("contact", js(m.contact))
            .put("energy_kj", js(m.energyKJ))
            .put("rr_ms", rr)
            .put("t_ms", tMs)
    }

    private fun js(value: Any?): Any = value ?: JSONObject.NULL
}
