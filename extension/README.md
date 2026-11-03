# Kaak for the browser (0.1.0)

The same petty Dhaka house crow as the Android app, for Chromium browsers on laptops and desktops
(Chrome, Edge, Brave, Opera, Vivaldi). Manifest V3, no libraries, no server, **no network requests**.
Design: [`../docs/browser-extension-spec.md`](../docs/browser-extension-spec.md). Milestones M0–M4 are
built here; sync with the phone (M5) is not.

## Install (testers)

1. Build the zip: `node tools/pack.mjs` → `dist/kaak-extension-0.1.0.zip`, and unzip it somewhere.
2. Open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode**, click
   **Load unpacked**, pick the unzipped folder.
3. Kaak's welcome page opens. Then pin Kaak (puzzle icon → pin).

Edge Add-ons and Opera add-ons listings are free; everything needed to submit (text, privacy policy,
screenshots, tiles, click-by-click steps) is in [`store/`](store/SUBMIT.md). The Chrome Web Store's $5 fee
isn't paid (decided 2026-10-26), so Chrome, Brave and Vivaldi users stay on "Load unpacked": no
auto-updates, and the files can be edited by hand.

## What it does

Everything in the app, adapted to a browser (spec section 6): the detector with the same
`DetectorConfig` thresholds; arrival, nudges, heckles (walk, sit on the like button, splat); the
photosensitivity-safe jumpscare with "Too much?"; theft and the 5-click chase (keyboard works too);
the 5-minute warning, eating, the 20-minute nap cover; the escape screen (hold 20/40/60/90 s, type
the sentence, paste rejected, 5-minute pass); bedtime and the morning gift; work mode; mood check;
"Was that worth it?" (at the start of the next feed visit); trust, the nest, Kaak Times; detours;
desktop bribes (step away, eye break, learning-site time, breathing, stretching, drawing, notes,
no-feed time, honor); strict mode (honest about what a browser can't stop); onboarding with the
contract; English, Banglish and Bangla; "Share my stats" and "Report a problem".

**Leaving a feed** = closing the tab or navigating off the feed. Switching tabs or windows is
*looking away*: the clock pauses and nothing else happens. Chats (Messenger on facebook.com,
Instagram DMs, TikTok messages), YouTube Studio, Business Suite and YouTube Music are never touched,
even during a nap.

## Privacy, in code

- `manifest.json`: host access to the four feed sites only; optional X/Reddit and learning sites are
  asked for one at a time. No `tabs`, `history`, `webRequest`, `<all_urls>`, `notifications`.
- `content/feed.js` keeps only *that* a wheel/scroll/swipe/scrolling key happened, *that* a key was
  typed in a text field (never which), and the page URL long enough to tell the kind of page. It
  never reads page text, titles or images.
- Everything is in `chrome.storage.local` / `.session`. `chrome.storage.sync` is never used.
- One honest cost: `pages/kaak.html` must be web-accessible for the nap/theft redirects
  (`use_dynamic_url: true` makes Edge block the redirect), so a feed site *could* detect that Kaak
  is installed.

## Layout

| Path | What |
| --- | --- |
| `core/` | Port of the app's `core/` (pure JS, 186 tests). `API.md`, `PARITY.md` |
| `engine/kaak-engine.js` | Kaak's drawing and every performance, from `docs/kaak-animation-board.html`. `demo.html` to eyeball it |
| `sw/service-worker.js` | The browser's `KaakAccessibilityService`: feed tabs → brain → performances, cards, locks, logs |
| `sw/locks.js` | Nap/theft redirect rules, rebuilt from state on every start and alarm (never a trap) |
| `sw/tasks.js` | Runs and checks the bribe in progress |
| `sw/kaak-core.js`, `sw/store.js` | Core ↔ storage glue (wallet, days, prefs, log) |
| `content/feed.js` | Sensors + Kaak's overlay (closed shadow root, top layer) on feed pages |
| `content/site-time.js` | Only on a learning site you picked for a bribe |
| `pages/kaak.html` | Nap, eaten, theft chase, escape, bribes, nest, Times, settings, welcome, stats |
| `pages/popup.html` | Toolbar popup: today, pause, open Kaak |
| `store/` | Store listing text, privacy policy, images, `SUBMIT.md` |

## Develop

```bash
node --test core/test/                 # 186 unit tests (port of the app's tests + desktop ones)
node test/e2e/run.mjs                  # 34 end-to-end checks in a throwaway headless Edge profile
node test/e2e/run.mjs --ext=dist/unpacked   # same, against the packed zip's contents
node test/e2e/real-site.mjs            # read-only smoke test on real YouTube Shorts
node test/e2e/make-icons.mjs           # re-render the icons from the engine's drawCrow
node tools/pack.mjs                    # dist/kaak-extension-<version>.zip
node test/e2e/store-shots.mjs          # store/images/: screenshots (Edge + Opera sizes), logo, tiles
```

The end-to-end test maps instagram.com, facebook.com, youtube.com and tiktok.com to a local fake feed
(`test/e2e/fake-feed.mjs`, HTTPS on port 443 with a self-signed certificate) and moves Kaak's clock
forward with a test hook, so a day of scrolling takes about two minutes. Screenshots land in
`test/e2e/shots/`. It needs Edge or Chrome installed and port 443 free.

## Known gaps

- Tested end to end against a fake feed, plus one real-site smoke test (YouTube Shorts: detection,
  overlay and the first-time card all worked). Instagram, Facebook and TikTok's real pages, and the
  mouse-wheel swipe definition on a slowly read Facebook feed (spec 5.1), still need a person.
- Bribe rewards for the new desktop bribes (`away5` 5 min, `away20` 10 min + tea cup, `nofeed30`
  15 min + coin) are first guesses.
- No caw sound yet. The "Report a problem" email goes to theoslab.dev@gmail.com.
- Sync with the phone (M5), store listings, Firefox: not started.
