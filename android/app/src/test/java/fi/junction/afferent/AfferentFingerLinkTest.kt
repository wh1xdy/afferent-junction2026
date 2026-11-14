package fi.junction.afferent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * The connection rules of the finger sensor, run against a fake radio and a fake clock.
 * No phone and no Bluetooth are involved: this proves the order of the steps and the states
 * the web layer sees, not that Android's Bluetooth stack behaves as the fake does.
 */
class AfferentFingerLinkTest {
    private val board = "AA:BB:CC:DD:EE:01"
    private val strap = "AA:BB:CC:DD:EE:02"
    private val name = AfferentFingerParser.DEVICE_NAME
    private val hrm = AfferentFingerParser.HEART_RATE_MEASUREMENT
    private val aff1 = AfferentFingerParser.FINGER_VALUES
    private val golden = byteArrayOf(0x47, 0x49, 0x06, 0x2E, 0x3E, 0x03)

    private class FakeRadio(private val timer: FakeTimer) : FingerRadio {
        val log = ArrayList<String>()
        val scanStartedAt = ArrayList<Long>()
        var connected = listOf<FingerDevice>()
        var scanStarts = true
        var connects = true
        var discovers = true
        var services = setOf(AfferentFingerParser.HEART_RATE_SERVICE, AfferentFingerParser.AFFERENT_SERVICE)
        var absent = setOf<UUID>()
        var subscribes = true
        var scanning = false
        var link: String? = null
        var pending = 0                      // notification requests without an answer

        override fun connectedDevices(): List<FingerDevice> = connected
        override fun startScan(): Boolean {
            log += "startScan"
            scanStartedAt += timer.now
            scanning = scanStarts
            return scanStarts
        }
        override fun stopScan() { log += "stopScan"; scanning = false }
        override fun connect(address: String): Boolean {
            log += "connect $address"
            if (connects) link = address
            return connects
        }
        override fun disconnect() { log += "disconnect"; link = null; pending = 0 }
        override fun discoverServices(): Boolean { log += "discover"; return discovers }
        override fun hasService(service: UUID): Boolean = service in services
        override fun subscribe(service: UUID, characteristic: UUID): FingerSubscribe {
            if (characteristic in absent) return FingerSubscribe.ABSENT
            check(pending == 0) { "a second request while one is under way: Android would drop it" }
            log += "subscribe ${characteristic.toString().substring(4, 8)}"
            if (!subscribes) return FingerSubscribe.FAILED
            pending++
            return FingerSubscribe.STARTED
        }
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

    private class Heard : FingerLinkListener {
        val states = ArrayList<Pair<String, String?>>()
        val readings = ArrayList<String>()
        override fun state(state: String, name: String?) { states += state to name }
        override fun hrm(bpm: Int, tMs: Long) { readings += "hrm $bpm @$tMs" }
        override fun aff1(reading: FingerAff1, tMs: Long) { readings += "aff1 ${reading.finger1} ${reading.quality} ${reading.presence} @$tMs" }
    }

    private val timer = FakeTimer()
    private val radio = FakeRadio(timer)
    private val heard = Heard()
    private val link = AfferentFingerLink(radio, timer, heard)

    /** start, find the board, connect, discover, both notification requests answered */
    private fun connect() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        answer(true)
        answer(true)
    }

    private fun answer(ok: Boolean) {
        radio.pending = 0
        link.onSubscribed(ok)
    }

    // ── the normal path ──────────────────────────────────────────────────

