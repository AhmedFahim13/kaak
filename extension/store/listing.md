# Store listing: Kaak 0.1.0

Copy-paste text for Microsoft Edge Add-ons (Partner Center) and Opera add-ons. Everything here matches
`docs/browser-extension-spec.md` (sections 6 and 10) and what the code actually does. If the code
changes, change this too: both stores reject listings that don't match the extension's behaviour.

Publisher: **Fahim Ahmed**. Support: **theoslab.dev@gmail.com**.

## Name and short description (read from `manifest.json`, can't be edited in the stores)

- Name: `Kaak`
- Short description: `A petty Dhaka house crow who interrupts doomscrolling on Instagram, Facebook, TikTok and YouTube.`

## Category

- Edge: **Productivity**
- Opera: **Productivity**

## Opera summary (one sentence)

Kaak is a petty cartoon crow who shows up when you scroll Instagram, Facebook, TikTok or YouTube Shorts
without thinking, and gets worse the longer you stay.

## Description (Edge needs 250 to 10,000 characters; Opera uses the same text)

> Kaak is a petty Dhaka house crow who hates doomscrolling. Yours, specifically.
>
> Scroll Instagram, Facebook, TikTok or YouTube Shorts on autopilot and Kaak lands on the page, stares,
> and pecks the glass. Keep going and he walks across your feed, sits on the side of it, or drops a
> splat you have to wipe away. Close the feed and he leaves too.
>
> He only reacts to mindless scrolling: fast swiping with a few seconds per post or reel. Reading slowly,
> typing a comment, or watching one long video on purpose are left alone. Anything is better than
> doomscrolling, and Kaak doesn't care what you do instead.
>
> WHAT HE DOES
> • Arrives after a few mindless minutes (you choose 1 to 30), then heckles every minute or two.
> • Comes back to a feed less than 2 minutes after closing it? He steals it. Click him 5 times to get
>   it back, or every feed stays locked for 3 minutes.
> • Daily limit (5 to 180 minutes): a warning 5 minutes before, then he eats the feed in three bites
>   and takes a 20-minute nap on it. Feeds open to his nap until he wakes up, with three better
>   things to do instead.
> • Always escapable: hold him for 20 seconds (longer each time today), type a sentence, and you get
>   5 minutes. You can pause him (except during a nap, or in strict mode if you chose it), and
>   switching the extension off always works.
> • An optional jumpscare, once per session, that is photosensitivity-safe: one smooth dim, never a
>   flicker. "Too much?" turns it off with one click.
> • Bribes earn feed time for later: step away from the computer, a 20-20-20 eye break, a lesson on a
>   learning site, breathing, stretching, drawing Kaak, writing tomorrow's plan.
> • Trust grows with good days, and he calms down as he trusts you. Bribes fill his nest with loot,
>   and on Sundays he delivers Kaak Times, a tabloid about your week.
> • Bedtime mode, work hours (tiny glasses, no theft), a mood check, and an optional strict mode.
> • English, Banglish and Bangla.
>
> PRIVATE BY DESIGN
> Kaak never reads posts, captions, names, messages or anything you type, and never takes screenshots.
> He only uses that you scrolled and when, whether a key was a scrolling key or a typing key (never
> which letter), and which kind of page you're on. Everything stays in your browser. Kaak makes no
> internet connections at all. He never touches chats (Messenger, Instagram and TikTok messages),
> YouTube Studio, Business Suite or YouTube Music, even during a nap.
>
> While Kaak is napping or holding a stolen feed, he redirects the feed sites to his own page until the
> timer runs out or you win the chase. That's the only thing he does in the background.
>
> Free, no ads, no account, no tracking.

## Search terms (Edge: at most 7 terms, 30 characters each, 21 words in total)

`doomscrolling` · `screen time` · `digital wellbeing` · `social media limit` · `reels shorts limit` ·
`focus` · `crow`

## Edge "Privacy" page

**Single purpose description**

> Interrupt mindless scrolling on social media feeds (Instagram, Facebook, TikTok, YouTube) with an
> animated crow, a daily feed-time limit, and short locks the user can always escape.

**Permission justifications**

| Permission | Justification to paste |
| --- | --- |
| Host access: instagram.com, facebook.com, tiktok.com, youtube.com | Kaak's content script runs only on these four feed sites, to notice that the user is scrolling (wheel, swipe and scrolling-key events, timing only) and to draw the crow over the page. It never reads page content. These hosts are also the only sites the nap and theft redirects apply to. |
| `storage` | Saves settings, today's feed minutes, trust, bribe rewards and the local activity log, on the user's computer only. `chrome.storage.sync` is not used. |
| `alarms` | Ends a nap or a feed lock exactly on time, rolls the day over at midnight, and runs bribe timers when no feed tab is open. |
| `idle` | A locked screen stops the feed-time count (like a phone screen turning off), and the "step away from the computer" bribe checks that the computer stayed idle. |
| `declarativeNetRequestWithHostAccess` | During the 20-minute nap after the daily limit, or while Kaak holds a stolen feed, feed pages are redirected to Kaak's own page. Rules apply only to the four feed hosts, never to chat or work pages, and are removed as soon as the timer ends. |
| `scripting` | Registers the content script on optional feeds (X, Reddit) and on a learning site, only after the user switches one on and grants that one site. |
| Optional hosts (x.com, twitter.com, reddit.com, and 12 learning sites) | Asked one at a time, only when the user turns on that feed or picks that learning site for a bribe. For a learning site, Kaak only learns whether its tab is in front. |

**Are you using remote code?** No, I am not using remote code.

**Data usage.** Kaak doesn't collect user data: nothing is transmitted off the user's computer, and there
is no server. *Your call when you fill this in:* the honest answer is to tick none of the "collect"
boxes and to tick every certification box. The privacy policy explains what is kept locally.

**Privacy policy URL:** https://ahmedfahim13.github.io/kaak-privacy/ (a copy of `store/privacy-policy.html`
in the public repo `AhmedFahim13/kaak-privacy`; see `SUBMIT.md` step 0.3).

## Notes for certification (Edge "Submit" page)

> No account or sign-in is needed. Kaak works on instagram.com, facebook.com, tiktok.com and youtube.com.
>
> To see everything quickly: after install, finish the welcome pages (click the crow 5 times when he
> steals the Next button). Then open the toolbar icon → Open Kaak → Settings and set "Shows up after"
> to 1 min, "Acts up every" to 30 s, and the daily limit to 5 min.
>
> 1. Open youtube.com/shorts and scroll several Shorts with the mouse wheel: after about a minute the
>    crow lands at the top right; more scrolling brings heckles. Settings → More settings → Live
>    detector shows what Kaak sees (counts and timing only).
> 2. Close the tab and reopen youtube.com within 2 minutes: Kaak steals the feed. Click him 5 times
>    (or Tab to him and press Enter 5 times) to get it back.
> 3. Keep scrolling to the 5-minute limit: he eats the feed and naps for 20 minutes; feed pages
>    redirect to his nap page. "Go in anyway…" → hold 20 s → type the sentence → 5-minute pass.
> 4. Chats (facebook.com/messages, instagram.com/direct) are never touched, even during a nap.
>
> The extension makes no network requests. Removing it removes all redirect rules.

## Opera license

Opera asks for a distribution license; without one, the listing is CC BY-NC-ND 4.0. *Your call.*
