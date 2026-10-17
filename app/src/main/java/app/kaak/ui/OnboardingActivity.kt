package app.kaak.ui

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.RectF
import android.net.Uri
import android.os.Bundle
import android.provider.ContactsContract
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import app.kaak.core.Chaos
import app.kaak.core.DetourCatalog
import app.kaak.core.DetourType
import app.kaak.core.JumpscareLevel
import app.kaak.core.Lines
import app.kaak.core.Opener
import app.kaak.data.Apps
import app.kaak.data.FeedApps
import app.kaak.data.KaakPrefs
import app.kaak.data.ProtectedApps
import app.kaak.overlay.Feedback
import app.kaak.overlay.KaakView
import app.kaak.service.KaakAccessibilityService

/**
 * Under two minutes, and the joke comes before any question:
 * Kaak steals the Next button, then the setup pages, then the contract.
 * Also reused from settings to edit one page (extra "page", "single").
 */
class OnboardingActivity : Activity() {

    companion object {
        const val PAGE_DETOURS = 4
        private const val REQ_CONTACT = 51
        private const val REQ_ACTIVITY = 52
        private const val LAST = 7

        fun edit(context: Context, page: Int): Intent =
            Intent(context, OnboardingActivity::class.java).putExtra("page", page).putExtra("single", true)
    }

    private lateinit var prefs: KaakPrefs
    private val lines = Lines()
    private lateinit var kaak: KaakView
    private lateinit var scroll: ScrollView
    private lateinit var content: LinearLayout
    private var page = 0
    private var single = false
    private var stolenOnce = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = KaakPrefs(this)
        lines.lang = prefs.lang
        page = intent.getIntExtra("page", 0)
        single = intent.getBooleanExtra("single", false)

        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        scroll = ScrollView(this).apply { addView(content) }
        padForSystemBars(scroll, 22f)
        kaak = KaakView(this, Feedback(this, prefs), lines).apply { lightBubble = true }
        val frame = FrameLayout(this)
        frame.addView(scroll, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        frame.addView(kaak, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(frame)
        show(page)
    }

    override fun onResume() {
        super.onResume()
        if (page == 6) show(6) // permission status may have changed
    }

    private fun show(p: Int) {
        page = p
        content.removeAllViews()
        kaak.clearAll()
        // Kaak's stage only exists on the pages he performs on, so it can never sit over a page you need to scroll.
        kaak.visibility = if (p == 0 || p == LAST) View.VISIBLE else View.GONE
        scroll.scrollTo(0, 0)
        when (p) {
            0 -> welcome()
            1 -> feeds()
            2 -> chaos()
            3 -> limits()
            4 -> detours()
            5 -> protectedApps()
            6 -> permissions()
            else -> contract()
        }
        if (p != 0 && p != LAST) nav()
    }

    private fun nav() {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
        if (single) {
            row.addView(primaryButton("Done") { finish() }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        } else {
            row.addView(button("Back") { show(page - 1) }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(6f) })
            row.addView(primaryButton("Next") { show(page + 1) }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.4f).apply { leftMargin = dp(6f) })
        }
        content.addView(View(this).apply { minimumHeight = dp(16f) })
        content.addView(row, MATCH_WRAP)
    }

    private fun title(t: String, sub: String? = null) {
        content.addView(ChunkyBar(this).apply { color = Kit.RED; value = (page + 1f) / (LAST + 1) }, MATCH_WRAP.apply { bottomMargin = dp(18f) })
        content.addView(text(t, 30f, bold = true))
        sub?.let { content.addView(text(it, 15f, quiet = true)) }
        content.addView(View(this).apply { minimumHeight = dp(8f) })
    }

    // 0 ---------------------------------------------------------------
    private fun welcome() {
        content.addView(View(this).apply { minimumHeight = dp(60f) })
        content.addView(text("Hi.\nI'm Kaak.", 52f, bold = true))
        content.addView(text("I live in your phone now. I'll bother you when you scroll without thinking, " +
            "and leave you alone when you don't.", 17f))
        val hint = text("", 15f, bold = true)
        content.addView(View(this).apply { minimumHeight = dp(120f) })
        val next = primaryButton("Next") { show(1) }
        content.addView(next, MATCH_WRAP)
        content.addView(hint)
        if (stolenOnce) return
        next.postDelayed({
            if (page != 0) return@postDelayed
            val r = rectOf(next)
            kaak.stealButton(r, "Next",
                onGrabbed = { next.visibility = View.INVISIBLE; hint.text = "Tap Kaak 5 times to get it back." },
                onWon = {
                    stolenOnce = true
                    next.visibility = View.VISIBLE
                    hint.text = "Now you know how this works."
                })
        }, 1200)
    }

