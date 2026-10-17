package app.kaak.core

import kotlin.random.Random

data class SessionSummary(
    val activeMs: Long,
    val mindlessMs: Long,
    val swipes: Int,
    val actions: Int,
    val arrived: Boolean,
)

/** Behaviour stats attached to a "Was that worth it?" answer: training data for week 6. */
data class LabelContext(
    val visitMs: Long,
    val mindlessMs: Long,
    val swipesPerMin: Double?,
    val medianDwellMs: Long?,
    val verdict: Verdict?,
    val hourOfDay: Int,
)

data class Snapshot(
    val action: Action,
    val detection: Detection?,
    val stats: ScrollStats?,
    val activeMs: Long,
    val mindlessMs: Long,
    val dailyMs: Long,
    val inFeed: Boolean,
    val eatenUntil: Long?,
)

/**
 * Pure decision logic, no Android. The service feeds it foreground changes,
 * scroll/typing events and a tick every few seconds; it answers with an [Action].
 *
 * Session: every visit to a feed app until the user has been away for
 * [resetAfterAwayMs]. Escalation (arrival, heckles, jumpscare) resets with it.
 * Day: feed time counted toward the daily limit; resets at midnight.
 */
class KaakBrain(
    var rules: Rules = Rules(),
    config: DetectorConfig = DetectorConfig(),
    private val random: Random = Random.Default,
    private val resetAfterAwayMs: Long = 30 * MINUTE_MS,
    /** Caps time credited per tick, so a sleeping phone does not count as scrolling. */
    private val maxTickMs: Long = 15_000L,
    private val stealWindowMs: Long = 2 * MINUTE_MS,
    private val stealCooldownMs: Long = 5 * MINUTE_MS,
    private val eatCooldownMs: Long = 20 * MINUTE_MS,
    private val graceAfterEatMs: Long = 10 * MINUTE_MS,
    private val jumpscareChancePerTick: Double = 0.08,
    private val labelChance: Double = 0.25,
    /** No two interruptions closer than this (the warning and eating excepted): a constant stream becomes wallpaper. */
    private val minSpacingMs: Long = 15_000L,
    /** Away for less than this (a share sheet, a permission dialog) doesn't count as leaving. */
    private val quickHopMs: Long = 10_000L,
    var onSessionEnd: ((SessionSummary) -> Unit)? = null,
) {
    private val tracker = ScrollTracker()
    private val detector = RuleDetector(config)
    private val workDetector = RuleDetector(config.forWork())

    var inFeed = false
        private set
    /** True while the asleep screen is covering a feed. */
    var blocked = false
        private set
    var activeMs = 0L
        private set
    var mindlessMs = 0L
        private set
    var dailyMs = 0L
        private set
    var eatenUntil: Long? = null
        private set

    private var day = -1
    private var nextEatAtMs = 0L
    private var warned = false
    /** A time-boxed pass into feeds during a nap; when it runs out the nap cover returns. */
    var escapeUntil: Long? = null
        private set

    private var hasSession = false
    private var leftAt: Long? = null
    private var lastTickAt: Long? = null
    private var arrived = false
    private var jumpscared = false
    private var lastActionAt = 0L
    private var nextGapMs = 0L
    private var lastGag: Gag? = null
    private var lastStealAt: Long? = null
    private var lastNudgeAt = 0L
    private var lastAnyAt = Long.MIN_VALUE / 2
    /** While set, every feed is bounced home: Kaak still has it. Long.MAX = until the chase is won. */
    var stolenUntil: Long? = null
        private set
    private var actions = 0

    private var visitStartActive = 0L
    private var visitStartMindless = 0L
    private var lastStats: ScrollStats? = null
    private var lastDetection: Detection? = null
    private var pendingLabel: LabelContext? = null

    fun onForeground(isFeedApp: Boolean, now: Long, hourOfDay: Int = 12): Action {
        if (isFeedApp) {
            if (inFeed) return Action.None // switching between two feed apps
            stolenUntil?.let { if (now < it) return Action.Bounce else stolenUntil = null }
            val away = leftAt?.let { now - it }
            if (away != null && away > resetAfterAwayMs) endSession()
            hasSession = true
            inFeed = true
            leftAt = null
            lastTickAt = now
            tracker.start(now)
            visitStartActive = activeMs
            visitStartMindless = mindlessMs

            val until = eatenUntil
            val passing = escapeUntil?.let { now < it } == true
            if (until != null && now < until && !passing) {
                blocked = true
                return Action.Asleep(minutesLeft(until, now))
            }
            if (away != null && away < quickHopMs) return if (arrived) Action.Resume else Action.None
            val stealReady = lastStealAt?.let { now - it >= stealCooldownMs } ?: true
            val maySteal = rules.trust.steals && !rules.work && !rules.quiet
            if (arrived && maySteal && away != null && away <= stealWindowMs && stealReady) {
                lastStealAt = now
                stolenUntil = Long.MAX_VALUE
                actions++
                return Action.Steal
            }
            if (arrived) {
                // a "back again" does not reset the gag timer, or coming back often would mean fewer gags
                actions++
                lastAnyAt = now
                return Action.Return
            }
            return Action.None
        }
        if (!inFeed) return Action.None
        val visitMs = activeMs - visitStartActive
        if (!blocked && visitMs >= 3 * MINUTE_MS && random.nextDouble() < labelChance) {
            pendingLabel = LabelContext(
                visitMs, mindlessMs - visitStartMindless,
                lastStats?.swipesPerMin, lastStats?.medianDwellMs, lastDetection?.verdict, hourOfDay,
            )
        }
        inFeed = false
        blocked = false
        leftAt = now
        lastTickAt = null
        return Action.Hide
    }

    fun onScroll(now: Long) {
        if (inFeed && !blocked) tracker.onScroll(now)
    }

    fun onTyping(now: Long) {
        if (inFeed && !blocked) tracker.onTyping(now)
    }

    /** The user went through the escape screen (hold + typed sentence): in for [passMs], then the nap returns. */
    fun escape(now: Long, passMs: Long = EscapeRules.PASS_MS) {
        escapeUntil = now + passMs
        if (blocked) { blocked = false; lastTickAt = now }
    }

    /** The user tapped Kaak 5 times after a theft. No more thefts for a while. */
    fun chaseWon(now: Long) {
        lastStealAt = now
        stolenUntil = null
    }

    /** The user ignored the chase: Kaak keeps the feeds for [lockMs]. */
    fun chaseLost(now: Long, lockMs: Long = 3 * MINUTE_MS) {
        stolenUntil = now + lockMs
    }

    /** Kaak's own app was opened from a feed: not a real exit, so no theft on the way back. */
    fun forgiveNextReturn(now: Long) {
        lastStealAt = now
    }

    /** Returns (once) a visit worth asking "Was that worth it?" about. */
    fun takeLabel(): LabelContext? = pendingLabel.also { pendingLabel = null }

    fun tick(now: Long, hourOfDay: Int, dayKey: Int): Snapshot {
        rollDay(dayKey)
        if (!inFeed) {
            val away = leftAt?.let { now - it }
            if (hasSession && away != null && away > resetAfterAwayMs) endSession()
            eatenUntil?.let { if (now >= it) eatenUntil = null }
            return snapshot(Action.None, null, null)
        }
        if (blocked) {
            lastTickAt = now
            val until = eatenUntil
            if (until == null || now >= until) {
                blocked = false
                eatenUntil = null
                return snapshot(Action.Wake, null, null)
            }
            return snapshot(Action.None, null, null)
        }
        // the escape pass ran out while still in a feed during the nap: cover comes back
        val nap = eatenUntil
        val pass = escapeUntil
        if (nap != null && now < nap && pass != null && now >= pass) {
            escapeUntil = null
            blocked = true
            return snapshot(Action.Asleep(minutesLeft(nap, now)), null, null)
        }
        val dt = (now - (lastTickAt ?: now)).coerceIn(0L, maxTickMs)
        lastTickAt = now
        val stats = tracker.stats(now)
        val detection = (if (rules.work) workDetector else detector).evaluate(stats, hourOfDay)
        lastStats = stats
        lastDetection = detection
        activeMs += dt
        if (detection.verdict != Verdict.NOT_MINDLESS) mindlessMs += dt
        // the daily limit counts all feed time except typing (messages, comments, search)
        // and one long video watched on purpose (a lecture, a recipe)
        val intentional = detection.verdict == Verdict.NOT_MINDLESS &&
            (detection.reason == "typing" || detection.reason == "watching one thing")
        if (!intentional) dailyMs += dt
        eatenUntil?.let { if (now >= it) eatenUntil = null }
        val action = decide(now, detection.verdict)
        if (action != Action.None) { actions++; lastAnyAt = now }
        return snapshot(action, detection, stats)
    }

    /** Call when the service stops, so the last session still gets logged. */
    fun endSession() {
        if (hasSession && activeMs > 0) {
            onSessionEnd?.invoke(SessionSummary(activeMs, mindlessMs, tracker.totalSwipes, actions, arrived))
        }
        tracker.reset()
        hasSession = false
        activeMs = 0
        mindlessMs = 0
        arrived = false
        jumpscared = false
        lastActionAt = 0
        nextGapMs = 0
        lastGag = null
        lastStealAt = null
        stolenUntil = null
        lastNudgeAt = 0
        actions = 0
        visitStartActive = 0
        visitStartMindless = 0
        if (inFeed) {
            hasSession = true
            lastTickAt?.let { tracker.start(it) }
        }
    }

    private fun decide(now: Long, verdict: Verdict): Action {
        // 1. Daily limit. Applies even in quiet hour; skipped while an escape pass runs.
        if (escapeUntil?.let { now < it } != true) {
            val threshold = maxOf(rules.dailyLimitMs + rules.bonusMs, nextEatAtMs)
            if (dailyMs >= threshold) {
                eatenUntil = now + eatCooldownMs
                nextEatAtMs = dailyMs + graceAfterEatMs
                warned = false
                blocked = true
                lastActionAt = now
                return Action.Eat
            }
            if (!warned && dailyMs >= threshold - rules.trust.warnBeforeMin * MINUTE_MS) {
                warned = true
                return Action.Warn(minutesLeft(threshold - dailyMs, 0))
            }
        }
        if (rules.quiet) return Action.None

        // 2. Escalation. At bedtime any scrolling counts and Kaak shows up sooner.
        val bedtime = rules.bedtime
        val counts = if (bedtime) verdict != Verdict.NOT_MINDLESS else verdict == Verdict.MINDLESS
        if (!counts) return Action.None
        val arrivalBase = rules.arrivalMs ?: rules.chaos.arrivalMs
        val heckleBase = rules.heckleMs ?: rules.chaos.heckleMs
        val arrivalMs = if (bedtime) minOf(arrivalBase, 3 * MINUTE_MS) else arrivalBase
        val heckleMs = if (bedtime) minOf(heckleBase, 6 * MINUTE_MS) else heckleBase

        if (!arrived) {
            if (mindlessMs < arrivalMs) return Action.None
            arrived = true
            lastActionAt = now
            nextGapMs = jitteredGap()
            return Action.Arrive
        }
        val tooSoon = now - lastAnyAt < minSpacingMs
        if (mindlessMs < heckleMs) return if (tooSoon) Action.None else nudge(now, Long.MAX_VALUE)

        if (!tooSoon && !bedtime && !rules.work && rules.jumpscareAllowed && !jumpscared && mindlessMs >= arrivalMs * 2 &&
            now - lastActionAt >= 30_000 && random.nextDouble() < jumpscareChancePerTick * rules.trust.jumpscareFactor
        ) {
            jumpscared = true
            lastActionAt = now
            return Action.Jumpscare
        }

        if (tooSoon) return Action.None
        val gagDueIn = nextGapMs - (now - lastActionAt)
        if (gagDueIn > 0) return nudge(now, gagDueIn)
        val gag = Gag.entries.filter { it != lastGag }.random(random)
        lastGag = gag
        lastActionAt = now
        nextGapMs = jitteredGap()
        return Action.Heckle(gag, (dailyMs / MINUTE_MS).toInt())
    }

    private fun nudge(now: Long, gagDueInMs: Long): Action {
        if (gagDueInMs < minSpacingMs) return Action.None // a gag is about to happen: don't poke right before it
        if (now - maxOf(lastActionAt, lastNudgeAt) < rules.nudgeMs) return Action.None
        lastNudgeAt = now
        return Action.Nudge((dailyMs / MINUTE_MS).toInt())
    }

    private fun rollDay(dayKey: Int) {
        if (day == dayKey) return
        if (day != -1) {
            dailyMs = 0
            nextEatAtMs = 0
            warned = false
        }
        day = dayKey
    }

    private fun minutesLeft(until: Long, now: Long) = ((until - now + MINUTE_MS - 1) / MINUTE_MS).toInt().coerceAtLeast(1)

    private fun jitteredGap(): Long {
        val calm = rules.trust.gapFactor * (if (rules.work) 1.5 else 1.0)
        return ((rules.gapMs ?: rules.chaos.gapMs) * calm * (0.7 + random.nextDouble() * 0.6)).toLong()
    }

    private fun snapshot(action: Action, detection: Detection?, stats: ScrollStats?) =
        Snapshot(action, detection, stats, activeMs, mindlessMs, dailyMs, inFeed, eatenUntil)
}
