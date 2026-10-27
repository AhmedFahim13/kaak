// Port of app/src/main/java/app/kaak/core/Week.kt (app v0.10.x).
import { MINUTE_MS, defaultRandom, randInt } from './model.js';

const DAY_DEFAULTS = Object.freeze({
  day: 0,
  mindlessMin: 0,
  feedOpens: 0,
  /** Thefts, asleep screens and eatings: times Kaak stopped an open. */
  foiled: 0,
  eaten: 0,
  escapes: 0,
  bribes: 0,
  steps: 0,
  returnedMin: 0,
  longestSessionMin: 0,
  /** Latest feed use between 9 p.m. and 5 a.m., as minutes after 9 p.m.; -1 = none. */
  lateMinute: -1,
  worthYes: 0,
  worthNo: 0,
  chasesWon: 0,
  moodChecks: 0,
});

/** One day of aggregate numbers. Feeds the trust score and Kaak Times. DayStats({ day, mindlessMin: 20 }). */
export function DayStats(fields = {}) {
  const d = { ...DAY_DEFAULTS };
  for (const k of Object.keys(DAY_DEFAULTS)) if (fields[k] !== undefined) d[k] = fields[k];
  return Object.freeze(d);
}

export const Trust = Object.freeze({
  /** Good day +2 (under half the limit) or +1 (under the limit); eaten or escaped -1. Never below zero. */
  dayDelta(d, limitMin) {
    if (d.eaten > 0 || d.escapes > 0) return -1;
    if (d.mindlessMin <= Math.trunc(limitMin / 2)) return 2;
    if (d.mindlessMin <= limitMin) return 1;
    return 0;
  },

  lateMinuteOf(minuteOfDay) {
    if (minuteOfDay >= 21 * 60) return minuteOfDay - 21 * 60;
    if (minuteOfDay < 5 * 60) return minuteOfDay + 3 * 60;
    return -1;
  },
});

/**
 * Minutes Kaak got you back. After a visit he ended (theft, eating) or
 * interrupted (you left within 2 minutes of a gag), the time until your next
 * feed visit counts, capped at 30 minutes per interruption.
 */
export class ReturnedTime {
  #windowMs;
  #capMs;
  #lastGagAt = null;
  #creditFrom = null;

  constructor({ windowMs = 2 * MINUTE_MS, capMs = 30 * MINUTE_MS } = {}) {
    this.#windowMs = windowMs;
    this.#capMs = capMs;
  }

  onKaakAction(now, endsVisit) {
    if (endsVisit) this.#creditFrom = now; else this.#lastGagAt = now;
  }

