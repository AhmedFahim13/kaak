package app.kaak.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

internal const val NOON = 12
internal const val TICK = 5_000L
internal const val DAY = 20261012

/** Simulates [minutes] in a feed app with one swipe every [swipeEveryMs]; returns all actions. */
internal fun KaakBrain.scrollFor(
    start: Long,
    minutes: Double,
    swipeEveryMs: Long,
    typing: Boolean = false,
    hour: Int = NOON,
): Pair<Long, List<Action>> {
    val actions = mutableListOf<Action>()
    var t = start
    val end = start + (minutes * MINUTE_MS).toLong()
    var nextSwipe = start
    while (t < end) {
        t += TICK
        while (nextSwipe <= t) {
            // a real swipe produces a burst of scroll events
            onScroll(nextSwipe); onScroll(nextSwipe + 60); onScroll(nextSwipe + 120)
            if (typing) onTyping(nextSwipe)
            nextSwipe += swipeEveryMs
        }
        val a = tick(t, hour, DAY).action
        if (a != Action.None) actions += a
    }
    return t to actions
}

class ScrollTrackerTest {
    @Test
    fun burstOfScrollEventsCountsAsOneSwipe() {
        val tr = ScrollTracker()
        tr.onScroll(0); tr.onScroll(50); tr.onScroll(120); tr.onScroll(300)
        assertEquals(1, tr.totalSwipes)
        tr.onScroll(2_000)
        assertEquals(2, tr.totalSwipes)
    }

    @Test
    fun medianDwellNeedsThreeSwipes() {
        val tr = ScrollTracker()
        tr.onScroll(0); tr.onScroll(5_000)
        assertNull(tr.stats(6_000).medianDwellMs)
        tr.onScroll(9_000)
        assertEquals(4_500L, tr.stats(10_000).medianDwellMs)
    }

    @Test
    fun oldSwipesFallOutOfWindow() {
        val tr = ScrollTracker()
        tr.onScroll(0); tr.onScroll(1_000); tr.onScroll(2_000)
        assertEquals(0, tr.stats(10 * MINUTE_MS).swipesInWindow)
    }
}

class RuleDetectorTest {
    private val d = RuleDetector()

    @Test
    fun fastShortDwellIsMindless() {
        val s = ScrollStats(40, 8.0, 5_000, 4_000, false)
        assertEquals(Verdict.MINDLESS, d.evaluate(s, NOON).verdict)
    }

    @Test
    fun typingIsNeverMindless() {
        val s = ScrollStats(40, 8.0, 5_000, 4_000, true)
        assertEquals(Verdict.NOT_MINDLESS, d.evaluate(s, NOON).verdict)
    }

    @Test
    fun watchingOneLongVideoIsNotMindless() {
        val s = ScrollStats(5, 1.0, 5_000, 4 * MINUTE_MS, false)
        assertEquals(Verdict.NOT_MINDLESS, d.evaluate(s, NOON).verdict)
    }

    @Test
    fun slowBrowsingIsNotMindless() {
        val s = ScrollStats(10, 0.5, 90_000, 10_000, false)
        assertEquals(Verdict.NOT_MINDLESS, d.evaluate(s, NOON).verdict)
    }

    @Test
    fun lateNightIsMoreLenient() {
        val s = ScrollStats(12, 0.8, 50_000, 10_000, false)
        assertEquals(Verdict.NOT_MINDLESS, d.evaluate(s, NOON).verdict)
        assertEquals(Verdict.MINDLESS, d.evaluate(s, 1).verdict)
    }

    @Test
    fun tooFewSwipesIsUnsure() {
        val s = ScrollStats(2, 2.0, null, 3_000, false)
        assertEquals(Verdict.UNSURE, d.evaluate(s, NOON).verdict)
    }
}

class KaakBrainTest {
    private fun brain(chaos: Chaos = Chaos.KAAK) =
        KaakBrain(rules = Rules(chaos = chaos, jumpscareAllowed = false), random = Random(7))

    @Test
    fun arrivesAfterTenMindlessMinutesNotBefore() {
        val b = brain()
        b.onForeground(true, 0)
        val (t, early) = b.scrollFor(0, 9.0, 5_000)
        assertTrue(early.isEmpty())
        val (_, later) = b.scrollFor(t, 2.0, 5_000)
        assertEquals(Action.Arrive, later.first())
    }

    @Test
    fun hecklesAfterFifteenMinutesWithVariedGags() {
        val b = brain()
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 40.0, 5_000)
        val heckles = actions.filterIsInstance<Action.Heckle>()
        assertTrue("expected several heckles, got $actions", heckles.size >= 5)
        heckles.zipWithNext().forEach { (a, b2) -> assertNotEquals(a.gag, b2.gag) }
        assertTrue(heckles.first().minutes >= 15)
    }

    @Test
    fun intentionalUseNeverTriggers() {
        val b = brain()
        b.onForeground(true, 0)
        val (_, typing) = b.scrollFor(0, 30.0, 5_000, typing = true)
        assertTrue(typing.isEmpty())
        val b2 = brain()
        b2.onForeground(true, 0)
        val (_, slow) = b2.scrollFor(0, 30.0, 120_000)
        assertTrue(slow.isEmpty())
    }

    @Test
    fun leavingHidesAndReturningLaterSaysAgain() {
        val b = brain()
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 11.0, 5_000)
        assertEquals(Action.Hide, b.onForeground(false, t))
        assertEquals(Action.Return, b.onForeground(true, t + 3 * MINUTE_MS))
    }

    @Test
    fun sessionResetsAfterThirtyMinutesAway() {
        var ended: SessionSummary? = null
        val b = KaakBrain(random = Random(1), onSessionEnd = { ended = it })
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 11.0, 5_000)
        b.onForeground(false, t)
        b.tick(t + 31 * MINUTE_MS, NOON, DAY)
        assertTrue(ended?.arrived == true)
        assertEquals(Action.None, b.onForeground(true, t + 32 * MINUTE_MS))
        assertEquals(0L, b.mindlessMs)
    }

    @Test
    fun monkeyArrivesSoonerThanPigeon() {
        val monkey = brain(Chaos.MONKEY).also { it.onForeground(true, 0) }
        val pigeon = brain(Chaos.PIGEON).also { it.onForeground(true, 0) }
        assertTrue(monkey.scrollFor(0, 8.0, 5_000).second.contains(Action.Arrive))
        assertFalse(pigeon.scrollFor(0, 8.0, 5_000).second.contains(Action.Arrive))
    }

    @Test
    fun sleepingPhoneDoesNotCountAsScrolling() {
        val b = brain()
        b.onForeground(true, 0)
        b.tick(5_000, NOON, DAY)
        b.tick(2 * 60 * MINUTE_MS, NOON, DAY) // two hours later in one tick
        assertTrue(b.activeMs <= 20_000)
    }
}

class LinesTest {
    @Test
    fun englishIsDefaultAndBanglishIsOptIn() {
        val lines = Lines(Random(3))
        assertTrue(lines.sit(40) in listOf("what are you doing", "again?", "bro, it's been 40 minutes"))
        lines.lang = Lang.BANGLISH
        assertTrue(lines.sit(40) in listOf("ki korcho eta", "abar?", "bhai 40 minute hoye gelo"))
    }

    @Test
    fun neverRepeatsTheSameLineTwiceInARow() {
        val lines = Lines(Random(5))
        var prev = lines.again()
        repeat(50) {
            val next = lines.again()
            assertNotEquals(prev, next)
            prev = next
        }
    }
}
