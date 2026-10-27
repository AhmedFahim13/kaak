# Core parity: Kotlin → JavaScript

Matches the Android app **v0.10.x** (`app/src/main/java/app/kaak/core/`, version 0.10.1 / versionCode 13
at the time of porting, 2026-10-26). When a Kotlin core file changes, change its JS twin and its
tests in the same session, then update this table.

Run the tests from the repo root: `node --test extension/core/test/` (Node 25; no npm packages).
`test/parity.test.js` reads the Kotlin sources and fails if `Lines.kt` strings, the Chaos/Trust
numbers, the `DetectorConfig` defaults or the escape sentences drift apart.

Random: Kotlin's `kotlin.random.Random` becomes any object with `nextDouble()` (and optionally
`nextInt(n)`). `test/kotlin-random.js` is a bit-exact port of `Random(seed)` (XorWow, checked against
kotlin-stdlib 2.0.21), and the core calls it in the same order as Kotlin, so the ported tests draw the
same numbers with the same seeds as the Kotlin tests.

| Kotlin file | JS file | Status | Notes |
| --- | --- | --- | --- |
| `Model.kt` | `model.js` | ported | `Chaos`, `Gag`, `JumpscareLevel`, `TrustLevel` (+ `of`, `next`), `Mood`, `Lang` are frozen enum objects (JSON writes the name). `Action` = frozen `{type, ...}` objects. `Rules(...)`/`copy` → `rules({...})`. `Long.MAX_VALUE` → `FOREVER` (`Number.MAX_SAFE_INTEGER`, JSON-safe). |
| `ScrollTracker.kt` | `scroll-tracker.js` | ported | + `toJSON`/`fromJSON`. |
| `RuleDetector.kt` | `rule-detector.js` | ported | `DetectorConfig({...})` with non-enumerable `forWork()`. |
| `KaakBrain.kt` | `kaak-brain.js` | ported + adapted | Same branches and numbers. JS-only: `toJSON()`/`fromJSON()` (all state, including tracker and private fields; MV3 worker restarts) and `lookAway()`/`lookBack()` (desktop: a tab/window switch is looking away, not leaving: no time credited, no `leftAt`, no theft/Return; a look-away over `resetAfterAwayMs` ends the session on `lookBack`, which then returns `Hide` if Kaak had arrived). `onForeground(true)` while looking away = `lookBack`; `onForeground(false)` while looking away = leaving. Snapshot has an extra `lookingAway` field. |
| `Lines.kt` | `lines.js` | ported | All keys, all three languages, same no-repeat rule. Data tables `LINES`/`FIXED`/`MOOD_LABELS`/`MOOD_REPLIES` (`{m}` = minutes) + the same methods. + `toJSON`/`fromJSON` for the no-repeat memory. Strings are unchanged, including phone words in Kaak Times ("CROW MOVES INTO LOCAL PHONE"); desktop rewording is a product call. |
| `Commitment.kt` `EscapeRules` | `commitment.js` | ported + adapted | Same hold times, sentences, `MAX_INSERT`, `phraseOk`. JS-only: `PASTE_INPUT_TYPES`, `isPaste({inputType, inserted})`. |
| `Commitment.kt` `StrictPlan` | `commitment.js` | ported + adapted | `COOL_OFF_MS`, `MAX_MS`, `active`, `coolOffLeftMs`. From `data/Strict.kt` / `MainActivity`: `coolOffLeftMin`, `capUntil`, `CHOICES` + `untilFor` ("Until 23:00", "24 hours", "7 days"). |
| `Commitment.kt` `TAP_ARM_MS`, `SETTINGS_PACKAGES`, `isQuitScreen`, `names`, `KaakTapWatch` | — | skipped | Android Settings/launcher/uninstall guards. A browser extension can't see or block `chrome://extensions`; a switch-off is detected afterwards as a gap (spec section 6). |
| `Week.kt` | `week.js` | ported | `DayStats({...})`, `Trust`, `ReturnedTime` (+ `toJSON`/`fromJSON`), `KaakTimes` (`totals`, `hours`, `clock`, `compose`). `"%,d"` → `toLocaleString('en-US')`. |
| `Detours.kt` | `detours.js` | adapted | Same types, slots and `DetourPicker.pick` rules. `Opener` is desktop: `LINK` (opens `url`; app's `CHOSEN_APP`), `TASK`, `TIMER` (app's `TIMER`/`NAP`/`DIAL_FRIEND`), `SLEEP`. `Detour` carries `url`. Desktop catalog (17 detours; defaults `walk_outside, breathe, plan, stretch, feed_kaak`). JS-only `pick(..., opts)`: `feedsLocked` drops LINK detours that point at a feed (a saved YouTube video during a nap), `catalog` = the user's edited list. |
| `Bribes.kt` | `bribes.js` | adapted | `Bribe`, `BribeLedger` (30 min / 3 honor a day, loot and trust always pay) and `ClaimResult` unchanged. Desktop `Check` set (HONOR, AWAY, EYE_BREAK, SITE_TIME, BREATHING, STRETCH, CANVAS, NOTE, NO_FEED, FOCUS, BEDTIME) and desktop catalog (19 bribes). JS-only: `claim(..., othersToday)` / `minutesLeft(day, othersToday)` so the caps apply to summed totals with sync (spec section 9). `LEARNING_SITES` + `learningSiteOf`. `describeClaim` = `TaskCenter.describe`; `STRETCHES` = TaskActivity's routine. |
| `Tasks.kt` | `tasks.js` | adapted | `PhoneDownTimer` ported (+ `AwayTimer` with `onAway`/`onBack` for `chrome.idle`). `AppTimeGoal` ported (+ `SiteTimeGoal` alias for learning sites). `Bedtime` (`isBedtime`, `lastBedtimeStart`, `morningGift`) and `dayKeyOf` take local `Date`s and compare wall-clock time like `LocalDateTime`; `lastGiftDate` is a dayKey or a Date. JS-only: `SteadyTimer` (eye break, no-feed, focus). |
| `Tasks.kt` `StepGoal` | — | skipped (phone-only) | Android step counter. |
| `Proof.kt` | `proof.js` | partly | The NOTE and CANVAS checks don't live in `Proof.kt` but in the UI (`ui/TaskActivity.kt` `note()`/`canvas()`, `ui/Views.kt` `DrawPad`); ported as `countWords`, `noteOk`, `noteProgress`, `StrokeCounter`, `canvasOk`. `SquatCounter`, `PushupCounter`, `AscentMeter`, `ChoreGoal`, `TypingGoal`, `PhotoCheck` are **phone-only** (accelerometer, proximity, barometer, step counter, chat-app typing, camera) and not ported; with sync, phone bribes land in the same wallet. |
| `Signals.kt` | — | skipped | `SilentApps` works around Android apps that send no accessibility scroll events; page events always arrive in a browser. `Codes` hashes the study's researcher codes; the study is phone-only. |
| `StudyPlan.kt` | — | skipped | No study edition of the extension (spec section 2). |
| — | `sites.js` | new | Feed sites, never-a-feed exclusions, `classifyUrl`, content-script match/exclude patterns, RE2-safe `declarativeNetRequest` lock rules (spec sections 4 and 7.5). |

