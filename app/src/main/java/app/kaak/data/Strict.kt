package app.kaak.data

import android.content.Context
import app.kaak.core.StrictPlan
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Strict mode on this phone. */
object Strict {
    private fun sp(c: Context) = c.getSharedPreferences("kaak_strict", Context.MODE_PRIVATE)

    /** Kaak's own buttons may open a settings screen (the battery request) for a few seconds. */
    @Volatile var allowSettingsUntil = 0L

    fun until(c: Context) = sp(c).getLong("until", 0L)
    private fun coolOffAt(c: Context) = sp(c).getLong("cool_off_at", 0L).takeIf { it > 0 }

    fun active(c: Context, now: Long = System.currentTimeMillis()) = StrictPlan.active(now, until(c), coolOffAt(c))

    // Strict use is logged for the study (it's visible in both editions): start, ask to leave, end.
    fun start(c: Context, untilWall: Long) {
        val now = System.currentTimeMillis()
        val capped = minOf(untilWall, now + StrictPlan.MAX_MS)
        sp(c).edit().putLong("until", capped).putLong("cool_off_at", 0L).apply()
        SessionLog(c).event("strict_on", "for ${(capped - now + 30_000) / 60_000} min")
    }

    fun askToLeave(c: Context) {
        if (coolOffAt(c) != null) return
        sp(c).edit().putLong("cool_off_at", System.currentTimeMillis()).apply()
        SessionLog(c).event("strict_leave_asked", "${(until(c) - System.currentTimeMillis()) / 60_000} min early")
    }

    /** Why strict mode just ended: its time ran out, or the 15-minute wait after asking to leave. */
    fun endReason(c: Context): String = if (coolOffAt(c) != null) "left early" else "time up"

    fun coolOffLeftMin(c: Context): Long? = StrictPlan.coolOffLeftMs(System.currentTimeMillis(), coolOffAt(c))?.let { it / 60_000 + 1 }

    fun untilLabel(c: Context): String = SimpleDateFormat("EEE HH:mm", Locale.ENGLISH).format(Date(until(c)))
}
