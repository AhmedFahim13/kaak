package app.kaak.data

import android.content.Context
import app.kaak.core.DayStats
import org.json.JSONObject

/** Daily aggregate numbers, kept for 30 days. Feeds trust and Kaak Times. On-device only. */
class DayStore(context: Context) {
    private val sp = context.getSharedPreferences("kaak_days", Context.MODE_PRIVATE)

    fun get(day: Int): DayStats = sp.getString("d$day", null)?.let { parse(day, it) } ?: DayStats(day)

    fun has(day: Int) = sp.contains("d$day")

    fun update(day: Int, f: (DayStats) -> DayStats) {
        val next = f(get(day))
        sp.edit().putString("d$day", toJson(next)).apply()
        prune()
    }

    fun all(days: List<Int>): List<DayStats> = days.filter { has(it) }.map { get(it) }

    private fun prune() {
        val keys = sp.all.keys.filter { it.startsWith("d") }.sorted()
        if (keys.size <= 30) return
        val e = sp.edit()
        keys.take(keys.size - 30).forEach { e.remove(it) }
        e.apply()
    }

    private fun toJson(d: DayStats) = JSONObject()
        .put("m", d.mindlessMin).put("o", d.feedOpens).put("f", d.foiled).put("e", d.eaten).put("x", d.escapes)
        .put("b", d.bribes).put("s", d.steps).put("r", d.returnedMin).put("l", d.longestSessionMin).put("n", d.lateMinute)
        .put("wy", d.worthYes).put("wn", d.worthNo).put("c", d.chasesWon).put("mc", d.moodChecks)
        .toString()

    private fun parse(day: Int, s: String): DayStats? = runCatching {
        val o = JSONObject(s)
        DayStats(
            day, o.optInt("m"), o.optInt("o"), o.optInt("f"), o.optInt("e"), o.optInt("x"), o.optInt("b"), o.optInt("s"),
            o.optInt("r"), o.optInt("l"), o.optInt("n", -1), o.optInt("wy"), o.optInt("wn"), o.optInt("c"), o.optInt("mc"),
        )
    }.getOrNull()
}
