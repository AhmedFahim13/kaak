# Kaak core: API reference

Plain ES modules, no dependencies, no DOM, no `chrome.*`. Import from a service worker, an extension
page or Node: `import { KaakBrain } from './core/kaak-brain.js'`. Times are epoch ms (`Number`).
`random` everywhere = `{ nextDouble(): number, nextInt?(n): number }` (default: `Math.random`).
Every `toJSON()` result is plain and JSON-safe; pass it to the matching `fromJSON()`.

## model.js

| Export | Signature / shape |
| --- | --- |
| `MINUTE_MS` | `60000` |
| `FOREVER`, `LONG_AGO` | `Number.MAX_SAFE_INTEGER` (Kotlin `Long.MAX_VALUE`), a very old timestamp |
| `defaultRandom`, `randInt(random, n)`, `pickRandom(list, random)`, `shuffled(list, random)` | Kotlin-equivalent random helpers |
| `Chaos` | `.PIGEON/.KAAK/.MONKEY` → `{name, ordinal, label, arrivalMs, heckleMs, gapMs, gentler()}`; `Chaos.entries`, `Chaos.from(entryOrName)` |
| `Gag` | `.WALK_ACROSS/.SIT_ON_RAIL/.SPLAT` |
| `JumpscareLevel` | `.OFF/.GENTLE/.MEDIUM/.FULL` with `label` |
| `TrustLevel` | `.STRANGER/.NEIGHBOUR/.FRIEND/.FAMILY` → `{label, minPoints, gapFactor, warnBeforeMin, steals, jumpscareFactor, next}`; `TrustLevel.of(points)` |
| `Mood` | `.BORED/.TIRED/.AVOIDING/.LONELY` with `label` |
| `Lang` | `.ENGLISH/.BANGLISH/.BANGLA` with `label` |
| `Action` | constants `None, Hide, Arrive, Return, Steal, Jumpscare, Eat, Wake, Resume, Bounce` (`{type}`); constructors `Heckle(gag, minutes)`, `Asleep(minutesLeft)`, `Warn(minutesLeft)`, `Nudge(minutes)`. Switch on `action.type`. |
| `ACTION_TYPES`, `actionEquals(a, b)` | all type names; structural equality |
| `rules(overrides)` (alias `Rules`) | frozen `{chaos, dailyLimitMs=60 min, bonusMs=0, bedtime, jumpscareAllowed=true, quiet, work, trust, arrivalMs=null, heckleMs=null, gapMs=null, nudgeMs=35000}`; copy = `rules({...old, quiet: true})`; chaos/trust may be names |
| `rulesToJSON(r)` | rules with enum names |

## scroll-tracker.js / rule-detector.js

| Export | Signature |
| --- | --- |
| `ScrollStats(swipesInWindow, swipesPerMin, medianDwellMs, msSinceActivity, typedRecently, msSinceTyping=null)` | frozen stats |
| `new ScrollTracker({swipeGapMs=350, windowMs=5 min, typingGraceMs=60000})` | `.start(now)`, `.onScroll(now)`, `.onTyping(now)`, `.reset()`, `.stats(now)`, `.totalSwipes`, `.toJSON()`, `ScrollTracker.fromJSON(o)` |
| `Verdict` | `MINDLESS`, `NOT_MINDLESS`, `UNSURE` (strings) |
| `Detection(verdict, reason)` | reasons: `typing`, `watching one thing`, `not enough scrolling yet`, `fast swipes, short dwell[, late night]`, `slow browsing` |
| `DetectorConfig(overrides)` | `{minSwipesPerMin=1, maxMedianDwellMs=45000, minSwipesForVerdict=3, longWatchMs=3 min, lateNightStartHour=23, lateNightEndHour=5, lateNightLeniency=0.75, typingGraceMs=60000}`, `.forWork()` |
| `new RuleDetector(config?)` | `.isLateNight(hour)`, `.evaluate(stats, hour) → Detection` |

## kaak-brain.js

```js
const brain = new KaakBrain({ rules, config, random, onSessionEnd,
  resetAfterAwayMs: 30 min, maxTickMs: 15000, stealWindowMs: 2 min, stealCooldownMs: 5 min,
  eatCooldownMs: 20 min, graceAfterEatMs: 10 min, jumpscareChancePerTick: 0.08, labelChance: 0.25,
  minSpacingMs: 15000, quickHopMs: 10000 });           // all optional
```

