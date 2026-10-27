// JS-only: the desktop bribe catalog, caps, learning sites, and the NOTE/CANVAS checks
// (with the applicable part of ProofTest.kt: which bribes run on honor).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AMOUNT_UNIT, BribeCatalog, BribeLedger, Check, LEARNING_SITES, STRETCHES, describeClaim, learningSiteOf } from '../bribes.js';
import { canvasOk, countWords, noteOk, noteProgress, StrokeCounter } from '../proof.js';
import { SteadyTimer } from '../tasks.js';
import { Lines } from '../lines.js';
import { MINUTE_MS } from '../model.js';
import { Random } from './kotlin-random.js';
import { DAY } from './helpers.js';

const byId = BribeCatalog.byId;

describe('desktop catalog', () => {
  test('the bribes from the brief, with their checks and numbers', () => {
    const expect = {
      away5: [Check.AWAY, 5, 5, null], away10: [Check.AWAY, 10, 10, null], away20: [Check.AWAY, 20, 10, 'tea cup'],
      eyes: [Check.EYE_BREAK, 20, 5, null], lesson: [Check.SITE_TIME, 5, 10, 'book page'], study: [Check.SITE_TIME, 25, 15, 'candle'],
      breathing: [Check.BREATHING, 3, 5, 'feather'], stretch: [Check.STRETCH, 5, 5, 'rubber band'], stretch1: [Check.STRETCH, 1, 2, null],
      draw: [Check.CANVAS, 8, 5, 'crayon'], plan: [Check.NOTE, 6, 5, 'pencil stub'], feed: [Check.NOTE, 30, 10, 'seed'],
      nofeed30: [Check.NO_FEED, 30, 15, 'coin'], water: [Check.HONOR, 0, 5, null], tidy: [Check.HONOR, 0, 5, null],
      call: [Check.HONOR, 0, 10, null], quiet: [Check.HONOR, 0, 10, null], focus15: [Check.FOCUS, 15, 10, 'pencil stub'],
      bedtime: [Check.BEDTIME, 0, 0, 'morning gift'],
    };
    assert.deepEqual(BribeCatalog.ALL.map((b) => b.id).sort(), Object.keys(expect).sort());
    for (const [id, [check, amount, reward, loot]] of Object.entries(expect)) {
      const b = byId(id);
      assert.deepEqual([b.check, b.amount, b.rewardMin, b.loot], [check, amount, reward, loot], id);
    }
    assert.equal(byId('call').trust, 1);
    assert.equal(byId('bedtime').trust, 1);
    assert.equal(byId('nope'), null);
  });

  // ProofTest.noBribeRunsOnHonorAnyMore, adapted: on desktop four honor bribes stay (spec section 11)
  test('only the four honor tasks run on honor; everything else Kaak can check', () => {
    assert.deepEqual(BribeCatalog.ALL.filter((b) => b.check === Check.HONOR).map((b) => b.id), ['water', 'tidy', 'call', 'quiet']);
    for (const b of BribeCatalog.ALL) assert.ok(Object.values(Check).includes(b.check), b.id);
    for (const c of Object.values(Check)) assert.ok(c in AMOUNT_UNIT, c);
  });

  test('automatic ones are not selectable', () => {
    assert.deepEqual(BribeCatalog.ALL.filter((b) => !b.selectable).map((b) => b.id), ['stretch1', 'focus15', 'bedtime']);
    assert.ok(BribeCatalog.selectable.every((b) => b.selectable));
    assert.equal(STRETCHES.length, 5);
  });
});

