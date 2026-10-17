package app.kaak.data

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.telecom.TelecomManager

/**
 * Apps Kaak must never interfere with: calls, chats, maps, money, rides.
 * Kaak only ever acts inside the feed apps you picked; these are hard-blocked
 * on top of that, so no card or chase can appear over them either.
 * (bKash, Nagad, Rocket and Pathao checked against their Google Play listings and developers, Oct 2026.)
 */
object ProtectedApps {
    val PRESET: Map<String, String> = linkedMapOf(
        "com.whatsapp" to "WhatsApp",
        "com.whatsapp.w4b" to "WhatsApp Business",
        "com.facebook.orca" to "Messenger",
        "com.facebook.mlite" to "Messenger Lite",
        "com.imo.android.imoim" to "imo",
        "org.telegram.messenger" to "Telegram",
        "com.viber.voip" to "Viber",
        "com.google.android.apps.messaging" to "Messages",
        "com.samsung.android.messaging" to "Samsung Messages",
        "com.google.android.dialer" to "Phone (Google)",
        "com.samsung.android.dialer" to "Phone (Samsung)",
        "com.android.dialer" to "Phone",
        "com.android.incallui" to "In-call screen",
        "com.samsung.android.incallui" to "In-call screen (Samsung)",
        "com.google.android.apps.maps" to "Google Maps",
        "com.bKash.customerapp" to "bKash",
        "com.konasl.nagad" to "Nagad",
        "com.dbbl.mbs.apps.main" to "Rocket",
        "com.pathao.user" to "Pathao",
        "com.ubercab" to "Uber",
    )

    fun isProtected(context: Context, pkg: String): Boolean = pkg in PRESET || pkg == Apps.defaultDialer(context)
}

object Apps {
    data class Launchable(val pkg: String, val label: String)

    fun defaultDialer(context: Context): String? =
        runCatching { context.getSystemService(TelecomManager::class.java)?.defaultDialerPackage }.getOrNull()

    /** Phone apps that count for the "call a friend" bribe. */
    fun callPackages(context: Context): Set<String> =
        setOfNotNull(defaultDialer(context), "com.google.android.dialer", "com.samsung.android.dialer",
            "com.android.dialer", "com.android.incallui", "com.samsung.android.incallui")

    fun launcherPackage(context: Context): String? = runCatching {
        context.packageManager.resolveActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY,
        )?.activityInfo?.packageName
    }.getOrNull()

    fun launchable(context: Context): List<Launchable> = runCatching {
        val pm = context.packageManager
        pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
            .map { Launchable(it.activityInfo.packageName, it.loadLabel(pm).toString()) }
            .filter { it.pkg != context.packageName }
            .distinctBy { it.pkg }
            .sortedBy { it.label.lowercase() }
    }.getOrDefault(emptyList())

    fun label(context: Context, pkg: String?): String {
        if (pkg == null) return "the app"
        FeedApps.ALL[pkg]?.let { return it }
        return runCatching {
            val pm = context.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
        }.getOrDefault("the app")
    }

    /** The app's own icon from this phone, so Kaak can carry it off. */
    fun icon(context: Context, pkg: String?, sizePx: Int = 192): Bitmap? {
        if (pkg == null) return null
        return runCatching {
            val d = context.packageManager.getApplicationIcon(pkg)
            Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888).also { b ->
                d.setBounds(0, 0, sizePx, sizePx)
                d.draw(Canvas(b))
            }
        }.getOrNull()
    }

    fun launch(context: Context, pkg: String): Boolean = runCatching {
        val i = context.packageManager.getLaunchIntentForPackage(pkg) ?: return false
        context.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    }.getOrDefault(false)
}
