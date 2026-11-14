package fi.junction.afferent

import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * The Android-free half of the AfferentPresence plugin, checked on the build machine. What
 * these tests cannot show: that a real phone delivers scan results, Wi-Fi changes and Bonjour
 * answers to the plugin at all.
 */
class AfferentPresenceCoreTest {

    private fun bytes(hex: String): ByteArray =
        hex.filter { !it.isWhitespace() }.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    private fun ad(hex: String) = PresenceAdvert.parse(bytes(hex))

    private fun keys(o: JSONObject): Set<String> = o.keys().asSequence().toSet()

    // ── the JS contract ───────────────────────────────────────────────────

    @Test
    fun pluginHasTheIosNameAndMethods() {
        val cls = AfferentPresencePlugin::class.java
        assertEquals("AfferentPresence", cls.getAnnotation(CapacitorPlugin::class.java)!!.name)
        val methods = cls.declaredMethods.filter { it.isAnnotationPresent(PluginMethod::class.java) }.map { it.name }
        assertEquals(setOf("start", "stop", "drain"), methods.toSet())
        // start() names this callback in a string.
        val callbacks = cls.declaredMethods.filter { it.isAnnotationPresent(PermissionCallback::class.java) }.map { it.name }
        assertEquals(listOf("permissionsAnswered"), callbacks)
    }

    @Test
    fun statusHasExactlyTheKeysOfTheSwiftPlugin() {
        val s = PresenceStatus("poweredOn", "allowedAlways", true, true, false, "off", listOf("aa11", "bb22"), 1763110800.25).toJson()
        val json = JSONObject(s.toString())
        assertEquals(
            setOf("bluetooth", "authorization", "scanning", "foreground", "wifi", "lan", "lanDevices", "t"),
            keys(json),
        )
        assertEquals("poweredOn", json.getString("bluetooth"))
        assertEquals(true, json.getBoolean("scanning"))
        assertEquals(false, json.getBoolean("wifi"))
        assertEquals("bb22", json.getJSONArray("lanDevices").getString(1))
        assertEquals(1763110800.25, json.getDouble("t"), 0.0)
    }

    @Test
    fun drainHasTheShapePresenceJsReads() {
        val book = PresenceBook()
        book.observe("C0:FF:EE:00:00:01", -61, 100.0, ad("0201 06 0303 0D18 1009 416666 6572656E74 2046696E676572"))
        book.observe("C0:FF:EE:00:00:01", -60, 104.5, ad("0201 06"))
        book.observe("A1:A1:A1:A1:00:02", -50, 101.0, ad("0201 1A 0AFF 4C00 1005 0118 ABCDEF"))
        val status = PresenceStatus("poweredOn", "allowedAlways", true, true, true, "ready", emptyList(), 105.0).toJson()
        val json = JSONObject(book.drain().toJson(status).toString())

        assertEquals(setOf("devices", "dropped", "status"), keys(json))
        assertEquals(0, json.getInt("dropped"))
        assertEquals("ready", json.getJSONObject("status").getString("lan"))

        val unit = json.getJSONArray("devices").getJSONObject(0)
        assertEquals(setOf("id", "first", "last", "rssi", "uuids", "name"), keys(unit))   // no mfg key
        assertEquals("c0:ff:ee:00:00:01", unit.getString("id"))
        assertEquals("Afferent Finger", unit.getString("name"))
        assertEquals(100.0, unit.getDouble("first"), 0.0)
        assertEquals(104.5, unit.getDouble("last"), 0.0)
        assertEquals("[-61,-60]", unit.getJSONArray("rssi").toString())
        assertEquals("[\"180D\"]", unit.getJSONArray("uuids").toString())

        val phone = json.getJSONArray("devices").getJSONObject(1)
        assertEquals(setOf("id", "first", "last", "rssi", "uuids", "mfg"), keys(phone))   // no name key
        assertEquals("4c0010050118abcdef", phone.getString("mfg"))
        assertEquals(0, phone.getJSONArray("uuids").length())
    }

