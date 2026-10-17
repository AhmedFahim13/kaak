package app.kaak.ui

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.max

/**
 * Kaak's design system. A clean white canvas; Kaak and his gamcha red do the
 * talking. Buttons and cards are chunky and 3D: a same-colour "lip" underneath
 * that the face presses down into. Colour lives in icons, numbers and the one
 * main action per screen. Font: Nunito (SIL OFL), bundled.
 */
object Kit {
    const val WHITE = 0xFFFFFFFF.toInt()
    const val INK = 0xFF2B2A33.toInt()
    const val BODY = 0xFF4B4A55.toInt()
    const val MUTED = 0xFF9A98A3.toInt()
    const val LINE = 0xFFE7E5E0.toInt()
    const val LIP = 0xFFD9D6CF.toInt()

    const val RED = 0xFFEF4B3F.toInt()
    const val RED_LIP = 0xFFC7372D.toInt()
    const val RED_TINT = 0xFFFFF0EE.toInt()
    const val RED_BORDER = 0xFFFFB4AC.toInt()
    const val GOLD = 0xFFFFB627.toInt()
    const val GOLD_LIP = 0xFFE09A0C.toInt()
    const val GOLD_TINT = 0xFFFFF4D6.toInt()
    const val LEAF = 0xFF3BC16F.toInt()
    const val LEAF_LIP = 0xFF2C9B57.toInt()
    const val LEAF_TINT = 0xFFE8F8EE.toInt()
    const val SKY = 0xFF26A9F0.toInt()
    const val SKY_LIP = 0xFF1A87C4.toInt()
    const val PLUM = 0xFFA66BF0.toInt()
    const val PLUM_LIP = 0xFF8550CF.toInt()
    const val NIGHT = 0xFF1D1A33.toInt()

    // older names, kept so overlay code reads naturally
    const val PAPER = WHITE
    const val MARIGOLD = GOLD
    const val MARIGOLD_DEEP = GOLD_LIP
    const val INK_SOFT = MUTED

    private val faces = HashMap<Int, Typeface>()

    /** Nunito at any weight (variable font). Bangla falls back to the system font. */
    fun font(c: Context, weight: Int): Typeface = faces.getOrPut(weight) {
        runCatching {
            Typeface.Builder(c.assets, "fonts/Nunito.ttf").setFontVariationSettings("'wght' $weight").build()
        }.getOrNull() ?: if (weight >= 700) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

    fun display(c: Context) = font(c, 900)
    fun body(c: Context, weight: Int = 600) = font(c, weight)

    fun lipFor(fill: Int): Int = when (fill) {
        RED -> RED_LIP; GOLD -> GOLD_LIP; LEAF -> LEAF_LIP; SKY -> SKY_LIP; PLUM -> PLUM_LIP
        WHITE, RED_TINT, GOLD_TINT, LEAF_TINT -> LINE
        else -> darken(fill)
    }

    fun darken(c: Int, f: Float = 0.8f): Int =
        (0xFF shl 24) or (((c shr 16 and 0xFF) * f).toInt() shl 16) or (((c shr 8 and 0xFF) * f).toInt() shl 8) or ((c and 0xFF) * f).toInt()
}

/** The chunky 3D button. The face presses down into its lip, with a tick of haptics. */
@SuppressLint("ViewConstructor")
open class Chunky(
    context: Context,
    fill: Int = Kit.WHITE,
    textColor: Int = Kit.INK,
    private val radiusDp: Float = 16f,
    caps: Boolean = false,
) : TextView(context) {
    protected val dp = resources.displayMetrics.density
    private val lipPx = 4.5f * dp
    private val borderPx = 2f * dp
    var fill: Int = fill
        set(v) { field = v; invalidate() }
    var lipColor: Int? = null
        set(v) { field = v; invalidate() }
    var borderColor: Int? = null
        set(v) { field = v; invalidate() }

    init {
        setTextColor(textColor)
        typeface = Kit.font(context, if (caps) 900 else 800)
        textSize = 16f
        isAllCaps = caps
        if (caps) letterSpacing = 0.06f
        gravity = Gravity.CENTER
        setPadding((18 * dp).toInt(), (13 * dp).toInt(), (18 * dp).toInt(), (13 * dp + lipPx).toInt())
        isClickable = true
        isFocusable = true
        background = null
    }

    fun onTap(action: () -> Unit) = apply {
        setOnClickListener { performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY); action() }
    }

