package app.kaak.core

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.random.Random

/** What a tester experiences. The normal app is always KAAK. */
enum class Phase(val label: String) {
    BASELINE("Baseline: nothing appears"),
    KAAK("Kaak"),
    TIMER("Plain timer"),
}

/**
 * The beta, from the v0 plan, run by the app itself so nobody has to swap APKs:
 * days 1–7 silent baseline (logs and "worth it?" only), then each tester is
 * randomly assigned full Kaak or a plain timer at the same thresholds.
 * A researcher code can override the phase for a single phone.
 */
object StudyPlan {
    const val BASELINE_DAYS = 7L

    /**
     * Researcher codes, stored only as SHA-256 hashes so nobody can read them out
     * of the APK. The codes themselves are kept by the study team, not in the repo.
     */
    private val CODE_HASHES: Map<String, Phase?> = mapOf(
        "8a400645efcd222a0883a973427d3e0cf8956ec8a616ffc6ea57c2c2b52eb16d" to Phase.KAAK,
        "8e0df828aadd742fc00c496c09cd79c5ac780609e4bf5099fadcc06f4c4a4fea" to Phase.TIMER,
        "ba10b0c18a71b85b7544217013c753b7f560a44e8d415b89a2bff975697a79d0" to Phase.BASELINE,
        "f447124226efece6c795b78fc825ec31a755985f81c17fd6c88fc20548d4ebdb" to null,
    )

    /** Null if not a code; otherwise the phase it forces (Phase? = null means back to automatic). */
    fun lookup(code: String): Result<Phase?>? {
        val h = Codes.hash(code)
        return if (h in CODE_HASHES) Result.success(CODE_HASHES[h]) else null
    }

    fun assignArm(random: Random = Random.Default): Phase = if (random.nextBoolean()) Phase.KAAK else Phase.TIMER

    fun day(enrolled: LocalDate, today: LocalDate): Long = ChronoUnit.DAYS.between(enrolled, today) + 1

    fun phase(study: Boolean, enrolled: LocalDate?, today: LocalDate, arm: Phase, override: Phase?): Phase = when {
        !study -> Phase.KAAK
        override != null -> override
        enrolled == null -> Phase.BASELINE
        day(enrolled, today) <= BASELINE_DAYS -> Phase.BASELINE
        else -> arm
    }

    /**
     * Rules per phase. Baseline: Kaak watches and logs, but never acts (quiet, no limit).
     * Timer: same thresholds as Kaak, so the two arms are comparable; no jumpscares.
     */
    fun adjust(rules: Rules, phase: Phase): Rules = when (phase) {
        Phase.KAAK -> rules
        Phase.BASELINE -> rules.copy(quiet = true, dailyLimitMs = 24 * 60 * MINUTE_MS, jumpscareAllowed = false)
        Phase.TIMER -> rules.copy(jumpscareAllowed = false, trust = TrustLevel.FRIEND)
    }

    /** What the timer arm says instead of a crow. Null = say nothing. */
    fun timerMessage(action: Action, sessionMin: Int, limitMin: Int): String? = when (action) {
        Action.Arrive, Action.Jumpscare -> "$sessionMin minutes on feeds"
        is Action.Heckle -> "${action.minutes} minutes on feeds"
        is Action.Warn -> "${action.minutesLeft} minutes left of your $limitMin-minute limit"
        Action.Eat -> "Daily limit reached ($limitMin minutes)"
        is Action.Asleep -> "You're over your daily limit today"
        else -> null
    }
}
