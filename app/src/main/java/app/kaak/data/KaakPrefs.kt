package app.kaak.data

import android.content.Context
import app.kaak.core.Chaos
import app.kaak.core.DetourCatalog
import app.kaak.core.JumpscareLevel
import app.kaak.core.Lang

/** Feed apps Kaak can watch. Lite versions matter in Bangladesh. */
object FeedApps {
    val ALL: Map<String, String> = linkedMapOf(
        "com.instagram.android" to "Instagram",
        "com.instagram.lite" to "Instagram Lite",
        "com.facebook.katana" to "Facebook",
        "com.facebook.lite" to "Facebook Lite",
        "com.google.android.youtube" to "YouTube",
        "com.zhiliaoapp.musically" to "TikTok",
        "com.ss.android.ugc.trill" to "TikTok (some regions)",
        "com.zhiliaoapp.musically.go" to "TikTok Lite",
    )
}

/** Simple on-device settings. Nothing here ever leaves the phone. */
class KaakPrefs(context: Context) {
    private val sp = context.getSharedPreferences("kaak", Context.MODE_PRIVATE)

    private fun str(key: String, v: String?) = sp.edit().putString(key, v).apply()
    private fun int(key: String, v: Int) = sp.edit().putInt(key, v).apply()
    private fun long(key: String, v: Long) = sp.edit().putLong(key, v).apply()
    private fun bool(key: String, v: Boolean) = sp.edit().putBoolean(key, v).apply()

    var onboarded: Boolean
        get() = sp.getBoolean("onboarded", false)
        set(v) = bool("onboarded", v)

    /** First launch time, so Kaak never hands out a morning gift for a night before he existed. */
    val installedAt: Long
        get() = sp.getLong("installed_at", 0L).takeIf { it > 0 } ?: System.currentTimeMillis().also { long("installed_at", it) }

    var chaos: Chaos
        get() = runCatching { Chaos.valueOf(sp.getString("chaos", null) ?: "KAAK") }.getOrDefault(Chaos.KAAK)
        set(v) = str("chaos", v.name)

    /** Minutes of mindless scrolling before Kaak shows up (slider). */
    var arrivalMin: Int
        get() = sp.getInt("arrival_min", 10)
        set(v) = int("arrival_min", v)

    /** Seconds between gags (slider); small nudges come in between. */
    var gagEverySec: Int
        get() = sp.getInt("gag_every_sec", 90)
        set(v) = int("gag_every_sec", v)

    /** A chaos preset sets both sliders. */
    fun applyChaos(c: Chaos) {
        chaos = c
        arrivalMin = (c.arrivalMs / 60_000).toInt()
        gagEverySec = when (c) { Chaos.PIGEON -> 180; Chaos.KAAK -> 90; Chaos.MONKEY -> 45 }
    }

    var lang: Lang
        get() = runCatching { Lang.valueOf(sp.getString("lang", null) ?: "ENGLISH") }.getOrDefault(Lang.ENGLISH)
        set(v) = str("lang", v.name)

    var feedApps: Set<String>
        get() = sp.getStringSet("feed_apps", null)?.toSet() ?: FeedApps.ALL.keys
        set(v) = sp.edit().putStringSet("feed_apps", HashSet(v)).apply()

    var paused: Boolean
        get() = sp.getBoolean("paused", false)
        set(v) = bool("paused", v)

    /** Wall-clock end of a timed pause (30 min, 1 hour, until tomorrow). */
    var pausedUntil: Long
        get() = sp.getLong("paused_until", 0L)
        set(v) = long("paused_until", v)

    /** Paused by the switch or by a timed pause that hasn't run out. */
    val pausedNow: Boolean get() = paused || System.currentTimeMillis() < pausedUntil

    var sound: Boolean
        get() = sp.getBoolean("sound", true)
        set(v) = bool("sound", v)

    var haptics: Boolean
        get() = sp.getBoolean("haptics", true)
        set(v) = bool("haptics", v)

    var dailyLimitMin: Int
        get() = sp.getInt("daily_limit_min", 60)
        set(v) = int("daily_limit_min", v)

    /** Minutes after midnight. Default 23:30. */
    var bedtimeMinute: Int
        get() = sp.getInt("bedtime_minute", 23 * 60 + 30)
        set(v) = int("bedtime_minute", v)

    var jumpscare: JumpscareLevel
        get() = runCatching { JumpscareLevel.valueOf(sp.getString("jumpscare", null) ?: "MEDIUM") }.getOrDefault(JumpscareLevel.MEDIUM)
        set(v) = str("jumpscare", v.name)

