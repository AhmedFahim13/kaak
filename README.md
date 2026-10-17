# Kaak — Milestones 1, 2 + 3 (weeks 1–5)

A petty Dhaka crow that interrupts mindless scrolling. This build covers the
**Foundation**, **Core loop** and **Rewards** phases of the v0 plan: everything
needed for the 5-friend pilot.

Zero cost: no libraries, no server, no internet permission, no paid tools.

## What works

**Milestone 1: detection, arrival, heckles**
- Detector reads swipe rate, time between swipes, typing and long single videos.
- Arrival after 10 mindless minutes (default chaos): lands, stares, pecks the glass.
- Heckles from 15 minutes: walk across, sit on the like button, splat you swipe off.

**Milestone 2: the core loop**
- **Theft:** reopen a feed within 2 minutes of leaving and Kaak snatches its icon
  (the real icon from your phone), sends you home and flaps around holding it.
  Tap him 5 times to win it back; ignore him for 15 s and he keeps it. Max once per 5 min.
- **Jumpscare:** once per session after ~20 mindless minutes, at random. Gentle /
  Medium / Full / Off. Never 11 p.m.–5 a.m. unless turned on. A "Too much?" card
  turns jumpscares off and makes Kaak one level gentler with one tap.
- **Daily limit + Eaten:** a 5-minute warning, then Kaak eats the feed in three
  bites, burps, sends you home and shows 3 detours. Only mindless time counts.
- **Asleep screen:** opening any feed during the 20-minute nap shows Kaak asleep on
  the app, with detours, a bribe button and the **escape hatch** (since v0.10 a separate
  screen: hold Kaak 20/40/60/90 s, type a sentence, get a 5-minute pass; see "Harder to quit").
  After the nap you get 10 more minutes before he eats again.
- **Bribes (25):** water, phone-down timers, steps (1k / 3k / 5k / 10k), learning
  app time, calls, notes, breathing, stretching, drawing Kaak, honor tasks and more.
  Real checks where possible: screen-off timers, the step counter, app time.
  Caps: 30 bribe minutes a day, 3 honor bribes a day. Loot and trust always pay.
- **Detours (18):** picked from your own list, 3 at a time, different types, fitted to
  the time of day, not repeated from yesterday. One tap opens the thing.
- **Bedtime mode:** after bedtime Kaak arrives sooner, yawns and lies down; heckles
  become a blanket rising over the feed while the screen dims. No feed after bedtime
  = a morning gift when you unlock (5–11 a.m.).
- **"Was that worth it?"** on the home screen after ~1 in 4 visits of 3+ minutes.
  Answers are logged with the behaviour stats: the labels for week 6.
- **Protected apps:** calls, chats, maps, bKash, Nagad, Rocket, rides. No crow, card
  or chase ever appears over them.
- **Onboarding:** Kaak steals the Next button, then feeds, chaos + jumpscares,
  bedtime + limit, detours (pick apps and a friend to call), protected apps,
  permissions, and a contract you sign that Kaak stamps with a muddy foot.

**Milestone 3: giving back**
- **Kaak's nest:** a rooftop at dusk with every piece of loot drawn in it. Bribes add
  their loot; every 15 minutes Kaak gets you back adds something shiny.
- **Time Kaak got back:** after you leave a feed within 2 minutes of a gag, or after a
  theft or eating, the time until your next feed visit counts (max 30 min each).
- **Trust:** Stranger → Neighbour → Friend → Family. +2 for a day under half your
  limit, +1 under it, −1 for a day he eats the feed or you escape. Never resets.
  Higher trust: rarer gags, earlier warnings; from Friend on, no theft and Kaak sits
  small in the top corner instead of on the feed.
- **Kaak Times:** every Sunday on first unlock Kaak drops off the paper; a tabloid
  of your week (headline chosen from ~10 story angles, 3 stories, weather, a classified).
  Readable any time from the home screen. Written on the phone from templates.
- **Mood check:** after about half of arrivals (max 3 a day), "Why are you scrolling?"
  Bored → a 60-second stretch. Tired → blanket + set an alarm. Avoiding something →
  Kaak takes the feed and opens a 15-minute focus timer. Lonely → call or text someone.
- **Work mode:** chosen days and hours (default Sunday–Thursday 9–5). Typing in the
  last 3 minutes counts as working, the mindless test is 1.5× stricter, no theft,
  no jumpscares, gags half as often, and Kaak wears tiny glasses.