    private fun rectOf(v: View): RectF {
        val a = IntArray(2).also { v.getLocationInWindow(it) }
        val b = IntArray(2).also { kaak.getLocationInWindow(it) }
        val x = (a[0] - b[0]).toFloat()
        val y = (a[1] - b[1]).toFloat()
        return RectF(x, y, x + v.width, y + v.height)
    }

    // 1 ---------------------------------------------------------------
    private fun feeds() {
        title("Which feeds should I watch?", "I only ever show up inside these.")
        val watched = prefs.feedApps.toMutableSet()
        FeedApps.ALL.forEach { (pkg, name) ->
            content.addView(check(name, pkg in watched) { on ->
                if (on) watched += pkg else watched -= pkg
                prefs.feedApps = watched
            })
        }
    }

    // 2 ---------------------------------------------------------------
    private fun chaos() {
        title("How mean should I be?", "You can change this any time.")
        content.addView(radios(Chaos.entries.map { "${it.label}: shows up after ${it.arrivalMs / 60_000} min of mindless scrolling" },
            Chaos.entries.indexOf(prefs.chaos)) { prefs.applyChaos(Chaos.entries[it]) })
        content.addView(text("Jumpscares", 18f, bold = true))
        content.addView(radios(JumpscareLevel.entries.map { it.label }, JumpscareLevel.entries.indexOf(prefs.jumpscare)) {
            prefs.jumpscare = JumpscareLevel.entries[it]
        })
        content.addView(text("Never after 11 p.m. unless you turn that on in settings.", 13f, quiet = true))
    }

    // 3 ---------------------------------------------------------------
    private val bedtimes = listOf(22 * 60, 22 * 60 + 30, 23 * 60, 23 * 60 + 30, 0, 30, 60)

    private fun limits() {
        title("Bedtime and your daily limit")
        content.addView(text("After bedtime I get sleepy. So should you.", 15f, bold = true))
        content.addView(radios(bedtimes.map { hhmm(it) }, bedtimes.indexOf(prefs.bedtimeMinute).coerceAtLeast(0)) {
            prefs.bedtimeMinute = bedtimes[it]
        })
        content.addView(text("At this much feed a day, I eat every feed and nap on them for 20 minutes.", 15f, bold = true))
        content.addView(KaakSlider(this, "Daily limit", 5, 180, 5, prefs.dailyLimitMin, { "$it min" }) { prefs.dailyLimitMin = it })
        content.addView(text("Only mindless scrolling counts. Messaging and searching don't.", 13f, quiet = true))
        content.addView(text("Do you sell or post for work?", 15f, bold = true))
        content.addView(check("Yes: work mode, Sunday to Thursday, 9 to 5", prefs.workMode) { prefs.workMode = it })
        content.addView(text("During work hours I ignore inboxes and posting, never steal, and wear tiny glasses. " +
            "Change days and hours in settings.", 13f, quiet = true))
    }

    // 4 ---------------------------------------------------------------
    private var pendingContactBox: ToggleRow? = null

    private fun detours() {
        title("Pick your detours", "3 to 5 things I'll push you toward when I eat a feed. I only ever suggest these.")
        val chosen = prefs.detourIds.toMutableSet()
        val counter = text("", 13f, quiet = true)
        fun count() { counter.text = "${chosen.size} picked" }
        DetourType.entries.forEach { type ->
            content.addView(text(type.label, 17f, bold = true))
            DetourCatalog.ALL.filter { it.type == type }.forEach { d ->
                val label = d.title + when {
                    d.opener == Opener.CHOSEN_APP && prefs.appFor(d.id) != null -> "  (${Apps.label(this, prefs.appFor(d.id))})"
                    d.id == "call_friend" && prefs.friendName != null -> "  (${prefs.friendName})"
                    else -> ""
                }
                lateinit var box: ToggleRow
                box = check(label, d.id in chosen) { on ->
                    if (on) chosen += d.id else chosen -= d.id
                    prefs.detourIds = chosen
                    count()
                    if (on && d.opener == Opener.CHOSEN_APP && prefs.appFor(d.id) == null) pickApp(d.id, box)
                    if (on && d.id == "call_friend" && prefs.friendNumber == null) pickContact(box)
                }
                content.addView(box)
            }
        }
        count()
        content.addView(counter)
    }

    private fun pickApp(key: String, box: ToggleRow) {
        val apps = Apps.launchable(this)
        AlertDialog.Builder(this)
            .setTitle("Which app for this?")
            .setItems(apps.map { it.label }.toTypedArray()) { _, i ->
                prefs.setAppFor(key, apps[i].pkg)
                box.text = box.text.toString().substringBefore("  (") + "  (${apps[i].label})"
            }
            .show()
    }

