package app.kaak.core

import java.security.MessageDigest

/**
 * Some feed apps (or app versions) never report scrolling. Kaak learns which:
 * after [learnMs] of feed time with zero scroll events, the app is "silent" and
 * screen-content changes stand in for swipes (at most one per [proxyGapMs]).
 * One real scroll event takes the app off the silent list again.
 */
class SilentApps(
    private val learnMs: Long = 10 * MINUTE_MS,
    private val proxyGapMs: Long = 1_500L,
    known: Set<String> = emptySet(),
) {
    private val feedMs = HashMap<String, Long>()
    private val scrolled = HashSet<String>()
    val silent: MutableSet<String> = known.toMutableSet()
    private var lastProxyAt = Long.MIN_VALUE / 2

    /** Returns true if this call changed the silent list (so it can be saved). */
    fun onFeedTime(pkg: String, ms: Long): Boolean {
        val total = (feedMs[pkg] ?: 0L) + ms
        feedMs[pkg] = total
        if (pkg !in scrolled && pkg !in silent && total >= learnMs) { silent += pkg; return true }
        return false
    }

    fun onScroll(pkg: String): Boolean {
        scrolled += pkg
        return silent.remove(pkg)
    }

    /** A content change in [pkg]: true if it should count as a swipe. */
    fun proxySwipe(pkg: String, now: Long): Boolean {
        if (pkg !in silent || now - lastProxyAt < proxyGapMs) return false
        lastProxyAt = now
        return true
    }
}

/** Researcher codes are stored as hashes, so they can't be read out of the APK. */
object Codes {
    fun hash(code: String): String =
        MessageDigest.getInstance("SHA-256").digest(code.trim().uppercase().toByteArray())
            .joinToString("") { "%02x".format(it) }
}
