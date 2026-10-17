package app.kaak.tasks

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.widget.Toast
import app.kaak.core.AppTimeGoal
import app.kaak.core.Bribe
import app.kaak.core.BribeCatalog
import app.kaak.core.Check
import app.kaak.core.ChoreGoal
import app.kaak.core.ClaimResult
import app.kaak.core.TypingGoal
import app.kaak.core.Lines
import app.kaak.core.MINUTE_MS
import app.kaak.core.PhoneDownTimer
import app.kaak.core.StepGoal
import app.kaak.core.dayKeyOf
import app.kaak.data.DayStore
import app.kaak.data.KaakPrefs
import app.kaak.data.SessionLog
import app.kaak.data.Wallet
import java.time.LocalDate
import java.util.Locale

/**
 * Runs the one bribe you're currently doing and checks it for real:
 * screen-off timers, the step counter, time in a chosen app or on a call.
 * In-app bribes (notes, breathing, stretching, drawing, honor) are claimed
 * directly by their screen. Lives as long as the app process (kept alive by
 * the accessibility service).
 */
@SuppressLint("StaticFieldLeak") // holds the application context only
object TaskCenter {
    data class Active(val bribe: Bribe, val packages: Set<String>, val startedAt: Long)

    private lateinit var app: Context
    private lateinit var wallet: Wallet
    private lateinit var log: SessionLog
    private var initialised = false

    var active: Active? = null
        private set
    private var phoneDown: PhoneDownTimer? = null
    private var steps: StepGoal? = null
    private var appTime: AppTimeGoal? = null
    private var chore: ChoreGoal? = null
    private var typing: TypingGoal? = null
    private var peekedAfterMs: Long? = null

    /** The last finished bribe and what it paid, for the task screen to show. */
    var lastResult: Pair<Bribe, ClaimResult>? = null
        private set