    override fun setEnabled(enabled: Boolean) { super.setEnabled(enabled); alpha = if (enabled) 1f else 0.4f }

    override fun drawableStateChanged() { super.drawableStateChanged(); invalidate() }

    override fun onDraw(c: Canvas) {
        val pressed = isPressed && isEnabled
        val white = fill == Kit.WHITE || fill == Kit.RED_TINT || fill == Kit.LEAF_TINT || fill == Kit.GOLD_TINT
        val border = borderColor ?: if (white) Kit.LINE else null
        val lip = lipColor ?: if (border != null) border else Kit.lipFor(fill)
        drawChunk(c, width.toFloat(), height.toFloat(), fill, lip, border, radiusDp * dp, pressed)
        c.save()
        if (pressed) c.translate(0f, lipPx)
        super.onDraw(c)
        c.restore()
    }

    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private fun drawChunk(c: Canvas, w: Float, h: Float, face: Int, lip: Int, border: Int?, r: Float, pressed: Boolean) {
        val l = lipPx
        val top = if (pressed) l else 0f
        p.style = Paint.Style.FILL
        p.color = lip
        c.drawRoundRect(0f, top, w, h, r, r, p)
        if (border != null) {
            p.color = border
            c.drawRoundRect(0f, top, w, h - (if (pressed) 0f else l) + (if (pressed) 0f else 0f), r, r, p)
            p.color = face
            val b = borderPx
            c.drawRoundRect(b, top + b, w - b, h - (if (pressed) 0f else l) - b, r - b, r - b, p)
        } else {
            p.color = face
            c.drawRoundRect(0f, top, w, h - l + top, r, r, p)
        }
    }
}

/** A selectable option. Selected = red tint, red border, red text. */
class Pill(context: Context, label: String, selected: Boolean) : Chunky(context, Kit.WHITE, Kit.BODY, 14f) {
    var selectedPill = false
        set(v) {
            field = v
            isSelected = v
            fill = if (v) Kit.RED_TINT else Kit.WHITE
            borderColor = if (v) Kit.RED_BORDER else Kit.LINE
            lipColor = if (v) Kit.RED_BORDER else Kit.LINE
            setTextColor(if (v) Kit.RED else Kit.BODY)
        }

    init {
        text = label
        textSize = 15f
        setPadding((16 * dp).toInt(), (10 * dp).toInt(), (16 * dp).toInt(), (10 * dp + 4.5f * dp).toInt())
        selectedPill = selected
    }
}

/** A white card: soft grey border, thicker grey lip at the bottom. */
class CardBox(context: Context, private val fill: Int = Kit.WHITE, private val radiusDp: Float = 18f) : LinearLayout(context) {
    private val dp = resources.displayMetrics.density
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val lip = 5f * dp
    private val b = 2f * dp
    var edge: Int = if (fill == Kit.WHITE) Kit.LINE else Kit.lipFor(fill)

    init {
        orientation = VERTICAL
        setWillNotDraw(false)
        val pad = (16 * dp).toInt()
        setPadding(pad, pad, pad, (pad + lip).toInt())
    }

    override fun onDraw(c: Canvas) {
        val w = width.toFloat(); val h = height.toFloat(); val r = radiusDp * dp
        p.color = edge
        c.drawRoundRect(0f, 0f, w, h, r, r, p)
        p.color = fill
        c.drawRoundRect(b, b, w - b, h - lip, r - b, r - b, p)
    }
}

/** Lays children left to right and wraps. */
class FlowLayout(context: Context) : ViewGroup(context) {
    private val gap = (10 * resources.displayMetrics.density).toInt()

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val maxW = MeasureSpec.getSize(widthSpec) - paddingLeft - paddingRight
        var x = 0; var y = 0; var rowH = 0
        for (i in 0 until childCount) {
            val ch = getChildAt(i)
            ch.measure(MeasureSpec.makeMeasureSpec(maxW, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
            if (x > 0 && x + ch.measuredWidth > maxW) { x = 0; y += rowH + gap; rowH = 0 }
            x += ch.measuredWidth + gap
            rowH = max(rowH, ch.measuredHeight)
        }
        setMeasuredDimension(MeasureSpec.getSize(widthSpec), y + rowH + paddingTop + paddingBottom)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val maxW = r - l - paddingLeft - paddingRight
        var x = 0; var y = 0; var rowH = 0
        for (i in 0 until childCount) {
            val ch = getChildAt(i)
            if (x > 0 && x + ch.measuredWidth > maxW) { x = 0; y += rowH + gap; rowH = 0 }
            ch.layout(paddingLeft + x, paddingTop + y, paddingLeft + x + ch.measuredWidth, paddingTop + y + ch.measuredHeight)
            x += ch.measuredWidth + gap
            rowH = max(rowH, ch.measuredHeight)
        }
    }
}

/** A chunky switch: green when on, with a soft inner lip. */
class Toggle(context: Context, on: Boolean, private val onChange: (Boolean) -> Unit) : View(context) {
    private val dp = resources.displayMetrics.density
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private var knob = if (on) 1f else 0f
    var isOn = on
        private set

