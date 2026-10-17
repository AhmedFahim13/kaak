package app.kaak.ui

import android.app.Activity
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Bundle
import android.widget.LinearLayout
import android.view.View
import app.kaak.core.TrustLevel
import app.kaak.data.Wallet
import app.kaak.overlay.CrowPainter
import app.kaak.overlay.Pose
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/** Kaak's nest: every piece of loot, drawn, on a Dhaka rooftop at dusk. */
class NestActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val wallet = Wallet(this)
        val (scroll, root) = scrollPage()
        setContentView(scroll)
        val loot = wallet.loot
        val total = loot.values.sum()
        root.addView(text("Kaak's nest", 30f, bold = true))
        root.addView(NestView(this, loot), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(380f)))

        val r = wallet.returnedMin
        root.addView(text("Time Kaak got back for you: ${r / 60} h ${r % 60} min", 18f, bold = true))
        root.addView(text("Counted when you leave a feed within 2 minutes of Kaak showing up, or when he steals or eats it: " +
            "the time until you open a feed again, up to 30 minutes each time. Every 15 minutes adds something shiny.", 13f, quiet = true))

        val level = TrustLevel.of(wallet.trust)
        section(root, "Trust: ${level.label}")
        root.addView(text("${wallet.trust} points" + (level.next?.let { ". ${it.minPoints - wallet.trust} more to ${it.label}." } ?: ". As close as a crow gets."), 15f))
        root.addView(text(when (level) {
            TrustLevel.STRANGER -> "Kaak doesn't know you yet. Full chaos."
            TrustLevel.NEIGHBOUR -> "Gags come a bit less often, and you get a 7-minute warning before he eats the feed."
            TrustLevel.FRIEND -> "No more theft. He sits small in the corner, gags half as often, warns you 10 minutes early."
            TrustLevel.FAMILY -> "Gags come rarely and jumpscares almost never. He mostly just keeps you company."
        }, 15f))
        root.addView(text("A good day (under half your limit) earns 2 points, under the limit 1. " +
            "A day he eats the feed or you escape costs 1. It never resets.", 13f, quiet = true))

        section(root, if (total == 0) "The nest is empty" else "$total things, all his")
        root.addView(text(if (total == 0) "Do a bribe, or leave a feed when Kaak shows up. He'll start collecting."
        else loot.entries.sortedByDescending { it.value }.joinToString("\n") { "${it.value} × ${it.key}" }, 15f))
    }
}

