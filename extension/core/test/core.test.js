// Port of app/src/test/java/app/kaak/core/CoreTest.kt
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Action, Chaos, Lang, MINUTE_MS, rules } from '../model.js';
import { ScrollStats, ScrollTracker } from '../scroll-tracker.js';
import { RuleDetector, Verdict } from '../rule-detector.js';
import { KaakBrain } from '../kaak-brain.js';
import { Lines } from '../lines.js';
import { Random } from './kotlin-random.js';
import { DAY, NOON, has, ofType, scrollFor } from './helpers.js';

describe('ScrollTrackerTest', () => {
  test('burstOfScrollEventsCountsAsOneSwipe', () => {
    const tr = new ScrollTracker();
    tr.onScroll(0); tr.onScroll(50); tr.onScroll(120); tr.onScroll(300);
    assert.equal(tr.totalSwipes, 1);
    tr.onScroll(2_000);
    assert.equal(tr.totalSwipes, 2);
  });

  test('medianDwellNeedsThreeSwipes', () => {
    const tr = new ScrollTracker();
    tr.onScroll(0); tr.onScroll(5_000);
    assert.equal(tr.stats(6_000).medianDwellMs, null);
    tr.onScroll(9_000);
    assert.equal(tr.stats(10_000).medianDwellMs, 4_500);
  });

  test('oldSwipesFallOutOfWindow', () => {
    const tr = new ScrollTracker();
    tr.onScroll(0); tr.onScroll(1_000); tr.onScroll(2_000);
    assert.equal(tr.stats(10 * MINUTE_MS).swipesInWindow, 0);
  });
});

describe('RuleDetectorTest', () => {
  const d = new RuleDetector();

  test('fastShortDwellIsMindless', () => {
    assert.equal(d.evaluate(ScrollStats(40, 8.0, 5_000, 4_000, false), NOON).verdict, Verdict.MINDLESS);
  });

  test('typingIsNeverMindless', () => {
    assert.equal(d.evaluate(ScrollStats(40, 8.0, 5_000, 4_000, true), NOON).verdict, Verdict.NOT_MINDLESS);
  });

  test('watchingOneLongVideoIsNotMindless', () => {
    assert.equal(d.evaluate(ScrollStats(5, 1.0, 5_000, 4 * MINUTE_MS, false), NOON).verdict, Verdict.NOT_MINDLESS);
  });

  test('slowBrowsingIsNotMindless', () => {
    assert.equal(d.evaluate(ScrollStats(10, 0.5, 90_000, 10_000, false), NOON).verdict, Verdict.NOT_MINDLESS);
  });

  test('lateNightIsMoreLenient', () => {
    const s = ScrollStats(12, 0.8, 50_000, 10_000, false);
    assert.equal(d.evaluate(s, NOON).verdict, Verdict.NOT_MINDLESS);
    assert.equal(d.evaluate(s, 1).verdict, Verdict.MINDLESS);
  });

  test('tooFewSwipesIsUnsure', () => {
    assert.equal(d.evaluate(ScrollStats(2, 2.0, null, 3_000, false), NOON).verdict, Verdict.UNSURE);
  });
});

describe('KaakBrainTest', () => {
  const brain = (chaos = Chaos.KAAK) => new KaakBrain({ rules: rules({ chaos, jumpscareAllowed: false }), random: Random(7) });

  test('arrivesAfterTenMindlessMinutesNotBefore', () => {
    const b = brain();
    b.onForeground(true, 0);
    const [t, early] = scrollFor(b, 0, 9.0, 5_000);
    assert.equal(early.length, 0);
    const [, later] = scrollFor(b, t, 2.0, 5_000);
    assert.equal(later[0], Action.Arrive);
  });

  test('hecklesAfterFifteenMinutesWithVariedGags', () => {
    const b = brain();
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 40.0, 5_000);
    const heckles = ofType(actions, 'Heckle');
    assert.ok(heckles.length >= 5, `expected several heckles, got ${heckles.length}`);
    for (let i = 1; i < heckles.length; i++) assert.notEqual(heckles[i - 1].gag, heckles[i].gag);
    assert.ok(heckles[0].minutes >= 15);
  });

  test('intentionalUseNeverTriggers', () => {
    const b = brain();
    b.onForeground(true, 0);
    const [, typing] = scrollFor(b, 0, 30.0, 5_000, { typing: true });
    assert.equal(typing.length, 0);
    const b2 = brain();
    b2.onForeground(true, 0);
    const [, slow] = scrollFor(b2, 0, 30.0, 120_000);
    assert.equal(slow.length, 0);
  });

  test('leavingHidesAndReturningLaterSaysAgain', () => {
    const b = brain();
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, 5_000);
    assert.equal(b.onForeground(false, t), Action.Hide);
    assert.equal(b.onForeground(true, t + 3 * MINUTE_MS), Action.Return);
  });

  test('sessionResetsAfterThirtyMinutesAway', () => {
    let ended = null;
    const b = new KaakBrain({ random: Random(1), onSessionEnd: (s) => { ended = s; } });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, 5_000);
    b.onForeground(false, t);
    b.tick(t + 31 * MINUTE_MS, NOON, DAY);
    assert.equal(ended?.arrived, true);
    assert.equal(b.onForeground(true, t + 32 * MINUTE_MS), Action.None);
    assert.equal(b.mindlessMs, 0);
  });

  test('monkeyArrivesSoonerThanPigeon', () => {
    const monkey = brain(Chaos.MONKEY); monkey.onForeground(true, 0);
    const pigeon = brain(Chaos.PIGEON); pigeon.onForeground(true, 0);
    assert.ok(has(scrollFor(monkey, 0, 8.0, 5_000)[1], 'Arrive'));
    assert.ok(!has(scrollFor(pigeon, 0, 8.0, 5_000)[1], 'Arrive'));
  });

  test('sleepingPhoneDoesNotCountAsScrolling', () => {
    const b = brain();
    b.onForeground(true, 0);
    b.tick(5_000, NOON, DAY);
    b.tick(2 * 60 * MINUTE_MS, NOON, DAY); // two hours later in one tick
    assert.ok(b.activeMs <= 20_000);
  });
});

describe('LinesTest', () => {
  test('englishIsDefaultAndBanglishIsOptIn', () => {
    const lines = new Lines(Random(3));
    assert.ok(['what are you doing', 'again?', "bro, it's been 40 minutes"].includes(lines.sit(40)));
    lines.lang = Lang.BANGLISH;
    assert.ok(['ki korcho eta', 'abar?', 'bhai 40 minute hoye gelo'].includes(lines.sit(40)));
  });

  test('neverRepeatsTheSameLineTwiceInARow', () => {
    const lines = new Lines(Random(5));
    let prev = lines.again();
    for (let i = 0; i < 50; i++) {
      const next = lines.again();
      assert.notEqual(next, prev);
      prev = next;
    }
  });
});
