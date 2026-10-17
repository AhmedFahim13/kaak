package app.kaak.core

enum class Verdict { MINDLESS, NOT_MINDLESS, UNSURE }

data class Detection(val verdict: Verdict, val reason: String)

/**
 * Cold-start thresholds. Tune these during week-1 dogfooding using the live
 * detector panel in the app. Week 6 replaces them with a personal model.
 */
data class DetectorConfig(
    // Reels and Shorts often hold you 15–40 s each, so long dwell is still mindless.
    // Only really slow browsing (under 1 swipe a minute) or typing counts as intentional.
    val minSwipesPerMin: Double = 1.0,
    val maxMedianDwellMs: Long = 45_000L,
    val minSwipesForVerdict: Int = 3,
    /** No swipe for this long = watching one thing on purpose. */
    val longWatchMs: Long = 3 * MINUTE_MS,
    val lateNightStartHour: Int = 23,
    val lateNightEndHour: Int = 5,
    /** < 1 makes late-night thresholds easier to trip. */
    val lateNightLeniency: Double = 0.75,
    /** Typing within this long counts as intentional use. */
    val typingGraceMs: Long = 60_000L,
) {
    /** Work hours: Kaak needs much stronger evidence before calling it mindless. */
    fun forWork() = copy(
        minSwipesPerMin = minSwipesPerMin * 1.5,
        maxMedianDwellMs = (maxMedianDwellMs * 0.66).toLong(),
        typingGraceMs = 3 * MINUTE_MS,
    )
}

class RuleDetector(private val config: DetectorConfig = DetectorConfig()) {

    fun isLateNight(hourOfDay: Int): Boolean =
        hourOfDay >= config.lateNightStartHour || hourOfDay < config.lateNightEndHour

    fun evaluate(stats: ScrollStats, hourOfDay: Int): Detection {
        val typed = stats.msSinceTyping?.let { it <= config.typingGraceMs } ?: stats.typedRecently
        if (typed) return Detection(Verdict.NOT_MINDLESS, "typing")
        if (stats.msSinceActivity > config.longWatchMs) {
            return Detection(Verdict.NOT_MINDLESS, "watching one thing")
        }
        if (stats.swipesInWindow < config.minSwipesForVerdict || stats.medianDwellMs == null) {
            return Detection(Verdict.UNSURE, "not enough scrolling yet")
        }
        val night = isLateNight(hourOfDay)
        val minRate = if (night) config.minSwipesPerMin * config.lateNightLeniency else config.minSwipesPerMin
        val maxDwell = if (night) (config.maxMedianDwellMs / config.lateNightLeniency).toLong() else config.maxMedianDwellMs
        return if (stats.swipesPerMin >= minRate && stats.medianDwellMs <= maxDwell) {
            Detection(Verdict.MINDLESS, if (night) "fast swipes, short dwell, late night" else "fast swipes, short dwell")
        } else {
            Detection(Verdict.NOT_MINDLESS, "slow browsing")
        }
    }
}
