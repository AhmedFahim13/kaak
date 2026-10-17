package app.kaak.core

import kotlin.random.Random

enum class DetourType(val label: String) {
    LEARN("Learn"), CONNECT("Connect"), MOVE("Move"), MAKE("Make"), CLEAR("Clear"), REST("Rest"),
}

/** What one tap on the detour opens. */
enum class Opener {
    CHOSEN_APP,  // an app the user picked for this detour (Duolingo, a podcast app...)
    DIAL_FRIEND, // the dialer with the friend's number from setup
    TASK,        // one of Kaak's own task screens (steps, note, breathing...)
    TIMER,       // a 10-minute countdown, then an honor check
    NAP,         // sets a 20-minute timer in the clock app
    SLEEP,       // goodnight
}

enum class Slot { MORNING, DAY, EVENING, NIGHT }

data class Detour(
    val id: String,
    val title: String,
    val type: DetourType,
    val opener: Opener,
    /** Finishing the detour pays this bribe's loot and trust (and minutes, within the cap). */
    val bribeId: String?,
    val slots: Set<Slot>,
)

object DetourCatalog {
    private val ALL_DAY = setOf(Slot.MORNING, Slot.DAY, Slot.EVENING, Slot.NIGHT)

    val ALL: List<Detour> = listOf(
        Detour("duolingo", "One Duolingo or Anki lesson", DetourType.LEARN, Opener.CHOSEN_APP, "lesson", setOf(Slot.MORNING, Slot.DAY)),
        Detour("learn_video", "A 10 Minute School video or saved article", DetourType.LEARN, Opener.CHOSEN_APP, "lesson", setOf(Slot.DAY)),
        Detour("podcast", "A podcast or audiobook episode", DetourType.LEARN, Opener.CHOSEN_APP, "podcast", setOf(Slot.MORNING, Slot.DAY, Slot.EVENING)),
        Detour("call_friend", "Call the friend you chose", DetourType.CONNECT, Opener.DIAL_FRIEND, "call", setOf(Slot.DAY, Slot.EVENING)),
        Detour("voice_note", "Send a voice note to family", DetourType.CONNECT, Opener.CHOSEN_APP, "reply", setOf(Slot.DAY, Slot.EVENING)),
        Detour("text_someone", "Text someone you haven't talked to in a while", DetourType.CONNECT, Opener.CHOSEN_APP, "reply", setOf(Slot.DAY, Slot.EVENING)),
        Detour("walk", "1,000-step walk", DetourType.MOVE, Opener.TASK, "steps1k", setOf(Slot.MORNING, Slot.DAY, Slot.EVENING)),
        Detour("stretch", "5-min stretch", DetourType.MOVE, Opener.TASK, "stretch", setOf(Slot.MORNING, Slot.DAY, Slot.EVENING)),
        Detour("stairs", "Climb the stairs", DetourType.MOVE, Opener.TASK, "stairs", setOf(Slot.DAY, Slot.EVENING)),
        Detour("draw_kaak", "Draw Kaak while he poses smugly", DetourType.MAKE, Opener.TASK, "draw", setOf(Slot.DAY, Slot.EVENING)),
        Detour("tea", "Make tea or cook something simple", DetourType.MAKE, Opener.TIMER, "chores", setOf(Slot.MORNING, Slot.EVENING)),
        Detour("feed_kaak", "Feed Kaak 3 good things about today", DetourType.MAKE, Opener.TASK, "feed", setOf(Slot.EVENING, Slot.NIGHT)),
        Detour("focus", "Do the avoided task for 25 min", DetourType.CLEAR, Opener.TASK, "study", setOf(Slot.MORNING, Slot.DAY)),
        Detour("tidy", "Tidy one surface", DetourType.CLEAR, Opener.TIMER, "tidy", setOf(Slot.MORNING, Slot.DAY, Slot.EVENING)),
        Detour("plan", "Plan tomorrow's top 3", DetourType.CLEAR, Opener.TASK, "plan", setOf(Slot.EVENING, Slot.NIGHT)),
        Detour("breathe", "3-min breathing", DetourType.REST, Opener.TASK, "breathing", ALL_DAY),
        Detour("nap", "20-min nap", DetourType.REST, Opener.NAP, null, setOf(Slot.DAY)),
        Detour("sleep", "Go to sleep", DetourType.REST, Opener.SLEEP, null, setOf(Slot.NIGHT)),
    )

    /** Used until the user picks their own in onboarding: none need setup. */
    val DEFAULT_IDS = listOf("walk", "breathe", "plan", "stretch", "feed_kaak")

    fun byId(id: String?): Detour? = ALL.firstOrNull { it.id == id }

    fun slotFor(hour: Int): Slot = when (hour) {
        in 5..10 -> Slot.MORNING
        in 11..16 -> Slot.DAY
        in 17..20 -> Slot.EVENING
        else -> Slot.NIGHT
    }
}

object DetourPicker {
    /**
     * Three detours from the user's list, each of a different type, preferring
     * ones that fit the time of day and weren't shown recently.
     * After bedtime, only Rest detours, with "Go to sleep" always first.
     */
    fun pick(
        chosenIds: Collection<String>,
        hour: Int,
        bedtime: Boolean,
        recent: Set<String>,
        random: Random = Random.Default,
        count: Int = 3,
    ): List<Detour> {
        val ids = chosenIds.ifEmpty { DetourCatalog.DEFAULT_IDS }
        val chosen = DetourCatalog.ALL.filter { it.id in ids }
        if (bedtime) {
            val sleep = DetourCatalog.byId("sleep")!!
            val rest = chosen.filter { it.type == DetourType.REST && it.id != "sleep" && it.id != "nap" }
            return (listOf(sleep) + rest.shuffled(random)).take(count)
        }
        val slot = DetourCatalog.slotFor(hour)
        val ranked = chosen.filter { it.opener != Opener.SLEEP }.shuffled(random).sortedBy { d ->
            (if (slot in d.slots) 0 else 2) + (if (d.id in recent) 1 else 0)
        }
        val picked = mutableListOf<Detour>()
        for (d in ranked) if (picked.size < count && picked.none { it.type == d.type }) picked += d
        for (d in ranked) if (picked.size < count && d !in picked) picked += d
        return picked
    }
}
