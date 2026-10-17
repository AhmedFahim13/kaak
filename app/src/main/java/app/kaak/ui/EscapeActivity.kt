package app.kaak.ui

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.MotionEvent
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import app.kaak.core.EscapeRules
import app.kaak.core.Lines
import app.kaak.data.DayStore
import app.kaak.data.KaakPrefs
import app.kaak.overlay.Feedback
import app.kaak.overlay.KaakView
import app.kaak.service.KaakAccessibilityService
import app.kaak.tasks.TaskCenter

/**
 * Going into a feed during Kaak's nap. Deliberately slow: hold Kaak (10 s, then
 * 20, 40, 60 as the day goes on), then type a sentence. The reward is 5 minutes.
 */
class EscapeActivity : Activity() {
    companion object {
        fun intent(c: Context, app: String?): Intent =
            Intent(c, EscapeActivity::class.java).putExtra("app", app).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private val lines = Lines()

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = KaakPrefs(this)
        lines.lang = prefs.lang
        val app = intent.getStringExtra("app")
        val escapes = DayStore(this).get(TaskCenter.today()).escapes
        val holdSec = EscapeRules.holdSeconds(escapes)
        val napLeft = KaakAccessibilityService.debug.snapshot?.eatenUntil?.let { (it - SystemClock.elapsedRealtime()) / 60_000 + 1 }
        val phrase = EscapeRules.phrase(escapes, TaskCenter.today(), (napLeft ?: 5L).toInt())

        val (scroll, root) = scrollPage()
        setContentView(scroll)
        root.addView(text("Going in anyway?", 32f, bold = true))
        root.addView(text(buildString {
            napLeft?.takeIf { it > 0 }?.let { append("Kaak is full for $it more minutes. ") }
            append(if (escapes == 0) "This is your first escape today." else "This is escape number ${escapes + 1} today, so it takes longer.")
        }, 15f, quiet = true))

        val kaak = KaakView(this, Feedback(this, prefs), lines).apply { lightBubble = true; contentDescription = "Kaak. Hold him for $holdSec seconds." }
        root.addView(FrameLayout(this).apply { addView(kaak) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(220f)))
        kaak.post { kaak.strikePose(kaak.width * 0.5f, kaak.height * 0.82f, 1.4f, facing = -1f); kaak.say("really?", 3000) }

        val bar = ChunkyBar(this).apply { color = Kit.RED }
        val step1 = text("1. Hold Kaak for $holdSec seconds.", 17f, bold = true)
        root.addView(step1)
        root.addView(bar, MATCH_WRAP.apply { topMargin = dp(8f) })

        val step2 = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        step2.addView(text("2. Type this:", 17f, bold = true).apply { setPadding(0, dp(20f), 0, 0) })
        step2.addView(text("\u201c$phrase\u201d", 17f).apply { setTextColor(Kit.RED) })
        val pasteNote = text("", 13f, bold = true).apply { setTextColor(Kit.RED) }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            hint = "type it here"
            isLongClickable = false // no pasting
            setTextIsSelectable(false)
            val noMenu = object : android.view.ActionMode.Callback {
                override fun onCreateActionMode(m: android.view.ActionMode?, menu: android.view.Menu?) = false
                override fun onPrepareActionMode(m: android.view.ActionMode?, menu: android.view.Menu?) = false
                override fun onActionItemClicked(m: android.view.ActionMode?, item: android.view.MenuItem?) = false
                override fun onDestroyActionMode(m: android.view.ActionMode?) = Unit
            }
            customSelectionActionModeCallback = noMenu
            customInsertionActionModeCallback = noMenu
        }
        step2.addView(input, MATCH_WRAP)
        step2.addView(pasteNote)
        lateinit var go: TextView
        go = primaryButton("Go in for 5 minutes") {
            val svc = KaakAccessibilityService.instance
            if (svc != null && app != null) svc.grantEscape(app)
            finish()
        }.apply { isEnabled = false }
        input.addTextChangedListener(object : TextWatcher {
            private var pasted = false
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
            // a keyboard clipboard drops a whole chunk at once; typing and swiping add a word at most
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { if (count - before > EscapeRules.MAX_INSERT) pasted = true }
            override fun afterTextChanged(s: Editable?) {
                if (pasted) {
                    pasted = false
                    s?.clear()
                    pasteNote.text = "Type it. Kaak doesn't accept pasting."
                    kaak.say("nice try.", 2000)
                    return
                }
                go.isEnabled = EscapeRules.phraseOk(s?.toString() ?: "", phrase)
            }
        })
        step2.addView(go)
        root.addView(step2)

        root.addView(button("Never mind, I'll leave it") {
            startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            finish()
        })
        root.addView(text("Or take a detour: Kaak's nap ends on its own.", 13f, quiet = true))

        var holdStart = 0L
        val tick = object : Runnable {
            override fun run() {
                val p = (SystemClock.uptimeMillis() - holdStart) / (holdSec * 1000f)
                if (p >= 1f) {
                    holdStart = 0L
                    kaak.setHold(-1f); bar.value = 1f
                    kaak.say("fine. type it.", 2500)
                    step1.text = "1. Held. \u2713"
                    step2.visibility = View.VISIBLE
                    input.requestFocus()
                } else {
                    kaak.setHold(p); bar.value = p
                    kaak.postOnAnimation(this)
                }
            }
        }
        kaak.setOnTouchListener { _, e ->
            if (step2.visibility == View.VISIBLE) return@setOnTouchListener true
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { holdStart = SystemClock.uptimeMillis(); kaak.post(tick) }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> if (holdStart != 0L) {
                    holdStart = 0L; kaak.removeCallbacks(tick); kaak.setHold(-2f); bar.value = 0f
                }
            }
            true
        }
    }
}
