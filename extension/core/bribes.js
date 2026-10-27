// Port of app/src/main/java/app/kaak/core/Bribes.kt (app v0.10.x) with a desktop catalog
// (spec section 11). The model, BribeLedger and its caps are unchanged: 30 bribe minutes a day,
// 3 honor bribes a day, loot and trust always pay.
import { hostMatches } from './sites.js';

/** How Kaak checks that a bribe was actually done (desktop). */
export const Check = Object.freeze({
  HONOR: 'HONOR',         // Kaak takes your word (max 3 a day)
  AWAY: 'AWAY',           // computer idle or locked for N minutes straight (chrome.idle); app: PHONE_DOWN
  EYE_BREAK: 'EYE_BREAK', // N seconds with no input while Kaak's page counts down
  SITE_TIME: 'SITE_TIME', // a learning site's tab visible and focused for N minutes in total; app: APP_TIME
  BREATHING: 'BREATHING', // N minutes of guided breathing on Kaak's page
  STRETCH: 'STRETCH',     // N one-minute stretches on Kaak's page
  CANVAS: 'CANVAS',       // draw Kaak, at least N strokes
  NOTE: 'NOTE',           // write at least N words in Kaak's notepad (never saved)
  NO_FEED: 'NO_FEED',     // no feed tab open for N minutes straight
  FOCUS: 'FOCUS',         // focus timer: N minutes, no feed tab, Kaak's timer running (from mood "Avoiding")
  BEDTIME: 'BEDTIME',     // automatic: no feeds after bedtime
});

/** What `amount` means for each check. */
export const AMOUNT_UNIT = Object.freeze({
  HONOR: null, AWAY: 'minutes', EYE_BREAK: 'seconds', SITE_TIME: 'minutes', BREATHING: 'minutes', STRETCH: 'minutes',
  CANVAS: 'strokes', NOTE: 'words', NO_FEED: 'minutes', FOCUS: 'minutes', BEDTIME: null,
});

/**
 * Kotlin data class Bribe. amount = minutes, seconds, words or strokes, depending on check.
 */
export function Bribe(id, title, check, { amount = 0, rewardMin, loot = null, trust = 0, quietHour = false, selectable = true }) {
  return Object.freeze({ id, title, check, amount, rewardMin, loot, trust, quietHour, selectable });
}

/**
 * Desktop bribe table. Rewards and loot reuse the app's numbers where an equivalent exists
 * (app id in brackets); new ones are marked "desktop".
 */
