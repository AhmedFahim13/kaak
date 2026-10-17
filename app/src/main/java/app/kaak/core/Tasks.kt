package app.kaak.core

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime

/** Phone-down bribes: the screen must stay off for [targetMs] in one go. */
class PhoneDownTimer(val targetMs: Long) {
    private var offSince: Long? = null
    var bestMs = 0L
        private set
    var done = false
        private set

    fun onScreenOff(now: Long) {
        if (!done) offSince = now
    }

    /** Returns true if this screen-on completes the bribe. */
    fun onScreenOn(now: Long): Boolean {
        val since = offSince ?: return false
        offSince = null
        val ms = now - since
        bestMs = maxOf(bestMs, ms)
        if (ms >= targetMs) done = true
        return done
    }
}

/**
 * Step bribes. Android's step counter is a running total since boot, so we
 * store a baseline and survive a reboot (total jumping back down).
 */
class StepGoal(val target: Int) {
    private var baseline: Int? = null
    private var last = 0
    private var carried = 0

    val progress: Int get() = carried + (last - (baseline ?: last))
    val done: Boolean get() = progress >= target

    fun onTotal(total: Int): Boolean {
        val base = baseline
        if (base == null) {
            baseline = total
        } else if (total < last) {
            carried += last - base
            baseline = total
        }
        last = total
        return done
    }
}

/** App-time bribes: one of [packages] in the foreground for [targetMs] in total. */
class AppTimeGoal(val packages: Set<String>, val targetMs: Long) {
    private var accMs = 0L
    private var since: Long? = null

    fun onForeground(pkg: String?, now: Long) {
        pause(now)
        if (pkg != null && pkg in packages) since = now
    }

    fun pause(now: Long) {
        since?.let { accMs += now - it }
        since = null
    }

    fun progressMs(now: Long): Long = accMs + (since?.let { now - it } ?: 0)
    fun done(now: Long): Boolean = progressMs(now) >= targetMs
}

object Bedtime {
    const val WAKE_MINUTE = 5 * 60

    fun isBedtime(minuteOfDay: Int, bedtimeMinute: Int): Boolean =
        if (bedtimeMinute >= WAKE_MINUTE) minuteOfDay >= bedtimeMinute || minuteOfDay < WAKE_MINUTE
        else minuteOfDay in bedtimeMinute until WAKE_MINUTE

    /** The most recent bedtime at or before [now]. */
    fun lastBedtimeStart(now: LocalDateTime, bedtimeMinute: Int): LocalDateTime {
        val today = now.toLocalDate().atTime(bedtimeMinute / 60, bedtimeMinute % 60)
        return if (today.isAfter(now)) today.minusDays(1) else today
    }

    /**
     * Morning gift: between 5 and 11 a.m., once a day, if no feed was opened
     * after last night's bedtime (and Kaak was already installed by then).
     */
    fun morningGift(
        now: LocalDateTime,
        bedtimeMinute: Int,
        lastGiftDate: LocalDate?,
        lastFeedUse: LocalDateTime?,
        installedAt: LocalDateTime,
    ): Boolean {
        if (now.hour !in 5..11) return false
        if (lastGiftDate == now.toLocalDate()) return false
        val bed = lastBedtimeStart(now, bedtimeMinute)
        if (Duration.between(bed, now) > Duration.ofHours(14)) return false
        if (installedAt.isAfter(bed)) return false
        return lastFeedUse == null || lastFeedUse.isBefore(bed)
    }
}

fun dayKeyOf(date: LocalDate): Int = date.year * 10_000 + date.monthValue * 100 + date.dayOfMonth
