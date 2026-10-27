// Port of app/src/main/java/app/kaak/core/Model.kt (app v0.10.x).
// Pure JS: no DOM, no chrome.*. Kotlin Long -> Number (ms).

export const MINUTE_MS = 60_000;

/** Kotlin's Long.MAX_VALUE as used by stolenUntil ("until the chase is won"). JSON-safe, unlike Infinity. */
export const FOREVER = Number.MAX_SAFE_INTEGER;
/** Kotlin's Long.MIN_VALUE / 2: "a long time ago", safe to subtract from. */
export const LONG_AGO = Math.floor(Number.MIN_SAFE_INTEGER / 2);

// ---------------------------------------------------------------------------
// Random. Kotlin code takes a kotlin.random.Random; here it is any object with
// nextDouble() in [0, 1). nextInt(n) is optional (used when present, so a
// seeded Kotlin-compatible PRNG reproduces the app's exact choices).

export const defaultRandom = Object.freeze({
  nextDouble: () => Math.random(),
  nextInt: (n) => Math.floor(Math.random() * n),
});

/** Integer in [0, n). Same call Kotlin makes for Collection.random(random). */
export function randInt(random, n) {
  if (typeof random.nextInt === 'function') return random.nextInt(n);
  return Math.min(n - 1, Math.floor(random.nextDouble() * n));
}

/** Kotlin's Collection.random(random). */
export function pickRandom(list, random) {
  if (list.length === 0) throw new Error('Collection is empty.');
  return list[randInt(random, list.length)];
}

