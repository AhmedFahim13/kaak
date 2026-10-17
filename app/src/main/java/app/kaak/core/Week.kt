package app.kaak.core

import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.random.Random

/** One day of aggregate numbers. Feeds the trust score and Kaak Times. */
data class DayStats(
    val day: Int,
    val mindlessMin: Int = 0,
    val feedOpens: Int = 0,
    /** Thefts, asleep screens and eatings: times Kaak stopped an open. */
    val foiled: Int = 0,
    val eaten: Int = 0,
    val escapes: Int = 0,
    val bribes: Int = 0,
    val steps: Int = 0,
    val returnedMin: Int = 0,
    val longestSessionMin: Int = 0,
    /** Latest feed use between 9 p.m. and 5 a.m., as minutes after 9 p.m.; -1 = none. */
    val lateMinute: Int = -1,
    val worthYes: Int = 0,
    val worthNo: Int = 0,
    val chasesWon: Int = 0,
    val moodChecks: Int = 0,
)

object Trust {
    /** Good day +2 (under half the limit) or +1 (under the limit); eaten or escaped -1. Never below zero. */
    fun dayDelta(d: DayStats, limitMin: Int): Int = when {
        d.eaten > 0 || d.escapes > 0 -> -1
        d.mindlessMin <= limitMin / 2 -> 2
        d.mindlessMin <= limitMin -> 1
        else -> 0
    }

    fun lateMinuteOf(minuteOfDay: Int): Int = when {
        minuteOfDay >= 21 * 60 -> minuteOfDay - 21 * 60
        minuteOfDay < 5 * 60 -> minuteOfDay + 3 * 60
        else -> -1
    }
}

/**
 * Minutes Kaak got you back. After a visit he ended (theft, eating) or
 * interrupted (you left within 2 minutes of a gag), the time until your next
 * feed visit counts, capped at 30 minutes per interruption.
 */
class ReturnedTime(private val windowMs: Long = 2 * MINUTE_MS, private val capMs: Long = 30 * MINUTE_MS) {
    private var lastGagAt: Long? = null
    private var creditFrom: Long? = null

    fun onKaakAction(now: Long, endsVisit: Boolean) {
        if (endsVisit) creditFrom = now else lastGagAt = now
    }

    fun onLeaveFeed(now: Long) {
        if (creditFrom == null && lastGagAt?.let { now - it <= windowMs } == true) creditFrom = now
        lastGagAt = null
    }

    /** Returns credited ms (0 if none). */
    fun onEnterFeed(now: Long): Long {
        val from = creditFrom ?: return 0
        creditFrom = null
        return min(now - from, capMs).coerceAtLeast(0)
    }

    /** Pays out a full cap when the user simply never came back. */
    fun flush(now: Long): Long {
        val from = creditFrom ?: return 0
        if (now - from < capMs) return 0
        creditFrom = null
        return capMs
    }
}

data class Story(val title: String, val body: String)

data class Edition(
    val weekLabel: String,
    val headline: String,
    val subhead: String,
    val stories: List<Story>,
    val weather: String,
    val classified: String,
)

/** Kaak's Sunday tabloid, written on the phone from templates. Nothing leaves the phone. */
object KaakTimes {
    data class Week(
        val opens: Int, val foiled: Int, val eaten: Int, val escapes: Int, val bribes: Int, val steps: Int,
        val returnedMin: Int, val mindlessMin: Int, val longestMin: Int, val lateMinute: Int,
        val worthYes: Int, val worthNo: Int, val chasesWon: Int, val days: Int,
    )

    fun totals(days: List<DayStats>) = Week(
        days.sumOf { it.feedOpens }, days.sumOf { it.foiled }, days.sumOf { it.eaten }, days.sumOf { it.escapes },
        days.sumOf { it.bribes }, days.sumOf { it.steps }, days.sumOf { it.returnedMin }, days.sumOf { it.mindlessMin },
        days.maxOfOrNull { it.longestSessionMin } ?: 0, days.maxOfOrNull { it.lateMinute } ?: -1,
        days.sumOf { it.worthYes }, days.sumOf { it.worthNo }, days.sumOf { it.chasesWon }, days.size,
    )

