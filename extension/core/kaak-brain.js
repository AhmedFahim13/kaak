// Port of app/src/main/java/app/kaak/core/KaakBrain.kt (app v0.10.x).
// JS-only additions: toJSON()/fromJSON() (MV3 kills the worker every ~30 s) and
// lookAway()/lookBack() (desktop: switching tabs/windows is not leaving).
import {
  Action, FOREVER, Gag, LONG_AGO, MINUTE_MS, defaultRandom, pickRandom, rules as makeRules, rulesToJSON,
} from './model.js';
import { ScrollTracker } from './scroll-tracker.js';
import { DetectorConfig, RuleDetector, Verdict } from './rule-detector.js';
import { EscapeRules } from './commitment.js';

/** Kotlin data class SessionSummary. */
export function SessionSummary(activeMs, mindlessMs, swipes, actions, arrived) {
  return Object.freeze({ activeMs, mindlessMs, swipes, actions, arrived });
}

/** Behaviour stats attached to a "Was that worth it?" answer: training data for week 6. */
export function LabelContext(visitMs, mindlessMs, swipesPerMin, medianDwellMs, verdict, hourOfDay) {
  return Object.freeze({ visitMs, mindlessMs, swipesPerMin, medianDwellMs, verdict, hourOfDay });
}

/** What tick() returns. `lookingAway` is a JS-only extra field. */
export function Snapshot(action, detection, stats, activeMs, mindlessMs, dailyMs, inFeed, eatenUntil, lookingAway = false) {
  return Object.freeze({ action, detection, stats, activeMs, mindlessMs, dailyMs, inFeed, eatenUntil, lookingAway });
}

const PARAM_DEFAULTS = Object.freeze({
  resetAfterAwayMs: 30 * MINUTE_MS,
  /** Caps time credited per tick, so a sleeping phone does not count as scrolling. */
  maxTickMs: 15_000,
  stealWindowMs: 2 * MINUTE_MS,
  stealCooldownMs: 5 * MINUTE_MS,
  eatCooldownMs: 20 * MINUTE_MS,
  graceAfterEatMs: 10 * MINUTE_MS,
  jumpscareChancePerTick: 0.08,
  labelChance: 0.25,
  /** No two interruptions closer than this (the warning and eating excepted): a constant stream becomes wallpaper. */
  minSpacingMs: 15_000,
  /** Away for less than this (a share sheet, a permission dialog) doesn't count as leaving. */
  quickHopMs: 10_000,
});

/** Fields of the brain's mutable state, in the order Kotlin declares them. Used by toJSON/fromJSON. */
const STATE_FIELDS = [
  'inFeed', 'blocked', 'activeMs', 'mindlessMs', 'dailyMs', 'eatenUntil',
  'day', 'nextEatAtMs', 'warned', 'escapeUntil',
  'hasSession', 'leftAt', 'lastTickAt', 'arrived', 'jumpscared', 'lastActionAt', 'nextGapMs', 'lastGag',
  'lastStealAt', 'lastNudgeAt', 'lastAnyAt', 'stolenUntil', 'actions',
  'visitStartActive', 'visitStartMindless', 'lastStats', 'lastDetection', 'pendingLabel',
  'lookingAwaySince',
];

/**
 * Pure decision logic, no browser APIs. The service worker feeds it foreground changes,
 * scroll/typing events and a tick every few seconds; it answers with an Action.
 *
 * Session: every visit to a feed until the user has been away for resetAfterAwayMs.
 * Escalation (arrival, heckles, jumpscare) resets with it.
 * Day: feed time counted toward the daily limit; resets at midnight.
 */
export class KaakBrain {
  /** Settings for this tick; assign a new rules({...}) object to change them (Kotlin `var rules`). */
  rules;
  /** Called with a SessionSummary when a session ends (Kotlin `var onSessionEnd`). */
  onSessionEnd;

  #config;
  #random;
  #p; // the constructor's numeric parameters
  #tracker = new ScrollTracker();
  #detector;
  #workDetector;

  #s = {
    inFeed: false,
    /** True while the asleep screen is covering a feed. */
    blocked: false,
    activeMs: 0,
    mindlessMs: 0,
    dailyMs: 0,
    eatenUntil: null,

