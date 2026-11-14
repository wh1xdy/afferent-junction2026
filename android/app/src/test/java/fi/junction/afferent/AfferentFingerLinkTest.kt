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

    private fun answer(ok: Boolean) = answer(link, ok)

    private fun answer(to: AfferentFingerLink, ok: Boolean) {
        radio.pending = 0
        to.onSubscribed(ok)
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

    // ── found through Wendy Net's advertisement ──────────────────────────
    // While a Wendy Net peer holds a link through our "Afferent Finger" advertisement, that
    // advertisement is off the air and the board is heard only as "wendyos-uno-q" with Wendy
    // Net's service (seen on 2026-11-14).

    private val wendy = AfferentFingerParser.WENDY_BOARD_NAME

    @Test
    fun theBoardHeardOnlyThroughWendyNetIsConnectedAndTrustedWithAff0() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, wendy, null, wendyNet = true)
        assertEquals("connecting", link.state)
        assertEquals("connect $board", radio.log.last { it.startsWith("connect") })
        link.onConnected(board)
        assertEquals("still connecting until AFF0 is confirmed", "connecting", link.state)
        link.onServicesDiscovered(true)
        assertEquals("connected", link.state)
        assertEquals("it is reported under our name", name, link.name)
        answer(true)
        answer(true)
        link.onValue(aff1, golden, 7)
        assertEquals(listOf("aff1 71 0.62 active @7"), heard.readings)
    }

    @Test
    fun theWendyNameWithTheDevicesGapNameIsTheBoardToo() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, wendy, name, wendyNet = true)     // what a Mac saw
        assertEquals("connecting", link.state)
    }

    @Test
    fun anotherWendyUnoQWithoutAff0IsLeftAloneAndOursIsStillFound() {
        radio.services = setOf(AfferentFingerParser.HEART_RATE_SERVICE)    // no AFF0: not running the hub
        link.start(FingerAvailability.ON)
        link.onScanResult(strap, wendy, null, wendyNet = true)
        link.onConnected(strap)
        link.onServicesDiscovered(true)
        assertEquals("scanning", link.state)
        assertFalse("never reported as connected", heard.states.any { it.first == "connected" })
        timer.advance(20_000)
        link.onScanResult(strap, wendy, null, wendyNet = true)
        assertEquals("not connected again", 1, radio.count("connect $strap"))
        radio.services = setOf(AfferentFingerParser.HEART_RATE_SERVICE, AfferentFingerParser.AFFERENT_SERVICE)
        link.onScanResult(board, wendy, null, wendyNet = true)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        assertEquals("connected", link.state)
    }

    @Test
    fun noUnrelatedDeviceIsConnectedThroughTheWendyScan() {
        link.start(FingerAvailability.ON)
        link.onScanResult(strap, "wendyos-hackathon-device-12", null, wendyNet = true)   // the Jetson
        link.onScanResult(strap, null, null, wendyNet = true)
        link.onScanResult(strap, "wendyos-uno-q-2", null, wendyNet = true)
        link.onScanResult(strap, wendy, null, wendyNet = false)   // the name alone, no Wendy Net service
        link.onScanResult(strap, "Polar H10 8A3B2C1D", "Polar H10", wendyNet = true)
        assertEquals("scanning", link.state)
        assertEquals(0, radio.log.count { it.startsWith("connect") })
    }

    @Test
    fun aConnectedDeviceCountsOnlyWithOurName() {
        // Android lists connected devices without their services, so "wendyos-uno-q" alone is not enough
        radio.connected = listOf(FingerDevice(strap, wendy))
        link.start(FingerAvailability.ON)
        assertEquals("scanning", link.state)
        assertEquals(listOf("startScan"), radio.log)
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
    fun threeFailedDiscoveriesInARowAndTheDeviceIsLeftAloneForAMinute() {
        link.start(FingerAvailability.ON)
        repeat(3) {
            link.onScanResult(board, name, null)
            assertEquals("attempt ${it + 1}", "connecting", link.state)
            link.onConnected(board)
            link.onServicesDiscovered(false)
            timer.advance(10_000)
        }
        link.onScanResult(board, name, null)
        assertEquals("scanning", link.state)
        timer.advance(49_999)
        link.onScanResult(board, name, null)
        assertEquals("scanning", link.state)
        assertEquals(3, radio.count("connect $board"))
        timer.advance(1)
        link.onScanResult(board, name, null)
        assertEquals("the board is tried again without stop() or an app restart", "connecting", link.state)
    }

    @Test
    fun afterTheMinuteTheBoardGetsThreeNewAttempts() {
        link.start(FingerAvailability.ON)
        repeat(3) {
            link.onScanResult(board, name, null)
            link.onConnected(board)
            link.onServicesDiscovered(true)
            timer.advance(AfferentFingerLink.SUBSCRIBE_TIMEOUT_MS)   // at the edge of range: no answer
            timer.advance(20_000)
        }
        assertEquals(3, radio.count("connect $board"))
        timer.advance(60_000)
        repeat(2) {
            link.onScanResult(board, name, null)
            link.onConnected(board)
            link.onServicesDiscovered(false)
            timer.advance(20_000)
        }
        link.onScanResult(board, name, null)
        assertEquals("two failures after the pause are not three", "connecting", link.state)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        answer(true)
        answer(true)
        link.onValue(aff1, golden, 9)
        assertEquals(1, heard.readings.size)
    }

    @Test
    fun theRightNameWithoutAff0StaysIgnoredAfterTheMinute() {
        radio.services = setOf(AfferentFingerParser.HEART_RATE_SERVICE)
        link.start(FingerAvailability.ON)
        link.onScanResult(strap, name, null)
        link.onConnected(strap)
        link.onServicesDiscovered(true)
        timer.advance(10 * 60_000)
        link.onScanResult(strap, name, null)
        assertEquals("scanning", link.state)
        assertEquals(1, radio.count("connect $strap"))
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
        val budget = ScanBudget()
        repeat(4) { assertEquals(0, budget.take(it * 100L)) }
        assertEquals(29_700, budget.take(300))
        assertEquals(1, budget.take(29_999))
        assertEquals(0, budget.take(30_000))

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
    fun aScanThatFindsNothingIsStartedAgainEveryTwentyMinutes() {
        // Android turns a scan that has run for 30 minutes into one that hears little or nothing
        link.start(FingerAvailability.ON)
        timer.advance(20 * 60_000 - 1)
        assertEquals(1, radio.count("startScan"))
        timer.advance(1)
        assertEquals(listOf("startScan", "stopScan", "startScan"), radio.log)
        assertEquals("scanning", link.state)
        timer.advance(20 * 60_000)
        assertEquals(3, radio.count("startScan"))
        assertEquals("the state did not change, so nothing was reported", listOf("scanning" to null), heard.states)
        link.onScanResult(board, name, null)             // the board is switched on after an hour
        assertEquals("connecting", link.state)
    }

    @Test
    fun aConnectedLinkIsNotScannedAgain() {
        connect()
        timer.advance(2 * 60 * 60_000)
        assertEquals("connected", link.state)
        assertEquals(1, radio.count("startScan"))
    }

    @Test
    fun scanStartsElsewhereInTheAppCountAgainstTheSameBudget() {
        val app = ScanBudget()
        val shared = AfferentFingerLink(radio, timer, heard, app)
        repeat(3) { assertEquals("a scan of the presence plugin", 0, app.take(timer.now)) }
        shared.start(FingerAvailability.ON)
        assertEquals(1, radio.count("startScan"))
        shared.onScanFailed()                          // would look again at once
        assertEquals("the fifth start in 30 s has to wait", 1, radio.count("startScan"))
        assertEquals("scanning", shared.state)
        timer.advance(29_999)
        assertEquals(1, radio.count("startScan"))
        timer.advance(1)
        assertEquals(2, radio.count("startScan"))
    }

    @Test
    fun aFlappingLinkAndPresenceTogetherStayUnderTheLimit() {
        // the worst case of both plugins at once: the board drops after every reading while
        // the presence scan is started again and again (app switches, Bluetooth toggles)
        val app = ScanBudget()
        val shared = AfferentFingerLink(radio, timer, heard, app)
        val presenceStarts = ArrayList<Long>()
        shared.start(FingerAvailability.ON)
        repeat(900) {                                   // 90 s in 100 ms steps
            if (radio.scanning) {
                shared.onScanResult(board, name, null)
                shared.onConnected(board)
                shared.onServicesDiscovered(true)
                answer(shared, true)
                answer(shared, true)
                shared.onValue(aff1, golden, 1)
                shared.onDisconnected(board)
            }
            if (it % 7 == 0 && app.take(timer.now) == 0L) presenceStarts += timer.now
            timer.advance(100)
        }
        val starts = (radio.scanStartedAt + presenceStarts).sorted()
        assertTrue("the finger link keeps trying: ${radio.scanStartedAt}", radio.scanStartedAt.size >= 4)
        assertTrue("presence gets its turn: $presenceStarts", presenceStarts.size >= 2)
        for (t in starts) {
            val inWindow = starts.count { it >= t && it < t + 30_000 }
            assertTrue("$inWindow scan starts within 30 s of $t: $starts", inWindow <= 4)
        }
    }

    @Test
    fun thePluginsShareTheBudgetOfTheApp() {
        fun source(name: String) = listOf("src/main/java/fi/junction/afferent/$name", "app/src/main/java/fi/junction/afferent/$name")
            .map { java.io.File(it) }.first { it.exists() }.readText()
        assertTrue(source("AfferentFingerPlugin.kt").contains("AfferentFingerLink(radio, Timer(), Events(), ScanBudget.app)"))
        assertTrue(source("AfferentPresencePlugin.kt").contains("private val budget = ScanBudget.app"))
        assertEquals("one below Android's five", 0, ScanBudget().let { b -> repeat(3) { b.take(0) }; b.take(0) })
        assertTrue(ScanBudget().let { b -> repeat(4) { b.take(0) }; b.take(0) } > 0)
    }

    // ── the app in the background ────────────────────────────────────────

    @Test
    fun inTheBackgroundTheConnectionIsReleasedAfterTheGracePeriod() {
        connect()
        link.onValue(aff1, golden, 1)
        link.background()
        timer.advance(AfferentFingerLink.BACKGROUND_GRACE_MS - 1)
        assertEquals("connected", link.state)
        assertEquals(board, radio.link)
        timer.advance(1)
        assertEquals("off" to null, heard.states.last())
        assertEquals("disconnect", radio.log.last())
        assertNull("the board is free for another phone", radio.link)
        link.onValue(aff1, golden, 2)
        link.onDisconnected(board)
        link.onScanResult(board, name, null)
        link.availabilityChanged(FingerAvailability.ON)   // Bluetooth toggled while away
        timer.advance(2 * 60 * 60_000)
        assertEquals("off", link.state)
        assertEquals("nothing scans in the background", 1, radio.count("startScan"))
        assertEquals(1, heard.readings.size)
    }

    @Test
    fun inTheBackgroundTheScanIsStopped() {
        link.start(FingerAvailability.ON)
        link.background()
        timer.advance(AfferentFingerLink.BACKGROUND_GRACE_MS)
        assertEquals(listOf("startScan", "stopScan"), radio.log)
        assertFalse(radio.scanning)
        assertEquals("off", link.state)
        timer.advance(2 * 60 * 60_000)
        assertEquals(listOf("startScan", "stopScan"), radio.log)
    }

    @Test
    fun backInTheAppItLooksForTheBoardAgain() {
        connect()
        link.background()
        timer.advance(60_000)
        link.start(FingerAvailability.ON)              // handleOnResume
        assertEquals("scanning" to null, heard.states.last())
        assertEquals(2, radio.count("startScan"))
        link.onScanResult(board, name, null)
        link.onConnected(board)
        link.onServicesDiscovered(true)
        answer(true)
        answer(true)
        link.onValue(aff1, golden, 5)
        assertEquals("connected", link.state)
        assertEquals(1, heard.readings.size)
        timer.advance(60_000)
        assertEquals("the old grace period does not end the new link", "connected", link.state)
    }

    @Test
    fun aShortLookAtAnotherAppKeepsTheLink() {
        connect()
        val before = radio.log.size
        link.background()                              // e.g. a permission dialog
        timer.advance(AfferentFingerLink.BACKGROUND_GRACE_MS - 1)
        link.start(FingerAvailability.ON)
        timer.advance(60_000)
        assertEquals("connected", link.state)
        assertEquals(before, radio.log.size)
        link.onValue(aff1, golden, 7)
        assertEquals(1, heard.readings.size)
    }

    @Test
    fun aConnectionAttemptInTheBackgroundIsGivenUpToo() {
        link.start(FingerAvailability.ON)
        link.onScanResult(board, name, null)
        link.background()
        timer.advance(AfferentFingerLink.BACKGROUND_GRACE_MS)
        assertEquals("off", link.state)
        assertNull(radio.link)
        timer.advance(60_000)
        assertEquals("the connect timeout does not start a scan", 1, radio.count("startScan"))
    }

    @Test
    fun backgroundKeepsWhatIsKnownAboutOtherDevices() {
        radio.services = setOf(AfferentFingerParser.HEART_RATE_SERVICE)
        link.start(FingerAvailability.ON)
        link.onScanResult(strap, name, null)
        link.onConnected(strap)
        link.onServicesDiscovered(true)                // not our board
        link.background()
        timer.advance(60_000)
        link.start(FingerAvailability.ON)
        link.onScanResult(strap, name, null)
        assertEquals("scanning", link.state)
        assertEquals(1, radio.count("connect $strap"))
    }

    @Test
    fun backgroundBeforeStartOrAfterStopDoesNothing() {
        link.background()
        timer.advance(60_000)
        assertTrue(heard.states.isEmpty())
        connect()
        link.background()
        link.stop()
        val states = heard.states.size
        timer.advance(60_000)
        assertEquals(states, heard.states.size)
        link.start(FingerAvailability.ON)
        timer.advance(60_000)
        assertEquals("a pause asked for before stop() does not hit the next start", "scanning", link.state)
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
