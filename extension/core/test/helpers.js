// Shared test helpers (CoreTest.kt's NOON/TICK/DAY and KaakBrain.scrollFor).
import { MINUTE_MS } from '../model.js';

export const NOON = 12;
export const TICK = 5_000;
export const DAY = 20261012;

/** Simulates `minutes` in a feed with one swipe every swipeEveryMs; returns [endTime, actions]. */
export function scrollFor(brain, start, minutes, swipeEveryMs, { typing = false, hour = NOON } = {}) {
  const actions = [];
  let t = start;
  const end = start + Math.trunc(minutes * MINUTE_MS);
  let nextSwipe = start;
  while (t < end) {
    t += TICK;
    while (nextSwipe <= t) {
      // a real swipe produces a burst of scroll events
      brain.onScroll(nextSwipe); brain.onScroll(nextSwipe + 60); brain.onScroll(nextSwipe + 120);
      if (typing) brain.onTyping(nextSwipe);
      nextSwipe += swipeEveryMs;
    }
    const a = brain.tick(t, hour, DAY).action;
    if (a.type !== 'None') actions.push(a);
  }
  return [t, actions];
}

export const has = (actions, type) => actions.some((a) => a.type === type);
export const count = (actions, type) => actions.filter((a) => a.type === type).length;
export const ofType = (actions, type) => actions.filter((a) => a.type === type);
export const types = (actions) => actions.map((a) => a.type + (a.minutes != null ? `(${a.minutes})` : a.minutesLeft != null ? `(${a.minutesLeft})` : ''));
