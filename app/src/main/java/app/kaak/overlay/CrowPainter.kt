package app.kaak.overlay

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.RectF
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Where Kaak is and how he is holding himself. x/y = feet position in screen px.
 * facing 1 = right, -1 = left. headTilt radians (+ = beak down). squash < 1 crouches,
 * > 1 stretches. wing 0..1 raised. roll = body rotation in degrees. beakOpen 0..1.
 * fat 0..1. Face: brow -1 (angry) .. 1 (worried/surprised); lid 0 (wide) .. 1 (shut),
 * default 0.32 = his permanent judging look; look -1..1 = pupil left/right;
 * pupil = pupil size. tuft / scarf = spring angles driven by motion.
 */
data class Pose(
    val x: Float,
    val y: Float,
    val facing: Float = -1f,
    val headTilt: Float = 0f,
    val squash: Float = 1f,
    val wing: Float = 0f,
    val bob: Float = 0f,
    val legPhase: Float = 0f,
    val eyeOpen: Float = 1f,
    val scale: Float = 1f,
    val roll: Float = 0f,
    val beakOpen: Float = 0f,
    val fat: Float = 0f,
    val brow: Float = 0f,
    val lid: Float = 0.32f,
    val look: Float = 0.4f,
    val pupil: Float = 1f,
    val tuft: Float = 0f,
    val scarf: Float = 0f,
)

/**
 * Kaak, v2. A Dhaka house crow with a red-and-white gamcha scarf, a chipped beak,
 * a grumpy grey eyebrow, a three-feather tuft and a white die-cut sticker outline.
 * Drawn in crow units (about 118 wide, 95 tall), feet at (0,0), facing right.
 * The board (kaak-animation-board.html) draws him from the same paths.
 */
class CrowPainter(private val unit: Float) {
    /** Work mode: tiny gold glasses. */
    var glasses = false

