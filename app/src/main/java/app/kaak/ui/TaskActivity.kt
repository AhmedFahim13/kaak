package app.kaak.ui

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.provider.MediaStore
import android.widget.ImageView
import app.kaak.core.AscentMeter
import app.kaak.core.PhotoCheck
import app.kaak.core.PushupCounter
import app.kaak.core.SquatCounter
import kotlin.math.sqrt
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import app.kaak.core.Bribe
import app.kaak.core.BribeCatalog
import app.kaak.core.Check
import app.kaak.core.ClaimResult
import app.kaak.core.Detour
import app.kaak.core.DetourCatalog
import app.kaak.core.Lines
import app.kaak.core.Opener
import app.kaak.data.Apps
import app.kaak.data.KaakPrefs
import app.kaak.overlay.Feedback
import app.kaak.overlay.KaakView
import app.kaak.tasks.TaskCenter

/**
 * One bribe, start to finish. Kaak watches from the top of the screen and
 * reacts when it's done. Nothing typed or drawn here is saved.
 */
class TaskActivity : Activity() {

    companion object {
        private const val REQ_STEPS = 41
        private const val REQ_BEFORE = 61
        private const val REQ_AFTER = 62

        fun intent(context: Context, bribeId: String, detourId: String? = null): Intent =
            Intent(context, TaskActivity::class.java)
                .putExtra("bribe", bribeId)
                .putExtra("detour", detourId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private lateinit var bribe: Bribe
    private var detour: Detour? = null
    private lateinit var prefs: KaakPrefs
    private val lines = Lines()
    private lateinit var kaak: KaakView
    private lateinit var body: LinearLayout
    private lateinit var status: TextView
    private lateinit var result: TextView
    private val handler = Handler(Looper.getMainLooper())
    private var resultBefore: Any? = null
    private var shownResult: Any? = null
    private val onChange: () -> Unit = { runOnUiThread { refresh() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TaskCenter.init(this)
        prefs = KaakPrefs(this)
        lines.lang = prefs.lang
        bribe = BribeCatalog.byId(intent.getStringExtra("bribe")) ?: run { finish(); return }
        detour = DetourCatalog.byId(intent.getStringExtra("detour"))
        resultBefore = TaskCenter.lastResult

        val (scroll, root) = scrollPage()
        setContentView(scroll)
        root.addView(text("BRIBE KAAK", 13f, bold = true, quiet = true).apply { letterSpacing = 0.08f })
        root.addView(text(detour?.title ?: bribe.title, 28f, bold = true))
        root.addView(text(payLine(bribe), 14f, quiet = true))

        kaak = KaakView(this, Feedback(this, prefs), lines).apply { lightBubble = true }
        root.addView(FrameLayout(this).apply { addView(kaak) },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(170f)))
        kaak.strikePose(resources.displayMetrics.widthPixels * 0.45f, dp(150f).toFloat(), 1.2f)

        body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(body)
        status = text("", 16f, bold = true)
        result = text("", 18f, bold = true).apply { setTextColor(Kit.LEAF_LIP) }
        buildBody()
        body.addView(status)
        body.addView(result)
    }

    override fun onResume() {
        super.onResume()
        TaskCenter.listen(onChange)
        refresh()
    }

    override fun onPause() {
        TaskCenter.unlisten(onChange)
        if (bribe.check == Check.REPS) stopListening() // stairs keep counting while you climb with the screen on
        super.onPause()
    }

    override fun onDestroy() {
        stopListening()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun payLine(b: Bribe) = buildString {
        append("Pays: ")
        append(if (b.rewardMin > 0) "+${b.rewardMin} min" else if (b.quietHour) "a quiet hour" else "no extra time")
        b.loot?.let { append(" · $it") }
        if (b.trust > 0) append(" · trust +${b.trust}")
    }

    private fun refresh() {
        val r = TaskCenter.lastResult
        if (r != null && r !== resultBefore && r !== shownResult && r.first.id == bribe.id) {
            shownResult = r
            showResult(r.second)
            return
        }
        val a = TaskCenter.active
        status.text = if (a != null && a.bribe.id == bribe.id) TaskCenter.progressText() else ""
    }

    private fun showResult(r: ClaimResult) {
        result.text = TaskCenter.describe(r, lines)
        status.text = ""
        if (r is ClaimResult.Granted) kaak.say(lines.bribeAccepted(), 3000) else kaak.say("…", 2000)
    }

    private fun claim() {
        val r = TaskCenter.claimInApp(bribe)
        shownResult = TaskCenter.lastResult
        showResult(r)
    }

    // ---------------- bodies ----------------

    private fun buildBody() {
        when (bribe.check) {
            Check.HONOR -> honor()
            Check.PHONE_DOWN -> phoneDown()
            Check.STEPS -> steps()
            Check.APP_TIME -> appTime()
            Check.CALL -> call()
            Check.NOTE -> note()
            Check.BREATHING -> breathing()
            Check.STRETCH -> stretch()
            Check.CANVAS -> canvas()
            Check.BEDTIME -> body.addView(text("This one happens by itself: go to bed on time.", 15f))
            Check.PHOTO_PAIR -> photoPair()
            Check.REPS -> reps()
            Check.STAIRS -> stairs()
            Check.MOVING -> moving()
            Check.TYPING -> typingBody()
        }
    }

    // ---------------- honor fallback ----------------

    private fun honorFallback(why: String) {
        body.addView(text(why, 13f, quiet = true).apply { setPadding(0, dp(14f), 0, 0) })
        body.addView(button("Ask Kaak to trust you") {
            val r = TaskCenter.claimInApp(bribe, honor = true)
            shownResult = TaskCenter.lastResult
            showResult(r)
        })
    }

    // ---------------- photos: before and after, compared in memory ----------------

    private var beforeGray: IntArray? = null
    private var beforeAt = 0L
    private lateinit var beforeImg: ImageView
    private lateinit var afterImg: ImageView
    private lateinit var photoStatus: TextView
    private lateinit var afterButton: TextView

    private fun photoPair() {
        val (b, a) = when (bribe.id) {
            "water" -> "A full glass" to "The empty glass"
            "tidy" -> "The mess" to "All tidy"
            else -> "Not done yet" to "Done"
        }
        val wait = bribe.amount
        body.addView(text("Show Kaak a live photo before and after. Same place, something changed, " +
            "at least ${if (wait >= 60) "${wait / 60} min" else "$wait seconds"} apart. The photos are compared on this phone and never saved.", 15f))
        fun slot(label: String): Pair<CardBox, ImageView> {
            val img = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; setBackgroundColor(Kit.LINE) }
            val box = CardBox(this).apply {
                addView(img, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(130f)))
                addView(text(label, 14f, bold = true).apply { gravity = Gravity.CENTER; setPadding(0, dp(8f), 0, 0) }, MATCH_WRAP)
            }
            return box to img
        }
        val (bBox, bImg) = slot(b); beforeImg = bImg
        val (aBox, aImg) = slot(a); afterImg = aImg
        body.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(bBox, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(6f) })
            addView(aBox, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = dp(6f) })
            layoutParams = MATCH_WRAP.apply { topMargin = dp(12f) }
        })
        photoStatus = text("", 15f, bold = true)
        body.addView(photoStatus)
        body.addView(primaryButton("Take the before photo") { snap(REQ_BEFORE) })
        afterButton = button("Take the after photo") { snap(REQ_AFTER) }.apply { isEnabled = false }
        body.addView(afterButton)
        honorFallback("No camera, or the camera app won't send the photo back?")
    }

    @Suppress("DEPRECATION")
    private fun snap(req: Int) {
        runCatching { startActivityForResult(Intent(MediaStore.ACTION_IMAGE_CAPTURE), req) }
            .onFailure { photoStatus.text = "Couldn't open the camera." }
    }

    @Deprecated("Framework Activity result API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_BEFORE && requestCode != REQ_AFTER) return
        if (resultCode != RESULT_OK) return
        @Suppress("DEPRECATION")
        val bmp = data?.extras?.get("data") as? Bitmap
        if (bmp == null) { photoStatus.text = "Your camera app didn't send the photo back. Try again, or ask Kaak to trust you."; return }
        val gray = grayOf(bmp)
        if (requestCode == REQ_BEFORE) {
            beforeImg.setImageBitmap(bmp); afterImg.setImageDrawable(null)
            beforeGray = gray; beforeAt = SystemClock.elapsedRealtime()
            afterButton.isEnabled = true
            photoStatus.text = "Got it. Now do it, then take the after photo."
            kaak.say("noted.", 1800)
            return
        }
        val before = beforeGray ?: return
        afterImg.setImageBitmap(bmp)
        val verdict = PhotoCheck.compare(before, gray, SystemClock.elapsedRealtime() - beforeAt, bribe.amount * 1000L)
        when (verdict) {
            PhotoCheck.Verdict.OK -> { photoStatus.text = ""; kaak.say("hm. acceptable.", 2500); claim() }
            PhotoCheck.Verdict.TOO_FAST -> {
                val left = ((bribe.amount * 1000L - (SystemClock.elapsedRealtime() - beforeAt)) / 1000).coerceAtLeast(1)
                photoStatus.text = "Too fast. Kaak wants at least ${left}s more between the photos."; kaak.say("too fast.", 2000)
            }
            PhotoCheck.Verdict.SAME_PHOTO -> { photoStatus.text = "Nothing changed between the photos."; kaak.say("that's the same photo.", 2500) }
            PhotoCheck.Verdict.DIFFERENT_PLACE -> { photoStatus.text = "That doesn't look like the same place. Take the after photo from where you took the first."; kaak.say("that's not the same place.", 2500) }
        }
    }

    private fun grayOf(b: Bitmap): IntArray {
        val small = Bitmap.createScaledBitmap(b, PhotoCheck.SIZE, PhotoCheck.SIZE, true)
        val px = IntArray(PhotoCheck.SIZE * PhotoCheck.SIZE)
        small.getPixels(px, 0, PhotoCheck.SIZE, 0, 0, PhotoCheck.SIZE, PhotoCheck.SIZE)
        return IntArray(px.size) { i ->
            val c = px[i]
            ((c shr 16 and 0xFF) * 299 + (c shr 8 and 0xFF) * 587 + (c and 0xFF) * 114) / 1000
        }
    }

    // ---------------- sensors used while this screen is open ----------------

    private var listener: SensorEventListener? = null
    private fun sensors() = getSystemService(SensorManager::class.java)

    private fun listen(type: Int, onEvent: (SensorEvent) -> Unit): Boolean {
        stopListening()
        val sm = sensors() ?: return false
        val sensor = sm.getDefaultSensor(type) ?: return false
        val l = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) = onEvent(e)
            override fun onAccuracyChanged(s: Sensor?, a: Int) = Unit
        }
        listener = l
        window.decorView.keepScreenOn = true
        return sm.registerListener(l, sensor, SensorManager.SENSOR_DELAY_GAME)
    }

    private fun stopListening() {
        listener?.let { sensors()?.unregisterListener(it) }
        listener = null
        window.decorView.keepScreenOn = false
    }

    // ---------------- reps ----------------

    private fun reps() {
        val target = bribe.amount
        val counter = text("0", 72f, bold = true).apply { gravity = Gravity.CENTER; setTextColor(Kit.LEAF_LIP) }
        val how = text("Pick one, then go. Kaak counts.", 15f)
        body.addView(how)
        body.addView(counter, MATCH_WRAP)
        body.addView(text("of $target", 15f, quiet = true).apply { gravity = Gravity.CENTER }, MATCH_WRAP)
        fun rep(n: Int) {
            counter.text = "$n"
            counter.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY)
            if (n % 5 == 0 && n < target) kaak.say("$n.", 900)
            if (n >= target) { stopListening(); kaak.say("fine. impressive. fine.", 2500); claim() }
        }
        body.addView(radios(listOf("Squats", "Push-ups"), -1) { which ->
            counter.text = "0"
            if (which == 0) {
                how.text = "Hold the phone flat against your chest and squat. Kaak feels each one."
                val sq = SquatCounter()
                val ok = listen(Sensor.TYPE_ACCELEROMETER) { e ->
                    val g = sqrt(e.values[0] * e.values[0] + e.values[1] * e.values[1] + e.values[2] * e.values[2])
                    if (sq.onSample(g - SensorManager.GRAVITY_EARTH, SystemClock.elapsedRealtime())) rep(sq.count)
                }
                if (!ok) how.text = "This phone has no motion sensor."
            } else {
                how.text = "Put the phone on the floor, screen up, under your face. Each time you come down, Kaak counts."
                val pu = PushupCounter()
                val sensor = sensors()?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
                val near = (sensor?.maximumRange ?: 5f).coerceAtMost(5f)
                val ok = listen(Sensor.TYPE_PROXIMITY) { e ->
                    if (pu.onProximity(e.values[0] < near, SystemClock.elapsedRealtime())) rep(pu.count)
                }
                if (!ok) how.text = "This phone has no proximity sensor. Try squats."
            }
        })
        honorFallback("Sensors acting up?")
    }

    // ---------------- stairs ----------------

    private fun stairs() {
        val floors = bribe.amount
        val needM = floors * AscentMeter.METRES_PER_FLOOR
        if (sensors()?.getDefaultSensor(Sensor.TYPE_PRESSURE) == null) {
            body.addView(text("This phone has no barometer, so Kaak counts steps instead: about ${floors * 20} steps of climbing.", 15f))
            body.addView(primaryButton("Start climbing", Kit.LEAF) { withSteps { if (TaskCenter.start(bribe)) refresh() } })
            honorFallback("No step counter either?")
            return
        }
        val meter = AscentMeter()
        val counter = text("0.0 m", 56f, bold = true).apply { gravity = Gravity.CENTER; setTextColor(Kit.LEAF_LIP) }
        body.addView(text("Hold the phone and climb $floors floors. Kaak reads the air pressure: it drops as you go up. Walking back down doesn't count.", 15f))
        body.addView(counter, MATCH_WRAP)
        body.addView(text("of ${needM.toInt()} m", 15f, quiet = true).apply { gravity = Gravity.CENTER }, MATCH_WRAP)
        body.addView(primaryButton("Start climbing", Kit.LEAF) {
            kaak.say("up. go.", 1500)
            listen(Sensor.TYPE_PRESSURE) { e ->
                meter.onAltitude(SensorManager.getAltitude(SensorManager.PRESSURE_STANDARD_ATMOSPHERE, e.values[0]))
                counter.text = String.format(java.util.Locale.US, "%.1f m", meter.climbedM)
                if (meter.climbedM >= needM * 0.85f) { stopListening(); kaak.say("panting? good.", 2500); claim() }
            }
        })
        honorFallback("Barometer acting up?")
    }

    // ---------------- chores: time plus movement ----------------

    private fun moving() {
        body.addView(text("Put the phone in your pocket and get on with it. Kaak checks that ${bribe.amount} minutes pass and that you're up and moving (about ${bribe.amount * 25} steps).", 15f))
        body.addView(primaryButton("Start", Kit.LEAF) { withSteps { if (TaskCenter.start(bribe)) { kaak.say("go. I'm counting.", 2000); refresh() } } })
        honorFallback("No step counter on this phone?")
    }

    // ---------------- reply: typing in your chat app ----------------

    private fun typingBody() {
        val key = appKey()
        body.addView(text("Open your chat app and reply. Kaak only notices that you typed and that the app was open for a minute. He never sees what you wrote or who it's to.", 15f))
        body.addView(primaryButton(openLabel(key)) {
            val pkg = prefs.appFor(key)
            if (pkg == null) pickApp(key) {} else { TaskCenter.start(bribe, setOf(pkg)); Apps.launch(this, pkg) }
        })
        if (prefs.appFor(key) != null) body.addView(button("Use a different app") { pickApp(key) {} })
        honorFallback("Replied on another device?")
    }

    private var afterPermission: (() -> Unit)? = null

    private fun withSteps(then: () -> Unit) {
        if (checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
            afterPermission = then
            requestPermissions(arrayOf(Manifest.permission.ACTIVITY_RECOGNITION), REQ_STEPS)
        } else then()
    }

    private fun honor() {
        val d = detour
        if (d?.opener == Opener.TIMER) {
            val timer = text("10:00", 40f, bold = true).apply { gravity = Gravity.CENTER }
            body.addView(timer, MATCH_WRAP)
            body.addView(button("Start a 10-minute timer") { countdown(timer, 10 * 60) })
        }
        if (d?.opener == Opener.CHOSEN_APP) {
            body.addView(button(openLabel(d.id)) { openChosenApp(d.id) })
        }
        body.addView(text("Kaak takes your word for this one. Up to 3 a day.", 14f, quiet = true))
        body.addView(primaryButton("I did it") { claim() })
    }

    private fun phoneDown() {
        body.addView(text("Put the phone face-down and let the screen go off. " +
            "It has to stay off for ${bribe.amount} minutes straight. Peeking restarts the clock.", 15f))
        body.addView(primaryButton("Start") {
            TaskCenter.start(bribe)
            kaak.say("go. I'm watching.", 2500)
            refresh()
        })
    }

    private fun steps() {
        if (!TaskCenter.hasStepCounter(this)) {
            body.addView(text("This phone has no step counter, so Kaak can't check this one. Try another bribe.", 15f))
            return
        }
        body.addView(text("Walk ${"%,d".format(bribe.amount)} steps. Kaak counts with the phone's built-in step counter. " +
            "Keep the phone in your pocket; the screen can be off.", 15f))
        body.addView(primaryButton("Start walking", Kit.LEAF, Kit.INK) {
            if (checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.ACTIVITY_RECOGNITION), REQ_STEPS)
            } else startSteps()
        })
    }

    private fun startSteps() {
        if (TaskCenter.start(bribe)) { kaak.say("walk.", 2000); refresh() }
        else status.text = "Couldn't start the step counter."
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        val pending = afterPermission
        afterPermission = null
        if (requestCode == REQ_STEPS && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED && pending != null) pending()
        else if (requestCode == REQ_STEPS && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) startSteps()
        else if (requestCode == REQ_STEPS) status.text = "Kaak needs the Physical activity permission to count steps."
    }

    private fun appKey() = detour?.id ?: bribe.id

    private fun openLabel(key: String) = prefs.appFor(key)?.let { "Open ${Apps.label(this, it)}" } ?: "Pick the app"

    private fun openChosenApp(key: String, track: Boolean = false) {
        val pkg = prefs.appFor(key)
        if (pkg == null) {
            pickApp(key) { openChosenApp(key, track) }
            return
        }
        if (track) TaskCenter.start(bribe, setOf(pkg))
        Apps.launch(this, pkg)
    }

    private fun pickApp(key: String, then: () -> Unit) {
        val apps = Apps.launchable(this)
        AlertDialog.Builder(this)
            .setTitle("Which app?")
            .setItems(apps.map { it.label }.toTypedArray()) { _, i ->
                prefs.setAppFor(key, apps[i].pkg)
                then()
                recreate()
            }
            .show()
    }

    private fun appTime() {
        val key = appKey()
        body.addView(text("Spend ${bribe.amount} minutes in the app. Kaak counts the time it's open.", 15f))
        body.addView(button(openLabel(key)) { openChosenApp(key, track = true) })
        if (prefs.appFor(key) != null) body.addView(button("Use a different app") { pickApp(key) {} })
    }

    private fun call() {
        val name = prefs.friendName
        val number = prefs.friendNumber
        body.addView(text("Talk for at least ${bribe.amount} minutes. Kaak only counts how long the phone app is open, never who or what.", 15f))
        body.addView(button(if (name != null) "Call $name" else "Open the phone app") {
            TaskCenter.start(bribe, Apps.callPackages(this))
            val uri = if (number != null) Uri.parse("tel:" + Uri.encode(number)) else Uri.parse("tel:")
            runCatching { startActivity(Intent(Intent.ACTION_DIAL, uri)) }
        })
    }

    private fun note() {
        val prompt = if (bribe.id == "plan") "Your top 3 tasks for tomorrow:" else "3 good things about today:"
        body.addView(text(prompt, 16f, bold = true))
        body.addView(text("Kaak eats this note when you're done. It is never saved.", 13f, quiet = true))
        val counter = text("0 / ${bribe.amount} words", 13f, quiet = true)
        lateinit var feed: TextView
        val edit = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            minLines = 5
            gravity = Gravity.TOP
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun afterTextChanged(s: Editable?) {
                    val words = s?.split(Regex("\\s+"))?.count { it.isNotBlank() } ?: 0
                    counter.text = "$words / ${bribe.amount} words"
                    feed.isEnabled = words >= bribe.amount
                }
            })
        }
        feed = primaryButton("Feed Kaak") {
            edit.setText("")
            edit.isEnabled = false
            claim()
        }.apply { isEnabled = false }
        body.addView(edit, MATCH_WRAP)
        body.addView(counter)
        body.addView(feed)
    }

    private fun breathing() {
        body.addView(text("Breathe with the circle. Hold the phone still; time only counts while it's still.", 15f))
        val breath = BreathView(this, bribe.amount * 60_000L) { runOnUiThread { claim() } }
        body.addView(breath, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(300f)))
        body.addView(button("Start") { breath.begin() })
    }

    private val stretches = listOf(
        "Neck rolls, slow, both ways",
        "Shoulder rolls, back and forward",
        "Reach up high, then hang forward",
        "Side bends, left and right",
        "Hands behind your back, open the chest",
    )

    private fun stretch() {
        val now = text("", 22f, bold = true)
        val timer = text("", 40f, bold = true).apply { gravity = Gravity.CENTER }
        val n = bribe.amount.coerceIn(1, stretches.size)
        body.addView(text(if (n == 1) "One stretch, 1 minute. Kaak counts along." else "$n stretches, 1 minute each. Kaak counts along.", 15f))
        body.addView(now)
        body.addView(timer, MATCH_WRAP)
        body.addView(button("Start") {
            window.decorView.keepScreenOn = true
            runStretch(0, now, timer)
        })
    }

    private fun runStretch(i: Int, now: TextView, timer: TextView) {
        if (i >= bribe.amount.coerceIn(1, stretches.size)) {
            now.text = "Done."
            window.decorView.keepScreenOn = false
            claim()
            return
        }
        now.text = "${i + 1}. ${stretches[i]}"
        countdown(timer, 60) { runStretch(i + 1, now, timer) }
    }

    private fun canvas() {
        body.addView(text("Draw Kaak. He's posing. Don't make him wait.", 15f))
        val strokes = text("0 strokes", 13f, quiet = true)
        lateinit var show: TextView
        val pad = DrawPad(this) { n ->
            strokes.text = "$n strokes"
            show.isEnabled = n >= bribe.amount
        }
        show = primaryButton("Show Kaak") {
            kaak.say(lines.drawingReview(), 3000)
            handler.postDelayed({ claim() }, 1200)
        }.apply { isEnabled = false }
        body.addView(pad, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(320f)))
        body.addView(strokes)
        body.addView(show)
        body.addView(button("Clear") { pad.clear() })
    }

    private fun countdown(view: TextView, seconds: Int, then: (() -> Unit)? = null) {
        handler.removeCallbacksAndMessages(null)
        var left = seconds
        val r = object : Runnable {
            override fun run() {
                view.text = "%d:%02d".format(left / 60, left % 60)
                if (left <= 0) { then?.invoke(); return }
                left--
                handler.postDelayed(this, 1000)
            }
        }
        handler.post(r)
    }
}
