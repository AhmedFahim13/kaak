// Port of app/src/test/java/app/kaak/core/Milestone2Test.kt
// Adapted: BribeTest uses the desktop catalog (steps5k -> study/feed, water's photo proof ->
// a checkable bribe); TaskCheckTest's phone-down -> AwayTimer, app time -> SiteTimeGoal;
// stepsSurviveAReboot is phone-only and not ported.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Action, MINUTE_MS, rules } from '../model.js';
import { KaakBrain } from '../kaak-brain.js';
import { Bribe, BribeCatalog, BribeLedger, Check } from '../bribes.js';
import { DetourCatalog, DetourPicker, DetourType } from '../detours.js';
import { AwayTimer, Bedtime, PhoneDownTimer, SiteTimeGoal, dayKeyOf } from '../tasks.js';
import { Random } from './kotlin-random.js';
import { DAY, NOON, TICK, count, has, scrollFor, types } from './helpers.js';

const FAST = 5_000;

describe('TheftTest', () => {
  function arrivedBrain() {
    const b = new KaakBrain({ rules: rules({ jumpscareAllowed: false }), random: Random(2) });
    b.onForeground(true, 0);
    const [t, actions] = scrollFor(b, 0, 11.0, FAST);
    assert.ok(has(actions, 'Arrive'));
    return [b, t];
  }

  test('reopeningWithinTwoMinutesGetsStolen', () => {
    const [b, t] = arrivedBrain();
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + 60_000), Action.Steal);
  });

  test('afterWinningTheChaseTheFeedOpensAndIsNotStolenAgain', () => {
    const [b, t] = arrivedBrain();
    b.onForeground(false, t);
    b.onForeground(true, t + 30_000);
    b.onForeground(false, t + 40_000);
    assert.equal(b.onForeground(true, t + 45_000), Action.Bounce);
    b.chaseWon(t + 50_000);
    assert.equal(b.onForeground(true, t + 60_000), Action.Return);
  });

  test('noTheftBeforeKaakHasArrived', () => {
    const b = new KaakBrain({ random: Random(2) });
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 2.0, FAST);
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + 30_000), Action.None);
  });

  test('quietHourMeansNoTheft', () => {
    const [b, t] = arrivedBrain();
    b.rules = rules({ ...b.rules, quiet: true });
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + 30_000), Action.Return);
  });
});