export const BribeCatalog = (() => {
  const ALL = Object.freeze([
    Bribe('away5', 'Step away from the computer for 5 min', Check.AWAY, { amount: 5, rewardMin: 5 }), // desktop (eyes: 5)
    Bribe('away10', 'Step away from the computer for 10 min', Check.AWAY, { amount: 10, rewardMin: 10 }), // [quiet]
    Bribe('away20', 'Step away from the computer for 20 min', Check.AWAY, { amount: 20, rewardMin: 10, loot: 'tea cup' }), // [meal]
    Bribe('eyes', '20-20-20 eye break: look 20 feet away for 20 seconds', Check.EYE_BREAK, { amount: 20, rewardMin: 5 }), // [eyes]
    Bribe('lesson', 'One lesson on a learning site', Check.SITE_TIME, { amount: 5, rewardMin: 10, loot: 'book page' }), // [lesson]
    Bribe('study', '25-min study session on a learning site', Check.SITE_TIME, { amount: 25, rewardMin: 15, loot: 'candle' }), // [study]
    Bribe('breathing', '3-min guided breathing', Check.BREATHING, { amount: 3, rewardMin: 5, loot: 'feather' }), // [breathing]
    Bribe('stretch', '5-minute stretch', Check.STRETCH, { amount: 5, rewardMin: 5, loot: 'rubber band' }), // [stretch]
    Bribe('draw', 'Draw Kaak while he poses', Check.CANVAS, { amount: 8, rewardMin: 5, loot: 'crayon' }), // [draw]
    Bribe('plan', 'Plan tomorrow: write your top 3 tasks', Check.NOTE, { amount: 6, rewardMin: 5, loot: 'pencil stub' }), // [plan]
    Bribe('feed', 'Feed Kaak: write 3 good things about today', Check.NOTE, { amount: 30, rewardMin: 10, loot: 'seed' }), // [feed]
    Bribe('nofeed30', 'Close every feed tab for 30 minutes', Check.NO_FEED, { amount: 30, rewardMin: 15, loot: 'coin' }), // desktop
    Bribe('water', 'Drink a glass of water', Check.HONOR, { rewardMin: 5 }), // [water]
    Bribe('tidy', 'Tidy your desk', Check.HONOR, { rewardMin: 5 }), // [tidy]
    Bribe('call', 'Call a friend or family member', Check.HONOR, { rewardMin: 10, trust: 1 }), // [call]
    Bribe('quiet', 'Prayer or a quiet break of your choice', Check.HONOR, { rewardMin: 10 }), // [quiet]
    Bribe('stretch1', 'A 60-second stretch', Check.STRETCH, { amount: 1, rewardMin: 2, selectable: false }), // [stretch1]
    Bribe('focus15', "15 minutes on the thing you're avoiding", Check.FOCUS, { amount: 15, rewardMin: 10, loot: 'pencil stub', selectable: false }), // [focus15]
    Bribe('bedtime', 'Go to bed on time', Check.BEDTIME, { rewardMin: 0, loot: 'morning gift', trust: 1, selectable: false }), // [bedtime]
  ]);
  return Object.freeze({
    ALL,
    byId: (id) => ALL.find((b) => b.id === id) ?? null,
    /** Every bribe a person can pick (bedtime and the focus timer are automatic). TaskCenter.selectable. */
    get selectable() { return ALL.filter((b) => b.selectable); },
  });
})();

/** The app's stretch routine (TaskActivity), one minute each; STRETCH amount = how many. */
export const STRETCHES = Object.freeze([
  'Neck rolls, slow, both ways',
  'Shoulder rolls, back and forward',
  'Reach up high, then hang forward',
  'Side bends, left and right',
  'Hands behind your back, open the chest',
]);

/**
 * Learning sites for Check.SITE_TIME, a fixed list (Chrome can only ask for hosts declared in
 * the manifest's optional_host_permissions). Adding one = an extension update.
 */
export const LEARNING_SITES = Object.freeze([
  learn('duolingo', 'Duolingo', ['duolingo.com'], 'https://www.duolingo.com/'),
  learn('khanacademy', 'Khan Academy', ['khanacademy.org'], 'https://www.khanacademy.org/'),
  learn('coursera', 'Coursera', ['coursera.org'], 'https://www.coursera.org/'),
  learn('edx', 'edX', ['edx.org'], 'https://www.edx.org/'),
  learn('freecodecamp', 'freeCodeCamp', ['freecodecamp.org'], 'https://www.freecodecamp.org/'),
  learn('codecademy', 'Codecademy', ['codecademy.com'], 'https://www.codecademy.com/'),
  learn('leetcode', 'LeetCode', ['leetcode.com'], 'https://leetcode.com/'),
  learn('exercism', 'Exercism', ['exercism.org'], 'https://exercism.org/'),
  learn('mitocw', 'MIT OpenCourseWare', ['ocw.mit.edu'], 'https://ocw.mit.edu/', true),
  learn('brilliant', 'Brilliant', ['brilliant.org'], 'https://brilliant.org/'),
  learn('tenminuteschool', '10 Minute School', ['10minuteschool.com'], 'https://10minuteschool.com/'),
  learn('shikkhok', 'Shikkhok Batayon', ['teachers.gov.bd'], 'https://www.teachers.gov.bd/'),
]);

function learn(id, name, domains, url, exactHost = false) {
  return Object.freeze({
    id, name, url,
    domains: Object.freeze(domains),
    /** For optional_host_permissions / registerContentScripts. */
    matches: Object.freeze(domains.map((d) => (exactHost ? `*://${d}/*` : `*://*.${d}/*`))),
    exactHost,
  });
}

/** The learning site a URL is on, or null. */
export function learningSiteOf(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  return LEARNING_SITES.find((s) => s.domains.some((d) => (s.exactHost ? host === d : hostMatches(host, d))))?.id ?? null;
}