/** Kotlin's Iterable.shuffled(random): Fisher-Yates from the end, exactly as kotlin.collections does it. */
export function shuffled(list, random) {
  const a = list.slice();
  for (let i = a.length - 1; i >= 1; i--) {
    const j = randInt(random, i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Enums: frozen objects with name + ordinal; JSON.stringify writes the name.

function makeEnum(defs, { getters = {}, methods = {}, statics = {} } = {}) {
  const entries = [];
  const out = {};
  defs.forEach(([name, props], ordinal) => {
    const e = { name, ordinal, ...props };
    Object.defineProperty(e, 'toJSON', { value: () => name, enumerable: false });
    Object.defineProperty(e, 'toString', { value: () => name, enumerable: false });
    for (const [k, fn] of Object.entries(getters)) Object.defineProperty(e, k, { get: () => fn(e, entries), enumerable: false });
    for (const [k, fn] of Object.entries(methods)) Object.defineProperty(e, k, { value: (...a) => fn(e, entries, ...a), enumerable: false });
    entries.push(e);
    out[name] = e;
  });
  entries.forEach(Object.freeze);
  Object.defineProperty(out, 'entries', { value: Object.freeze(entries), enumerable: false });
  /** Resolves an enum entry from itself or its name (for state restored from JSON). */
  Object.defineProperty(out, 'from', {
    value: (v) => (v == null ? v : typeof v === 'string' ? out[v] : v),
    enumerable: false,
  });
  for (const [k, fn] of Object.entries(statics)) Object.defineProperty(out, k, { value: (...a) => fn(entries, ...a), enumerable: false });
  return Object.freeze(out);
}

/**
 * How mean Kaak is. Times are minutes of *mindless* feed time before each stage.
 * gapMs is the average pause between heckles (jittered ±30%).
 * Chaos.KAAK.gentler() -> PIGEON (PIGEON stays PIGEON).
 */
export const Chaos = makeEnum(
  [
    ['PIGEON', { label: 'Pigeon (gentle)', arrivalMs: 15 * MINUTE_MS, heckleMs: 25 * MINUTE_MS, gapMs: 4 * MINUTE_MS }],
    ['KAAK', { label: 'Kaak (default)', arrivalMs: 10 * MINUTE_MS, heckleMs: 15 * MINUTE_MS, gapMs: 150_000 }],
    ['MONKEY', { label: 'Monkey (harsh)', arrivalMs: 6 * MINUTE_MS, heckleMs: 10 * MINUTE_MS, gapMs: 90_000 }],
  ],
  { methods: { gentler: (e, entries) => entries[Math.max(e.ordinal - 1, 0)] } },
);

/** Heckle gags. */
export const Gag = makeEnum([['WALK_ACROSS', {}], ['SIT_ON_RAIL', {}], ['SPLAT', {}]]);

export const JumpscareLevel = makeEnum([
  ['OFF', { label: 'Off' }],
  ['GENTLE', { label: 'Gentle: a thud, no crack' }],
  ['MEDIUM', { label: 'Medium (default)' }],
  ['FULL', { label: 'Full: crack, shake, KAA!' }],
]);

/**
 * Trust grows with good days and bribes and never resets; a bad day costs a
 * little. Higher trust makes Kaak calmer: rarer gags, earlier warnings, and
 * from Friend on he sits beside the feed instead of stealing it.
 */
export const TrustLevel = makeEnum(
  [
    ['STRANGER', { label: 'Stranger', minPoints: 0, gapFactor: 1.0, warnBeforeMin: 5, steals: true, jumpscareFactor: 1.0 }],
    ['NEIGHBOUR', { label: 'Neighbour', minPoints: 5, gapFactor: 1.25, warnBeforeMin: 7, steals: true, jumpscareFactor: 0.75 }],
    ['FRIEND', { label: 'Friend', minPoints: 15, gapFactor: 1.5, warnBeforeMin: 10, steals: false, jumpscareFactor: 0.5 }],
    ['FAMILY', { label: 'Family', minPoints: 30, gapFactor: 2.0, warnBeforeMin: 10, steals: false, jumpscareFactor: 0.25 }],
  ],
  {
    /** The level after this one, or null at FAMILY. */
    getters: { next: (e, entries) => entries[e.ordinal + 1] ?? null },
    statics: {
      /** TrustLevel.of(points): the highest level whose minPoints <= points. */
      of: (entries, points) => {
        for (let i = entries.length - 1; i >= 0; i--) if (points >= entries[i].minPoints) return entries[i];
        return entries[0]; // Kotlin would throw here; trust is clamped at 0 so it never happens
      },
    },
  },
);

/** The one-tap answer to "Why are you scrolling?" */
export const Mood = makeEnum([
  ['BORED', { label: 'Bored' }],
  ['TIRED', { label: 'Tired' }],
  ['AVOIDING', { label: 'Avoiding something' }],
  ['LONELY', { label: 'Lonely' }],
]);

/** Subtitle language. English is the default; the others are opt-in in settings. */
export const Lang = makeEnum([
  ['ENGLISH', { label: 'English (default)' }],
  ['BANGLISH', { label: 'Banglish' }],
  ['BANGLA', { label: 'বাংলা' }],
]);

// ---------------------------------------------------------------------------
// Actions: what the brain wants the overlay to do. Plain frozen objects with a
// `type` (same names as Kotlin's sealed interface). Compare with `a.type`.

const one = (type) => Object.freeze({ type });

export const Action = Object.freeze({
  None: one('None'),
  Hide: one('Hide'),
  Arrive: one('Arrive'),
  Return: one('Return'),
  /** @param {object} gag a Gag entry @param {number} minutes */
  Heckle: (gag, minutes) => Object.freeze({ type: 'Heckle', gag: Gag.from(gag), minutes }),
  /** Reopened a feed within 2 minutes of leaving: Kaak snatches it. */
  Steal: one('Steal'),
  Jumpscare: one('Jumpscare'),
  /** Daily limit reached: Kaak eats the feed. */
  Eat: one('Eat'),
  /** A feed was opened while Kaak is still full. */
  Asleep: (minutesLeft) => Object.freeze({ type: 'Asleep', minutesLeft }),
  /** Cooldown ended while the user was sitting on the asleep screen. */
  Wake: one('Wake'),
  Warn: (minutesLeft) => Object.freeze({ type: 'Warn', minutesLeft }),
  /** A small poke between gags: a hop, a peck, today's feed minutes. */
  Nudge: (minutes) => Object.freeze({ type: 'Nudge', minutes }),
  /** Back from a quick hop (share sheet, permission dialog, screen lock): Kaak just perches again, no "again?". */
  Resume: one('Resume'),
  /** A feed was opened while Kaak still holds it after a theft: straight back home. */
  Bounce: one('Bounce'),
});

/** Every Action type name. */
export const ACTION_TYPES = Object.freeze(Object.keys(Action));

/** Structural equality for actions (Kotlin data-class ==). */
export function actionEquals(a, b) {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

// ---------------------------------------------------------------------------
// Rules: everything the brain needs from settings and the clock, refreshed every tick.

const RULE_DEFAULTS = Object.freeze({
  chaos: Chaos.KAAK,
  dailyLimitMs: 60 * MINUTE_MS,
  /** Minutes earned from bribes today. */
  bonusMs: 0,
  bedtime: false,
  jumpscareAllowed: true,
  /** Quiet hour from the 10,000-step bribe: no gags, limit still applies. */
  quiet: false,
  /** Work hours for sellers and creators: stricter "mindless" test, no theft, no jumpscares. */
  work: false,
  trust: TrustLevel.STRANGER,
  /** User's own slider values; null = the chaos preset. */
  arrivalMs: null,
  heckleMs: null,
  gapMs: null,
  /** Small pokes between gags, at most this often. */
  nudgeMs: 35_000,
});

/**
 * Kotlin `Rules(...)` / `rules.copy(...)`: rules({ quiet: true }) or rules({ ...old, quiet: true }).
 * chaos and trust may be given as entries or as their names (as stored in JSON).
 */
export function rules(overrides = {}) {
  const r = { ...RULE_DEFAULTS };
  for (const k of Object.keys(RULE_DEFAULTS)) if (overrides[k] !== undefined) r[k] = overrides[k];
  r.chaos = Chaos.from(r.chaos);
  r.trust = TrustLevel.from(r.trust);
  if (!r.chaos) throw new Error(`unknown chaos ${overrides.chaos}`);
  if (!r.trust) throw new Error(`unknown trust ${overrides.trust}`);
  return Object.freeze(r);
}
export const Rules = rules;

/** Rules as a plain JSON object (enum entries become names). */
export function rulesToJSON(r) {
  return { ...r, chaos: r.chaos.name, trust: r.trust.name };
}