    day: -1,
    nextEatAtMs: 0,
    warned: false,
    /** A time-boxed pass into feeds during a nap; when it runs out the nap cover returns. */
    escapeUntil: null,

    hasSession: false,
    leftAt: null,
    lastTickAt: null,
    arrived: false,
    jumpscared: false,
    lastActionAt: 0,
    nextGapMs: 0,
    lastGag: null,
    lastStealAt: null,
    lastNudgeAt: 0,
    lastAnyAt: LONG_AGO,
    /** While set, every feed is bounced home: Kaak still has it. FOREVER = until the chase is won. */
    stolenUntil: null,
    actions: 0,

    visitStartActive: 0,
    visitStartMindless: 0,
    lastStats: null,
    lastDetection: null,
    pendingLabel: null,

    /** JS-only: set while the feed tab is open but not focused (another tab/window is in front). */
    lookingAwaySince: null,
  };

  /**
   * @param {object} [o]
   * @param {object} [o.rules]  from rules({...})
   * @param {object} [o.config] from DetectorConfig({...})
   * @param {{nextDouble():number, nextInt?(n:number):number}} [o.random]
   * @param {(s:object)=>void} [o.onSessionEnd]
   * plus every numeric parameter of the Kotlin constructor (resetAfterAwayMs, maxTickMs, ...).
   */
  constructor(o = {}) {
    this.rules = o.rules ?? makeRules();
    this.#config = o.config ?? DetectorConfig();
    this.#random = o.random ?? defaultRandom;
    this.onSessionEnd = o.onSessionEnd ?? null;
    const p = {};
    for (const k of Object.keys(PARAM_DEFAULTS)) p[k] = o[k] ?? PARAM_DEFAULTS[k];
    this.#p = Object.freeze(p);
    this.#detector = new RuleDetector(this.#config);
    this.#workDetector = new RuleDetector(this.#config.forWork());
  }

  // --- read-only state (Kotlin `private set`) ---
  get inFeed() { return this.#s.inFeed; }
  get blocked() { return this.#s.blocked; }
  get activeMs() { return this.#s.activeMs; }
  get mindlessMs() { return this.#s.mindlessMs; }
  get dailyMs() { return this.#s.dailyMs; }
  get eatenUntil() { return this.#s.eatenUntil; }
  get escapeUntil() { return this.#s.escapeUntil; }
  get stolenUntil() { return this.#s.stolenUntil; }
  /** JS-only. */
  get lookingAway() { return this.#s.lookingAwaySince != null; }
  get lookingAwaySince() { return this.#s.lookingAwaySince; }

  onForeground(isFeedApp, now, hourOfDay = 12) {
    const s = this.#s;
    const p = this.#p;
    if (isFeedApp) {
      if (s.inFeed) {
        // JS: focusing a feed tab again while looking away is looking back
        if (s.lookingAwaySince != null) return this.lookBack(now);
        return Action.None; // switching between two feed apps
      }
      if (s.stolenUntil != null) { if (now < s.stolenUntil) return Action.Bounce; else s.stolenUntil = null; }
      const away = s.leftAt != null ? now - s.leftAt : null;
      if (away != null && away > p.resetAfterAwayMs) this.endSession();
      s.hasSession = true;
      s.inFeed = true;
      s.leftAt = null;
      s.lastTickAt = now;
      s.lookingAwaySince = null;
      this.#tracker.start(now);
      s.visitStartActive = s.activeMs;
      s.visitStartMindless = s.mindlessMs;

      const until = s.eatenUntil;
      const passing = s.escapeUntil != null && now < s.escapeUntil;
      if (until != null && now < until && !passing) {
        s.blocked = true;
        return Action.Asleep(minutesLeft(until, now));
      }
      if (away != null && away < p.quickHopMs) return s.arrived ? Action.Resume : Action.None;
      const stealReady = s.lastStealAt != null ? now - s.lastStealAt >= p.stealCooldownMs : true;
      const maySteal = this.rules.trust.steals && !this.rules.work && !this.rules.quiet;
      if (s.arrived && maySteal && away != null && away <= p.stealWindowMs && stealReady) {
        s.lastStealAt = now;
        s.stolenUntil = FOREVER;
        s.actions++;
        return Action.Steal;
      }
      if (s.arrived) {
        // a "back again" does not reset the gag timer, or coming back often would mean fewer gags
        s.actions++;
        s.lastAnyAt = now;
        return Action.Return;
      }
      return Action.None;
    }
    if (!s.inFeed) return Action.None;
    // JS: closing the feed tab while looking away. A long look-away already ended the session.
    if (s.lookingAwaySince != null) {
      const looked = now - s.lookingAwaySince;
      s.lookingAwaySince = null;
      if (looked > p.resetAfterAwayMs) this.endSession();
    }
    const visitMs = s.activeMs - s.visitStartActive;
    if (!s.blocked && visitMs >= 3 * MINUTE_MS && this.#random.nextDouble() < p.labelChance) {
      s.pendingLabel = LabelContext(
        visitMs, s.mindlessMs - s.visitStartMindless,
        s.lastStats?.swipesPerMin ?? null, s.lastStats?.medianDwellMs ?? null, s.lastDetection?.verdict ?? null, hourOfDay,
      );
    }
    s.inFeed = false;
    s.blocked = false;
    s.leftAt = now;
    s.lastTickAt = null;
    return Action.Hide;
  }

  onScroll(now) {
    const s = this.#s;
    if (s.inFeed && !s.blocked && s.lookingAwaySince == null) this.#tracker.onScroll(now);
  }

  onTyping(now) {
    const s = this.#s;
    if (s.inFeed && !s.blocked && s.lookingAwaySince == null) this.#tracker.onTyping(now);
  }

  /**
   * JS-only. The feed tab is still open but another tab or window is in front: the clock
   * pauses and Kaak waits where he is. Not leaving: no leftAt, no theft, no "back again".
   * No-op unless in a feed (or already looking away).
   */
  lookAway(now) {
    const s = this.#s;
    if (!s.inFeed || s.lookingAwaySince != null) return Action.None;
    s.lookingAwaySince = now;
    return Action.None;
  }

  /**
   * JS-only. Back on the feed tab. The time away is not credited. A look-away longer than
   * resetAfterAwayMs ends the session (as the app does after 30 min away): returns Action.Hide
   * then if Kaak had arrived (so the overlay removes him), otherwise Action.None.
   */
  lookBack(now) {
    const s = this.#s;
    if (s.lookingAwaySince == null) return Action.None;
    const looked = now - s.lookingAwaySince;
    s.lookingAwaySince = null;
    if (!s.inFeed) return Action.None;
    s.lastTickAt = now;
    if (looked > this.#p.resetAfterAwayMs) {
      const hadKaak = s.arrived;
      this.endSession();
      return hadKaak ? Action.Hide : Action.None;
    }
    return Action.None;
  }

  /** The user went through the escape screen (hold + typed sentence): in for passMs, then the nap returns. */
  escape(now, passMs = EscapeRules.PASS_MS) {
    const s = this.#s;
    s.escapeUntil = now + passMs;
    if (s.blocked) { s.blocked = false; s.lastTickAt = now; }
  }

  /** The user tapped Kaak 5 times after a theft. No more thefts for a while. */
  chaseWon(now) {
    this.#s.lastStealAt = now;
    this.#s.stolenUntil = null;
  }

  /** The user ignored the chase: Kaak keeps the feeds for lockMs. */
  chaseLost(now, lockMs = 3 * MINUTE_MS) {
    this.#s.stolenUntil = now + lockMs;
  }

  /** Kaak's own page was opened from a feed: not a real exit, so no theft on the way back. */
  forgiveNextReturn(now) {
    this.#s.lastStealAt = now;
  }

  /** Returns (once) a visit worth asking "Was that worth it?" about. */
  takeLabel() {
    const l = this.#s.pendingLabel;
    this.#s.pendingLabel = null;
    return l;
  }

  tick(now, hourOfDay, dayKey) {
    const s = this.#s;
    const p = this.#p;
    this.#rollDay(dayKey);
    if (!s.inFeed) {
      const away = s.leftAt != null ? now - s.leftAt : null;
      if (s.hasSession && away != null && away > p.resetAfterAwayMs) this.endSession();
      if (s.eatenUntil != null && now >= s.eatenUntil) s.eatenUntil = null;
      return this.#snapshot(Action.None, null, null);
    }
    // JS: looking away credits nothing and decides nothing; lookBack() restarts the clock
    if (s.lookingAwaySince != null) return this.#snapshot(Action.None, null, null);
    if (s.blocked) {
      s.lastTickAt = now;
      const until = s.eatenUntil;
      if (until == null || now >= until) {
        s.blocked = false;
        s.eatenUntil = null;
        return this.#snapshot(Action.Wake, null, null);
      }
      return this.#snapshot(Action.None, null, null);
    }
    // the escape pass ran out while still in a feed during the nap: cover comes back
    const nap = s.eatenUntil;
    const pass = s.escapeUntil;
    if (nap != null && now < nap && pass != null && now >= pass) {
      s.escapeUntil = null;
      s.blocked = true;
      return this.#snapshot(Action.Asleep(minutesLeft(nap, now)), null, null);
    }
    const dt = Math.min(Math.max(now - (s.lastTickAt ?? now), 0), p.maxTickMs);
    s.lastTickAt = now;
    const stats = this.#tracker.stats(now);
    const detection = (this.rules.work ? this.#workDetector : this.#detector).evaluate(stats, hourOfDay);
    s.lastStats = stats;
    s.lastDetection = detection;
    s.activeMs += dt;
    if (detection.verdict !== Verdict.NOT_MINDLESS) s.mindlessMs += dt;
    // the daily limit counts all feed time except typing (messages, comments, search)
    // and one long video watched on purpose (a lecture, a recipe)
    const intentional = detection.verdict === Verdict.NOT_MINDLESS &&
      (detection.reason === 'typing' || detection.reason === 'watching one thing');
    if (!intentional) s.dailyMs += dt;
    if (s.eatenUntil != null && now >= s.eatenUntil) s.eatenUntil = null;
    const action = this.#decide(now, detection.verdict);
    if (action.type !== 'None') { s.actions++; s.lastAnyAt = now; }
    return this.#snapshot(action, detection, stats);
  }

  /** Call when the service stops, so the last session still gets logged. */
  endSession() {
    const s = this.#s;
    if (s.hasSession && s.activeMs > 0) {
      this.onSessionEnd?.(SessionSummary(s.activeMs, s.mindlessMs, this.#tracker.totalSwipes, s.actions, s.arrived));
    }
    this.#tracker.reset();
    s.hasSession = false;
    s.activeMs = 0;
    s.mindlessMs = 0;
    s.arrived = false;
    s.jumpscared = false;
    s.lastActionAt = 0;
    s.nextGapMs = 0;
    s.lastGag = null;
    s.lastStealAt = null;
    s.stolenUntil = null;
    s.lastNudgeAt = 0;
    s.actions = 0;
    s.visitStartActive = 0;
    s.visitStartMindless = 0;
    if (s.inFeed) {
      s.hasSession = true;
      if (s.lastTickAt != null) this.#tracker.start(s.lastTickAt);
    }
  }

  #decide(now, verdict) {
    const s = this.#s;
    const p = this.#p;
    const rules = this.rules;
    // 1. Daily limit. Applies even in quiet hour; skipped while an escape pass runs.
    if (!(s.escapeUntil != null && now < s.escapeUntil)) {
      const threshold = Math.max(rules.dailyLimitMs + rules.bonusMs, s.nextEatAtMs);
      if (s.dailyMs >= threshold) {
        s.eatenUntil = now + p.eatCooldownMs;
        s.nextEatAtMs = s.dailyMs + p.graceAfterEatMs;
        s.warned = false;
        s.blocked = true;
        s.lastActionAt = now;
        return Action.Eat;
      }
      if (!s.warned && s.dailyMs >= threshold - rules.trust.warnBeforeMin * MINUTE_MS) {
        s.warned = true;
        return Action.Warn(minutesLeft(threshold - s.dailyMs, 0));
      }
    }
    if (rules.quiet) return Action.None;

    // 2. Escalation. At bedtime any scrolling counts and Kaak shows up sooner.
    const bedtime = rules.bedtime;
    const counts = bedtime ? verdict !== Verdict.NOT_MINDLESS : verdict === Verdict.MINDLESS;
    if (!counts) return Action.None;
    const arrivalBase = rules.arrivalMs ?? rules.chaos.arrivalMs;
    const heckleBase = rules.heckleMs ?? rules.chaos.heckleMs;
    const arrivalMs = bedtime ? Math.min(arrivalBase, 3 * MINUTE_MS) : arrivalBase;
    const heckleMs = bedtime ? Math.min(heckleBase, 6 * MINUTE_MS) : heckleBase;

    if (!s.arrived) {
      if (s.mindlessMs < arrivalMs) return Action.None;
      s.arrived = true;
      s.lastActionAt = now;
      s.nextGapMs = this.#jitteredGap();
      return Action.Arrive;
    }
    const tooSoon = now - s.lastAnyAt < p.minSpacingMs;
    if (s.mindlessMs < heckleMs) return tooSoon ? Action.None : this.#nudge(now, FOREVER);

    if (!tooSoon && !bedtime && !rules.work && rules.jumpscareAllowed && !s.jumpscared && s.mindlessMs >= arrivalMs * 2 &&
      now - s.lastActionAt >= 30_000 && this.#random.nextDouble() < p.jumpscareChancePerTick * rules.trust.jumpscareFactor
    ) {
      s.jumpscared = true;
      s.lastActionAt = now;
      return Action.Jumpscare;
    }

    if (tooSoon) return Action.None;
    const gagDueIn = s.nextGapMs - (now - s.lastActionAt);
    if (gagDueIn > 0) return this.#nudge(now, gagDueIn);
    const gag = pickRandom(Gag.entries.filter((g) => g !== s.lastGag), this.#random);
    s.lastGag = gag;
    s.lastActionAt = now;
    s.nextGapMs = this.#jitteredGap();
    return Action.Heckle(gag, Math.trunc(s.dailyMs / MINUTE_MS));
  }

  #nudge(now, gagDueInMs) {
    const s = this.#s;
    if (gagDueInMs < this.#p.minSpacingMs) return Action.None; // a gag is about to happen: don't poke right before it
    if (now - Math.max(s.lastActionAt, s.lastNudgeAt) < this.rules.nudgeMs) return Action.None;
    s.lastNudgeAt = now;
    return Action.Nudge(Math.trunc(s.dailyMs / MINUTE_MS));
  }

  #rollDay(dayKey) {
    const s = this.#s;
    if (s.day === dayKey) return;
    if (s.day !== -1) {
      s.dailyMs = 0;
      s.nextEatAtMs = 0;
      s.warned = false;
    }
    s.day = dayKey;
  }

  #jitteredGap() {
    const r = this.rules;
    const calm = r.trust.gapFactor * (r.work ? 1.5 : 1.0);
    return Math.trunc((r.gapMs ?? r.chaos.gapMs) * calm * (0.7 + this.#random.nextDouble() * 0.6));
  }

  #snapshot(action, detection, stats) {
    const s = this.#s;
    return Snapshot(action, detection, stats, s.activeMs, s.mindlessMs, s.dailyMs, s.inFeed, s.eatenUntil, s.lookingAwaySince != null);
  }

  // --- JS-only: persistence across MV3 service worker restarts ---

  /** Every bit of state as a plain JSON-safe object (rules, detector config, parameters, tracker, private fields). */
  toJSON() {
    const s = this.#s;
    const state = {};
    for (const k of STATE_FIELDS) state[k] = s[k];
    state.lastGag = s.lastGag ? s.lastGag.name : null;
    return {
      v: 1,
      rules: rulesToJSON(this.rules),
      config: { ...this.#config },
      params: { ...this.#p },
      tracker: this.#tracker.toJSON(),
      state,
    };
  }

  /**
   * Restores a brain from toJSON() output (also after JSON.stringify/parse or chrome.storage).
   * The random source and the session-end callback are not state: pass them again.
   */
  static fromJSON(obj, { random, onSessionEnd } = {}) {
    if (!obj || obj.v !== 1) throw new Error('KaakBrain.fromJSON: unknown snapshot version');
    const b = new KaakBrain({
      ...obj.params,
      rules: makeRules(obj.rules),
      config: DetectorConfig(obj.config),
      random,
      onSessionEnd,
    });
    b.#tracker = ScrollTracker.fromJSON(obj.tracker);
    for (const k of STATE_FIELDS) if (obj.state[k] !== undefined) b.#s[k] = obj.state[k];
    b.#s.lastGag = Gag.from(obj.state.lastGag) ?? null;
    return b;
  }
}

function minutesLeft(until, now) {
  return Math.max(Math.trunc((until - now + MINUTE_MS - 1) / MINUTE_MS), 1);
}
