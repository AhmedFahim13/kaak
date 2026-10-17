package app.kaak.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

class ProofTest {
    @Test
    fun countsSquatsNotJitter() {
        val c = SquatCounter()
        var t = 0L
        repeat(200) { c.onSample((Random(it).nextFloat() - 0.5f) * 1.5f, t); t += 20 } // hand wobble
        assertEquals(0, c.count)
        repeat(12) { // 12 squats, ~1.2 s each: dip then rise
            for (i in 0 until 60) { c.onSample((sin(i / 60.0 * 2 * PI) * -3.5).toFloat(), t); t += 20 }
        }
        assertEquals(12, c.count)
    }

    @Test
    fun countsPushupsOnTheWayDown() {
        val c = PushupCounter()
        var t = 0L
        repeat(10) { c.onProximity(true, t); t += 400; c.onProximity(false, t); t += 600 }
        c.onProximity(true, t); c.onProximity(false, t + 50); c.onProximity(true, t + 100) // bounce
        assertEquals(11, c.count)
    }

    @Test
    fun stairsCountOnlyClimbing() {
        val m = AscentMeter()
        var alt = 10f
        repeat(30) { alt += 0.5f; m.onAltitude(alt + (if (it % 2 == 0) 0.2f else -0.2f)) }
        assertTrue(m.climbedM in 13f..16f)
        repeat(30) { alt -= 0.5f; m.onAltitude(alt) } // walking back down adds nothing
        assertTrue(m.climbedM in 13f..16f)
    }

    @Test
    fun choresNeedTimeAndMovement() {
        val g = ChoreGoal(0, 10 * MINUTE_MS, 250)
        g.steps.onTotal(1_000)
        g.steps.onTotal(1_300)
        assertFalse(g.done(5 * MINUTE_MS))
        assertTrue(g.done(11 * MINUTE_MS))
        val lazy = ChoreGoal(0, 10 * MINUTE_MS, 250)
        lazy.steps.onTotal(1_000); lazy.steps.onTotal(1_040)
        assertFalse(lazy.done(30 * MINUTE_MS))
    }

    @Test
    fun replyNeedsTypingInThatApp() {
        val g = TypingGoal(setOf("com.whatsapp"), 15, MINUTE_MS)
        g.appTime.onForeground("com.whatsapp", 0)
        repeat(20) { g.onTyping("com.instagram.android") }
        assertFalse(g.done(2 * MINUTE_MS))
        repeat(15) { g.onTyping("com.whatsapp") }
        assertTrue(g.done(2 * MINUTE_MS))
    }

    private fun scene(seed: Int, extra: (Int, Int) -> Int = { _, _ -> 0 }): IntArray {
        val r = Random(seed)
        val base = IntArray(64) { r.nextInt(30, 220) }
        return IntArray(32 * 32) { i ->
            val x = i % 32; val y = i / 32
            (base[(y / 4) * 8 + x / 4] + extra(x, y)).coerceIn(0, 255)
        }
    }

    @Test
    fun photosMustBeSamePlaceChangedAndApart() {
        val desk = scene(1)
        val tidied = scene(1) { x, y -> if (x in 8..23 && y in 10..21) -60 else 0 }
        val elsewhere = scene(2)
        assertEquals(PhotoCheck.Verdict.OK, PhotoCheck.compare(desk, tidied, 3 * MINUTE_MS, 2 * MINUTE_MS))
        assertEquals(PhotoCheck.Verdict.TOO_FAST, PhotoCheck.compare(desk, tidied, 30_000, 2 * MINUTE_MS))
        assertEquals(PhotoCheck.Verdict.SAME_PHOTO, PhotoCheck.compare(desk, desk.copyOf(), 3 * MINUTE_MS, 2 * MINUTE_MS))
        assertEquals(PhotoCheck.Verdict.DIFFERENT_PLACE, PhotoCheck.compare(desk, elsewhere, 3 * MINUTE_MS, 2 * MINUTE_MS))
        val brighter = desk.map { (it * 1.25).toInt().coerceAtMost(255) }.toIntArray()
        assertTrue(PhotoCheck.sameness(desk, brighter) > 0.9) // exposure change is still the same place
    }

    @Test
    fun noBribeRunsOnHonorAnyMore() {
        assertTrue(BribeCatalog.ALL.none { it.check == Check.HONOR })
    }
}
