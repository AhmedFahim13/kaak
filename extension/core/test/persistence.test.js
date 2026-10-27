// JS-only: KaakBrain.toJSON()/fromJSON() round-trip fidelity (MV3 kills the worker every ~30 s).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { FOREVER, MINUTE_MS, TrustLevel, rules } from '../model.js';
import { DetectorConfig } from '../rule-detector.js';
import { KaakBrain } from '../kaak-brain.js';
import { Lines } from '../lines.js';
import { BribeLedger, BribeCatalog } from '../bribes.js';
import { KotlinRandom, Random } from './kotlin-random.js';
import { DAY, NOON, TICK, has } from './helpers.js';

const roundTrip = (b, random, onSessionEnd) => KaakBrain.fromJSON(JSON.parse(JSON.stringify(b.toJSON())), { random, onSessionEnd });

/**
 * A long scripted day that touches every branch: arrival, nudges, heckles, a jumpscare, leaving
 * and theft, a lost chase, a look-away, eating, the asleep cover, an escape, the pass running out,
 * the day rolling over and a session ending. `step(fn)` runs one call against the current brain;
 * `hop()` lets a variant swap the brain between calls.
 */
function script(ctx) {
  const out = [];
  const rec = (label, a) => out.push(`${label}:${a.type}${a.gag ? '/' + a.gag.name : ''}${a.minutes ?? ''}${a.minutesLeft ?? ''}`);
  let t = 0;
  const scroll = (minutes, every, { typing = false, hour = NOON, day = DAY } = {}) => {
    const end = t + minutes * MINUTE_MS;
    let next = t;
    while (t < end) {
      t += TICK;
      while (next <= t) {
        ctx.b.onScroll(next); ctx.hop(); ctx.b.onScroll(next + 60); ctx.b.onScroll(next + 120);
        if (typing) ctx.b.onTyping(next);
        next += every;
      }
      ctx.hop();
      rec('tick', ctx.b.tick(t, hour, day).action);
      ctx.hop();
    }
  };
  const fg = (feed, dt = 0) => { t += dt; rec(feed ? 'open' : 'close', ctx.b.onForeground(feed, t, NOON)); ctx.hop(); };

  fg(true);
  scroll(14, 5_000);           // arrival, nudges
  fg(false); fg(true, 40_000); // theft
  fg(false, 1_000);
  ctx.b.chaseLost(t); ctx.hop();
  fg(true, 60_000);            // bounced
  fg(true, 3 * MINUTE_MS);     // lock over
  scroll(6, 4_000);
  ctx.b.lookAway(t); ctx.hop();
  scroll(2, 3_000);            // ignored while looking away
  t += 5 * MINUTE_MS; rec('back', ctx.b.lookBack(t)); ctx.hop();
  scroll(20, 5_000);           // heckles, jumpscare chance, warning, eat
  fg(false, 1_000);
  fg(true, 2 * MINUTE_MS);     // asleep
  ctx.b.escape(t); ctx.hop();
  scroll(7, 5_000);            // pass runs out: asleep again
  fg(false, 5_000);
  rec('label', { type: String(ctx.b.takeLabel() != null) });
  rec('tick', ctx.b.tick(t + 40 * MINUTE_MS, NOON, DAY + 1)); ctx.hop(); // session ends, new day
  t += 41 * MINUTE_MS;
  fg(true);
  scroll(12, 2_000, { hour: 23 });
  ctx.b.endSession(); ctx.hop();
  return out;
}

function runVariant(restoreEveryCall) {
  const ends = [];
  const onEnd = (s) => ends.push(s);
  const random = Random(42);
  const ctx = {
    b: new KaakBrain({ rules: rules({ dailyLimitMs: 35 * MINUTE_MS, gapMs: 50_000 }), random, onSessionEnd: onEnd }),
    hop() { if (restoreEveryCall) this.b = roundTrip(this.b, random, onEnd); },
  };
  const out = script(ctx);
  return { out, ends, final: JSON.stringify(ctx.b.toJSON()) };
}

