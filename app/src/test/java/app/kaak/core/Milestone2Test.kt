package app.kaak.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import kotlin.random.Random

private const val FAST = 5_000L

class TheftTest {
    private fun arrivedBrain(): Pair<KaakBrain, Long> {
        val b = KaakBrain(rules = Rules(jumpscareAllowed = false), random = Random(2))
        b.onForeground(true, 0)
        val (t, actions) = b.scrollFor(0, 11.0, FAST)
        assertTrue(Action.Arrive in actions)
        return b to t
    }

    @Test
    fun reopeningWithinTwoMinutesGetsStolen() {
        val (b, t) = arrivedBrain()
        b.onForeground(false, t)
        assertEquals(Action.Steal, b.onForeground(true, t + 60_000))
    }

    @Test
    fun afterWinningTheChaseTheFeedOpensAndIsNotStolenAgain() {
        val (b, t) = arrivedBrain()
        b.onForeground(false, t)
        b.onForeground(true, t + 30_000)
        b.onForeground(false, t + 40_000)
        assertEquals(Action.Bounce, b.onForeground(true, t + 45_000))
        b.chaseWon(t + 50_000)
        assertEquals(Action.Return, b.onForeground(true, t + 60_000))
    }

    @Test
    fun noTheftBeforeKaakHasArrived() {
        val b = KaakBrain(random = Random(2))
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 2.0, FAST)
        b.onForeground(false, t)
        assertEquals(Action.None, b.onForeground(true, t + 30_000))
    }

    @Test
    fun quietHourMeansNoTheft() {
        val (b, t) = arrivedBrain()
        b.rules = b.rules.copy(quiet = true)
        b.onForeground(false, t)
        assertEquals(Action.Return, b.onForeground(true, t + 30_000))
    }
}

class EatTest {
    private fun limited(limitMin: Long, bonusMin: Long = 0) = KaakBrain(
        rules = Rules(dailyLimitMs = limitMin * MINUTE_MS, bonusMs = bonusMin * MINUTE_MS, jumpscareAllowed = false),
        random = Random(4),
    )

    @Test
    fun warnsFiveMinutesBeforeThenEats() {
        val b = limited(20)
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 21.0, FAST)
        val warn = actions.indexOfFirst { it is Action.Warn }
        val eat = actions.indexOf(Action.Eat)
        assertTrue("warn before eat: $actions", warn in 0 until eat)
        assertTrue(b.blocked)
    }

    @Test
    fun bribeMinutesPushTheLimitBack() {
        val b = limited(20, bonusMin = 10)
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 25.0, FAST)
        assertFalse(Action.Eat in actions)
    }

    @Test
    fun reopeningWhileFullShowsAsleepThenWakes() {
        val b = limited(10)
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 11.0, FAST)
        assertEquals(Action.Hide, b.onForeground(false, t))
        val asleep = b.onForeground(true, t + 5 * MINUTE_MS)
        assertTrue(asleep is Action.Asleep && asleep.minutesLeft in 14..16)
        var woke = false
        var now = t + 5 * MINUTE_MS
        while (now < t + 22 * MINUTE_MS) {
            now += TICK
            if (b.tick(now, NOON, DAY).action == Action.Wake) woke = true
        }
        assertTrue(woke)
        assertFalse(b.blocked)
    }

    @Test
    fun scrollingWhileAsleepIsNotCounted() {
        val b = limited(10)
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 11.0, FAST)
        b.onForeground(false, t)
        b.onForeground(true, t + MINUTE_MS)
        val before = b.dailyMs
        b.scrollFor(t + MINUTE_MS, 3.0, FAST)
        assertEquals(before, b.dailyMs)
    }

    @Test
    fun escapeGivesFiveMinutesThenTheNapReturns() {
        val b = limited(10)
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 11.0, FAST)
        b.onForeground(false, t)
        assertTrue(b.onForeground(true, t + MINUTE_MS) is Action.Asleep)
        b.escape(t + MINUTE_MS)
        val (t2, during) = b.scrollFor(t + MINUTE_MS, 4.0, FAST)
        assertFalse(Action.Eat in during)
        assertFalse(during.any { it is Action.Asleep })
        val (_, after) = b.scrollFor(t2, 2.0, FAST) // the 5-minute pass runs out mid-scroll
        assertTrue("nap cover back: $after", after.any { it is Action.Asleep })
    }

    @Test
    fun aftercooldownTenMinutesGraceThenEatenAgain() {
        val b = limited(10)
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 11.0, FAST)
        b.onForeground(false, t)
        val back = t + 25 * MINUTE_MS
        b.tick(back, NOON, DAY) // cooldown over while away
        assertFalse(b.onForeground(true, back) is Action.Asleep)
        val (_, actions) = b.scrollFor(back, 12.0, FAST)
        assertTrue(Action.Eat in actions)
    }

    @Test
    fun newDayResetsTheLimit() {
        val b = limited(10)
        b.onForeground(true, 0)
        b.scrollFor(0, 8.0, FAST)
        assertTrue(b.dailyMs > 7 * MINUTE_MS)
        b.tick(9 * MINUTE_MS, NOON, DAY + 1)
        assertTrue(b.dailyMs < MINUTE_MS)
    }

    @Test
    fun typingInDmsNeverEats() {
        val b = limited(10)
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 30.0, FAST, typing = true)
        assertFalse(Action.Eat in actions)
    }
}