- **Pilot safety net:** crashes and caught errors are written to a private file;
  "Report a problem" shares device info, errors and recent events in one tap.

## Look and feel (v0.4)

**Kaak v2.** A Dhaka house crow nobody else has: a red-and-white **gamcha** scarf
whose tails flap as he moves, a **chipped beak** (cha-stall heist), a grumpy grey
**eyebrow** that does the acting, a permanently half-lidded **judging eye**, a
three-feather tuft, and a white **die-cut sticker outline** so he reads on any
screen. Drawn in code (`overlay/CrowPainter.kt`), so it costs nothing and scales cleanly.

**Motion.** Springy secondary motion on the tuft and scarf, squash and stretch on
every take-off and landing, dust puffs, speed lines when he flies fast, a
head-bobbing strut, and a face for each moment (stare, scowl, grin, surprise, sulk,
sleep). Tap him on the home screen and he takes offence.

**The app.** `ui/Kit.kt` is a small design system built on a few rules:
a clean white canvas; Kaak's gamcha red for the one main action per screen and for
selected options; colour otherwise only in chunky two-tone icons and numbers; 3D
buttons and cards with a same-colour "lip" the face presses into; soft grey borders;
bold rounded type (Nunito, SIL Open Font License, bundled in `assets/fonts`; Bangla
falls back to the system font). Settings live in grouped list cards with toggles,
choices are option pills, onboarding has a progress bar.

## From the second phone test (v0.10.1)

| Seen in the log | Fix |
| --- | --- |
| Counter exact: 10.0 min on the clock = 10.0 counted | Nothing to fix |
| 29 interruptions in 10 min; a nudge and a gag 5 s apart, a nudge and the jumpscare 10 s apart | At least 15 s between any two (warning and eating excepted); no nudge when a gag is due within 15 s |
| Nap cover to back in Instagram in 17 s, including the hold | Hold 20 s first, then 40, 60, 90; a different sentence each escape with today's numbers in it; keyboard-clipboard pastes rejected |
| Kaak's first move after an escape was an ordinary nudge | He lands and says "fine. I'll remember this." |

## Harder to quit (v0.10)

**Going in during a nap.** The nap cover's "Go in anyway…" opens a separate screen: hold Kaak
for 20 seconds the first time that day, then 40, 60, 90; then type a sentence that changes every
time (no suggestions, no pasting). The reward is 5 minutes; then the
nap cover comes back, even mid-scroll. Every escape is logged and costs trust.

**Pause no longer skips a nap.** Pause and timed pause wait until the nap ends.

**Strict mode** (opt-in: until 23:00, 24 hours or 7 days, never longer). While it's on:
- Kaak checks the titles of Settings and uninstall screens for his own name, and backs out
  of them (his Accessibility page, the uninstall dialog), with a card explaining why
- his App info and "Pause app": on Android 14+ App info's title is just "App info" for every app,
  so Kaak watches for a long-press on his icon (or a tap on his name in Settings); a Settings or
  Digital Wellbeing screen opening within 10 s of that, or of the next pick from that long-press
  menu, is his, and he backs out of it. Verified on the Android 17 emulator: home-screen
  long-press → App info and → Pause app are bounced, even after a slow pick.
  Not caught: Settings → Apps → Kaak on stock Android 14+ (those Compose screens send no tap
  events), Settings search, notifications, shortcuts. Known false alarm: long-press Kaak, back
  out, then open Settings from the home screen within 10 s gets bounced once
- pause, removing feeds and raising the daily limit are locked
- leaving early: "Ask to leave strict mode", then wait 15 minutes
- starting, asking to leave and ending are logged (`strict_on`, `strict_leave_asked`,
  `strict_off`), so the study can tell who used it

What it can't do, by Android's design: stop uninstalling from a computer (adb), from safe
mode, or after a factory reset. It turns an impulse into a 15-minute decision, not a prison.
It reads only those screen titles and taps on his own name, only in strict mode, and saves
nothing. Tap events are only switched on while strict mode is on; taps in other apps are
ignored without being read.

## Gaps closed (v0.9)

