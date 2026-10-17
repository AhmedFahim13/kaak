package app.kaak.core

/** How Kaak checks that a bribe was actually done. */
enum class Check {
    HONOR,       // Kaak takes your word (max 3 a day)
    PHONE_DOWN,  // screen off for N minutes straight
    STEPS,       // built-in step counter
    APP_TIME,    // a chosen app in the foreground for N minutes
    CALL,        // the phone app in the foreground for N minutes
    NOTE,        // write at least N words in Kaak's notepad (never saved)
    BREATHING,   // N minutes of guided breathing, phone held still
    STRETCH,     // in-app stretch routine
    CANVAS,      // draw Kaak, at least N strokes
    BEDTIME,     // automatic: no feeds after bedtime
    PHOTO_PAIR,  // live before/after photos, same place, changed, at least N seconds apart
    REPS,        // squats (motion) or push-ups (proximity), N reps
    STAIRS,      // N floors climbed, from air pressure (steps if no barometer)
    MOVING,      // N minutes up and about: time plus steps
    TYPING,      // some typing in your chat app (counted, never read)
}

data class Bribe(
    val id: String,
    val title: String,
    val check: Check,
    /** Minutes, steps, words or strokes, depending on [check]. */
    val amount: Int = 0,
    val rewardMin: Int,
    val loot: String? = null,
    val trust: Int = 0,
    val quietHour: Boolean = false,
    val selectable: Boolean = true,
)

/** The bribe table from the v0 plan, plus the in-app stretch and drawing detours. */
object BribeCatalog {
    val ALL: List<Bribe> = listOf(
        Bribe("water", "Drink a glass of water", Check.PHOTO_PAIR, 20, 5),
        Bribe("eyes", "Phone face-down for 2 min: look out a window", Check.PHONE_DOWN, 2, 5),
        Bribe("tidy", "Tidy your desk or make your bed", Check.PHOTO_PAIR, 120, 5),
        Bribe("squats", "20 squats or push-ups", Check.REPS, 20, 5),
        Bribe("stretch", "5-minute stretch", Check.STRETCH, 5, 5, "rubber band"),
        Bribe("breathing", "3-min guided breathing", Check.BREATHING, 3, 5, "feather"),
        Bribe("plan", "Plan tomorrow: write your top 3 tasks", Check.NOTE, 6, 5, "pencil stub"),
        Bribe("draw", "Draw Kaak while he poses", Check.CANVAS, 8, 5, "crayon"),
        Bribe("reply", "Reply to one message you've been avoiding", Check.TYPING, 15, 5, trust = 1),
        Bribe("steps1k", "Walk 1,000 steps", Check.STEPS, 1_000, 10, "bottle cap"),
        Bribe("feed", "Feed Kaak: write 3 good things about today", Check.NOTE, 30, 10, "seed"),
        Bribe("stairs", "Climb 5 floors of stairs", Check.STAIRS, 5, 10, "marble"),
        Bribe("chores", "10 min of chores: dishes, laundry, helping at home", Check.MOVING, 10, 10),
        Bribe("meal", "Eat a meal without the phone", Check.PHONE_DOWN, 15, 10, "tea cup"),
        Bribe("quiet", "Prayer or a quiet break of your choice", Check.PHONE_DOWN, 10, 10),
        Bribe("lesson", "One lesson in a learning app", Check.APP_TIME, 5, 10, "book page"),
        Bribe("podcast", "Listen to a podcast or audiobook episode", Check.APP_TIME, 15, 10, "tangled earphones"),
        Bribe("call", "Call a friend or family member", Check.CALL, 3, 10, trust = 1),
        Bribe("skill", "Practice a skill: instrument, drawing, coding", Check.PHONE_DOWN, 15, 10, "guitar pick"),
        Bribe("steps3k", "Walk 3,000 steps", Check.STEPS, 3_000, 15, "coin"),
        Bribe("study", "25-min study or reading session", Check.PHONE_DOWN, 25, 15, "candle"),
        Bribe("todo", "Finish one to-do you've been avoiding", Check.PHOTO_PAIR, 300, 15, trust = 1),
        Bribe("steps5k", "Walk 5,000 steps", Check.STEPS, 5_000, 20, "key", trust = 1),
        Bribe("steps10k", "Walk 10,000 steps", Check.STEPS, 10_000, 0, "golden spoon", trust = 3, quietHour = true),
        Bribe("stretch1", "A 60-second stretch", Check.STRETCH, 1, 2, selectable = false),
        Bribe("focus15", "15 minutes on the thing you're avoiding", Check.PHONE_DOWN, 15, 10, "pencil stub", selectable = false),
        Bribe("bedtime", "Go to bed on time", Check.BEDTIME, rewardMin = 0, loot = "morning gift", trust = 1, selectable = false),
    )

    fun byId(id: String?): Bribe? = ALL.firstOrNull { it.id == id }
}

data class LedgerDay(val day: Int, val minutes: Int = 0, val honor: Int = 0)

sealed interface ClaimResult {
    data class Granted(
        val minutes: Int,
        val loot: String?,
        val trust: Int,
        val quietHour: Boolean,
        /** True when the 30-minute daily cap cut the minutes. */
        val capped: Boolean,
    ) : ClaimResult

    data class Refused(val reason: String) : ClaimResult
}

/**
 * Daily caps: at most [minuteCap] bribe minutes and [honorCap] honor-based bribes.
 * Big efforts still pay loot and trust after the minute cap is hit, so walking
 * always pays even when it can't buy more feed.
 */
class BribeLedger(
    var today: LedgerDay = LedgerDay(-1),
    private val minuteCap: Int = 30,
    private val honorCap: Int = 3,
) {
    fun minutesLeft(dayKey: Int): Int = minuteCap - day(dayKey).minutes
    fun honorLeft(dayKey: Int): Int = honorCap - day(dayKey).honor
    fun minutesToday(dayKey: Int): Int = day(dayKey).minutes

    /** [honor] = Kaak couldn't check it (no sensor, or the user chose honor). Max [honorCap] a day. */
    fun claim(b: Bribe, dayKey: Int, honor: Boolean = b.check == Check.HONOR): ClaimResult {
        val d = day(dayKey)
        if (honor && d.honor >= honorCap) {
            return ClaimResult.Refused("Kaak has stopped believing you for today. Try one he can check.")
        }
        val minutes = minOf(b.rewardMin, minuteCap - d.minutes).coerceAtLeast(0)
        today = d.copy(minutes = d.minutes + minutes, honor = d.honor + if (honor) 1 else 0)
        return ClaimResult.Granted(minutes, b.loot, b.trust, b.quietHour, capped = minutes < b.rewardMin)
    }

    private fun day(dayKey: Int): LedgerDay = if (today.day == dayKey) today else LedgerDay(dayKey).also { today = it }
}
