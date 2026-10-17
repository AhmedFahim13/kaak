package app.kaak.overlay

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
import android.view.WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
import android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
import android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
import app.kaak.core.Action
import app.kaak.core.Gag
import app.kaak.core.JumpscareLevel
import app.kaak.core.Lines

/**
 * Everything Kaak puts on top of other apps, all as *accessibility overlays*
 * (no "display over other apps" permission needed):
 *  - stage: full-screen, untouchable layer Kaak performs on
 *  - hitbox: a small touchable square that follows Kaak during a chase
 *  - card: a bottom sheet (worth-it question, detours, "too much?")
 *  - asleep: the full-screen cover shown while Kaak is full
 */
class KaakOverlay(
    private val service: AccessibilityService,
    private val feedback: Feedback,
    private val lines: Lines,
) {
    private val wm = service.getSystemService(WindowManager::class.java)
    private val handler = Handler(Looper.getMainLooper())

    private var stage: KaakView? = null
    private var hitbox: View? = null
    private var card: View? = null
    private var asleep: View? = null
    private val dismissCard = Runnable { dismissCard() }

    private fun overlayParams(w: Int, h: Int, touchable: Boolean, extraFlags: Int = 0) = WindowManager.LayoutParams(
        w, h,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        FLAG_NOT_FOCUSABLE or FLAG_LAYOUT_IN_SCREEN or extraFlags or (if (touchable) 0 else FLAG_NOT_TOUCHABLE),
        PixelFormat.TRANSLUCENT,
    ).apply {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }

    private val stageParams = overlayParams(
        WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, false, FLAG_LAYOUT_NO_LIMITS,
    ).apply { gravity = Gravity.TOP or Gravity.START; title = "Kaak" }

    private val hitboxParams = overlayParams(1, 1, true, FLAG_LAYOUT_NO_LIMITS).apply {
        gravity = Gravity.TOP or Gravity.START; title = "Kaak hitbox"
    }

    // ---------------- stage ----------------

    private fun stage(): KaakView = stage ?: KaakView(service, feedback, lines).also { v ->
        v.onTouchableChanged = ::setStageTouchable
        v.onHitbox = ::moveHitbox
        stageParams.flags = stageParams.flags or FLAG_NOT_TOUCHABLE
        wm.addView(v, stageParams)
        stage = v
    }

    /** Feed-time performances. Bedtime swaps arrival and heckles for sleepy versions. */
    fun perform(action: Action, bedtime: Boolean, jumpscare: JumpscareLevel, work: Boolean = false, calm: Boolean = false) {
        fun st() = stage().also { it.glasses = work; it.calm = calm }
        when (action) {
            Action.Arrive -> when {
                bedtime -> st().bedArrive()
                work -> st().again(lines.working())
                calm -> st().again(lines.calm())
                else -> st().arrive()
            }
            Action.Return -> st().again(if (work) lines.working() else lines.again())
            is Action.Heckle -> when {
                bedtime -> st().blanket()
                action.gag == Gag.WALK_ACROSS -> st().walkAcross()
                action.gag == Gag.SIT_ON_RAIL -> st().sitOnRail(lines.sit(action.minutes))
                else -> st().splat()
            }
            is Action.Warn -> st().warn(action.minutesLeft)
            is Action.Nudge -> st().nudge(lines.nudge(action.minutes), bedtime)
            Action.Resume -> st().resumePerch()
            Action.Jumpscare -> st().jumpscare(jumpscare)
            Action.Hide -> leaveFeed()
            Action.Wake -> hideAsleep()
            else -> Unit // Steal, Eat and Asleep need callbacks: see their own methods
        }
    }

    fun steal(icon: Bitmap?, label: String, onGrabbed: () -> Unit, onWon: () -> Unit, onLost: () -> Unit) =
        stage().steal(icon, label, onGrabbed, onWon, onLost)

    fun eat(onDone: () -> Unit) = stage().eat(onDone)

    fun morningGift() = stage().morningGift { if (stage?.isBusyOffFeed() == false) removeStage() }

    fun timesDelivery() = stage().timesDelivery { if (stage?.isBusyOffFeed() == false) removeStage() }

    fun snatch(icon: Bitmap?, label: String, line: String, onGrabbed: () -> Unit) =
        stage().snatch(icon, label, line, onGrabbed)

    fun say(line: String) = stage().say(line, 2600)

    /** Right after an escape: Kaak lands and makes sure you know he noticed. */
    fun judge(line: String) = stage().again(line)

    fun tired() = stage().blanket()

    /** Left the feed: Kaak goes too, unless he is mid-chase or delivering a gift. */
    fun leaveFeed() {
        if (stage?.isBusyOffFeed() == true) return
        removeStage()
    }

    fun chasing() = stage?.isChasing() == true

    private var busySince = 0L

    /**
     * Watchdog, every tick while no feed is open: Kaak may only be on screen
     * off-feed while he's busy (a chase, a gift, the paper), and never for long.
     */
    fun sanity(now: Long) {
        val s = stage ?: run { busySince = 0L; return }
        if (!s.isBusyOffFeed()) { removeStage(); busySince = 0L; return }
        if (busySince == 0L) busySince = now
        if (now - busySince > 45_000) { removeStage(); busySince = 0L }
    }

    fun hideAll() {
        removeStage()
        dismissCard()
        hideAsleep()
    }

    private fun removeStage() {
        stage?.let { v -> v.clearAll(); runCatching { wm.removeView(v) } }
        stage = null
        moveHitbox(null)
    }

    private fun setStageTouchable(touchable: Boolean) {
        val v = stage ?: return
        stageParams.flags = if (touchable) stageParams.flags and FLAG_NOT_TOUCHABLE.inv() else stageParams.flags or FLAG_NOT_TOUCHABLE
        runCatching { wm.updateViewLayout(v, stageParams) }
    }

    // ---------------- chase hitbox ----------------

    @SuppressLint("ClickableViewAccessibility")
    private fun moveHitbox(rect: RectF?) {
        if (rect == null) {
            hitbox?.let { runCatching { wm.removeView(it) } }
            hitbox = null
            return
        }
        hitboxParams.x = rect.left.toInt()
        hitboxParams.y = rect.top.toInt()
        hitboxParams.width = rect.width().toInt()
        hitboxParams.height = rect.height().toInt()
        val existing = hitbox
        if (existing != null) {
            runCatching { wm.updateViewLayout(existing, hitboxParams) }
        } else {
            val v = View(service).apply {
                setOnTouchListener { _, e ->
                    if (e.actionMasked == MotionEvent.ACTION_DOWN) stage?.hitKaak()
                    true
                }
            }
            runCatching { wm.addView(v, hitboxParams) }
            hitbox = v
        }
    }

    // ---------------- bottom card ----------------

    fun showCard(view: View, autoDismissMs: Long? = null) {
        dismissCard()
        val p = overlayParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT, true).apply {
            gravity = Gravity.BOTTOM; title = "Kaak card"
        }
        runCatching { wm.addView(view, p) }.onSuccess {
            card = view
            autoDismissMs?.let { handler.postDelayed(dismissCard, it) }
        }
    }

    fun dismissCard() {
        handler.removeCallbacks(dismissCard)
        card?.let { runCatching { wm.removeView(it) } }
        card = null
    }

    fun hasCard() = card != null

    fun busyOffFeed() = stage?.isBusyOffFeed() == true

    // ---------------- asleep cover ----------------

    fun showAsleep(view: View) {
        hideAsleep()
        val p = overlayParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, true, FLAG_LAYOUT_NO_LIMITS).apply {
            gravity = Gravity.TOP or Gravity.START; title = "Kaak asleep"
        }
        runCatching { wm.addView(view, p) }.onSuccess { asleep = view }
    }

    fun hideAsleep() {
        asleep?.let { runCatching { wm.removeView(it) } }
        asleep = null
    }
}
