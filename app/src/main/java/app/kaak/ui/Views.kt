package app.kaak.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Guided breathing: in 4 s, hold 4 s, out 6 s. Time only counts while the
 * phone is held still (accelerometer), so it can't be faked by walking away.
 */
class BreathView(context: Context, private val targetMs: Long, private val onDone: () -> Unit) : View(context), SensorEventListener {
    private val dp = resources.displayMetrics.density
    private val circle = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF2C14E.toInt() }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 3 * dp; color = 0x55F2C14E }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF19191D.toInt(); textAlign = Paint.Align.CENTER; textSize = 22 * dp; typeface = Typeface.DEFAULT_BOLD
    }
    private val sub = Paint(label).apply { color = Color.GRAY; textSize = 14 * dp; typeface = Typeface.DEFAULT }

    private var started = 0L
    private var accrued = 0L
    private var lastFrame = 0L
    private var still = true
    private var lastMoveAt = 0L
    private var finished = false

    fun begin() {
        started = SystemClock.uptimeMillis(); lastFrame = started; accrued = 0; finished = false
        keepScreenOn = true
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        context.getSystemService(SensorManager::class.java)?.let { sm ->
            sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        }
    }

    override fun onDetachedFromWindow() {
        context.getSystemService(SensorManager::class.java)?.unregisterListener(this)
        super.onDetachedFromWindow()
    }

    override fun onSensorChanged(e: SensorEvent) {
        val g = sqrt(e.values[0] * e.values[0] + e.values[1] * e.values[1] + e.values[2] * e.values[2])
        if (abs(g - SensorManager.GRAVITY_EARTH) > 1.6f) lastMoveAt = SystemClock.uptimeMillis()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    override fun onDraw(c: Canvas) {
        val now = SystemClock.uptimeMillis()
        val cx = width / 2f
        val cy = height / 2f
        val maxR = min(width, height) * 0.42f
        if (started == 0L) {
            c.drawCircle(cx, cy, maxR * 0.5f, circle)
            c.drawText("ready", cx, cy + 8 * dp, label)
            return
        }
        still = now - lastMoveAt > 800
        if (still && !finished) accrued += now - lastFrame
        lastFrame = now
        val cycle = ((now - started) % 14_000L).toFloat()
        val (phase, k) = when {
            cycle < 4_000 -> "in" to cycle / 4_000f
            cycle < 8_000 -> "hold" to 1f
            else -> "out" to 1f - (cycle - 8_000) / 6_000f
        }
        c.drawCircle(cx, cy, maxR, ring)
        c.drawCircle(cx, cy, maxR * (0.45f + 0.55f * k), circle)
        c.drawText(if (still) phase else "hold still", cx, cy + 8 * dp, label)
        val left = ((targetMs - accrued).coerceAtLeast(0) / 1000).toInt()
        c.drawText("%d:%02d left".format(left / 60, left % 60), cx, cy + maxR + 28 * dp, sub)
        if (!finished && accrued >= targetMs) {
            finished = true
            keepScreenOn = false
            onDone()
        }
        if (!finished) postInvalidateOnAnimation()
    }
}

/** A finger-drawing pad. Counts strokes so Kaak knows you actually drew him. */
class DrawPad(context: Context, private val onStroke: (Int) -> Unit) : View(context) {
    private val dp = resources.displayMetrics.density
    private val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF19191D.toInt(); style = Paint.Style.STROKE; strokeWidth = 5 * dp
        strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }
    private val bg = Paint().apply { color = 0xFFFFFDF6.toInt() }
    private val paths = mutableListOf<Path>()
    var strokes = 0
        private set

    fun clear() { paths.clear(); strokes = 0; onStroke(0); invalidate() }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        parent?.requestDisallowInterceptTouchEvent(true)
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> paths += Path().apply { moveTo(e.x, e.y) }
            MotionEvent.ACTION_MOVE -> paths.lastOrNull()?.lineTo(e.x, e.y)
            MotionEvent.ACTION_UP -> { strokes++; onStroke(strokes) }
        }
        invalidate()
        return true
    }

    override fun onDraw(c: Canvas) {
        c.drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), 16 * dp, 16 * dp, bg)
        paths.forEach { c.drawPath(it, ink) }
    }
}

/** Signature line for the contract. */
class SignaturePad(context: Context, private val onSigned: () -> Unit) : View(context) {
    private val dp = resources.displayMetrics.density
    private val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF1E3A8A.toInt(); style = Paint.Style.STROKE; strokeWidth = 3 * dp
        strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }
    private val line = Paint().apply { color = Color.GRAY; strokeWidth = 1 * dp }
    private val hint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.GRAY; textSize = 13 * dp }
    private val bg = Paint().apply { color = 0xFFFFFDF6.toInt() }
    private val path = Path()
    private var length = 0f
    private var lastX = 0f
    private var lastY = 0f
    var signed = false
        private set

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        parent?.requestDisallowInterceptTouchEvent(true)
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> path.moveTo(e.x, e.y)
            MotionEvent.ACTION_MOVE -> { path.lineTo(e.x, e.y); length += abs(e.x - lastX) + abs(e.y - lastY) }
            MotionEvent.ACTION_UP -> if (!signed && length > 120 * dp) { signed = true; onSigned() }
        }
        lastX = e.x; lastY = e.y
        invalidate()
        return true
    }

    override fun onDraw(c: Canvas) {
        c.drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), 12 * dp, 12 * dp, bg)
        val y = height * 0.75f
        c.drawLine(16 * dp, y, width - 16 * dp, y, line)
        if (length == 0f) c.drawText("Sign here with your finger", 16 * dp, y - 10 * dp, hint)
        c.drawPath(path, ink)
    }
}