describe('EatTest', () => {
  const limited = (limitMin, bonusMin = 0) => new KaakBrain({
    rules: rules({ dailyLimitMs: limitMin * MINUTE_MS, bonusMs: bonusMin * MINUTE_MS, jumpscareAllowed: false }),
    random: Random(4),
  });

  test('warnsFiveMinutesBeforeThenEats', () => {
    const b = limited(20);
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 21.0, FAST);
    const warn = actions.findIndex((a) => a.type === 'Warn');
    const eat = actions.indexOf(Action.Eat);
    assert.ok(warn >= 0 && warn < eat, `warn before eat: ${types(actions)}`);
    assert.ok(b.blocked);
  });

  test('bribeMinutesPushTheLimitBack', () => {
    const b = limited(20, 10);
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 25.0, FAST);
    assert.ok(!has(actions, 'Eat'));
  });

  test('reopeningWhileFullShowsAsleepThenWakes', () => {
    const b = limited(10);
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, FAST);
    assert.equal(b.onForeground(false, t), Action.Hide);
    const asleep = b.onForeground(true, t + 5 * MINUTE_MS);
    assert.ok(asleep.type === 'Asleep' && asleep.minutesLeft >= 14 && asleep.minutesLeft <= 16);
    let woke = false;
    let now = t + 5 * MINUTE_MS;
    while (now < t + 22 * MINUTE_MS) {
      now += TICK;
      if (b.tick(now, NOON, DAY).action === Action.Wake) woke = true;
    }
    assert.ok(woke);
    assert.ok(!b.blocked);
  });

  test('scrollingWhileAsleepIsNotCounted', () => {
    const b = limited(10);
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, FAST);
    b.onForeground(false, t);
    b.onForeground(true, t + MINUTE_MS);
    const before = b.dailyMs;
    scrollFor(b, t + MINUTE_MS, 3.0, FAST);
    assert.equal(b.dailyMs, before);
  });

  test('escapeGivesFiveMinutesThenTheNapReturns', () => {
    const b = limited(10);
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, FAST);
    b.onForeground(false, t);
    assert.equal(b.onForeground(true, t + MINUTE_MS).type, 'Asleep');
    b.escape(t + MINUTE_MS);
    const [t2, during] = scrollFor(b, t + MINUTE_MS, 4.0, FAST);
    assert.ok(!has(during, 'Eat'));
    assert.ok(!has(during, 'Asleep'));
    const [, after] = scrollFor(b, t2, 2.0, FAST); // the 5-minute pass runs out mid-scroll
    assert.ok(has(after, 'Asleep'), `nap cover back: ${types(after)}`);
  });

  test('aftercooldownTenMinutesGraceThenEatenAgain', () => {
    const b = limited(10);
    b.onForeground(true, 0);
    const [t] = scrollFor(b, 0, 11.0, FAST);
    b.onForeground(false, t);
    const back = t + 25 * MINUTE_MS;
    b.tick(back, NOON, DAY); // cooldown over while away
    assert.notEqual(b.onForeground(true, back).type, 'Asleep');
    const [, actions] = scrollFor(b, back, 12.0, FAST);
    assert.ok(has(actions, 'Eat'));
  });

  test('newDayResetsTheLimit', () => {
    const b = limited(10);
    b.onForeground(true, 0);
    scrollFor(b, 0, 8.0, FAST);
    assert.ok(b.dailyMs > 7 * MINUTE_MS);
    b.tick(9 * MINUTE_MS, NOON, DAY + 1);
    assert.ok(b.dailyMs < MINUTE_MS);
  });

  test('typingInDmsNeverEats', () => {
    const b = limited(10);
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 30.0, FAST, { typing: true });
    assert.ok(!has(actions, 'Eat'));
  });
});

describe('JumpscareAndBedtimeTest', () => {
  test('jumpscareAtMostOncePerSession', () => {
    const b = new KaakBrain({ rules: rules({ dailyLimitMs: 600 * MINUTE_MS }), random: Random(11) });
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 50.0, FAST);
    assert.equal(count(actions, 'Jumpscare'), 1);
    const first = actions.indexOf(Action.Jumpscare);
    assert.ok(has(actions.slice(0, first), 'Arrive'));
  });

  test('noJumpscareWhenNotAllowed', () => {
    const b = new KaakBrain({ rules: rules({ dailyLimitMs: 600 * MINUTE_MS, jumpscareAllowed: false }), random: Random(11) });
    b.onForeground(true, 0);
    assert.ok(!has(scrollFor(b, 0, 50.0, FAST)[1], 'Jumpscare'));
  });

  test('bedtimeArrivesSoonerAndCountsSlowScrolling', () => {
    const b = new KaakBrain({ rules: rules({ bedtime: true }), random: Random(3) });
    b.onForeground(true, 0);
    const [, actions] = scrollFor(b, 0, 4.0, 15_000, { hour: 0 });
    assert.ok(has(actions, 'Arrive'));
    assert.ok(!has(actions, 'Jumpscare'));
  });

  test('bedtimeWindowWrapsMidnight', () => {
    assert.ok(Bedtime.isBedtime(23 * 60 + 45, 23 * 60 + 30));
    assert.ok(Bedtime.isBedtime(2 * 60, 23 * 60 + 30));
    assert.ok(!Bedtime.isBedtime(12 * 60, 23 * 60 + 30));
    assert.ok(Bedtime.isBedtime(60, 30));
    assert.ok(!Bedtime.isBedtime(23 * 60, 30));
  });

  test('morningGiftOnlyIfNoFeedAfterBedtime', () => {
    const bed = 23 * 60 + 30;
    const now = new Date(2026, 9, 13, 7, 10);
    const installed = new Date(2026, 9, 1, 12, 0);
    const before = new Date(2026, 9, 12, 22, 50);
    const after = new Date(2026, 9, 13, 0, 40);
    assert.ok(Bedtime.morningGift(now, bed, null, before, installed));
    assert.ok(!Bedtime.morningGift(now, bed, null, after, installed));
    assert.ok(!Bedtime.morningGift(now, bed, dayKeyOf(new Date(2026, 9, 13)), before, installed));
    assert.ok(!Bedtime.morningGift(now, bed, new Date(2026, 9, 13), before, installed)); // a Date works too
    assert.ok(!Bedtime.morningGift(new Date(2026, 9, 13, 14, 10), bed, null, before, installed));
    assert.ok(!Bedtime.morningGift(now, bed, null, before, new Date(2026, 9, 13, 1, 0)));
  });
});