    init {
        isClickable = true
        setOnClickListener { set(!isOn, fromUser = true) }
    }

    fun set(on: Boolean, fromUser: Boolean = false) {
        if (on == isOn) return
        isOn = on
        ValueAnimator.ofFloat(knob, if (on) 1f else 0f).apply {
            duration = 170
            addUpdateListener { knob = it.animatedValue as Float; invalidate() }
        }.start()
        if (fromUser) { performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY); onChange(on) }
    }

    override fun onMeasure(w: Int, h: Int) = setMeasuredDimension((54 * dp).toInt(), (32 * dp).toInt())

    override fun onInitializeAccessibilityNodeInfo(info: android.view.accessibility.AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Switch"
        info.isCheckable = true
        info.isChecked = isOn
    }

    override fun onDraw(c: Canvas) {
        val w = width.toFloat(); val h = height.toFloat(); val r = h / 2
        p.color = if (knob > 0.5f) Kit.LEAF_LIP else Kit.LIP
        c.drawRoundRect(0f, 0f, w, h, r, r, p)
        p.color = if (knob > 0.5f) Kit.LEAF else Kit.LINE
        c.drawRoundRect(0f, 0f, w, h - 3 * dp, r, r, p)
        val kr = h / 2 - 5 * dp
        val kx = 5 * dp + kr + knob * (w - 2 * (5 * dp + kr))
        p.color = Kit.WHITE
        c.drawCircle(kx, h / 2 - 1.5f * dp, kr, p)
    }
}

/** A label with a toggle on the right. */
class ToggleRow(context: Context, label: String, checked: Boolean, onChange: (Boolean) -> Unit) : LinearLayout(context) {
    private val label: TextView = context.text(label, 16f, bold = true)
    val toggle = Toggle(context, checked, onChange)
    var text: CharSequence
        get() = label.text
        set(v) { label.text = v }
    val isChecked get() = toggle.isOn

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        val d = resources.displayMetrics.density
        setPadding(0, (12 * d).toInt(), 0, (12 * d).toInt())
        addView(this.label, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = (12 * d).toInt() })
        addView(toggle)
        toggle.contentDescription = label
        setOnClickListener { toggle.performClick() }
    }
}

/** A thin divider for list cards. */
class Divider(context: Context) : View(context) {
    init { setBackgroundColor(Kit.LINE) }
    override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), (2 * resources.displayMetrics.density).toInt())
}

/** A thick rounded progress bar with a highlight stripe. */
class ChunkyBar(context: Context) : View(context) {
    private val dp = resources.displayMetrics.density
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    var color: Int? = null
    var value = 0f
        set(v) { field = v.coerceIn(0f, 1f); invalidate() }
    override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), (16 * dp).toInt())
    override fun onDraw(c: Canvas) {
        val w = width.toFloat(); val h = height.toFloat(); val r = h / 2
        p.color = Kit.LINE; c.drawRoundRect(0f, 0f, w, h, r, r, p)
        if (value > 0f) {
            val fw = max(h, w * value)
            p.color = color ?: when { value >= 1f -> Kit.RED; value >= 0.8f -> Kit.GOLD; else -> Kit.LEAF }
            c.drawRoundRect(0f, 0f, fw, h, r, r, p)
            p.color = 0x59FFFFFF
            if (fw > h * 1.5f) c.drawRoundRect(h * 0.5f, h * 0.25f, fw - h * 0.5f, h * 0.25f + 4 * dp, 2 * dp, 2 * dp, p)
        }
    }
}

/** Soft circle behind Kaak on the home screen. */
class Spotlight(context: Context, private val color: Int = Kit.GOLD_TINT) : View(context) {
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(c: Canvas) {
        p.color = color
        val r = height * 0.46f
        c.drawCircle(width - r * 0.92f, height * 0.5f, r, p)
    }
}