class NestView(context: Context, private val loot: Map<String, Int>) : View(context) {
    private val dp = resources.displayMetrics.density
    private val crow = CrowPainter(dp * 0.95f)
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val bubble = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xE6141418.toInt() }
    private val bubbleText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt(); textSize = 14 * dp; typeface = Typeface.DEFAULT_BOLD
    }
    private val items: List<String> = loot.entries.flatMap { (k, v) -> List(v) { k } }.shuffled(Random(3)).take(70)

    override fun onDraw(c: Canvas) {
        val w = width.toFloat(); val h = height.toFloat()
        p.shader = LinearGradient(0f, 0f, 0f, h * 0.7f, 0xFF2B2440.toInt(), 0xFFB4583F.toInt(), Shader.TileMode.CLAMP)
        c.drawRoundRect(0f, 0f, w, h, 18 * dp, 18 * dp, p)
        p.shader = null
        p.color = 0xD9FFC478.toInt(); c.drawCircle(w * 0.3f, h * 0.42f, 34 * dp, p)
        p.color = 0xFF1C1418.toInt()
        listOf(0f to 0.50f, 0.18f to 0.44f, 0.36f to 0.52f, 0.58f to 0.40f, 0.76f to 0.48f).forEachIndexed { i, (x, y) ->
            c.drawRect(w * x, h * y, w * x + w * (0.2f + (i % 2) * 0.04f), h, p)
        }
        p.color = 0xFF6E6A66.toInt(); c.drawRect(0f, h * 0.78f, w, h, p)
        p.color = 0xFF57534F.toInt(); c.drawRect(0f, h * 0.78f, w, h * 0.80f, p)

        val cx = w * 0.46f; val cy = h * 0.72f; val rx = w * 0.30f; val ry = rx * 0.36f
        p.color = 0xFF3B2A1C.toInt(); c.drawOval(RectF(cx - rx, cy - ry, cx + rx, cy + ry), p)
        val rnd = Random(7)
        val browns = intArrayOf(0xFF7A5A3A.toInt(), 0xFF5E432A.toInt(), 0xFF9C7650.toInt(), 0xFF6B4E31.toInt())
        repeat(90) {
            val a = rnd.nextDouble() * 2 * Math.PI
            val r = 0.82 + rnd.nextDouble() * 0.3
            val x = cx + (cos(a) * rx * r).toFloat(); val y = cy + (sin(a) * ry * r).toFloat()
            val len = (14 + rnd.nextInt(18)) * dp
            val t = a + Math.PI / 2 + (rnd.nextDouble() - 0.5) * 0.8
            stroke.color = browns[rnd.nextInt(browns.size)]; stroke.strokeWidth = (2 + rnd.nextInt(3)) * dp * 0.7f
            c.drawLine(x, y, x + (cos(t) * len).toFloat(), y + (sin(t) * len * 0.5).toFloat(), stroke)
        }
        items.forEachIndexed { i, name ->
            val a = i * 2.399963
            val r = sqrt((i + 0.5) / maxOf(items.size, 12).toDouble())
            val x = cx + (cos(a) * rx * 0.72 * r).toFloat()
            val y = cy + (sin(a) * ry * 0.72 * r).toFloat() - 4 * dp
            drawLoot(c, name, x, y, dp * 1.15f, i)
        }
        val kaak = Pose(cx + rx * 0.95f, cy - ry * 0.35f, facing = -1f, headTilt = -0.2f)
        crow.draw(c, kaak)
        val total = loot.values.sum()
        val line = if (total == 0) "nothing yet. bring me things." else "$total things. all mine."
        val tw = bubbleText.measureText(line)
        val bx = (kaak.x - tw / 2 - 12 * dp).coerceIn(8 * dp, w - tw - 32 * dp)
        val by = kaak.y - 118 * dp
        c.drawRoundRect(bx, by, bx + tw + 24 * dp, by + 32 * dp, 12 * dp, 12 * dp, bubble)
        c.drawText(line, bx + 12 * dp, by + 21 * dp, bubbleText)
    }

    private fun fill(c: Canvas, color: Long, block: (Paint) -> Unit) { p.color = color.toInt(); block(p) }

    private fun drawLoot(c: Canvas, name: String, x: Float, y: Float, s: Float, i: Int) {
        c.save(); c.rotate((i * 47 % 60 - 30).toFloat(), x, y)
        when (name) {
            "bottle cap" -> {
                fill(c, 0xFFC0392BL) { c.drawCircle(x, y, 7 * s, it) }
                fill(c, 0xFFE57368L) { c.drawCircle(x, y, 4.5f * s, it) }
            }
            "coin", "morning gift" -> {
                fill(c, 0xFFE8B931L) { c.drawCircle(x, y, 7 * s, it) }
                stroke.color = 0xFFB8891AL.toInt(); stroke.strokeWidth = 1.2f * s; c.drawCircle(x, y, 5 * s, stroke)
            }
            "key" -> {
                fill(c, 0xFFC9A23AL) { c.drawCircle(x - 6 * s, y, 4.5f * s, it); c.drawRect(x - 3 * s, y - 1.3f * s, x + 9 * s, y + 1.3f * s, it); c.drawRect(x + 5 * s, y, x + 7 * s, y + 4 * s, it) }
                fill(c, 0xFF3B2A1CL) { c.drawCircle(x - 6 * s, y, 1.8f * s, it) }
            }
            "broken watch" -> {
                fill(c, 0xFF8A8F96L) { c.drawRect(x - 3 * s, y - 11 * s, x + 3 * s, y + 11 * s, it) }
                fill(c, 0xFFD5D8DCL) { c.drawCircle(x, y, 6 * s, it) }
                stroke.color = 0xFF222222.toInt(); stroke.strokeWidth = 1f * s
                c.drawLine(x, y, x, y - 4 * s, stroke); c.drawLine(x, y, x + 3 * s, y + 1 * s, stroke); c.drawLine(x - 4 * s, y - 3 * s, x + 2 * s, y + 4 * s, stroke)
            }
            "feather" -> fill(c, 0xFF26262BL) { c.drawOval(x - 10 * s, y - 2.5f * s, x + 10 * s, y + 2.5f * s, it) }
            "pencil stub" -> {
                fill(c, 0xFFF2C14EL) { c.drawRect(x - 7 * s, y - 2 * s, x + 5 * s, y + 2 * s, it) }
                fill(c, 0xFFE58FA0L) { c.drawRect(x - 9 * s, y - 2 * s, x - 7 * s, y + 2 * s, it) }
                fill(c, 0xFFE8D2A6L) { c.drawPath(Path().apply { moveTo(x + 5 * s, y - 2 * s); lineTo(x + 9 * s, y); lineTo(x + 5 * s, y + 2 * s); close() }, it) }
            }
            "seed" -> fill(c, 0xFF8B6B3EL) { c.drawOval(x - 3 * s, y - 2 * s, x + 3 * s, y + 2 * s, it) }
            "marble" -> {
                fill(c, 0xFF3F7FD6L) { c.drawCircle(x, y, 5.5f * s, it) }
                fill(c, 0xCCFFFFFFL) { c.drawCircle(x - 2 * s, y - 2 * s, 1.6f * s, it) }
            }
            "tea cup" -> {
                fill(c, 0xFFF4F1EAL) { c.drawRoundRect(x - 6 * s, y - 4 * s, x + 6 * s, y + 5 * s, 3 * s, 3 * s, it) }
                stroke.color = 0xFFF4F1EAL.toInt(); stroke.strokeWidth = 1.6f * s; c.drawCircle(x + 7 * s, y, 2.5f * s, stroke)
                fill(c, 0xFF9A5B2EL) { c.drawRect(x - 5 * s, y - 4 * s, x + 5 * s, y - 2.5f * s, it) }
            }
            "book page" -> {
                fill(c, 0xFFF3EEDCL) { c.drawRect(x - 6 * s, y - 8 * s, x + 6 * s, y + 8 * s, it) }
                stroke.color = 0xFF9A9384.toInt(); stroke.strokeWidth = 0.8f * s
                for (k in 0 until 5) c.drawLine(x - 4 * s, y - 5 * s + k * 3 * s, x + 4 * s, y - 5 * s + k * 3 * s, stroke)
            }
            "guitar pick" -> fill(c, 0xFFE67E22L) { c.drawPath(Path().apply { moveTo(x - 6 * s, y - 5 * s); quadTo(x, y - 8 * s, x + 6 * s, y - 5 * s); lineTo(x, y + 7 * s); close() }, it) }
            "candle" -> {
                fill(c, 0xFFF8F4E8L) { c.drawRect(x - 2.5f * s, y - 4 * s, x + 2.5f * s, y + 8 * s, it) }
                fill(c, 0xFFFFB43BL) { c.drawOval(x - 2 * s, y - 10 * s, x + 2 * s, y - 4.5f * s, it) }
            }
            "tangled earphones" -> {
                stroke.color = 0xFFF4F4F4.toInt(); stroke.strokeWidth = 1.2f * s
                c.drawPath(Path().apply { moveTo(x - 9 * s, y); cubicTo(x - 3 * s, y - 10 * s, x + 6 * s, y + 9 * s, x + 8 * s, y - 3 * s); cubicTo(x + 9 * s, y - 8 * s, x - 2 * s, y - 6 * s, x, y + 5 * s) }, stroke)
                fill(c, 0xFFF4F4F4L) { c.drawCircle(x - 9 * s, y, 2.2f * s, it); c.drawCircle(x, y + 5 * s, 2.2f * s, it) }
            }
            "rubber band" -> { stroke.color = 0xFFC9A97AL.toInt(); stroke.strokeWidth = 1.6f * s; c.drawOval(x - 7 * s, y - 4 * s, x + 7 * s, y + 4 * s, stroke) }
            "crayon" -> {
                fill(c, 0xFF2E9E5BL) { c.drawRect(x - 7 * s, y - 2 * s, x + 4 * s, y + 2 * s, it) }
                fill(c, 0xFF2E9E5BL) { c.drawPath(Path().apply { moveTo(x + 4 * s, y - 2 * s); lineTo(x + 8 * s, y); lineTo(x + 4 * s, y + 2 * s); close() }, it) }
            }
            "golden spoon" -> fill(c, 0xFFF0C330L) { c.drawOval(x - 9 * s, y - 4 * s, x - 1 * s, y + 4 * s, it); c.drawRect(x - 2 * s, y - 1 * s, x + 10 * s, y + 1 * s, it) }
            "button" -> {
                fill(c, 0xFF7D5BA6L) { c.drawCircle(x, y, 5.5f * s, it) }
                fill(c, 0xFF3D2A55L) { for (k in 0 until 4) c.drawCircle(x + (if (k % 2 == 0) -1.6f else 1.6f) * s, y + (if (k < 2) -1.6f else 1.6f) * s, 0.9f * s, it) }
            }
            else -> fill(c, 0xFFE8B931L) { c.drawCircle(x, y, 5 * s, it) }
        }
        c.restore()
    }
}
