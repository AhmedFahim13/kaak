// Port of app/src/test/java/app/kaak/core/Milestone3Test.kt
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Action, MINUTE_MS, TrustLevel, rules } from '../model.js';
import { KaakBrain } from '../kaak-brain.js';
import { DayStats, KaakTimes, ReturnedTime, Trust } from '../week.js';
import { Random } from './kotlin-random.js';
import { DAY, NOON, TICK, count, has, scrollFor, types } from './helpers.js';

describe('TrustTest', () => {
  test('levelsFromPoints', () => {
    assert.equal(TrustLevel.of(0), TrustLevel.STRANGER);
    assert.equal(TrustLevel.of(5), TrustLevel.NEIGHBOUR);
    assert.equal(TrustLevel.of(16), TrustLevel.FRIEND);
    assert.equal(TrustLevel.of(99), TrustLevel.FAMILY);
  });

  test('goodDaysEarnBadDaysCostALittle', () => {
    assert.equal(Trust.dayDelta(DayStats({ day: DAY, mindlessMin: 20 }), 60), 2);
    assert.equal(Trust.dayDelta(DayStats({ day: DAY, mindlessMin: 50 }), 60), 1);
    assert.equal(Trust.dayDelta(DayStats({ day: DAY, mindlessMin: 10, escapes: 1 }), 60), -1);
    assert.equal(Trust.dayDelta(DayStats({ day: DAY, mindlessMin: 70, eaten: 1 }), 60), -1);
  });

  test('friendsDontGetRobbed', () => {
    const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false, trust: TrustLevel.FRIEND }), random: Random(2) });
    b.onForeground(true, 0);
    const [t, actions] = scrollFor(b, 0, 11.0, 5_000);
    assert.ok(has(actions, 'Arrive'));
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + 30_000), Action.Return);
  });

  test('trustMakesHecklesRarerAndWarningsEarlier', () => {
    const heckles = (level) => {
      const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false, dailyLimitMs: 600 * MINUTE_MS, trust: level }), random: Random(9) });
      b.onForeground(true, 0);
      return count(scrollFor(b, 0, 60.0, 5_000)[1], 'Heckle');
    };
    assert.ok(heckles(TrustLevel.FAMILY) < heckles(TrustLevel.STRANGER));

    const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false, dailyLimitMs: 40 * MINUTE_MS, trust: TrustLevel.FRIEND }), random: Random(3) });
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 31.0, 5_000);
    assert.ok(has(actions, 'Warn'), `friend warned 10 min early: ${types(actions)}`);
  });
});

describe('WorkModeTest', () => {
  test('replyingToCustomersBetweenScrollsIsNotMindless', () => {
    // A seller: scrolls the page, types a reply every 2 minutes.
    const run = (work) => {
      const b = new KaakBrain({ rules: rules({ work, jumpscareAllowed: false }), random: Random(4) });
      b.onForeground(true, 0);
      const actions = [];
      let t = 0;
      while (t < 30 * MINUTE_MS) {
        t += TICK;
        b.onScroll(t);
        if (t % (2 * MINUTE_MS) === 0) b.onTyping(t);
        const a = b.tick(t, NOON, DAY).action;
        if (a.type !== 'None') actions.push(a);
      }
      return actions;
    };
    assert.equal(run(true).length, 0);
    assert.ok(run(false).length > 0);
  });

  test('noTheftOrJumpscareAtWork', () => {
    const b = new KaakBrain({ rules: rules({ work: true, dailyLimitMs: 600 * MINUTE_MS }), random: Random(11) });
    b.onForeground(true, 0);
    const [t, actions] = scrollFor(b, 0, 60.0, 3_000);
    assert.ok(!has(actions, 'Jumpscare'));
    b.onForeground(false, t);
    assert.notEqual(b.onForeground(true, t + 30_000), Action.Steal);
  });
});

