package fi.junction.afferent

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Runs on the build machine (./gradlew testDebugUnitTest), no device needed. */
class PluginSetupTest {

    // jsName of every in-app plugin in the Swift sources under ios/App/App.
    private val iosJsNames = setOf("AfferentFinger", "AfferentPresence", "AfferentEyes")

    @Test
    fun registeredPluginsUseTheIosJsNames() {
        val names = AfferentPlugins.all.map { cls ->
            val annotation = cls.getAnnotation(CapacitorPlugin::class.java)
            assertNotNull("${cls.name} has no @CapacitorPlugin annotation", annotation)
            val name = annotation!!.name
            assertTrue(
                "${cls.name} is exported as '$name'; the web layer only knows $iosJsNames",
                name in iosJsNames
            )
            name
        }
        assertEquals("a plugin name is registered twice: $names", names.size, names.toSet().size)
    }

    /**
     * Plugin tracks can assert the exact JSON a listener receives. A missing value has to be
     * JSONObject.NULL to reach JavaScript as null (as NSNull does on iOS): a plain Kotlin null
     * makes put() drop the key, and the web layer would see undefined instead.
     */
    @Test
    fun eventPayloadsCanBeCheckedOnTheJvm() {
        val event = JSObject()
            .put("kind", "aff1")
            .put("finger_bpm", JSArray().put(71).put(JSONObject.NULL))
            .put("quality", JSONObject.NULL)
            .put("payload_len", 6)

        val json = JSONObject(event.toString())
        assertEquals("aff1", json.getString("kind"))
        assertEquals(71, json.getJSONArray("finger_bpm").getInt(0))
        assertTrue(json.getJSONArray("finger_bpm").isNull(1))
        assertTrue(json.has("quality"))
        assertTrue(json.isNull("quality"))
        assertEquals(6, json.getInt("payload_len"))

        val dropped = JSObject().put("name", null as String?)
        assertFalse(dropped.has("name"))
    }
}
