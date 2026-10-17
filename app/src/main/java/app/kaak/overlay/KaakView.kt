package app.kaak.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.RectF
import android.graphics.Typeface
import android.os.SystemClock
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import app.kaak.core.JumpscareLevel
import app.kaak.core.Lines
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * The stage Kaak performs on. Used full-screen as an overlay over other apps,
 * and embedded in Kaak's own screens (onboarding, the asleep card, drawing).
 *
 * Performances are queues of [Seg]ments: move to a pose over some milliseconds,
 * optionally flapping or walking, optionally firing a callback when they start.
 * Callbacks can queue more segments, which is how the chase keeps hopping.
 */
@SuppressLint("ViewConstructor")
class KaakView(
    context: Context,
    private val feedback: Feedback?,
    private val lines: Lines,
) : View(context) {

    /** The overlay makes its window touchable only while this says so (splat). */
    var onTouchableChanged: (Boolean) -> Unit = {}
    /** Where Kaak can be tapped during a chase, in view px (null = nowhere). */
    var onHitbox: (RectF?) -> Unit = {}
    /** Embedded in an activity: taps reach Kaak directly instead of via a hitbox window. */
    var directTouch = false
    /** Inside Kaak's own white screens the bubble is white with a grey lip; over other apps it stays dark. */
    var lightBubble = false
    private val bubbleEdge = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE7E5E0.toInt() }

    /** Friend-level trust: Kaak sits small in the top corner instead of on the feed. */
    var calm = false
    var glasses: Boolean
        get() = painter.glasses
        set(v) { painter.glasses = v }

    private enum class Motion { STILL, FLAP, WALK }

    private class Seg(val ms: Long, val to: Pose, val motion: Motion = Motion.STILL, val onStart: (() -> Unit)? = null)

    private sealed interface Carry {
        class Icon(val bitmap: Bitmap?, val label: String) : Carry
        class Label(val text: String) : Carry
        data object Gift : Carry
        data object Paper : Carry
    }

    private class Dropped(val carry: Carry, val x: Float, val y: Float, val start: Long, val falls: Boolean)
    private class Ripple(val x: Float, val y: Float, val start: Long)
    private class Feather(val x: Float, val y: Float, val vx: Float, val vy: Float, val spin: Float, val start: Long)
    private class Crack(val x: Float, val y: Float, val paths: List<Path>, val start: Long)
    private class BigText(val text: String, val sizePx: Float, val start: Long)
    private class Footprint(val x: Float, val y: Float, val rot: Float)
    private class Splat(
        val cx: Float, val cy: Float,
        val blobs: List<FloatArray>, val core: List<FloatArray>, val spray: List<FloatArray>, val drips: List<FloatArray>,
        val droppedAt: Long,
    ) {
        var fadeStart = -1L
        var wipeDx = 0f
        var wipeDy = 0f
    }
    private class Shard(val x: Float, val y: Float, val vx: Float, val vy: Float, val size: Float, val spin: Float, val start: Long)
    private class Chase(val needed: Int, val deadline: Long, val area: RectF, val onWon: () -> Unit, val onLost: () -> Unit) {
        var hits = 0
    }

    private val dp = resources.displayMetrics.density
    private val unit = dp * 0.95f
    private val painter = CrowPainter(unit)
    private val random = Random.Default

    private val queue = ArrayDeque<Seg>()
    private var seg: Seg? = null
    private var segStart = 0L
    private var from = Pose(-9999f, -9999f)
    private var pose = Pose(-9999f, -9999f)
    private var perched = false
    private var sleeping = false
    private var offFeed = false

    private var subtitle: String? = null
    private var subtitleUntil = 0L
    private var ripple: Ripple? = null
    private var splat: Splat? = null
    private var touchDown: PointF? = null
    private var carry: Carry? = null
    private val dropped = mutableListOf<Dropped>()
    private val feathers = mutableListOf<Feather>()
    private var crack: Crack? = null
    private var bigText: BigText? = null
    private var shakeUntil = 0L
    private var shakeAmp = 0f
    private var chase: Chase? = null
    private val footprints = mutableListOf<Footprint>()
    private var tile: Carry.Icon? = null
    private var tileAt = PointF()

    private var dim = 0f
    private var dimTarget = 0f
    private var blanket = 0f
    private var blanketTarget = 0f
    private var eaten = 0f
    private var eatenTarget = 0f
    private var hold = -1f

    private var lastFrame = 0L
    private val tmp = RectF()

    // jumpscare layers
    private var shakeTotal = 550f
    private var flickerFrom = -1L; private var flickerUntil = 0L
    private var zoomUntil = 0L; private var zoomMs = 300f
    private var whiteAt = -1L; private var whiteMs = 0L
    private var vignetteAt = -1L; private var vignetteMs = 0L
    private val shards = mutableListOf<Shard>()
    private var smearFrom: PointF? = null
    private val overlayPaint = Paint()
    private val zoomPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt(); strokeCap = Paint.Cap.ROUND }
    private val shardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xD9E8F4FF.toInt() }
    private val shardEdge = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = 0xFFFFFFFF.toInt() }
    private val smearPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; color = 0x59D8D8CC }
    private val splatCore = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF9A9C7E.toInt() }
    private val splatSpeck = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF5E5F4A.toInt() }
    private val splatGloss = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; color = 0xFFFFFFFF.toInt() }

    // secondary motion: the tuft and gamcha tails lag behind and spring back
    private var tuftX = 0f; private var tuftV = 0f
    private var scarfX = 0f; private var scarfV = 0f
    private var lastPx = Float.NaN; private var lastPy = Float.NaN
    private var vx = 0f; private var vy = 0f
    private var flapping = false
    private class Puff(val x: Float, val y: Float, val dir: Float, val start: Long)
    private val puffs = mutableListOf<Puff>()
    // short expression flashes (surprise on a hit, a scowl on a peck)
    private var flashBrow = 0f; private var flashLid = 0f; private var flashPupil = 1f; private var flashUntil = 0L
    private val speedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xCCFFFFFF.toInt(); strokeCap = Paint.Cap.ROUND }
    private val puffPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF4F1EA.toInt() }

    // ---------- paints ----------
    private fun sp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, resources.displayMetrics)
    private val bubblePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xE6141418.toInt() }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt(); textSize = sp(15f); typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val bigFill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt(); textAlign = Paint.Align.CENTER; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val bigStroke = Paint(bigFill).apply { color = 0xFF000000.toInt(); style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND }
    private val zPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt(); typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD_ITALIC)
    }
    private val zShadow = Paint(zPaint).apply { color = 0xFF000000.toInt() }
    private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = 0xFFFFFFFF.toInt() }
    private val splatPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF1F1EA.toInt() }
    private val splatShade = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFD2D2C8.toInt() }
    private val splatEdge = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.5f * dp; color = 0x55000000 }
    private val crackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; color = 0xFFFFFFFF.toInt(); strokeWidth = 1.8f * dp; strokeJoin = Paint.Join.ROUND
    }
    private val crackShadow = Paint(crackPaint).apply { color = 0x99000000.toInt(); strokeWidth = 3.4f * dp }
    private val dimPaint = Paint().apply { color = 0xFF000000.toInt() }
    private val eatPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF0E0E12.toInt() }
    private val quilt = intArrayOf(0xFF3B4A8C.toInt(), 0xFF2F3C75.toInt(), 0xFF4F5FA8.toInt())
    private val quiltPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stitch = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; color = 0x55FFFFFF; strokeWidth = 1.2f * dp; pathEffect = DashPathEffect(floatArrayOf(5 * dp, 4 * dp), 0f)
    }
    private val tilePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt() }
    private val tileText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF19191D.toInt(); textAlign = Paint.Align.CENTER; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val pillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF2C14E.toInt() }
    private val giftPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF2C14E.toInt() }
    private val giftShine = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFF4C2.toInt() }
    private val featherPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF26262B.toInt() }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; color = 0xFFF2C14E.toInt(); strokeWidth = 6 * dp; strokeCap = Paint.Cap.ROUND
    }
    private val ringTrack = Paint(ringPaint).apply { color = 0x33FFFFFF }
    private val mud = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; color = 0xDD6B4A2B.toInt(); strokeWidth = 5 * dp; strokeCap = Paint.Cap.ROUND
    }
    private val bubbleRect = RectF()
    private val tailPath = Path()

    private val w get() = if (width > 0) width.toFloat() else resources.displayMetrics.widthPixels.toFloat()
    private val h get() = if (height > 0) height.toFloat() else resources.displayMetrics.heightPixels.toFloat()

    // ---------- positions ----------
    private fun perch() =
        if (calm) Pose(58 * dp, h * 0.115f, facing = 1f, scale = 0.8f) else Pose(w - 54 * dp, h * 0.30f, facing = -1f)
    private fun offRight() = Pose(w + 90 * dp, h * 0.12f, facing = -1f)
    private fun offLeft() = Pose(-90 * dp, h * 0.12f, facing = -1f)
    private fun rail() = Pose(w - 48 * dp, h * 0.64f, facing = -1f)
    /** Feet y that puts the body centre at [cy] for a given scale. */
    private fun feetFor(cy: Float, scale: Float) = cy + 32f * unit * scale

    // =====================================================================
    // Milestone 1 performances
    // =====================================================================

    /** Stage 1: land on the edge, stare, peck the glass twice. */
    fun arrive() = laidOut {
        clearScript()
        resetTransient()
        val p = perch()
        if (!perched) flyInTo(p, 1300)
        val stare = p.copy(brow = -0.35f, lid = 0.48f, look = 1f)
        push(Seg(500, stare) { say(lines.arrive(), 2600) })
        push(Seg(1700, stare))
        push(Seg(120, stare.copy(headTilt = -0.2f, squash = 1.05f)))
        push(Seg(110, stare.copy(headTilt = 0.65f, squash = 0.92f)) { say(lines.peck(), 2600) })
        push(Seg(160, stare) { peckHit() })
        push(Seg(110, stare.copy(headTilt = 0.65f, squash = 0.92f)))
        push(Seg(160, stare) { peckHit() })
        push(Seg(400, p))
    }

    /** User came back to a feed after leaving: Kaak is already waiting. */
    fun again(line: String = lines.again()) = laidOut {
        clearScript()
        resetTransient()
        val p = perch()
        if (!perched) flyInTo(p, 900) else hop(p)
        push(Seg(500, p.copy(headTilt = -0.25f, lid = 0.55f, brow = 0.25f, look = 1f)) { say(line, 2600) })
        push(Seg(1600, p.copy(headTilt = -0.25f, lid = 0.55f, brow = 0.25f, look = 1f)))
        push(Seg(300, p))
    }

    fun warn(minutes: Int) = laidOut {
        clearScript()
        resetTransient()
        val p = perch()
        if (!perched) flyInTo(p, 900) else hop(p)
        push(Seg(400, p.copy(headTilt = 0.3f, beakOpen = 0.5f, brow = -0.8f, lid = 0.2f)) { say(lines.warn(minutes), 3200) })
        push(Seg(1400, p.copy(headTilt = 0.3f, beakOpen = 0.2f, brow = -0.8f, lid = 0.2f)))
        push(Seg(300, p))
    }

    /** Heckle: hop down and stroll across the bottom of the reel. */
    fun walkAcross(line: String = lines.walk()) = laidOut {
        clearScript()
        resetTransient()
        val gy = h * 0.84f
        val start = Pose(w - 40 * dp, gy, facing = -1f)
        val end = Pose(40 * dp, gy, facing = -1f)
        if (!perched) push(Seg(0, offRight()))
        push(Seg(700, start, Motion.FLAP) { perched = false })
        push(Seg(180, start.copy(squash = 0.8f)) { dust(start) })
        push(Seg(5000, end.copy(lid = 0.45f, look = 1f), Motion.WALK) { say(line, 3500) })
        push(Seg(300, end.copy(facing = 1f, headTilt = -0.3f)))
        returnToPerch()
    }

    /** Heckle: sit right where the like button usually is. */
    fun sitOnRail(line: String) = laidOut {
        clearScript()
        resetTransient()
        val r = rail()
        if (!perched) push(Seg(0, offRight()))
        push(Seg(650, r, Motion.FLAP) { perched = false })
        push(Seg(200, r.copy(squash = 0.78f)) { feedback?.thud(false); dust(r) })
        push(Seg(4800, r.copy(squash = 0.8f, lid = 0.55f, brow = 0.2f, look = -1f)) { say(line, 4600) })
        returnToPerch()
    }

    /** Heckle: fly over, leave a splat the user has to wipe off. */
    fun splat() = laidOut {
        clearScript()
        resetTransient()
        val mid = Pose(w * 0.55f, h * 0.16f, facing = -1f)
        if (!perched) push(Seg(0, offRight()))
        push(Seg(800, mid, Motion.FLAP) { perched = false; feedback?.caw() })
        push(Seg(900, offLeft(), Motion.FLAP) { dropSplat(); say(lines.splat(), 2600); feedback?.thud(true) })
        push(Seg(1200, offLeft()))
        push(Seg(0, offRight()))
        flyInTo(perch(), 1200)
    }

    // =====================================================================
    // Milestone 2 performances
    // =====================================================================

    /**
     * Theft: the app's tile appears, Kaak swoops in and grabs it ([onGrabbed]
     * is where the service sends the user home), then flaps around the home
     * screen. Five taps win it back; 15 seconds of ignoring him and he keeps it.
     */
    fun steal(icon: Bitmap?, label: String, onGrabbed: () -> Unit, onWon: () -> Unit, onLost: () -> Unit) = laidOut {
        clearScript()
        offFeed = true
        val grab = PointF(w * 0.5f, h * 0.42f)
        val at = Pose(grab.x + 34 * dp, feetFor(grab.y, 1f) + 12 * dp, facing = -1f, headTilt = 0.35f)
        push(Seg(0, offRight()) { tile = Carry.Icon(icon, label); tileAt = grab; perched = false; feedback?.caw() })
        push(Seg(700, at, Motion.FLAP))
        push(Seg(200, at.copy(headTilt = 0.6f, beakOpen = 1f, brow = -1f, lid = 0.1f)))
        push(Seg(160, at.copy(headTilt = 0.1f, brow = -1f, lid = 0.15f, beakOpen = 0.35f)) {
            carry = tile; tile = null
            ripple = Ripple(grab.x, grab.y, now())
            feedback?.thud(true)
            say(lines.steal(), 2200)
            onGrabbed()
        })
        push(Seg(500, at.copy(y = at.y - 60 * dp), Motion.FLAP) {
            startChase(RectF(w * 0.15f, h * 0.30f, w * 0.85f, h * 0.75f), onWon, onLost)
        })
    }

    /** Onboarding: Kaak steals the Next button. Taps on Kaak go straight to the view. */
    fun stealButton(target: RectF, label: String, onGrabbed: () -> Unit, onWon: () -> Unit) = laidOut {
        clearScript()
        directTouch = true
        val at = Pose(target.centerX() + 30 * dp, target.centerY() + 22 * dp, facing = -1f)
        push(Seg(0, offRight()) { perched = false })
        push(Seg(900, at, Motion.FLAP) { feedback?.caw() })
        push(Seg(220, at.copy(headTilt = 0.5f, beakOpen = 1f)))
        push(Seg(160, at) {
            carry = Carry.Label(label); onGrabbed(); say(lines.steal(), 2000); feedback?.thud(false)
        })
        push(Seg(400, at.copy(y = at.y - 50 * dp), Motion.FLAP) {
            val area = RectF(w * 0.12f, h * 0.18f, w * 0.88f, h * 0.78f)
            startChase(area, onWon, onLost = {
                // In onboarding Kaak never really keeps the button: he gives up and drops it.
                carry?.let { dropped += Dropped(it, pose.x, pose.y, now(), falls = true) }
                carry = null
                onWon()
            }, deadlineMs = 25_000)
        })
    }

    /** Taps on Kaak during a chase (from the hitbox window, or direct touch). */
    fun hitKaak() {
        val c = chase ?: return
        c.hits++
        val b = painter.bounds(pose, tmp)
        repeat(7) {
            feathers += Feather(b.centerX(), b.centerY(), (random.nextFloat() - 0.5f) * 260 * dp,
                (-random.nextFloat()) * 200 * dp, (random.nextFloat() - 0.5f) * 720f, now())
        }
        feedback?.peck()
        if (c.hits >= c.needed) {
            chase = null
            onHitbox(null)
            clearScript()
            carry?.let { dropped += Dropped(it, b.centerX(), b.centerY(), now(), falls = true) }
            carry = null
            say(lines.chaseWon(), 2400)
            val p = rest(pose)
            push(Seg(250, p.copy(squash = 0.9f, headTilt = 0.4f, brow = 0.9f, lid = 0.6f, look = -1f)))
            push(Seg(1300, p.copy(squash = 0.9f, headTilt = 0.4f, brow = 0.9f, lid = 0.6f, look = -1f)))
            push(Seg(900, offRight().copy(facing = 1f), Motion.FLAP) { perched = false })
            push(Seg(0, offRight()) { offFeed = false; c.onWon() })
        } else {
            flash(1f, 0f, 0.6f, 450)
            say(lines.hit(), 1200)
            clearScript()
            chaseHop()
        }
        kick()
    }

    /**
     * Jumpscare: the lights flicker, Kaak lunges from deep inside the phone and
     * slams into the glass: white flash, red pulse, cracks, shards, feathers,
     * a huge shaking KAA!, then he slides down the glass leaving a smear.
     */
    fun jumpscare(level: JumpscareLevel) = laidOut {
        if (level == JumpscareLevel.OFF) return@laidOut
        clearScript()
        resetTransient()
        val full = level == JumpscareLevel.FULL
        val gentle = level == JumpscareLevel.GENTLE
        val scale = when { gentle -> 2.6f; full -> 7.5f; else -> 5f }
        val center = PointF(w * 0.5f, h * 0.45f)
        val cx = w * 0.5f + 20 * dp * scale
        val start = Pose(w * 0.5f, h * 0.56f, facing = -1f, scale = 0.3f, brow = -1f, lid = 0f)
        val hit = Pose(cx, feetFor(h * 0.48f, scale), facing = -1f, scale = scale, wing = 1f, beakOpen = 1f, brow = -1f, lid = 0f, pupil = 0.45f)
        val lunge = if (full) 240L else if (gentle) 380L else 300L
        push(Seg(0, start) {
            perched = false
            if (!gentle) { flickerFrom = now(); flickerUntil = now() + if (full) 560 else 340 }
        })
        if (!gentle) push(Seg(if (full) 560 else 340, start))
        push(Seg(lunge, hit, Motion.FLAP) { zoomMs = lunge.toFloat(); zoomUntil = now() + lunge; feedback?.caw() })
        push(Seg(0, hit.copy(squash = 0.88f)) { impact(level, center) })
        push(Seg(if (full) 1100 else 750, hit.copy(squash = 0.88f, beakOpen = 0.75f)))
        push(Seg(1500, hit.copy(y = h + 90 * dp * scale, roll = -22f, squash = 0.84f, wing = 0.4f, lid = 0.3f, brow = 0.6f)) {
            if (!gentle) smearFrom = PointF(center.x, center.y)
        })
        push(Seg(1600, offRight()) { smearFrom = null })
        flyInTo(perch(), 1100)
    }

    /**
     * Eaten: Kaak flies to the middle and eats the screen in three bites,
     * gets fat, burps. [onDone] is where the service sends the user home.
     */
    fun eat(onDone: () -> Unit) = laidOut {
        clearScript()
        resetTransient()
        val s = 2.2f
        val c = Pose(w * 0.5f + 10 * dp, feetFor(h * 0.48f, s), facing = -1f, scale = s)
        if (!perched) push(Seg(0, offRight()))
        push(Seg(800, c, Motion.FLAP) { perched = false; feedback?.caw() })
        repeat(3) { i ->
            push(Seg(220, c.copy(beakOpen = 1f, headTilt = -0.15f, brow = -0.9f, lid = 0.1f)))
            push(Seg(150, c.copy(beakOpen = 0f, headTilt = 0.2f)) {
                eatenTarget = (i + 1) / 3f; say(lines.chomp(), 700); feedback?.thud(true)
            })
            push(Seg(260, c))
        }
        push(Seg(500, c.copy(fat = 1f, squash = 0.92f, brow = 0.4f, lid = 0.6f, beakOpen = 0.3f)) { say(lines.burp(), 1800) })
        push(Seg(1100, c.copy(fat = 1f, squash = 0.92f, eyeOpen = 0.5f, brow = 0.4f, lid = 0.6f)))
        push(Seg(0, c.copy(fat = 1f)) { onDone() })
    }

    /** Bedtime arrival: lands at the bottom, yawns, falls asleep. Screen dims. */
    fun bedArrive() = laidOut {
        clearScript()
        resetTransient()
        val lie = Pose(w * 0.5f, h * 0.88f, facing = -1f, squash = 0.72f)
        if (!perched || sleeping) {
            push(Seg(0, offRight()) { sleeping = false })
            push(Seg(1200, lie.copy(squash = 1f), Motion.FLAP) { feedback?.caw() })
        }
        push(Seg(220, lie) { perched = true })
        push(Seg(900, lie.copy(beakOpen = 1f, eyeOpen = 0.4f, headTilt = -0.3f)) {
            say(lines.yawn(), 2400); dimTarget = min(0.6f, dimTarget + 0.15f)
        })
        push(Seg(700, lie.copy(eyeOpen = 0.3f)))
        push(Seg(0, lie) { sleeping = true })
    }

    /** Bedtime heckle: a blanket rises over the feed and Kaak snores on top. */
    fun blanket() = laidOut {
        clearScript()
        resetTransient()
        blanketTarget = if (blanketTarget == 0f) 0.3f else min(0.6f, blanketTarget + 0.12f)
        dimTarget = min(0.6f, dimTarget + 0.15f)
        val top = Pose(w * 0.55f, h * (1f - blanketTarget) + 6 * dp, facing = -1f, squash = 0.72f)
        sleeping = false
        if (!perched) push(Seg(0, offRight()))
        push(Seg(900, top.copy(squash = 1f), Motion.FLAP))
        push(Seg(200, top) { perched = true; sleeping = true; say(lines.snore(), 2600) })
    }

    /** Morning: Kaak drops something shiny for you, then leaves. */
    fun morningGift(onDone: () -> Unit) = laidOut {
        clearScript()
        offFeed = true
        sleeping = false
        val spot = Pose(w * 0.55f, h * 0.80f, facing = -1f)
        push(Seg(0, offRight()) { carry = Carry.Gift })
        push(Seg(1300, spot, Motion.FLAP) { feedback?.caw() })
        push(Seg(220, spot.copy(squash = 0.85f, headTilt = 0.6f)))
        push(Seg(200, spot) {
            val tip = painter.beakTip(pose)
            dropped += Dropped(Carry.Gift, tip.x, tip.y + 6 * dp, now(), falls = false)
            carry = null
            say(lines.morning(), 3200)
            feedback?.peck()
        })
        push(Seg(2800, spot.copy(headTilt = -0.2f)))
        push(Seg(900, offRight().copy(facing = 1f), Motion.FLAP))
        push(Seg(1200, offRight()) { offFeed = false; onDone() })
    }

    /** Sunday: Kaak drops off the Kaak Times on the home screen. */
    fun timesDelivery(onDone: () -> Unit) = laidOut {
        clearScript()
        offFeed = true
        sleeping = false
        val spot = Pose(w * 0.5f, h * 0.78f, facing = -1f)
        push(Seg(0, offRight()) { carry = Carry.Paper })
        push(Seg(1300, spot, Motion.FLAP) { feedback?.caw() })
        push(Seg(220, spot.copy(squash = 0.85f, headTilt = 0.6f)))
        push(Seg(200, spot) {
            val tip = painter.beakTip(pose)
            dropped += Dropped(Carry.Paper, tip.x - 10 * dp, tip.y + 10 * dp, now(), falls = false)
            carry = null
            say(lines.extra(), 2600)
            feedback?.peck()
        })
        push(Seg(2400, spot.copy(headTilt = -0.2f, beakOpen = 0.6f)))
        push(Seg(900, offRight().copy(facing = 1f), Motion.FLAP))
        push(Seg(400, offRight()) { offFeed = false; onDone() })
    }

    /** Mood "avoiding something": Kaak takes the feed and points you at the task. */
    fun snatch(icon: Bitmap?, label: String, line: String, onGrabbed: () -> Unit) = laidOut {
        clearScript()
        offFeed = true
        val grab = PointF(w * 0.5f, h * 0.42f)
        val at = Pose(grab.x + 34 * dp, feetFor(grab.y, 1f) + 12 * dp, facing = -1f, headTilt = 0.35f)
        push(Seg(0, offRight()) { tile = Carry.Icon(icon, label); tileAt = grab; perched = false })
        push(Seg(700, at, Motion.FLAP))
        push(Seg(200, at.copy(headTilt = 0.6f, beakOpen = 1f)))
        push(Seg(160, at.copy(headTilt = 0.1f)) { carry = tile; tile = null; say(line, 2600); feedback?.thud(false) })
        push(Seg(900, offLeft().copy(facing = -1f), Motion.FLAP))
        push(Seg(0, offLeft()) { carry = null; offFeed = false; onGrabbed() })
    }

    /** Asleep card: Kaak, full and asleep, lying on the app he ate. */
    fun sleepOnApp(icon: Bitmap?, label: String) = laidOut {
        clearScript()
        directTouch = false
        tile = Carry.Icon(icon, label)
        tileAt = PointF(w * 0.5f, h * 0.62f)
        val p = Pose(w * 0.5f + 8 * dp, tileAt.y - 30 * dp, facing = -1f, scale = 1.5f, fat = 0.7f, squash = 0.8f)
        pose = p
        perched = true
        sleeping = true
        kick()
    }

    /** Hold-to-escape progress on the asleep card: 0..1 while holding, -1 = reset, -2 = let go early. */
    fun setHold(progress: Float) {
        val starting = hold < 0f && progress >= 0f
        val stopping = hold >= 0f && progress < 0f
        hold = progress
        if (starting) { sleeping = false; pose = pose.copy(eyeOpen = 0.55f); say(lines.holding(), 5200) }
        if (stopping) { sleeping = true; if (progress < -1.5f) say(lines.letGo(), 1600) else subtitle = null }
        invalidate()
    }

    /** Contract: Kaak lands next to the signature and stomps a muddy footprint. */
    fun stamp(x: Float, y: Float, onDone: () -> Unit) = laidOut {
        clearScript()
        val at = Pose(x + 26 * dp, y + 8 * dp, facing = -1f, scale = 1.2f)
        push(Seg(0, offRight()) { perched = false })
        push(Seg(1000, at.copy(squash = 1f), Motion.FLAP) { feedback?.caw() })
        push(Seg(160, at.copy(squash = 0.75f)) {
            footprints += Footprint(x, y, -20f + random.nextFloat() * 40f)
            feedback?.thud(true)
            say(if (lines.lang == app.kaak.core.Lang.ENGLISH) "binding." else "pakka.", 2200)
        })
        push(Seg(300, at))
        push(Seg(1100, at.copy(headTilt = -0.25f)))
        push(Seg(900, offRight().copy(facing = 1f), Motion.FLAP))
        push(Seg(0, offRight()) { onDone() })
    }

    /** Drawing screen: Kaak sits still and poses, smugly. */
    fun strikePose(x: Float, y: Float, scale: Float, facing: Float = 1f) = laidOut {
        clearScript()
        pose = Pose(x, y, facing = facing, headTilt = -0.28f, scale = scale, lid = 0.45f, brow = -0.2f, look = 1f)
        perched = true
        kick()
    }

    /** Tapped on Kaak's own screens: he jumps, looks offended, says something. */
    fun poke(line: String) {
        if (seg != null || queue.isNotEmpty()) return
        val p = rest(pose)
        flash(1f, 0f, 0.6f, 380)
        hop(p)
        push(Seg(700, p.copy(brow = -0.6f, lid = 0.4f, headTilt = -0.15f)) { say(line, 1800) })
        push(Seg(300, p))
        feedback?.peck()
        kick()
    }

    /**
     * Leftovers from an interrupted performance (a stolen icon, a chase, the black
     * eaten cover) must never survive into the next one: that's what left Kaak
     * stuck on screen holding Instagram.
     */
    private fun resetTransient() {
        chase = null
        onHitbox(null)
        carry = null
        tile = null
        offFeed = false
        eaten = 0f
        eatenTarget = 0f
    }

    fun isChasing() = chase != null

    /** Quietly back on his perch after a quick hop or an unlock. */
    fun resumePerch() = laidOut {
        if (perched || seg != null || queue.isNotEmpty()) return@laidOut
        resetTransient()
        flyInTo(perch(), 700)
    }

    /** System setting "Remove animations": no white flash, gentler shake. */
    private fun reducedMotion(): Boolean = runCatching {
        android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }.getOrDefault(false)

    /** A small poke between gags. Never interrupts a performance in progress. */
    fun nudge(line: String, sleepy: Boolean) = laidOut {
        if (seg != null || queue.isNotEmpty() || chase != null || offFeed) return@laidOut
        if (sleepy && sleeping) { say(lines.snore(), 1600); kick(); return@laidOut }
        val p = if (perched) rest(pose) else perch()
        if (!perched) flyInTo(p, 900)
        when (random.nextInt(4)) {
            0 -> { hop(p); push(Seg(500, p.copy(lid = 0.5f, brow = -0.4f, look = 1f)) { say(line, 2200) }) }
            1 -> {
                push(Seg(110, p.copy(headTilt = 0.65f, squash = 0.92f)) { say(line, 2200) })
                push(Seg(150, p) { peckHit() })
                push(Seg(110, p.copy(headTilt = 0.65f, squash = 0.92f)))
                push(Seg(150, p) { peckHit() })
            }
            2 -> {
                val lean = p.copy(x = p.x + p.facing * 24 * dp, scale = 1.35f, lid = 0.08f, brow = -0.8f, pupil = 0.8f)
                push(Seg(320, lean) { say(line, 2200) })
                push(Seg(1100, lean))
                push(Seg(300, p))
            }
            else -> {
                push(Seg(500, p.copy(wing = 1f, y = p.y - 8 * dp, brow = -0.6f, beakOpen = 0.6f)) { say(line, 2200); feedback?.caw() })
                push(Seg(250, p.copy(squash = 0.85f)) { dust(p) })
            }
        }
        push(Seg(900, p))
        kick()
    }

    fun say(text: String, ms: Long) {
        subtitle = text
        subtitleUntil = now() + ms
        kick()
    }

    fun isBusyOffFeed(): Boolean = offFeed || chase != null

    fun clearAll() {
        clearScript()
        splat = null; ripple = null; subtitle = null; crack = null; bigText = null; tile = null; carry = null
        chase = null; feathers.clear(); dropped.clear(); directTouch = false; shards.clear(); smearFrom = null
        flickerUntil = 0L; zoomUntil = 0L; whiteAt = -1L; vignetteAt = -1L
        perched = false; sleeping = false; offFeed = false
        dim = 0f; dimTarget = 0f; blanket = 0f; blanketTarget = 0f; eaten = 0f; eatenTarget = 0f
        pose = offRight()
        onHitbox(null)
        onTouchableChanged(false)
        invalidate()
    }

    // ---------- script helpers ----------

    private fun laidOut(block: () -> Unit) {
        if (width > 0 && height > 0) { block(); kick() }
        else addOnLayoutChangeListener(object : OnLayoutChangeListener {
            override fun onLayoutChange(v: View?, l: Int, t: Int, r: Int, b: Int, ol: Int, ot: Int, or: Int, ob: Int) {
                if (width > 0 && height > 0) { removeOnLayoutChangeListener(this); block(); kick() }
            }
        })
    }

    private fun flyInTo(p: Pose, ms: Long) {
        push(Seg(0, offRight()) { sleeping = false })
        push(Seg(ms, p, Motion.FLAP) { feedback?.caw() })
        push(Seg(170, p.copy(squash = 0.74f, brow = -0.3f)) { perched = true; feedback?.thud(false); dust(p) })
        push(Seg(220, p.copy(squash = 1.06f)))
        push(Seg(160, p))
    }

    private fun hop(p: Pose) {
        push(Seg(110, p.copy(squash = 0.8f)))
        push(Seg(150, p.copy(squash = 1.12f, y = p.y - 10 * dp)))
        push(Seg(110, p.copy(squash = 0.82f)) { dust(p) })
        push(Seg(140, p))
    }

    /** Landing dust: a few puffs skid out from his feet. */
    private fun dust(p: Pose) {
        val t = now()
        repeat(5) { i -> puffs += Puff(p.x, p.y, (i - 2) / 2f, t) }
    }

    private fun flash(brow: Float, lid: Float, pupil: Float, ms: Long) {
        flashBrow = brow; flashLid = lid; flashPupil = pupil; flashUntil = now() + ms
    }

    private fun returnToPerch() {
        val p = perch()
        push(Seg(110, rest(pose).copy(squash = 0.78f)))
        push(Seg(1000, p.copy(facing = 1f), Motion.FLAP))
        push(Seg(170, p.copy(squash = 0.76f)) { perched = true; dust(p) })
        push(Seg(200, p))
    }

    private fun startChase(area: RectF, onWon: () -> Unit, onLost: () -> Unit, deadlineMs: Long = 15_000) {
        chase = Chase(5, now() + deadlineMs, area, onWon, onLost)
        chaseHop()
    }

    private fun chaseHop() {
        val c = chase ?: return
        val spot = Pose(
            c.area.left + random.nextFloat() * c.area.width(),
            c.area.top + random.nextFloat() * c.area.height(),
            facing = if (random.nextBoolean()) 1f else -1f,
        )
        push(Seg(90, rest(pose).copy(squash = 0.8f)))
        push(Seg(480, spot, Motion.FLAP) { onHitbox(null) })
        push(Seg(140, spot.copy(squash = 0.8f)) { dust(spot); onHitbox(RectF(painter.bounds(spot, tmp)).apply { inset(-18 * dp, -18 * dp) }) })
        push(Seg(140, spot))
        push(Seg(1500 + random.nextLong(900), spot.copy(headTilt = -0.2f, brow = -0.6f, lid = 0.2f, beakOpen = 0.25f)))
        push(Seg(0, spot) { if (chase != null) chaseHop() })
    }

    private fun loseChase() {
        val c = chase ?: return
        chase = null
        onHitbox(null)
        clearScript()
        say(lines.chaseLost(), 2200)
        push(Seg(1100, offRight().copy(facing = 1f), Motion.FLAP))
        push(Seg(0, offRight()) { carry = null; offFeed = false; c.onLost() })
    }

    private fun impact(level: JumpscareLevel, at: PointF) {
        val full = level == JumpscareLevel.FULL
        val gentle = level == JumpscareLevel.GENTLE
        shakeAmp = (if (gentle) 4f else if (full) 22f else 12f) * dp
        shakeTotal = if (gentle) 300f else if (full) 950f else 620f
        shakeUntil = now() + shakeTotal.toLong()
        flash(-1f, 0f, 0.45f, 1300)
        bigText = BigText(lines.kaa(), sp(if (gentle) 36f else if (full) 112f else 78f), now())
        val calm = reducedMotion()
        if (calm) { shakeAmp = min(shakeAmp, 4 * dp) }
        if (!gentle) {
            crack = makeCrack(at, if (full) 18 else 10)
            whiteAt = now(); whiteMs = if (calm) 0 else if (full) 280 else 150
            vignetteAt = now(); vignetteMs = if (full) 1500 else 900
            repeat(if (full) 16 else 6) {
                shards += Shard(at.x + (random.nextFloat() - 0.5f) * 60 * dp, at.y + (random.nextFloat() - 0.5f) * 60 * dp,
                    (random.nextFloat() - 0.5f) * 520 * dp, -random.nextFloat() * 260 * dp,
                    (6 + random.nextFloat() * 16) * dp, (random.nextFloat() - 0.5f) * 900f, now())
            }
            repeat(if (full) 22 else 10) {
                feathers += Feather(at.x, at.y, (random.nextFloat() - 0.5f) * 720 * dp, -random.nextFloat() * 520 * dp,
                    (random.nextFloat() - 0.5f) * 900f, now())
            }
        }
        feedback?.jumpscare(level)
    }

    private fun makeCrack(at: PointF, rays: Int): Crack {
        val maxLen = max(w, h) * 0.6f
        val paths = mutableListOf<Path>()
        val rayPoints = mutableListOf<List<PointF>>()
        repeat(rays) { i ->
            var a = i * 2 * PI / rays + random.nextDouble() * 0.35
            var x = at.x; var y = at.y
            val p = Path().apply { moveTo(x, y) }
            val pts = mutableListOf(PointF(x, y))
            val steps = 5 + random.nextInt(3)
            val len = maxLen * (0.55f + random.nextFloat() * 0.45f)
            repeat(steps) { s ->
                a += (random.nextDouble() - 0.5) * 0.45
                val d = len / steps
                x += (cos(a) * d).toFloat(); y += (sin(a) * d).toFloat()
                p.lineTo(x, y); pts += PointF(x, y)
                if (s in 1..3 && random.nextFloat() < 0.45f) {
                    val b = a + (if (random.nextBoolean()) 0.75 else -0.75)
                    paths += Path().apply { moveTo(x, y); lineTo(x + (cos(b) * d * 0.9).toFloat(), y + (sin(b) * d * 0.9).toFloat()) }
                }
            }
            paths += p
            rayPoints += pts
        }
        // spider-web rings joining neighbouring rays, with gaps so it looks like glass
        for (ring in 1..2) {
            val web = Path()
            for (i in rayPoints.indices) {
                val a = rayPoints[i].getOrNull(ring) ?: continue
                val b = rayPoints[(i + 1) % rayPoints.size].getOrNull(ring) ?: continue
                if (random.nextFloat() < 0.78f) { web.moveTo(a.x, a.y); web.quadTo((a.x + b.x) / 2 + (at.x - (a.x + b.x) / 2) * 0.12f, (a.y + b.y) / 2 + (at.y - (a.y + b.y) / 2) * 0.12f, b.x, b.y) }
            }
            paths += web
        }
        val ring = Path().apply {
            val r = 16 * dp
            repeat(10) { i ->
                val a = i * 2 * PI / 10
                val px = at.x + (cos(a) * r * (0.75 + random.nextDouble() * 0.5)).toFloat()
                val py = at.y + (sin(a) * r * (0.75 + random.nextDouble() * 0.5)).toFloat()
                if (i == 0) moveTo(px, py) else lineTo(px, py)
            }
            close()
        }
        paths += ring
        return Crack(at.x, at.y, paths, now())
    }

    private fun push(s: Seg) = queue.addLast(s)

    private fun clearScript() {
        queue.clear()
        if (seg != null) pose = rest(pose)
        seg = null
    }

    private fun kick() = postInvalidateOnAnimation()

    private fun now() = SystemClock.uptimeMillis()

    private fun peckHit() {
        flash(-0.9f, 0.15f, 0.9f, 220)
        val tip = painter.beakTip(pose)
        ripple = Ripple(tip.x, tip.y, now())
        feedback?.peck()
    }

    private fun dropSplat() {
        val cx = w * (0.38f + random.nextFloat() * 0.24f)
        val cy = h * (0.38f + random.nextFloat() * 0.16f)
        val blobs = mutableListOf<FloatArray>()
        val core = mutableListOf<FloatArray>()
        val spray = mutableListOf<FloatArray>()
        fun blob(ox: Float, oy: Float, main: Float, n: Int) {
            blobs += floatArrayOf(ox, oy, main)
            repeat(n) { i ->
                val a = i.toDouble() / n * 2 * PI + random.nextDouble() * 0.6
                val d = main * (0.7f + random.nextFloat() * 0.55f)
                blobs += floatArrayOf(ox + (cos(a) * d).toFloat(), oy + (sin(a) * d).toFloat(), main * (0.32f + random.nextFloat() * 0.3f))
            }
            repeat(3) { core += floatArrayOf(ox + (random.nextFloat() - 0.5f) * main * 0.5f, oy + (random.nextFloat() - 0.5f) * main * 0.5f, main * (0.22f + random.nextFloat() * 0.16f)) }
        }
        blob(0f, 0f, 60 * dp, 11)
        repeat(2) {
            val a = random.nextDouble() * 2 * PI
            val d = (125 + random.nextInt(60)) * dp
            blob((cos(a) * d).toFloat(), (sin(a) * d * 0.8).toFloat(), (22 + random.nextInt(10)) * dp, 6)
        }
        repeat(22) {
            val a = random.nextDouble() * 2 * PI
            val d = (85 + random.nextInt(150)) * dp
            spray += floatArrayOf((cos(a) * d).toFloat(), (sin(a) * d).toFloat(), (3 + random.nextInt(8)) * dp)
        }
        val drips = List(5) { floatArrayOf((-48 + random.nextInt(96)) * dp, (45 + random.nextInt(80)) * dp, (10 + random.nextInt(7)) * dp) }
        splat = Splat(cx, cy, blobs, core, spray, drips, now())
        shakeAmp = 6 * dp; shakeTotal = 260f; shakeUntil = now() + 260
        onTouchableChanged(true)
    }

    private fun wipe(now: Long, thanked: Boolean, dx: Float = 0f, dy: Float = 60f) {
        val s = splat ?: return
        if (s.fadeStart >= 0) return
        s.fadeStart = now
        val len = max(1f, hypot(dx, dy))
        s.wipeDx = dx / len * 160 * dp; s.wipeDy = dy / len * 160 * dp
        onTouchableChanged(false)
        if (thanked) say(lines.wiped(), 1800)
        kick()
    }

    // ---------- touch ----------

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        splat?.let { s ->
            if (s.fadeStart >= 0) return true
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> touchDown = PointF(e.x, e.y)
                MotionEvent.ACTION_MOVE -> {
                    val d = touchDown ?: return true
                    if (hypot(e.x - d.x, e.y - d.y) > 80 * dp) wipe(now(), thanked = true, e.x - d.x, e.y - d.y)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> touchDown = null
            }
            return true
        }
        if (directTouch && chase != null && e.actionMasked == MotionEvent.ACTION_DOWN) {
            val b = painter.bounds(pose, tmp).apply { inset(-22 * dp, -22 * dp) }
            if (b.contains(e.x, e.y)) { hitKaak(); return true }
        }
        return false
    }

    // ---------- frame loop ----------

    override fun onDraw(c: Canvas) {
        val now = now()
        val dt = if (lastFrame == 0L) 16f else min(64f, (now - lastFrame).toFloat())
        lastFrame = now
        step(now)

        dim = approach(dim, dimTarget, dt / 1000f * 0.3f)
        blanket = approach(blanket, blanketTarget, dt / 1000f * 0.5f)
        eaten = approach(eaten, eatenTarget, dt / 1000f * 2.2f)
        chase?.let { if (now > it.deadline) loseChase() }

        c.save()
        if (now < shakeUntil) {
            val k = (shakeUntil - now) / shakeTotal
            c.translate((random.nextFloat() - 0.5f) * 2 * shakeAmp * k, (random.nextFloat() - 0.5f) * 2 * shakeAmp * k)
        }

        if (dim > 0.005f) { dimPaint.alpha = (dim * 255).toInt(); c.drawRect(0f, 0f, w, h, dimPaint) }
        if (now in flickerFrom until flickerUntil) {
            // the lights go down once, smoothly. No rapid flicker: flashing faster than
            // 3 times a second can trigger seizures in people with photosensitive epilepsy.
            val k = (now - flickerFrom).toFloat() / (flickerUntil - flickerFrom)
            dimPaint.alpha = (sin(PI * k).toFloat() * 0.6f * 255).toInt()
            c.drawRect(0f, 0f, w, h, dimPaint)
        }
        if (now < zoomUntil) {
            val k = 1f - (zoomUntil - now) / zoomMs
            zoomPaint.alpha = (k * 170).toInt(); zoomPaint.strokeWidth = 3 * dp
            for (i in 0 until 26) {
                val a = i * 2 * PI / 26
                val r0 = max(w, h) * (0.62f - k * 0.18f)
                val r1 = r0 - (40 + 90 * k) * dp
                c.drawLine(w / 2 + (cos(a) * r0).toFloat(), h * 0.45f + (sin(a) * r0).toFloat(), w / 2 + (cos(a) * r1).toFloat(), h * 0.45f + (sin(a) * r1).toFloat(), zoomPaint)
            }
        }
        if (blanket > 0.005f) drawBlanket(c)
        for (f in footprints) drawFootprint(c, f)

        splat?.let { s ->
            if (s.fadeStart < 0 && now - s.droppedAt > SPLAT_MAX_MS) wipe(now, thanked = false)
            val a = if (s.fadeStart < 0) 1f else 1f - (now - s.fadeStart) / 350f
            if (a <= 0f) splat = null else drawSplat(c, s, a)
        }
        if (eaten > 0.005f) drawEaten(c)
        tile?.let { drawTile(c, it, tileAt.x, tileAt.y, 92 * dp, 1f) }
        drawDropped(c, now)

        updateSprings(dt)
        smearFrom?.let { from ->
            val b = painter.bounds(pose, tmp)
            smearPaint.strokeWidth = b.width() * 0.32f
            c.drawLine(from.x, from.y, b.centerX(), b.centerY(), smearPaint)
        }
        drawSpeedLines(c)
        drawPuffs(c, now)
        var drawn = pose.copy(tuft = tuftX, scarf = scarfX)
        if (now < flashUntil) drawn = drawn.copy(brow = flashBrow, lid = flashLid, pupil = flashPupil)
        painter.draw(c, drawn)
        carry?.let { drawCarry(c, it) }

        drawFeathers(c, now)
        ripple?.let { r ->
            val t = (now - r.start) / 450f
            if (t >= 1f) ripple = null else {
                ripplePaint.alpha = ((1f - t) * 200).toInt(); ripplePaint.strokeWidth = 2.5f * dp
                c.drawCircle(r.x, r.y, 4 * dp + t * 26 * dp, ripplePaint)
            }
        }
        crack?.let { cr ->
            val age = now - cr.start
            val a = if (age < 2200) 1f else 1f - (age - 2200) / 900f
            if (a <= 0f) crack = null else {
                crackShadow.alpha = (a * 170).toInt(); crackPaint.alpha = (a * 255).toInt()
                crackShadow.strokeWidth = 4.2f * dp; crackPaint.strokeWidth = 2.2f * dp
                for (p in cr.paths) { c.drawPath(p, crackShadow); c.drawPath(p, crackPaint) }
            }
        }
        drawShards(c, now)
        if (sleeping) drawZzz(c, now)
        if (hold >= 0f) drawHoldRing(c)
        c.restore()

        if (vignetteAt >= 0 && now - vignetteAt < vignetteMs) {
            val k = 1f - (now - vignetteAt).toFloat() / vignetteMs
            overlayPaint.shader = android.graphics.RadialGradient(w / 2, h / 2, max(w, h) * 0.72f,
                intArrayOf(0x00E0503A, 0xE6B0201A.toInt()), floatArrayOf(0.42f, 1f), android.graphics.Shader.TileMode.CLAMP)
            overlayPaint.alpha = (k * 255).toInt()
            c.drawRect(0f, 0f, w, h, overlayPaint)
            overlayPaint.shader = null
        }
        if (whiteAt >= 0 && now - whiteAt < whiteMs) {
            overlayPaint.color = 0xFFFFFFFF.toInt()
            overlayPaint.alpha = ((1f - (now - whiteAt).toFloat() / whiteMs) * 255).toInt()
            c.drawRect(0f, 0f, w, h, overlayPaint)
        }

        bigText?.let { bt ->
            val age = now - bt.start
            if (age > 1400) bigText = null else {
                val pop = if (age < 120) 0.6f + age / 300f else 1f
                val a = if (age < 1000) 1f else 1f - (age - 1000) / 400f
                bigFill.textSize = bt.sizePx * pop; bigStroke.textSize = bt.sizePx * pop
                bigStroke.strokeWidth = bt.sizePx * 0.12f
                bigFill.alpha = (a * 255).toInt(); bigStroke.alpha = (a * 255).toInt()
                val jitter = if (age < 650) bt.sizePx * 0.05f * (1f - age / 650f) else 0f
                val jx = (random.nextFloat() - 0.5f) * 2 * jitter
                val jy = (random.nextFloat() - 0.5f) * 2 * jitter
                c.drawText(bt.text, w / 2 + jx, h * 0.24f + jy, bigStroke)
                c.drawText(bt.text, w / 2 + jx, h * 0.24f + jy, bigFill)
            }
        }
        subtitle?.let { if (now < subtitleUntil) drawBubble(c, it) else subtitle = null }

        val animating = seg != null || queue.isNotEmpty() || ripple != null || crack != null || bigText != null ||
            puffs.isNotEmpty() || abs(tuftV) > 0.002f || abs(scarfV) > 0.002f || now < flashUntil ||
            shards.isNotEmpty() || now < flickerUntil || now < zoomUntil || smearFrom != null ||
            (vignetteAt >= 0 && now - vignetteAt < vignetteMs) || (whiteAt >= 0 && now - whiteAt < whiteMs) ||
            (splat != null && now - (splat?.droppedAt ?: 0L) < 2_700) ||
            feathers.isNotEmpty() || dropped.isNotEmpty() || chase != null || (splat?.fadeStart ?: -1L) >= 0 ||
            abs(dim - dimTarget) > 0.005f || abs(blanket - blanketTarget) > 0.005f || abs(eaten - eatenTarget) > 0.005f
        when {
            animating -> postInvalidateOnAnimation()
            sleeping -> postInvalidateDelayed(40)
            subtitle != null || splat != null || hold >= 0f -> postInvalidateDelayed(100)
            perched -> postInvalidateDelayed(250) // idle perch: a gentle bob is enough, save battery
        }
    }

    private fun updateSprings(dt: Float) {
        val px = pose.x; val py = pose.y
        if (!lastPx.isNaN() && dt > 0f) {
            vx = vx * 0.6f + ((px - lastPx) / unit / dt * 16f) * 0.4f
            vy = vy * 0.6f + ((py - lastPy) / unit / dt * 16f) * 0.4f
        }
        lastPx = px; lastPy = py
        if (abs(vx) > 400f || abs(vy) > 400f) { vx = 0f; vy = 0f } // teleports between scenes
        val f = pose.facing
        val flutter = if (flapping) sin(now() / 70.0).toFloat() * 0.18f else 0f
        val tuftTarget = (-vx * f * 0.05f - vy * 0.03f + flutter).coerceIn(-0.9f, 0.9f)
        val scarfTarget = (-vx * f * 0.07f + vy * 0.05f + flutter * 1.5f).coerceIn(-1.1f, 0.9f)
        tuftV = (tuftV + (tuftTarget - tuftX) * 0.18f) * 0.8f; tuftX += tuftV
        scarfV = (scarfV + (scarfTarget - scarfX) * 0.12f) * 0.84f; scarfX += scarfV
    }

    private fun drawSpeedLines(c: Canvas) {
        val speed = kotlin.math.sqrt(vx * vx + vy * vy)
        if (!flapping || speed < 3f) return
        val b = painter.bounds(pose, tmp)
        val nx = -vx / speed; val ny = -vy / speed
        val a = ((speed - 3f) / 6f).coerceIn(0f, 1f)
        speedPaint.alpha = (a * 200).toInt(); speedPaint.strokeWidth = 2.2f * dp
        for (i in -1..1) {
            val ox = b.centerX() + nx * b.width() * 0.45f - ny * i * 12 * dp
            val oy = b.centerY() + ny * b.height() * 0.45f + nx * i * 12 * dp
            val len = (16 + 8 * (1 - abs(i))) * dp * (0.6f + a * 0.6f)
            c.drawLine(ox, oy, ox + nx * len, oy + ny * len, speedPaint)
        }
    }

    private fun drawPuffs(c: Canvas, now: Long) {
        val it = puffs.iterator()
        while (it.hasNext()) {
            val p = it.next()
            val t = (now - p.start) / 420f
            if (t >= 1f) { it.remove(); continue }
            puffPaint.alpha = ((1f - t) * 200).toInt()
            val x = p.x + p.dir * (10 + 26 * t) * dp
            val y = p.y - (2 + 6 * t) * dp * (1f - abs(p.dir) * 0.4f)
            c.drawCircle(x, y, (3 + 5 * t) * dp * (1f - abs(p.dir) * 0.25f), puffPaint)
        }
    }

    private fun approach(v: Float, target: Float, step: Float) =
        if (v < target) min(target, v + step) else max(target, v - step)

    private fun step(now: Long) {
        while (true) {
            val s = seg ?: run {
                val next = queue.removeFirstOrNull()
                if (next == null) {
                    flapping = false
                    pose = pose.copy(
                        bob = if (perched && !sleeping) sin(now / 450.0).toFloat() * 0.7f * dp else 0f,
                        eyeOpen = when {
                            sleeping -> -1f
                            hold >= 0f -> 0.55f
                            else -> blink(now)
                        },
                    )
                    return
                }
                seg = next
                segStart = now
                from = rest(pose)
                next.onStart?.invoke()
                next
            }
            if (seg !== s) continue // the callback replaced the script
            val elapsed = now - segStart
            val t = if (s.ms <= 0) 1f else (elapsed.toFloat() / s.ms).coerceIn(0f, 1f)
            pose = interp(from, s.to, t, s.motion, elapsed, now)
            flapping = s.motion == Motion.FLAP
            if (t < 1f) return
            seg = null
            pose = rest(s.to)
            if (s.ms > 0) return
        }
    }

    private fun interp(a: Pose, b: Pose, t: Float, motion: Motion, elapsed: Long, now: Long): Pose {
        val e = if (motion == Motion.WALK) t else easeInOut(t)
        fun l(x: Float, y: Float) = x + (y - x) * e
        val arc = if (motion == Motion.FLAP) -sin(PI * t).toFloat() * 28 * dp else 0f
        val explicitEyes = a.eyeOpen != 1f || b.eyeOpen != 1f
        return Pose(
            x = l(a.x, b.x),
            y = l(a.y, b.y) + arc,
            facing = b.facing,
            headTilt = l(a.headTilt, b.headTilt) + (if (motion == Motion.WALK) sin(elapsed / 80.0).toFloat() * 0.13f else 0f),
            squash = l(a.squash, b.squash) * (if (motion == Motion.FLAP) 1.05f else 1f),
            wing = if (motion == Motion.FLAP) (sin(elapsed / 55.0) * 0.5 + 0.5).toFloat() else l(a.wing, b.wing),
            bob = when (motion) {
                Motion.WALK -> -abs(sin(elapsed / 80.0)).toFloat() * 2.5f * dp
                Motion.STILL -> if (sleeping) 0f else sin(now / 450.0).toFloat() * 0.7f * dp
                Motion.FLAP -> 0f
            },
            legPhase = if (motion == Motion.WALK) elapsed / 80f else 0f,
            eyeOpen = when {
                explicitEyes -> l(a.eyeOpen, b.eyeOpen)
                sleeping -> -1f
                else -> blink(now)
            },
            scale = l(a.scale, b.scale),
            roll = l(a.roll, b.roll),
            beakOpen = l(a.beakOpen, b.beakOpen),
            fat = l(a.fat, b.fat),
            brow = l(a.brow, b.brow),
            lid = l(a.lid, b.lid),
            look = l(a.look, b.look),
            pupil = l(a.pupil, b.pupil),
        )
    }

    private fun rest(p: Pose) = p.copy(bob = 0f, legPhase = 0f, eyeOpen = if (p.eyeOpen < 0f) -1f else 1f, wing = if (p.wing == 1f) 1f else 0f)

    // 260 ms so a blink is still seen at the idle frame rate (4 a second)
    private fun blink(now: Long) = if (now % 3700 < 260) 0f else 1f

    private fun easeInOut(t: Float) = if (t < 0.5f) 2 * t * t else 1 - (-2 * t + 2) * (-2 * t + 2) / 2

    // ---------- drawing ----------

    private fun drawBubble(c: Canvas, text: String) {
        val pad = 10 * dp
        // wrap long lines (Bangla runs long) so the bubble never leaves the screen
        val maxText = w - 32 * dp - pad * 2
        val wrapped = mutableListOf<String>()
        var cur = ""
        for (word in text.split(" ")) {
            val next = if (cur.isEmpty()) word else "$cur $word"
            if (cur.isNotEmpty() && textPaint.measureText(next) > maxText) { wrapped += cur; cur = word } else cur = next
        }
        if (cur.isNotEmpty()) wrapped += cur
        val lineH = textPaint.textSize * 1.25f
        val tw = wrapped.maxOf { textPaint.measureText(it) }
        val bw = tw + pad * 2
        val bh = lineH * wrapped.size - (lineH - textPaint.textSize) + pad * 2
        val anchorX = pose.x.coerceIn(0f, w)
        val anchorY = (painter.headTopY(pose) - 10 * dp).coerceIn(bh + 36 * dp, h - 8 * dp)
        val left = (anchorX - bw / 2).coerceIn(8 * dp, max(8 * dp, w - 8 * dp - bw))
        val top = (anchorY - bh).coerceAtLeast(36 * dp)
        bubbleRect.set(left, top, left + bw, top + bh)
        if (lightBubble) {
            bubblePaint.color = 0xFFFFFFFF.toInt(); textPaint.color = 0xFF2B2A33.toInt()
            c.drawRoundRect(left - 2 * dp, top - 2 * dp, left + bw + 2 * dp, top + bh + 4 * dp, 15 * dp, 15 * dp, bubbleEdge)
        } else {
            bubblePaint.color = 0xE6141418.toInt(); textPaint.color = 0xFFFFFFFF.toInt()
        }
        c.drawRoundRect(bubbleRect, 13 * dp, 13 * dp, bubblePaint)
        val tx = anchorX.coerceIn(left + 14 * dp, left + bw - 14 * dp)
        tailPath.reset()
        tailPath.moveTo(tx - 7 * dp, top + bh - 1); tailPath.lineTo(tx, top + bh + 8 * dp); tailPath.lineTo(tx + 7 * dp, top + bh - 1)
        tailPath.close()
        if (!lightBubble) c.drawPath(tailPath, bubblePaint)
        wrapped.forEachIndexed { i, l -> c.drawText(l, left + pad, top + pad + textPaint.textSize * 0.82f + i * lineH, textPaint) }
    }

    private fun drawTile(c: Canvas, icon: Carry.Icon, cx: Float, cy: Float, size: Float, alpha: Float) {
        val r = size / 2
        tilePaint.alpha = (alpha * 255).toInt()
        c.drawRoundRect(cx - r, cy - r, cx + r, cy + r, size * 0.24f, size * 0.24f, tilePaint)
        val bmp = icon.bitmap
        if (bmp != null) {
            val inset = size * 0.08f
            tmp.set(cx - r + inset, cy - r + inset, cx + r - inset, cy + r - inset)
            c.drawBitmap(bmp, null, tmp, null)
        } else {
            tileText.textSize = size * 0.42f
            c.drawText(icon.label.take(1), cx, cy + size * 0.15f, tileText)
        }
    }

    private fun drawCarry(c: Canvas, item: Carry) {
        val tip = painter.beakTip(pose)
        when (item) {
            is Carry.Icon -> drawTile(c, item, tip.x + pose.facing * 14 * dp, tip.y + 16 * dp, 40 * dp, 1f)
            is Carry.Label -> drawPill(c, item.text, tip.x + pose.facing * 10 * dp, tip.y + 14 * dp)
            Carry.Gift -> drawGift(c, tip.x + pose.facing * 4 * dp, tip.y + 6 * dp, 1f)
            Carry.Paper -> drawPaper(c, tip.x + pose.facing * 6 * dp, tip.y + 12 * dp, 1f)
        }
    }

    private val paperPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF3EEE2.toInt() }
    private val paperInk = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF2A2A2A.toInt(); strokeWidth = 1.4f * dp }

    private fun drawPaper(c: Canvas, x: Float, y: Float, a: Float) {
        paperPaint.alpha = (a * 255).toInt(); paperInk.alpha = (a * 255).toInt()
        c.save(); c.rotate(-8f, x, y)
        c.drawRect(x - 20 * dp, y - 13 * dp, x + 20 * dp, y + 13 * dp, paperPaint)
        c.drawRect(x - 16 * dp, y - 10 * dp, x + 16 * dp, y - 6 * dp, paperInk)
        for (i in 0 until 4) c.drawLine(x - 16 * dp, y - 1 * dp + i * 3.5f * dp, x + 16 * dp, y - 1 * dp + i * 3.5f * dp, paperInk)
        c.restore()
    }

    private fun drawPill(c: Canvas, text: String, cx: Float, cy: Float) {
        tileText.textSize = sp(15f)
        val tw = tileText.measureText(text)
        c.drawRoundRect(cx - tw / 2 - 14 * dp, cy - 16 * dp, cx + tw / 2 + 14 * dp, cy + 16 * dp, 16 * dp, 16 * dp, pillPaint)
        c.drawText(text, cx, cy + tileText.textSize * 0.35f, tileText)
    }

    private fun drawGift(c: Canvas, x: Float, y: Float, a: Float) {
        giftPaint.alpha = (a * 255).toInt(); giftShine.alpha = (a * 255).toInt()
        c.drawCircle(x, y, 9 * dp, giftPaint)
        c.drawCircle(x - 3 * dp, y - 3 * dp, 3 * dp, giftShine)
    }

    private fun drawDropped(c: Canvas, now: Long) {
        val it = dropped.iterator()
        while (it.hasNext()) {
            val d = it.next()
            val age = (now - d.start) / 1000f
            if (d.falls) {
                if (age > 1f) { it.remove(); continue }
                val y = d.y + 900 * dp * age * age
                when (val item = d.carry) {
                    is Carry.Icon -> drawTile(c, item, d.x, y, 40 * dp, 1f - age)
                    is Carry.Label -> drawPill(c, item.text, d.x, y)
                    Carry.Gift -> drawGift(c, d.x, y, 1f - age)
                    Carry.Paper -> drawPaper(c, d.x, y, 1f - age)
                }
            } else {
                if (age > 6f) { it.remove(); continue }
                val a = if (age < 5f) 1f else 6f - age
                if (d.carry == Carry.Paper) { drawPaper(c, d.x, d.y, a); continue }
                drawGift(c, d.x, d.y, a)
                val tw = (sin(now / 160.0) * 0.5 + 0.5).toFloat()
                giftShine.alpha = (a * tw * 255).toInt()
                c.drawCircle(d.x + 12 * dp, d.y - 12 * dp, 2.5f * dp, giftShine)
            }
        }
    }

    private fun drawFeathers(c: Canvas, now: Long) {
        val it = feathers.iterator()
        while (it.hasNext()) {
            val f = it.next()
            val t = (now - f.start) / 1000f
            if (t > 0.9f) { it.remove(); continue }
            val x = f.x + f.vx * t
            val y = f.y + f.vy * t + 300 * dp * t * t
            featherPaint.alpha = ((1f - t / 0.9f) * 255).toInt()
            c.save(); c.rotate(f.spin * t, x, y)
            c.drawOval(x - 7 * dp, y - 2.5f * dp, x + 7 * dp, y + 2.5f * dp, featherPaint)
            c.restore()
        }
    }

    private fun drawShards(c: Canvas, now: Long) {
        val it = shards.iterator()
        while (it.hasNext()) {
            val s = it.next()
            val t = (now - s.start) / 1000f
            if (t > 1.3f) { it.remove(); continue }
            val x = s.x + s.vx * t
            val y = s.y + s.vy * t + 1300 * dp * t * t
            val a = (1f - t / 1.3f).coerceIn(0f, 1f)
            shardPaint.alpha = (a * 217).toInt(); shardEdge.alpha = (a * 255).toInt(); shardEdge.strokeWidth = 1.2f * dp
            c.save(); c.rotate(s.spin * t, x, y)
            tailPath.reset()
            tailPath.moveTo(x, y - s.size); tailPath.lineTo(x + s.size * 0.7f, y + s.size * 0.4f); tailPath.lineTo(x - s.size * 0.5f, y + s.size * 0.6f); tailPath.close()
            c.drawPath(tailPath, shardPaint); c.drawPath(tailPath, shardEdge)
            c.restore()
        }
    }

    private fun drawZzz(c: Canvas, now: Long) {
        val head = painter.beakTip(pose)
        for (i in 0 until 3) {
            val t = ((now / 1800f) + i / 3f) % 1f
            val size = sp(12f + 10f * t)
            zPaint.textSize = size; zShadow.textSize = size
            val a = (if (t < 0.15f) t / 0.15f else 1f - (t - 0.15f) / 0.85f).coerceIn(0f, 1f)
            zPaint.alpha = (a * 255).toInt(); zShadow.alpha = (a * 160).toInt()
            val x = head.x + 14 * dp + t * 30 * dp
            val y = head.y - 24 * dp - t * 60 * dp
            c.drawText("z", x + 1.5f * dp, y + 1.5f * dp, zShadow)
            c.drawText("z", x, y, zPaint)
        }
    }

    private fun drawHoldRing(c: Canvas) {
        val b = painter.bounds(pose, tmp)
        val r = max(b.width(), b.height()) * 0.62f
        val cx = b.centerX(); val cy = b.centerY()
        c.drawCircle(cx, cy, r, ringTrack)
        c.drawArc(cx - r, cy - r, cx + r, cy + r, -90f, 360f * hold.coerceIn(0f, 1f), false, ringPaint)
    }

    private fun drawBlanket(c: Canvas) {
        val top = h * (1f - blanket)
        val path = Path().apply {
            moveTo(0f, top + 10 * dp)
            var x = 0f
            val step = w / 6
            while (x < w) {
                quadTo(x + step / 2, top - 6 * dp, x + step, top + 10 * dp)
                x += step
            }
            lineTo(w, h); lineTo(0f, h); close()
        }
        c.save()
        c.clipPath(path)
        val sq = 46 * dp
        var row = 0
        var y = top - 10 * dp
        while (y < h) {
            var col = 0
            var x = 0f
            while (x < w) {
                quiltPaint.color = quilt[(row + col) % quilt.size]
                quiltPaint.alpha = 236
                c.drawRect(x, y, x + sq, y + sq, quiltPaint)
                c.drawRect(x + 4 * dp, y + 4 * dp, x + sq - 4 * dp, y + sq - 4 * dp, stitch)
                x += sq; col++
            }
            y += sq; row++
        }
        c.restore()
    }

    private fun drawEaten(c: Canvas) {
        val edge = eaten * (w + 60 * dp)
        c.drawRect(0f, 0f, max(0f, edge - 30 * dp), h, eatPaint)
        if (eaten < 0.999f) {
            var y = 0f
            val r = 38 * dp
            while (y < h + r) {
                c.drawCircle(edge - 30 * dp, y, r, eatPaint)
                y += r * 1.5f
            }
        }
    }

    private fun drawFootprint(c: Canvas, f: Footprint) {
        c.save()
        c.rotate(f.rot, f.x, f.y)
        val s = 1.4f * dp
        c.drawLine(f.x, f.y, f.x, f.y - 22 * s, mud)
        c.drawLine(f.x, f.y, f.x - 14 * s, f.y - 16 * s, mud)
        c.drawLine(f.x, f.y, f.x + 14 * s, f.y - 16 * s, mud)
        c.drawLine(f.x, f.y, f.x, f.y + 12 * s, mud)
        c.restore()
    }

    private fun drawSplat(c: Canvas, s: Splat, alpha: Float) {
        val now = now()
        val age = now - s.droppedAt
        val pop = when {
            age < 110 -> 0.25f + 0.95f * (age / 110f)
            age < 260 -> 1.2f - 0.2f * ((age - 110) / 150f)
            else -> 1f
        }
        val slide = if (s.fadeStart >= 0) ((now - s.fadeStart) / 350f).coerceIn(0f, 1f) else 0f
        val ooze = min(1f, age / 2600f)
        c.save()
        c.translate(s.wipeDx * slide, s.wipeDy * slide)
        c.scale(pop, pop, s.cx, s.cy)
        splatShade.alpha = (alpha * 255).toInt()
        splatPaint.alpha = (alpha * 248).toInt()
        splatEdge.alpha = (alpha * 150).toInt(); splatEdge.strokeWidth = 3f * dp
        splatCore.alpha = (alpha * 235).toInt(); splatSpeck.alpha = (alpha * 230).toInt()
        splatGloss.alpha = (alpha * 230).toInt(); splatGloss.strokeWidth = 3f * dp
        for (d in s.drips) {
            val len = d[1] * (0.45f + 0.55f * ooze)
            c.drawRoundRect(s.cx + d[0] - d[2] / 2 - 1.5f * dp, s.cy, s.cx + d[0] + d[2] / 2 + 1.5f * dp, s.cy + len + 12 * dp, d[2], d[2], splatEdge)
            c.drawRoundRect(s.cx + d[0] - d[2] / 2, s.cy, s.cx + d[0] + d[2] / 2, s.cy + len + 10 * dp, d[2] / 2, d[2] / 2, splatShade)
            c.drawCircle(s.cx + d[0], s.cy + len + 10 * dp, d[2] * 0.62f, splatShade)
        }
        for (b in s.blobs) c.drawCircle(s.cx + b[0] + 3 * dp, s.cy + b[1] + 4 * dp, b[2], splatShade)
        for (b in s.blobs) c.drawCircle(s.cx + b[0], s.cy + b[1], b[2], splatEdge)
        for (b in s.spray) { c.drawCircle(s.cx + b[0], s.cy + b[1], b[2], splatEdge) }
        for (b in s.blobs) c.drawCircle(s.cx + b[0], s.cy + b[1], b[2], splatPaint)
        for (b in s.spray) c.drawCircle(s.cx + b[0], s.cy + b[1], b[2], splatPaint)
        for (d in s.drips) {
            val len = d[1] * (0.45f + 0.55f * ooze)
            c.drawRoundRect(s.cx + d[0] - d[2] / 2 + 2 * dp, s.cy, s.cx + d[0] + d[2] / 2 - 2 * dp, s.cy + len + 8 * dp, d[2] / 2, d[2] / 2, splatPaint)
        }
        for (k in s.core) c.drawCircle(s.cx + k[0], s.cy + k[1], k[2], splatCore)
        for ((i, k) in s.core.withIndex()) if (i % 2 == 0) c.drawCircle(s.cx + k[0] + k[2] * 0.3f, s.cy + k[1] - k[2] * 0.2f, k[2] * 0.35f, splatSpeck)
        val main = s.blobs.first()
        c.drawArc(s.cx + main[0] - main[2] * 0.7f, s.cy + main[1] - main[2] * 0.7f, s.cx + main[0] + main[2] * 0.7f, s.cy + main[1] + main[2] * 0.7f, 200f, 50f, false, splatGloss)
        c.restore()
    }

    private companion object {
        const val SPLAT_MAX_MS = 10_000L
    }
}
