package app.kaak.core

const val MINUTE_MS = 60_000L

/**
 * How mean Kaak is. Times are minutes of *mindless* feed time before each stage.
 * gapMs is the average pause between heckles (jittered ±30%).
 */
enum class Chaos(val label: String, val arrivalMs: Long, val heckleMs: Long, val gapMs: Long) {
    PIGEON("Pigeon (gentle)", 15 * MINUTE_MS, 25 * MINUTE_MS, 4 * MINUTE_MS),
    KAAK("Kaak (default)", 10 * MINUTE_MS, 15 * MINUTE_MS, 150_000L),
    MONKEY("Monkey (harsh)", 6 * MINUTE_MS, 10 * MINUTE_MS, 90_000L);

    fun gentler(): Chaos = entries[(ordinal - 1).coerceAtLeast(0)]
}

/** Heckle gags. */
enum class Gag { WALK_ACROSS, SIT_ON_RAIL, SPLAT }

enum class JumpscareLevel(val label: String) {
    OFF("Off"),
    GENTLE("Gentle: a thud, no crack"),
    MEDIUM("Medium (default)"),
    FULL("Full: crack, shake, KAA!"),
}

/** What the brain wants the overlay to do. */
sealed interface Action {
    data object None : Action
    data object Hide : Action
    data object Arrive : Action
    data object Return : Action
    data class Heckle(val gag: Gag, val minutes: Int) : Action
    /** Reopened a feed within 2 minutes of leaving: Kaak snatches it. */
    data object Steal : Action
    data object Jumpscare : Action
    /** Daily limit reached: Kaak eats the feed. */
    data object Eat : Action
    /** A feed was opened while Kaak is still full. */
    data class Asleep(val minutesLeft: Int) : Action
    /** Cooldown ended while the user was sitting on the asleep screen. */
    data object Wake : Action
    data class Warn(val minutesLeft: Int) : Action
    /** A small poke between gags: a hop, a peck, today's feed minutes. */
    data class Nudge(val minutes: Int) : Action
    /** Back from a quick hop (share sheet, permission dialog, screen lock): Kaak just perches again, no "again?". */
    data object Resume : Action
    /** A feed was opened while Kaak still holds it after a theft: straight back home. */
    data object Bounce : Action
}

/** Everything the brain needs from settings and the clock, refreshed every tick. */
data class Rules(
    val chaos: Chaos = Chaos.KAAK,
    val dailyLimitMs: Long = 60 * MINUTE_MS,
    /** Minutes earned from bribes today. */
    val bonusMs: Long = 0,
    val bedtime: Boolean = false,
    val jumpscareAllowed: Boolean = true,
    /** Quiet hour from the 10,000-step bribe: no gags, limit still applies. */
    val quiet: Boolean = false,
    /** Work hours for sellers and creators: stricter "mindless" test, no theft, no jumpscares. */
    val work: Boolean = false,
    val trust: TrustLevel = TrustLevel.STRANGER,
    /** User's own slider values; null = the chaos preset. */
    val arrivalMs: Long? = null,
    val heckleMs: Long? = null,
    val gapMs: Long? = null,
    /** Small pokes between gags, at most this often. */
    val nudgeMs: Long = 35_000L,
)

/**
 * Trust grows with good days and bribes and never resets; a bad day costs a
 * little. Higher trust makes Kaak calmer: rarer gags, earlier warnings, and
 * from Friend on he sits beside the feed instead of stealing it.
 */
enum class TrustLevel(
    val label: String,
    val minPoints: Int,
    val gapFactor: Double,
    val warnBeforeMin: Int,
    val steals: Boolean,
    val jumpscareFactor: Double,
) {
    STRANGER("Stranger", 0, 1.0, 5, true, 1.0),
    NEIGHBOUR("Neighbour", 5, 1.25, 7, true, 0.75),
    FRIEND("Friend", 15, 1.5, 10, false, 0.5),
    FAMILY("Family", 30, 2.0, 10, false, 0.25);

    val next: TrustLevel? get() = entries.getOrNull(ordinal + 1)

    companion object {
        fun of(points: Int): TrustLevel = entries.last { points >= it.minPoints }
    }
}

/** The one-tap answer to "Why are you scrolling?" */
enum class Mood(val label: String) { BORED("Bored"), TIRED("Tired"), AVOIDING("Avoiding something"), LONELY("Lonely") }

/** Subtitle language. English is the default; the others are opt-in in settings. */
enum class Lang(val label: String) {
    ENGLISH("English (default)"),
    BANGLISH("Banglish"),
    BANGLA("বাংলা"),
}