    // ── adverts ───────────────────────────────────────────────────────────

    @Test
    fun bedsideUnitAdvertWithScanResponse() {
        // Flags, 16-bit list [180D], complete name; then (scan response) the 128-bit AFF0, zero padding.
        val p = ad(
            "0201 06  0303 0D18  1009 416666 6572656E74 2046696E676572" +
                "1107 FB349B5F 8000 0080 0010 0000 F0AF0000  0000 0000",
        )
        assertEquals("Afferent Finger", p.name)
        assertNull(p.mfg)
        assertEquals(listOf("180D", "0000AFF0-0000-1000-8000-00805F9B34FB"), p.uuids)
        // presence-core.js uuidPrefix(): 4 characters get "0000" in front, longer ones are cut to 8.
        assertEquals("0000aff0", p.uuids[1].lowercase().take(8))
    }

    @Test
    fun manufacturerDataIsCompanyIdLittleEndianThenPayloadInLowerHex() {
        // Apple (0x004C) Nearby Info, the advert an iPhone sends: classify() reads byte 0 = 0x10.
        assertEquals("4c0010050118abcdef", ad("0201 1A 0AFF 4C00 1005 0118 ABCDEF").mfg)
        // Samsung (0x0075 = 117).
        assertEquals("75004204", ad("05FF 7500 4204").mfg)
        // Company id only is still two bytes; one byte is not manufacturer data.
        assertEquals("e000", ad("03FF E000").mfg)
        assertNull(ad("02FF E0").mfg)
        // Two manufacturer fields: the first one, as CoreBluetooth reports a single field.
        assertEquals("4c001005", ad("05FF 4C00 1005  05FF 0600 0109").mfg)
    }

    @Test
    fun serviceUuidsOfAllWidthsAndServiceData() {
        val p = ad(
            "0502 F3FE 9FFE" +                 // incomplete 16-bit list: FEF3, FE9F
                "0505 78563412" +              // complete 32-bit list: 12345678
                "0516 2CFE 0102" +             // service data, 16-bit UUID FE2C
                "0720 EFBEADDE 0102" +         // service data, 32-bit UUID DEADBEEF
                "1221 FB349B5F 8000 0080 0010 0000 F1AF0000 07", // service data, 128-bit
        )
        assertEquals(
            listOf("FEF3", "FE9F", "12345678", "FE2C", "DEADBEEF", "0000AFF1-0000-1000-8000-00805F9B34FB"),
            p.uuids,
        )
        // Listed twice (list + service data): once.
        assertEquals(listOf("FE2C"), ad("0303 2CFE 0316 2CFE").uuids)
        // Solicitation lists (0x14) are not advertised services.
        assertEquals(emptyList<String>(), ad("0314 0D18").uuids)
    }

    @Test
    fun localNamePrefersTheCompleteOneAndReadsUtf8() {
        assertEquals("Köket", ad("0708 4BC3B66B6574").name)
        assertEquals("Afferent Finger", ad("0408 416666  1009 416666 6572656E74 2046696E676572").name)
        assertEquals("Afferent Finger", ad("1009 416666 6572656E74 2046696E676572  0408 416666").name)
        assertNull(ad("0109").name)   // empty name
    }

    @Test
    fun brokenRecordsNeverThrow() {
        assertNull(PresenceAdvert.parse(null).name)
        assertEquals(0, PresenceAdvert.parse(ByteArray(0)).uuids.size)
        // A structure that claims more bytes than there are: dropped, what came before is kept.
        val p = ad("0303 0D18  09FF 4C00")
        assertEquals(listOf("180D"), p.uuids)
        assertNull(p.mfg)
        // Length byte as the very last byte.
        assertEquals(listOf("180D"), ad("0303 0D18 05").uuids)
        // Odd tail in a UUID list is ignored.
        assertEquals(listOf("180D"), ad("0403 0D18 FF").uuids)
        // Zero length ends the record: nothing after it is read.
        assertEquals(emptyList<String>(), ad("00 0303 0D18").uuids)
    }

