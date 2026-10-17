package app.kaak.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import kotlin.random.Random

class StudyTest {
    private val start = LocalDate.of(2026, 10, 12)

    @Test
    fun normalAppIsAlwaysKaak() {
        assertEquals(Phase.KAAK, StudyPlan.phase(false, start, start, Phase.TIMER, Phase.BASELINE))
    }

    @Test
    fun sevenDaysBaselineThenTheArm() {
        assertEquals(Phase.BASELINE, StudyPlan.phase(true, start, start, Phase.TIMER, null))
        assertEquals(Phase.BASELINE, StudyPlan.phase(true, start, start.plusDays(6), Phase.TIMER, null))
        assertEquals(Phase.TIMER, StudyPlan.phase(true, start, start.plusDays(7), Phase.TIMER, null))
        assertEquals(Phase.KAAK, StudyPlan.phase(true, start, start.plusDays(20), Phase.KAAK, null))
        assertEquals(8L, StudyPlan.day(start, start.plusDays(7)))
    }

    @Test
    fun researcherCodesAreHashedNotStored() {
        // the real codes live with the study team, never in the repo
        assertEquals(null, StudyPlan.lookup("KAAK-7319")) // the old plaintext codes are gone
        assertEquals(null, StudyPlan.lookup("anything else"))
        assertEquals(Codes.hash("ab-12"), Codes.hash(" AB-12 ")) // case and spaces forgiven
        assertEquals(64, Codes.hash("x").length)
        assertEquals(Phase.KAAK, StudyPlan.phase(true, start, start, Phase.TIMER, Phase.KAAK))
    }

    @Test
    fun armsAreRoughlyBalanced() {
        val r = Random(42)
        val kaak = (1..400).count { StudyPlan.assignArm(r) == Phase.KAAK }
        assertTrue("$kaak of 400", kaak in 170..230)
    }

    @Test
    fun baselineNeverActsButStillLogs() {
        val b = KaakBrain(rules = StudyPlan.adjust(Rules(), Phase.BASELINE), random = Random(3))
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 120.0, 5_000)
        assertTrue("baseline acted: $actions", actions.isEmpty())
        assertTrue(b.dailyMs > 100 * MINUTE_MS)
    }

    @Test
    fun timerArmUsesTheSameThresholdsWithoutTheCrowStuff() {
        val b = KaakBrain(rules = StudyPlan.adjust(Rules(dailyLimitMs = 30 * MINUTE_MS), Phase.TIMER), random = Random(3))
        b.onForeground(true, 0)
        val (t, actions) = b.scrollFor(0, 31.0, 5_000)
        assertTrue(Action.Arrive in actions && Action.Eat in actions && Action.Jumpscare !in actions)
        b.onForeground(false, t)
        b.onForeground(true, t + 30_000).let { assertTrue("no theft in timer arm: $it", it != Action.Steal) }
        assertEquals("15 minutes on feeds", StudyPlan.timerMessage(Action.Heckle(Gag.SPLAT, 15), 15, 60))
        assertEquals(null, StudyPlan.timerMessage(Action.Steal, 15, 60))
    }
}
