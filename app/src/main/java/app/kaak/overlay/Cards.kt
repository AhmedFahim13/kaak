package app.kaak.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import app.kaak.core.Detour
import app.kaak.core.Lines
import app.kaak.core.Mood
import app.kaak.ui.CardBox
import app.kaak.ui.Chunky
import app.kaak.ui.Kit

/** Small views Kaak shows over other apps. Fixed dark style, same in light and dark mode. */
object Cards {
    private const val CARD_BG = 0xF21A1A1E.toInt()
    private const val CHIP_BG = 0xFF2C2C33.toInt()
    const val ACCENT = 0xFFF2C14E.toInt()
    private const val INK = 0xFFFFFFFF.toInt()
    private const val QUIET = 0xB3FFFFFF.toInt()

    private fun Context.dp(v: Float) = (v * resources.displayMetrics.density).toInt()

    private fun Context.round(color: Int, radiusDp: Float) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radiusDp).toFloat()
    }

    fun Context.chip(label: String, accent: Boolean = false, onClick: () -> Unit) = Chunky(this, if (accent) Kit.RED else Kit.PAPER, if (accent) Kit.WHITE else Kit.INK).apply {
        text = label
        textSize = 15f
        onTap(onClick)
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(8f)
        }
    }

    private fun Context.label(textValue: String, size: Float, color: Int = Kit.INK, bold: Boolean = false) = TextView(this).apply {
        text = textValue
        textSize = size
        setTextColor(color)
        typeface = if (bold) Kit.display(this@label) else Kit.body(this@label, 600)
    }

    private fun Context.sheet(): LinearLayout = CardBox(this, Kit.PAPER, 24f)

    /** Wraps a sheet with side and bottom margins so it floats above the nav bar. */
    private fun Context.floating(inner: View) = FrameLayout(this).apply {
        setPadding(dp(12f), 0, dp(12f), dp(28f))
        addView(inner)
    }

    private fun Context.header(title: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(CrowBadge(this@header), LinearLayout.LayoutParams(dp(52f), dp(48f)))
        addView(label(title, 20f, bold = true).apply { setPadding(dp(10f), 0, 0, 0) },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    }

    fun worthIt(ctx: Context, lines: Lines, mascot: Boolean = true, onAnswer: (String) -> Unit): View = with(ctx) {
        val s = sheet()
        s.addView(if (mascot) header(lines.worthIt()) else label("Was that worth it?", 20f, bold = true))
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        listOf("yes" to "Yes", "meh" to "Meh", "no" to "No").forEachIndexed { i, (key, text) ->
            row.addView(chip(text, accent = i == 0) { onAnswer(key) }.apply { gravity = Gravity.CENTER },
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    topMargin = dp(10f); if (i > 0) leftMargin = dp(8f)
                })
        }
        s.addView(row)
        floating(s)
    }

    fun detours(ctx: Context, lines: Lines, list: List<Detour>, onPick: (Detour) -> Unit, onBribe: () -> Unit, onClose: () -> Unit): View = with(ctx) {
        val s = sheet()
        s.addView(header(lines.detoursTitle()))
        list.forEach { d -> s.addView(chip("${d.type.label}: ${d.title}") { onPick(d) }) }
        s.addView(chip("Earn time for later (bribe)", accent = true) { onBribe() })
        s.addView(label("Close", 14f, Kit.INK_SOFT).apply {
            setPadding(0, dp(14f), 0, 0); gravity = Gravity.CENTER; setOnClickListener { onClose() }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        floating(s)
    }

    /** "Why are you scrolling?" One tap, no typing. */
    fun mood(ctx: Context, lines: Lines, onPick: (Mood) -> Unit): View = with(ctx) {
        val s = sheet()
        s.addView(header(lines.moodQuestion()))
        Mood.entries.chunked(2).forEach { pair ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            pair.forEachIndexed { i, m ->
                row.addView(chip(lines.moodLabel(m)) { onPick(m) }.apply { gravity = Gravity.CENTER },
                    LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        topMargin = dp(8f); if (i > 0) leftMargin = dp(8f)
                    })
            }
            s.addView(row)
        }
        floating(s)
    }

    fun timesOut(ctx: Context, lines: Lines, onRead: () -> Unit, onLater: () -> Unit): View = with(ctx) {
        val s = sheet()
        s.addView(header(lines.timesOut()))
        s.addView(chip("Read it", accent = true) { onRead() })
        s.addView(chip("Later") { onLater() })
        floating(s)
    }

    /** A one-time explainer the first time something big happens. */
    fun tip(ctx: Context, title: String, body: String, onOk: () -> Unit): View = with(ctx) {
        val s = sheet()
        s.addView(header(title))
        s.addView(label(body, 15f, Kit.BODY).apply { setPadding(0, dp(6f), 0, 0) })
        s.addView(chip("Got it", accent = true) { onOk() })
        floating(s)
    }

    /** Study timer arm: a plain note instead of a crow. */
    fun timerNote(ctx: Context, text: String): View = with(ctx) {
        val s = sheet()
        s.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(app.kaak.ui.KaakIcon(this@with, app.kaak.ui.KaakIcon.Kind.CLOCK, 30f))
            addView(label(text, 17f, bold = true).apply { setPadding(dp(12f), 0, 0, 0) })
        })
        floating(s)
    }

    fun tooMuch(ctx: Context, text: String, onTap: () -> Unit): View = with(ctx) {
        floating(chip(text) { onTap() }.apply { gravity = Gravity.CENTER })
    }

    /**
     * The asleep screen: covers a feed while Kaak is full. Detours, a bribe,
     * and the escape hatch: hold Kaak for 5 seconds to go in anyway.
     */
    @SuppressLint("ClickableViewAccessibility")
    fun asleep(
        ctx: Context,
        lines: Lines,
        feedback: Feedback?,
        icon: Bitmap?,
        appName: String,
        minutes: Int,
        list: List<Detour>,
        onDetour: (Detour) -> Unit,
        onBribe: () -> Unit,
        onEscape: () -> Unit,
    ): View = with(ctx) {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xF51D1A33.toInt())
            setPadding(dp(20f), dp(56f), dp(20f), dp(36f))
            isClickable = true // swallow touches meant for the feed underneath
        }
        root.addView(label(lines.asleep(minutes), 28f, Kit.MARIGOLD, bold = true).apply { gravity = Gravity.CENTER },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        root.addView(label("He ate $appName.", 15f, Kit.PAPER).apply { gravity = Gravity.CENTER; setPadding(0, dp(4f), 0, 0) },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        val stage = KaakView(this, feedback, lines)
        root.addView(stage, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        stage.contentDescription = "Kaak, asleep on your feed."
        stage.accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun performAccessibilityAction(host: View, action: Int, args: android.os.Bundle?): Boolean {
                if (action == android.view.accessibility.AccessibilityNodeInfo.ACTION_LONG_CLICK) { onEscape(); return true }
                return super.performAccessibilityAction(host, action, args)
            }
        }
        stage.sleepOnApp(icon, appName)

        list.forEach { d -> root.addView(chip("${d.type.label}: ${d.title}") { onDetour(d) }) }
        root.addView(chip("Earn time for later (bribe)", accent = true) { onBribe() })
        root.addView(chip("Go in anyway…") { onEscape() })
        root.addView(label("Going in during a nap takes a while. That's the point.", 13f, Kit.PAPER).apply {
            gravity = Gravity.CENTER; setPadding(0, dp(12f), 0, 0)
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        root
    }

    private const val HOLD_MS = 5_000L
}

/** Kaak's head and shoulders, for card headers. */
class CrowBadge(context: Context) : View(context) {
    private val painter = CrowPainter(resources.displayMetrics.density * 0.5f)
    override fun onDraw(canvas: Canvas) {
        painter.draw(canvas, Pose(width * 0.36f, height * 1.2f, facing = 1f, headTilt = -0.15f, look = 1f))
    }
}
