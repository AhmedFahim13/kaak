package app.kaak.core

/** Behaviour-only numbers. Nothing here knows what is on screen. */
data class ScrollStats(
    val swipesInWindow: Int,
    val swipesPerMin: Double,
    /** Median time between swipes in the window, or null with fewer than 3 swipes. */
    val medianDwellMs: Long?,
    /** Time since the last swipe (or since tracking started, if no swipe yet). */
    val msSinceActivity: Long,
    val typedRecently: Boolean,
    /** Null if nothing was typed this session. */
    val msSinceTyping: Long? = null,
)

/**
 * Accessibility services fire many TYPE_VIEW_SCROLLED events per finger swipe.
 * Events closer together than [swipeGapMs] are merged into one swipe.
 * Stats are computed over a rolling [windowMs] window.
 */
class ScrollTracker(
    private val swipeGapMs: Long = 350L,
    private val windowMs: Long = 5 * MINUTE_MS,
    private val typingGraceMs: Long = 60_000L,
) {
    private val swipes = ArrayDeque<Long>()
    private var lastScrollEventAt: Long? = null
    private var lastSwipeAt: Long? = null
    private var lastTypingAt: Long? = null
    private var startedAt: Long? = null

    var totalSwipes = 0
        private set

    fun start(now: Long) {
        if (startedAt == null) startedAt = now
    }

    fun onScroll(now: Long) {
        start(now)
        val last = lastScrollEventAt
        if (last == null || now - last > swipeGapMs) {
            swipes.addLast(now)
            lastSwipeAt = now
            totalSwipes++
        }
        lastScrollEventAt = now
        trim(now)
    }

    fun onTyping(now: Long) {
        start(now)
        lastTypingAt = now
    }

    fun reset() {
        swipes.clear()
        lastScrollEventAt = null
        lastSwipeAt = null
        lastTypingAt = null
        startedAt = null
        totalSwipes = 0
    }

    fun stats(now: Long): ScrollStats {
        trim(now)
        val start = startedAt ?: now
        val observedMs = minOf(windowMs, now - start).coerceAtLeast(MINUTE_MS)
        val rate = swipes.size * MINUTE_MS.toDouble() / observedMs
        val gaps = swipes.zipWithNext { a, b -> b - a }.sorted()
        val median = when {
            gaps.size < 2 -> null
            gaps.size % 2 == 1 -> gaps[gaps.size / 2]
            else -> (gaps[gaps.size / 2 - 1] + gaps[gaps.size / 2]) / 2
        }
        val sinceActivity = now - (lastSwipeAt ?: start)
        val typed = lastTypingAt?.let { now - it <= typingGraceMs } ?: false
        return ScrollStats(swipes.size, rate, median, sinceActivity, typed, lastTypingAt?.let { now - it })
    }

    private fun trim(now: Long) {
        while (swipes.isNotEmpty() && now - swipes.first() > windowMs) swipes.removeFirst()
    }
}