    fun hours(min: Int): String = when {
        min < 60 -> "$min MINUTES"
        min % 60 == 0 -> "${min / 60} HOURS"
        else -> "${min / 60}H ${min % 60}M"
    }

    fun clock(lateMinute: Int): String {
        val m = (21 * 60 + lateMinute) % (24 * 60)
        val h = m / 60
        val h12 = if (h % 12 == 0) 12 else h % 12
        return "%d:%02d %s".format(h12, m % 60, if (h < 12) "A.M." else "P.M.")
    }

    private class Angle(val score: Double, val headline: String, val subhead: String, val story: Story)

    fun compose(thisWeek: List<DayStats>, lastWeek: List<DayStats>, weekLabel: String, random: Random = Random.Default): Edition {
        val w = totals(thisWeek)
        val prev = totals(lastWeek)
        val angles = mutableListOf<Angle>()
        fun pick(vararg o: String) = o[random.nextInt(o.size)]

        if (w.opens > 0) angles += Angle(
            1.0 + w.foiled / 5.0,
            "LOCAL HUMAN TRIES TO OPEN FEEDS ${w.opens} TIMES",
            "Kaak foils ${w.foiled} attempts, returns ${hours(w.returnedMin).lowercase()} to victim.",
            Story("Attempts on the feed: ${w.opens}", pick(
                "Kaak stopped ${w.foiled} of them personally and describes the rest as \"a learning process.\"",
                "Of these, ${w.foiled} ended with a crow in the way. Witnesses describe the crow as smug.",
            )),
        )
        if (w.returnedMin >= 60) angles += Angle(
            w.returnedMin / 60.0,
            "${hours(w.returnedMin)} RECOVERED IN DARING CROW OPERATION",
            "Time returned to its rightful owner. Crow requests a bottle cap as payment.",
            Story("Time returned: ${hours(w.returnedMin).lowercase()}", pick(
                "That is enough to walk to Dhanmondi Lake and back. Twice. Kaak has checked.",
                "Kaak has converted this time into loot. The nest is getting heavy.",
            )),
        )
        if (prev.mindlessMin > 0 && w.days >= 3) {
            val change = ((w.mindlessMin - prev.mindlessMin) * 100.0 / prev.mindlessMin).roundToInt()
            if (change <= -10) angles += Angle(
                2.0 + -change / 10.0,
                "FEED TIME DOWN ${-change}%. CROW CLAIMS ALL CREDIT",
                "Human also claims credit. Investigation ongoing.",
                Story("Mindless scrolling down ${-change}%", "From ${prev.mindlessMin} minutes last week to ${w.mindlessMin}. Kaak would like this framed."),
            ) else if (change >= 15) angles += Angle(
                1.5 + change / 20.0,
                "SCROLLING UP ${change}% AS CROW LOOKS ON IN DISBELIEF",
                "\"I was right there,\" says crow.",
                Story("Scrolling up ${change}%", "${w.mindlessMin} minutes this week, up from ${prev.mindlessMin}. Kaak has sharpened his beak."),
            )
        }
        if (w.eaten >= 2) angles += Angle(
            1.2 + w.eaten / 2.0,
            "CROW EATS FEED ${w.eaten} TIMES, REPORTS NO REGRETS",
            "\"Delicious,\" he said, before falling asleep on it.",
            Story("Feeds eaten: ${w.eaten}", pick("Each one followed by a 20-minute nap. Kaak calls this self-care.", "Kaak's doctor has asked him to slow down.")),
        )
        if (w.escapes >= 2) angles += Angle(
            1.0 + w.escapes / 2.0,
            "HUMAN ESCAPES CROW ${w.escapes} TIMES. CROW \"REMEMBERS\"",
            "Five-second holds getting faster, sources say.",
            Story("Escapes: ${w.escapes}", "Each was legal under Clause 6. Kaak has filed each one in his memory anyway."),
        )
        if (w.steps >= 5_000) angles += Angle(
            1.0 + w.steps / 10_000.0,
            "HUMAN WALKS ${"%,d".format(w.steps)} STEPS FOR BRIBES. CROW STUNNED",
            "Legs reportedly \"fine.\"",
            Story("Steps walked for bribes: ${"%,d".format(w.steps)}", "Kaak accepted every one and is not giving any back."),
        )
        if (w.lateMinute >= 4 * 60) angles += Angle(
            1.5 + (w.lateMinute - 4 * 60) / 60.0,
            "SCROLLING DETECTED AT ${clock(w.lateMinute)}. CROW DISAPPOINTED",
            "\"It was dark. I was asleep. I still knew,\" says crow.",
            Story("Latest scroll: ${clock(w.lateMinute).lowercase()}", "Kaak recommends sleep, which is free and has no ads."),
        )
        if (w.chasesWon >= 2) angles += Angle(
            0.8 + w.chasesWon / 3.0,
            "HUMAN WINS ${w.chasesWon} CHASES. CROW DEMANDS REMATCH",
            "Feathers lost in the line of duty.",
            Story("Chases won by the human: ${w.chasesWon}", "Kaak says he was \"letting you win.\" He was not."),
        )
        if (w.worthYes + w.worthNo >= 3) angles += Angle(
            0.7,
            "SURVEY: ${w.worthNo} OF ${w.worthYes + w.worthNo} SCROLLS \"NOT WORTH IT\"",
            "Human's own words. Crow simply asked.",
            Story("Was it worth it?", "You said no ${w.worthNo} times and yes ${w.worthYes} times. Kaak keeps the receipts."),
        )
        if (w.days >= 3 && w.mindlessMin <= w.days * 20) angles += Angle(
            2.5,
            "QUIET WEEK ON THE ROOFTOP. CROW BORED, PROUD",
            "Only ${w.mindlessMin} minutes of mindless scrolling all week.",
            Story("A quiet week", "Kaak spent the time rearranging his nest and pretending not to be proud."),
        )
        if (angles.isEmpty()) angles += Angle(
            0.1,
            "CROW MOVES INTO LOCAL PHONE",
            "Neighbours describe him as \"loud\" and \"a thief.\"",
            Story("Settling in", "Kaak has unpacked. He did not bring much. He intends to take a lot."),
        )

        val ranked = angles.sortedByDescending { it.score }
        val lead = ranked.first()
        val stories = (ranked.drop(1).map { it.story } + listOf(
            Story("Bribes accepted: ${w.bribes}", if (w.bribes > 0) "Each one honest, mostly. Kaak keeps the books." else "None. Kaak is open to offers."),
            Story("Longest scroll: ${w.longestMin} minutes", "Kaak was present for all of it."),
        )).distinctBy { it.title }.take(3)

        val avg = if (w.days > 0) w.mindlessMin / w.days else 0
        val weather = when {
            avg <= 15 -> "Feed forecast: clear skies, light scrolling."
            avg <= 40 -> "Feed forecast: overcast, scattered reels."
            avg <= 75 -> "Feed forecast: heavy scrolling, carry a crow."
            else -> "Feed forecast: doomscroll warning in effect."
        }
        val classified = pick(
            "WANTED: one (1) phone charger, last seen near the bed. Ask for Kaak.",
            "FOR TRADE: bottle caps, various. Will accept coins, keys, or a balcony.",
            "LOST: your attention span. If found, please return to its owner.",
            "SEEKING: a human who sleeps before midnight. Must like crows.",
            "FREE: one (1) sunset, available nightly from any rooftop. No app required.",
            "NOTICE: the cha stall on the corner reports a missing biscuit. Kaak denies everything.",
        )
        return Edition(weekLabel, lead.headline, lead.subhead, stories, weather, classified)
    }
}
