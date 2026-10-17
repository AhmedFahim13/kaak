package app.kaak.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

/** Regression tests for the first real-phone test (Instagram, 11:27 to 12:24). */
class FixesTest {
    private fun arrived(rules: Rules = Rules(jumpscareAllowed = false)): Pair<KaakBrain, Long> {
        val b = KaakBrain(rules = rules, random = Random(5))
        b.onForeground(true, 0)
        val (t, a) = b.scrollFor(0, 11.0, 5_000)
        assertTrue(Action.Arrive in a)
        return b to t
    }

    @Test
    fun reelsWithLongDwellAllCount() {
        val b = KaakBrain(rules = Rules(jumpscareAllowed = false, dailyLimitMs = 600 * MINUTE_MS), random = Random(1))
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 20.0, 30_000) // one reel every 30 seconds
        assertTrue("daily ${b.dailyMs / 60_000.0}", b.dailyMs >= 19 * MINUTE_MS)
        assertTrue(Action.Arrive in actions)
    }

    @Test
    fun theftLocksEveryFeedUntilTheChaseIsWon() {
        val (b, t) = arrived()
        b.onForeground(false, t)
        assertEquals(Action.Steal, b.onForeground(true, t + 30_000))
        assertEquals(Action.Hide, b.onForeground(false, t + 31_000)) // sent home
        assertEquals(Action.Bounce, b.onForeground(true, t + 35_000)) // tapped the icon again
        assertEquals(Action.Bounce, b.onForeground(true, t + 90_000))
        b.chaseWon(t + 100_000)
        assertFalse(b.onForeground(true, t + 101_000) is Action.Bounce)
    }

    @Test
    fun aLostChaseLocksFeedsForThreeMinutes() {
        val (b, t) = arrived()
        b.onForeground(false, t)
        b.onForeground(true, t + 30_000)
        b.onForeground(false, t + 31_000)
        b.chaseLost(t + 45_000)
        assertEquals(Action.Bounce, b.onForeground(true, t + 2 * MINUTE_MS))
        assertFalse(b.onForeground(true, t + 4 * MINUTE_MS) is Action.Bounce)
    }

    @Test
    fun nudgesComeBetweenGags() {
        val b = KaakBrain(rules = Rules(jumpscareAllowed = false, dailyLimitMs = 600 * MINUTE_MS), random = Random(2))
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 30.0, 5_000)
        val nudges = actions.count { it is Action.Nudge }
        val gags = actions.count { it is Action.Heckle }
        assertTrue("nudges $nudges", nudges >= 12)
        assertTrue("gags $gags", gags >= 4)
    }

    @Test
    fun comingBackOftenDoesNotDelayGags() {
        val b = KaakBrain(rules = Rules(jumpscareAllowed = false, dailyLimitMs = 600 * MINUTE_MS), random = Random(4))
        b.onForeground(true, 0)
        var t = b.scrollFor(0, 15.0, 5_000).first
        var gags = 0
        repeat(10) { // leave for 3 minutes and come back, ten times
            b.onForeground(false, t); t += 3 * MINUTE_MS; b.onForeground(true, t)
            val (t2, a) = b.scrollFor(t, 2.0, 5_000); t = t2
            gags += a.count { it is Action.Heckle }
        }
        assertTrue("gags $gags", gags >= 5)
    }

    @Test
    fun sliderValuesOverrideTheChaosPreset() {
        val b = KaakBrain(rules = Rules(arrivalMs = 2 * MINUTE_MS, heckleMs = 3 * MINUTE_MS, gapMs = MINUTE_MS, jumpscareAllowed = false), random = Random(3))
        b.onForeground(true, 0)
        val (_, actions) = b.scrollFor(0, 8.0, 5_000)
        assertTrue(Action.Arrive in actions.take(3))
        assertTrue(actions.count { it is Action.Heckle } >= 3)
    }

    @Test
    fun visitingKaaksOwnAppIsNotATheft() {
        val (b, t) = arrived()
        b.forgiveNextReturn(t)
        b.onForeground(false, t)
        assertEquals(Action.Return, b.onForeground(true, t + 20_000))
    }
}