describe('LabelTest', () => {
  test('asksAboutSomeLongVisitsButNeverShortOnes', () => {
    let asked = 0;
    for (let i = 0; i < 40; i++) {
      const b = new KaakBrain({ random: Random(i) });
      b.onForeground(true, 0);
      const [t] = scrollFor(b, 0, 4.0, FAST);
      b.onForeground(false, t);
      if (b.takeLabel() != null) asked++;
      assert.equal(b.takeLabel(), null);
    }
    assert.ok(asked >= 4 && asked <= 20, `asked ${asked} of 40`);

    const short = new KaakBrain({ random: Random(1) });
    short.onForeground(true, 0);
    const [t] = scrollFor(short, 0, 1.0, FAST);
    short.onForeground(false, t);
    assert.equal(short.takeLabel(), null);
  });
});

describe('BribeTest', () => {
  test('catalogIdsAreUniqueAndDetoursPointAtRealBribes', () => {
    assert.equal(new Set(BribeCatalog.ALL.map((b) => b.id)).size, BribeCatalog.ALL.length);
    assert.equal(new Set(DetourCatalog.ALL.map((d) => d.id)).size, DetourCatalog.ALL.length);
    for (const d of DetourCatalog.ALL) if (d.bribeId) assert.ok(BribeCatalog.byId(d.bribeId), `${d.id} -> ${d.bribeId}`);
    assert.ok(DetourCatalog.DEFAULT_IDS.every((id) => DetourCatalog.byId(id)));
  });

  test('minutesCapAtThirtyButLootStillPays', () => {
    // app: steps5k (20 min, key) three times; desktop: a 20-minute bribe with loot
    const ledger = new BribeLedger();
    const big = Bribe('big', 'test', Check.AWAY, { amount: 20, rewardMin: 20, loot: 'key', trust: 1 });
    assert.equal(ledger.claim(big, DAY).minutes, 20);
    const second = ledger.claim(big, DAY);
    assert.equal(second.minutes, 10);
    assert.ok(second.capped);
    const third = ledger.claim(big, DAY);
    assert.equal(third.minutes, 0);
    assert.equal(third.loot, 'key');
    assert.equal(third.trust, 1);
  });

  test('honorBribesLimitedToThreeADay', () => {
    const ledger = new BribeLedger();
    const water = BribeCatalog.byId('water');
    for (let i = 0; i < 3; i++) assert.equal(ledger.claim(water, DAY, true).type, 'Granted');
    assert.equal(ledger.claim(water, DAY, true).type, 'Refused');
    assert.equal(ledger.claim(water, DAY, false).type, 'Granted'); // checked by Kaak, it still pays (app: photo proof)
    assert.equal(ledger.claim(water, DAY + 1, true).type, 'Granted');
  });

  test('quietHourBribesBuyNoFeedTime', () => {
    // app: steps10k buys a quiet hour, not feed time; no desktop bribe does this today
    const q = Bribe('q', 'quiet hour', Check.AWAY, { amount: 60, rewardMin: 0, loot: 'golden spoon', trust: 3, quietHour: true });
    const g = new BribeLedger().claim(q, DAY);
    assert.equal(g.minutes, 0);
    assert.ok(g.quietHour);
    assert.equal(g.loot, 'golden spoon');
  });
});

