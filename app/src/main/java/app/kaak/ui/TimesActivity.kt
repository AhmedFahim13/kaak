package app.kaak.ui

import android.app.Activity
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import app.kaak.core.KaakTimes
import app.kaak.core.Lines
import app.kaak.core.dayKeyOf
import app.kaak.data.DayStore
import app.kaak.data.KaakPrefs
import app.kaak.overlay.KaakView
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The Kaak Times: this week's numbers as a tabloid. Screenshot to share. */
class TimesActivity : Activity() {
    private val ink = 0xFF1B1B1B.toInt()
    private val serif = Typeface.SERIF

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val days = DayStore(this)
        val today = LocalDate.now()
        val thisWeek = days.all((0L..6L).map { dayKeyOf(today.minusDays(it)) })
        val lastWeek = days.all((7L..13L).map { dayKeyOf(today.minusDays(it)) })
        val label = "Dhaka, week ending " + today.format(DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH))
        val e = KaakTimes.compose(thisWeek, lastWeek, label)

        val (scroll, root) = scrollPage()
        scroll.setBackgroundColor(0xFFF3EEE2.toInt())
        setContentView(scroll)

        root.addView(paper("The Kaak Times", 36f, Typeface.BOLD, center = true))
        root.addView(paper("$label. Price: one bottle cap.", 13f, center = true))
        root.addView(rule(3f))
        root.addView(paper(e.headline, 30f, Typeface.BOLD).apply { setLineSpacing(0f, 0.95f) })
        root.addView(paper(e.subhead, 17f, Typeface.ITALIC))

        val photo = KaakView(this, null, Lines().apply { lang = KaakPrefs(this@TimesActivity).lang })
        root.addView(FrameLayout(this).apply {
            background = GradientDrawable().apply { setColor(0xFFDCD5C4.toInt()); setStroke(dp(1f), ink) }
            addView(photo)
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(170f)).apply { topMargin = dp(10f) })
        photo.strikePose(resources.displayMetrics.widthPixels * 0.42f, dp(150f).toFloat(), 1.25f)
        root.addView(paper("Kaak, pictured, unbothered.", 12f, Typeface.ITALIC))
        root.addView(rule(1f))

        e.stories.forEach { s ->
            root.addView(paper(s.title, 19f, Typeface.BOLD))
            root.addView(paper(s.body, 15f))
            root.addView(rule(1f))
        }
        root.addView(boxed("Weather", e.weather))
        root.addView(boxed("Classifieds", e.classified))
        root.addView(paper("Take a screenshot to share. Nothing in this paper leaves your phone unless you send it.", 12f, Typeface.ITALIC, center = true))
    }

    private fun paper(s: String, size: Float, style: Int = Typeface.NORMAL, center: Boolean = false) = TextView(this).apply {
        text = s
        textSize = size
        setTextColor(ink)
        typeface = Typeface.create(serif, style)
        if (center) gravity = Gravity.CENTER
        setPadding(0, dp(4f), 0, dp(4f))
        layoutParams = MATCH_WRAP
    }

    private fun rule(thick: Float) = View(this).apply {
        setBackgroundColor(ink)
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(thick).coerceAtLeast(1)).apply {
            topMargin = dp(8f); bottomMargin = dp(8f)
        }
    }

    private fun boxed(title: String, body: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable().apply { setStroke(dp(1.5f), ink) }
        setPadding(dp(12f), dp(8f), dp(12f), dp(10f))
        addView(paper(title, 15f, Typeface.BOLD))
        addView(paper(body, 14f))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(12f)
        }
    }
}
