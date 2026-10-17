package app.kaak.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class TrustTest {
    @Test
    fun levelsFromPoints() {
        assertEquals(TrustLevel.STRANGER, TrustLevel.of(0))
        assertEquals(TrustLevel.NEIGHBOUR, TrustLevel.of(5))
        assertEquals(TrustLevel.FRIEND, TrustLevel.of(16))
        assertEquals(TrustLevel.FAMILY, TrustLevel.of(99))
    }

    @Test
    fun goodDaysEarnBadDaysCostALittle() {
        assertEquals(2, Trust.dayDelta(DayStats(DAY, mindlessMin = 20), 60))
        assertEquals(1, Trust.dayDelta(DayStats(DAY, mindlessMin = 50), 60))
        assertEquals(-1, Trust.dayDelta(DayStats(DAY, mindlessMin = 10, escapes = 1), 60))
        assertEquals(-1, Trust.dayDelta(DayStats(DAY, mindlessMin = 70, eaten = 1), 60))
    }

    @Test
    fun friendsDontGetRobbed() {
        val b = KaakBrain(rules = Rules(jumpscareAllowed = false, trust = TrustLevel.FRIEND), random = Random(2))
        b.onForeground(true, 0)
        val (t, actions) = b.scrollFor(0, 11.0, 5_000)
        assertTrue(Action.Arrive in actions)
        b.onForeground(false, t)
        assertEquals(Action.Return, b.onForeground(true, t + 30_000))
    }

    @Test
    fun trustMakesHecklesRarerAndWarningsEarlier() {
        fun heckles(level: TrustLevel): Int {
            val b = KaakBrain(rules = Rules(jumpscareAllowed = false, dailyLimitMs = 600 * MINUTE_MS, trust = level), random = Random(9))
            b.onForeground(true, 0)
            return b.scrollFor(0, 60.0, 5_000).second.count { it is Action.Heckle }
        }
        assertTrue(heckles(TrustLevel.FAMILY) < heckles(TrustLevel.STRANGER))

        val b = KaakBrain(rules = Rules(jumpscareAllowed = false, dailyLimitMs = 40 * MINUTE_MS, trust = TrustLevel.FRIEND), random = Random(3))
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 31.0, 5_000)
        assertTrue("friend warned 10 min early: $actions", actions.any { it is Action.Warn })
    }
}

class WorkModeTest {
    @Test
    fun replyingToCustomersBetweenScrollsIsNotMindless() {
        // A seller: scrolls the page, types a reply every 2 minutes.
        fun run(work: Boolean): List<Action> {
            val b = KaakBrain(rules = Rules(work = work, jumpscareAllowed = false), random = Random(4))
            b.onForeground(true, 0)
            val actions = mutableListOf<Action>()
            var t = 0L
            while (t < 30 * MINUTE_MS) {
                t += TICK
                b.onScroll(t)
                if (t % (2 * MINUTE_MS) == 0L) b.onTyping(t)
                val a = b.tick(t, NOON, DAY).action
                if (a != Action.None) actions += a
            }
            return actions
        }
        assertTrue(run(work = true).isEmpty())
        assertFalse(run(work = false).isEmpty())
    }

    @Test
    fun noTheftOrJumpscareAtWork() {
        val b = KaakBrain(rules = Rules(work = true, dailyLimitMs = 600 * MINUTE_MS), random = Random(11))
        b.onForeground(true, 0)
        val (t, actions) = b.scrollFor(0, 60.0, 3_000)
        assertFalse(Action.Jumpscare in actions)
        b.onForeground(false, t)
        assertFalse(b.onForeground(true, t + 30_000) == Action.Steal)
    }
}

class ReturnedTimeTest {
    @Test
    fun leavingRightAfterAGagEarnsTimeUntilNextVisit() {
        val r = ReturnedTime()
        r.onKaakAction(0, endsVisit = false)
        r.onLeaveFeed(60_000)
        assertEquals(10 * MINUTE_MS, r.onEnterFeed(60_000 + 10 * MINUTE_MS))
    }

    @Test
    fun leavingLongAfterAGagEarnsNothing() {
        val r = ReturnedTime()
        r.onKaakAction(0, endsVisit = false)
        r.onLeaveFeed(5 * MINUTE_MS)
        assertEquals(0L, r.onEnterFeed(20 * MINUTE_MS))
    }

    @Test
    fun theftAndEatingCountAndAreCapped() {
        val r = ReturnedTime()
        r.onKaakAction(0, endsVisit = true)
        assertEquals(30 * MINUTE_MS, r.onEnterFeed(3 * 60 * MINUTE_MS))
        r.onKaakAction(0, endsVisit = true)
        assertEquals(0L, r.flush(10 * MINUTE_MS))
        assertEquals(30 * MINUTE_MS, r.flush(40 * MINUTE_MS))
        assertEquals(0L, r.onEnterFeed(50 * MINUTE_MS))
    }
}

class KaakTimesTest {
    private fun week(seed: Int, mindless: Int) = (1..7).map {
        DayStats(DAY + it, mindlessMin = mindless, feedOpens = 9, foiled = 3, returnedMin = 40, steps = 1_000 * (it % 2),
            longestSessionMin = 20 + it, eaten = if (it == 3) 1 else 0, worthYes = 1, worthNo = 2, bribes = 1, lateMinute = if (it == 5) 5 * 60 + 10 else 60)
    }

    @Test
    fun aBigDropLeadsThePaper() {
        val e = KaakTimes.compose(week(1, 20), week(2, 60), "Week of 12 October", Random(1))
        assertTrue(e.headline, e.headline.contains("DOWN 67%") || e.headline.contains("QUIET WEEK"))
        assertEquals(3, e.stories.size)
        assertTrue(e.stories.map { it.title }.toSet().size == 3)
    }

    @Test
    fun lateNightsMakeTheNews() {
        assertEquals("2:10 A.M.", KaakTimes.clock(5 * 60 + 10))
        assertEquals("11:30 P.M.", KaakTimes.clock(150))
        val e = KaakTimes.compose(week(1, 50), week(2, 50), "x", Random(2))
        assertTrue((listOf(e.headline) + e.stories.map { it.title }).any { it.contains("2:10") })
    }

    @Test
    fun firstWeekStillPrints() {
        val e = KaakTimes.compose(emptyList(), emptyList(), "x", Random(3))
        assertEquals("CROW MOVES INTO LOCAL PHONE", e.headline)
        assertTrue(e.stories.isNotEmpty())
    }

    @Test
    fun hoursFormat() {
        assertEquals("45 MINUTES", KaakTimes.hours(45))
        assertEquals("4 HOURS", KaakTimes.hours(240))
        assertEquals("4H 40M", KaakTimes.hours(280))
        assertEquals(-1, Trust.lateMinuteOf(12 * 60))
        assertEquals(150, Trust.lateMinuteOf(23 * 60 + 30))
    }
}