describe('ReturnedTimeTest', () => {
  test('leavingRightAfterAGagEarnsTimeUntilNextVisit', () => {
    const r = new ReturnedTime();
    r.onKaakAction(0, false);
    r.onLeaveFeed(60_000);
    assert.equal(r.onEnterFeed(60_000 + 10 * MINUTE_MS), 10 * MINUTE_MS);
  });

  test('leavingLongAfterAGagEarnsNothing', () => {
    const r = new ReturnedTime();
    r.onKaakAction(0, false);
    r.onLeaveFeed(5 * MINUTE_MS);
    assert.equal(r.onEnterFeed(20 * MINUTE_MS), 0);
  });

  test('theftAndEatingCountAndAreCapped', () => {
    const r = new ReturnedTime();
    r.onKaakAction(0, true);
    assert.equal(r.onEnterFeed(3 * 60 * MINUTE_MS), 30 * MINUTE_MS);
    r.onKaakAction(0, true);
    assert.equal(r.flush(10 * MINUTE_MS), 0);
    assert.equal(r.flush(40 * MINUTE_MS), 30 * MINUTE_MS);
    assert.equal(r.onEnterFeed(50 * MINUTE_MS), 0);
  });

  // JS-only
  test('survivesAWorkerRestart', () => {
    const r = new ReturnedTime();
    r.onKaakAction(0, false);
    r.onLeaveFeed(60_000);
    const back = ReturnedTime.fromJSON(JSON.parse(JSON.stringify(r)));
    assert.equal(back.onEnterFeed(60_000 + 10 * MINUTE_MS), 10 * MINUTE_MS);
  });
});

describe('KaakTimesTest', () => {
  const week = (seed, mindless) => [1, 2, 3, 4, 5, 6, 7].map((it) => DayStats({
    day: DAY + it, mindlessMin: mindless, feedOpens: 9, foiled: 3, returnedMin: 40, steps: 1_000 * (it % 2),
    longestSessionMin: 20 + it, eaten: it === 3 ? 1 : 0, worthYes: 1, worthNo: 2, bribes: 1, lateMinute: it === 5 ? 5 * 60 + 10 : 60,
  }));

  test('aBigDropLeadsThePaper', () => {
    const e = KaakTimes.compose(week(1, 20), week(2, 60), 'Week of 12 October', Random(1));
    assert.ok(e.headline.includes('DOWN 67%') || e.headline.includes('QUIET WEEK'), e.headline);
    assert.equal(e.stories.length, 3);
    assert.equal(new Set(e.stories.map((s) => s.title)).size, 3);
  });

  test('lateNightsMakeTheNews', () => {
    assert.equal(KaakTimes.clock(5 * 60 + 10), '2:10 A.M.');
    assert.equal(KaakTimes.clock(150), '11:30 P.M.');
    const e = KaakTimes.compose(week(1, 50), week(2, 50), 'x', Random(2));
    assert.ok([e.headline, ...e.stories.map((s) => s.title)].some((s) => s.includes('2:10')));
  });

  test('firstWeekStillPrints', () => {
    const e = KaakTimes.compose([], [], 'x', Random(3));
    assert.equal(e.headline, 'CROW MOVES INTO LOCAL BROWSER');
    assert.ok(e.stories.length > 0);
  });

  test('hoursFormat', () => {
    assert.equal(KaakTimes.hours(45), '45 MINUTES');
    assert.equal(KaakTimes.hours(240), '4 HOURS');
    assert.equal(KaakTimes.hours(280), '4H 40M');
    assert.equal(Trust.lateMinuteOf(12 * 60), -1);
    assert.equal(Trust.lateMinuteOf(23 * 60 + 30), 150);
  });

  // JS-only: "%,d" grouping
  test('stepsAreGroupedLikeKotlin', () => {
    const days = [DayStats({ day: DAY, steps: 12_345 }), DayStats({ day: DAY + 1 }), DayStats({ day: DAY + 2 })];
    const e = KaakTimes.compose(days, [], 'x', Random(4));
    assert.ok([e.headline, ...e.stories.map((s) => s.title)].some((s) => s.includes('12,345')), e.headline);
  });
});