| Member | Use |
| --- | --- |
| `brain.rules` (read/write), `brain.onSessionEnd` (read/write) | refresh rules every tick |
| `onForeground(isFeed, now, hourOfDay=12) → Action` | `true`: a feed tab became the current page (opened, navigated to). `false`: the last feed tab closed or navigated off a feed. |
| `onScroll(now)`, `onTyping(now)` | merged swipe inputs / typing marks from the content script |
| `tick(now, hourOfDay, dayKey) → Snapshot` | every 5 s heartbeat; `Snapshot = {action, detection, stats, activeMs, mindlessMs, dailyMs, inFeed, eatenUntil, lookingAway}` |
| `lookAway(now) → Action.None` | JS-only: feed tab still open but another tab/window is focused, or `chrome.idle` = `locked` |
| `lookBack(now) → Action` | JS-only: feed tab focused again. `Hide` if a 30+ min look-away ended the session with Kaak perched, else `None` |
| `escape(now, passMs=EscapeRules.PASS_MS)` | escape screen finished |
| `chaseWon(now)`, `chaseLost(now, lockMs=3 min)`, `forgiveNextReturn(now)` | theft chase results; Kaak's own page opened from a feed |
| `takeLabel() → LabelContext \| null` | once per visit: ask "Was that worth it?" (`{visitMs, mindlessMs, swipesPerMin, medianDwellMs, verdict, hourOfDay}`) |
| `endSession()` | worker stopping / day end; fires `onSessionEnd(SessionSummary{activeMs, mindlessMs, swipes, actions, arrived})` |
| getters `inFeed, blocked, activeMs, mindlessMs, dailyMs, eatenUntil, escapeUntil, stolenUntil, lookingAway, lookingAwaySince` | read-only state; `stolenUntil === FOREVER` = until the chase is won |
| `toJSON()`, `KaakBrain.fromJSON(obj, {random, onSessionEnd})` | full state snapshot for `chrome.storage.session/local` |

Also exported: `SessionSummary`, `LabelContext`, `Snapshot` (factories).

## lines.js

`new Lines(random?)`, `.lang` (Lang entry or name). Picked (never the same twice in a row):
`arrive() peck() again() walk() sit(m) splat() wiped() steal() hit() chaseWon() chaseLost() warn(m) burp()
holding() letGo() escaped() yawn() morning() bribeAccepted() drawingReview() nudge(m) working() calm()`.
Fixed: `kaa() chomp() asleep(m) snore() worthIt() tooMuch() detoursTitle() moodQuestion() extra() timesOut()`,
`moodLabel(mood) moodReply(mood)`. Generic: `pick(key, minutes?)`, `fixed(key, minutes?)`.
Tables: `LINES`, `FIXED`, `MOOD_LABELS`, `MOOD_REPLIES` (`{en, bl, bn}`, `{m}` = minutes).
`toJSON()`, `Lines.fromJSON(o, random?)`.

## commitment.js

`EscapeRules`: `PASS_MS` (5 min), `TEMPLATES`, `phrase(escapesToday, dayKey, minutes)`,
`holdSeconds(escapesToday)` (20/40/60/90), `MAX_INSERT` (14), `PASTE_INPUT_TYPES`,
`isPaste({inputType, inserted})`, `phraseOk(typed, phrase)`.

`StrictPlan`: `COOL_OFF_MS` (15 min), `MAX_MS` (7 days), `active(now, until, coolOffAt|null)`,
`coolOffLeftMs(now, coolOffAt)`, `coolOffLeftMin(now, coolOffAt)`, `CHOICES` (`until23`, `day`, `week`),
`untilFor(choiceId, nowDate)`, `capUntil(untilMs, now)`.

## week.js

`DayStats({day, mindlessMin, feedOpens, foiled, eaten, escapes, bribes, steps, returnedMin, longestSessionMin, lateMinute=-1, worthYes, worthNo, chasesWon, moodChecks})`.
`Trust.dayDelta(dayStats, limitMin)`, `Trust.lateMinuteOf(minuteOfDay)`.
`new ReturnedTime({windowMs, capMs})`: `onKaakAction(now, endsVisit)`, `onLeaveFeed(now)`, `onEnterFeed(now) → ms`, `flush(now) → ms`, `toJSON/fromJSON`.
`KaakTimes.totals(days)`, `.hours(min)`, `.clock(lateMinute)`, `.compose(thisWeek, lastWeek, weekLabel, random?) → Edition{weekLabel, headline, subhead, stories[{title, body}], weather, classified}`; `Story`, `Edition` factories.