## Tests

| Kotlin test | JS test | Status |
| --- | --- | --- |
| `CoreTest.kt` (ScrollTracker, RuleDetector, KaakBrain, Lines) | `core.test.js` | 1:1 |
| `FixesTest.kt` FixesTest, ReviewFixesTest, SpacingTest | `fixes.test.js` | 1:1 |
| `FixesTest.kt` CommitmentTest | `fixes.test.js` | holds, sentences, strict timing 1:1; + paste and strict choices. The 5 quit-screen/tap-watch tests skipped (Android-only). |
| `FixesTest.kt` SilentAppsTest | — | skipped (Signals.kt) |
| `Milestone2Test.kt` Theft, Eat, JumpscareAndBedtime, Label, Detour | `milestone2.test.js` | 1:1 (detour ids are the desktop ones: `walk` → `walk_outside`) |
| `Milestone2Test.kt` BribeTest | `milestone2.test.js` | adapted: same assertions on bribes built for the test where the app's bribe has no desktop twin (`steps5k`, `steps10k`); water's "photo proof" → a checked claim |
| `Milestone2Test.kt` TaskCheckTest | `milestone2.test.js` | phone-down 1:1, + AwayTimer; app time via `SiteTimeGoal`; dayKey 1:1; `stepsSurviveAReboot` skipped |
| `Milestone3Test.kt` (Trust, WorkMode, ReturnedTime, KaakTimes) | `milestone3.test.js` | 1:1 |
| `ProofTest.kt` | `bribes.test.js` | sensor tests skipped (phone-only); `noBribeRunsOnHonorAnyMore` adapted: on desktop exactly water/tidy/call/quiet run on honor (spec section 11) |
| `StudyTest.kt` | — | skipped (no study edition) |
| — | `persistence.test.js`, `lookaway.test.js`, `sites.test.js`, `bribes.test.js`, `parity.test.js` | new |

## Known differences

- `TrustLevel.of(negative)` returns STRANGER; Kotlin would throw (trust is clamped at 0, so it doesn't happen).
- The desktop bribe and detour catalogs are new content, not ports. Rewards and loot reuse the app's
  numbers where an equivalent exists (see comments in `bribes.js`); new numbers: `away5` 5 min,
  `away20` 10 min + tea cup (like the app's 15-min meal), `nofeed30` 15 min + coin.
- Chrome match patterns are case-sensitive and may not match a trailing-dot host (`instagram.com.`);
  `classifyUrl` and the lock rules treat both as the same site, so locks can't be bypassed that way,
  but the content script might not run there.