    /** Jumpscares between 11 p.m. and 5 a.m. Off by default. */
    var nightJumpscares: Boolean
        get() = sp.getBoolean("night_jumpscares", false)
        set(v) = bool("night_jumpscares", v)

    var detourIds: Set<String>
        get() = sp.getStringSet("detours", null)?.toSet() ?: DetourCatalog.DEFAULT_IDS.toSet()
        set(v) = sp.edit().putStringSet("detours", HashSet(v)).apply()

    /** The app a detour or app-time bribe opens, e.g. "duolingo" -> "com.duolingo". */
    fun appFor(key: String): String? = sp.getString("app_for_$key", null)
    fun setAppFor(key: String, pkg: String?) = str("app_for_$key", pkg)

    var friendName: String?
        get() = sp.getString("friend_name", null)
        set(v) = str("friend_name", v)

    var friendNumber: String?
        get() = sp.getString("friend_number", null)
        set(v) = str("friend_number", v)

    var lastGiftDay: Int
        get() = sp.getInt("last_gift_day", 0)
        set(v) = int("last_gift_day", v)

    var lastFeedUseWall: Long
        get() = sp.getLong("last_feed_use", 0L)
        set(v) = long("last_feed_use", v)

    var workMode: Boolean
        get() = sp.getBoolean("work_mode", false)
        set(v) = bool("work_mode", v)

    /** java.time DayOfWeek values (1 = Monday ... 7 = Sunday). Default: Sunday to Thursday. */
    var workDays: Set<Int>
        get() = sp.getStringSet("work_days", null)?.mapNotNull { it.toIntOrNull() }?.toSet() ?: setOf(7, 1, 2, 3, 4)
        set(v) = sp.edit().putStringSet("work_days", v.map { it.toString() }.toHashSet()).apply()

    var workStartMin: Int
        get() = sp.getInt("work_start", 9 * 60)
        set(v) = int("work_start", v)

    var workEndMin: Int
        get() = sp.getInt("work_end", 17 * 60)
        set(v) = int("work_end", v)

    fun workActive(dayOfWeek: Int, minuteOfDay: Int): Boolean =
        workMode && dayOfWeek in workDays && minuteOfDay in workStartMin until workEndMin

    var moodChecks: Boolean
        get() = sp.getBoolean("mood_checks", true)
        set(v) = bool("mood_checks", v)

    var lastTrustDay: Int
        get() = sp.getInt("last_trust_day", 0)
        set(v) = int("last_trust_day", v)

    var lastTimesDay: Int
        get() = sp.getInt("last_times_day", 0)
        set(v) = int("last_times_day", v)

    /** Feed apps learned to send no scroll events (content changes stand in). */
    var silentApps: Set<String>
        get() = sp.getStringSet("silent_apps", null)?.toSet() ?: emptySet()
        set(v) = sp.edit().putStringSet("silent_apps", HashSet(v)).apply()

    /** Last time the service was alive, to log gaps (turned off, or killed by the phone). */
    var lastAliveWall: Long
        get() = sp.getLong("last_alive", 0L)
        set(v) = long("last_alive", v)

    /** One-time explainers. */
    fun seen(tip: String): Boolean = sp.getBoolean("tip_$tip", false)
    fun markSeen(tip: String) = bool("tip_$tip", true)

    var labelsGiven: Int
        get() = sp.getInt("labels_given", 0)
        set(v) = int("labels_given", v)

    /** Detours shown in the last 24 hours, so tomorrow's card looks different. */
    fun recentDetours(now: Long = System.currentTimeMillis()): Set<String> =
        (sp.getStringSet("recent_detours", null) ?: emptySet()).mapNotNull { e ->
            val (id, at) = e.split('@').let { it.getOrNull(0) to it.getOrNull(1)?.toLongOrNull() }
            if (id != null && at != null && now - at < 24 * 3_600_000L) id else null
        }.toSet()

    fun markDetoursShown(ids: Collection<String>, now: Long = System.currentTimeMillis()) {
        val keep = (sp.getStringSet("recent_detours", null) ?: emptySet()).filter { e ->
            val at = e.substringAfter('@').toLongOrNull() ?: 0L
            now - at < 24 * 3_600_000L && e.substringBefore('@') !in ids
        }
        sp.edit().putStringSet("recent_detours", HashSet(keep + ids.map { "$it@$now" })).apply()
    }
}