    @Test
    fun scansConnectsAndSubscribesOneAfterTheOther() {
        assertEquals("off", link.state)
        link.start(FingerAvailability.ON)
        assertEquals(listOf("startScan"), radio.log)
        link.onScanResult(board, name, null)
        assertEquals("connecting", link.state)
        link.onConnected(board)
        assertEquals("still connecting until AFF0 is confirmed", "connecting", link.state)
        link.onServicesDiscovered(true)
        assertEquals("connected", link.state)
        assertEquals("only the first request is out", listOf("startScan", "stopScan", "connect $board", "discover", "subscribe 2a37"), radio.log)
        answer(true)
        assertEquals("subscribe aff1", radio.log.last())
        answer(true)
        assertEquals(
            listOf("scanning" to null, "connecting" to name, "connected" to name),
            heard.states
        )
        assertEquals(name, link.name)
        timer.advance(60_000)
        assertEquals("no timer fires on a working link", "connected", link.state)
        assertEquals(1, radio.count("startScan"))
    }

    @Test
    fun readingsCarryWhatTheBoardSentAndWhenItArrived() {
        connect()
        link.onValue(aff1, golden, 1_700_000_000_123)
        link.onValue(hrm, byteArrayOf(0x00, 0x48), 1_700_000_000_500)
        assertEquals(listOf("aff1 71 0.62 active @1700000000123", "hrm 72 @1700000000500"), heard.readings)
    }

    @Test
    fun noReadingIsNotAReading() {
        connect()
        link.onValue(hrm, byteArrayOf(0x00, 0x00), 1)                 // 0 = no pulse
        link.onValue(hrm, null, 2)
        link.onValue(aff1, byteArrayOf(0x47), 3)                      // too short
        link.onValue(AfferentFingerParser.uuid16(0x2A38), byteArrayOf(3), 4)   // another characteristic
        assertTrue(heard.readings.isEmpty())
    }

    @Test
    fun aValueBeforeTheLinkIsConnectedIsDropped() {
        link.start(FingerAvailability.ON)
        link.onValue(aff1, golden, 1)
        link.onScanResult(board, name, null)
        link.onValue(aff1, golden, 2)
        assertTrue(heard.readings.isEmpty())
    }

    @Test
    fun theStoredValueIsNeverAskedFor() {
        // FingerRadio has no read operation at all: every reading is a notification.
        assertFalse(FingerRadio::class.java.methods.any { it.name.contains("read", ignoreCase = true) })
    }

    // ── which device ─────────────────────────────────────────────────────

    @Test
    fun aStrangersHeartRateStrapIsNeverConnected() {
        link.start(FingerAvailability.ON)
        link.onScanResult(strap, "Polar H10 8A3B2C1D", "Polar H10")
        link.onScanResult(strap, null, null)
        link.onScanResult(strap, "afferent finger", null)
        assertEquals("scanning", link.state)
        assertEquals(0, radio.log.count { it.startsWith("connect") })
    }