    private fun fill(c: Long) = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = c.toInt(); style = Paint.Style.FILL }
    private fun line(c: Long, w: Float) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = c.toInt(); style = Paint.Style.STROKE; strokeWidth = w; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }

    private val ink = fill(0xFF16161CL)
    private val wingFill = fill(0xFF262634L)
    private val grey = fill(0xFF83838EL)
    private val red = fill(0xFFD9412EL)
    private val white = fill(0xFFFFFFFFL)
    private val black = fill(0xFF000000L)
    private val beak = fill(0xFF0F0F14L)
    private val mouth = fill(0xFF6A1F2AL)
    private val tongue = fill(0xFFE07A8AL)
    private val sticker = line(0xFFFFFFFFL, 6f)
    private val stickerFill = fill(0xFFFFFFFFL)
    private val legLine = line(0xFF2B2B33L, 3.2f)
    private val toeLine = line(0xFF2B2B33L, 2.2f)
    private val sheen = line(0xA65560A8L, 2.6f)
    private val sheenThin = line(0xB35560A8L, 1.3f)
    private val beakHi = line(0xFF3A3A46L, 1.3f)
    private val seam = line(0xFF2A2A33L, 1.1f)
    private val checks = line(0xFFFFFFFFL, 1.2f)
    private val browLine = line(0xFF8E8E99L, 3.2f)
    private val sleepLine = line(0xFF8E8E99L, 1.8f)
    private val lidEdge = line(0xFF000000L, 1.2f)
    private val gold = line(0xFFE8B931L, 1.8f)
    private val lens = fill(0x38BFE3FFL)

    private val tail1 = svg("M -20 -28 C -30 -33 -42 -35 -51 -32 C -44 -27 -32 -24 -20 -23 Z")
    private val tail2 = svg("M -20 -26 C -32 -27 -45 -25 -52 -21 C -43 -18 -30 -19 -19 -21 Z")
    private val tail3 = svg("M -20 -23 C -30 -21 -40 -16 -46 -10 C -36 -11 -27 -15 -18 -19 Z")
    private val body = svg("M 8 -52 C 28 -50 32 -24 16 -12 C 6 -5 -14 -7 -24 -19 C -32 -30 -22 -52 8 -52 Z")
    private val bodySheen = svg("M -19 -38 C -12 -48 0 -52 10 -51")
    private val shawl = svg("M 0 -58 C 18 -62 32 -50 30 -36 C 28 -26 18 -24 12 -30 C 6 -36 -6 -42 0 -58 Z")
    private val band = svg("M 2 -51 C 12 -47 22 -45 31 -47 L 32 -39.5 C 22 -37.5 12 -38.5 1 -43.5 Z")
    private val stripe1 = svg("M 2 -48.6 C 12 -44.6 22 -42.6 31.4 -44.6")
    private val stripe2 = svg("M 1.5 -45.8 C 12 -41.6 22 -40 31.7 -42")
    private val scarfA = svg("M 0 -48 C -8 -49 -15 -47 -21 -42 L -18 -37.5 C -12 -41 -6 -43.5 0 -44.5 Z")
    private val scarfB = svg("M 0 -46 C -6 -42 -9 -36 -11 -28 L -6.5 -28.5 C -5 -35 -2.5 -40 1.5 -43.5 Z")
    private val wingPath = svg("M 6 -46 C -8 -47 -22 -38 -30 -27 L -38 -22 L -29 -24.5 L -36 -16.5 L -27 -21 L -31 -12.5 L -19 -20 C -8 -26 2 -34 6 -46 Z")
    private val wingLine1 = svg("M -2 -42 C -10 -38 -18 -31 -24 -24")
    private val wingLine2 = svg("M 2 -37 C -6 -32 -12 -27 -17 -22")
    private val headSheen = svg("M 10 -73 C 14 -79 22 -81 28 -79")
    private val upper = svg("M 34 -71.5 C 40 -72 44 -71 46 -70 L 48.2 -67 L 50.6 -69 C 56 -67 61 -64 65.5 -60.5 L 36 -59.5 Z")
    private val upperHi = svg("M 37 -69 C 43 -69.5 46 -68.6 47 -68")
    private val lower = svg("M 36 -59.5 L 60.5 -59 C 54 -55.3 46 -53.3 37 -53 Z")
    private val mouthPath = svg("M 36 -61 L 56 -59.6 L 36.5 -55.5 Z")
    private val feather = svg("M 0 0 C -2.6 -6 -1.6 -11.5 2 -15 C 4.6 -10.5 4.2 -5 0 0 Z")
    private val tuft = arrayOf(floatArrayOf(11f, -74.5f, -0.7f), floatArrayOf(15.2f, -77f, -0.32f), floatArrayOf(19.6f, -78f, 0.04f))
    private val tmpPath = Path()
    private val headRect = RectF()

    fun draw(c: Canvas, p: Pose) {
        c.save()
        c.translate(p.x, p.y + p.bob)
        if (p.roll != 0f) {
            val piv = -34f * unit * p.scale
            c.rotate(p.roll, 0f, piv)
        }
        c.scale(p.facing * scaleX(p), unit * p.scale * p.squash)
        val f = 1f + p.fat * 0.3f
        val swing = sin(p.legPhase) * 4f
        val legs = arrayOf(floatArrayOf(-4f, -12f, -6f + swing), floatArrayOf(6f, -12f, 8f - swing))

        // pass 1: white die-cut sticker outline
        for (l in legs) {
            sticker.strokeWidth = 3.2f + 6f; c.drawLine(l[0], l[1], l[2], 0f, sticker)
            sticker.strokeWidth = 2.2f + 6f; c.drawLine(l[2], 0f, l[2] + 6f, 0.6f, sticker); c.drawLine(l[2], 0f, l[2] - 3.5f, 0.6f, sticker)
        }
        sticker.strokeWidth = 6f
        rotated(c, -20f, -24f, p.tuft * 0.4f) { for (t in arrayOf(tail1, tail2, tail3)) outline(c, t) }
        fat(c, f) { outline(c, body) }
        rotated(c, 0f, -46f, p.scarf) { outline(c, scarfA) }
        rotated(c, 0f, -46f, p.scarf * 1.35f) { outline(c, scarfB) }
        rotated(c, 2f, -42f, p.wing * 1.35f) { outline(c, wingPath) }
        rotated(c, 14f, -46f, p.headTilt) {
            c.drawCircle(22f, -64f, 16.5f, sticker); c.drawCircle(22f, -64f, 16.5f, stickerFill)
            drawTuft(c, p, sticker, stickerFill)
            rotated(c, 36f, -59.5f, -p.beakOpen * 0.42f) { outline(c, upper) }
            rotated(c, 36f, -59.5f, p.beakOpen * 0.38f) { outline(c, lower) }
        }

        // pass 2: colour
        for (l in legs) {
            c.drawLine(l[0], l[1], l[2], 0f, legLine)
            c.drawLine(l[2], 0f, l[2] + 6f, 0.6f, toeLine); c.drawLine(l[2], 0f, l[2] + 4.5f, 2.2f, toeLine); c.drawLine(l[2], 0f, l[2] - 3.5f, 0.6f, toeLine)
        }
        rotated(c, -20f, -24f, p.tuft * 0.4f) {
            c.drawPath(tail1, ink); c.drawPath(tail2, ink); c.drawPath(tail3, ink); c.drawPath(tail2, sheenThin)
        }
        fat(c, f) { c.drawPath(body, ink); c.drawPath(bodySheen, sheen) }
        scarfTail(c, scarfA, p.scarf)
        scarfTail(c, scarfB, p.scarf * 1.35f)
        rotated(c, 2f, -42f, p.wing * 1.35f) {
            if (p.wing > 0.25f) c.scale(1f + p.wing * 0.12f, 1f, 2f, -42f)
            c.drawPath(wingPath, wingFill); c.drawPath(wingLine1, sheenThin); c.drawPath(wingLine2, sheenThin)
        }
        rotated(c, 14f, -46f, p.headTilt) {
            c.drawPath(shawl, grey)
            c.drawPath(band, red)
            c.save(); c.clipPath(band)
            c.drawPath(stripe1, checks); c.drawPath(stripe2, checks)
            var i = 4f
            while (i < 32f) { c.drawLine(i, -52f, i + 1.5f, -36f, checks); i += 5f }
            c.restore()
            c.drawCircle(0.5f, -46f, 3.6f, red)
            checks.strokeWidth = 1f; c.drawCircle(0.5f, -46f, 1.8f, checks); checks.strokeWidth = 1.2f
            c.drawCircle(22f, -64f, 16.5f, ink)
            drawTuft(c, p, null, ink)
            c.drawPath(headSheen, sheen)
            if (p.beakOpen > 0.03f) {
                c.drawPath(mouthPath, mouth)
                c.drawOval(39.5f, -59.4f, 48.5f, -56.2f, tongue)
            }
            rotated(c, 36f, -59.5f, p.beakOpen * 0.38f) { c.drawPath(lower, beak) }
            rotated(c, 36f, -59.5f, -p.beakOpen * 0.42f) { c.drawPath(upper, beak); c.drawPath(upperHi, beakHi) }
            if (p.beakOpen < 0.03f) c.drawLine(36.5f, -59.5f, 60f, -59.2f, seam)
            drawEye(c, p)
            val b = p.brow
            tmpPath.reset()
            tmpPath.moveTo(20.5f, -74.5f - b * 1.6f)
            tmpPath.quadTo(27.5f, -76.5f - b * 2.6f, 35f, -73.8f - b * 3.8f + (if (b < 0) -b * 1.2f else 0f))
            c.drawPath(tmpPath, browLine)
            if (glasses) {
                c.drawCircle(EX + 0.5f, EY, ER + 2.2f, lens); c.drawCircle(EX + 0.5f, EY, ER + 2.2f, gold)
                c.drawLine(EX - ER - 1.6f, EY - 0.5f, 9f, -63f, gold)
            }
        }
        c.restore()
    }

    private fun drawEye(c: Canvas, p: Pose) {
        if (p.eyeOpen < 0f) {
            headRect.set(EX - ER * 0.8f, EY - 1.5f - ER * 0.8f, EX + ER * 0.8f, EY - 1.5f + ER * 0.8f)
            c.drawArc(headRect, 14f, 152f, false, sleepLine)
            return
        }
        c.drawCircle(EX, EY, ER, white)
        val pr = 3.3f * p.pupil
        val px = EX + 1.3f + p.look * 1.7f
        val py = EY + 0.4f
        c.drawCircle(px, py, pr, black)
        c.drawCircle(px - pr * 0.35f, py - pr * 0.45f, max(0.8f, pr * 0.3f), white)
        val lid = min(1f, max(0f, max(p.lid, 1f - p.eyeOpen)))
        if (lid > 0.01f) {
            c.save()
            tmpPath.reset(); tmpPath.addCircle(EX, EY, ER + 0.3f, Path.Direction.CW); c.clipPath(tmpPath)
            val edge = EY - ER + lid * ER * 2.05f
            tmpPath.reset()
            tmpPath.moveTo(EX - ER - 1f, EY - ER - 1f); tmpPath.lineTo(EX + ER + 1f, EY - ER - 1f)
            tmpPath.lineTo(EX + ER + 1f, edge - 1.2f); tmpPath.quadTo(EX, edge + 1.4f, EX - ER - 1f, edge - 0.6f); tmpPath.close()
            c.drawPath(tmpPath, ink)
            tmpPath.reset(); tmpPath.moveTo(EX - ER - 1f, edge - 0.6f); tmpPath.quadTo(EX, edge + 1.4f, EX + ER + 1f, edge - 1.2f)
            c.drawPath(tmpPath, lidEdge)
            c.restore()
        }
    }

    private fun drawTuft(c: Canvas, p: Pose, stroke: Paint?, paint: Paint) {
        for (t in tuft) {
            c.save()
            c.translate(t[0], t[1])
            c.rotate(Math.toDegrees((t[2] + p.tuft).toDouble()).toFloat())
            c.scale(0.85f, 0.85f)
            stroke?.let { c.drawPath(feather, it) }
            c.drawPath(feather, paint)
            c.restore()
        }
    }

    private fun scarfTail(c: Canvas, path: Path, angle: Float) = rotated(c, 0f, -46f, angle) {
        c.drawPath(path, red)
        c.save(); c.clipPath(path)
        var i = -24f
        while (i < 4f) { c.drawLine(i, -52f, i + 6f, -26f, checks); i += 4.2f }
        c.restore()
    }

    private fun outline(c: Canvas, path: Path) { c.drawPath(path, sticker); c.drawPath(path, stickerFill) }

    private inline fun rotated(c: Canvas, px: Float, py: Float, radians: Float, block: () -> Unit) {
        c.save(); c.rotate(Math.toDegrees(radians.toDouble()).toFloat(), px, py); block(); c.restore()
    }

    private inline fun fat(c: Canvas, f: Float, block: () -> Unit) {
        c.save(); c.scale(f, f, -2f, -30f); block(); c.restore()
    }

    /** Beak tip in screen px (for the peck ripple and for carrying things). */
    fun beakTip(p: Pose): PointF {
        val dx = 64f - 14f
        val dy = -60f + 46f
        val cs = cos(p.headTilt)
        val sn = sin(p.headTilt)
        val lx = 14f + dx * cs - dy * sn
        val ly = -46f + dx * sn + dy * cs
        return PointF(p.x + p.facing * scaleX(p) * lx, p.y + p.bob + unit * p.scale * p.squash * ly)
    }

    /** Top of the tuft in screen px, for placing subtitles. */
    fun headTopY(p: Pose): Float = p.y + p.bob - 92f * unit * p.scale * p.squash

    /** Approximate body bounds in screen px, for tap targets. */
    fun bounds(p: Pose, out: RectF): RectF {
        val sx = scaleX(p)
        val sy = unit * p.scale * p.squash
        out.set(p.x - 54f * sx, p.y - 90f * sy, p.x + 66f * sx, p.y + 4f * sy)
        out.sort()
        return out
    }

    private fun scaleX(p: Pose) = unit * p.scale * (1f + (1f - p.squash) * 0.5f)

    companion object {
        private const val EX = 28.5f
        private const val EY = -66f
        private const val ER = 6.3f

        /** Tiny SVG path reader: absolute M, L, C, Q, Z (all Kaak needs). */
        fun svg(d: String): Path {
            val path = Path()
            val t = d.replace(",", " ").trim().split(Regex("\\s+"))
            var i = 0
            var cmd = 'M'
            fun n() = t[i++].toFloat()
            while (i < t.size) {
                val tok = t[i]
                if (tok.length == 1 && tok[0].isLetter()) { cmd = tok[0]; i++; if (cmd == 'Z') { path.close(); continue } }
                when (cmd) {
                    'M' -> { path.moveTo(n(), n()); cmd = 'L' }
                    'L' -> path.lineTo(n(), n())
                    'C' -> path.cubicTo(n(), n(), n(), n(), n(), n())
                    'Q' -> path.quadTo(n(), n(), n(), n())
                    else -> i++
                }
            }
            return path
        }
    }
}
