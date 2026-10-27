// Port of app/src/main/java/app/kaak/core/RuleDetector.kt (app v0.10.x).
import { MINUTE_MS } from './model.js';

export const Verdict = Object.freeze({ MINDLESS: 'MINDLESS', NOT_MINDLESS: 'NOT_MINDLESS', UNSURE: 'UNSURE' });

/** Kotlin data class Detection(verdict, reason). */
export function Detection(verdict, reason) {
  return Object.freeze({ verdict, reason });
}

const CONFIG_DEFAULTS = Object.freeze({
  // Reels and Shorts often hold you 15–40 s each, so long dwell is still mindless.
  // Only really slow browsing (under 1 swipe a minute) or typing counts as intentional.
  minSwipesPerMin: 1.0,
  maxMedianDwellMs: 45_000,
  minSwipesForVerdict: 3,
  /** No swipe for this long = watching one thing on purpose. */
  longWatchMs: 3 * MINUTE_MS,
  lateNightStartHour: 23,
  lateNightEndHour: 5,
  /** < 1 makes late-night thresholds easier to trip. */
  lateNightLeniency: 0.75,
  /** Typing within this long counts as intentional use. */
  typingGraceMs: 60_000,
});

/**
 * Cold-start thresholds. Tune these during week-1 dogfooding using the live
 * detector panel. Week 6 replaces them with a personal model.
 * DetectorConfig({ ...overrides }) is Kotlin's constructor and copy(); .forWork() is non-enumerable.
 */
export function DetectorConfig(overrides = {}) {
  const c = { ...CONFIG_DEFAULTS };
  for (const k of Object.keys(CONFIG_DEFAULTS)) if (overrides[k] !== undefined) c[k] = overrides[k];
  /** Work hours: Kaak needs much stronger evidence before calling it mindless. */
  Object.defineProperty(c, 'forWork', {
    enumerable: false,
    value: () => DetectorConfig({
      ...c,
      minSwipesPerMin: c.minSwipesPerMin * 1.5,
      maxMedianDwellMs: Math.trunc(c.maxMedianDwellMs * 0.66),
      typingGraceMs: 3 * MINUTE_MS,
    }),
  });
  return Object.freeze(c);
}

export class RuleDetector {
  #config;

  constructor(config = DetectorConfig()) {
    this.#config = config;
  }

  get config() { return this.#config; }

  isLateNight(hourOfDay) {
    return hourOfDay >= this.#config.lateNightStartHour || hourOfDay < this.#config.lateNightEndHour;
  }

  evaluate(stats, hourOfDay) {
    const config = this.#config;
    const typed = stats.msSinceTyping != null ? stats.msSinceTyping <= config.typingGraceMs : stats.typedRecently;
    if (typed) return Detection(Verdict.NOT_MINDLESS, 'typing');
    if (stats.msSinceActivity > config.longWatchMs) {
      return Detection(Verdict.NOT_MINDLESS, 'watching one thing');
    }
    if (stats.swipesInWindow < config.minSwipesForVerdict || stats.medianDwellMs == null) {
      return Detection(Verdict.UNSURE, 'not enough scrolling yet');
    }
    const night = this.isLateNight(hourOfDay);
    const minRate = night ? config.minSwipesPerMin * config.lateNightLeniency : config.minSwipesPerMin;
    const maxDwell = night ? Math.trunc(config.maxMedianDwellMs / config.lateNightLeniency) : config.maxMedianDwellMs;
    return stats.swipesPerMin >= minRate && stats.medianDwellMs <= maxDwell
      ? Detection(Verdict.MINDLESS, night ? 'fast swipes, short dwell, late night' : 'fast swipes, short dwell')
      : Detection(Verdict.NOT_MINDLESS, 'slow browsing');
  }
}