class JumpscareAndBedtimeTest {
    @Test
    fun jumpscareAtMostOncePerSession() {
        val b = KaakBrain(rules = Rules(dailyLimitMs = 600 * MINUTE_MS), random = Random(11))
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 50.0, FAST)
        assertEquals(1, actions.count { it == Action.Jumpscare })
        val first = actions.indexOf(Action.Jumpscare)
        assertTrue(actions.subList(0, first).contains(Action.Arrive))
    }

    @Test
    fun noJumpscareWhenNotAllowed() {
        val b = KaakBrain(rules = Rules(dailyLimitMs = 600 * MINUTE_MS, jumpscareAllowed = false), random = Random(11))
        b.onForeground(true, 0)
        assertFalse(Action.Jumpscare in b.scrollFor(0, 50.0, FAST).second)
    }

    @Test
    fun bedtimeArrivesSoonerAndCountsSlowScrolling() {
        val b = KaakBrain(rules = Rules(bedtime = true), random = Random(3))
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 4.0, 15_000, hour = 0)
        assertTrue(Action.Arrive in actions)
        assertFalse(Action.Jumpscare in actions)
    }

    @Test
    fun bedtimeWindowWrapsMidnight() {
        assertTrue(Bedtime.isBedtime(23 * 60 + 45, 23 * 60 + 30))
        assertTrue(Bedtime.isBedtime(2 * 60, 23 * 60 + 30))
        assertFalse(Bedtime.isBedtime(12 * 60, 23 * 60 + 30))
        assertTrue(Bedtime.isBedtime(60, 30))
        assertFalse(Bedtime.isBedtime(23 * 60, 30))
    }

    @Test
    fun morningGiftOnlyIfNoFeedAfterBedtime() {
        val bed = 23 * 60 + 30
        val now = LocalDateTime.of(2026, 10, 13, 7, 10)
        val installed = LocalDateTime.of(2026, 10, 1, 12, 0)
        val before = LocalDateTime.of(2026, 10, 12, 22, 50)
        val after = LocalDateTime.of(2026, 10, 13, 0, 40)
        assertTrue(Bedtime.morningGift(now, bed, null, before, installed))
        assertFalse(Bedtime.morningGift(now, bed, null, after, installed))
        assertFalse(Bedtime.morningGift(now, bed, LocalDate.of(2026, 10, 13), before, installed))
        assertFalse(Bedtime.morningGift(now.withHour(14), bed, null, before, installed))
        assertFalse(Bedtime.morningGift(now, bed, null, before, LocalDateTime.of(2026, 10, 13, 1, 0)))
    }
}

class LabelTest {
    @Test
    fun asksAboutSomeLongVisitsButNeverShortOnes() {
        var asked = 0
        repeat(40) { i ->
            val b = KaakBrain(random = Random(i))
            b.onForeground(true, 0)
            val (t, _) = b.scrollFor(0, 4.0, FAST)
            b.onForeground(false, t)
            if (b.takeLabel() != null) asked++
            assertEquals(null, b.takeLabel())
        }
        assertTrue("asked $asked of 40", asked in 4..20)

        val short = KaakBrain(random = Random(1))
        short.onForeground(true, 0)
        val (t, _) = short.scrollFor(0, 1.0, FAST)
        short.onForeground(false, t)
        assertEquals(null, short.takeLabel())
    }
}

class BribeTest {
    @Test
    fun catalogIdsAreUniqueAndDetoursPointAtRealBribes() {
        assertEquals(BribeCatalog.ALL.size, BribeCatalog.ALL.map { it.id }.toSet().size)
        assertEquals(DetourCatalog.ALL.size, DetourCatalog.ALL.map { it.id }.toSet().size)
        DetourCatalog.ALL.forEach { d -> d.bribeId?.let { assertTrue("${d.id} -> $it", BribeCatalog.byId(it) != null) } }
        assertTrue(DetourCatalog.DEFAULT_IDS.all { DetourCatalog.byId(it) != null })
    }

