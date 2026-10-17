package app.kaak.service

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast
import app.kaak.core.Action
import app.kaak.core.Bedtime
import app.kaak.core.BribeCatalog
import app.kaak.core.Detour
import app.kaak.core.DetourPicker
import app.kaak.core.Gag
import app.kaak.core.Mood
import app.kaak.core.Phase
import app.kaak.core.StudyPlan
import app.kaak.data.Study
import app.kaak.core.ReturnedTime
import app.kaak.core.Trust
import app.kaak.core.TrustLevel
import app.kaak.core.JumpscareLevel
import app.kaak.core.KaakBrain
import app.kaak.core.LabelContext
import app.kaak.core.Lines
import app.kaak.core.MINUTE_MS
import app.kaak.core.Rules
import app.kaak.core.SilentApps
import app.kaak.core.StrictPlan
import app.kaak.core.KaakTapWatch
import app.kaak.data.Strict
import app.kaak.ui.EscapeActivity
import app.kaak.core.Snapshot
import app.kaak.core.dayKeyOf
import app.kaak.data.Apps
import app.kaak.data.CrashLog
import app.kaak.data.DayStore
import app.kaak.data.KaakPrefs
import app.kaak.data.ProtectedApps
import app.kaak.data.SessionLog
import app.kaak.data.Wallet
import app.kaak.overlay.Cards
import app.kaak.overlay.Feedback
import app.kaak.overlay.KaakOverlay
import app.kaak.tasks.TaskCenter
import app.kaak.ui.BribeActivity
import app.kaak.ui.DetourLauncher
import app.kaak.ui.TaskActivity
import app.kaak.ui.TimesActivity
import android.provider.AlarmClock
import java.time.DayOfWeek
import kotlin.random.Random
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Date
import java.util.Locale

/** What the in-app debug panel shows. */
data class DebugState(
    val app: String? = null,
    val snapshot: Snapshot? = null,
    val lastAction: String = "none yet",
    val rules: Rules? = null,
)

/**
 * Reads only three kinds of events: which app came to the front, that a scroll
 * happened, and that text was typed. Never the content of the screen
 * (canRetrieveWindowContent is false in the service config).
 */
class KaakAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: KaakAccessibilityService? = null
            private set

        @Volatile
        var debug: DebugState = DebugState()
            private set

        private const val TICK_MS = 5_000L
        /** System windows that float over a feed: never count as leaving it. */
        private val IGNORED = setOf(
            "com.android.systemui", "android",
            "com.android.intentresolver", // share sheet (Android 14+)
            "com.google.android.permissioncontroller", "com.android.permissioncontroller",
            "com.google.android.packageinstaller", "com.android.packageinstaller",
        )
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var prefs: KaakPrefs
    private lateinit var wallet: Wallet
    private lateinit var lines: Lines
    private lateinit var feedback: Feedback
    private lateinit var overlay: KaakOverlay
    private lateinit var log: SessionLog
    private lateinit var brain: KaakBrain
    private lateinit var days: DayStore
    private val returned = ReturnedTime()
    private var lastMindlessWritten = -1
    private var lastLateWritten = -1

    private var currentApp: String? = null
    private var phase = Phase.KAAK
    private var lastAction = "none yet"
    private var detoursOnHome = false
    private val clock = SimpleDateFormat("HH:mm", Locale.US)

    private val ticker = object : Runnable {
        override fun run() {
            tick()
            handler.postDelayed(this, TICK_MS)
        }
    }

    private var quietReturn = false
    private lateinit var silentApps: SilentApps
    private var lastAliveWrite = 0L
    private val power by lazy { getSystemService(PowerManager::class.java) }

    /** Screen off: Kaak must never sit on the lock screen, and a locked phone isn't scrolling. */
    private val screenOffReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            safely("screen-off") {
                overlay.hideAll()
                val now = SystemClock.elapsedRealtime()
                if (brain.inFeed) {
                    brain.forgiveNextReturn(now)
                    brain.onForeground(false, now, LocalDateTime.now().hour)
                    brain.takeLabel()
                    quietReturn = true
                }
            }
        }
    }

    private val unlockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            // back into the same feed after unlocking: Kaak quietly perches again (or the nap cover returns)
            safely("unlock-feed") {
                val app = currentApp
                if (app != null && !prefs.pausedNow && app in prefs.feedApps) {
                    val now = SystemClock.elapsedRealtime()
                    enteredFeed(now)
                    act(brain.onForeground(true, now, LocalDateTime.now().hour))
                }
            }
            handler.postDelayed({
                safely("unlock") {
                    val gift = checkMorningGift()
                    handler.postDelayed({ safely("times") { checkKaakTimes() } }, if (gift) 9_000 else 600)
                }
            }, 600)
        }
    }

    override fun onServiceConnected() {
        prefs = KaakPrefs(this)
        wallet = Wallet(this)
        lines = Lines()
        feedback = Feedback(this, prefs)
        overlay = KaakOverlay(this, feedback, lines)
        log = SessionLog(this)
        days = DayStore(this)
        phase = Study.phase(this)
        SessionLog.phase = if (Study.enabled) phase.name else ""
        brain = KaakBrain(rules = rules(), onSessionEnd = { log.session(it) })
        silentApps = SilentApps(known = prefs.silentApps)
        // was Kaak off or killed for a while? the study needs to know
        val last = prefs.lastAliveWall
        val gapMin = if (last > 0) (System.currentTimeMillis() - last) / 60_000 else 0
        log.event("service_on", if (gapMin >= 3) "after a $gapMin-minute gap" else "")
        TaskCenter.init(this)
        registerReceiver(unlockReceiver, IntentFilter(Intent.ACTION_USER_PRESENT))
        registerReceiver(screenOffReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF))
        launcher = Apps.launcherPackage(this)
        instance = this
        syncStrict()
        handler.post(ticker)
    }

    // ---------------- strict mode: taps on Kaak's name, and the study's record of strict use ----------------
    private val kaakTaps = KaakTapWatch()
    private var launcher: String? = null
    private var watchingTaps = false
    private val tapEvents = AccessibilityEvent.TYPE_VIEW_CLICKED or AccessibilityEvent.TYPE_VIEW_LONG_CLICKED

    private fun eventWords(e: AccessibilityEvent) = (e.text?.joinToString(" ") ?: "") + " " + (e.contentDescription ?: "")

    /** Tap events reach Kaak only while strict mode is on. Called on connect, every tick, and when strict changes. */
    fun syncStrict() {
        safely("strict_sync") {
            val on = Strict.active(this)
            if (on == watchingTaps) return@safely
            serviceInfo = serviceInfo.apply { eventTypes = if (on) eventTypes or tapEvents else eventTypes and tapEvents.inv() }
            if (watchingTaps && !on) log.event("strict_off", Strict.endReason(this))
            watchingTaps = on
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val e = event ?: return
        if (instance == null) return
        val app = e.packageName?.toString() ?: return
        val now = SystemClock.elapsedRealtime()
        // Strict mode: only Settings, uninstall and home screens, only to look for Kaak's own name. Never logged.
        if (e.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED || e.eventType == AccessibilityEvent.TYPE_VIEW_LONG_CLICKED) {
            // only subscribed while strict mode is on (syncStrict); taps in any other app are dropped unread
            if (watchingTaps && (app in StrictPlan.SETTINGS_PACKAGES || app == launcher)) kaakTaps.onTap(app, launcher, eventWords(e), now)
            return
        }
        if (e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && Strict.active(this) &&
            System.currentTimeMillis() > Strict.allowSettingsUntil
        ) {
            val afterTap = kaakTaps.onWindow(app, launcher, now)
            if (afterTap || StrictPlan.isQuitScreen(app, eventWords(e))) { safely("strict") { blockQuit() }; return }
        }
        if (e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && app == packageName) {
            // Kaak's own screens (not his overlay windows): looking at your minutes is not leaving the feed for real
            if (e.className?.toString()?.startsWith("app.kaak.ui.") == true) safely("own") { enteredOwnApp(now) }
            return
        }
        if (e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            safely("foreground") { onForeground(app, now) }
            return
        }
        when (e.eventType) {
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                if (silentApps.onScroll(app)) prefs.silentApps = silentApps.silent
                if (app == currentApp) brain.onScroll(now)
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ->
                // only for feed apps that never report scrolling: a content change stands in for a swipe
                if (app == currentApp && brain.inFeed && silentApps.proxySwipe(app, now)) brain.onScroll(now)
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> {
                TaskCenter.onTyping(app) // reply bribe: counts that you typed, never what
                if (app == currentApp) brain.onTyping(now)
            }
        }
    }

    private fun onForeground(app: String, now: Long) {
        if (app == packageName || app in IGNORED || app == keyboardApp()) return
        currentApp = app
        TaskCenter.onForeground(app)
        brain.rules = rules()
        val hour = LocalDateTime.now().hour

        val wasInFeed = brain.inFeed
        if (ProtectedApps.isProtected(this, app)) {
            if (wasInFeed) leftFeed(now)
            brain.onForeground(false, now, hour)
            brain.takeLabel()
            overlay.hideAll()
            return
        }

        val isFeed = !prefs.pausedNow && app in prefs.feedApps
        if (isFeed && !wasInFeed) enteredFeed(now)
        if (!isFeed && wasInFeed) leftFeed(now)
        val action = brain.onForeground(isFeed, now, hour)
        if (isFeed) {
            prefs.lastFeedUseWall = System.currentTimeMillis()
            overlay.dismissCard()
            act(action)
            return
        }

        overlay.leaveFeed()
        overlay.hideAsleep()
        val label = brain.takeLabel()
        if (app == Apps.launcherPackage(this)) {
            when {
                detoursOnHome -> { detoursOnHome = false; showDetourCard() }
                label != null && !overlay.hasCard() && !overlay.busyOffFeed() -> showWorthIt(label)
            }
        } else {
            overlay.dismissCard()
        }
    }

    private fun tick() = safely("tick") { tickInner() }

    private fun enteredOwnApp(now: Long) {
        if (brain.inFeed) {
            leftFeed(now)
            brain.forgiveNextReturn(now)
            brain.onForeground(false, now, LocalDateTime.now().hour)
            brain.takeLabel()
        }
        overlay.leaveFeed()
        currentApp = packageName
    }

    /** Kaak grabs the feed and flaps around home; feeds stay locked until you win the chase. */
    private fun startTheft(app: String?) {
        overlay.steal(
            Apps.icon(this, app), Apps.label(this, app),
            onGrabbed = { performGlobalAction(GLOBAL_ACTION_HOME) },
            onWon = {
                brain.chaseWon(SystemClock.elapsedRealtime()); log.event("chase", "won")
                days.update(today()) { it.copy(chasesWon = it.chasesWon + 1) }
            },
            onLost = { brain.chaseLost(SystemClock.elapsedRealtime()); log.event("chase", "lost") },
        )
    }

    /** A one-time explainer card, shown [delayMs] after the moment it explains. */
    private fun firstTime(tip: String, delayMs: Long, title: String, body: String, then: (() -> Unit)? = null) {
        if (prefs.seen(tip)) return
        prefs.markSeen(tip)
        handler.postDelayed({
            safely("tip") {
                lines.lang = prefs.lang
                overlay.showCard(Cards.tip(this, title, body) { overlay.dismissCard(); then?.invoke() }, autoDismissMs = 12_000)
            }
        }, delayMs)
    }

    /** Called by the escape screen after the hold and the typed sentence: 5 minutes, then the nap returns. */
    fun grantEscape(app: String) {
        safely("escape") {
            brain.escape(SystemClock.elapsedRealtime())
            log.event("escape", app)
            days.update(today()) { it.copy(escapes = it.escapes + 1) }
            handler.postDelayed({ Apps.launch(this, app) }, 250)
            handler.postDelayed({ safely("judge") { lines.lang = prefs.lang; if (brain.inFeed) overlay.judge(lines.escaped()) } }, 1_800)
        }
    }

    /** Strict mode caught Kaak's own Settings or uninstall screen: back out, go home, explain. */
    private fun blockQuit() {
        performGlobalAction(GLOBAL_ACTION_BACK)
        handler.postDelayed({ performGlobalAction(GLOBAL_ACTION_HOME) }, 200)
        log.event("strict_block")
        handler.postDelayed({
            overlay.showCard(Cards.tip(this, "Strict mode is on.",
                "Until ${Strict.untilLabel(this)}. To leave early, open Kaak, ask to leave strict mode, and wait 15 minutes.") { overlay.dismissCard() }, autoDismissMs = 9_000)
        }, 500)
    }

    /** Send Kaak away right now (home screen button, pause). */
    fun dismissAll() {
        overlay.hideAll()
        overlay.dismissCard()
    }

    private fun tickInner() {
        val now = SystemClock.elapsedRealtime()
        phase = Study.phase(this)
        SessionLog.phase = if (Study.enabled) phase.name else ""
        syncStrict()
        if (!power.isInteractive) return // screen off: nothing is being scrolled (music can keep the phone awake)
        rollTrust()
        credit(returned.flush(now))
        val r = rules()
        brain.rules = r
        if (prefs.pausedNow) {
            if (brain.inFeed) brain.onForeground(false, now)
            overlay.hideAll()
        } else if (!brain.inFeed) {
            overlay.sanity(now)
        }
        val snap = brain.tick(now, LocalDateTime.now().hour, dayKeyOf(LocalDate.now()))
        val wall = System.currentTimeMillis()
        if (wall - lastAliveWrite > 60_000) { prefs.lastAliveWall = wall; lastAliveWrite = wall }
        if (snap.inFeed) {
            currentApp?.let { if (silentApps.onFeedTime(it, TICK_MS)) { prefs.silentApps = silentApps.silent; log.event("silent_app", it) } }
            prefs.lastFeedUseWall = System.currentTimeMillis()
            val mindless = (snap.dailyMs / MINUTE_MS).toInt()
            if (mindless != lastMindlessWritten) { lastMindlessWritten = mindless; days.update(today()) { it.copy(mindlessMin = mindless) } }
            val t = LocalDateTime.now()
            val late = Trust.lateMinuteOf(t.hour * 60 + t.minute)
            if (late >= 0 && late != lastLateWritten) {
                lastLateWritten = late
                days.update(today()) { it.copy(lateMinute = maxOf(it.lateMinute, late)) }
            }
        }
        act(snap.action)
        TaskCenter.check()
        debug = DebugState(currentApp, snap, lastAction, r)
    }

    private fun act(incoming: Action) {
        // after an unlock, "again?" would be rude: just perch
        val action = if (quietReturn && incoming == Action.Return) Action.Resume else incoming
        if (action != Action.None) quietReturn = false
        if (action == Action.None) return
        if (phase != Phase.KAAK) { actStudy(action); return }
        lines.lang = prefs.lang
        val now = SystemClock.elapsedRealtime()
        when (action) {
            Action.Steal, Action.Eat -> returned.onKaakAction(now, endsVisit = true)
            Action.Arrive, Action.Return, Action.Jumpscare, is Action.Heckle, is Action.Warn -> returned.onKaakAction(now, endsVisit = false)
            else -> Unit
        }
        if (action == Action.Steal || action == Action.Bounce || action == Action.Eat || action is Action.Asleep) {
            days.update(today()) { it.copy(foiled = it.foiled + 1, eaten = it.eaten + if (action == Action.Eat) 1 else 0) }
        }
        when (action) {
            Action.Steal -> {
                startTheft(currentApp)
                firstTime("theft", 1_800, "He took your feeds.",
                    "Tap Kaak 5 times to get them back. Ignore him and every feed stays locked for 3 minutes.")
            }
            Action.Bounce -> {
                // he still has it: straight back home, and the chase starts again
                performGlobalAction(GLOBAL_ACTION_HOME)
                if (!overlay.chasing()) startTheft(currentApp)
            }
            Action.Eat -> overlay.eat {
                detoursOnHome = prefs.seen("eat")
                performGlobalAction(GLOBAL_ACTION_HOME)
                firstTime("eat", 1_200, "Kaak ate your feeds.",
                    "For 20 minutes every feed opens to his nap. Hold him for 5 seconds to go in anyway, or try a detour.") { showDetourCard() }
            }
            is Action.Asleep -> showAsleep(action.minutesLeft)
            Action.Jumpscare -> {
                val level = prefs.jumpscare
                overlay.perform(action, false, level)
                handler.postDelayed({ if (brain.inFeed) offerTooMuch() }, 3_200)
            }
            else -> {
                val r = rules()
                overlay.perform(action, r.bedtime, prefs.jumpscare, work = r.work, calm = !r.trust.steals)
                if (action == Action.Arrive && !r.bedtime && !r.work) {
                    if (!prefs.seen("arrive")) firstTime("arrive", 4_500, "That's Kaak.",
                        "He shows up when you scroll without thinking. Leave the feed and he leaves too. Stay, and he gets worse.")
                    else maybeAskMood()
                }
            }
        }
        if (action != Action.Hide && action != Action.Wake) {
            val name = describe(action)
            lastAction = "$name at ${clock.format(Date())}"
            log.action(name, currentApp, brain.activeMs, brain.mindlessMs)
        }
    }

    /** Study edition, baseline week or timer arm: log everything, show at most a plain note, never block. */
    private fun actStudy(action: Action) {
        val now = SystemClock.elapsedRealtime()
        if (action == Action.Hide) { overlay.hideAll(); return }
        if (action == Action.Wake) return
        if (action == Action.Eat || action is Action.Asleep) brain.escape(now) // the timer arm reports the limit but never blocks
        val name = describe(action)
        lastAction = "$name at ${clock.format(Date())}"
        log.action(name, currentApp, brain.activeMs, brain.mindlessMs)
        if (phase != Phase.TIMER) return
        val limit = prefs.dailyLimitMin + wallet.bonusMinutes(today())
        val msg = StudyPlan.timerMessage(action, (brain.activeMs / MINUTE_MS).toInt(), limit) ?: return
        overlay.showCard(Cards.timerNote(this, msg), autoDismissMs = 4_500)
    }

    // ---------------- cards ----------------

    private fun showAsleep(minutes: Int) {
        val app = currentApp
        overlay.showAsleep(
            Cards.asleep(
                this, lines, feedback, Apps.icon(this, app), Apps.label(this, app), minutes, pickDetours(),
                onDetour = { d -> overlay.hideAsleep(); startDetour(d) },
                onBribe = { overlay.hideAsleep(); openBribes() },
                onEscape = {
                    overlay.hideAsleep()
                    startActivity(EscapeActivity.intent(this, app))
                },
            )
        )
    }

    private fun showDetourCard() {
        lines.lang = prefs.lang
        overlay.showCard(
            Cards.detours(
                this, lines, pickDetours(),
                onPick = { d -> overlay.dismissCard(); startDetour(d) },
                onBribe = { overlay.dismissCard(); openBribes() },
                onClose = { overlay.dismissCard() },
            )
        )
    }

    private fun showWorthIt(label: LabelContext) {
        lines.lang = prefs.lang
        overlay.showCard(
            Cards.worthIt(this, lines, mascot = phase == Phase.KAAK) { answer ->
                log.label(answer, label)
                prefs.labelsGiven = prefs.labelsGiven + 1
                days.update(today()) {
                    it.copy(worthYes = it.worthYes + if (answer == "yes") 1 else 0, worthNo = it.worthNo + if (answer == "no") 1 else 0)
                }
                overlay.dismissCard()
            },
            autoDismissMs = 10_000,
        )
    }

    private fun offerTooMuch() {
        overlay.showCard(
            Cards.tooMuch(this, lines.tooMuch()) {
                prefs.jumpscare = JumpscareLevel.OFF
                prefs.chaos = prefs.chaos.gentler()
                overlay.dismissCard()
                log.event("too_much")
                Toast.makeText(this, "Jumpscares off. Kaak will be gentler.", Toast.LENGTH_SHORT).show()
            },
            autoDismissMs = 6_000,
        )
    }

    private fun pickDetours(): List<Detour> {
        val picked = DetourPicker.pick(prefs.detourIds, LocalDateTime.now().hour, rules().bedtime, prefs.recentDetours())
        prefs.markDetoursShown(picked.map { it.id })
        return picked
    }

    private fun startDetour(d: Detour) {
        log.event("detour", d.id)
        if (!DetourLauncher.launch(this, d)) performGlobalAction(GLOBAL_ACTION_HOME)
    }

    private fun openBribes() {
        startActivity(Intent(this, BribeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // ---------------- morning gift ----------------

    private fun checkMorningGift(): Boolean {
        if (phase != Phase.KAAK || !prefs.onboarded || prefs.pausedNow) return false
        val app = currentApp
        if (app != null && ProtectedApps.isProtected(this, app)) return false
        val zone = ZoneId.systemDefault()
        val now = LocalDateTime.now()
        val lastGift = prefs.lastGiftDay.takeIf { it > 0 }?.let { LocalDate.of(it / 10_000, it / 100 % 100, it % 100) }
        val lastFeed = prefs.lastFeedUseWall.takeIf { it > 0 }?.let { LocalDateTime.ofInstant(Instant.ofEpochMilli(it), zone) }
        val installed = LocalDateTime.ofInstant(Instant.ofEpochMilli(prefs.installedAt), zone)
        if (!Bedtime.morningGift(now, prefs.bedtimeMinute, lastGift, lastFeed, installed)) return false
        prefs.lastGiftDay = dayKeyOf(now.toLocalDate())
        BribeCatalog.byId("bedtime")?.let { TaskCenter.claim(it) }
        lines.lang = prefs.lang
        overlay.morningGift()
        log.event("morning_gift")
        return true
    }

    // ---------------- milestone 3: trust, time returned, mood, Kaak Times ----------------

    private fun today() = dayKeyOf(LocalDate.now())

    private fun <T> safely(where: String, block: () -> T): T? =
        runCatching(block).onFailure { CrashLog.record(this, it, where) }.getOrNull()

    private fun enteredFeed(now: Long) {
        credit(returned.onEnterFeed(now))
        days.update(today()) { it.copy(feedOpens = it.feedOpens + 1) }
    }

    private fun leftFeed(now: Long) {
        returned.onLeaveFeed(now)
        val session = (brain.activeMs / MINUTE_MS).toInt()
        days.update(today()) { it.copy(longestSessionMin = maxOf(it.longestSessionMin, session)) }
    }

    private fun credit(ms: Long) {
        val min = (ms / MINUTE_MS).toInt()
        if (min <= 0) return
        val loot = wallet.addReturned(min)
        days.update(today()) { it.copy(returnedMin = it.returnedMin + min) }
        log.event("returned", "$min min${if (loot.isNotEmpty()) " +" + loot.joinToString(",") else ""}")
    }

    /** Once a day, yesterday's numbers move trust up or down a little. */
    private fun rollTrust() {
        val t = today()
        val last = prefs.lastTrustDay
        if (last == t) return
        if (last != 0 && days.has(last)) {
            val delta = Trust.dayDelta(days.get(last), prefs.dailyLimitMin)
            if (delta != 0) wallet.addTrust(delta)
            log.event("trust", "$delta")
        }
        prefs.lastTrustDay = t
    }

    private fun maybeAskMood() {
        if (phase != Phase.KAAK) return
        if (!prefs.moodChecks || days.get(today()).moodChecks >= 3 || Random.nextDouble() >= 0.5) return
        handler.postDelayed({
            safely("mood") {
                if (brain.inFeed && !brain.blocked && !overlay.hasCard()) {
                    days.update(today()) { it.copy(moodChecks = it.moodChecks + 1) }
                    lines.lang = prefs.lang
                    overlay.showCard(Cards.mood(this, lines) { m -> overlay.dismissCard(); onMood(m) }, autoDismissMs = 8_000)
                }
            }
        }, 5_000)
    }

    private fun onMood(m: Mood) {
        log.event("mood", m.name)
        val reply = lines.moodReply(m)
        when (m) {
            Mood.TIRED -> {
                overlay.tired(); overlay.say(reply)
                handler.postDelayed({
                    runCatching {
                        startActivity(Intent(AlarmClock.ACTION_SET_ALARM).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }, 2_800)
            }
            Mood.AVOIDING -> {
                val app = currentApp
                overlay.snatch(Apps.icon(this, app), Apps.label(this, app), reply) {
                    startActivity(TaskActivity.intent(this, "focus15"))
                }
            }
            Mood.LONELY -> {
                overlay.say(reply)
                val d = app.kaak.core.DetourCatalog.byId(if (prefs.friendNumber != null) "call_friend" else "text_someone")
                handler.postDelayed({ d?.let { DetourLauncher.launch(this, it) } }, 1_800)
            }
            Mood.BORED -> {
                overlay.say(reply)
                handler.postDelayed({ startActivity(TaskActivity.intent(this, "stretch1")) }, 1_800)
            }
        }
    }

    /** Sundays: Kaak delivers the paper on the first unlock, if there's a week to write about. */
    private fun checkKaakTimes() {
        if (phase != Phase.KAAK || !prefs.onboarded || prefs.pausedNow) return
        val date = LocalDate.now()
        if (date.dayOfWeek != DayOfWeek.SUNDAY || prefs.lastTimesDay == today()) return
        val week = days.all((0L..6L).map { dayKeyOf(date.minusDays(it)) })
        if (week.size < 2) return
        val app = currentApp
        if (app != null && ProtectedApps.isProtected(this, app)) return
        prefs.lastTimesDay = today()
        lines.lang = prefs.lang
        overlay.timesDelivery()
        handler.postDelayed({
            overlay.showCard(Cards.timesOut(this, lines,
                onRead = { overlay.dismissCard(); openTimes() },
                onLater = { overlay.dismissCard() }))
        }, 4_200)
        log.event("kaak_times")
    }

    private fun openTimes() = startActivity(Intent(this, TimesActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    // ---------------- rules ----------------

    private fun rules(): Rules {
        val now = LocalDateTime.now()
        val minute = now.hour * 60 + now.minute
        val night = now.hour >= 23 || now.hour < 5
        return StudyPlan.adjust(Rules(
            chaos = prefs.chaos,
            dailyLimitMs = prefs.dailyLimitMin * MINUTE_MS,
            bonusMs = wallet.bonusMinutes(dayKeyOf(now.toLocalDate())) * MINUTE_MS,
            bedtime = Bedtime.isBedtime(minute, prefs.bedtimeMinute),
            jumpscareAllowed = prefs.jumpscare != JumpscareLevel.OFF && (prefs.nightJumpscares || !night),
            quiet = System.currentTimeMillis() < wallet.quietUntil,
            work = prefs.workActive(now.dayOfWeek.value, minute),
            trust = TrustLevel.of(wallet.trust),
            arrivalMs = prefs.arrivalMin * MINUTE_MS,
            heckleMs = (prefs.arrivalMin + maxOf(2, prefs.arrivalMin / 2)) * MINUTE_MS,
            gapMs = prefs.gagEverySec * 1000L,
            nudgeMs = (prefs.gagEverySec * 400L).coerceIn(20_000L, 60_000L),
        ), Study.phase(this))
    }

    /** Lets the setup screen preview each performance and card. */
    fun preview(what: String) {
        lines.lang = prefs.lang
        when (what) {
            "steal" -> overlay.steal(Apps.icon(this, "com.instagram.android"), "Instagram", {}, {}, {})
            "eat" -> overlay.eat { overlay.leaveFeed(); showDetourCard() }
            "asleep" -> {
                overlay.showAsleep(
                    Cards.asleep(this, lines, feedback, Apps.icon(this, "com.instagram.android"), "Instagram", 14,
                        pickDetours(), { overlay.hideAsleep() }, { overlay.hideAsleep() }, { overlay.hideAsleep() })
                )
            }
            "detours" -> showDetourCard()
            "worth" -> overlay.showCard(Cards.worthIt(this, lines) { overlay.dismissCard() }, 10_000)
            "toomuch" -> offerTooMuch()
            "morning" -> overlay.morningGift()
            "times" -> {
                overlay.timesDelivery()
                handler.postDelayed({
                    overlay.showCard(Cards.timesOut(this, lines, { overlay.dismissCard(); openTimes() }, { overlay.dismissCard() }))
                }, 4_200)
            }
            "mood" -> overlay.showCard(Cards.mood(this, lines) { m -> overlay.dismissCard(); onMood(m) }, 8_000)
            "work" -> overlay.perform(Action.Arrive, false, prefs.jumpscare, work = true)
            "calm" -> overlay.perform(Action.Arrive, false, prefs.jumpscare, calm = true)
            "nudge" -> overlay.perform(Action.Nudge(17), false, prefs.jumpscare)
            "hide" -> overlay.hideAll()
            else -> {
                val action = when (what) {
                    "arrive" -> Action.Arrive
                    "again" -> Action.Return
                    "walk" -> Action.Heckle(Gag.WALK_ACROSS, 18)
                    "sit" -> Action.Heckle(Gag.SIT_ON_RAIL, 18)
                    "splat" -> Action.Heckle(Gag.SPLAT, 18)
                    "warn" -> Action.Warn(5)
                    "jumpscare" -> Action.Jumpscare
                    "bed" -> Action.Arrive
                    "blanket" -> Action.Heckle(Gag.WALK_ACROSS, 0)
                    else -> Action.None
                }
                val bedtime = what == "bed" || what == "blanket"
                val level = if (prefs.jumpscare == JumpscareLevel.OFF) JumpscareLevel.MEDIUM else prefs.jumpscare
                overlay.perform(action, bedtime, level)
            }
        }
    }

    private fun describe(a: Action) = when (a) {
        is Action.Heckle -> "HECKLE_${a.gag}"
        is Action.Asleep -> "ASLEEP"
        is Action.Warn -> "WARN"
        is Action.Nudge -> "NUDGE"
        Action.Resume -> "RESUME"
        else -> a.toString().uppercase(Locale.US)
    }

    private fun keyboardApp(): String? =
        Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)?.substringBefore('/')

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        if (instance != null) {
            runCatching { log.event("service_off") }
            runCatching { unregisterReceiver(unlockReceiver) }
            runCatching { unregisterReceiver(screenOffReceiver) }
            brain.endSession()
            overlay.hideAll()
            feedback.release()
        }
        instance = null
        super.onDestroy()
    }
}