    // ── the per-device batch ──────────────────────────────────────────────

    @Test
    fun bookKeepsTheLastRssiValuesAndForgetsOnDrain() {
        val book = PresenceBook(maxDevices = 3000, rssiKept = 20)
        val none = ad("")
        for (i in 0 until 25) book.observe("AA:BB:CC:DD:EE:FF", -40 - i, 10.0 + i, none)
        book.observe("AA:BB:CC:DD:EE:FF", 127, 99.0, none)   // "RSSI not available"
        book.observe("AA:BB:CC:DD:EE:FF", 0, 99.0, none)
        val d = book.drain()
        assertEquals(1, d.devices.size)
        val h = d.devices[0]
        assertEquals(10.0, h.first, 0.0)
        assertEquals(34.0, h.last, 0.0)
        assertEquals((5 until 25).map { -40 - it }, h.rssi.toList())
        assertEquals(0, book.drain().devices.size)
    }

    @Test
    fun bookRemembersNameMfgAndUuidsAcrossAdverts() {
        val book = PresenceBook()
        book.observe("x", -50, 1.0, ad("0303 0D18"))
        book.observe("x", -50, 2.0, ad("0409 416666  05FF 4C00 1005"))
        book.observe("x", -50, 3.0, ad("0303 F0AF"))
        book.observe("x", -50, 4.0, ad("05FF 4C00 0C0E"))   // a newer manufacturer field replaces the old
        val h = book.drain().devices.single()
        assertEquals("Aff", h.name)
        assertEquals("4c000c0e", h.mfg)
        assertEquals(listOf("180D", "AFF0"), h.uuids.toList())
    }

    @Test
    fun bookCountsWhatItDropsWhenFull() {
        val book = PresenceBook(maxDevices = 2)
        val none = ad("")
        book.observe("a", -50, 1.0, none)
        book.observe("b", -50, 1.0, none)
        book.observe("c", -50, 1.0, none)
        book.observe("c", -50, 2.0, none)
        book.observe("a", -51, 3.0, none)   // a known device is still updated
        val d = book.drain()
        assertEquals(listOf("a", "b"), d.devices.map { it.id })
        assertEquals(2, d.dropped)
        assertEquals(listOf(-50, -51), d.devices[0].rssi.toList())
        assertEquals(0, book.drain().dropped)
        book.observe("c", -50, 4.0, none)
        book.clear()
        assertEquals(0, book.drain().devices.size)
    }

    // ── permissions and state words ───────────────────────────────────────

    @Test
    fun scanPlanPerAndroidVersion() {
        val s = PresenceRules.SCAN
        val f = PresenceRules.FINE
        val c = PresenceRules.COARSE
        for (sdk in listOf(24, 28, 29, 30)) for (flag in listOf(false, true)) {
            val p = PresenceRules.scanPlan(sdk, flag)
            assertEquals(listOf(f), p.mustHave)
            assertEquals(listOf(f), p.ask)
            assertTrue(p.needsLocationOn)
        }
        for (sdk in listOf(31, 33, 36)) {
            val lean = PresenceRules.scanPlan(sdk, neverForLocation = true)
            assertEquals(listOf(s), lean.mustHave)
            assertEquals(listOf(s), lean.ask)
            assertFalse(lean.needsLocationOn)
            val full = PresenceRules.scanPlan(sdk, neverForLocation = false)
            assertEquals(listOf(s, f), full.mustHave)
            assertEquals(listOf(s, c, f), full.ask)   // fine alone is ignored by Android 12+
            assertTrue(full.needsLocationOn)
        }
    }

