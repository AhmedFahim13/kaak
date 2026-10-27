// Everything Kaak keeps, in chrome.storage.local (on this computer only) plus a fast
// chrome.storage.session copy of the live state, which survives the service worker being
// stopped (MV3 does that every ~30 s when idle). chrome.storage.sync is never used.

export const PREF_DEFAULTS = {
  onboarded: false,
  installedAt: 0,
  chaos: "KAAK",
  arrivalMin: 10,
  gagEverySec: 90,
  lang: "ENGLISH",
  feeds: ["instagram", "facebook", "tiktok", "youtube"],
  paused: false,
  pausedUntil: 0,
  sound: true,
  dailyLimitMin: 60,
  bedtimeMinute: 23 * 60 + 30,
  jumpscare: "MEDIUM",
  nightJumpscares: false,
  reduceMotion: false,
  detourIds: null, // null = the catalog's defaults
  detourLinks: {}, // detour id -> a link the user chose (a course, a saved video)
  friendName: null,
  lastGiftDay: 0,
  lastFeedUseWall: 0,
  workMode: false,
  workDays: [7, 1, 2, 3, 4], // ISO days: Sunday to Thursday
  workStartMin: 9 * 60,
  workEndMin: 17 * 60,
  moodChecks: true,
  lastTrustDay: 0,
  lastTimesDay: 0,
  lastAliveWall: 0,
  labelsGiven: 0,
  seen: {},
  recentDetours: {}, // id -> shown at (wall ms)
  learningSites: [], // ids from LEARNING_SITES the user granted
  strictUntil: 0,
  strictCoolOffAt: 0,
  pendingWorth: null, // {at, label} asked at the start of the next feed visit
  badge: null, // "gift" | "times" | null
};

export const WALLET_DEFAULTS = {
  ledger: { day: -1, minutes: 0, honor: 0 },
  trust: 0,
  returnedMin: 0,
  returnedBucket: 0,
  quietUntil: 0,
  loot: {},
};

const LOG_MAX = 4000;
const CRASH_MAX = 200;

let cache = null;
let dirty = new Set();
let flushTimer = null;

export async function load() {
  if (cache) return cache;
  const got = await chrome.storage.local.get(["prefs", "wallet", "days", "log", "crash"]);
  cache = {
    prefs: { ...PREF_DEFAULTS, ...(got.prefs || {}) },
    wallet: { ...WALLET_DEFAULTS, ...(got.wallet || {}) },
    days: got.days || {},
    log: got.log || [],
    crash: got.crash || [],
  };
  if (!cache.prefs.installedAt) { cache.prefs.installedAt = Date.now(); mark("prefs"); }
  return cache;
}

export function data() { return cache; }

export function mark(key) {
  dirty.add(key);
  if (!flushTimer) flushTimer = setTimeout(flush, 400);
}

export async function flush() {
  clearTimeout(flushTimer); flushTimer = null;
  if (!cache || !dirty.size) return;
  const out = {};
  for (const k of dirty) out[k] = cache[k];
  dirty = new Set();
  await chrome.storage.local.set(out);
}

export function prefs() { return cache.prefs; }
export function setPrefs(patch) {
  Object.assign(cache.prefs, patch);
  mark("prefs");
}
export function wallet() { return cache.wallet; }
export function setWallet(patch) {
  Object.assign(cache.wallet, patch);
  mark("wallet");
}

// ---- day stats (kept 30 days), same fields as DayStore.kt
export function day(key) {
  return cache.days["d" + key] || null;
}
export function updateDay(key, fn, blank) {
  const cur = cache.days["d" + key] || blank(key);
  cache.days["d" + key] = fn({ ...cur });
  const keys = Object.keys(cache.days).sort();
  while (keys.length > 30) delete cache.days[keys.shift()];
  mark("days");
}
export function allDays(keys) {
  return keys.map(k => cache.days["d" + k]).filter(Boolean);
}

// ---- session log (JSONL, shared by hand via "Share my stats")
export function logLine(obj) {
  cache.log.push(JSON.stringify({ t: new Date().toISOString(), ...obj }));
  if (cache.log.length > LOG_MAX) cache.log.splice(0, cache.log.length - LOG_MAX);
  mark("log");
}
export function crash(where, err) {
  cache.crash.push(JSON.stringify({ t: new Date().toISOString(), where, error: String(err && err.stack || err) }));
  if (cache.crash.length > CRASH_MAX) cache.crash.splice(0, cache.crash.length - CRASH_MAX);
  mark("crash");
}

// ---- live state (brain snapshot etc.) in session storage: fast, survives worker restarts
export async function loadLive() {
  const s = await chrome.storage.session.get("live");
  if (s.live) return s.live;
  const l = await chrome.storage.local.get("live");
  return l.live || null;
}
let lastDurable = 0;
export async function saveLive(live) {
  await chrome.storage.session.set({ live });
  if (Date.now() - lastDurable > 30_000) {
    lastDurable = Date.now();
    await chrome.storage.local.set({ live });
  }
}
export async function saveLiveDurable(live) {
  lastDurable = Date.now();
  await chrome.storage.session.set({ live });
  await chrome.storage.local.set({ live });
}
