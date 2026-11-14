package fi.junction.afferent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * The connection rules of a watch or chest strap, run against a fake radio and a fake clock: which device is listed,
 * that only the chosen one is connected, the reconnect, and the states the web layer sees. No phone involved.
 */
class AfferentWatchLinkTest {
    private val garmin = "AA:BB:CC:DD:EE:01"
    private val polar = "AA:BB:CC:DD:EE:02"
    private val box = "AA:BB:CC:DD:EE:03"
    private val hrm = HeartRateParser.HEART_RATE_MEASUREMENT

    private class FakeRadio : WatchRadio {
        val log = ArrayList<String>()
        var connected = listOf<FingerDevice>()
        var scanStarts = true
        var hasHeartRate = true
        var subscribes = FingerSubscribe.STARTED
        override fun connectedDevices(): List<FingerDevice> = connected
        override fun startScan(): Boolean { log += "startScan"; return scanStarts }
        override fun stopScan() { log += "stopScan" }
        override fun connect(address: String): Boolean { log += "connect $address"; return true }
        override fun disconnect() { log += "disconnect" }
        override fun discoverServices(): Boolean { log += "discover"; return true }
        override fun hasService(service: UUID): Boolean = hasHeartRate
        override fun subscribe(service: UUID, characteristic: UUID): FingerSubscribe { log += "subscribe"; return subscribes }
        fun count(entry: String) = log.count { it == entry }
    }

    private class FakeTimer : FingerTimer {
        var now = 0L
        private val tasks = ArrayList<Pair<Long, () -> Unit>>()
        override fun nowMs(): Long = now
        override fun after(delayMs: Long, task: () -> Unit) { tasks += (now + delayMs) to task }
        fun advance(ms: Long) {
            val end = now + ms
            while (true) {
                val next = tasks.filter { it.first <= end }.minByOrNull { it.first } ?: break
                tasks.remove(next)
                now = maxOf(now, next.first)
                next.second()
            }
            now = end
        }
    }

    private class Heard : WatchLinkListener {
        val states = ArrayList<String>()
        val devices = ArrayList<String>()
        val readings = ArrayList<HeartRateMeasurement>()
        override fun state(state: String, name: String?, id: String?, scanning: Boolean) { states += state }
        override fun device(id: String, name: String, rssi: Int?) { devices += "$name $id $rssi" }
        override fun reading(measurement: HeartRateMeasurement, tMs: Long) { readings += measurement }
    }

    private val timer = FakeTimer()
    private val radio = FakeRadio()
    private val heard = Heard()
    private val link = AfferentWatchLink(radio, timer, heard, ScanBudget(max = 100))

    private fun upTo(address: String) {
        link.onScanResult(address, "Forerunner 265", null, -60)
        link.onConnected(address)
        link.onServicesDiscovered(true)
        link.onSubscribed(true)
    }

    @Test
    fun aListScanListsButNeverConnects() {
        radio.connected = listOf(FingerDevice(polar, "Polar H10"), FingerDevice(box, "Afferent Finger"))
        link.scan(FingerAvailability.ON)
        assertEquals(listOf("startScan"), radio.log)
        assertEquals("idle", link.state)
        link.onScanResult(garmin, "Forerunner 265", null, -58)
        link.onScanResult(box, "Afferent Finger", null, -40)
        link.onScanResult("AA:BB:CC:DD:EE:04", null, null, -70)
        assertEquals("connected heart-rate devices are listed too; the box and nameless devices never",
            listOf("Polar H10 $polar null", "Forerunner 265 $garmin -58"), heard.devices)
        assertFalse(radio.log.any { it.startsWith("connect") })
        timer.advance(AfferentWatchLink.LIST_MS)
        assertEquals("the list scan ends by itself and lets go of Bluetooth", listOf("startScan", "stopScan"), radio.log)
        assertEquals("off", link.state)
    }

    @Test
    fun onlyTheChosenDeviceIsConnected() {
        link.connect(polar, "Polar H10", FingerAvailability.ON)
        assertEquals("connecting", link.state)
        assertEquals("not connected: it looks for it", listOf("startScan"), radio.log)
        link.onScanResult(garmin, "Forerunner 265", null, -50)
        link.onScanResult(box, "Afferent Finger", null, -40)
        assertFalse(radio.log.any { it.startsWith("connect") })
        assertTrue("not listing: nothing is offered", heard.devices.isEmpty())
        link.onScanResult(polar, "Polar H10", null, -70)
        assertEquals(listOf("startScan", "stopScan", "connect $polar"), radio.log)
        link.onConnected(polar)
        link.onServicesDiscovered(true)
        assertEquals("connecting", link.state)
        link.onSubscribed(true)
        assertEquals("connected", link.state)
        link.onValue(hrm, byteArrayOf(0x16, 60, 0x00, 0x04), 1234)
        link.onValue(UUID.randomUUID(), byteArrayOf(0x00, 70), 1235)
        assertEquals(listOf(HeartRateMeasurement(60, true, null, listOf(1000.0))), heard.readings)
        timer.advance(10 * 60_000)
        assertEquals("no timer fires on a working link", "connected", link.state)
    }

