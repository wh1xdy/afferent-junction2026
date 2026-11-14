package fi.junction.afferent

/**
 * Android delivers nothing, on older versions without any error, to an app that starts more
 * than five Bluetooth scans within 30 seconds. The limit is per app, so everything in the app
 * that scans takes its starts from the same budget (ScanBudget.app), which stays one below it.
 */
class ScanBudget(private val max: Int = 4, private val windowMs: Long = 30_000) {
    companion object {
        /**
         * The one budget of the running app: the finger plugin and the presence plugin both
         * take from it, on the main thread, with SystemClock.elapsedRealtime() as the clock.
         */
        val app = ScanBudget()
    }

    private val starts = ArrayDeque<Long>()

    /** 0: a scan may start now, and is counted. Otherwise how long to wait, in milliseconds. */
    fun take(nowMs: Long): Long {
        while (starts.isNotEmpty() && nowMs - starts.first() >= windowMs) starts.removeFirst()
        if (starts.size < max) {
            starts.addLast(nowMs)
            return 0
        }
        return starts.first() + windowMs - nowMs
    }
}