/** Kotlin data class LedgerDay. */
export function LedgerDay(day, minutes = 0, honor = 0) {
  return Object.freeze({ day, minutes, honor });
}

/** ClaimResult.Granted / ClaimResult.Refused as plain objects with a `type`. */
export const ClaimResult = Object.freeze({
  /** capped = true when the 30-minute daily cap cut the minutes. */
  Granted: (minutes, loot, trust, quietHour, capped) => Object.freeze({ type: 'Granted', minutes, loot, trust, quietHour, capped }),
  Refused: (reason) => Object.freeze({ type: 'Refused', reason }),
});

/**
 * Daily caps: at most minuteCap bribe minutes and honorCap honor-based bribes.
 * Big efforts still pay loot and trust after the minute cap is hit, so effort
 * always pays even when it can't buy more feed.
 * With sync (M5), pass `othersToday` to count other devices' claims toward the caps
 * (the caps apply to the summed totals).
 */
export class BribeLedger {
  /** LedgerDay; assignable like Kotlin `var today` (e.g. restored from storage). */
  today;
  #minuteCap;
  #honorCap;

  constructor({ today = LedgerDay(-1), minuteCap = 30, honorCap = 3 } = {}) {
    this.today = today;
    this.#minuteCap = minuteCap;
    this.#honorCap = honorCap;
  }

  minutesLeft(dayKey, othersToday = null) { return this.#minuteCap - this.#day(dayKey).minutes - (othersToday?.minutes ?? 0); }
  honorLeft(dayKey, othersToday = null) { return this.#honorCap - this.#day(dayKey).honor - (othersToday?.honor ?? 0); }
  minutesToday(dayKey) { return this.#day(dayKey).minutes; }

  /**
   * honor = Kaak couldn't check it (the user chose honor, or it is an honor bribe). Max honorCap a day.
   * @param {object} b a Bribe
   * @param {number} dayKey
   * @param {boolean} [honor] defaults to b.check === HONOR
   * @param {{minutes:number, honor:number}|null} [othersToday] JS-only: other devices' totals today (sync)
   */
  claim(b, dayKey, honor = b.check === Check.HONOR, othersToday = null) {
    const d = this.#day(dayKey);
    const otherMin = othersToday?.minutes ?? 0;
    const otherHonor = othersToday?.honor ?? 0;
    if (honor && d.honor + otherHonor >= this.#honorCap) {
      return ClaimResult.Refused('Kaak has stopped believing you for today. Try one he can check.');
    }
    const minutes = Math.max(Math.min(b.rewardMin, this.#minuteCap - d.minutes - otherMin), 0);
    this.today = LedgerDay(d.day, d.minutes + minutes, d.honor + (honor ? 1 : 0));
    return ClaimResult.Granted(minutes, b.loot, b.trust, b.quietHour, minutes < b.rewardMin);
  }

  #day(dayKey) {
    if (this.today.day !== dayKey) this.today = LedgerDay(dayKey);
    return this.today;
  }

  toJSON() { return { today: { ...this.today }, minuteCap: this.#minuteCap, honorCap: this.#honorCap }; }
  static fromJSON(o) {
    return new BribeLedger({ today: LedgerDay(o.today.day, o.today.minutes, o.today.honor), minuteCap: o.minuteCap, honorCap: o.honorCap });
  }
}

/**
 * TaskCenter.describe: the line shown after a claim. `lines` is a Lines instance.
 */
export function describeClaim(result, lines) {
  if (result.type === 'Refused') return result.reason;
  let s = lines.bribeAccepted() + ' ';
  if (result.minutes > 0 && result.capped) s += `+${result.minutes} min (that's today's 30-minute bribe cap)`;
  else if (result.minutes > 0) s += `+${result.minutes} min today`;
  else if (result.quietHour) s += 'A quiet hour: no gags for 60 minutes';
  else s += 'No more bribe minutes today, but it still counts';
  if (result.loot) s += ` · ${result.loot} for the nest`;
  if (result.trust > 0) s += ` · trust +${result.trust}`;
  return s;
}
