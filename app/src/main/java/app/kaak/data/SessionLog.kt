package app.kaak.data

import android.content.Context
import app.kaak.core.LabelContext
import app.kaak.core.SessionSummary
import org.json.JSONObject
import java.io.File

/**
 * Aggregate numbers only (minutes, counts, action names). No app content, ever.
 * Stays in the app's private storage until the tester taps "Share my stats".
 */
class SessionLog(context: Context) {
    private val file = File(context.filesDir, FILE_NAME)

    fun session(s: SessionSummary) = write(
        JSONObject()
            .put("type", "session")
            .put("activeMin", round1(s.activeMs / 60_000.0))
            .put("mindlessMin", round1(s.mindlessMs / 60_000.0))
            .put("swipes", s.swipes)
            .put("actions", s.actions)
            .put("arrived", s.arrived)
    )

    fun action(name: String, app: String?, activeMs: Long, mindlessMs: Long) = write(
        JSONObject()
            .put("type", "action")
            .put("action", name)
            .put("app", app ?: "")
            .put("activeMin", round1(activeMs / 60_000.0))
            .put("mindlessMin", round1(mindlessMs / 60_000.0))
    )

    /** "Was that worth it?" answer + the behaviour around it. Training data for week 6. */
    fun label(answer: String, c: LabelContext) = write(
        JSONObject()
            .put("type", "label")
            .put("answer", answer)
            .put("visitMin", round1(c.visitMs / 60_000.0))
            .put("mindlessMin", round1(c.mindlessMs / 60_000.0))
            .put("swipesPerMin", c.swipesPerMin?.let { round1(it) } ?: JSONObject.NULL)
            .put("dwellSec", c.medianDwellMs?.let { round1(it / 1000.0) } ?: JSONObject.NULL)
            .put("verdict", c.verdict?.name ?: "")
            .put("hour", c.hourOfDay)
    )

    fun event(name: String, detail: String = "") = write(
        JSONObject().put("type", "event").put("event", name).put("detail", detail)
    )

    private fun write(o: JSONObject) {
        runCatching {
            o.put("t", System.currentTimeMillis())
            if (phase.isNotEmpty()) o.put("phase", phase)
            file.appendText(o.toString() + "\n")
            if (file.length() > MAX_BYTES) {
                val lines = file.readLines()
                file.writeText(lines.takeLast(lines.size / 2).joinToString("\n", postfix = "\n"))
            }
        }
    }

    private fun round1(v: Double) = Math.round(v * 10) / 10.0

    companion object {
        /** Study edition: the current phase, stamped on every line. */
        @Volatile var phase: String = ""
        private const val FILE_NAME = "kaak_log.jsonl"
        private const val MAX_BYTES = 512 * 1024

        fun readTail(context: Context, lines: Int = 300): String = runCatching {
            File(context.filesDir, FILE_NAME).readLines().takeLast(lines).joinToString("\n")
        }.getOrDefault("")

        fun clear(context: Context) {
            runCatching { File(context.filesDir, FILE_NAME).delete() }
        }
    }
}
