package app.kaak.ui

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import app.kaak.core.Chaos
import app.kaak.core.JumpscareLevel
import app.kaak.core.Lang
import app.kaak.core.Lines
import app.kaak.core.TrustLevel
import app.kaak.data.CrashLog
import app.kaak.data.FeedApps
import app.kaak.data.KaakPrefs
import app.kaak.data.SessionLog
import app.kaak.data.Strict
import app.kaak.data.Study
import app.kaak.data.Wallet
import app.kaak.overlay.Feedback
import app.kaak.overlay.KaakView
import app.kaak.service.KaakAccessibilityService
import app.kaak.tasks.TaskCenter
import java.util.Locale

/** Home: Kaak on his spotlight, today in four tiles, one red button, then settings. */
class MainActivity : Activity() {

    private lateinit var prefs: KaakPrefs
    private lateinit var wallet: Wallet
    private val lines = Lines()
    private lateinit var status: TextView
    private lateinit var setupCard: View
    private lateinit var feedValue: TextView
    private lateinit var feedBar: ChunkyBar
    private lateinit var bribeValue: TextView
    private lateinit var trustValue: TextView
    private lateinit var trustLabel: TextView
    private lateinit var backValue: TextView
    private lateinit var nestSub: TextView
    private lateinit var progressLine: TextView
    private lateinit var debugText: TextView
    private lateinit var strictStatus: TextView
    private lateinit var strictPills: View
    private lateinit var strictLeave: TextView
    private val handler = Handler(Looper.getMainLooper())

