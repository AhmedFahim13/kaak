package app.kaak.ui

import android.app.Activity
import android.content.Context
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Shared view helpers. Every screen builds from these, so they all share Kaak's look. */

fun Context.dp(v: Float): Int = (v * resources.displayMetrics.density).toInt()

fun Context.text(s: String, size: Float, bold: Boolean = false, quiet: Boolean = false) = TextView(this).apply {
    text = s
    textSize = size
    setTextColor(when { quiet -> Kit.MUTED; bold || size >= 20f -> Kit.INK; else -> Kit.BODY })
    typeface = Kit.font(this@text, when { size >= 20f -> 900; bold -> 800; quiet -> 700; else -> 600 })
    setLineSpacing(0f, if (size >= 28f) 0.95f else 1.12f)
    setPadding(0, dp(2f), 0, dp(2f))
}

/** The quiet button: white, grey border, grey lip. */
fun Context.button(label: String, onClick: () -> Unit): TextView = Chunky(this, Kit.WHITE, Kit.INK, caps = true).apply {
    text = label
    textSize = 15f
    onTap(onClick)
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12f) }
}

/** The one main action on a screen: gamcha red with its darker lip. */
fun Context.primaryButton(label: String, color: Int = Kit.RED, textColor: Int = Kit.WHITE, onClick: () -> Unit): TextView =
    Chunky(this, color, textColor, caps = true).apply {
        text = label
        textSize = 16f
        onTap(onClick)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(14f) }
    }

fun Context.check(label: String, checked: Boolean, onChange: (Boolean) -> Unit) = ToggleRow(this, label, checked, onChange)

fun Context.section(root: LinearLayout, title: String) {
    root.addView(View(this).apply { minimumHeight = dp(26f) })
    root.addView(text(title, 22f, bold = true))
    root.addView(View(this).apply { minimumHeight = dp(8f) })
}

/** Single choice as option pills. */
fun Context.radios(options: List<String>, selected: Int, onPick: (Int) -> Unit): FlowLayout {
    val flow = FlowLayout(this).apply { setPadding(0, dp(4f), 0, dp(4f)) }
    val pills = options.mapIndexed { i, label -> Pill(this, label, i == selected) }
    pills.forEachIndexed { i, pill ->
        pill.onTap { pills.forEachIndexed { j, p -> p.selectedPill = j == i }; onPick(i) }
        flow.addView(pill)
    }
    return flow
}

fun Context.card(fill: Int = Kit.WHITE) = CardBox(this, fill).apply {
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12f) }
}

/** A white card holding rows separated by thin dividers (settings lists). */
fun Context.listCard(vararg rows: View) = card().apply {
    setPadding(dp(16f), dp(2f), dp(16f), dp(7f))
    rows.forEachIndexed { i, r -> if (i > 0) addView(Divider(this@listCard)); addView(r) }
}

/** A scrolling page on marigold that keeps clear of the status and navigation bars. */
fun Activity.scrollPage(): Pair<ScrollView, LinearLayout> {
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val scroll = ScrollView(this).apply { addView(root); setBackgroundColor(Kit.WHITE); isVerticalScrollBarEnabled = false }
    padForSystemBars(scroll, 20f)
    return scroll to root
}

fun Activity.padForSystemBars(v: View, padDp: Float) {
    val pad = dp(padDp)
    v.setOnApplyWindowInsetsListener { view, insets ->
        val (top, bottom) = if (Build.VERSION.SDK_INT >= 30) {
            val bars = insets.getInsets(WindowInsets.Type.systemBars())
            bars.top to bars.bottom
        } else {
            @Suppress("DEPRECATION")
            insets.systemWindowInsetTop to insets.systemWindowInsetBottom
        }
        view.setPadding(pad, pad + top, pad, pad + bottom)
        insets
    }
}

fun hhmm(minuteOfDay: Int): String = "%02d:%02d".format(minuteOfDay / 60 % 24, minuteOfDay % 60)

val MATCH_WRAP get() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
