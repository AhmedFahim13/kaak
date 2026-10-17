package app.kaak.ui

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import app.kaak.core.Phase
import app.kaak.core.StudyPlan
import app.kaak.data.CrashLog
import app.kaak.data.SessionLog
import app.kaak.data.Study
import app.kaak.service.KaakAccessibilityService

/**
 * The study edition's home while the tester is in the baseline week or the
 * timer arm. Deliberately plain: no crow, nothing to play with, so the two
 * arms differ only in what appears while scrolling.
 */
class StudyActivity : Activity() {
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Study.enroll(this)
        val phase = Study.phase(this)
        if (phase == Phase.KAAK && !intent.getBooleanExtra("info", false)) {
            startActivity(Intent(this, MainActivity::class.java)); finish(); return
        }
        val (scroll, root) = scrollPage()
        setContentView(scroll)
        root.addView(text("Phone habits study", 30f, bold = true))
        val day = Study.day(this)
        root.addView(text(
            if (day <= StudyPlan.BASELINE_DAYS) "Day $day of ${StudyPlan.BASELINE_DAYS}: getting to know your phone habits" else "Day $day",
            16f, quiet = true))

        root.addView(card().apply {
            addView(text(when (phase) {
                Phase.BASELINE -> "This week, just use your phone as usual. Nothing will pop up. Now and then you may be asked whether a scroll was worth it: one tap."
                Phase.TIMER -> "From now on, a small note tells you how long you've been scrolling feeds and when you reach your daily limit."
                Phase.KAAK -> "You're in the Kaak group."
            }, 16f))
        })

        section(root, "Setup")
        status = text("", 16f, bold = true)
        root.addView(status)
        root.addView(primaryButton("Open Accessibility settings") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) })
        root.addView(button("App info (allow restricted settings)") {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        })

        section(root, "What's collected")
        root.addView(text("Only numbers: how long feed apps were open, how fast you scrolled, what appeared, and your one-tap answers. " +
            "Never what's on your screen, your messages, or who you talk to. Nothing leaves your phone unless you tap Share.", 15f))

        section(root, "Send to the study team")
        root.addView(primaryButton("Share my stats") { share("Share study stats", SessionLog.readTail(this, 5_000)) })
        root.addView(button("Report a problem") {
            share("Report a problem", "${CrashLog.deviceInfo(this)}\n${Study.summary(this)}\n\nWhat happened:\n\n--- errors ---\n${CrashLog.read(this).takeLast(6_000)}")
        })

        section(root, "Study code")
        root.addView(text("Only if the study team gives you one.", 14f, quiet = true))
        val code = EditText(this).apply { inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS; hint = "CODE" }
        root.addView(code, MATCH_WRAP)
        root.addView(button("Apply code") {
            if (Study.applyCode(this, code.text.toString())) { toast("Code accepted."); recreate() } else toast("That code doesn't work.")
        })
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) status.text = if (serviceEnabled()) "✓ Connected" else "Not connected yet: turn it on in Accessibility settings"
    }

    private fun share(title: String, body: String) {
        val text = "${Study.summary(this)}\n$body"
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), title))
    }

    private fun serviceEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, KaakAccessibilityService::class.java)
        return enabled.split(':').any { it.equals(me.flattenToString(), true) || it.equals(me.flattenToShortString(), true) }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