    private val refresher = object : Runnable {
        override fun run() {
            refreshStatus(); refreshToday(); refreshDebug()
            handler.postDelayed(this, 1_000)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = KaakPrefs(this)
        wallet = Wallet(this)
        lines.lang = prefs.lang
        if (Study.enabled && Study.phase(this) != app.kaak.core.Phase.KAAK) {
            startActivity(Intent(this, StudyActivity::class.java)); finish(); return
        }
        if (!prefs.onboarded) {
            startActivity(Intent(this, OnboardingActivity::class.java)); finish(); return
        }
        val (scroll, root) = scrollPage()
        setContentView(scroll)

        // ---- hero: Kaak on a warm spotlight. Tap him and he takes offence.
        val hero = FrameLayout(this)
        hero.addView(Spotlight(this), FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        val kaak = KaakView(this, Feedback(this, prefs), lines).apply {
            lightBubble = true
            contentDescription = "Kaak, the crow. Tap him."
        }
        hero.addView(kaak, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        val title = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(text("Kaak", 54f, bold = true).apply { setPadding(0, 0, 0, 0) })
            addView(text("the crow who lives\nin your phone", 15f, quiet = true))
        }
        hero.addView(title, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply { bottomMargin = dp(8f) })
        root.addView(hero, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(250f)))
        kaak.post {
            kaak.strikePose(kaak.width * 0.75f, kaak.height * 0.84f, 1.5f, facing = -1f)
            kaak.say(lines.arrive(), 4000)
        }
        kaak.setOnTouchListener { _, e ->
            if (e.actionMasked == MotionEvent.ACTION_DOWN) kaak.poke(lines.hit())
            true
        }

        status = TextView(this).apply {
            textSize = 14f
            typeface = Kit.font(this@MainActivity, 800)
            setPadding(dp(14f), dp(7f), dp(14f), dp(7f))
            setOnClickListener { if (!serviceEnabled()) startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        }
        root.addView(status, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(4f) })

        setupCard = card(Kit.RED_TINT).apply {
            edge = Kit.RED_BORDER
            addView(text("Let Kaak in", 20f, bold = true))
            addView(text("Turn Kaak on in Accessibility settings. Greyed out? Open his app info, tap ⋮, choose \"Allow restricted settings\", then try again.", 15f))
            addView(primaryButton("Open settings") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) })
            addView(button("App info") { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) })
        }
        root.addView(setupCard)
        root.addView(text("Kaak stuck on your screen? Tap here to send him away.", 14f, bold = true).apply {
            setTextColor(Kit.RED)
            setPadding(0, dp(10f), 0, 0)
            setOnClickListener {
                val svc = KaakAccessibilityService.instance
                if (svc == null) toast("Kaak isn't running.") else { svc.dismissAll(); toast("Kaak has left. For now.") }
            }
        })

        // ---- today
        section(root, "Today")
        fun tile(icon: KaakIcon.Kind, color: Int, label: String): Triple<CardBox, TextView, TextView> {
            val value = text("–", 26f, bold = true).apply {
                setTextColor(color); setPadding(dp(10f), 0, 0, 0)
                // "Neighbour" in a half-width tile: shrink to fit rather than break the word
                maxLines = 1
                setAutoSizeTextTypeUniformWithConfiguration(14, 26, 1, android.util.TypedValue.COMPLEX_UNIT_SP)
            }
            val head = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                addView(KaakIcon(this@MainActivity, icon))
                addView(value, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            }
            val lab = text(label, 13f, quiet = true).apply { setPadding(0, dp(8f), 0, 0) }
            val box = CardBox(this).apply { addView(head); addView(lab) }
            return Triple(box, value, lab)
        }
        fun row(a: View, b: View) = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(a, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply { rightMargin = dp(6f) })
            addView(b, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply { leftMargin = dp(6f) })
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12f) }
        }
        val (feedTile, fv, _) = tile(KaakIcon.Kind.CLOCK, Kit.LEAF_LIP, "feed minutes today"); feedValue = fv
        feedBar = ChunkyBar(this); feedTile.addView(feedBar, 1, MATCH_WRAP.apply { topMargin = dp(10f) })
        val (bribeTile, bv, _) = tile(KaakIcon.Kind.COIN, Kit.GOLD_LIP, "bribe minutes left"); bribeValue = bv
        val (trustTile, tv, tl) = tile(KaakIcon.Kind.HEART, Kit.PLUM_LIP, "trust"); trustValue = tv; trustLabel = tl
        val (backTile, kv, _) = tile(KaakIcon.Kind.REWIND, Kit.SKY_LIP, "Kaak got back for you"); backValue = kv
        root.addView(row(feedTile, bribeTile))
        root.addView(row(trustTile, backTile))

        root.addView(primaryButton("Bribe Kaak") { startActivity(Intent(this, BribeActivity::class.java)) })
        progressLine = text("", 14f, quiet = true).apply { gravity = Gravity.CENTER; setPadding(0, dp(8f), 0, 0) }
        root.addView(progressLine, MATCH_WRAP)

        fun feature(icon: KaakIcon.Kind, title: String, sub: String, go: () -> Unit): Pair<View, TextView> {
            val subView = text(sub, 13f, quiet = true)
            val box = CardBox(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(KaakIcon(this@MainActivity, icon, 40f))
                addView(LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(dp(10f), 0, 0, 0)
                    addView(text(title, 16f, bold = true)); addView(subView)
                })
                isClickable = true
                setOnClickListener { performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY); go() }
            }
            return box to subView
        }
        val (nest, ns) = feature(KaakIcon.Kind.NEST, "Nest", "") { startActivity(Intent(this, NestActivity::class.java)) }
        nestSub = ns
        val (times, _) = feature(KaakIcon.Kind.PAPER, "Kaak Times", "out Sunday") { startActivity(Intent(this, TimesActivity::class.java)) }
        root.addView(row(nest, times))

        // ---- settings
        section(root, "Feeds he watches")
        val watched = prefs.feedApps.toMutableSet()
        root.addView(FlowLayout(this).apply {
            FeedApps.ALL.forEach { (pkg, name) ->
                val pill = Pill(this@MainActivity, name, pkg in watched)
                pill.onTap {
                    if (pill.selectedPill && Strict.active(this@MainActivity)) { toast("Strict mode is on: feeds can't be removed."); return@onTap }
                    pill.selectedPill = !pill.selectedPill
                    if (pill.selectedPill) watched += pkg else watched -= pkg
                    prefs.feedApps = watched
                }
                addView(pill)
            }
        })

        section(root, "How mean")
        lateinit var arrival: KaakSlider
        lateinit var every: KaakSlider
        root.addView(radios(Chaos.entries.map { it.label.substringBefore(" (") }, Chaos.entries.indexOf(prefs.chaos)) {
            prefs.applyChaos(Chaos.entries[it]); arrival.set(prefs.arrivalMin); every.set(prefs.gagEverySec)
        })
        arrival = KaakSlider(this, "Shows up after", 1, 30, 1, prefs.arrivalMin, { "$it min" }) { prefs.arrivalMin = it }
        every = KaakSlider(this, "Acts up every", 30, 300, 15, prefs.gagEverySec, ::secondsLabel) { prefs.gagEverySec = it }
        root.addView(arrival)
        root.addView(every)
        root.addView(text("Small pokes come in between, and the minutes count all feed time except typing.", 13f, quiet = true))
        root.addView(text("Jumpscares", 16f, bold = true).apply { setPadding(0, dp(14f), 0, dp(4f)) })
        root.addView(radios(JumpscareLevel.entries.map { it.label.substringBefore(":").substringBefore(" (") }, JumpscareLevel.entries.indexOf(prefs.jumpscare)) {
            prefs.jumpscare = JumpscareLevel.entries[it]
        })

        section(root, "Daily limit")
        root.addView(text("At this much feed time a day, Kaak eats every feed for 20 minutes.", 15f, quiet = true))
        lateinit var limitSlider: KaakSlider
        limitSlider = KaakSlider(this, "Daily limit", 5, 180, 5, prefs.dailyLimitMin, { "$it min" }) {
            if (it > prefs.dailyLimitMin && Strict.active(this)) { limitSlider.set(prefs.dailyLimitMin); toast("Strict mode is on: the limit can only go down.") }
            else prefs.dailyLimitMin = it
        }
        root.addView(limitSlider)

        section(root, "Need a break from Kaak?")
        root.addView(radios(listOf("30 min", "1 hour", "Until tomorrow", "Resume now"), -1) { i ->
            if (i != 3) pauseBlocked()?.let { toast(it); return@radios }
            val now = System.currentTimeMillis()
            prefs.pausedUntil = when (i) {
                0 -> now + 30 * 60_000L
                1 -> now + 60 * 60_000L
                2 -> java.time.LocalDate.now().plusDays(1).atTime(5, 0).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                else -> 0L
            }
            if (i == 3) prefs.paused = false
            KaakAccessibilityService.instance?.dismissAll()
            toast(if (i == 3) "Kaak is back." else "Kaak is napping.")
        })

        section(root, "Strict mode")
        root.addView(text("Makes Kaak hard to quit: he blocks his own uninstall and settings screens, and pause and a higher limit are locked. To leave early you ask, then wait 15 minutes.", 14f, quiet = true))
        strictStatus = text("", 16f, bold = true).apply { setPadding(0, dp(6f), 0, 0) }
        root.addView(strictStatus)
        strictPills = radios(listOf("Until 23:00", "24 hours", "7 days"), -1) { i ->
            val now = java.time.LocalDateTime.now()
            val until = when (i) {
                0 -> now.toLocalDate().atTime(23, 0).let { if (it.isBefore(now)) it.plusDays(1) else it }
                1 -> now.plusHours(24)
                else -> now.plusDays(7)
            }.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
            Strict.start(this, until)
            KaakAccessibilityService.instance?.syncStrict()
            toast("Strict mode on. Kaak is staying.")
            refreshStatus()
        }
        root.addView(strictPills)
        strictLeave = button("Ask to leave strict mode") { Strict.askToLeave(this); refreshStatus() }
        root.addView(strictLeave)

        section(root, "Settings")
        root.addView(button("Keep Kaak awake (battery)") { askStayAwake() })
        lateinit var pauseRow: ToggleRow
        pauseRow = check("Pause Kaak", prefs.paused) { on ->
            val why = if (on) pauseBlocked() else null
            if (why != null) { toast(why); pauseRow.toggle.set(false) } else prefs.paused = on
        }
        root.addView(listCard(
            pauseRow,
            check("Mood check (max 3 a day)", prefs.moodChecks) { prefs.moodChecks = it },
            check("Jumpscares after 11 p.m.", prefs.nightJumpscares) { prefs.nightJumpscares = it },
            check("Caw sound", prefs.sound) { prefs.sound = it },
            check("Vibration", prefs.haptics) { prefs.haptics = it },
        ))
        root.addView(button("Edit my detours") { startActivity(OnboardingActivity.edit(this, OnboardingActivity.PAGE_DETOURS)) })
        root.addView(text("Subtitles", 16f, bold = true).apply { setPadding(0, dp(18f), 0, dp(4f)) })
        root.addView(radios(Lang.entries.map { it.label.substringBefore(" (") }, Lang.entries.indexOf(prefs.lang)) { prefs.lang = Lang.entries[it] })

        // ---- the rest is for people who want it
        val adv = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        lateinit var more: TextView
        more = button("More settings") {
            adv.visibility = if (adv.visibility == View.GONE) View.VISIBLE else View.GONE
            more.text = if (adv.visibility == View.VISIBLE) "Fewer settings" else "More settings"
        }
        root.addView(more)
        root.addView(adv)

        section(adv, "Bedtime")
        val bedtimes = listOf(22 * 60, 22 * 60 + 30, 23 * 60, 23 * 60 + 30, 0, 30, 60)
        adv.addView(radios(bedtimes.map { hhmm(it) }, bedtimes.indexOf(prefs.bedtimeMinute).coerceAtLeast(0)) { prefs.bedtimeMinute = bedtimes[it] })

        section(adv, "Work mode")
        adv.addView(text("For people who sell or post on Facebook and Instagram. In work hours Kaak ignores inboxes and posting, never steals, and wears tiny glasses.", 15f, quiet = true))
        adv.addView(listCard(check("Work mode", prefs.workMode) { prefs.workMode = it }))
        val dayNames = listOf(6 to "Sat", 7 to "Sun", 1 to "Mon", 2 to "Tue", 3 to "Wed", 4 to "Thu", 5 to "Fri")
        val workDays = prefs.workDays.toMutableSet()
        adv.addView(FlowLayout(this).apply {
            setPadding(0, dp(12f), 0, dp(4f))
            dayNames.forEach { (d, name) ->
                val pill = Pill(this@MainActivity, name, d in workDays)
                pill.onTap { pill.selectedPill = !pill.selectedPill; if (pill.selectedPill) workDays += d else workDays -= d; prefs.workDays = workDays }
                addView(pill)
            }
        })
        val hours = listOf(9 * 60 to 17 * 60, 10 * 60 to 18 * 60, 9 * 60 to 21 * 60, 12 * 60 to 22 * 60)
        adv.addView(radios(hours.map { "${hhmm(it.first)}–${hhmm(it.second)}" },
            hours.indexOfFirst { it.first == prefs.workStartMin && it.second == prefs.workEndMin }.coerceAtLeast(0)) {
            prefs.workStartMin = hours[it].first; prefs.workEndMin = hours[it].second
        })

        // ---- previews
        section(adv, "Kaak's stage")
        adv.addView(text("Make him perform right now.", 15f, quiet = true))
        adv.addView(FlowLayout(this).apply {
            setPadding(0, dp(8f), 0, 0)
            listOf(
                "Arrive" to "arrive", "Back again" to "again", "Walk" to "walk", "Sit" to "sit", "Splat" to "splat",
                "Warning" to "warn", "Theft" to "steal", "Jumpscare" to "jumpscare", "Too much?" to "toomuch",
                "Eaten" to "eat", "Asleep" to "asleep", "Detours" to "detours", "Worth it?" to "worth",
                "Bedtime" to "bed", "Blanket" to "blanket", "Morning gift" to "morning", "Mood" to "mood",
                "Work mode" to "work", "Calm Kaak" to "calm", "Kaak Times" to "times", "Nudge" to "nudge", "Hide" to "hide",
            ).forEach { (label, key) ->
                addView(Pill(this@MainActivity, label, false).onTap {
                    val svc = KaakAccessibilityService.instance
                    if (svc == null) toast("Turn Kaak on in Accessibility settings first.") else svc.preview(key)
                })
            }
        })

        // ---- testers
        section(adv, "For testers")
        val dbg = card(Kit.NIGHT)
        debugText = text("", 12f).apply { typeface = Typeface.MONOSPACE; setTextColor(Kit.GOLD) }
        dbg.addView(debugText)
        adv.addView(dbg)
        adv.addView(button("Share my stats") {
            val log = SessionLog.readTail(this)
            if (log.isBlank()) toast("Nothing logged yet.") else startActivity(
                Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, Study.summary(this) + "\n" + log), "Share Kaak stats"))
        })
        if (Study.enabled) adv.addView(button("Study info and code") { startActivity(Intent(this, StudyActivity::class.java).putExtra("info", true)) })
        adv.addView(button("Report a problem") {
            val report = buildString {
                appendLine(CrashLog.deviceInfo(this@MainActivity))
                appendLine(Study.summary(this@MainActivity))
                appendLine("Accessibility on: ${serviceEnabled()}")
                appendLine(); appendLine("What happened (write here):"); appendLine()
                appendLine("--- errors ---"); appendLine(CrashLog.read(this@MainActivity).takeLast(6_000).ifBlank { "none" })
                appendLine("--- last events ---"); append(SessionLog.readTail(this@MainActivity, 60))
            }
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, report), "Report a problem"))
        })
        adv.addView(button("Clear log") { SessionLog.clear(this); CrashLog.clear(this); toast("Log cleared.") })
        adv.addView(button("Redo onboarding") { prefs.onboarded = false; startActivity(Intent(this, OnboardingActivity::class.java)); finish() })
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) handler.post(refresher)
    }

    override fun onPause() {
        handler.removeCallbacks(refresher)
        super.onPause()
    }

    private fun serviceEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, KaakAccessibilityService::class.java)
        return enabled.split(':').any { it.equals(me.flattenToString(), true) || it.equals(me.flattenToShortString(), true) }
    }

    private fun refreshStatus() {
        val on = serviceEnabled()
        val until = prefs.pausedUntil
        val (label, bg, fg) = when {
            !on -> Triple("●  Kaak is off · tap to fix", Kit.RED_TINT, Kit.RED)
            prefs.paused -> Triple("●  Napping (paused)", Kit.GOLD_TINT, Kit.GOLD_LIP)
            System.currentTimeMillis() < until -> Triple("●  Napping until ${java.text.SimpleDateFormat("HH:mm", Locale.US).format(java.util.Date(until))}", Kit.GOLD_TINT, Kit.GOLD_LIP)
            else -> Triple("●  Watching ${prefs.feedApps.size} feeds", Kit.LEAF_TINT, Kit.LEAF_LIP)
        }
        status.text = label
        status.setTextColor(fg)
        status.background = android.graphics.drawable.GradientDrawable().apply { setColor(bg); cornerRadius = dp(99f).toFloat() }
        setupCard.visibility = if (on) View.GONE else View.VISIBLE
        val strict = Strict.active(this)
        val leaving = Strict.coolOffLeftMin(this)
        strictStatus.text = when {
            !strict -> "Off"
            leaving != null -> "On until ${Strict.untilLabel(this)} · leaving in $leaving min"
            else -> "On until ${Strict.untilLabel(this)}"
        }
        strictStatus.setTextColor(if (strict) Kit.RED else Kit.MUTED)
        strictPills.visibility = if (strict) View.GONE else View.VISIBLE
        strictLeave.visibility = if (strict && leaving == null) View.VISIBLE else View.GONE
    }

    private fun refreshToday() {
        val day = TaskCenter.today()
        val snap = KaakAccessibilityService.debug.snapshot
        val feedMin = ((snap?.dailyMs ?: 0) / 60_000).toInt()
        val limit = prefs.dailyLimitMin + wallet.bonusMinutes(day)
        feedValue.text = android.text.SpannableString("$feedMin /$limit").apply {
            setSpan(android.text.style.RelativeSizeSpan(0.6f), "$feedMin".length, length, 0)
            setSpan(android.text.style.ForegroundColorSpan(Kit.MUTED), "$feedMin".length, length, 0)
        }
        feedBar.value = feedMin / limit.toFloat()
        bribeValue.text = "${wallet.minutesLeft(day)}"
        val level = TrustLevel.of(wallet.trust)
        trustValue.text = level.label
        trustLabel.text = level.next?.let { "trust, ${it.minPoints - wallet.trust} to ${it.label}" } ?: "trust, as close as it gets"
        val r = wallet.returnedMin
        backValue.text = if (r < 60) "${r}m" else "${r / 60}h ${r % 60}m"
        val loot = wallet.loot.values.sum()
        nestSub.text = if (loot == 0) "empty, for now" else "$loot shiny things"
        progressLine.text = TaskCenter.active?.let { "In progress: ${it.bribe.title} · ${TaskCenter.progressText()}" } ?: ""
        progressLine.visibility = if (TaskCenter.active == null) View.GONE else View.VISIBLE
    }

    private fun refreshDebug() {
        val d = KaakAccessibilityService.debug
        val s = d.snapshot
        val st = s?.stats
        fun min(ms: Long) = String.format(Locale.US, "%.1f", ms / 60_000.0)
        debugText.text = buildString {
            appendLine("app      ${d.app ?: "-"}${if (s?.inFeed == true) "  (feed)" else ""}")
            appendLine("verdict  ${s?.detection?.verdict ?: "-"}  ${s?.detection?.reason ?: ""}")
            appendLine("session  ${min(s?.activeMs ?: 0)} min, mindless ${min(s?.mindlessMs ?: 0)}")
            appendLine("today    ${min(s?.dailyMs ?: 0)} min counted")
            appendLine("swipes   ${st?.let { String.format(Locale.US, "%.1f/min", it.swipesPerMin) } ?: "-"}")
            appendLine("dwell    ${st?.medianDwellMs?.let { String.format(Locale.US, "%.1f s", it / 1000.0) } ?: "-"}")
            appendLine("rules    bedtime ${d.rules?.bedtime ?: "-"}, quiet ${d.rules?.quiet ?: "-"}, work ${d.rules?.work ?: "-"}, trust ${d.rules?.trust?.label ?: "-"}")
            append("last     ${d.lastAction}")
        }
    }

    /** Pausing is a way past Kaak, so it waits for his nap to end, and strict mode locks it. */
    private fun pauseBlocked(): String? {
        if (Strict.active(this)) return "Strict mode is on until ${Strict.untilLabel(this)}."
        val nap = KaakAccessibilityService.debug.snapshot?.eatenUntil ?: return null
        val left = (nap - android.os.SystemClock.elapsedRealtime()) / 60_000 + 1
        return if (left > 0) "Kaak is full. You can pause after his nap ($left min)." else null
    }

    /** Samsung, Xiaomi, Oppo and friends kill background services; this asks Android to leave Kaak alone. */
    @SuppressLint("BatteryLife")
    private fun askStayAwake() {
        val pm = getSystemService(android.os.PowerManager::class.java)
        if (pm?.isIgnoringBatteryOptimizations(packageName) == true) {
            toast("Already allowed. On Samsung also check Battery → Background usage limits.")
            if (!Strict.active(this)) startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            return
        }
        Strict.allowSettingsUntil = System.currentTimeMillis() + 15_000
        runCatching { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
            .onFailure { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