/** Chunky two-tone icons, drawn in code. */
class KaakIcon(context: Context, private val kind: Kind, private val sizeDp: Float = 34f) : View(context) {
    enum class Kind { CLOCK, COIN, HEART, REWIND, NEST, PAPER }

    private val dp = resources.displayMetrics.density
    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val s = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val path = Path()

    override fun onMeasure(w: Int, h: Int) = setMeasuredDimension((sizeDp * dp).toInt(), (sizeDp * dp).toInt())

    override fun onDraw(c: Canvas) {
        val k = width / 34f
        c.save(); c.scale(k, k)
        when (kind) {
            Kind.CLOCK -> {
                p.color = Kit.LEAF_LIP; c.drawCircle(17f, 18f, 14f, p)
                p.color = 0xFF5ED68A.toInt(); c.drawCircle(17f, 16f, 14f, p)
                p.color = Kit.WHITE; c.drawCircle(17f, 16f, 10f, p)
                s.color = Kit.LEAF_LIP; s.strokeWidth = 3f
                path.reset(); path.moveTo(17f, 9f); path.lineTo(17f, 16f); path.lineTo(22f, 19f); c.drawPath(path, s)
            }
            Kind.COIN -> {
                p.color = Kit.GOLD_LIP; c.drawCircle(17f, 18f, 14f, p)
                p.color = Kit.GOLD; c.drawCircle(17f, 16f, 14f, p)
                s.color = 0xFFFFE08A.toInt(); s.strokeWidth = 3f; c.drawCircle(17f, 16f, 9f, s)
                s.color = Kit.WHITE; c.drawArc(RectF(8f, 7f, 26f, 25f), 200f, 50f, false, s)
            }
            Kind.HEART -> {
                path.reset()
                path.moveTo(17f, 31f); path.cubicTo(6f, 23f, 2f, 16f, 5f, 10f); path.cubicTo(8f, 4f, 15f, 5f, 17f, 10f)
                path.cubicTo(19f, 5f, 26f, 4f, 29f, 10f); path.cubicTo(32f, 16f, 28f, 23f, 17f, 31f); path.close()
                c.save(); c.translate(0f, 2f); p.color = Kit.PLUM_LIP; c.drawPath(path, p); c.restore()
                p.color = Kit.PLUM; c.drawPath(path, p)
                s.color = Kit.WHITE; s.strokeWidth = 2.6f
                val hi = Path().apply { moveTo(8f, 11f); cubicTo(9f, 8f, 12f, 7f, 14f, 9f) }; c.drawPath(hi, s)
            }
            Kind.REWIND -> {
                p.color = Kit.SKY_LIP; c.drawCircle(17f, 18f, 14f, p)
                p.color = Kit.SKY; c.drawCircle(17f, 16f, 14f, p)
                s.color = Kit.WHITE; s.strokeWidth = 3.2f; c.drawArc(RectF(11f, 10f, 23f, 22f), 200f, 290f, false, s)
                path.reset(); path.moveTo(9f, 8f); path.lineTo(13.5f, 11f); path.lineTo(9f, 14f); path.close(); p.color = Kit.WHITE; c.drawPath(path, p)
            }
            Kind.NEST -> {
                p.color = 0xFF8A6239.toInt(); c.drawOval(1f, 17f, 33f, 33f, p)
                p.color = 0xFFB5844F.toInt(); c.drawOval(1f, 15f, 33f, 30f, p)
                p.color = 0xFFE8F2FF.toInt(); c.drawOval(8f, 6f, 17f, 19f, p)
                p.color = Kit.WHITE; c.drawOval(16f, 5f, 25f, 18f, p)
                s.color = 0xFF8A6239.toInt(); s.strokeWidth = 2.2f
                val rim = Path().apply { moveTo(3f, 21f); quadTo(17f, 28f, 31f, 21f) }; c.drawPath(rim, s)
            }
            Kind.PAPER -> {
                p.color = Kit.SKY_LIP; c.drawRoundRect(3f, 8f, 31f, 32f, 4f, 4f, p)
                p.color = Kit.WHITE; c.drawRoundRect(3f, 5f, 31f, 29f, 4f, 4f, p)
                s.color = Kit.SKY; s.strokeWidth = 2.6f; c.drawRoundRect(4.3f, 6.3f, 29.7f, 27.7f, 3f, 3f, s)
                p.color = Kit.SKY; c.drawRoundRect(8f, 10f, 26f, 14f, 2f, 2f, p)
                p.color = 0xFFB3E2FB.toInt(); c.drawRoundRect(8f, 17f, 16f, 24f, 2f, 2f, p)
                c.drawRoundRect(18f, 17f, 26f, 19.5f, 1.2f, 1.2f, p); c.drawRoundRect(18f, 21.5f, 26f, 24f, 1.2f, 1.2f, p)
            }
        }
        c.restore()
    }
}