describe('caps: 30 bribe minutes a day, 3 honor a day, loot and trust always pay', () => {
  test('minutes cap at 30 across different bribes', () => {
    const l = new BribeLedger();
    assert.equal(l.claim(byId('study'), DAY).minutes, 15);
    assert.equal(l.claim(byId('nofeed30'), DAY).minutes, 15);
    const capped = l.claim(byId('lesson'), DAY);
    assert.deepEqual([capped.minutes, capped.capped, capped.loot], [0, true, 'book page']);
    assert.equal(l.minutesLeft(DAY), 0);
    assert.equal(l.minutesToday(DAY), 30);
  });

  test('a partial payout is marked capped', () => {
    const l = new BribeLedger();
    l.claim(byId('study'), DAY); l.claim(byId('away10'), DAY);
    const g = l.claim(byId('feed'), DAY);
    assert.deepEqual([g.minutes, g.capped, g.loot], [5, true, 'seed']);
  });

  test('trust still pays after the minute cap, and honor still counts toward the honor cap', () => {
    const l = new BribeLedger();
    l.claim(byId('study'), DAY); l.claim(byId('nofeed30'), DAY);
    const call = l.claim(byId('call'), DAY);
    assert.deepEqual([call.type, call.minutes, call.trust], ['Granted', 0, 1]);
    assert.equal(l.honorLeft(DAY), 2);
  });

  test('three honor bribes a day, then refused; a new day resets both caps', () => {
    const l = new BribeLedger();
    for (const id of ['water', 'tidy', 'quiet']) assert.equal(l.claim(byId(id), DAY).type, 'Granted');
    const r = l.claim(byId('call'), DAY);
    assert.equal(r.type, 'Refused');
    assert.match(r.reason, /stopped believing/);
    assert.equal(l.claim(byId('eyes'), DAY).type, 'Granted'); // checked bribes still pay
    assert.equal(l.honorLeft(DAY + 1), 3);
    assert.equal(l.minutesLeft(DAY + 1), 30);
  });

  test('a checked bribe claimed on honor counts as honor', () => {
    const l = new BribeLedger();
    for (let i = 0; i < 3; i++) l.claim(byId('breathing'), DAY, true);
    assert.equal(l.claim(byId('breathing'), DAY, true).type, 'Refused');
    assert.equal(l.claim(byId('breathing'), DAY).type, 'Granted');
  });

  test('with sync, the caps apply to the summed totals', () => {
    const l = new BribeLedger();
    const phone = { minutes: 25, honor: 2 };
    assert.equal(l.minutesLeft(DAY, phone), 5);
    assert.equal(l.honorLeft(DAY, phone), 1);
    const g = l.claim(byId('study'), DAY, false, phone);
    assert.deepEqual([g.minutes, g.capped], [5, true]);
    assert.equal(l.claim(byId('water'), DAY, true, phone).type, 'Granted');
    assert.equal(l.claim(byId('tidy'), DAY, true, phone).type, 'Refused');
  });

  test('describeClaim says what it paid', () => {
    const lines = new Lines(Random(1));
    const l = new BribeLedger();
    assert.match(describeClaim(l.claim(byId('study'), DAY), lines), /\+15 min today · candle for the nest$/);
    assert.match(describeClaim(l.claim(byId('nofeed30'), DAY), lines), /\+15 min today · coin for the nest$/);
    assert.match(describeClaim(l.claim(byId('call'), DAY), lines), /No more bribe minutes today, but it still counts · trust \+1$/);
    const l2 = new BribeLedger();
    l2.claim(byId('study'), DAY); l2.claim(byId('away10'), DAY);
    assert.match(describeClaim(l2.claim(byId('feed'), DAY), lines), /\+5 min \(that's today's 30-minute bribe cap\)/);
    assert.equal(describeClaim({ type: 'Refused', reason: 'nope' }, lines), 'nope');
  });
});

