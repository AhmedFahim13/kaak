package app.kaak.ui

import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import android.widget.Toast
import app.kaak.core.BribeCatalog
import app.kaak.core.Check
import app.kaak.core.Detour
import app.kaak.core.Opener
import app.kaak.data.Apps
import app.kaak.data.KaakPrefs
import app.kaak.tasks.TaskCenter

/** One tap on a detour opens the better thing directly, and starts its bribe check. */
object DetourLauncher {
    /** Returns false when the detour doesn't open a screen (the caller should go home). */
    fun launch(context: Context, d: Detour): Boolean {
        val prefs = KaakPrefs(context)
        val bribe = BribeCatalog.byId(d.bribeId)
        return when (d.opener) {
            Opener.CHOSEN_APP -> {
                val pkg = prefs.appFor(d.id)
                if (pkg != null && bribe?.check == Check.APP_TIME) {
                    TaskCenter.start(bribe, setOf(pkg))
                    Apps.launch(context, pkg) || openTask(context, d)
                } else openTask(context, d)
            }
            Opener.DIAL_FRIEND, Opener.TASK, Opener.TIMER -> openTask(context, d)
            Opener.NAP -> {
                runCatching {
                    context.startActivity(
                        Intent(AlarmClock.ACTION_SET_TIMER)
                            .putExtra(AlarmClock.EXTRA_LENGTH, 20 * 60)
                            .putExtra(AlarmClock.EXTRA_MESSAGE, "Kaak nap")
                            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
                Toast.makeText(context, "Kaak set a 20-minute timer. Nap well.", Toast.LENGTH_LONG).show()
                false
            }
            Opener.SLEEP -> {
                Toast.makeText(context, "Goodnight. Kaak will be there in the morning.", Toast.LENGTH_LONG).show()
                false
            }
        }
    }

    private fun openTask(context: Context, d: Detour): Boolean {
        val id = d.bribeId ?: return false
        context.startActivity(TaskActivity.intent(context, id, d.id))
        return true
    }
}