| Gap | Now |
| --- | --- |
| Feed apps that never report scrolling | After 10 minutes of feed time with no scroll events, Kaak marks the app "silent" and uses screen-content changes as swipes (max one per 1.5 s). One real scroll event undoes it |
| Turning Kaak off went unrecorded | `service_on`, `service_off` and gaps of 3+ minutes (switched off or killed) are logged for the study |
| First theft and first eating confused people | One-time explainer cards the first time Kaak arrives, steals and eats |
| Battery while perched | Idle perch redraws 4 times a second instead of 10 |
| Long speech bubbles ran off screen | Bubbles wrap to the screen width |
| Long settings page | Simple by default; "More settings" holds bedtime, work mode, the stage previews and tester tools |
| No screen-reader support | Toggles read as switches, sliders as adjustable seek bars, pills report selection, decorative views are skipped, Kaak and the nap cover are labelled; the 5-second hold also works as a TalkBack long-press |
| Researcher codes readable from the APK and the repo | New codes, stored only as hashes; removed from BETA.md |

## Deep review fixes (v0.8.1)

| Found | Fix |
| --- | --- |
| Kaak could stay on the lock screen (overlays draw above it) | Screen off removes every overlay; unlocking back into a feed quietly re-perches him (or brings back the nap cover) |
| Locked phone with music playing counted as feed time | No counting while the screen is off |
| A share sheet or permission dialog counted as leaving, so coming back triggered a theft or "again?" | Away under 10 s doesn't count; those system windows are ignored; the nap lock still applies |
| A long video watched on purpose (a lecture) ate the daily limit | One video with no swipe for 3+ min doesn't count toward the limit |
| The jumpscare's rapid random flicker could trigger photosensitive seizures | One smooth dim instead; with "Remove animations" on, no white flash and a gentle shake |
| Samsung, Xiaomi and others kill background services | "Keep Kaak awake" asks Android to exempt him from battery optimisation (onboarding and settings) |
| Pause was all-or-nothing and easy to forget | Timed pause: 30 min, 1 hour, until tomorrow; the status pill shows until when |
| "Bribe Kaak for more time" on the nap screen implied it ends the nap | Now "Earn time for later (bribe)" |
| App icon was still the old crow | Kaak v2 icon: gamcha, tuft, chipped beak, sticker outline |

## Fixes from the first phone test (v0.8)

| Reported | Cause | Fix |
| --- | --- | --- |
| Black eaten screen stuck over the phone; Kaak kept holding Instagram in the corner | Leftovers from an interrupted theft (icon, chase, "busy" flag, eaten cover) survived into the next performance | Every performance clears leftovers first; a watchdog removes Kaak off-feed when he isn't busy, or after 45 s regardless; "send him away" link on the home screen; Pause removes everything at once |
| Theft didn't stop anything: tap the icon and Instagram opened | Theft only bounced once | All feeds stay locked until you win the chase (5 taps); ignore him and they stay locked for 3 minutes. Every attempt is bounced home and the chase restarts |
| Theft only happened after checking Kaak's app | Visiting Kaak's own screens counted as leaving the feed | Kaak's own screens no longer count as leaving |
| Counter ran slow (43.5 min in Instagram, 30 counted) | Reels watched over 12 s counted as "slow browsing" | Daily minutes count all feed time except typing; Reels up to 45 s per swipe count as mindless |
| Too few gags (1 walk, 1 splat, 1 jumpscare in 30 min) | Every "back again" reset the gag timer, and the default gap was 2.5 min | Returns no longer reset it; default gag every 90 s; small nudges (hop, peck, lean in, flap, live minutes) roughly every 35 s in between |
| Wanted more control | Fixed presets only | Sliders: shows up after 1–30 min, acts up every 30 s–5 min, daily limit 5–180 min. Presets move the sliders |

Locked after eating: every feed opens to the asleep screen for 20 minutes (detours, bribe, and the escape screen to get in anyway, which is logged).

## How Kaak checks bribes (v0.6)

No bribe runs on honor any more. Every check is on the phone, and nothing is saved or read:

| Bribe | How Kaak checks it |
| --- | --- |
| Squats or push-ups | Reps counted: motion sensor (phone held to chest) or proximity sensor (phone on the floor under your face) |
| Climb 5 floors | Air pressure: metres actually climbed (steps if the phone has no barometer) |
| 10 min of chores | Time plus movement: 10 minutes and ~250 steps |
| Reply to a message | Typing counted in your chosen chat app, which must be open for a minute. Never the text |
| Water, tidy up, the avoided to-do | Live before/after photos: same place, something changed, enough time apart. Compared on the phone, never saved |
| Walks, phone-down, app time, calls, notes, breathing, stretching, drawing | As before: step counter, screen-off timer, app time, Kaak's own screens |

