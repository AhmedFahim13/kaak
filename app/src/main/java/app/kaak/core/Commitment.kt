package app.kaak.core

/**
 * Friction for the two ways out: going into a feed during a nap, and quitting Kaak.
 * Slow and deliberate, never impossible: the point is to outlast an impulse.
 */
object EscapeRules {
    /** Pass length: after this the nap cover comes back. */
    const val PASS_MS = 5 * MINUTE_MS

    /** A different sentence each time (with today's numbers in it), so it can't be pasted or typed from memory. */
    private val TEMPLATES = listOf(
        "I choose to scroll instead of resting, escape number %d today.",
        "Kaak is asleep and I am waking him for %d more reels.",
        "I am trading %d minutes of my day for this feed.",
        "This is escape %d today and I know exactly what I am doing.",
        "I could walk %d hundred steps right now but I want the feed.",
    )

    fun phrase(escapesToday: Int, dayKey: Int, minutes: Int): String {
        val t = TEMPLATES[Math.floorMod(escapesToday + dayKey, TEMPLATES.size)]
        val n = when (t.indexOf("%d")) { -1 -> 0; else -> if ("escape" in t) escapesToday + 1 else minutes.coerceAtLeast(1) }
        return t.format(n)
    }

    /** 20 s the first time today, then 40, 60, and 90 s from then on. */
    fun holdSeconds(escapesToday: Int): Int = listOf(20, 40, 60, 90)[escapesToday.coerceIn(0, 3)]

    /** One keyboard insertion longer than this is a paste, not typing (swiped words stay well under it). */
    const val MAX_INSERT = 14

    /** Forgiving about case, spaces and punctuation; strict about the words and numbers. */
    fun phraseOk(typed: String, phrase: String): Boolean = norm(typed) == norm(phrase)

    private fun norm(s: String) = s.lowercase().replace(Regex("[^a-z0-9 ]"), " ").split(" ").filter { it.isNotBlank() }.joinToString(" ")
}

/**
 * Strict mode: opted into for a chosen time (max 7 days). While on, Kaak bounces
 * attempts to uninstall or switch him off. Leaving early = ask, then wait [COOL_OFF_MS].
 */
object StrictPlan {
    const val COOL_OFF_MS = 15 * MINUTE_MS
    const val MAX_MS = 7 * 24 * 60 * MINUTE_MS

    fun active(now: Long, until: Long, coolOffAt: Long?): Boolean =
        now < until && (coolOffAt == null || now < coolOffAt + COOL_OFF_MS)

    fun coolOffLeftMs(now: Long, coolOffAt: Long?): Long? =
        coolOffAt?.let { (it + COOL_OFF_MS - now).coerceAtLeast(0) }

    /** After tapping "Kaak" in Settings or on the home screen, the next Settings screen within this counts as his. */
    const val TAP_ARM_MS = 10_000L

    /** Where phones keep App info, Accessibility and uninstall screens (installers match by name). */
    val SETTINGS_PACKAGES = setOf(
        "com.android.settings",
        "com.samsung.android.settings",
        "com.samsung.accessibility",   // One UI 5 accessibility settings
        "com.miui.securitycenter",     // MIUI / HyperOS app details
        "com.google.android.apps.wellbeing", // "Pause app" from the Pixel launcher's long-press menu
    )

    /**
     * A Settings or uninstall screen with Kaak's name on it. The window event only carries the
     * title: the uninstall dialog and Kaak's Accessibility page name him, but stock App info
     * (Android 14+) is just "App info" for every app, so it can't be told apart here.
     */
    fun isQuitScreen(pkg: String, text: String, appName: String = "Kaak"): Boolean {
        val quitPackages = pkg in SETTINGS_PACKAGES || pkg.contains("packageinstaller")
        return quitPackages && names(text, appName)
    }

    fun names(text: String, appName: String = "Kaak") =
        Regex("\\b${Regex.escape(appName)}\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)
}

/**
 * Strict mode's way to spot Kaak's own App info, whose title doesn't name him: a tap or
 * long-press on "Kaak" in Settings or on the home screen, then a Settings screen soon after.
 * Taps anywhere else are ignored without reading them. Caught once, then it disarms.
 */
class KaakTapWatch(private val appName: String = "Kaak") {
    private var armedAt: Long? = null

    fun onTap(pkg: String, launcherPkg: String?, text: String, now: Long) {
        if (pkg !in StrictPlan.SETTINGS_PACKAGES && pkg != launcherPkg) return
        // a pick from Kaak's long-press menu ("App info", "Pause app") can come long after the long-press
        if (StrictPlan.names(text, appName) || (pkg == launcherPkg && armedAt != null)) armedAt = now
    }

    /** A window opened: true if it is a Settings screen right after a tap on Kaak. */
    fun onWindow(pkg: String, launcherPkg: String?, now: Long): Boolean {
        val at = armedAt ?: return false
        if (pkg in StrictPlan.SETTINGS_PACKAGES) {
            armedAt = null
            return now - at <= StrictPlan.TAP_ARM_MS
        }
        // the launcher's own popup keeps it armed; any other app (Kaak himself, a feed) means it wasn't App info
        if (pkg != launcherPkg) armedAt = null
        return false
    }
}