/** A chunky slider: title on the left, live value in red on the right, a knob that ticks as it snaps. */
@SuppressLint("ViewConstructor", "ClickableViewAccessibility")
class KaakSlider(
    context: Context,
    title: String,
    private val min: Int,
    private val max: Int,
    private val step: Int,
    initial: Int,
    private val format: (Int) -> String,
    private val onChange: (Int) -> Unit,
) : LinearLayout(context) {
    private val dp = resources.displayMetrics.density
    private val valueText: TextView = context.text("", 18f, bold = true).apply { setTextColor(Kit.RED) }
    var value: Int = initial.coerceIn(min, max)
        private set
    private val track = object : View(context) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onMeasure(w: Int, h: Int) = setMeasuredDimension(MeasureSpec.getSize(w), (44 * dp).toInt())
        override fun onInitializeAccessibilityNodeInfo(info: android.view.accessibility.AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(info)
            info.className = "android.widget.SeekBar"
            info.contentDescription = "$title, ${format(value)}"
            info.rangeInfo = android.view.accessibility.AccessibilityNodeInfo.RangeInfo.obtain(
                android.view.accessibility.AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_INT, min.toFloat(), max.toFloat(), value.toFloat())
            info.addAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD)
            info.addAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD)
        }
        override fun performAccessibilityAction(action: Int, args: android.os.Bundle?): Boolean {
            val delta = when (action) {
                android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_FORWARD -> step
                android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD -> -step
                else -> return super.performAccessibilityAction(action, args)
            }
            val next = (value + delta).coerceIn(min, max)
            if (next != value) { value = next; valueText.text = format(value); invalidate(); onChange(value) }
            return true
        }
        override fun onDraw(c: Canvas) {
            val r = 14 * dp
            val left = r + 2 * dp; val right = width - r - 2 * dp; val cy = height / 2f
            val f = (value - min).toFloat() / (max - min)
            val kx = left + f * (right - left)
            p.color = Kit.LINE; c.drawRoundRect(left - 6 * dp, cy - 6 * dp, right + 6 * dp, cy + 6 * dp, 6 * dp, 6 * dp, p)
            p.color = Kit.RED; c.drawRoundRect(left - 6 * dp, cy - 6 * dp, kx, cy + 6 * dp, 6 * dp, 6 * dp, p)
            p.color = Kit.LINE; c.drawCircle(kx, cy + 2.5f * dp, r, p)
            p.color = Kit.WHITE; c.drawCircle(kx, cy, r - 2 * dp, p)
            p.style = Paint.Style.STROKE; p.strokeWidth = 2 * dp; p.color = Kit.LINE; c.drawCircle(kx, cy, r - 2 * dp, p)
            p.style = Paint.Style.FILL
        }
    }

    init {
        orientation = VERTICAL
        setPadding(0, (8 * dp).toInt(), 0, (4 * dp).toInt())
        addView(LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(context.text(title, 16f, bold = true), LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
            addView(valueText)
        })
        addView(track)
        valueText.text = format(value)
        track.setOnTouchListener { v, e ->
            v.parent?.requestDisallowInterceptTouchEvent(true)
            val r = 14 * dp
            val f = ((e.x - r) / (v.width - 2 * r)).coerceIn(0f, 1f)
            val raw = min + f * (max - min)
            val snapped = (Math.round((raw - min) / step) * step + min).coerceIn(min, max)
            if (snapped != value) {
                value = snapped
                valueText.text = format(value)
                v.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                v.invalidate()
                onChange(value)
            }
            true
        }
    }

    /** Moves the knob without calling back (used when a preset changes it). */
    fun set(v: Int) {
        value = v.coerceIn(min, max)
        valueText.text = format(value)
        track.invalidate()
    }
}

fun secondsLabel(s: Int): String = when {
    s < 60 -> "${s} s"
    s % 60 == 0 -> "${s / 60} min"
    else -> "${s / 60} min ${s % 60} s"
}
