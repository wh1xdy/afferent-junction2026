package fi.junction.afferent

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.PermissionCallback
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

    /** The web layer (demo/js/finger.js) calls exactly these, as on iOS. */
    @Test
    fun fingerPluginHasTheIosNameAndMethods() {
        val cls = AfferentFingerPlugin::class.java
        assertTrue(cls in AfferentPlugins.all)
        val annotation = cls.getAnnotation(CapacitorPlugin::class.java)!!
        assertEquals("AfferentFinger", annotation.name)
        val methods = cls.declaredMethods.filter { it.isAnnotationPresent(PluginMethod::class.java) }
        assertEquals(setOf("start", "stop", "status"), methods.map { it.name }.toSet())
        for (m in methods) {
            assertEquals("${m.name} must return a promise", PluginMethod.RETURN_PROMISE, m.getAnnotation(PluginMethod::class.java)!!.returnType)
            assertEquals(listOf(PluginCall::class.java), m.parameterTypes.toList())
        }
        // start() names this method when it asks for the permission; Capacitor finds it by name
        val callback = cls.declaredMethods.single { it.isAnnotationPresent(PermissionCallback::class.java) }
        assertEquals("permissionResult", callback.name)
        // one alias per Android generation, see AfferentFingerPlugin.permissionAlias
        val permissions = annotation.permissions.associate { it.alias to it.strings.toSet() }
        assertEquals(
            mapOf(
                "bluetooth" to setOf("android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT"),
                "location" to setOf("android.permission.ACCESS_FINE_LOCATION"),
            ),
            permissions
        )
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