Photo checks are a speed bump, not proof: Kaak can't tell an empty glass from a full one,
but a live before and after makes lying more work than drinking the water. If a phone
lacks a sensor, "Ask Kaak to trust you" is still there, and it counts toward the
3-a-day honor limit.

## Pilot guide (5 friends, 3 days)

The plan's gate before the baseline week: **3 days, no crashes, under 3% battery a day.**
1. Pick 5 friends on at least 3 phone brands. Send them the APK and this guide's
   "Turning Kaak on" section.
2. Ask them to use their phone normally. No need to test features.
3. Each evening, ask for one screenshot of *Settings → Battery* (Kaak's share) and
   whether anything felt broken or mean.
4. If anything goes wrong, they tap **Report a problem** and send it to you.
5. Day 3: everyone taps **Share my stats**. Check: any `CRASH` lines? Any phone where
   Kaak never appeared (accessibility killed, or the feed sends no scroll events)?
Pass = no crashes, battery under 3%, Kaak appeared for everyone. Then start week 6.

## Beta

See **BETA.md**: release signing, the `full` and `study` editions, the GitHub Actions
workflow that publishes signed APKs, Obtainium for tester updates, and the study protocol.

## Build and install

1. Install [Android Studio](https://developer.android.com/studio) (free), Ladybug or newer.
2. *File → Open* this folder. Let Gradle sync (first sync downloads the Android
   Gradle Plugin and SDK 35; needs internet once).
3. Phone: *Settings → About phone →* tap *Build number* 7 times, then turn on
   *Developer options → USB debugging*. Plug in and press **Run**.
4. To share with testers: *Build → Build App Bundle(s) / APK(s) → Build APK(s)*.
   Send `app/build/outputs/apk/debug/app-debug.apk` (or attach it to a GitHub Release).

Command line works too: `./gradlew assembleFullDebug` and `./gradlew testFullDebugUnitTest`.
Gradle 8.9 needs a JDK between 17 and 22 to run. Newer Android Studio versions bundle JDK 25,
which fails with only the version number as the error. If that happens, set `JAVA_HOME` to a
JDK 21 (for example the one Android Studio downloads to `~/.jdks`).

## Turning Kaak on

1. Open Kaak → **Open Accessibility settings** → *Kaak* → turn on.
2. **Android 13+ sideload block:** if Kaak is greyed out, go to *Settings → Apps →
   Kaak → ⋮ → Allow restricted settings*, then try step 1 again.
3. Some brands (Xiaomi, Oppo, Vivo, Realme) also need *Autostart* allowed and
   battery optimisation off for Kaak, or the service gets killed. Note which
   phones need this during testing.

## Bribe-check checklist

- [ ] Squats with the phone at your chest: the counter goes up once per squat, not when you wiggle the phone.
- [ ] Push-ups with the phone on the floor: one count per dip.
- [ ] Stairs: the metres go up climbing and don't go back down when you walk down.
- [ ] Water: before photo, wait 20 s, after photo of the empty glass → accepted. Same photo twice → refused.
      A photo of a different room → refused.
- [ ] Reply: typing in WhatsApp counts; typing in Instagram doesn't.
- [ ] "Ask Kaak to trust you" works, and stops after 3 a day.

## Week 5 checklist

- [ ] Kaak's nest shows loot after a bribe; leave a feed right after a gag, come back
      later, and "time Kaak got back" goes up.
- [ ] Preview "Friend-level trust": Kaak sits small in the top-left corner.
- [ ] Work mode on for the current hour: glasses, no theft, replying doesn't trigger him.
- [ ] Mood check: each answer does its thing (stretch, alarm, focus timer, call/text).
- [ ] Read Kaak Times from the home screen after 2+ days of use.
- [ ] Report a problem opens the share sheet with device info.

## Week 3–4 dogfooding checklist

- [ ] Onboarding: Kaak steals Next; 5 taps get it back; contract gets stamped.
- [ ] Theft: leave Instagram after Kaak has arrived, reopen within 2 min. Icon stolen,
      you land home, 5 taps win it back. Reopening right away is not stolen again.
- [ ] Set the limit to 30 min and scroll: warning at 25, eaten at 30, detour card on home.
- [ ] Open any feed during the nap: asleep screen. "Go in anyway…" opens the escape screen:
      hold 20 s (40, 60, 90 on later escapes), type the sentence, 5-minute pass, then the
      cover returns. Letting go early or pasting the sentence does not let you in.
- [ ] Every bribe type completes once: phone-down (2 min), 1,000 steps, a lesson in a
      chosen app, a 3-minute call, a note, breathing, stretching, drawing.
- [ ] Bedtime: set it 10 minutes from now. Arrival is sleepy, heckles bring the blanket.
- [ ] Morning gift appears on first unlock if you stayed off feeds after bedtime.
- [ ] Nothing ever appears over WhatsApp, the dialer, bKash or Maps.
- [x] Verify the package names in `data/Apps.kt → ProtectedApps`: bKash, Nagad, Rocket and
      Pathao match their Google Play listings and developers (Oct 2026).

## Week 1–2 dogfooding checklist

- [ ] Every preview button works on your phone.
- [ ] Kaak appears over Instagram, Facebook, YouTube and TikTok, and vanishes
      the moment you go home or open WhatsApp, bKash, Maps or any other app.
- [ ] Reels/Shorts/TikTok scrolling shows `MINDLESS` in the live panel within
      ~1 minute; typing a comment flips it to `NOT_MINDLESS`.
- [ ] Watching one long YouTube video never triggers Kaak.
- [ ] The splat always clears with a swipe and by itself after 10 s.
- [ ] Battery: Kaak under 3% in *Settings → Battery* after a normal day.
- [ ] Try it on 3 phone brands (the plan's gate before the baseline week).

**If scrolling isn't detected in an app:** some apps fire few scroll events.
Check *Swipes/min* in the live panel while scrolling that app. If it stays near
zero, note the app; milestone 2 can add a fallback signal.

**Tuning:** thresholds live in `core/RuleDetector.kt → DetectorConfig`. For quick
testing, pick **Monkey** (arrives after 6 minutes).

## Adding Kaak's caw (free)

Record a real crow on your phone, trim it to under a second in Audacity, export as
`caw.ogg`, and put it at `app/src/main/res/raw/caw.ogg`. It's picked up
automatically on the next build. No code changes.

## Privacy, in code

- `AndroidManifest.xml` has **no INTERNET permission**.
- `res/xml/kaak_accessibility.xml` sets `canRetrieveWindowContent="false"`, so the
  service cannot read screen text, posts or messages, only event types and app names.
- `SessionLog` stores minutes, counts and action names in private app storage.

## Where things are

| Path | What it does |
| --- | --- |
| `core/Week.kt` | Day stats, trust rules, time-returned counting, Kaak Times writer |
| `ui/NestActivity.kt`, `ui/TimesActivity.kt` | The nest and the newspaper |
| `core/` | Pure Kotlin, 96 unit tests: `ScrollTracker`, `RuleDetector`, `KaakBrain` (sessions, escalation, theft, limit, nap, escape pass, spacing), `Bribes`, `Detours`, `Tasks` (checks, bedtime), `Proof`, `Signals`, `Commitment` (escape + strict rules), `StudyPlan`, `Lines` |
| `tasks/TaskCenter.kt` | Runs and verifies the current bribe, pays rewards |
| `overlay/Cards.kt` | Worth-it card, detour card, "too much?", the asleep screen |
| `service/KaakAccessibilityService.kt` | Gets events, ticks the brain every 5 s, sends actions to the overlay |
| `overlay/KaakView.kt` | Animation engine and all performances |
| `overlay/CrowPainter.kt` | Kaak v2 drawn in code: gamcha, chipped beak, eyebrow, sticker outline |
| `overlay/KaakOverlay.kt` | Puts Kaak on top of other apps |
| `ui/OnboardingActivity.kt` | The 8-page onboarding (also edits detours later) |
| `ui/BribeActivity.kt`, `ui/TaskActivity.kt` | Bribe menu and each bribe's screen |
| `ui/MainActivity.kt` | Today, settings, previews of every performance, live detector, stats |
| `data/` | Settings, wallet (minutes, loot, trust), protected apps, the local log |

## Changes from the written plan (all to keep cost and risk at zero)

- **No usage access at all.** Time in learning apps and on calls is measured from the
  same accessibility events Kaak already gets. One fewer permission than planned.
- **No "display over other apps" permission.** Kaak draws with an accessibility
  overlay, which the accessibility service may do on its own. One fewer scary
  permission for testers.
- **Plain Android views and code-drawn Kaak** instead of Compose and Rive for now:
  no dependencies to download or break. Rive art can replace `CrowPainter` later.
- **SharedPreferences** instead of DataStore, for the same reason.

## Next: week 6, the baseline

Recruit 40 students, ship a "silent mode" build (Kaak logs and asks "worth it?" but
never appears), and start the personal model from the labels.