describe('KaakBrain persistence', () => {
  test('a brain restored after every single call behaves exactly like one that never was', () => {
    const plain = runVariant(false);
    const hopped = runVariant(true);
    assert.deepEqual(hopped.out, plain.out);
    assert.deepEqual(hopped.ends, plain.ends);
    assert.equal(hopped.final, plain.final);
    // the script really exercised the interesting branches
    const joined = plain.out.join(' ');
    for (const w of ['Arrive', 'Steal', 'Bounce', 'Nudge', 'Heckle', 'Warn', 'Eat', 'Asleep']) assert.ok(joined.includes(w), `${w} in ${joined}`);
    assert.ok(plain.ends.length >= 2);
  });

  test('mid-session snapshot with a cloned random continues identically', () => {
    const rA = Random(9);
    const a = new KaakBrain({ rules: rules({ trust: TrustLevel.NEIGHBOUR, dailyLimitMs: 600 * MINUTE_MS }), random: rA });
    a.onForeground(true, 0);
    let t = 0;
    const drive = (b, from, to) => {
      const acts = [];
      for (let x = from; x < to; x += TICK) {
        b.onScroll(x + 1_000); b.onScroll(x + 1_100);
        acts.push(b.tick(x + TICK, NOON, DAY).action);
      }
      return acts;
    };
    drive(a, 0, 17 * MINUTE_MS);
    t = 17 * MINUTE_MS;
    const json = JSON.parse(JSON.stringify(a.toJSON()));
    const b = KaakBrain.fromJSON(json, { random: KotlinRandom.fromJSON(rA.toJSON()) });
    const restA = drive(a, t, 50 * MINUTE_MS);
    const restB = drive(b, t, 50 * MINUTE_MS);
    assert.deepEqual(restB, restA);
    assert.ok(has(restA, 'Heckle'));
    assert.deepEqual(b.toJSON(), a.toJSON());
  });

  test('every getter, the rules, detector config and parameters survive', () => {
    const a = new KaakBrain({
      rules: rules({ chaos: 'MONKEY', trust: 'FRIEND', work: true, bonusMs: 7 * MINUTE_MS, arrivalMs: 3 * MINUTE_MS }),
      config: DetectorConfig({ minSwipesPerMin: 2.5, longWatchMs: 4 * MINUTE_MS }),
      maxTickMs: 9_000, quickHopMs: 7_000, labelChance: 1,
    });
    a.onForeground(true, 0);
    for (let x = 0; x < 6 * MINUTE_MS; x += TICK) { a.onScroll(x); a.tick(x + TICK, NOON, DAY); }
    a.chaseLost(100);
    a.escape(200);
    const b = roundTrip(a, Random(1));
    for (const k of ['inFeed', 'blocked', 'activeMs', 'mindlessMs', 'dailyMs', 'eatenUntil', 'escapeUntil', 'stolenUntil', 'lookingAway']) {
      assert.deepEqual(b[k], a[k], k);
    }
    assert.equal(b.rules.chaos.name, 'MONKEY');
    assert.equal(b.rules.trust.name, 'FRIEND');
    assert.equal(b.rules.bonusMs, 7 * MINUTE_MS);
    const j = b.toJSON();
    assert.equal(j.config.minSwipesPerMin, 2.5);
    assert.equal(j.params.maxTickMs, 9_000);
    assert.equal(j.params.quickHopMs, 7_000);
    assert.deepEqual(j, a.toJSON());
  });

  test('a theft held "until the chase is won" survives JSON (no Infinity)', () => {
    const a = new KaakBrain({ rules: rules({ jumpscareAllowed: false }), random: Random(2) });
    a.onForeground(true, 0);
    for (let x = 0; x < 11 * MINUTE_MS; x += TICK) { a.onScroll(x); a.tick(x + TICK, NOON, DAY); }
    a.onForeground(false, 11 * MINUTE_MS);
    assert.equal(a.onForeground(true, 11 * MINUTE_MS + 30_000).type, 'Steal');
    a.onForeground(false, 11 * MINUTE_MS + 31_000);
    assert.equal(a.stolenUntil, FOREVER);
    const b = roundTrip(a, Random(2));
    assert.equal(b.stolenUntil, FOREVER);
    assert.equal(b.onForeground(true, 11 * MINUTE_MS + 10 * 60 * MINUTE_MS).type, 'Bounce');
  });

  test('a pending "was that worth it?" survives', () => {
    const a = new KaakBrain({ random: Random(1), labelChance: 1 });
    a.onForeground(true, 0);
    for (let x = 0; x < 4 * MINUTE_MS; x += TICK) { a.onScroll(x); a.tick(x + TICK, NOON, DAY); }
    a.onForeground(false, 4 * MINUTE_MS);
    const b = roundTrip(a, Random(1));
    const l = b.takeLabel();
    assert.ok(l && l.visitMs >= 3 * MINUTE_MS);
    assert.equal(b.takeLabel(), null);
  });

  test('rejects snapshots it does not know', () => {
    assert.throws(() => KaakBrain.fromJSON({ v: 99 }));
  });

  test('Lines remembers the last line per moment across a restart', () => {
    const l = new Lines(Random(5));
    l.lang = 'BANGLA';
    const last = l.again();
    const l2 = Lines.fromJSON(JSON.parse(JSON.stringify(l)), Random(5));
    assert.equal(l2.lang.name, 'BANGLA');
    assert.notEqual(l2.again(), last);
  });

  test('BribeLedger survives with its day', () => {
    const l = new BribeLedger();
    l.claim(BribeCatalog.byId('study'), DAY);
    const l2 = BribeLedger.fromJSON(JSON.parse(JSON.stringify(l)));
    assert.equal(l2.minutesLeft(DAY), 15);
    assert.equal(l2.minutesLeft(DAY + 1), 30);
  });
});