    @Test
    fun reconnectsAfterALossWithGrowingPauses() {
        link.connect(garmin, "Forerunner 265", FingerAvailability.ON)
        upTo(garmin)
        assertEquals("connected", link.state)
        link.onDisconnected(garmin)
        assertEquals("connecting", link.state)
        assertEquals("the first loss: it looks again at once", 2, radio.count("startScan"))
        link.onScanResult(garmin, "Forerunner 265", null, -60)
        link.onDisconnected(garmin)
        assertEquals("the second failure in a row waits a second", 2, radio.count("startScan"))
        timer.advance(1_000)
        assertEquals(3, radio.count("startScan"))
        upTo(garmin)
        assertEquals("connected", link.state)
        link.onDisconnected(garmin)
        assertEquals("a working link resets the count", 4, radio.count("startScan"))
    }

    @Test
    fun aDeviceWithoutTheServiceOrNotificationsIsLetGo() {
        link.connect(garmin, null, FingerAvailability.ON)
        radio.hasHeartRate = false
        link.onScanResult(garmin, "Forerunner 265", null, -60)
        link.onConnected(garmin)
        link.onServicesDiscovered(true)
        assertEquals("connecting", link.state)
        assertTrue(radio.log.contains("disconnect"))
        radio.hasHeartRate = true
        radio.subscribes = FingerSubscribe.STARTED
        timer.advance(60_000)
        link.onScanResult(garmin, "Forerunner 265", null, -60)
        link.onConnected(garmin)
        link.onServicesDiscovered(true)
        timer.advance(AfferentWatchLink.SUBSCRIBE_TIMEOUT_MS)
        assertEquals("no answer to the notification request: start over", "connecting", link.state)
        assertFalse(heard.states.contains("connected"))
    }

    @Test
    fun aConnectionThatNeverComesIsGivenUp() {
        link.connect(garmin, null, FingerAvailability.ON)
        link.onScanResult(garmin, "Forerunner 265", null, -60)
        val disconnects = radio.count("disconnect")
        timer.advance(AfferentWatchLink.CONNECT_TIMEOUT_MS)
        assertEquals(disconnects + 1, radio.count("disconnect"))
        assertEquals("connecting", link.state)
    }

    @Test
    fun disconnectLetsGoAndForgets() {
        link.connect(garmin, "Forerunner 265", FingerAvailability.ON)
        upTo(garmin)
        link.disconnect()
        assertEquals("off", link.state)
        assertEquals(null, link.target)
        link.onValue(hrm, byteArrayOf(0x00, 60), 1)
        assertTrue(heard.readings.isEmpty())
        val starts = radio.count("startScan")
        timer.advance(60 * 60_000)
        assertEquals("nothing chosen: no scan comes back", starts, radio.count("startScan"))
    }

    @Test
    fun bluetoothOffAndPermissionAreStates() {
        link.connect(garmin, null, FingerAvailability.UNAUTHORIZED)
        assertEquals("unauthorized", link.state)
        assertFalse(radio.log.contains("startScan"))
        link.availabilityChanged(FingerAvailability.ON)
        assertEquals("connecting", link.state)
        upTo(garmin)
        link.availabilityChanged(FingerAvailability.OFF)
        assertEquals("off", link.state)
        assertEquals(garmin, link.target)
        link.availabilityChanged(FingerAvailability.ON)
        assertEquals("Bluetooth back: it looks for the chosen device again", "connecting", link.state)
    }

    @Test
    fun theBackgroundLetsGoAndTheForegroundComesBack() {
        link.connect(garmin, null, FingerAvailability.ON)
        upTo(garmin)
        link.background()
        timer.advance(AfferentWatchLink.BACKGROUND_GRACE_MS - 1)
        assertEquals("a short look at another app keeps the link", "connected", link.state)
        link.foreground(FingerAvailability.ON)
        timer.advance(10_000)
        assertEquals("connected", link.state)
        link.background()
        timer.advance(AfferentWatchLink.BACKGROUND_GRACE_MS)
        assertEquals("off", link.state)
        val starts = radio.count("startScan")
        link.foreground(FingerAvailability.ON)
        assertEquals("connecting", link.state)
        assertEquals(starts + 1, radio.count("startScan"))
    }
}