    @Test
    fun theNameMayComeFromTheAdvertisementOrTheDevice() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, null, name)
        assertEquals("connecting", link.state)
    }

    @Test
    fun theRightNameWithoutAff0IsNotOurBoardAndIsIgnored() {
        radio.services = setOf(AfferentFingerParser.HEART_RATE_SERVICE)
        link.start(FingerAvailability.ON)
        link.onScanResult(strap, name, null)
        link.onConnected(strap)
        link.onServicesDiscovered(true)
        assertEquals("scanning", link.state)
        assertFalse("never reported as connected", heard.states.any { it.first == "connected" })
        assertEquals("disconnect", radio.log[radio.log.size - 2])
        timer.advance(20_000)
        link.onScanResult(strap, name, null)
        assertEquals("scanning", link.state)
        assertEquals(1, radio.count("connect $strap"))
        link.onScanResult(board, name, null)
        assertEquals("the real board is still taken", "connecting", link.state)
    }

    @Test
    fun aBoardAlreadyConnectedToThePhoneIsFoundWithoutAScan() {
        radio.connected = listOf(FingerDevice(strap, "Polar H10"), FingerDevice(board, name))
        link.start(FingerAvailability.ON)
        assertEquals("connecting", link.state)
        assertEquals(listOf("connect $board"), radio.log)
    }

    @Test
    fun onlyOneDeviceAtATime() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onScanResult("AA:BB:CC:DD:EE:03", name, null)
        assertEquals(1, radio.log.count { it.startsWith("connect") })
    }

    // ── Bluetooth off, not allowed, not there ────────────────────────────

    @Test
    fun theSameStatesAsIosWhenBluetoothCannotBeUsed() {
        link.start(FingerAvailability.UNSUPPORTED)
        assertEquals("unsupported", link.state)
        link.stop()
        link.start(FingerAvailability.UNAUTHORIZED)
        assertEquals("unauthorized", link.state)
        link.stop()
        link.start(FingerAvailability.OFF)
        assertEquals("off", link.state)
        assertEquals(
            listOf("unsupported" to null, "off" to null, "unauthorized" to null, "off" to null),
            heard.states
        )
        assertTrue("the radio is not touched", radio.log.isEmpty())
    }

    @Test
    fun allowingItLaterStartsTheScan() {
        link.start(FingerAvailability.UNAUTHORIZED)
        link.start(FingerAvailability.ON)             // start() again, or back from Settings
        assertEquals("scanning", link.state)
        assertEquals(listOf("startScan"), radio.log)
    }

    @Test
    fun switchingBluetoothOffAndOnAgain() {
        connect()
        link.availabilityChanged(FingerAvailability.OFF)
        assertEquals("off" to null, heard.states.last())
        assertNull(radio.link)
        link.onValue(aff1, golden, 1)
        assertTrue("nothing counts while Bluetooth is off", heard.readings.isEmpty())
        timer.advance(60_000)
        assertEquals("off", link.state)
        link.availabilityChanged(FingerAvailability.ON)
        assertEquals("scanning", link.state)
        assertEquals(2, radio.count("startScan"))
    }

    @Test
    fun bluetoothOffWhileConnectingCancelsTheTimeout() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.availabilityChanged(FingerAvailability.OFF)
        timer.advance(60_000)
        assertEquals("off", link.state)
        assertEquals(1, radio.count("startScan"))
    }

    @Test
    fun startingTwiceDoesNotRestartAnything() {
        connect()
        val before = radio.log.size
        link.start(FingerAvailability.ON)
        link.availabilityChanged(FingerAvailability.ON)
        assertEquals("connected", link.state)
        assertEquals(before, radio.log.size)
    }

    @Test
    fun nothingHappensBeforeStart() {
        link.availabilityChanged(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        assertEquals("off", link.state)
        assertTrue(radio.log.isEmpty())
        assertTrue(heard.states.isEmpty())
    }

    // ── stop ─────────────────────────────────────────────────────────────

    @Test
    fun stopReleasesEverythingAndStaysQuiet() {
        connect()
        link.stop()
        assertEquals("off" to null, heard.states.last())
        assertEquals("disconnect", radio.log.last())
        assertNull(radio.link)
        link.onValue(aff1, golden, 1)
        link.onDisconnected(board)
        link.onScanResult(board, name, null)
        timer.advance(60_000)
        assertEquals("off", link.state)
        assertTrue(heard.readings.isEmpty())
        assertEquals(1, radio.count("startScan"))
    }

    @Test
    fun stopWhileScanningStopsTheScan() {
        link.start(FingerAvailability.ON)
        link.stop()
        assertEquals(listOf("startScan", "stopScan"), radio.log)
        assertFalse(radio.scanning)
    }

    @Test
    fun stopForgetsIgnoredDevices() {
        radio.services = setOf(AfferentFingerParser.HEART_RATE_SERVICE)
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)               // ignored: no AFF0 (e.g. old firmware)
        link.stop()
        radio.services = setOf(AfferentFingerParser.HEART_RATE_SERVICE, AfferentFingerParser.AFFERENT_SERVICE)
        timer.advance(40_000)
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        assertEquals("connecting", link.state)
    }

    // ── losing the link ──────────────────────────────────────────────────

    @Test
    fun aDroppedLinkGoesBackToScanningAtOnce() {
        connect()
        link.onValue(aff1, golden, 1)
        link.onDisconnected(board)
        assertEquals("scanning" to null, heard.states.last())
        assertEquals("the first look is immediate", 2, radio.count("startScan"))
        assertTrue(radio.scanning)
        assertNull(radio.link)
    }

    @Test
    fun repeatedDropsWaitLongerEachTime() {
        assertEquals(listOf(0L, 0L, 1_000L, 2_000L, 4_000L, 8_000L, 15_000L, 15_000L), (0..7).map { FingerRetry.delayMs(it) })
        link.start(FingerAvailability.ON)
        fun failToConnect() {
            link.onScanResult(board, name, null)
            link.onDisconnected(board)                 // the attempt failed
        }
        failToConnect()
        assertEquals(2, radio.count("startScan"))
        failToConnect()
        assertEquals("the second failure waits", 2, radio.count("startScan"))
        assertEquals("scanning", link.state)
        timer.advance(999)
        assertEquals(2, radio.count("startScan"))
        timer.advance(1)
        assertEquals(3, radio.count("startScan"))
        failToConnect()
        timer.advance(1_999)
        assertEquals(3, radio.count("startScan"))
        timer.advance(1)
        assertEquals(4, radio.count("startScan"))
    }

    @Test
    fun aReadingResetsTheWait() {
        link.start(FingerAvailability.ON)
        repeat(2) {
            link.onScanResult(board, name, null)
            link.onDisconnected(board)
        }
        timer.advance(1_000)
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        answer(true)
        answer(true)
        link.onValue(aff1, golden, 1)
        val scans = radio.count("startScan")
        link.onDisconnected(board)
        assertEquals("immediate again after a working link", scans + 1, radio.count("startScan"))
    }

    @Test
    fun aConnectionThatNeverCompletesIsGivenUpAfterTenSeconds() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        timer.advance(9_999)
        assertEquals("connecting", link.state)
        timer.advance(1)
        assertEquals("scanning", link.state)
        assertEquals("disconnect", radio.log[radio.log.size - 2])
        assertEquals(2, radio.count("startScan"))
    }

    @Test
    fun theTimeoutAlsoCoversServiceDiscovery() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        timer.advance(5_000)
        link.onConnected(board)
        timer.advance(5_000)
        assertEquals("scanning", link.state)
    }

    @Test
    fun aStaleDisconnectOfAnotherDeviceIsIgnored() {
        connect()
        link.onDisconnected(strap)
        assertEquals("connected", link.state)
    }

    // ── setting up the connection fails ──────────────────────────────────

    @Test
    fun threeFailedDiscoveriesInARowAndTheDeviceIsLeftAlone() {
        link.start(FingerAvailability.ON)
        repeat(3) {
            link.onScanResult(board, name, null)
            assertEquals("attempt ${it + 1}", "connecting", link.state)
            link.onConnected(board)
            link.onServicesDiscovered(false)
            timer.advance(40_000)
        }
        link.onScanResult(board, name, null)
        assertEquals("scanning", link.state)
        assertEquals(3, radio.count("connect $board"))
    }

    @Test
    fun aSuccessfulSetupClearsEarlierFailures() {
        link.start(FingerAvailability.ON)
        repeat(2) {
            link.onScanResult(board, name, null)
            link.onConnected(board)
            link.onServicesDiscovered(false)
            timer.advance(40_000)
        }
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        answer(true)
        answer(true)
        link.onDisconnected(board)
        timer.advance(40_000)
        repeat(2) {
            link.onScanResult(board, name, null)
            link.onConnected(board)
            link.onServicesDiscovered(false)
            timer.advance(40_000)
        }
        link.onScanResult(board, name, null)
        assertEquals("two new failures are not three", "connecting", link.state)
    }

    @Test
    fun aRefusedNotificationRequestStartsOver() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        answer(false)
        assertEquals("scanning" to null, heard.states.last())
        assertNull(radio.link)
        assertEquals("the second request is never made", 0, radio.count("subscribe aff1"))
    }

    @Test
    fun anUnansweredNotificationRequestStartsOverAfterFiveSeconds() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        timer.advance(4_999)
        assertEquals("connected", link.state)
        timer.advance(1)
        assertEquals("scanning", link.state)
    }

    @Test
    fun aRequestThatCannotBeMadeStartsOver() {
        radio.subscribes = false
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        assertEquals("scanning", link.state)
    }

    @Test
    fun aMissingCharacteristicIsSkipped() {
        radio.absent = setOf(hrm)
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        assertEquals("subscribe aff1", radio.log.last())
        answer(true)
        timer.advance(60_000)
        assertEquals("connected", link.state)
        link.onValue(aff1, golden, 5)
        assertEquals(1, heard.readings.size)
    }

    @Test
    fun aStrayAnswerDoesNothing() {
        connect()
        val before = radio.log.size
        link.onSubscribed(true)
        link.onSubscribed(false)
        link.onServicesDiscovered(true)
        link.onConnected(board)
        assertEquals("connected", link.state)
        assertEquals(before, radio.log.size)
    }

    @Test
    fun discoveryThatCannotStartCountsAsAFailure() {
        radio.discovers = false
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onConnected(board)
        assertEquals("scanning", link.state)
        assertNull(radio.link)
    }

    // ── scanning ─────────────────────────────────────────────────────────

    @Test
    fun aScanThatCannotStartIsRetriedWithGrowingPauses() {
        radio.scanStarts = false
        link.start(FingerAvailability.ON)
        assertEquals("scanning", link.state)
        assertEquals("one immediate retry, then a pause", 2, radio.count("startScan"))
        timer.advance(1_000)
        assertEquals(3, radio.count("startScan"))
        radio.scanStarts = true
        timer.advance(2_000)
        assertEquals(4, radio.count("startScan"))
        assertTrue(radio.scanning)
        timer.advance(60_000)
        assertEquals("a running scan is left alone", 4, radio.count("startScan"))
    }

    @Test
    fun aScanTheSystemStoppedIsStartedAgain() {
        link.start(FingerAvailability.ON)
        link.onScanFailed()
        assertEquals("scanning", link.state)
        assertEquals(2, radio.count("startScan"))
        assertEquals("the failed scan is not stopped a second time", 0, radio.count("stopScan"))
    }

    @Test
    fun neverMoreThanFourScanStartsInThirtySeconds() {
        // Android silently stops delivering results to an app that starts more than 5 in 30 s
        val limiter = ScanStartLimiter()
        repeat(4) { assertEquals(0, limiter.waitMs(it * 100L)); limiter.started(it * 100L) }
        assertEquals(29_700, limiter.waitMs(300))
        assertEquals(1, limiter.waitMs(29_999))
        assertEquals(0, limiter.waitMs(30_000))

        // the whole link: a board that drops right after every reading (no pause between tries)
        link.start(FingerAvailability.ON)
        repeat(600) {                                   // one minute in 100 ms steps
            if (radio.scanning) {
                link.onScanResult(board, name, null)
                link.onConnected(board)
                link.onServicesDiscovered(true)
                answer(true)
                answer(true)
                link.onValue(aff1, golden, 1)
                link.onDisconnected(board)
            }
            timer.advance(100)
        }
        val starts = radio.scanStartedAt
        assertTrue("it keeps trying: $starts", starts.size >= 8)
        for (t in starts) {
            val inWindow = starts.count { it >= t && it < t + 30_000 }
            assertTrue("$inWindow scan starts within 30 s of $t: $starts", inWindow <= 4)
        }
    }

    @Test
    fun aResultAfterTheScanStoppedIsIgnored() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.onDisconnected(board)                     // failure 1: scanning again at once
        link.onScanResult(board, name, null)
        link.onDisconnected(board)                     // failure 2: waiting, no scan running
        link.onScanResult(board, name, null)           // a late result of the stopped scan
        assertEquals("scanning", link.state)
        assertEquals(2, radio.log.count { it.startsWith("connect") })
    }
}
