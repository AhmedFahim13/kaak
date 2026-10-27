// Port of app/src/test/java/app/kaak/core/FixesTest.kt
// Not ported: SilentAppsTest (Signals.kt, Android-only), and the Android quit-screen / tap-watch
// parts of CommitmentTest (onlyKaaksOwnQuitScreensAreCaught, oemSettingsHomesAreWatchedToo,
// appInfoRightAfterTappingKaakIsCaught, otherTapsAndLaterSettingsVisitsAreLeftAlone,
// aSlowPickFromTheLongPressMenuStillCounts). See PARITY.md.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Action, MINUTE_MS, rules } from '../model.js';
import { KaakBrain } from '../kaak-brain.js';
import { EscapeRules, StrictPlan } from '../commitment.js';
import { Random } from './kotlin-random.js';
import { DAY, NOON, TICK, count, has, scrollFor } from './helpers.js';

/** Regression tests for the first real-phone test (Instagram, 11:27 to 12:24). */
describe('FixesTest', () => {
  function arrived(r = rules({ jumpscareAllowed: false })) {
    const b = new KaakBrain({ rules: r, random: Random(5) });
    b.onForeground(true, 0);
    const [t, a] = scrollFor(b, 0, 11.0, 5_000);
    assert.ok(has(a, 'Arrive'));
    return [b, t];
  }

  test('reelsWithLongDwellAllCount', () => {
    const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false, dailyLimitMs: 600 * MINUTE_MS }), random: Random(1) });
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 20.0, 30_000); // one reel every 30 seconds
    assert.ok(b.dailyMs >= 19 * MINUTE_MS, `daily ${b.dailyMs / 60_000}`);
    assert.ok(has(actions, 'Arrive'));
  });

  test('theftLocksEveryFeedUntilTheChaseIsWon', () => {
    const [b, t] = arrived();
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + 30_000), Action.Steal);
    assert.equal(b.onForeground(false, t + 31_000), Action.Hide); // sent home
    assert.equal(b.onForeground(true, t + 35_000), Action.Bounce); // tapped the icon again
    assert.equal(b.onForeground(true, t + 90_000), Action.Bounce);
    b.chaseWon(t + 100_000);
    assert.notEqual(b.onForeground(true, t + 101_000).type, 'Bounce');
  });

  test('aLostChaseLocksFeedsForThreeMinutes', () => {
    const [b, t] = arrived();
    b.onForeground(false, t);
    b.onForeground(true, t + 30_000);
    b.onForeground(false, t + 31_000);
    b.chaseLost(t + 45_000);
    assert.equal(b.onForeground(true, t + 2 * MINUTE_MS), Action.Bounce);
    assert.notEqual(b.onForeground(true, t + 4 * MINUTE_MS).type, 'Bounce');
  });

  test('nudgesComeBetweenGags', () => {
    const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false, dailyLimitMs: 600 * MINUTE_MS }), random: Random(2) });
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 30.0, 5_000);
    const nudges = count(actions, 'Nudge');
    const gags = count(actions, 'Heckle');
    assert.ok(nudges >= 12, `nudges ${nudges}`);
    assert.ok(gags >= 4, `gags ${gags}`);
  });

  test('comingBackOftenDoesNotDelayGags', () => {
    const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false, dailyLimitMs: 600 * MINUTE_MS }), random: Random(4) });
    b.onForeground(true, 0);
    let t = scrollFor(b, 0, 15.0, 5_000)[0];
    let gags = 0;
    for (let i = 0; i < 10; i++) { // leave for 3 minutes and come back, ten times
      b.onForeground(false, t); t += 3 * MINUTE_MS; b.onForeground(true, t);
      const [t2, a] = scrollFor(b, t, 2.0, 5_000); t = t2;
      gags += count(a, 'Heckle');
    }
    assert.ok(gags >= 5, `gags ${gags}`);
  });

  test('sliderValuesOverrideTheChaosPreset', () => {
    const b = new KaakBrain({ rules: rules({ arrivalMs: 2 * MINUTE_MS, heckleMs: 3 * MINUTE_MS, gapMs: MINUTE_MS, jumpscareAllowed: false }), random: Random(3) });
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 8.0, 5_000);
    assert.ok(has(actions.slice(0, 3), 'Arrive'));
    assert.ok(count(actions, 'Heckle') >= 3);
  });

  test('visitingKaaksOwnAppIsNotATheft', () => {
    const [b, t] = arrived();
    b.forgiveNextReturn(t);
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + 20_000), Action.Return);
  });
});

describe('ReviewFixesTest', () => {
  test('aShareSheetOrPermissionDialogIsNotLeaving', () => {
    const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false }), random: Random(5) });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, 5_000);
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + 4_000), Action.Resume); // no theft, no "again?"
  });

  test('aQuickHopStillCannotSneakPastTheNap', () => {
    const b = new KaakBrain({ rules: rules({ dailyLimitMs: 10 * MINUTE_MS, jumpscareAllowed: false }), random: Random(5) });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, 5_000);
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + 3_000).type, 'Asleep');
  });

  test('aLongVideoWatchedOnPurposeDoesNotEatTheLimit', () => {
    const b = new KaakBrain({ rules: rules({ dailyLimitMs: 30 * MINUTE_MS, jumpscareAllowed: false }), random: Random(5) });
    b.onForeground(true, 0);
    b.onScroll(1_000); b.onScroll(4_000);
    let t = 5_000;
    while (t < 40 * MINUTE_MS) { t += TICK; b.tick(t, NOON, DAY); } // one 40-minute video, no swipes
    assert.ok(b.dailyMs < 4 * MINUTE_MS, `daily ${b.dailyMs / 60_000}`);
  });
});

