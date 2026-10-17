# Kaak

Free Android app (Kotlin, no runtime libraries) where a petty Dhaka house crow, Kaak,
interrupts mindless scrolling in Instagram, Facebook, YouTube and TikTok. Built by Theos Lab
(tester email: theoslab.dev@gmail.com). Current version: **0.10.1** (versionCode 13).

## Non-negotiables

- **Zero cost.** No paid services, no server, no runtime dependencies (only `junit` for tests).
- **No `INTERNET` permission.** Nothing leaves the phone except what the user shares by hand.
- **Privacy.** The accessibility service has `canRetrieveWindowContent="false"`: it sees which app
  is in front, scroll events, and text-change *counts*, never content. Only exception: in opt-in
  strict mode it checks the *event text* of Settings/package-installer windows, and of taps in
  Settings and the launcher, for the word "Kaak". Tap events are subscribed only while strict mode
  is on (`syncStrict`); taps in other apps are dropped by package before any text is read.
  Nothing is logged from it. Keep the `a11y_description` string honest if this ever changes.
- **Never commit secrets:** `keystore.properties`, `*.jks`, passwords, or the plaintext researcher
  codes. The app stores only SHA-256 hashes of the codes (`core/StudyPlan.kt`).
- **Always escapable.** Friction is fine; traps are not. Protected apps (chats, calls, maps, money
  apps) are never touched. Jumpscare must stay photosensitivity-safe (no flashing faster than 3/s).

## Build and test

```bash
./gradlew testFullDebugUnitTest      # 96 unit tests on core/ (pure Kotlin, JVM)
./gradlew assembleFullDebug          # normal app
./gradlew assembleStudyRelease       # study edition, signed if keystore.properties exists
```

- Two flavors: `full` (app id `app.kaak`) and `study` (`app.kaak.study`, `BuildConfig.STUDY = true`).
- Release signing reads `keystore.properties` locally or `KAAK_*` env vars in CI
  (`.github/workflows/release.yml`, triggered by tags `v*`; never run yet).
- Gradle 8.9 needs JDK 17–22. On this PC `JAVA_HOME` is unset and Android Studio's bundled JBR
  is JDK 25 (fails with just "25.0.3"); use `C:\Users\hp\.jdks\jbr-21.0.11`.
- Real-device testing has been two sessions on a Samsung Galaxy M33. There is also an emulator
  (`Medium_Phone_API_37.0`, Android 17): install with `adb install -r -d`, enable the service with
  `adb shell settings put secure enabled_accessibility_services app.kaak/app.kaak.service.KaakAccessibilityService`.
  Prefer adding a core/ unit test for any logic change.

## Architecture (`app/src/main/java/app/kaak/`)

| Path | Role |
| --- | --- |
| `core/` | Pure logic, fully unit-tested: `KaakBrain` (sessions, escalation, theft, eating, nap, escape pass, spacing), `RuleDetector`/`ScrollTracker`, `Bribes`, `Detours`, `Proof` (rep/stairs/photo checks), `Signals` (silent apps, code hashing), `Commitment` (escape + strict rules), `StudyPlan`, `Lines` (all subtitles, EN/Banglish/Bangla), `Week` |
| `service/KaakAccessibilityService.kt` | Events → brain → `act()`; ticks every 5 s; theft, eating, tips, strict guard, study phases |
| `overlay/` | `KaakView` (animation engine), `CrowPainter` (Kaak v2 drawn from SVG paths), `KaakOverlay` (windows), `Cards`, `Feedback` |
| `tasks/TaskCenter.kt` | Runs and verifies the bribe in progress |
| `ui/` | `Kit.kt` design system (white, red `#EF4B3F`, 3D lip buttons, Nunito), screens incl. `EscapeActivity`, `StudyActivity` |
| `data/` | Prefs, wallet, day stats, session log (JSONL, shared via "Share my stats"), crash log, `Study`, `Strict` |

## Behaviour that was tuned on real phones (don't regress)

- Daily limit counts **all feed time** except typing and one long video with no swipe for 3+ min.
  Reels with 15–45 s dwell must count as mindless (`DetectorConfig`).
- Interruptions at least **15 s apart** (warning and eating excepted); no nudge when a gag is due
  within 15 s; a "back again" never resets the gag timer.
- Theft locks **every** feed until the 5-tap chase is won; ignoring it locks feeds for 3 min.
- Away < 10 s (share sheet, permission dialog) is not leaving. Screen off: hide all overlays, stop
  counting, re-perch quietly on unlock. Kaak's own screens don't count as leaving a feed.
- Every performance clears leftovers first (`resetTransient`); a watchdog removes off-feed Kaak.
- Eating → 20-min nap cover. Escape = separate screen: hold 20/40/60/90 s (by escapes today),
  type a rotating sentence (paste rejected), get a 5-min pass, then the cover returns.
  Pause cannot skip a nap.
- Strict mode (opt-in, max 7 days): bounces Kaak's own Accessibility page and uninstall dialog
  (verified on the Android 17 emulator); locks pause, feed removal and limit increases; leaving
  early = ask + 15-min wait. App info's event text is just "App info" for every app on Android 14+
  (and Force stop's dialog sends empty text), so `KaakTapWatch` catches it instead: a tap on
  "Kaak" in Settings/launcher (later launcher taps, i.e. the long-press menu pick, refresh it),
  then a Settings/Digital Wellbeing window within 10 s. Strict use is logged
  (`strict_on`, `strict_leave_asked`, `strict_off`) because it is visible in both editions.

## Known open items

1. Strict mode verified on the Android 17 emulator only (uninstall dialog, Accessibility page,
   launcher long-press → App info / Pause app). Still gets through: Settings → Apps → Kaak on stock
   14+ (SPA/Compose screens send no TYPE_VIEW_CLICKED), Settings search, notifications. Testing
   tip: `uiautomator dump` between the long-press and the pick disarms the watch. Samsung
   (`com.samsung.accessibility`) and MIUI (`com.miui.securitycenter`) packages were added from
   research; Samsung/Vivo/Oppo/Xiaomi screens are still untested on real phones.
2. Play Protect blocks sideloaded installs (Accessibility apps). Workaround: testers temporarily
   turn off "Scan apps with Play Protect". Obtainium installs may avoid it (untested).
3. Rep thresholds tuned on simulated motion only. Battery use unmeasured.
4. 5-friend pilot and 40-person study not started. GitHub release workflow never run (the folder
   isn't a git repo yet); its Gradle command passes locally with debug-key fallback.
5. Possible next: browser extension (reuse the JS engine in `docs/kaak-animation-board.html`).

## Other files

- `README.md`: version-by-version changelog and checklists. `BETA.md`: release and study protocol.
- `docs/`: animation board (all performances in HTML/JS), mail-merge script and tester list.