describe('DetourTest', () => {
  const all = DetourCatalog.ALL.map((d) => d.id);

  test('picksThreeOfDifferentTypes', () => {
    for (let seed = 0; seed < 20; seed++) {
      const p = DetourPicker.pick(all, 15, false, [], Random(seed));
      assert.equal(p.length, 3);
      assert.equal(new Set(p.map((d) => d.type)).size, 3);
      assert.ok(!p.some((d) => d.id === 'sleep'));
    }
  });

  test('afterBedtimeOnlyRestWithSleepFirst', () => {
    const p = DetourPicker.pick(all, 0, true, [], Random(1));
    assert.equal(p[0].id, 'sleep');
    assert.ok(p.every((d) => d.type === DetourType.REST));
  });

  test('avoidsYesterdaysDetoursWhenPossible', () => {
    const first = new Set(DetourPicker.pick(all, 15, false, [], Random(5)).map((d) => d.id));
    const second = new Set(DetourPicker.pick(all, 15, false, first, Random(5)).map((d) => d.id));
    assert.ok([...first].every((id) => !second.has(id)));
  });

  test('emptyChoiceFallsBackToDefaults', () => {
    const p = DetourPicker.pick([], 10, false, [], Random(2));
    assert.ok(p.length > 0 && p.every((d) => DetourCatalog.DEFAULT_IDS.includes(d.id)));
  });

  test('twoChosenGivesTwo', () => {
    const p = DetourPicker.pick(['walk_outside', 'plan'], 10, false, [], Random(2));
    assert.deepEqual(new Set(p.map((d) => d.id)), new Set(['walk_outside', 'plan']));
  });

  // JS-only
  test('aSavedFeedVideoIsLeftOutWhileFeedsAreLocked', () => {
    for (let seed = 0; seed < 20; seed++) {
      const p = DetourPicker.pick(['saved_video', 'learn_site', 'stretch', 'plan'], 15, false, [], Random(seed), 3, { feedsLocked: true });
      assert.ok(!p.some((d) => d.id === 'saved_video'));
    }
    const open = DetourPicker.pick(['saved_video'], 15, false, [], Random(1));
    assert.equal(open[0].id, 'saved_video');
  });
});

describe('TaskCheckTest', () => {
  test('phoneDownNeedsOneUnbrokenStretch', () => {
    const t = new PhoneDownTimer(10 * MINUTE_MS);
    t.onScreenOff(0);
    assert.ok(!t.onScreenOn(6 * MINUTE_MS)); // peeked
    t.onScreenOff(7 * MINUTE_MS);
    assert.ok(!t.onScreenOn(12 * MINUTE_MS));
    t.onScreenOff(13 * MINUTE_MS);
    assert.ok(t.onScreenOn(24 * MINUTE_MS));
    assert.ok(t.done);
  });

  test('awayFromTheComputerNeedsOneUnbrokenStretch', () => {
    const t = new AwayTimer(10 * MINUTE_MS);
    t.onAway(0);
    assert.equal(t.progressMs(4 * MINUTE_MS), 4 * MINUTE_MS);
    assert.ok(!t.onBack(6 * MINUTE_MS)); // touched the mouse
    assert.equal(t.bestMs, 6 * MINUTE_MS);
    t.onAway(7 * MINUTE_MS);
    assert.ok(t.onBack(18 * MINUTE_MS));
    const restored = AwayTimer.fromJSON(JSON.parse(JSON.stringify(t)));
    assert.ok(restored instanceof AwayTimer && restored.done);
  });

  test('appTimeAddsUpAcrossVisits', () => {
    const g = new SiteTimeGoal(['duolingo'], 5 * MINUTE_MS);
    g.onForeground('duolingo', 0);
    g.onForeground(null, 3 * MINUTE_MS);
    assert.ok(!g.done(4 * MINUTE_MS));
    g.onForeground('duolingo', 10 * MINUTE_MS);
    assert.notEqual(g.done(11 * MINUTE_MS), true);
    assert.ok(g.done(12 * MINUTE_MS));
    const r = SiteTimeGoal.fromJSON(JSON.parse(JSON.stringify(g)));
    assert.equal(r.progressMs(11 * MINUTE_MS), 4 * MINUTE_MS);
  });

  test('dayKeyFormat', () => {
    assert.equal(dayKeyOf(new Date(2026, 9, 12)), 20261012);
  });
});
