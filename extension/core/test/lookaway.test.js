// JS-only: lookAway()/lookBack(). Desktop decision: switching tabs or windows is looking away,
// not leaving. Only closing the feed tab or navigating off a feed is onForeground(false).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Action, MINUTE_MS, rules } from '../model.js';
import { KaakBrain } from '../kaak-brain.js';
import { Random } from './kotlin-random.js';
import { DAY, NOON, TICK, has, scrollFor } from './helpers.js';

function arrived({ seed = 5, ...r } = {}) {
  const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false, ...r }), random: Random(seed) });
  b.onForeground(true, 0);
  const [t, a] = scrollFor(b, 0, 11.0, 5_000);
  assert.ok(has(a, 'Arrive'));
  return [b, t];
}

/** Ticks (and scrolls) every TICK for `ms` while looking away; returns the actions. */
function awayFor(b, from, ms, { scroll = true, day = DAY } = {}) {
  const out = [];
  for (let t = from + TICK; t <= from + ms; t += TICK) {
    if (scroll) { b.onScroll(t); b.onTyping(t); }
    const s = b.tick(t, NOON, day);
    assert.equal(s.lookingAway, true);
    out.push(s.action);
  }
  return out;
}

describe('lookAway / lookBack', () => {
  test('no time is credited and nothing happens while looking away', () => {
    const [b, t] = arrived();
    const before = { active: b.activeMs, mindless: b.mindlessMs, daily: b.dailyMs, swipes: b.toJSON().tracker.totalSwipes };
    assert.equal(b.lookAway(t), Action.None);
    assert.ok(b.lookingAway);
    const acts = awayFor(b, t, 10 * MINUTE_MS);
    assert.ok(acts.every((a) => a === Action.None));
    assert.equal(b.activeMs, before.active);
    assert.equal(b.mindlessMs, before.mindless);
    assert.equal(b.dailyMs, before.daily);
    assert.equal(b.toJSON().tracker.totalSwipes, before.swipes, 'scrolls ignored while away');
    assert.equal(b.toJSON().tracker.lastTypingAt, null, 'typing ignored while away');
  });

  test('lookBack restarts the clock: the gap is not counted', () => {
    const [b, t] = arrived();
    b.lookAway(t);
    const back = t + 10 * MINUTE_MS;
    assert.equal(b.lookBack(back), Action.None);
    assert.ok(!b.lookingAway);
    const active = b.activeMs;
    b.onScroll(back + 1_000);
    b.tick(back + TICK, NOON, DAY);
    assert.equal(b.activeMs - active, TICK); // not maxTickMs (15 s) for the 10-minute gap
  });

  test('looking away is not leaving: no theft, no "again?", no Resume', () => {
    const [b, t] = arrived();
    b.lookAway(t);
    assert.equal(b.lookBack(t + 30_000), Action.None);
    b.lookAway(t + 40_000);
    // focusing a feed tab again (onForeground(true) while still in a feed) is looking back too
    assert.equal(b.onForeground(true, t + 70_000), Action.None);
    assert.ok(!b.lookingAway);
    assert.equal(b.toJSON().state.leftAt, null);
    assert.equal(b.stolenUntil, null);
  });

  test('a real leave after looking back still behaves like the app', () => {
    const [b, t] = arrived();
    b.lookAway(t);
    b.lookBack(t + 60_000);
    const [t2] = scrollFor(b, t + 60_000, 0.5, 5_000);
    assert.equal(b.onForeground(false, t2), Action.Hide);
    assert.equal(b.onForeground(true, t2 + 30_000), Action.Steal);
  });

  test('a look-away under 30 minutes keeps the session', () => {
    const [b, t] = arrived();
    const mindless = b.mindlessMs;
    b.lookAway(t);
    awayFor(b, t, 20 * MINUTE_MS);
    assert.equal(b.lookBack(t + 20 * MINUTE_MS), Action.None);
    assert.equal(b.mindlessMs, mindless);
    assert.equal(b.toJSON().state.arrived, true);
  });

  test('a look-away over 30 minutes ends the session on lookBack (and only then)', () => {
    const ends = [];
    const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false }), random: Random(5), onSessionEnd: (s) => ends.push(s) });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, 5_000);
    b.lookAway(t);
    awayFor(b, t, 40 * MINUTE_MS);
    assert.equal(ends.length, 0, 'ticks while looking away do not end the session');
    assert.equal(b.lookBack(t + 40 * MINUTE_MS), Action.Hide); // Kaak had arrived: overlay removes him
    assert.equal(ends.length, 1);
    assert.equal(ends[0].arrived, true);
    assert.equal(b.mindlessMs, 0);
    assert.equal(b.activeMs, 0);
    assert.ok(b.inFeed);
    // a fresh session: Kaak needs another 10 mindless minutes
    const [, again] = scrollFor(b, t + 40 * MINUTE_MS, 9.0, 5_000);
    assert.ok(!has(again, 'Arrive'));
  });

  test('a long look-away before Kaak arrived ends the session quietly', () => {
    const b = new KaakBrain({ random: Random(1) });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 3.0, 5_000);
    b.lookAway(t);
    assert.equal(b.lookBack(t + 31 * MINUTE_MS), Action.None);
    assert.equal(b.activeMs, 0);
  });

  test('closing the feed tab while looking away is leaving', () => {
    const [b, t] = arrived();
    b.lookAway(t);
    assert.equal(b.onForeground(false, t + 60_000), Action.Hide);
    assert.ok(!b.lookingAway);
    assert.equal(b.toJSON().state.leftAt, t + 60_000);
    assert.equal(b.onForeground(true, t + 90_000), Action.Steal); // within 2 min of closing it
  });

  test('closing the tab after a long look-away starts from a fresh session', () => {
    const [b, t] = arrived();
    b.lookAway(t);
    assert.equal(b.onForeground(false, t + 45 * MINUTE_MS), Action.Hide);
    assert.equal(b.onForeground(true, t + 45 * MINUTE_MS + 30_000), Action.None); // no theft: session over
  });

  test('lookAway outside a feed, or twice, does nothing', () => {
    const b = new KaakBrain({ random: Random(1) });
    assert.equal(b.lookAway(0), Action.None);
    assert.ok(!b.lookingAway);
    assert.equal(b.lookBack(10), Action.None);
    b.onForeground(true, 100);
    b.lookAway(200);
    b.lookAway(5_000);
    assert.equal(b.lookingAwaySince, 200);
  });

  test('the nap can end while looking away; looking back then wakes Kaak', () => {
    const b = new KaakBrain({ rules: rules({ dailyLimitMs: 10 * MINUTE_MS, jumpscareAllowed: false }), random: Random(4) });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, 5_000);
    assert.ok(b.blocked);
    b.lookAway(t);
    awayFor(b, t, 25 * MINUTE_MS, { scroll: false });
    b.lookBack(t + 25 * MINUTE_MS);
    assert.equal(b.tick(t + 25 * MINUTE_MS + TICK, NOON, DAY).action, Action.Wake);
  });

  test('an escape pass that ran out while looking away brings the cover back', () => {
    const b = new KaakBrain({ rules: rules({ dailyLimitMs: 10 * MINUTE_MS, jumpscareAllowed: false }), random: Random(4) });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, 5_000);
    b.escape(t);
    b.lookAway(t + MINUTE_MS);
    b.lookBack(t + 8 * MINUTE_MS);
    assert.equal(b.tick(t + 8 * MINUTE_MS + TICK, NOON, DAY).action.type, 'Asleep');
  });

  test('the day still rolls over while looking away', () => {
    const b = new KaakBrain({ random: Random(1) });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 5.0, 5_000);
    assert.ok(b.dailyMs > 4 * MINUTE_MS);
    b.lookAway(t);
    b.tick(t + TICK, NOON, DAY + 1);
    assert.equal(b.dailyMs, 0);
  });
});