    @Test
    fun authorizationWords() {
        val a = PresenceRules::authorization
        assertEquals("allowedAlways", a(true, true, false, false))
        assertEquals("allowedAlways", a(true, true, true, false))    // refused earlier, granted now
        assertEquals("notDetermined", a(false, true, false, false))
        assertEquals("denied", a(false, true, true, false))
        assertEquals("restricted", a(false, false, false, false))    // not in the manifest
        assertEquals("restricted", a(false, false, true, false))
        assertEquals("restricted", a(true, true, false, true))       // Location switch off
        assertEquals("denied", a(false, true, true, true))
    }

    @Test
    fun bluetoothWords() {
        val b = PresenceRules::bluetooth
        assertEquals("off", b(false, true, "allowedAlways", 12))
        assertEquals("unsupported", b(true, false, "allowedAlways", -1))
        assertEquals("poweredOn", b(true, true, "allowedAlways", 12))
        assertEquals("poweredOff", b(true, true, "allowedAlways", 10))
        assertEquals("resetting", b(true, true, "allowedAlways", 11))
        assertEquals("resetting", b(true, true, "allowedAlways", 13))
        assertEquals("unknown", b(true, true, "allowedAlways", -1))
        assertEquals("unknown", b(true, true, "notDetermined", 12))
        assertEquals("unauthorized", b(true, true, "denied", 12))
        assertEquals("unauthorized", b(true, true, "restricted", 12))
    }

    @Test
    fun scanBudgetStaysUnderAndroidsFiveStartsIn30Seconds() {
        val budget = ScanBudget(max = 3, windowMs = 30_000)
        assertEquals(0, budget.take(1_000))
        assertEquals(0, budget.take(2_000))
        assertEquals(0, budget.take(9_000))
        assertEquals(22_000, budget.take(9_000))    // until the first start is 30 s old
        assertEquals(1, budget.take(30_999))
        assertEquals(0, budget.take(31_000))
        assertEquals(1_000, budget.take(31_000))    // the start at 2 s is next to expire
        assertEquals(0, budget.take(100_000))
    }

    // ── home Wi-Fi ────────────────────────────────────────────────────────

    @Test
    fun deviceKeyEqualsTheSwiftFunction() {
        // Expected values printed by AfferentPresencePlugin.deviceKey (Swift, CryptoKit) on macOS.
        val k = PresenceLan::deviceKey
        assertEquals("68668ef47a15c68f", k("_airplay._tcp", "Kitchen"))
        assertEquals("68668ef47a15c68f", k("_raop._tcp", "A1B2C3D4E5F6@Kitchen"))      // same device
        assertEquals("0ed842b56fe79088", k("_airplay._tcp", "A1B2C3D4E5F6@Kitchen"))   // "@" only cut for _raop
        assertEquals("437af140bcd05e68", k("_googlecast._tcp", "  Living Room TV \t"))
        assertEquals("665707f59749f728", k("_ipp._tcp", "Skrivare Åäö ÉCOLE"))
        assertEquals("93881bcbcbac7eb5", k("_raop._tcp", "AA@BB@Sovrum"))              // first "@"
        assertEquals("b5dfb4216f031b20", k("_hap._tcp", "Lamp "))                 // no-break space is trimmed
        assertEquals("b1f4be031c2a3622", k("_hap._tcp", "Lamp\n"))                     // a line break is not
        assertEquals("e8f4f37793057135", k("_sonos._tcp", ""))
    }

    @Test
    fun serviceTypesAreTheIosList() {
        assertEquals(18, PresenceLan.homeServiceTypes.size)
        assertEquals(18, PresenceLan.homeServiceTypes.toSet().size)
        // Gradle runs unit tests in android/app; the iOS sources sit next to android/.
        val plist = File("../../ios/App/App/Info.plist")
        assumeTrue(plist.exists())
        val block = plist.readText().substringAfter("<key>NSBonjourServices</key>").substringBefore("</array>")
        val ios = Regex("<string>([^<]+)</string>").findAll(block).map { it.groupValues[1] }.toList()
        assertEquals(ios, PresenceLan.homeServiceTypes)
    }

