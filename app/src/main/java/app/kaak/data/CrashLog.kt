package app.kaak.data

import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File
import java.util.Date

/**
 * Pilot safety net. Crashes and caught errors go to a small private file that
 * testers can send with "Report a problem". Nothing is sent automatically.
 */
object CrashLog {
    private const val FILE = "crash.txt"
    private const val MAX = 40 * 1024

    fun record(context: Context, e: Throwable, where: String = "") {
        runCatching {
            val f = File(context.filesDir, FILE)
            f.appendText("--- ${Date()} $where\n${Log.getStackTraceString(e)}\n")
            if (f.length() > MAX) f.writeText(f.readText().takeLast(MAX / 2))
        }
    }

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            record(app, e, "CRASH on ${t.name}")
            previous?.uncaughtException(t, e)
        }
    }

    fun read(context: Context): String = runCatching { File(context.filesDir, FILE).readText() }.getOrDefault("")

    fun clear(context: Context) { runCatching { File(context.filesDir, FILE).delete() } }

    fun deviceInfo(context: Context): String {
        val v = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
        return "Kaak $v, ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
    }
}