class ReviewFixesTest {
    @Test
    fun aShareSheetOrPermissionDialogIsNotLeaving() {
        val b = KaakBrain(rules = Rules(jumpscareAllowed = false), random = Random(5))
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 11.0, 5_000)
        b.onForeground(false, t)
        assertEquals(Action.Resume, b.onForeground(true, t + 4_000)) // no theft, no "again?"
    }

    @Test
    fun aQuickHopStillCannotSneakPastTheNap() {
        val b = KaakBrain(rules = Rules(dailyLimitMs = 10 * MINUTE_MS, jumpscareAllowed = false), random = Random(5))
        b.onForeground(true, 0)
        val (t, _) = b.scrollFor(0, 11.0, 5_000)
        b.onForeground(false, t)
        assertTrue(b.onForeground(true, t + 3_000) is Action.Asleep)
    }

    @Test
    fun aLongVideoWatchedOnPurposeDoesNotEatTheLimit() {
        val b = KaakBrain(rules = Rules(dailyLimitMs = 30 * MINUTE_MS, jumpscareAllowed = false), random = Random(5))
        b.onForeground(true, 0)
        b.onScroll(1_000); b.onScroll(4_000)
        var t = 5_000L
        while (t < 40 * MINUTE_MS) { t += TICK; b.tick(t, NOON, DAY) } // one 40-minute video, no swipes
        assertTrue("daily ${b.dailyMs / 60_000.0}", b.dailyMs < 4 * MINUTE_MS)
    }
}

class SilentAppsTest {
    @Test
    fun anAppThatNeverScrollsBecomesSilentAndUsesContentChanges() {
        val s = SilentApps()
        repeat(9) { s.onFeedTime("com.feed", MINUTE_MS) }
        assertFalse("com.feed" in s.silent)
        assertTrue(s.onFeedTime("com.feed", MINUTE_MS))
        assertTrue(s.proxySwipe("com.feed", 0))
        assertFalse(s.proxySwipe("com.feed", 500)) // throttled
        assertTrue(s.proxySwipe("com.feed", 2_000))
        assertFalse(s.proxySwipe("com.other", 5_000))
    }

    @Test
    fun oneRealScrollTakesItOffTheList() {
        val s = SilentApps(known = setOf("com.feed"))
        assertTrue(s.onScroll("com.feed"))
        assertFalse(s.proxySwipe("com.feed", 0))
        repeat(20) { s.onFeedTime("com.feed", MINUTE_MS) } // it scrolled once: never silent again this run
        assertFalse("com.feed" in s.silent)
    }
}

class CommitmentTest {
    @Test
    fun holdsGetLongerThroughTheDay() {
        assertEquals(listOf(20, 40, 60, 90, 90), (0..4).map { EscapeRules.holdSeconds(it) })
    }

    @Test
    fun theSentenceChangesAndMustBeTypedButNotPerfectly() {
        val p = EscapeRules.phrase(0, DAY, 12)
        assertTrue(EscapeRules.phraseOk(p.lowercase(), p))
        assertTrue(EscapeRules.phraseOk("  " + p.replace(",", "").replace(".", "!!") + " ", p))
        assertFalse(EscapeRules.phraseOk(p.substringBeforeLast(" "), p))
        val second = EscapeRules.phrase(1, DAY, 12)
        assertTrue(second != p) // a new sentence for the next escape
        assertFalse(EscapeRules.phraseOk(p, second)) // last time's sentence doesn't work
        assertTrue((0..9).map { EscapeRules.phrase(it % 5, DAY + it / 5, 7) }.toSet().size >= 5)
    }

    @Test
    fun strictModeEndsOnTimeOrFifteenMinutesAfterAsking() {
        val until = 10 * 60 * MINUTE_MS
        assertTrue(StrictPlan.active(MINUTE_MS, until, null))
        assertFalse(StrictPlan.active(until, until, null))
        assertTrue(StrictPlan.active(10 * MINUTE_MS, until, coolOffAt = 0))
        assertFalse(StrictPlan.active(16 * MINUTE_MS, until, coolOffAt = 0))
        assertEquals(5 * MINUTE_MS, StrictPlan.coolOffLeftMs(10 * MINUTE_MS, 0))
    }

    @Test
    fun onlyKaaksOwnQuitScreensAreCaught() {
        assertTrue(StrictPlan.isQuitScreen("com.google.android.packageinstaller", "Kaak Do you want to uninstall this app?"))
        assertTrue(StrictPlan.isQuitScreen("com.android.settings", "Kaak"))
        assertFalse(StrictPlan.isQuitScreen("com.android.settings", "Kaakoo Notes")) // a different app
        assertFalse(StrictPlan.isQuitScreen("com.google.android.packageinstaller", "Instagram Do you want to uninstall this app?"))
        assertFalse(StrictPlan.isQuitScreen("com.whatsapp", "Kaak"))
    }