    @Suppress("DEPRECATION")
    private fun pickContact(box: ToggleRow) {
        pendingContactBox = box
        runCatching {
            startActivityForResult(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI), REQ_CONTACT)
        }
    }

    @Deprecated("Framework Activity result API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_CONTACT || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        runCatching {
            contentResolver.query(uri, arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            ), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    prefs.friendName = c.getString(0)
                    prefs.friendNumber = c.getString(1)
                    pendingContactBox?.text = "Call the friend you chose  (${c.getString(0)})"
                }
            }
        }
    }

    // 5 ---------------------------------------------------------------
    private fun protectedApps() {
        title("Apps I never touch", "Calls, chats, maps, money and rides. No crow, no card, no chase, ever.")
        content.addView(text(ProtectedApps.PRESET.values.distinct().joinToString("\n") { "· $it" }, 15f))
        content.addView(text("Plus your default phone app. And honestly, I only show up in the feeds you picked anyway.", 13f, quiet = true))
    }

    // 6 ---------------------------------------------------------------
    private fun permissions() {
        title("Let me in", "One calm screen, because this part matters.")
        val on = accessibilityOn()
        content.addView(text(if (on) "Accessibility: ON" else "Accessibility: off", 17f, bold = true).apply {
            setTextColor(if (on) 0xFF2E7D32.toInt() else 0xFFC62828.toInt())
        })
        content.addView(text("I use an Accessibility service to see which app is open, that you scrolled, and that you typed. " +
            "I never read what's on your screen, your posts or your messages. " +
            "I have no internet permission, so nothing can leave your phone.", 15f))
        content.addView(button("Open Accessibility settings") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) })
        content.addView(text("Greyed out? Android blocks sideloaded apps by default: open my app info, tap ⋮ (top right), " +
            "choose \"Allow restricted settings\", then try again.", 13f, quiet = true))
        content.addView(button("Open Kaak's app info") {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        })
        val awake = getSystemService(android.os.PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true
        content.addView(text(if (awake) "Stay awake: ON" else "Stay awake: off (your phone may put me to sleep)", 17f, bold = true))
        if (!awake) content.addView(button("Let me stay awake") {
            runCatching {
                @android.annotation.SuppressLint("BatteryLife")
                val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
                startActivity(i)
            }
        })
        val steps = checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
        content.addView(text(if (steps) "Physical activity: ON" else "Physical activity: off (for step bribes)", 17f, bold = true))
        if (!steps) content.addView(button("Allow step counting") {
            requestPermissions(arrayOf(Manifest.permission.ACTIVITY_RECOGNITION), REQ_ACTIVITY)
        })
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == REQ_ACTIVITY) show(6)
    }

    private fun accessibilityOn(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, KaakAccessibilityService::class.java)
        return enabled.split(':').any { it.equals(me.flattenToString(), true) || it.equals(me.flattenToShortString(), true) }
    }

    // 7 ---------------------------------------------------------------
    private fun contract() {
        title("The contract")
        val apps = prefs.feedApps.mapNotNull { FeedApps.ALL[it] }.distinct().joinToString(", ")
        val clauses = listOf(
            "Kaak watches: $apps.",
            "Kaak shows up after ${prefs.arrivalMin} minutes of mindless scrolling.",
            "At ${prefs.dailyLimitMin} minutes of feed a day, Kaak eats it and naps for 20 minutes.",
            "After ${hhmm(prefs.bedtimeMinute)}, Kaak gets sleepy, and so should you.",
            "Kaak never reads your screen, and nothing leaves this phone.",
            "Holding Kaak for 5 seconds always lets you in. He will judge you.",
            "You can pause or uninstall Kaak any time. He'll be sad. Briefly.",
        )
        clauses.forEachIndexed { i, c -> content.addView(text("Clause ${i + 1}. $c", 15f)) }
        content.addView(View(this).apply { minimumHeight = dp(12f) })
        lateinit var finish: TextView
        lateinit var pad: SignaturePad
        pad = SignaturePad(this) {
            pad.post {
                val r = rectOf(pad)
                kaak.stamp(r.right - dp(70f), r.bottom - dp(34f)) { finish.isEnabled = true }
            }
        }
        content.addView(pad, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(150f)))
        finish = primaryButton("Start") {
            prefs.onboarded = true
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }.apply { isEnabled = false }
        content.addView(finish, MATCH_WRAP)
        content.addView(text("Sign to start. Kaak stamps it.", 13f, quiet = true).apply { gravity = Gravity.CENTER })
        if (!single) content.addView(button("Back") { show(page - 1) })
    }
}