  onLeaveFeed(now) {
    if (this.#creditFrom == null && this.#lastGagAt != null && now - this.#lastGagAt <= this.#windowMs) this.#creditFrom = now;
    this.#lastGagAt = null;
  }

  /** Returns credited ms (0 if none). */
  onEnterFeed(now) {
    const from = this.#creditFrom;
    if (from == null) return 0;
    this.#creditFrom = null;
    return Math.max(Math.min(now - from, this.#capMs), 0);
  }

  /** Pays out a full cap when the user simply never came back. */
  flush(now) {
    const from = this.#creditFrom;
    if (from == null) return 0;
    if (now - from < this.#capMs) return 0;
    this.#creditFrom = null;
    return this.#capMs;
  }

  /** JS-only persistence. */
  toJSON() { return { windowMs: this.#windowMs, capMs: this.#capMs, lastGagAt: this.#lastGagAt, creditFrom: this.#creditFrom }; }
  static fromJSON(o) {
    const r = new ReturnedTime({ windowMs: o.windowMs, capMs: o.capMs });
    r.#lastGagAt = o.lastGagAt;
    r.#creditFrom = o.creditFrom;
    return r;
  }
}

export function Story(title, body) { return Object.freeze({ title, body }); }

export function Edition(weekLabel, headline, subhead, stories, weather, classified) {
  return Object.freeze({ weekLabel, headline, subhead, stories, weather, classified });
}

const sum = (days, k) => days.reduce((a, d) => a + d[k], 0);
const maxOr = (days, k, dflt) => (days.length ? Math.max(...days.map((d) => d[k])) : dflt);
/** Kotlin "%,d".format(n) */
const grouped = (n) => n.toLocaleString('en-US');

/** Kaak's Sunday tabloid, written on the device from templates. Nothing leaves the device. */
export const KaakTimes = Object.freeze({
  totals(days) {
    return Object.freeze({
      opens: sum(days, 'feedOpens'), foiled: sum(days, 'foiled'), eaten: sum(days, 'eaten'), escapes: sum(days, 'escapes'),
      bribes: sum(days, 'bribes'), steps: sum(days, 'steps'), returnedMin: sum(days, 'returnedMin'), mindlessMin: sum(days, 'mindlessMin'),
      longestMin: maxOr(days, 'longestSessionMin', 0), lateMinute: maxOr(days, 'lateMinute', -1),
      worthYes: sum(days, 'worthYes'), worthNo: sum(days, 'worthNo'), chasesWon: sum(days, 'chasesWon'), days: days.length,
    });
  },

  hours(min) {
    if (min < 60) return `${min} MINUTES`;
    if (min % 60 === 0) return `${Math.trunc(min / 60)} HOURS`;
    return `${Math.trunc(min / 60)}H ${min % 60}M`;
  },

  clock(lateMinute) {
    const m = (21 * 60 + lateMinute) % (24 * 60);
    const h = Math.trunc(m / 60);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'A.M.' : 'P.M.'}`;
  },

  compose(thisWeek, lastWeek, weekLabel, random = defaultRandom) {
    const hours = KaakTimes.hours;
    const clock = KaakTimes.clock;
    const w = KaakTimes.totals(thisWeek);
    const prev = KaakTimes.totals(lastWeek);
    const angles = [];
    const pick = (...o) => o[randInt(random, o.length)];
    const Angle = (score, headline, subhead, story) => ({ score, headline, subhead, story });

    if (w.opens > 0) angles.push(Angle(
      1.0 + w.foiled / 5.0,
      `LOCAL HUMAN TRIES TO OPEN FEEDS ${w.opens} TIMES`,
      `Kaak foils ${w.foiled} attempts, returns ${hours(w.returnedMin).toLowerCase()} to victim.`,
      Story(`Attempts on the feed: ${w.opens}`, pick(
        `Kaak stopped ${w.foiled} of them personally and describes the rest as "a learning process."`,
        `Of these, ${w.foiled} ended with a crow in the way. Witnesses describe the crow as smug.`,
      )),
    ));
    if (w.returnedMin >= 60) angles.push(Angle(
      w.returnedMin / 60.0,
      `${hours(w.returnedMin)} RECOVERED IN DARING CROW OPERATION`,
      'Time returned to its rightful owner. Crow requests a bottle cap as payment.',
      Story(`Time returned: ${hours(w.returnedMin).toLowerCase()}`, pick(
        'That is enough to walk to Dhanmondi Lake and back. Twice. Kaak has checked.',
        'Kaak has converted this time into loot. The nest is getting heavy.',
      )),
    ));
    if (prev.mindlessMin > 0 && w.days >= 3) {
      const change = Math.round(((w.mindlessMin - prev.mindlessMin) * 100.0) / prev.mindlessMin);
      if (change <= -10) angles.push(Angle(
        2.0 + -change / 10.0,
        `FEED TIME DOWN ${-change}%. CROW CLAIMS ALL CREDIT`,
        'Human also claims credit. Investigation ongoing.',
        Story(`Mindless scrolling down ${-change}%`, `From ${prev.mindlessMin} minutes last week to ${w.mindlessMin}. Kaak would like this framed.`),
      ));
      else if (change >= 15) angles.push(Angle(
        1.5 + change / 20.0,
        `SCROLLING UP ${change}% AS CROW LOOKS ON IN DISBELIEF`,
        '"I was right there," says crow.',
        Story(`Scrolling up ${change}%`, `${w.mindlessMin} minutes this week, up from ${prev.mindlessMin}. Kaak has sharpened his beak.`),
      ));
    }
    if (w.eaten >= 2) angles.push(Angle(
      1.2 + w.eaten / 2.0,
      `CROW EATS FEED ${w.eaten} TIMES, REPORTS NO REGRETS`,
      '"Delicious," he said, before falling asleep on it.',
      Story(`Feeds eaten: ${w.eaten}`, pick('Each one followed by a 20-minute nap. Kaak calls this self-care.', "Kaak's doctor has asked him to slow down.")),
    ));
    if (w.escapes >= 2) angles.push(Angle(
      1.0 + w.escapes / 2.0,
      `HUMAN ESCAPES CROW ${w.escapes} TIMES. CROW "REMEMBERS"`,
      'Five-second holds getting faster, sources say.',
      Story(`Escapes: ${w.escapes}`, 'Each was legal under Clause 6. Kaak has filed each one in his memory anyway.'),
    ));
    if (w.steps >= 5_000) angles.push(Angle(
      1.0 + w.steps / 10_000.0,
      `HUMAN WALKS ${grouped(w.steps)} STEPS FOR BRIBES. CROW STUNNED`,
      'Legs reportedly "fine."',
      Story(`Steps walked for bribes: ${grouped(w.steps)}`, 'Kaak accepted every one and is not giving any back.'),
    ));
    if (w.lateMinute >= 4 * 60) angles.push(Angle(
      1.5 + (w.lateMinute - 4 * 60) / 60.0,
      `SCROLLING DETECTED AT ${clock(w.lateMinute)}. CROW DISAPPOINTED`,
      '"It was dark. I was asleep. I still knew," says crow.',
      Story(`Latest scroll: ${clock(w.lateMinute).toLowerCase()}`, 'Kaak recommends sleep, which is free and has no ads.'),
    ));
    if (w.chasesWon >= 2) angles.push(Angle(
      0.8 + w.chasesWon / 3.0,
      `HUMAN WINS ${w.chasesWon} CHASES. CROW DEMANDS REMATCH`,
      'Feathers lost in the line of duty.',
      Story(`Chases won by the human: ${w.chasesWon}`, 'Kaak says he was "letting you win." He was not.'),
    ));
    if (w.worthYes + w.worthNo >= 3) angles.push(Angle(
      0.7,
      `SURVEY: ${w.worthNo} OF ${w.worthYes + w.worthNo} SCROLLS "NOT WORTH IT"`,
      "Human's own words. Crow simply asked.",
      Story('Was it worth it?', `You said no ${w.worthNo} times and yes ${w.worthYes} times. Kaak keeps the receipts.`),
    ));
    if (w.days >= 3 && w.mindlessMin <= w.days * 20) angles.push(Angle(
      2.5,
      'QUIET WEEK ON THE ROOFTOP. CROW BORED, PROUD',
      `Only ${w.mindlessMin} minutes of mindless scrolling all week.`,
      Story('A quiet week', 'Kaak spent the time rearranging his nest and pretending not to be proud.'),
    ));
    if (angles.length === 0) angles.push(Angle(
      0.1,
      'CROW MOVES INTO LOCAL PHONE',
      'Neighbours describe him as "loud" and "a thief."',
      Story('Settling in', 'Kaak has unpacked. He did not bring much. He intends to take a lot.'),
    ));

    // sortedByDescending is stable, like Array.prototype.sort
    const ranked = angles.slice().sort((a, b) => b.score - a.score);
    const lead = ranked[0];
    const all = ranked.slice(1).map((a) => a.story).concat([
      Story(`Bribes accepted: ${w.bribes}`, w.bribes > 0 ? 'Each one honest, mostly. Kaak keeps the books.' : 'None. Kaak is open to offers.'),
      Story(`Longest scroll: ${w.longestMin} minutes`, 'Kaak was present for all of it.'),
    ]);
    const seen = new Set();
    const stories = all.filter((s) => (seen.has(s.title) ? false : (seen.add(s.title), true))).slice(0, 3);

    const avg = w.days > 0 ? Math.trunc(w.mindlessMin / w.days) : 0;
    const weather = avg <= 15 ? 'Feed forecast: clear skies, light scrolling.'
      : avg <= 40 ? 'Feed forecast: overcast, scattered reels.'
        : avg <= 75 ? 'Feed forecast: heavy scrolling, carry a crow.'
          : 'Feed forecast: doomscroll warning in effect.';
    const classified = pick(
      'WANTED: one (1) phone charger, last seen near the bed. Ask for Kaak.',
      'FOR TRADE: bottle caps, various. Will accept coins, keys, or a balcony.',
      'LOST: your attention span. If found, please return to its owner.',
      'SEEKING: a human who sleeps before midnight. Must like crows.',
      'FREE: one (1) sunset, available nightly from any rooftop. No app required.',
      'NOTICE: the cha stall on the corner reports a missing biscuit. Kaak denies everything.',
    );
    return Edition(weekLabel, lead.headline, lead.subhead, stories, weather, classified);
  },
});