    @Test
    fun minutesCapAtThirtyButLootStillPays() {
        val ledger = BribeLedger()
        val walk = BribeCatalog.byId("steps5k")!!
        assertEquals(20, (ledger.claim(walk, DAY) as ClaimResult.Granted).minutes)
        val second = ledger.claim(walk, DAY) as ClaimResult.Granted
        assertEquals(10, second.minutes)
        assertTrue(second.capped)
        val third = ledger.claim(walk, DAY) as ClaimResult.Granted
        assertEquals(0, third.minutes)
        assertEquals("key", third.loot)
    }

    @Test
    fun honorBribesLimitedToThreeADay() {
        val ledger = BribeLedger()
        val water = BribeCatalog.byId("water")!!
        repeat(3) { assertTrue(ledger.claim(water, DAY, honor = true) is ClaimResult.Granted) }
        assertTrue(ledger.claim(water, DAY, honor = true) is ClaimResult.Refused)
        assertTrue(ledger.claim(water, DAY) is ClaimResult.Granted) // with photo proof it still pays
        assertTrue(ledger.claim(water, DAY + 1, honor = true) is ClaimResult.Granted)
    }

    @Test
    fun tenThousandStepsBuysAQuietHourNotFeedTime() {
        val g = BribeLedger().claim(BribeCatalog.byId("steps10k")!!, DAY) as ClaimResult.Granted
        assertEquals(0, g.minutes)
        assertTrue(g.quietHour)
        assertEquals("golden spoon", g.loot)
    }
}

class DetourTest {
    private val all = DetourCatalog.ALL.map { it.id }

    @Test
    fun picksThreeOfDifferentTypes() {
        repeat(20) { seed ->
            val p = DetourPicker.pick(all, 15, false, emptySet(), Random(seed))
            assertEquals(3, p.size)
            assertEquals(3, p.map { it.type }.toSet().size)
            assertFalse(p.any { it.id == "sleep" })
        }
    }

    @Test
    fun afterBedtimeOnlyRestWithSleepFirst() {
        val p = DetourPicker.pick(all, 0, true, emptySet(), Random(1))
        assertEquals("sleep", p.first().id)
        assertTrue(p.all { it.type == DetourType.REST })
    }

    @Test
    fun avoidsYesterdaysDetoursWhenPossible() {
        val first = DetourPicker.pick(all, 15, false, emptySet(), Random(5)).map { it.id }.toSet()
        val second = DetourPicker.pick(all, 15, false, first, Random(5)).map { it.id }.toSet()
        assertTrue(first.intersect(second).isEmpty())
    }

    @Test
    fun emptyChoiceFallsBackToDefaults() {
        val p = DetourPicker.pick(emptyList(), 10, false, emptySet(), Random(2))
        assertTrue(p.isNotEmpty() && p.all { it.id in DetourCatalog.DEFAULT_IDS })
    }

    @Test
    fun twoChosenGivesTwo() {
        val p = DetourPicker.pick(listOf("walk", "plan"), 10, false, emptySet(), Random(2))
        assertEquals(setOf("walk", "plan"), p.map { it.id }.toSet())
    }
}

class TaskCheckTest {
    @Test
    fun phoneDownNeedsOneUnbrokenStretch() {
        val t = PhoneDownTimer(10 * MINUTE_MS)
        t.onScreenOff(0)
        assertFalse(t.onScreenOn(6 * MINUTE_MS)) // peeked
        t.onScreenOff(7 * MINUTE_MS)
        assertFalse(t.onScreenOn(12 * MINUTE_MS))
        t.onScreenOff(13 * MINUTE_MS)
        assertTrue(t.onScreenOn(24 * MINUTE_MS))
        assertTrue(t.done)
    }

    @Test
    fun stepsSurviveAReboot() {
        val g = StepGoal(1_000)
        g.onTotal(52_000)
        g.onTotal(52_600)
        assertEquals(600, g.progress)
        g.onTotal(100) // phone rebooted, counter restarted
        g.onTotal(500)
        assertEquals(1_000, g.progress)
        assertTrue(g.done)
    }

    @Test
    fun appTimeAddsUpAcrossVisits() {
        val g = AppTimeGoal(setOf("com.duolingo"), 5 * MINUTE_MS)
        g.onForeground("com.duolingo", 0)
        g.onForeground("com.whatsapp", 3 * MINUTE_MS)
        assertFalse(g.done(4 * MINUTE_MS))
        g.onForeground("com.duolingo", 10 * MINUTE_MS)
        assertNotEquals(true, g.done(11 * MINUTE_MS))
        assertTrue(g.done(12 * MINUTE_MS))
    }

    @Test
    fun dayKeyFormat() {
        assertEquals(20261012, dayKeyOf(LocalDate.of(2026, 10, 12)))
    }
}
