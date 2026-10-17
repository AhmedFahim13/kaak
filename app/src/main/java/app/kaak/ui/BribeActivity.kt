package app.kaak.ui

import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import app.kaak.core.Check
import app.kaak.data.Wallet
import app.kaak.tasks.TaskCenter

/** The bribe menu, colour-coded by how Kaak checks it. */
class BribeActivity : Activity() {
    private lateinit var wallet: Wallet
    private lateinit var summary: TextView
    private lateinit var activeBox: LinearLayout
    private val onChange: () -> Unit = { runOnUiThread { refresh() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TaskCenter.init(this)
        wallet = Wallet(this)
        val (scroll, root) = scrollPage()
        setContentView(scroll)
        root.addView(text("Bribe Kaak", 40f, bold = true))
        root.addView(text("Do something good, get a little more time. Bigger efforts pay more. Minutes stop at 30 a day; loot and trust always pay.", 15f, quiet = true))
        val sumCard = card()
        summary = text("", 16f, bold = true)
        sumCard.addView(summary)
        root.addView(sumCard)
        activeBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(activeBox)

        section(root, "Pick one")
        TaskCenter.selectable.forEach { b ->
            val pays = buildString {
                append(if (b.rewardMin > 0) "+${b.rewardMin} min" else if (b.quietHour) "a quiet hour" else "")
                b.loot?.let { append(if (isNotEmpty()) " + $it" else it) }
                if (b.trust > 0) append(" + trust")
            }
            val tone = when (b.check) {
                Check.STEPS, Check.STAIRS, Check.MOVING, Check.REPS -> Kit.LEAF_LIP
                Check.PHONE_DOWN -> Kit.SKY_LIP
                Check.APP_TIME, Check.CALL, Check.TYPING -> Kit.PLUM_LIP
                Check.PHOTO_PAIR -> Kit.RED
                Check.HONOR -> Kit.MUTED
                else -> Kit.GOLD_LIP
            }
            val how = when (b.check) {
                Check.STEPS -> "counts steps"; Check.PHONE_DOWN -> "phone down"; Check.APP_TIME -> "app time"; Check.CALL -> "call time"
                Check.PHOTO_PAIR -> "before + after photos"; Check.REPS -> "counts reps"; Check.STAIRS -> "air pressure"
                Check.MOVING -> "you keep moving"; Check.TYPING -> "you typed"; Check.HONOR -> "honor"; else -> "on this screen"
            }
            val line2 = "$pays  ·  $how"
            root.addView(Chunky(this, Kit.WHITE, Kit.INK).apply {
                text = android.text.SpannableString("${b.title}\n$line2").apply {
                    val st = b.title.length + 1
                    setSpan(android.text.style.ForegroundColorSpan(tone), st, length, 0)
                    setSpan(android.text.style.RelativeSizeSpan(0.85f), st, length, 0)
                }
                gravity = android.view.Gravity.START or android.view.Gravity.CENTER_VERTICAL
                onTap { startActivity(TaskActivity.intent(this@BribeActivity, b.id)) }
            }, MATCH_WRAP.apply { topMargin = dp(10f) })
        }
    }

    override fun onResume() { super.onResume(); TaskCenter.listen(onChange); refresh() }
    override fun onPause() { TaskCenter.unlisten(onChange); super.onPause() }

    private fun refresh() {
        val day = TaskCenter.today()
        val loot = wallet.loot.values.sum()
        summary.text = "${wallet.minutesLeft(day)} of 30 bribe minutes left today\n${wallet.honorLeft(day)} honor bribes left · $loot things in the nest"
        activeBox.removeAllViews()
        TaskCenter.active?.let { a ->
            val c = card(Kit.GOLD_TINT).apply { edge = Kit.GOLD }
            c.addView(text("In progress: ${a.bribe.title}", 18f, bold = true))
            c.addView(text(TaskCenter.progressText(), 15f))
            c.addView(primaryButton("Open it") { startActivity(TaskActivity.intent(this, a.bribe.id)) })
            c.addView(button("Give up on it") { TaskCenter.cancel() })
            activeBox.addView(c)
        }
    }
}