    @Test
    fun lanRoundsStayUnderTheNsdManagerLimitAndCoverEveryType() {
        val r = LanRounds()
        assertTrue(r.batches.all { it.size <= 9 })
        assertEquals(PresenceLan.homeServiceTypes, r.batches.flatten())
        assertEquals("off", r.state)
        assertEquals(emptyList<String>(), r.next())   // not browsing
    }

    @Test
    fun lanIsStartingUntilEveryTypeHadAWindowThenReady() {
        val r = LanRounds(listOf("_airplay._tcp", "_raop._tcp", "_ipp._tcp"), batchSize = 2)
        assertEquals(listOf("_airplay._tcp", "_raop._tcp"), r.begin())
        assertTrue(r.browsing)
        assertEquals("starting", r.state)
        r.started("_airplay._tcp")
        r.started("_raop._tcp")
        r.found("_airplay._tcp", "Kitchen")
        r.found("_raop._tcp", "A1B2C3D4E5F6@Kitchen")   // the same speaker
        r.found("_airplay._tcp", "Bedroom")
        r.found("_ipp._tcp", "Printer")                 // not being browsed: ignored
        assertEquals("starting", r.state)               // _ipp not asked yet
        assertEquals(setOf("68668ef47a15c68f", PresenceLan.deviceKey("_airplay._tcp", "Bedroom")), r.devices())

        assertEquals(listOf("_ipp._tcp"), r.next())
        assertEquals("starting", r.state)
        r.started("_ipp._tcp")
        r.found("_ipp._tcp", "Printer")
        assertEquals(3, r.devices().size)               // window one is remembered

        assertEquals(listOf("_airplay._tcp", "_raop._tcp"), r.next())
        assertEquals("ready", r.state)
        assertEquals(3, r.devices().size)

        r.end()
        assertEquals("off", r.state)
        assertFalse(r.browsing)
        assertEquals(0, r.devices().size)
    }

    @Test
    fun aDeviceIsDroppedAfterTwoSilentWindowsOfItsType() {
        val r = LanRounds(listOf("_airplay._tcp"), batchSize = 9)
        r.begin()
        r.started("_airplay._tcp")
        r.found("_airplay._tcp", "Kitchen")
        r.found("_airplay._tcp", "Guest")
        r.lost("_airplay._tcp", "Guest")                // goodbye packet inside the window
        assertEquals(setOf("68668ef47a15c68f"), r.devices())
        r.next()                                        // window 2: silent
        assertEquals("ready", r.state)
        assertEquals(1, r.devices().size)
        r.next()                                        // window 3: silent
        assertEquals(1, r.devices().size)
        r.next()                                        // two finished windows without it
        assertEquals(0, r.devices().size)
        r.found("_airplay._tcp", "Kitchen")
        assertEquals(1, r.devices().size)
    }

    @Test
    fun lanFailedAndDenied() {
        val r = LanRounds(listOf("_airplay._tcp", "_ipp._tcp"), batchSize = 1)
        r.begin()
        r.failed("_airplay._tcp")
        assertEquals("starting", r.state)
        r.next()
        r.failed("_ipp._tcp")
        r.next()
        assertEquals("failed", r.state)                 // every type refused to start
        r.started("_airplay._tcp")
        assertEquals("ready", r.state)                  // one working type is enough, as on iOS
        r.next()
        r.failed("_ipp._tcp", denied = true)
        assertEquals("denied", r.state)

        // No callback at all in a full round is a failure too, not "ready".
        val silent = LanRounds(listOf("_airplay._tcp"), batchSize = 1)
        silent.begin()
        silent.next()
        assertEquals("failed", silent.state)
    }
}
