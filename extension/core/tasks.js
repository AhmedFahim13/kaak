// Port of app/src/main/java/app/kaak/core/Tasks.kt (app v0.10.x), adapted to desktop checks.
// StepGoal (Android step counter) is phone-only and not ported.

/**
 * Phone-down bribes: the screen must stay off for targetMs in one go.
 * Desktop: Check.AWAY, fed from chrome.idle ('idle' or 'locked' = away, 'active' = back).
 */
export class PhoneDownTimer {
  #targetMs;
  #offSince = null;
  #bestMs = 0;
  #done = false;

  constructor(targetMs) {
    this.#targetMs = targetMs;
  }

  get targetMs() { return this.#targetMs; }
  get bestMs() { return this.#bestMs; }
  get done() { return this.#done; }

  onScreenOff(now) {
    if (!this.#done) this.#offSince = now;
  }

  /** Returns true if this screen-on completes the bribe. */
  onScreenOn(now) {
    const since = this.#offSince;
    if (since == null) return false;
    this.#offSince = null;
    const ms = now - since;
    this.#bestMs = Math.max(this.#bestMs, ms);
    if (ms >= this.#targetMs) this.#done = true;
    return this.#done;
  }

  /** JS-only: the current unbroken stretch so far (0 when not away), for a progress bar. */
  progressMs(now) {
    return this.#offSince == null ? 0 : now - this.#offSince;
  }

  /** JS-only persistence. */
  toJSON() { return { targetMs: this.#targetMs, offSince: this.#offSince, bestMs: this.#bestMs, done: this.#done }; }
  static fromJSON(o) {
    const t = new this(o.targetMs);
    t.#offSince = o.offSince; t.#bestMs = o.bestMs; t.#done = o.done;
    return t;
  }
}

/** Check.AWAY: "step away from the computer for N min". Same rules as PhoneDownTimer, desktop names. */
export class AwayTimer extends PhoneDownTimer {
  /** chrome.idle went 'idle' or 'locked'. */
  onAway(now) { this.onScreenOff(now); }
  /** chrome.idle went 'active'. Returns true if this completes the bribe. */
  onBack(now) { return this.onScreenOn(now); }
}

/**
 * JS-only. An unbroken stretch of "nothing happened" for targetMs, checked while it runs:
 *  - Check.EYE_BREAK: 20 s with no input while Kaak's page counts down (any input restarts),
 *  - Check.NO_FEED: no feed tab open for N minutes (a feed tab opening stops it; closing the
 *    last one starts it again),
 *  - Check.FOCUS: no feed tab while Kaak's focus timer runs.
 * Once done, it stays done.
 */
export class SteadyTimer {
  #targetMs;
  #since = null;
  #bestMs = 0;
  #done = false;

  constructor(targetMs) {
    this.#targetMs = targetMs;
  }

  get targetMs() { return this.#targetMs; }
  get bestMs() { return this.#bestMs; }
  get running() { return this.#since != null; }

  /** Starts a stretch (no-op if one is running or it is done). */
  start(now) {
    if (!this.#done && this.#since == null) this.#since = now;
  }

  /** The stretch is broken (input, a feed tab opened). Not running until start() again. */
  stop(now) {
    if (this.#since == null) return;
    this.done(now);
    this.#bestMs = Math.max(this.#bestMs, now - this.#since);
    this.#since = null;
  }

  /** Broken but starts over right away (eye break: any input). */
  restart(now) {
    this.stop(now);
    this.start(now);
  }

  progressMs(now) {
    if (this.#done) return this.#targetMs;
    return this.#since == null ? 0 : Math.min(now - this.#since, this.#targetMs);
  }

  done(now) {
    if (!this.#done && this.#since != null && now - this.#since >= this.#targetMs) this.#done = true;
    return this.#done;
  }

  toJSON() { return { targetMs: this.#targetMs, since: this.#since, bestMs: this.#bestMs, done: this.#done }; }
  static fromJSON(o) {
    const t = new SteadyTimer(o.targetMs);
    t.#since = o.since; t.#bestMs = o.bestMs; t.#done = o.done;
    return t;
  }
}

/**
 * App-time bribes (Kotlin AppTimeGoal): one of `ids` in the foreground for targetMs in total.
 * Desktop: Check.SITE_TIME, ids = learning-site ids, fed with the focused tab's site
 * (or null when the focused tab is anything else or the window lost focus).
 */
export class AppTimeGoal {
  #ids;
  #targetMs;
  #accMs = 0;
  #since = null;

  constructor(ids, targetMs) {
    this.#ids = new Set(ids);
    this.#targetMs = targetMs;
  }

  get packages() { return this.#ids; }
  get targetMs() { return this.#targetMs; }

  onForeground(id, now) {
    this.pause(now);
    if (id != null && this.#ids.has(id)) this.#since = now;
  }

  pause(now) {
    if (this.#since != null) this.#accMs += now - this.#since;
    this.#since = null;
  }

  progressMs(now) { return this.#accMs + (this.#since != null ? now - this.#since : 0); }
  done(now) { return this.progressMs(now) >= this.#targetMs; }

  toJSON() { return { ids: [...this.#ids], targetMs: this.#targetMs, accMs: this.#accMs, since: this.#since }; }
  static fromJSON(o) {
    const g = new this(o.ids, o.targetMs);
    g.#accMs = o.accMs; g.#since = o.since;
    return g;
  }
}

/** Desktop name for AppTimeGoal: time on a learning site. */
export class SiteTimeGoal extends AppTimeGoal {}

// ---------------------------------------------------------------------------
// Bedtime and the morning gift. Kotlin uses LocalDateTime; here Dates are read as local
// wall-clock time (no DST surprises: comparisons use wall-clock fields).

const wall = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

/** dayKeyOf(date) = yyyymmdd as a number, from local time. */
export function dayKeyOf(date) {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export const Bedtime = Object.freeze({
  WAKE_MINUTE: 5 * 60,

  isBedtime(minuteOfDay, bedtimeMinute) {
    return bedtimeMinute >= Bedtime.WAKE_MINUTE
      ? minuteOfDay >= bedtimeMinute || minuteOfDay < Bedtime.WAKE_MINUTE
      : minuteOfDay >= bedtimeMinute && minuteOfDay < Bedtime.WAKE_MINUTE;
  },

  /** The most recent bedtime at or before `now` (a local Date). */
  lastBedtimeStart(now, bedtimeMinute) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.trunc(bedtimeMinute / 60), bedtimeMinute % 60);
    if (wall(today) > wall(now)) today.setDate(today.getDate() - 1);
    return today;
  },

  /**
   * Morning gift: between 5 and 11 a.m., once a day, if no feed was opened after last night's
   * bedtime (and Kaak was already installed by then).
   * @param {Date} now @param {number} bedtimeMinute
   * @param {number|Date|null} lastGiftDate a dayKey (or a Date) of the last gift
   * @param {Date|null} lastFeedUse @param {Date} installedAt
   */
  morningGift(now, bedtimeMinute, lastGiftDate, lastFeedUse, installedAt) {
    const h = now.getHours();
    if (h < 5 || h > 11) return false;
    const giftKey = lastGiftDate instanceof Date ? dayKeyOf(lastGiftDate) : lastGiftDate;
    if (giftKey === dayKeyOf(now)) return false;
    const bed = Bedtime.lastBedtimeStart(now, bedtimeMinute);
    if (wall(now) - wall(bed) > 14 * 60 * 60_000) return false;
    if (wall(installedAt) > wall(bed)) return false;
    return lastFeedUse == null || wall(lastFeedUse) < wall(bed);
  },
});
