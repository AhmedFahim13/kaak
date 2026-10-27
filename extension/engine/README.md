# Kaak engine

Kaak's drawing and animation, taken from `docs/kaak-animation-board.html` (a JS port of
`KaakView.kt` / `CrowPainter.kt`). It is one classic script, `kaak-engine.js`, with no modules,
no dependencies and no network calls. Load it before your own script and use `globalThis.KaakEngine`.
It runs in a content script (isolated world) and in extension pages. Open `demo.html` from disk
to try every performance over a fake scrolling page.

```js
const stage = KaakEngine.createStage(canvas, { width: innerWidth, height: innerHeight });
stage.attachPointer(canvas);       // pointer listeners (CSS px relative to the canvas)
stage.attachKeys(window);          // Escape wipes the splat
stage.onWantsPointer = on => canvas.style.pointerEvents = on ? "auto" : "none";
stage.arrive();
```

## createStage(canvas, opts)

| Option | Default | Meaning |
| --- | --- | --- |
| `width`, `height` | canvas client size | Stage size in CSS px |
| `dpr` | `devicePixelRatio`, max 2.5 | Backing-store scale |
| `dp` | `1.0` | CSS px per Android dp (the board used 0.75). Kaak's unit is `dp * 0.95` |
| `bg` | `'none'` | `'none'` = transparent, `'paper'` = `#FFFDF6`, or any CSS colour |
| `reduceMotion` | `prefers-reduced-motion` | No white fade, shake capped at 4 dp / 300 ms, no text jitter, no vibration. Kaak appears in place instead of flying in (`flyInTo`, `returnToPerch`, `holdingChase`, `bedArrive`, `blanket`, `stamp`, `perchCalm`) |
| `lineFn(key, n?)` | English board lines | Returns a subtitle for a key (`arrive`, `peck`, `again`, `walk`, `sit`, `splat`, `wiped`, `steal`, `hit`, `chaseWon`, `chaseLost`, `warn`, `burp`, `holding`, `letGo`, `escaped`, `yawn`, `morning`, `stamp`, `working`, `calm`, `nudge`). `n` is minutes where the line has a number. If it returns null or "", the English default is used |
| `fixedFn(key, n?)` | English board strings | `kaa`, `chomp`, `snore`, `extra`, `asleep`, `ate`, `hold`, `detours`, `worth`, `moodQ`, `tapHint`, `knowHow`, `nest` |
| `font` | `'Nunito', 'Hind Siliguri', system-ui, sans-serif` | The family for every bit of canvas text (weights and sizes are the board's) |
| `jumpLevel` | `'MEDIUM'` | Default for `jumpscare()`: `GENTLE`, `MEDIUM`, `FULL`, `OFF` |
| `tile` | `{label:'F', color:'#1877F2'}` | Default site tile (also `stage.tile`) |
| `glasses`, `calm` | `false` | Start in work mode / calm perch |
| `topInset` | `8` (dp) | Highest point a speech bubble may reach (the board used 36 for the phone's status bar) |
| `onIdle(stage)` | none | Called when a performance finishes (busy → not busy). Also `stage.onIdle` |
| `onWantsPointer(bool)` | none | Called when `wantsPointer()` changes. Also `stage.onWantsPointer` |
| `autoStart` | `true` | Call `start()` straight away |
| `setStyle` | auto | Write the canvas's CSS width/height. Auto = only if the canvas has no inline width |

`KaakEngine.makeLineFn(lang)` / `makeFixedFn(lang)` build the default functions for `'en'`, `'bl'`
(Banglish) or `'bn'` (Bangla, with Bangla digits). They hold only the board's subset; the extension
should pass a full port of `Lines.kt`.

## Performances

Every performance clears leftovers from an interrupted one first (`resetTransient`: chase, carried
item, shown tile, eaten cover, hold). Callbacks are dropped if another performance replaces this one.

| Method | Args / callbacks | What happens |
| --- | --- | --- |
| `arrive()` | | Flies to the perch (if not perched), stares, says hello, pecks the screen twice |
| `again(text?)` | `text` replaces the line | Hop (or fly in), unimpressed look, "again?" |
| `nudge(minutes?, kind?)` | `kind`: `'hop' \| 'peck' \| 'lean' \| 'flap'` or 0-3, random if omitted | The app's small poke (port of `KaakView.nudge`) with a `nudge` line about today's minutes. Snores instead if asleep. Returns `false` and does nothing while a performance or chase runs |
| `warn(minutes?)` | default 5 | "5 minutes till I eat this." |
| `walkAcross()` | | Lands at the bottom right, walks to the left, flies back to the perch |
| `sitOnRail(minutes?)` | default 40 | Sits on the like-button rail (right edge, 64% height) and judges |
| `splat()` | | Flies over, drops a splat (`dropSplat()`), comes back. Splat wipes with a drag, Escape, or after 10 s |
| `dropSplat()`, `wipe(thanked, dx=0, dy=60)` | | Primitives. `wipe` returns `false` if no splat is up |
| `steal(onGrabbed, onWon, onLost, tile?, area?)` | `area` {l,t,r,b} | Grabs the site tile from mid-screen, then a 5-hit, 15 s chase |
| `stealButton(rect, label, onGrabbed, onWon)` | `rect` {x,y,w,h} | Onboarding: steals the "Next" button. 25 s chase; losing still gives it back |
| `holdingChase(tile, area?, onWon, onLost, deadlineMs=15000)` | | Flies in already holding the tile, then the 5-hit chase (Kaak's page after a theft) |
| `startChase(area, onWon, onLost, deadlineMs=15000)`, `chaseHop()`, `hitKaak()`, `loseChase()` | | Chase primitives. A click within 22 dp of Kaak counts as a hit |
| `keyHit()` | | One hit during a chase (keyboard). Returns `false` if no chase |
| `snatch(text?, tile?)` | | Takes the tile and leaves with it (mood "avoiding", theft on the feed) |
| `jumpscare(level?)` | `GENTLE \| MEDIUM \| FULL \| OFF` | One smooth dim, lunge, crack, shards, at most one white fade, falls off, flies back. `OFF` returns `false`. Exiting fullscreen is the host's job |
| `impact(level, at)`, `makeCrack(at, rays)` | | Jumpscare primitives |
| `eat(onDone)` | | Three bites: a dark cover grows over the whole viewport, then a burp. Clear it with `setEaten(0)` or `clear()` |
| `bedArrive()` | | Lands at the bottom, yawns, dims the screen a little, falls asleep |
| `blanket()` | | Each call raises the quilt (30%, then +12% up to 60%) and dims more; Kaak sleeps on top |
| `morningGift()` | | Flies in, drops a shiny gift, leaves |
| `timesDelivery(onDropped)` | | Drops the Kaak Times, "EXTRA! EXTRA!", leaves; `onDropped` as he flies off |
| `sleepOnApp(cx, cy, tile?)`, `sleepOnTile(cx, cy, tile?)` | | Kaak asleep on the tile centred at (cx, cy). No flight |
| `setHold(progress)` | `>= 0` ring progress 0..1, `-1` stop quietly, `-2` stop with "thought so." | Hold ring around Kaak (escape screen). Drive it yourself, or use: |
| `beginHold(ms, onDone)`, `endHold()` | | Timed hold (board: 5 s; escape screen: 20/40/60/90 s). On completion Kaak says "go. I'm judging." and `onDone` (or `stage.onEscape`) runs. `endHold()` releases early |
| `stamp(x, y, onDone)` | | Onboarding contract: leaves a footprint at (x, y) |
| `perchCalm(on=true)` | | Calm / Friend-trust perch (small, top-left). Hops over if perched and idle |
| `setGlasses(on)` | | Work-mode glasses |
| `say(text, ms=2600)` | | Speech bubble over Kaak |
| `sitNow(pose?)` | default `perch()` | Puts Kaak there at once |
| `hop(pose)`, `flyInTo(pose, ms)`, `returnToPerch()`, `peckHit()` | | Small moves for building your own |
| `push(ms, pose, motion?, onStart?)`, `wait(ms, fn?)`, `later(ms, fn)`, `clearScript()` | `motion`: `KaakEngine.STILL \| FLAP \| WALK` | The script queue. `later` is a `setTimeout` cancelled by `reset()`/`clear()` |
| `reset()` | | Everything back to empty, including modes and host hooks |
| `clear()` | | Removes Kaak and everything he left, blanks the canvas. Keeps glasses/calm, `tile`, callbacks |

## Loop, size, input

| Member | Meaning |
| --- | --- |
| `start()`, `stop()`, `destroy()` | Own `requestAnimationFrame` loop. Full rate while busy, ~15 fps while asleep, ~4 fps when merely idle on screen, nothing (no scheduling) when the stage is empty. Paused while `document.hidden`; on return, segment timers, subtitles, the chase deadline, a hold and the splat timer resume where they were. `destroy()` also removes listeners added by `attach*` |
| `busy()`, `isIdle()`, `hasContent()` | Is a performance (or an effect, or a dim/blanket/eaten transition) running? Is anything on screen at all? |
| `resize(width, height)` | Works mid-animation: queued positions are remapped (spots at the old perch move to the new perch; off-screen spots stay off-screen) |
| `setColumn(left, right)` | Optional: on wide windows keep Kaak's spots near a content column. `null, null` = full width |
| `perch()`, `rail()`, `offRight()`, `offLeft()`, `fit(pose)` | Spots: perch at right edge / 30% height, rail 64%, walk line 84%. `fit` shifts a pose so the whole crow is on screen |
| `kaakBounds()` | Kaak's box `{l,t,r,b}` in canvas px, e.g. to keep a focusable "Kaak" button over him for Tab + Enter |
| `attachPointer(el)` | Pointer listeners on `el` (a pointerdown the engine uses gets `preventDefault`); returns `detach()`. Or feed events yourself with `pointer('down'|'move'|'up', e)` (returns `true` if used) |
| `attachKeys(target=window)`, `keyDown(e or key)` | Escape wipes the splat. Never calls `preventDefault` |
| `wantsPointer()` | `true` while a splat is up, a chase runs, a hold is active, or `custom` is set |
| `hitsKaak(pt, pad?)` | Hit test in canvas px |
| `custom = (type, pt, e) => bool` | Pointer hook that runs first; return `true` to consume |
| `underlay`, `overlay = (ctx, t, stage) => {}` | Draw hooks behind / in front of Kaak (Kaak's page scenes) |
| `setDim(v, instant?)`, `setBlanket(v, instant?)`, `setEaten(v, instant?)`, `shake(amp, ms)` | Effects |
| `tile`, `jumpLevel`, `lineFn`, `fixedFn`, `font`, `reduceMotion`, `waiting` | Settable at any time. `waiting = true` keeps full-rate frames |
| `perched`, `sleeping`, `chase`, `splatObj`, `pose`, `W`, `H`, `DP`, `UNIT` | Read-only state |

## Painter and helpers (no stage needed)

`P(x, y, overrides)`, `withP(pose, overrides)`, `drawCrow(ctx, pose, unit=0.95, glasses=false)`,
`beakTip(pose, unit)`, `headTopY(pose, unit)`, `crowBounds(pose, unit)`, `roundRect`, `wrapText`,
`fitText`, `drawSiteTile(ctx, cx, cy, size, {label, color, ink?, font?}, alpha=1)`,
`drawPaper(ctx, w, h)`, `drawPaperItem(ctx, x, y, alpha, dp=1)`, `LOOT`, `drawLoot(ctx, name, x, y, s, i)`,
`drawNestScene(ctx, count, w, h)`, plus `PATHS`, `K` (colours), `LINES`, `FIXED`, `DEFAULT_FONT`,
`DEFAULT_TILE`, `version`.

## Changed from the board

- `W`, `H`, `DP`, `UNIT` are per stage. Fonts come from `opts.font`; no Google Fonts anywhere.
- Mock phone backgrounds (`drawFeed`, `heart`, `statusBar`, `drawHome`), the bottom sheet
  (`drawSheet`/`sheetHit`: cards are DOM now), `PANELS`, `GROUPS`, the hero and the
  `DETOURS`/`MOODS`/`WORTH_ANS` tables are gone.
- The stolen tile is drawn by `drawSiteTile` (letter on brand colour) instead of the board's
  purple gradient with a play triangle. The board's on-screen tile field is now `tileShown`;
  `stage.tile` is the default tile.
- Added: `nudge`, `holdingChase`, `perchCalm`, `setGlasses`, `sleepOnTile`, `beginHold`/`endHold`
  (the board hard-coded 5 s), `keyHit`, `keyDown`/`attachKeys`, `wantsPointer`, `onIdle`,
  `setColumn`, `fit`, `kaakBounds`, `resetTransient` at the start of every performance (as the app does).
- Spots are clamped on screen; horizontal ratios follow `setColumn` when one is set.
- Lines with a number (`sit`, `warn`, `nudge`, `asleep`) take it as an argument instead of the
  board's fixed 40/5/14.
