# Kaak for the browser: design spec

Status: **M0–M4 built** in `extension/` (2026-10-26; see `extension/README.md`). Sync (M5) is not
built. Nothing in `app/` changes because of this document until the sync milestone (see M5).

## 1. Intent

Kaak is the petty Dhaka house crow who interrupts mindless scrolling on Android. People also
doomscroll on laptops and desktops: Instagram, Facebook, TikTok and YouTube Shorts in a browser tab.
This is **the same system as the phone app, made for computers**: the same detector, the same
escalation, the same theft, eating, nap and escape, the same trust, nest and Kaak Times, the same
three languages, and (later, opt-in) **live sync with the phone** so Kaak is one crow across devices.

Kaak does not care what you do instead. Sleeping, learning a skill, a long video on purpose, a chat:
anything beats doomscrolling. He reacts only to fast, short-dwell feed scrolling, exactly as the app
does, and stays out of the way of everything deliberate.

## 2. Goals, non-goals, anti-goals

**Goals**
- Feature parity with the Android app (v0.10.x), adapted where a browser forces it (section 6).
- One extension build for Chromium browsers: Chrome, Edge, Brave, Opera, Vivaldi (Windows first;
  macOS/Linux come free with Chromium but are untested).
- Manifest V3.
- Detection that mirrors `core/ScrollTracker.kt` + `core/RuleDetector.kt` with the same
  `DetectorConfig` thresholds.
- Kaak drawn by the engine already written in `docs/kaak-animation-board.html`.
- Desktop-specific bribes that a computer can actually check.
- Opt-in, end-to-end encrypted, live sync between the phone app and up to 3 browser installs
  (4 devices per group).

**Non-goals**
- Firefox and Safari. Safari needs Xcode on a Mac plus a $99/year Apple account (breaks zero cost).
  Firefox speaks MV3 too and could be added later with small manifest changes; not now.
- The Windows/Mac desktop apps for Instagram, Facebook, TikTok. A browser extension cannot see
  outside the browser. Catching those needs a separate desktop program: a possible later project.
- Mobile browsers with extension support (Edge for Android etc.). The Android app covers phones.
- A study edition of the extension. The 40-person study is phone-only.
- Reading what is on the page (posts, captions, names, messages) for any reason.

**Anti-goals (it "works" but it failed)**
- Any network request outside opt-in sync, including analytics, crash reporting, fonts from a CDN or
  remote code.
- A trap: a stuck redirect, a cover that can't be closed, a lock that survives its own end time.
  Friction is fine; traps are not.
- Kaak on any site that isn't a feed, or touching chats, banking, maps, work tools.
- Flashing faster than 3 times a second.
- Asking for a permission broader than the feature needs ("read all your browsing").
- The extension and the app drifting apart in behaviour without anyone noticing.

## 3. Rules (the app's non-negotiables, translated)

| App rule | Extension rule |
| --- | --- |
| Zero cost | No paid services. Edge Add-ons, Opera add-ons: free. Chrome Web Store's one-time $5 fee is **not paid** (decided 2026-10-26): Chrome, Brave and Vivaldi users load Kaak from a GitHub release zip in developer mode. Sync relay on a free tier. |
| No `INTERNET` permission | The extension makes **no network requests**. Exception: opt-in sync, which talks only to the sync relay, using a host permission requested at pairing time. **Changed for sync (approved 2026-10-26):** the phone app's `full` edition gets the `INTERNET` permission for sync only; the `study` edition does not (section 9). |
| Privacy (`canRetrieveWindowContent="false"`) | Content scripts read **event timing and kind only**: that a wheel/scroll/swipe happened, whether a key was a scrolling key or a typing key, the URL path shape of the current feed tab. Never page text, titles, images, names, DOM content. Nothing about the page is stored. See section 10. |
| Never commit secrets | Same. Plus: never commit the store upload keys/tokens or the relay's admin credentials. |
| Always escapable | Pause (except during a nap), the escape screen, and switching the extension off in the browser, which Kaak cannot and must not prevent. Every lock has an end time and heals itself (section 7.6). Only feed sites are ever touched. |
| Photosensitivity-safe jumpscare | Same engine, same rule: one smooth dim, at most one white fade per jumpscare, nothing above 3 flashes/s, `prefers-reduced-motion` and Kaak's "Remove animations" respected. |

Publisher name in store listings and the manifest `author`: **Fahim Ahmed** (GitHub `AhmedFahim13`).
Not "Theos Lab", which is only a Facebook promo page. Support/tester email stays
theoslab.dev@gmail.com.

