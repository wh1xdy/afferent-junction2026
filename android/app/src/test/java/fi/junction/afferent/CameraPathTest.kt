package fi.junction.afferent

import java.io.File
import java.net.URI
import javax.xml.parsers.DocumentBuilderFactory
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The eye input on Android has no native plugin. ARKit face tracking (AfferentEyes on iOS)
 * does not exist here, and the web layer already has the other path: Sensors.startCamera()
 * in demo/js/sensors.js picks 'arkit' only on iOS and otherwise runs MediaPipe Face
 * Landmarker in the web view on a getUserMedia stream. Both paths end in the same frame
 * from Sensors.read(), so game code does not see the difference.
 *
 * Nothing in Kotlin is needed for that path, but four things outside Kotlin are, and each
 * of them fails silently on a phone (the app just falls back to touch input). These tests
 * hold them in place. They run on the build machine (./gradlew testDebugUnitTest).
 *
 *  1. CAMERA in the manifest: Capacitor's BridgeWebChromeClient.onPermissionRequest asks for
 *     the runtime permission and grants the web view's VIDEO_CAPTURE request, but Android
 *     refuses a runtime request for a permission the manifest does not declare.
 *  2. A secure context: navigator.mediaDevices is undefined on any other origin.
 *     http://localhost counts as secure, http://192.168.x.x (a live-reload server.url) does not.
 *  3. The model and the SIMD wasm runtime inside the APK: about 13 MB under vendor/mediapipe,
 *     copied by `npx cap sync android` (the no-SIMD fallback is not shipped; Android's WebView has SIMD).
 *  4. No CDN: the web layer must load those files from the app, not from the internet.
 */
class CameraPathTest {

    private val repo: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "capacitor.config.json").isFile }
    private val webRoot = File(repo, JSONObject(File(repo, "capacitor.config.json").readText()).getString("webDir"))
    private val syncedRoot = File(repo, "android/app/src/main/assets/public")

    private val mediapipeFiles = listOf(
        "vendor/mediapipe/vision_bundle.mjs",
        "vendor/mediapipe/face_landmarker.task",
        "vendor/mediapipe/wasm/vision_wasm_internal.js",
        "vendor/mediapipe/wasm/vision_wasm_internal.wasm",
    )

    @Test
    fun manifestDeclaresTheCameraPermission() {
        val manifest = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(File(repo, "android/app/src/main/AndroidManifest.xml"))
        val nodes = manifest.getElementsByTagName("uses-permission")
        val permissions = (0 until nodes.length).map {
            nodes.item(it).attributes.getNamedItem("android:name").nodeValue
        }
        assertTrue("android.permission.CAMERA is missing: $permissions", "android.permission.CAMERA" in permissions)
    }

    @Test
    fun appOriginIsASecureContext() {
        val configs = listOf(File(repo, "capacitor.config.json"), File(syncedRoot.parentFile, "capacitor.config.json"))
            .filter { it.isFile }
        for (file in configs) {
            val server = JSONObject(file.readText()).optJSONObject("server") ?: JSONObject()
            // Capacitor defaults: scheme https, hostname localhost. A server.url replaces both.
            val origin = server.optString("url").ifEmpty {
                "${server.optString("androidScheme", "https")}://${server.optString("hostname", "localhost")}"
            }
            assertTrue("$file loads the app from $origin: no getUserMedia there", isSecureOrigin(origin))
        }
    }

    @Test
    fun secureOriginRuleMatchesTheBrowser() {
        assertTrue(isSecureOrigin("http://localhost"))
        assertTrue(isSecureOrigin("https://localhost"))
        assertTrue(isSecureOrigin("http://127.0.0.1:8100"))
        assertTrue(isSecureOrigin("https://afferent.example"))
        assertFalse(isSecureOrigin("http://192.168.1.20:8100"))
        assertFalse(isSecureOrigin("http://afferent.local"))
    }

    @Test
    fun faceModelAndWasmAreVendoredAndSynced() {
        for (path in mediapipeFiles) {
            val source = File(webRoot, path)
            assertTrue("$source is missing", source.isFile && source.length() > 0)
            val synced = File(syncedRoot, path)
            assertTrue("$synced is missing: run `npx cap sync android`", synced.isFile)
            assertEquals("$synced is stale: run `npx cap sync android`", source.length(), synced.length())
        }
    }

    @Test
    fun webLayerLoadsMediaPipeFromTheAppOnly() {
        val remote = Regex("""https?://[^\s"'`)]*(mediapipe|tasks-vision|jsdelivr|unpkg)[^\s"'`)]*""")
        val hits = webRoot.walkTopDown()
            .onEnter { it.name != "design" && !(it.name == "vendor" && it.parentFile == webRoot) }
            .filter { it.isFile && it.extension in setOf("js", "mjs", "html") }
            .flatMap { file -> remote.findAll(file.readText()).map { "${file.relativeTo(repo)}: ${it.value}" } }
            .toList()
        assertTrue("the camera path would need the internet: $hits", hits.isEmpty())

        // The vendored runtime itself must not point anywhere either.
        val vendored = mediapipeFiles.filter { it.endsWith("js") }
            .filter { Regex("""https?://""").containsMatchIn(File(webRoot, it).readText()) }
        assertTrue("vendored MediaPipe files contain absolute URLs: $vendored", vendored.isEmpty())
    }

    /** Chromium's "potentially trustworthy origin" rule, the part that matters for an app origin. */
    private fun isSecureOrigin(origin: String): Boolean {
        val uri = URI(origin)
        val host = uri.host.orEmpty()
        return uri.scheme == "https" || host == "localhost" || host.endsWith(".localhost") ||
            host.startsWith("127.") || host == "[::1]"
    }
}