describe('CommitmentTest', () => {
  test('holdsGetLongerThroughTheDay', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => EscapeRules.holdSeconds(i)), [20, 40, 60, 90, 90]);
  });

  test('theSentenceChangesAndMustBeTypedButNotPerfectly', () => {
    const p = EscapeRules.phrase(0, DAY, 12);
    assert.ok(EscapeRules.phraseOk(p.toLowerCase(), p));
    assert.ok(EscapeRules.phraseOk('  ' + p.replaceAll(',', '').replaceAll('.', '!!') + ' ', p));
    assert.ok(!EscapeRules.phraseOk(p.slice(0, p.lastIndexOf(' ')), p));
    const second = EscapeRules.phrase(1, DAY, 12);
    assert.notEqual(second, p); // a new sentence for the next escape
    assert.ok(!EscapeRules.phraseOk(p, second)); // last time's sentence doesn't work
    const all = new Set([...Array(10).keys()].map((i) => EscapeRules.phrase(i % 5, DAY + Math.trunc(i / 5), 7)));
    assert.ok(all.size >= 5);
  });

  test('strictModeEndsOnTimeOrFifteenMinutesAfterAsking', () => {
    const until = 10 * 60 * MINUTE_MS;
    assert.ok(StrictPlan.active(MINUTE_MS, until, null));
    assert.ok(!StrictPlan.active(until, until, null));
    assert.ok(StrictPlan.active(10 * MINUTE_MS, until, 0));
    assert.ok(!StrictPlan.active(16 * MINUTE_MS, until, 0));
    assert.equal(StrictPlan.coolOffLeftMs(10 * MINUTE_MS, 0), 5 * MINUTE_MS);
  });

  // JS-only
  test('pasteIsRejectedOnTheEscapePage', () => {
    assert.ok(EscapeRules.isPaste({ inputType: 'insertFromPaste', inserted: 3 }));
    assert.ok(EscapeRules.isPaste({ inputType: 'insertFromDrop', inserted: 3 }));
    assert.ok(EscapeRules.isPaste({ inputType: 'insertText', inserted: 15 }));
    assert.ok(!EscapeRules.isPaste({ inputType: 'insertText', inserted: 1 }));
    assert.ok(!EscapeRules.isPaste({ inputType: 'insertText', inserted: 14 }));
    assert.ok(!EscapeRules.isPaste({ inputType: 'deleteContentBackward', inserted: 0 }));
  });

  test('strictChoicesAndCap', () => {
    const now = new Date(2026, 9, 26, 22, 30);
    assert.equal(StrictPlan.untilFor('until23', now), new Date(2026, 9, 26, 23, 0).getTime());
    assert.equal(StrictPlan.untilFor('until23', new Date(2026, 9, 26, 23, 30)), new Date(2026, 9, 27, 23, 0).getTime());
    assert.equal(StrictPlan.untilFor('day', now), new Date(2026, 9, 27, 22, 30).getTime());
    assert.equal(StrictPlan.untilFor('week', now), new Date(2026, 10, 2, 22, 30).getTime());
    assert.equal(StrictPlan.capUntil(now.getTime() + 30 * 24 * 60 * MINUTE_MS, now.getTime()), now.getTime() + StrictPlan.MAX_MS);
    assert.equal(StrictPlan.coolOffLeftMin(10 * MINUTE_MS, 0), 6);
    assert.equal(StrictPlan.coolOffLeftMin(10 * MINUTE_MS, null), null);
    assert.deepEqual(StrictPlan.CHOICES.map((c) => c.label), ['Until 23:00', '24 hours', '7 days']);
  });
});

describe('SpacingTest', () => {
  test('noTwoInterruptionsWithinFifteenSeconds', () => {
    // the settings from the second phone test: shows up at 5, acts up every minute, limit 15
    const b = new KaakBrain({
      rules: rules({ arrivalMs: 5 * MINUTE_MS, heckleMs: 7 * MINUTE_MS, gapMs: MINUTE_MS, nudgeMs: 25_000, dailyLimitMs: 15 * MINUTE_MS }),
      random: Random(8),
    });
    b.onForeground(true, 0);
    const times = [];
    let t = 0;
    while (t < 15 * MINUTE_MS) {
      t += TICK; b.onScroll(t);
      const a = b.tick(t, NOON, DAY).action;
      if (a.type !== 'None') times.push([t, a]);
    }
    const spaced = times.filter(([, a]) => a.type !== 'Warn' && a.type !== 'Eat');
    for (let i = 1; i < spaced.length; i++) {
      const [xt, x] = spaced[i - 1]; const [yt, y] = spaced[i];
      assert.ok(yt - xt >= 15_000, `${x.type} then ${y.type} ${(yt - xt) / 1000}s apart`);
    }
    const per10 = spaced.filter(([at]) => at > 5 * MINUTE_MS).length;
    assert.ok(per10 >= 12 && per10 <= 26, `${per10} interruptions in 10 min`);
    assert.ok(times.some(([, a]) => a === Action.Eat));
  });
});