describe('learning sites', () => {
  test('the fixed list from spec section 11', () => {
    assert.deepEqual(LEARNING_SITES.map((s) => s.name), [
      'Duolingo', 'Khan Academy', 'Coursera', 'edX', 'freeCodeCamp', 'Codecademy', 'LeetCode', 'Exercism',
      'MIT OpenCourseWare', 'Brilliant', '10 Minute School', 'Shikkhok Batayon',
    ]);
    assert.equal(new Set(LEARNING_SITES.map((s) => s.id)).size, LEARNING_SITES.length);
    for (const s of LEARNING_SITES) {
      assert.equal(learningSiteOf(s.url), s.id, s.url);
      assert.ok(s.matches.every((m) => /^\*:\/\/[^/]+\/\*$/.test(m)));
    }
    assert.deepEqual(LEARNING_SITES.find((s) => s.id === 'mitocw').matches, ['*://ocw.mit.edu/*']);
  });

  test('learningSiteOf', () => {
    assert.equal(learningSiteOf('https://www.duolingo.com/learn'), 'duolingo');
    assert.equal(learningSiteOf('https://de.khanacademy.org/math'), 'khanacademy');
    assert.equal(learningSiteOf('https://ocw.mit.edu/courses/6-0001/'), 'mitocw');
    assert.equal(learningSiteOf('https://www.mit.edu/'), null);
    assert.equal(learningSiteOf('https://www.teachers.gov.bd/content'), 'shikkhok');
    assert.equal(learningSiteOf('https://10minuteschool.com/'), 'tenminuteschool');
    assert.equal(learningSiteOf('https://duolingo.com.evil.example/'), null);
    assert.equal(learningSiteOf('https://www.instagram.com/'), null);
    assert.equal(learningSiteOf('nonsense'), null);
  });
});

describe('NOTE and CANVAS checks (TaskActivity note()/canvas(), DrawPad)', () => {
  test('words are counted the app\'s way', () => {
    assert.equal(countWords(''), 0);
    assert.equal(countWords('   '), 0);
    assert.equal(countWords('one'), 1);
    assert.equal(countWords('  call   mum\n\tfinish report  '), 4);
    assert.equal(noteProgress('a b c', 6), '3 / 6 words');
  });

  test('plan needs 6 words, feed needs 30', () => {
    assert.ok(!noteOk('email the landlord about rent', byId('plan').amount));
    assert.ok(noteOk('email the landlord about rent today', byId('plan').amount));
    const twentyNine = Array(29).fill('good').join(' ');
    assert.ok(!noteOk(twentyNine, byId('feed').amount));
    assert.ok(noteOk(twentyNine + ' tea', byId('feed').amount));
  });

  test('strokes count on pointer-up, clear resets', () => {
    const seen = [];
    const c = new StrokeCounter((n) => seen.push(n));
    c.up(); // stray up without down
    assert.equal(c.strokes, 0);
    for (let i = 0; i < 7; i++) { c.down(); c.up(); }
    assert.ok(!c.ok(byId('draw').amount));
    c.down(); c.up();
    assert.ok(c.ok(byId('draw').amount));
    assert.ok(canvasOk(c.strokes, 8));
    c.clear();
    assert.equal(c.strokes, 0);
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 0]);
  });
});

describe('desktop timers (EYE_BREAK, NO_FEED, FOCUS)', () => {
  test('eye break: any input restarts the 20 s', () => {
    const t = new SteadyTimer(20_000);
    t.start(0);
    t.restart(12_000); // moved the mouse
    assert.ok(!t.done(25_000));
    assert.equal(t.progressMs(25_000), 13_000);
    assert.ok(t.done(32_000));
    t.restart(40_000);
    assert.ok(t.done(40_001)); // stays done
    assert.equal(t.bestMs, 28_000); // longest stretch: 12 s .. 40 s
  });

  test('no feed for 30 min: opening a feed stops it until the last one closes', () => {
    const t = new SteadyTimer(30 * MINUTE_MS);
    t.start(0);
    t.stop(10 * MINUTE_MS); // opened Instagram
    assert.ok(!t.running);
    assert.equal(t.progressMs(20 * MINUTE_MS), 0);
    t.start(20 * MINUTE_MS); // closed it
    assert.ok(!t.done(49 * MINUTE_MS));
    const back = SteadyTimer.fromJSON(JSON.parse(JSON.stringify(t)));
    assert.ok(back.done(50 * MINUTE_MS));
    assert.equal(back.bestMs, 10 * MINUTE_MS);
  });
});
