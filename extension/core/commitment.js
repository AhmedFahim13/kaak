// Port of app/src/main/java/app/kaak/core/Commitment.kt (app v0.10.x).
// Skipped: StrictPlan.TAP_ARM_MS, SETTINGS_PACKAGES, isQuitScreen/names and KaakTapWatch
// (Android Settings/launcher guards; a browser extension can't see or block chrome://extensions).
import { MINUTE_MS } from './model.js';

/** A different sentence each time (with today's numbers in it), so it can't be pasted or typed from memory. */
const TEMPLATES = Object.freeze([
  'I choose to scroll instead of resting, escape number %d today.',
  'Kaak is asleep and I am waking him for %d more reels.',
  'I am trading %d minutes of my day for this feed.',
  'This is escape %d today and I know exactly what I am doing.',
  'I could walk %d hundred steps right now but I want the feed.',
]);

const floorMod = (a, n) => ((a % n) + n) % n;

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.trim() !== '').join(' ');

/**
 * Friction for the two ways out: going into a feed during a nap, and quitting Kaak.
 * Slow and deliberate, never impossible: the point is to outlast an impulse.
 */
export const EscapeRules = Object.freeze({
  /** Pass length: after this the nap cover comes back. */
  PASS_MS: 5 * MINUTE_MS,

  TEMPLATES,

  phrase(escapesToday, dayKey, minutes) {
    const t = TEMPLATES[floorMod(escapesToday + dayKey, TEMPLATES.length)];
    const n = t.indexOf('%d') === -1 ? 0 : t.includes('escape') ? escapesToday + 1 : Math.max(minutes, 1);
    return t.replace('%d', String(n));
  },

  /** 20 s the first time today, then 40, 60, and 90 s from then on. */
  holdSeconds(escapesToday) {
    return [20, 40, 60, 90][Math.min(Math.max(escapesToday, 0), 3)];
  },

  /** One keyboard insertion longer than this is a paste, not typing (swiped words stay well under it). */
  MAX_INSERT: 14,

  /**
   * Desktop: `beforeinput`/`input` inputTypes that are a paste or drop. The escape page also
   * blocks the `paste` and `drop` events outright.
   */
  PASTE_INPUT_TYPES: Object.freeze(['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'insertFromYank']),

  /**
   * True if one input event should be rejected as pasting: a paste/drop inputType, or one
   * insertion longer than MAX_INSERT characters (Kotlin: `count - before > MAX_INSERT`).
   * @param {{inputType?: string, inserted?: number}} e inserted = characters added by this event
   */
  isPaste({ inputType = '', inserted = 0 } = {}) {
    return EscapeRules.PASTE_INPUT_TYPES.includes(inputType) || inserted > EscapeRules.MAX_INSERT;
  },

  /** Forgiving about case, spaces and punctuation; strict about the words and numbers. */
  phraseOk(typed, phrase) {
    return norm(typed) === norm(phrase);
  },
});

/** The app's three strict-mode choices (MainActivity "Strict mode" pills). */
const CHOICES = Object.freeze([
  Object.freeze({ id: 'until23', label: 'Until 23:00' }),
  Object.freeze({ id: 'day', label: '24 hours' }),
  Object.freeze({ id: 'week', label: '7 days' }),
]);

/**
 * Strict mode: opted into for a chosen time (max 7 days). While on, pause, feed removal
 * and limit increases are locked. Leaving early = ask, then wait COOL_OFF_MS.
 * (On desktop it cannot stop the extension being switched off: that is detected afterwards.)
 */
export const StrictPlan = Object.freeze({
  COOL_OFF_MS: 15 * MINUTE_MS,
  MAX_MS: 7 * 24 * 60 * MINUTE_MS,

  active(now, until, coolOffAt) {
    return now < until && (coolOffAt == null || now < coolOffAt + StrictPlan.COOL_OFF_MS);
  },

  coolOffLeftMs(now, coolOffAt) {
    return coolOffAt == null ? null : Math.max(coolOffAt + StrictPlan.COOL_OFF_MS - now, 0);
  },

  /** data/Strict.kt coolOffLeftMin: whole minutes left, rounded up the app's way (ms / 60 000 + 1). */
  coolOffLeftMin(now, coolOffAt) {
    const ms = StrictPlan.coolOffLeftMs(now, coolOffAt);
    return ms == null ? null : Math.trunc(ms / MINUTE_MS) + 1;
  },

  CHOICES,

  /**
   * End time (epoch ms) for a choice, from a local-time Date `now` (Kotlin uses LocalDateTime):
   * until23 = today 23:00 (tomorrow if that has passed), day = +24 h, week = +7 days.
   */
  untilFor(choiceId, now = new Date()) {
    const d = new Date(now.getTime());
    switch (choiceId) {
      case 'until23': {
        const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 0, 0, 0);
        if (t.getTime() < d.getTime()) t.setDate(t.getDate() + 1);
        return t.getTime();
      }
      case 'day': {
        d.setHours(d.getHours() + 24);
        return d.getTime();
      }
      case 'week': {
        d.setDate(d.getDate() + 7);
        return d.getTime();
      }
      default:
        throw new Error(`unknown strict choice ${choiceId}`);
    }
  },

  /** data/Strict.kt start(): never longer than MAX_MS from now. */
  capUntil(untilMs, now) {
    return Math.min(untilMs, now + StrictPlan.MAX_MS);
  },
});
