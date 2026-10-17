package app.kaak.data

import android.content.Context
import app.kaak.core.Bribe
import app.kaak.core.BribeLedger
import app.kaak.core.ClaimResult
import app.kaak.core.LedgerDay
import org.json.JSONObject

/**
 * What Kaak owes you: today's bribe minutes, loot for the nest, trust,
 * and the quiet hour from 10,000 steps. The nest screen itself is milestone 3.
 */
class Wallet(context: Context) {
    private val sp = context.getSharedPreferences("kaak_wallet", Context.MODE_PRIVATE)

    private fun ledger() = BribeLedger(LedgerDay(sp.getInt("day", -1), sp.getInt("minutes", 0), sp.getInt("honor", 0)))

    fun claim(b: Bribe, dayKey: Int, honor: Boolean = false): ClaimResult {
        val l = ledger()
        val r = l.claim(b, dayKey, honor || b.check == app.kaak.core.Check.HONOR)
        sp.edit().putInt("day", l.today.day).putInt("minutes", l.today.minutes).putInt("honor", l.today.honor).apply()
        if (r is ClaimResult.Granted) {
            r.loot?.let { addLoot(it) }
            if (r.trust != 0) sp.edit().putInt("trust", trust + r.trust).apply()
            if (r.quietHour) sp.edit().putLong("quiet_until", System.currentTimeMillis() + 3_600_000L).apply()
        }
        return r
    }

    fun bonusMinutes(dayKey: Int) = ledger().minutesToday(dayKey)
    fun minutesLeft(dayKey: Int) = ledger().minutesLeft(dayKey)
    fun honorLeft(dayKey: Int) = ledger().honorLeft(dayKey)

    val trust: Int get() = sp.getInt("trust", 0)

    fun addTrust(delta: Int) = sp.edit().putInt("trust", (trust + delta).coerceAtLeast(0)).apply()

    /** Total minutes Kaak got back for you. */
    val returnedMin: Int get() = sp.getInt("returned_min", 0)

    /** Every 15 returned minutes, Kaak adds something shiny to the nest. Returns what was added. */
    fun addReturned(minutes: Int): List<String> {
        if (minutes <= 0) return emptyList()
        var bucket = sp.getInt("returned_bucket", 0) + minutes
        val added = mutableListOf<String>()
        while (bucket >= 15) {
            bucket -= 15
            added += SHINIES.random()
        }
        sp.edit().putInt("returned_min", returnedMin + minutes).putInt("returned_bucket", bucket).apply()
        added.forEach { addLoot(it) }
        return added
    }
    val quietUntil: Long get() = sp.getLong("quiet_until", 0L)

    val loot: Map<String, Int>
        get() = runCatching {
            val o = JSONObject(sp.getString("loot", "{}") ?: "{}")
            o.keys().asSequence().associateWith { o.getInt(it) }
        }.getOrDefault(emptyMap())

    companion object {
        val SHINIES = listOf("bottle cap", "coin", "key", "broken watch", "marble", "button")
    }

    private fun addLoot(item: String) {
        val o = JSONObject(loot)
        o.put(item, (loot[item] ?: 0) + 1)
        sp.edit().putString("loot", o.toString()).apply()
    }
}