    @Test
    fun oemSettingsHomesAreWatchedToo() {
        // Seen on the Android 17 emulator: the uninstall dialog carries the app's name
        assertTrue(StrictPlan.isQuitScreen("com.google.android.packageinstaller", "Uninstall this app? Kaak Cancel Uninstall"))
        // One UI 5 accessibility settings; MIUI/HyperOS app details
        assertTrue(StrictPlan.isQuitScreen("com.samsung.accessibility", "Kaak"))
        assertTrue(StrictPlan.isQuitScreen("com.miui.securitycenter", "Kaak"))
        assertTrue(StrictPlan.isQuitScreen("com.miui.packageinstaller", "Kaak"))
        assertTrue(StrictPlan.isQuitScreen("com.samsung.android.packageinstaller", "Kaak"))
        // Still only Kaak's own screens
        assertFalse(StrictPlan.isQuitScreen("com.miui.securitycenter", "Instagram"))
        assertFalse(StrictPlan.isQuitScreen("com.samsung.accessibility", "Accessibility"))
    }

    private val launcher = "com.google.android.apps.nexuslauncher"

    @Test
    fun appInfoRightAfterTappingKaakIsCaught() {
        // Settings > Apps > Kaak: the App info title is just "App info", so the tap gives it away
        val w = KaakTapWatch()
        w.onTap("com.android.settings", launcher, "Kaak 3.4 MB", now = 0)
        assertTrue(w.onWindow("com.android.settings", launcher, now = 800))
        assertFalse(w.onWindow("com.android.settings", launcher, now = 900)) // caught once, then disarmed
        // home screen: long-press Kaak, the popup, then App info a few seconds later
        w.onTap(launcher, launcher, "Kaak", now = 10_000)
        assertFalse(w.onWindow(launcher, launcher, now = 10_500))
        assertTrue(w.onWindow("com.android.settings", launcher, now = 14_000))
    }

    @Test
    fun otherTapsAndLaterSettingsVisitsAreLeftAlone() {
        val w = KaakTapWatch()
        w.onTap("com.android.settings", launcher, "Instagram", now = 0) // another app's App info
        assertFalse(w.onWindow("com.android.settings", launcher, now = 500))
        w.onTap("com.whatsapp", launcher, "Kaak", now = 1_000)            // a chat, never read
        assertFalse(w.onWindow("com.android.settings", launcher, now = 1_500))
        w.onTap(launcher, launcher, "Kaak", now = 2_000)                  // tapped to open Kaak himself
        assertFalse(w.onWindow("app.kaak", launcher, now = 2_400))
        assertFalse(w.onWindow("com.android.settings", launcher, now = 5_000))
        w.onTap(launcher, launcher, "Kaak", now = 20_000)                 // too long ago
        assertFalse(w.onWindow("com.android.settings", launcher, now = 20_000 + StrictPlan.TAP_ARM_MS + 1))
    }

    @Test
    fun aSlowPickFromTheLongPressMenuStillCounts() {
        // seen on the emulator: long-press Kaak, read the menu for 17 s, then tap "App info" or "Pause app"
        val w = KaakTapWatch()
        w.onTap(launcher, launcher, "Kaak Predicted app: Kaak", now = 0)
        w.onTap(launcher, launcher, "App info", now = 17_000)
        assertTrue(w.onWindow("com.android.settings", launcher, now = 17_600))
        w.onTap(launcher, launcher, "Kaak", now = 30_000)
        w.onTap(launcher, launcher, "Pause app", now = 45_000)
        assertTrue(w.onWindow("com.google.android.apps.wellbeing", launcher, now = 45_500))
        // a launcher tap with nothing armed arms nothing
        w.onTap(launcher, launcher, "App info", now = 60_000)
        assertFalse(w.onWindow("com.android.settings", launcher, now = 60_500))
    }
}

class SpacingTest {
    @Test
    fun noTwoInterruptionsWithinFifteenSeconds() {
        // the settings from the second phone test: shows up at 5, acts up every minute, limit 15
        val b = KaakBrain(rules = Rules(arrivalMs = 5 * MINUTE_MS, heckleMs = 7 * MINUTE_MS, gapMs = MINUTE_MS, nudgeMs = 25_000,
            dailyLimitMs = 15 * MINUTE_MS), random = Random(8))
        b.onForeground(true, 0)
        val times = mutableListOf<Pair<Long, Action>>()
        var t = 0L
        while (t < 15 * MINUTE_MS) {
            t += TICK; b.onScroll(t)
            val a = b.tick(t, NOON, DAY).action
            if (a != Action.None) times += t to a
        }
        val spaced = times.filter { it.second !is Action.Warn && it.second != Action.Eat }
        spaced.zipWithNext().forEach { (x, y) -> assertTrue("${x.second} then ${y.second} ${(y.first - x.first) / 1000}s apart", y.first - x.first >= 15_000) }
        val per10 = spaced.count { it.first > 5 * MINUTE_MS }
        assertTrue("$per10 interruptions in 10 min", per10 in 12..26)
        assertTrue(times.any { it.second == Action.Eat })
    }
}
