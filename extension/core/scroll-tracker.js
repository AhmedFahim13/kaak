// Port of app/src/main/java/app/kaak/core/ScrollTracker.kt (app v0.10.x).
import { MINUTE_MS } from './model.js';

/**
 * Behaviour-only numbers. Nothing here knows what is on screen.
 * Kotlin data class ScrollStats.
 * @returns {{swipesInWindow:number, swipesPerMin:number, medianDwellMs:number|null,
 *   msSinceActivity:number, typedRecently:boolean, msSinceTyping:number|null}}
 */
export function ScrollStats(swipesInWindow, swipesPerMin, medianDwellMs, msSinceActivity, typedRecently, msSinceTyping = null) {
  return Object.freeze({ swipesInWindow, swipesPerMin, medianDwellMs, msSinceActivity, typedRecently, msSinceTyping });
}

/**
 * Accessibility services fire many TYPE_VIEW_SCROLLED events per finger swipe
 * (in the browser: wheel/scroll/key/touch events). Events closer together than
 * swipeGapMs are merged into one swipe. Stats are computed over a rolling windowMs window.
 */
export class ScrollTracker {
  #swipeGapMs;
  #windowMs;
  #typingGraceMs;
  #swipes = [];
  #lastScrollEventAt = null;
  #lastSwipeAt = null;
  #lastTypingAt = null;
  #startedAt = null;
  #totalSwipes = 0;

  constructor({ swipeGapMs = 350, windowMs = 5 * MINUTE_MS, typingGraceMs = 60_000 } = {}) {
    this.#swipeGapMs = swipeGapMs;
    this.#windowMs = windowMs;
    this.#typingGraceMs = typingGraceMs;
  }

  get totalSwipes() { return this.#totalSwipes; }

  start(now) {
    if (this.#startedAt == null) this.#startedAt = now;
  }

  onScroll(now) {
    this.start(now);
    const last = this.#lastScrollEventAt;
    if (last == null || now - last > this.#swipeGapMs) {
      this.#swipes.push(now);
      this.#lastSwipeAt = now;
      this.#totalSwipes++;
    }
    this.#lastScrollEventAt = now;
    this.#trim(now);
  }

  onTyping(now) {
    this.start(now);
    this.#lastTypingAt = now;
  }

  reset() {
    this.#swipes = [];
    this.#lastScrollEventAt = null;
    this.#lastSwipeAt = null;
    this.#lastTypingAt = null;
    this.#startedAt = null;
    this.#totalSwipes = 0;
  }

  stats(now) {
    this.#trim(now);
    const start = this.#startedAt ?? now;
    const observedMs = Math.max(Math.min(this.#windowMs, now - start), MINUTE_MS);
    const rate = (this.#swipes.length * MINUTE_MS) / observedMs;
    const gaps = [];
    for (let i = 1; i < this.#swipes.length; i++) gaps.push(this.#swipes[i] - this.#swipes[i - 1]);
    gaps.sort((a, b) => a - b);
    let median;
    if (gaps.length < 2) median = null;
    else if (gaps.length % 2 === 1) median = gaps[Math.trunc(gaps.length / 2)];
    else median = Math.trunc((gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2);
    const sinceActivity = now - (this.#lastSwipeAt ?? start);
    const typed = this.#lastTypingAt != null ? now - this.#lastTypingAt <= this.#typingGraceMs : false;
    return ScrollStats(this.#swipes.length, rate, median, sinceActivity, typed, this.#lastTypingAt != null ? now - this.#lastTypingAt : null);
  }

  #trim(now) {
    while (this.#swipes.length > 0 && now - this.#swipes[0] > this.#windowMs) this.#swipes.shift();
  }

  /** JS-only: every field, for MV3 service worker restarts. */
  toJSON() {
    return {
      swipeGapMs: this.#swipeGapMs,
      windowMs: this.#windowMs,
      typingGraceMs: this.#typingGraceMs,
      swipes: this.#swipes.slice(),
      lastScrollEventAt: this.#lastScrollEventAt,
      lastSwipeAt: this.#lastSwipeAt,
      lastTypingAt: this.#lastTypingAt,
      startedAt: this.#startedAt,
      totalSwipes: this.#totalSwipes,
    };
  }

  static fromJSON(o) {
    const t = new ScrollTracker({ swipeGapMs: o.swipeGapMs, windowMs: o.windowMs, typingGraceMs: o.typingGraceMs });
    t.#swipes = o.swipes.slice();
    t.#lastScrollEventAt = o.lastScrollEventAt;
    t.#lastSwipeAt = o.lastSwipeAt;
    t.#lastTypingAt = o.lastTypingAt;
    t.#startedAt = o.startedAt;
    t.#totalSwipes = o.totalSwipes;
    return t;
  }
}