## detours.js

`DetourType`, `DETOUR_TYPE_LABELS`, `Opener` (`LINK, TASK, TIMER, SLEEP`), `Slot`.
`Detour(id, title, type, opener, bribeId, slots, url=null)`.
`DetourCatalog.ALL`, `.DEFAULT_IDS`, `.byId(id)`, `.slotFor(hour)`.
`DetourPicker.pick(chosenIds, hour, bedtime, recentIds, random?, count=3, {feedsLocked, catalog}?) → Detour[]`.

## bribes.js

`Check` (`HONOR, AWAY, EYE_BREAK, SITE_TIME, BREATHING, STRETCH, CANVAS, NOTE, NO_FEED, FOCUS, BEDTIME`), `AMOUNT_UNIT`.
`Bribe(id, title, check, {amount, rewardMin, loot, trust, quietHour, selectable})`.
`BribeCatalog.ALL`, `.byId(id)`, `.selectable`. `STRETCHES`.
`LEARNING_SITES` (`{id, name, url, domains, matches}`), `learningSiteOf(url) → id|null`.
`new BribeLedger({today, minuteCap=30, honorCap=3})`: `claim(bribe, dayKey, honor=check===HONOR, othersToday?) → ClaimResult`,
`minutesLeft(dayKey, othersToday?)`, `honorLeft(dayKey, othersToday?)`, `minutesToday(dayKey)`, `today`, `toJSON/fromJSON`.
`ClaimResult.Granted(minutes, loot, trust, quietHour, capped)` / `.Refused(reason)` (`{type: 'Granted'|'Refused', ...}`).
`LedgerDay(day, minutes, honor)`. `describeClaim(result, lines) → string`.

## tasks.js

`new PhoneDownTimer(targetMs)` / `new AwayTimer(targetMs)`: `onScreenOff/onAway(now)`, `onScreenOn/onBack(now) → done`, `progressMs(now)`, `bestMs`, `done`, `toJSON/fromJSON`.
`new SteadyTimer(targetMs)` (eye break, no feed, focus): `start(now)`, `stop(now)`, `restart(now)`, `progressMs(now)`, `done(now)`, `running`, `bestMs`, `toJSON/fromJSON`.
`new AppTimeGoal(ids, targetMs)` / `new SiteTimeGoal(...)`: `onForeground(id|null, now)`, `pause(now)`, `progressMs(now)`, `done(now)`, `toJSON/fromJSON`.
`dayKeyOf(date) → yyyymmdd`. `Bedtime.WAKE_MINUTE`, `.isBedtime(minuteOfDay, bedtimeMinute)`, `.lastBedtimeStart(nowDate, bedtimeMinute)`, `.morningGift(nowDate, bedtimeMinute, lastGiftDayKeyOrDate, lastFeedUseDate|null, installedAtDate)`.

## proof.js

`countWords(text)`, `noteOk(text, minWords)`, `noteProgress(text, minWords)`,
`new StrokeCounter(onStroke?)`: `down()`, `up() → strokes`, `clear()`, `ok(min)`, `strokes`; `canvasOk(strokes, min)`.

## sites.js

| Export | Signature |
| --- | --- |
| `SITES` | `[{id, name, initial, color, defaultOn, optional, domains, matches, homeUrl}]` for instagram, facebook, tiktok, youtube (on), x, reddit (off) |
| `DEFAULT_SITE_IDS`, `siteById(id)` | |
| `EXCLUSIONS` | `[{siteId, why: 'chat'\|'work'\|'notFeed', kind: 'host'\|'segment'\|'prefix', host, path}]` |
| `matchesFor(siteIds)`, `excludeMatchesFor(siteIds)`, `EXCLUDE_MATCHES` | content-script `matches` / `exclude_matches` |
| `classifyUrl(url, enabledSiteIds?) → {siteId, isFeed, item}` | `item` = Short/Reel/TikTok id (only for "new item" detection) |
| `hostMatches(host, domain)` | domain or subdomain |
| `lockRegexFor(siteIds)`, `allowRegexFor(siteIds)` | `[{siteId, regex}]`, RE2-safe |
| `lockRules({siteIds, redirectPath, ruleIdBase}) → rule[]` | DNR dynamic rules: per-site `redirect` to `${redirectPath}?site=<id>` (priority `LOCK_PRIORITY`=1) + per-exclusion `allow` (priority `ALLOW_PRIORITY`=2), `main_frame` only. Ids `ruleIdBase…ruleIdBase+n-1`. |