## 4. Sites

| Feed | Matches | Default |
| --- | --- | --- |
| Instagram | `*://*.instagram.com/*` | on |
| Facebook | `*://*.facebook.com/*` | on |
| TikTok | `*://*.tiktok.com/*` | on |
| YouTube | `*://*.youtube.com/*` (whole site; long videos are protected by the long-watch rule, as in the app) | on |
| X | `*://*.x.com/*`, `*://*.twitter.com/*` | off, optional |
| Reddit | `*://*.reddit.com/*` | off, optional |

Optional feeds use `optional_host_permissions`; switching one on asks the browser for that one site
and registers the content script with `chrome.scripting.registerContentScripts`. Removing a feed works
like the app (locked in strict mode).

**Never feeds, even on these domains** (the app's protected apps, translated). These paths are left
out of the content script's `exclude_matches`, never count toward any limit, and are excluded from the
redirect rules, so they stay reachable during a nap or theft lock:

| Kind | Paths |
| --- | --- |
| Chats | `facebook.com/messages/*`, `instagram.com/direct/*`, `tiktok.com/messages*`, `x.com/messages/*`, `reddit.com/chat*` (and `messenger.com`, which isn't matched at all) |
| Work tools | `business.facebook.com`, `adsmanager.facebook.com`, `studio.youtube.com`, `instagram.com/accounts/*` (settings, login) |
| Not a feed | `music.youtube.com` |

Marketplace, groups and the rest of Facebook stay feeds, as they are inside the Facebook app on the
phone. Redirect rules therefore use `regexFilter` conditions with these exclusions, not a plain domain
match. The builder keeps this list in one place (`core/sites.js`), shared by the content script
registration, the rules and the brain.

Other sites need nothing to configure: the extension has no access to them.

## 5. Detection

### 5.1 What counts as a swipe

The app merges accessibility scroll events closer than 350 ms into one swipe. In a page, the content
script listens (passive, capture phase, on `window`) for:

- `wheel` (mouse wheel and trackpad, including trackpad inertia),
- `scroll` on any element (catches inner scroll containers like Reels/Shorts players),
- `keydown` of scrolling keys: ArrowDown/Up, PageDown/Up, Space (outside text fields), `j`/`k`
  (YouTube, X, Reddit shortcuts), Home/End,
- `touchmove` (touchscreen laptops),
- a change of the feed item in the URL (`/shorts/<id>`, `/reels/<id>`, `/reel/<id>`, TikTok
  `/video/<id>`), detected with the Navigation API or a 1 s `location.href` check.

All of these feed one merger: inputs closer than **350 ms** = one swipe (`swipeGapMs`). A URL item
change within **1 s** after a swipe is the same swipe (sites update the URL late). Only the count and
timestamps leave the merger; the URL itself is not stored or sent anywhere.

**Tuning risk, called out:** a mouse wheel moves in notches. Slowly reading a Facebook feed one notch
every 2–3 s could look like fast swiping. The thresholds stay exactly `DetectorConfig`'s; if the live
detector panel shows wheel-reading as `MINDLESS`, the fix goes in the *swipe definition* (for example
"a swipe = a burst, or at least ~60% of the viewport height scrolled"), not in the thresholds. Tune in
week-1 dogfooding the way the app was tuned.

### 5.2 Typing

`keydown`/`input` inside `input`, `textarea` or `contenteditable` counts as typing (comment box,
search, DMs on the web). Only "typing happened at time T" is kept: never the key, never the text. Same
`typingGraceMs` (60 s, 3 min in work mode).

### 5.3 When time counts

A feed tab counts only while it is **visible and its window is focused** (`visibilitychange`, `focus`,
`blur`, `document.hasFocus()`). Two feed tabs side by side: only the focused one counts. A background
tab playing audio does not count.

| App behaviour | Browser equivalent |
| --- | --- |
| Feed app in front | Feed tab visible + window focused |
| Leaving the feed app (sets up theft and "back again") | **Closing the feed tab or navigating off the feed** (decided 2026-10-26). Switching to another tab or window is *looking away*: the clock pauses, Kaak waits where he is, no theft, no "back again". Looking away for 30+ min ends the session, like the app's `resetAfterAwayMs` |
| Away < 10 s is not leaving | Closing a feed tab and opening one again within 10 s is not leaving (e.g. a misclick) |
| Kaak's own screens don't count as leaving | Kaak's pages and popup don't count as leaving |
| Screen off: hide overlays, stop counting | `chrome.idle` state `locked`: stop counting, hide overlays; on `active`, re-perch quietly |
| Long video, no swipe 3+ min | Same rule (`longWatchMs`) |
| Ticks every 5 s | The visible feed tab sends a 5 s heartbeat; the brain ticks on it |

### 5.4 The brain

`ScrollTracker`, `RuleDetector`, `DetectorConfig` and `KaakBrain` are ported to JavaScript as
faithfully as possible: same names, same numbers, same branches. One tracker and one brain for the
whole browser profile (switching between two Instagram tabs is one session), living in the service
worker. Chaos presets, sliders, trust factors, late-night leniency, work mode, spacing rules
(15 s between interruptions, no nudge when a gag is due within 15 s, "back again" never resets the gag
timer) all come across unchanged.

## 6. Performances and features

Everything in the app, with how it lands in a browser. "Board" = `docs/kaak-animation-board.html`.

| App feature | In the browser |
| --- | --- |
| Arrival, peck, "back again", nudges | As is, over the feed tab |
| Heckles: walk across, sit on the like button, splat | As is. "Like button" is a fixed rail spot (the app doesn't know where the button is either). Splat clears with a mouse drag, and by itself after 10 s |
| Jumpscare (Gentle/Medium/Full/Off, "Too much?" card) | As is. If the page is fullscreen, Kaak calls `document.exitFullscreen()` first so he is visible |
| Theft and chase | Kaak grabs a **site tile** (the site's initial on its brand colour, like the board's "F" tile; no favicon or title read), the tab goes to Kaak's page, he flaps around holding it, **5 clicks** win it back and send you to that site's home page (section 7.5). Ignore him 15 s and he keeps it: **every feed tab and feed site is locked for 3 min**. Max once per 5 min. Same 2-minute window, counted from *closing or navigating off* the last feed tab (section 5.3), never from a tab switch |
| Daily limit, 5-minute warning, eaten in three bites, burp | As is. "Sends you home" = the tab goes to Kaak's page with 3 detours |
| Nap cover (20 min) | Feed sites redirect to Kaak's page, Kaak asleep on the site tile, with detours, "Earn time for later (bribe)" and "Go in anyway…" |
| Escape screen | Separate Kaak page: hold Kaak (mouse button or Space) 20/40/60/90 s by escapes today, type a rotating sentence (paste rejected: `paste`/`drop` blocked, `insertFromPaste` input rejected), get a 5-min pass, then the cover returns, even mid-scroll. Logged, costs trust |
| Pause / timed pause | Toolbar popup. Cannot skip a nap |
| Bedtime mode, blanket, dim | As is over feed tabs |
| Morning gift | First sign of use between 5 and 11 a.m. after a feed-free night (an `idle` → `active` change, *or* `runtime.onStartup`/service worker start, since a computer shut down overnight starts already `active`): a badge on the toolbar icon, and the gift scene on Kaak's page/popup. Kaak never opens a tab by himself |
| Kaak Times (Sunday) | Same templates; badge + read on Kaak's page |
| Mood check | As is, after about half of arrivals, max 3 a day. "Avoiding something" opens the focus timer on Kaak's page |
| "Was that worth it?" | The app asks on the home screen after a visit. A browser can't show anything on non-feed pages, so: asked at the start of the next feed visit if it is within 2 hours of a 3+ min visit (~1 in 4), otherwise dropped |
| Trust, nest, loot, time Kaak got back | As is |
| Detours | User's list of links (learning sites, a game, a playlist) and offline ideas; 3 at a time, same picking rules (`core/Detours.kt`). One click opens the link in the tab |
| Work mode | As is (stricter test, no theft, no jumpscares, glasses). Typing only counts inside feed tabs |
| Strict mode | Locks pause, feed removal and limit increases; leaving early = ask + 15-min wait; max 7 days. **Cannot** stop the extension being switched off or removed: browsers don't let extensions touch `chrome://extensions`. A switch-off is detected afterwards as a gap (like the app's `service_off` gap logging) and costs trust. Chrome's per-extension "Site access" setting can also withdraw access to the feed sites while the worker keeps running (no gap); that is caught with `chrome.permissions.onRemoved` plus a `permissions.contains` check on start, logged, and treated the same. The strict-mode screen says this plainly |
| Onboarding (steals Next, contract stamp) | As is on Kaak's welcome page, opened once on install. Adds two browser steps: pin Kaak to the toolbar, and (optional) allow in Incognito |
| Live detector panel, previews | Settings → More settings, like the app |
| Session log, "Share my stats", "Report a problem" | Same JSONL in local storage. Share = download a file (`<a download>`, no permission). Report = copy to clipboard + `mailto:` link |
| Languages | English, Banglish, Bangla: a full port of `core/Lines.kt` (the board only has a subset) |
| Caw sound | Optional `caw.ogg` asset, same as the app |

Incognito: extensions are off there unless the user allows them. Kaak asks once during onboarding and
does not nag. Scrolling in Incognito without allowing it is a real way around Kaak, and that's fine.

## 7. Architecture

### 7.1 Pieces

```
extension/
  manifest.json
  core/        port of app/src/main/java/app/kaak/core (pure JS, no DOM, no chrome.*)
  core/test/   port of the core unit tests, run with `node --test` (Node is a dev tool, not shipped)
  engine/      Kaak's drawing + animation, extracted from the board
  sw/          service worker: brain host, state store, alarms, redirect rules, (later) sync
  content/     feed content script: sensors + overlay host
  pages/       kaak.html (home, nap, theft chase, escape, bribes, nest, Times, settings, welcome), popup.html
  assets/      Nunito (bundled, SIL OFL), icons, optional caw.ogg
```

The layout is a proposal; the builder may change it. Constraints that are not negotiable: zero npm
*runtime* dependencies (nothing third-party ships in the zip), no remote code, plain JS that runs
unbuilt or with a trivial concatenation/zip step.

The ported core is hand-written JavaScript, not Kotlin/JS: it ships no Kotlin runtime and stays easy
to read. To stop drift, the JS tests are a 1:1 port of the Kotlin tests where they apply, and
`extension/core/PARITY.md` lists every Kotlin file, its JS twin and the app version it matches.

### 7.2 Service worker

- Owns the tracker, brain, wallet, trust, day stats, settings and logs.
- MV3 kills idle service workers after ~30 s, so **all state is a serializable snapshot** written to
  `chrome.storage.session` (fast, survives worker restarts) on every change and to
  `chrome.storage.local` (durable) at least every 30 s and on every important event. The ported
  `KaakBrain` needs `snapshot()`/`restore()`; the Kotlin one doesn't have them today.
- While a feed tab is visible, its 5 s heartbeat keeps the worker awake and drives `tick()`.
- With no feed tab open, `chrome.alarms` (30 s minimum period) handles nap end, lock expiry, the daily
  rollover, Sunday's paper and bribe timers.
- Sends the overlay what to perform (`Action` objects, same names as Kotlin).

### 7.3 Content script (feed sites)

- Sensors (section 5) → merged swipes and typing marks → service worker.
- Overlay: one host element with a **closed shadow root**, `all: initial`, maximum `z-index`,
  `position: fixed; inset: 0; pointer-events: none`, containing a full-viewport canvas sized by
  `devicePixelRatio`. The page can't style or read it, and it can't break the page. A z-index can't
  beat the browser's top layer (fullscreen, modal `<dialog>`, popovers), so the host is itself a
  `popover="manual"` shown with `showPopover()`, re-shown when the page opens its own top-layer
  element; fullscreen is exited for eating and theft.
- `pointer-events` switch on only where Kaak is interactive (chase target, splat while it's up, cards).
- Cards (mood, worth it, "too much?", first-time explainers) are DOM inside the same shadow root,
  styled from `ui/Kit.kt`'s design (white, red `#EF4B3F`, 3D lip buttons, Nunito).
- Nunito bytes come from the service worker by message (not a `fetch` of an extension URL from the
  page) and go into `new FontFace(...)`, so no page Content Security Policy can block it and nothing
  needs to be web-accessible.
- **No `web_accessible_resources` for feed origins.** Anything web-accessible lets those sites detect
  that Kaak is installed. Navigation to Kaak's page is done by the service worker
  (`chrome.tabs.update(tabId, { url })`, allowed without the `tabs` permission), not by the page.
  The one unavoidable case is the redirect rule's target (section 7.5). **Found in testing
  (Edge 156):** with `use_dynamic_url: true` the redirect lands on an ERR_BLOCKED_BY_CLIENT page,
  so `kaak.html` is declared with `use_dynamic_url: false`. The cost: a feed site *could* probe
  for that page and learn that Kaak is installed. Nothing else is exposed.
- Animation runs on `requestAnimationFrame` only while Kaak is busy; perched idle redraws ~4 times a
  second (as the app does since v0.9); nothing runs when hidden.
- A watchdog removes Kaak if he's not busy and the tab isn't counting, or after 45 s regardless
  (app v0.8 rule). Every performance clears leftovers first (`resetTransient`).

### 7.4 Kaak's pages

`kaak.html` (one page, hash-routed) holds everything that isn't over a feed: nap cover, theft chase,
eaten + detours, escape screen, bribes, nest, Kaak Times, settings, welcome/onboarding, stats.
`popup.html` is the toolbar popup: today's minutes, status, pause, a link to Kaak's page.

### 7.5 Locks (nap, theft, chase lost)

- When a lock starts, the service worker adds `declarativeNetRequest` **dynamic rules** (permission: `declarativeNetRequestWithHostAccess`) that redirect
  top-level navigations on the active feed pages (section 4, exclusions applied) to
  `kaak.html?lock=nap&site=instagram` (or `lock=theft`), and moves open feed tabs there via
  `chrome.tabs.update`. Reloading, typing the URL, or opening a new tab all land on Kaak's page.
  `kaak.html` must be in `web_accessible_resources` for redirects to work (`use_dynamic_url: false`,
  see 7.3).
- The redirect carries only the **site name**, never the original URL. When a lock ends, or the chase
  is won, Kaak sends you to that site's home page (e.g. `https://www.instagram.com/`), not back to the
  exact post. That's the price of never handling URLs.
- Each rule is tied to a lock with an end time in state.

### 7.6 Never a trap (self-healing)

Dynamic rules survive browser restarts **and being disabled** (they come back on re-enable, and the
service worker isn't guaranteed to start then), so a stale rule would be a trap. Three guards:
1. On every service worker start, `runtime.onStartup`, `runtime.onInstalled` and every alarm, rules are
   reconciled with state: any rule whose lock has ended is removed.
2. An alarm fires at each lock's end time to remove its rule.
3. `kaak.html` checks state whenever it opens on `#nap`/`#theft`. If no lock is active, it **first
   removes every lock rule** (it can call `chrome.declarativeNetRequest` itself), then sends you to the
   site's home page. Removing first matters: sending you back while the rule is still there would
   loop forever.

Removing the extension removes its rules. The escape screen and the chase always work offline.

## 8. Reused from the animation board

The board (`docs/kaak-animation-board.html`, 1,775 lines) is a 270×540 mock phone with fake feed
backgrounds. The engine inside it is what we keep. Line numbers are approximate (as of 2026-10-26).

| Board piece | Lines | Reuse |
| --- | --- | --- |
| `PATHS`, `HEAD`, `EYE`, `TUFT`, `drawCrow`, `beakTip`, `headTopY`, `crowBounds` | 238–388 | As is (Kaak v2, gamcha, glasses for work mode) |
| `roundRect`, `wrapText`, `fitText` | 389, 1289–1304 | As is |
| `Stage`: queue/`push`/`wait`/`later`/`say`, springs, puffs, speed lines, poses | 475–583 | As is, but `W`, `H`, `DP` become per-stage values from the viewport (not globals) |
| Positions `perch`, `offRight`, `offLeft`, `rail` | 546–550 | Adapt to the viewport; on wide screens perch near the feed column's right edge, never under the browser UI |
| `arrive`, `again`, `warn`, `walkAcross`, `sitOnRail`, `splat`, `dropSplat`, `wipe` | 584–644, 873–894 | As is |
| `steal`, `startChase`, `chaseHop`, `hitKaak`, `loseChase`, `snatch` | 646–715, 839–849 | Adapt: site tile instead of "F"; chase area = Kaak's page |
| `jumpscare`, `impact`, `makeCrack` | 716–771 | As is, including the single smooth dim and single white fade. `buzz` becomes a no-op |
| `eat` | 772–785 | Adapt: eats the viewport (the eaten cover grows over the real page) |
| `bedArrive`, `blanket` | 786–807 | As is |
| `morningGift`, `timesDelivery`, `drawPaper`, `drawPaperItem` | 808–838, 464, 1305 | On Kaak's page |
| `sleepOnApp`, `setHold` | 850–861 | Nap cover and escape screen on Kaak's page |
| `stamp` | 862–872 | Onboarding contract |
| Pointer handling | 896–915 | Adapt: page coordinates, toggle `pointer-events`; keyboard fallbacks (section 11) |
| Frame loop, `busy()` | 917–1089 | Adapt: run only while busy/visible; 4 fps idle perch |
| Bottom sheet (Cards) | 1248–1288 | Rebuild as shadow-DOM cards in the Kit style |
| Nest: `LOOT`, `drawLoot`, `drawNestScene` | 1313–1364 | On Kaak's page |
| `LINES`, `FIXED`, `DETOURS`, `MOODS`, `WORTH_ANS` | 174–212, 1370–1380 | Replaced by full ports of `Lines.kt`, `Detours.kt`, `Model.kt` |
| `drawFeed`, `heart`, `statusBar`, `drawHome`, `PANELS`, `GROUPS`, boot | 394–463, 1391–1773 | Dropped (mock phone and the board's own page). `PANELS` is a good template for the settings previews |

The board stays as it is. Once the engine lives in `extension/engine/`, the board *may* later load it
from there to remove the duplicate; that's optional and the builder's call.

## 9. Sync (opt-in, live, end-to-end encrypted)

The user approved this on 2026-10-26, knowing it changes two of Kaak's rules: the phone app gets the
`INTERNET` permission (full edition only), and a free-tier relay sits between devices.

**Shape**
- Off by default on every device. Everything works without it.
- **Pairing:** one device shows a pairing code; the other device types it in. The code carries 128
  bits of randomness (26 characters of Crockford base32 in groups, e.g. `K7Q2-9XMA-…`). From it both
  sides derive a group ID (`SHA-256`) and an encryption key (`HKDF`; WebCrypto has it, Android's JCA doesn't, so it's hand-written over `Mac("HmacSHA256")`, about 20 lines). No accounts, no email, no
  sign-in. A QR code is a nice extra, but reading QR codes on Android with no libraries means writing
  a decoder, so typed codes come first. Up to 4 devices per group. Unpair any time; unpairing deletes
  that device's data on the relay.
- **Encryption:** AES-GCM (WebCrypto in the extension, `javax.crypto` on Android: no libraries). The
  relay stores opaque blobs under a random group ID and device ID. It never sees minutes, sites,
  names or settings.
- **Relay:** a tiny HTTP service on a free tier that stores one encrypted blob per device per group and
  returns the group's blobs. Candidates: a Cloudflare Worker with D1 or Durable Objects, or Firebase
  Realtime Database used over REST (no SDK). The builder picks one at M5 after checking current
  free-tier limits against the target (hundreds of devices, ~2 requests per minute each while in a
  feed). Blobs older than 30 days are deleted. Request logging of bodies is off.
- **"Live":** a device pushes its blob immediately on lock events (eaten, nap, escape) and at most every
  30 s while a feed is open; it pulls when a feed opens and every 30 s while a feed is open. Otherwise
  it's quiet. Offline: it keeps working locally and merges on reconnect.

**What syncs, and how it merges (no server logic needed)**

| Data | Shared? | Merge |
| --- | --- | --- |
| Feed minutes today, mindless minutes today | Yes: one daily limit across devices | Each device publishes its own counters per date; total = sum |
| Eaten / nap until | Yes: eaten on the phone = asleep on the laptop | Latest end time wins |
| Escapes today (sets the 20/40/60/90 s hold) | Yes | Sum of per-device counts |
| Escape pass | No, per device | — |
| Theft, chase, stolen-lock | No, per device (the chase happens where the theft happened) | — |
| Session, arrival, gag timers | No, per device | — |
| Trust | Yes | An event log: every trust change (day result, bribe, escape, strict switch-off) is an event with a unique ID, a time and a delta. Merge = union by ID; trust = the deltas replayed in time order with the app's clamp at 0 (`Wallet.addTrust`). A day result's ID is `day:<date>`, so whichever device writes it first, it counts once; it is computed from the *merged* day totals after the day ends |
| Wallet (bribe minutes earned/spent), loot | Yes | Per-device earned/spent counters summed; the 30-minute and 3-honor daily caps apply to the **summed** totals (a device checks the merged total before paying). Loot = union by ID |
| Settings (limit, chaos, feeds, bedtime, work hours, language, jumpscare) | Yes | Per key, latest change wins |
| Strict mode | Yes | Latest change wins; leaving early still needs the wait |
| Logs, labels, URLs, anything about pages | **Never** | — |

Clock skew between devices is tolerated (use each device's clock; ±2 min is acceptable).

**Phone side (later, in the Android app):** only the `full` flavor gets `INTERNET` (a flavor-specific
manifest); the `study` flavor stays offline so the study is untouched. `HttpURLConnection` +
`javax.crypto`, no libraries. The `a11y_description`, privacy text, README "Privacy, in code" and
CLAUDE.md non-negotiables must be updated in the same change. That work belongs to the Android
session after the pilot and is not part of the extension milestones before M5.

## 10. Permissions

| Permission | Why | Install warning |
| --- | --- | --- |
| Host access: instagram.com, facebook.com, tiktok.com, youtube.com | Run the sensors and draw Kaak on those sites; redirect them during locks | "Read and change your data on …" (Chrome's wording; section 10.1) |
| `storage` | Settings, wallet, trust, day stats, logs, state snapshots | none |
| `alarms` | Nap end, lock expiry, daily rollover, Sunday paper, bribe timers when no feed is open | none |
| `idle` | Locked screen = stop counting; "step away" and eye-break bribes; morning gift | none |
| `declarativeNetRequestWithHostAccess` | Redirect feed sites to Kaak's page during a nap or theft lock (only works on hosts we already have) | none. Plain `declarativeNetRequest` would add "Block content on any page", so don't use it; verify the warning text at build time |
| `scripting` | Register the content script on optional feeds and learning sites the user switches on | none |
| Optional host access: x.com, reddit.com | Only if the user turns those feeds on | asked at that moment |
| Optional host access: learning sites from a fixed list | The "time on a learning site" bribe. Chrome can only ask for sites declared in the manifest, so it's a curated list (section 11), never "any site" | asked when the user picks one |
| Optional host access: the sync relay | Only after the user starts pairing (M5) | asked at that moment |

Deliberately **not** requested: `tabs`, `history`, `webRequest`, `<all_urls>`, `notifications`,
`downloads`, `clipboardRead`, `management`, `identity`. `chrome.storage.sync` comes with `storage` but is
**not used** (it would send data through the browser account).

### 10.1 Privacy statement (for the welcome page and store listing; keep it true)

> Kaak only works on Instagram, Facebook, TikTok and YouTube (and X or Reddit if you turn them on).
> Your browser will say Kaak can "read and change your data" on those sites. That is the only way
> an extension can draw a crow on a page. What Kaak actually uses: *that* you scrolled and when,
> whether a key was a scrolling key or a typing key (never which letter), and which kind of page you
> are on (a Short, a Reel, a feed). He never reads posts, captions, names, messages or anything you
> type, and never takes screenshots. Your minutes, settings and Kaak's nest are stored only in your
> browser. Kaak makes no internet connections at all, unless you turn on sync with your phone. Then
> your Kaak numbers (minutes, nap times, trust, settings) are encrypted on your device before they
> leave, and the relay that passes them along can't read them. It does see that a device connected
> and when. Turn sync off and that stops.

## 11. Bribes

Same rules as the app: 30 bribe minutes a day, 3 honor bribes a day, loot and trust always pay.

| Bribe | How the extension checks it |
| --- | --- |
| Step away from the computer: 5 / 10 / 20 min | `chrome.idle` reports `idle` or `locked` continuously for N minutes (detection interval 15 s) |
| 20-20-20 eye break | 20 s of no input while Kaak's page counts down |
| Time on a learning site, picked from a fixed list: Duolingo, Khan Academy, Coursera, edX, freeCodeCamp, Codecademy, LeetCode, Exercism, MIT OpenCourseWare, Brilliant, 10 Minute School, Shikkhok Batayon. Adding a site later = an extension update | That site's tab visible + focused for N minutes, via optional host access |
| Breathing (3 min), stretching (1 / 5 min) | On Kaak's page with a guided timer |
| Draw Kaak | Canvas on Kaak's page while he poses (port of `Check.CANVAS`) |
| Write a note: plan tomorrow / 3 good things | Kaak's notepad, minimum words, never saved (port of `Check.NOTE`) |
| Close all feed tabs for N minutes | No feed tab open for N minutes |
| Focus timer: 15 min on the thing you're avoiding | No feed tab + Kaak's timer running (from mood "Avoiding") |
| Honor tasks (water, tidy desk, a call, prayer/quiet break) | "Ask Kaak to trust you", 3 a day |
| Go to bed on time | No feed after bedtime → morning gift |

With sync on, bribes earned on the phone (steps, squats, stairs, photos) go into the same wallet.

## 12. Accessibility

- Kaak's canvas is `aria-hidden`; every card, cover and button is real DOM with labels.
- Keyboard: the chase can be won with Tab to Kaak + Enter (5 times); the escape hold works with Space
  held down; the splat clears with Escape.
- `prefers-reduced-motion` and the "Remove animations" setting: no white fade, gentle shake, no
  flying (Kaak appears in place), as in the app and the board.

## 13. Milestones

Each milestone ends with a dogfood checklist (like README's), run in Chrome and Edge at least, and
Brave/Opera/Vivaldi before any release.

**M0: Spike (throwaway).** Load the board engine as a content script, make the canvas full-window and
see-through, and have Kaak arrive and splat over instagram.com and youtube.com/shorts. Proves the
overlay, fonts and CSP. Kept only if clean.

**M1: Foundation.** Manifest, content script sensors, overlay host, port of `ScrollTracker` +
`RuleDetector` + `DetectorConfig` with tests, service worker with snapshot/restore, live detector
panel in settings, arrival + heckles + nudges + spacing rules, away/idle/lock handling, watchdog.
*Exit:* Shorts/Reels/TikTok show `MINDLESS` within ~1 min; typing a comment flips to
`NOT_MINDLESS`; a long YouTube video never triggers Kaak; wheel-reading Facebook is checked and the
swipe definition tuned if needed.

**M2: Core loop.** `KaakBrain` port with tests; theft + chase; jumpscare + "Too much?"; daily limit,
warning, eating; nap via redirect rules with the self-healing guards; escape screen; pause; bedtime.
*Exit:* no way to get stuck: reload, restart the browser mid-nap, kill the worker, change the clock;
every lock ends on time.

**M3: Giving back + polish.** Desktop bribes, detours, trust, nest, Kaak Times, mood check, worth it,
work mode, strict mode, onboarding, all three languages, session log + share + report, accessibility,
CPU check (Chrome Task Manager: idle perched Kaak well under 1% CPU).

**M4: Release.** Icons and store screenshots, privacy policy page (the statement above, hosted free
in the GitHub repo), a zip script, Edge Add-ons + Opera add-ons listings (both free). No Chrome Web Store (the $5 fee isn't paid): Chrome, Brave and Vivaldi testers install the release zip with "Load unpacked" in developer mode, with a one-page guide. That means no auto-updates for them (Kaak's page shows its version and a "check for updates" link to the GitHub releases page, opened only when clicked), and hand-editable files, which strict mode's screen admits. The pilot should prefer Edge for this reason. The GitHub repo is private today, so the privacy page and release zips need it public (or another free host) before M4. Version starts at 0.1.0, independent of the app's versions.

**M5: Sync.** Pick and deploy the relay, pairing, encryption, merge rules with tests (in both JS and
Kotlin core), then the Android side in the `full` flavor. Gate: after the 5-friend pilot, and only
with the Android session's plan.

## 14. Left to the builder

- File layout, module loading (dynamic `import()` from content scripts vs. a concat step), naming.
- Exact swipe-definition tuning for the wheel (within section 5.1's rule: thresholds stay put).
- Kaak's size and perch spot on very wide or very small windows.
- Visual design of Kaak's page and popup, within `ui/Kit.kt`'s system.
- Which relay (section 9 candidates), checked against free-tier limits at M5.
- Store listing copy (keep it consistent with section 10.1).

## 15. Calls made in planning (not discussed with the user; check these)

- Firefox listed as "maybe later", not dropped forever.
- Theft shows a drawn site tile instead of the real favicon, so Kaak never reads page content.
- "Was that worth it?" moves to the start of the next feed visit.
- Morning gift and Kaak Times announce themselves with a toolbar badge instead of opening tabs.
- Pairing by typed code first, QR later, because there is no library-free QR reader on Android.
- Theft and escape passes stay per device; limit, nap, trust, wallet and settings are shared.
- The `study` Android flavor never gets sync.
- Strict mode is offered in the extension with an honest "can't stop a switch-off" note.

## 16. Decided after the builder check (2026-10-26)

- **Leaving** = closing the feed tab or navigating off the feed; tab and window switches are looking
  away (section 5.3).
- **Chrome Web Store fee: not paid.** Free stores only (Edge, Opera); developer-mode install for the rest
  (section 13, M4).

Calls made after the builder check (check these too): chat and work-tool paths on feed domains are
never feeds and stay reachable during locks (section 4); after a lock or a won chase Kaak sends you to
the site's home page, not the exact post (section 7.5); learning-site bribes use a fixed list
(section 11); trust syncs as an event log with the app's clamp (section 9); the bribe caps apply to
summed totals across devices (section 9).

No open questions remain for the user.