    private val listeners = mutableSetOf<() -> Unit>()
    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }
    private fun changed() = listeners.toList().forEach { it() }

    fun init(context: Context) {
        if (initialised) return
        initialised = true
        app = context.applicationContext
        wallet = Wallet(app)
        log = SessionLog(app)
        app.registerReceiver(screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        })
    }

    fun today() = dayKeyOf(LocalDate.now())

    fun hasStepCounter(context: Context): Boolean =
        context.getSystemService(SensorManager::class.java)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null

    /** Starts a checked bribe. Returns false if this phone can't check it. */
    fun start(bribe: Bribe, packages: Set<String> = emptySet()): Boolean {
        cancel()
        val now = SystemClock.elapsedRealtime()
        when (bribe.check) {
            Check.PHONE_DOWN -> phoneDown = PhoneDownTimer(bribe.amount * MINUTE_MS)
            Check.STEPS -> {
                val sm = app.getSystemService(SensorManager::class.java) ?: return false
                val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return false
                steps = StepGoal(bribe.amount)
                sm.registerListener(stepListener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
            }
            Check.APP_TIME, Check.CALL -> {
                if (packages.isEmpty()) return false
                appTime = AppTimeGoal(packages, bribe.amount * MINUTE_MS)
            }
            Check.MOVING -> {
                val sm = app.getSystemService(SensorManager::class.java) ?: return false
                val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return false
                chore = ChoreGoal(now, bribe.amount * MINUTE_MS, bribe.amount * 25)
                sm.registerListener(stepListener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
            }
            Check.STAIRS -> { // only used on phones without a barometer: count steps instead
                val sm = app.getSystemService(SensorManager::class.java) ?: return false
                val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return false
                steps = StepGoal(bribe.amount * 20)
                sm.registerListener(stepListener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
            }
            Check.TYPING -> {
                if (packages.isEmpty()) return false
                typing = TypingGoal(packages, bribe.amount, MINUTE_MS)
            }
            else -> return false
        }
        active = Active(bribe, packages, now)
        peekedAfterMs = null
        log.event("bribe_start", bribe.id)
        changed()
        return true
    }

    fun cancel() {
        if (steps != null || chore != null) app.getSystemService(SensorManager::class.java)?.unregisterListener(stepListener)
        active = null
        phoneDown = null
        steps = null
        appTime = null
        chore = null
        typing = null
        changed()
    }

    /** Called by the service whenever the foreground app changes. */
    fun onForeground(pkg: String?) {
        val now = SystemClock.elapsedRealtime()
        appTime?.onForeground(pkg, now)
        typing?.appTime?.onForeground(pkg, now)
        check()
    }

    /** Called by the service when text changes in any app. Only the count is used, never the text. */
    fun onTyping(pkg: String) {
        val t = typing ?: return
        t.onTyping(pkg)
        check()
    }

    /** Called by the service every few seconds. */
    fun check() {
        val now = SystemClock.elapsedRealtime()
        val done = appTime?.done(now) == true || typing?.done(now) == true || chore?.done(now) == true
        if (done) complete() else if (appTime != null || typing != null || chore != null) changed()
    }

    /** For bribes verified by Kaak's own screens (and honor bribes). */
    fun claimInApp(bribe: Bribe, honor: Boolean = false): ClaimResult = claim(bribe, honor)

    fun claim(bribe: Bribe, honor: Boolean = false): ClaimResult {
        val r = wallet.claim(bribe, today(), honor)
        if (r is ClaimResult.Granted) DayStore(app).update(today()) {
            it.copy(bribes = it.bribes + 1, steps = it.steps + if (bribe.check == Check.STEPS) bribe.amount else 0)
        }
        lastResult = bribe to r
        log.event("bribe_claim", "${bribe.id}:${if (r is ClaimResult.Granted) r.minutes else "refused"}")
        changed()
        return r
    }

    fun progressText(): String {
        val a = active ?: return ""
        val now = SystemClock.elapsedRealtime()
        return when (a.bribe.check) {
            Check.PHONE_DOWN -> peekedAfterMs?.let {
                "You peeked after ${fmtMin(it)}. Lock the phone and leave it for ${a.bribe.amount} minutes straight."
            } ?: "Lock the phone and leave it. ${a.bribe.amount} minutes, screen off the whole time."
            Check.STEPS -> {
                val s = steps
                if (s == null) "" else String.format(Locale.US, "%,d of %,d steps", s.progress.coerceAtLeast(0), a.bribe.amount)
            }
            Check.APP_TIME, Check.CALL -> {
                val g = appTime
                if (g == null) "" else "${fmtMin(g.progressMs(now))} of ${a.bribe.amount} min"
            }
            Check.MOVING -> chore?.let {
                "${fmtMin(it.elapsedMs(now))} of ${a.bribe.amount} min · ${it.steps.progress.coerceAtLeast(0)} of ${it.steps.target} steps"
            } ?: ""
            Check.STAIRS -> steps?.let { String.format(Locale.US, "%,d of %,d steps (no barometer on this phone)", it.progress.coerceAtLeast(0), it.target) } ?: ""
            Check.TYPING -> typing?.let {
                val typed = if (it.edits >= it.minEdits) "typed ✓" else "typing ${it.edits}/${it.minEdits}"
                "$typed · ${fmtMin(it.appTime.progressMs(now))} of 1 min in the app"
            } ?: ""
            else -> ""
        }
    }

    fun describe(result: ClaimResult, lines: Lines): String = when (result) {
        is ClaimResult.Refused -> result.reason
        is ClaimResult.Granted -> buildString {
            append(lines.bribeAccepted()).append(' ')
            append(
                when {
                    result.minutes > 0 && result.capped -> "+${result.minutes} min (that's today's 30-minute bribe cap)"
                    result.minutes > 0 -> "+${result.minutes} min today"
                    result.quietHour -> "A quiet hour: no gags for 60 minutes"
                    else -> "No more bribe minutes today, but it still counts"
                }
            )
            result.loot?.let { append(" · $it for the nest") }
            if (result.trust > 0) append(" · trust +${result.trust}")
        }
    }

    private fun complete() {
        val b = active?.bribe ?: return
        cancel()
        val r = claim(b)
        val lines = Lines().apply { lang = KaakPrefs(app).lang }
        Toast.makeText(app, "Kaak: " + describe(r, lines), Toast.LENGTH_LONG).show()
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val now = SystemClock.elapsedRealtime()
            val t = phoneDown ?: return
            when (intent.action) {
                Intent.ACTION_SCREEN_OFF -> t.onScreenOff(now)
                Intent.ACTION_SCREEN_ON -> if (t.onScreenOn(now)) complete() else {
                    peekedAfterMs = t.bestMs.takeIf { it > 0 }
                    changed()
                }
            }
        }
    }

    private val stepListener = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            val total = e.values[0].toInt()
            steps?.let { if (it.onTotal(total)) { complete(); return } }
            chore?.let { it.steps.onTotal(total); if (it.done(SystemClock.elapsedRealtime())) { complete(); return } }
            changed()
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    private fun fmtMin(ms: Long) = String.format(Locale.US, "%.1f min", ms / 60_000.0)

    /** Every bribe a person can pick (bedtime is automatic). */
    val selectable: List<Bribe> get() = BribeCatalog.ALL.filter { it.selectable }
}
