// The service worker's view of the ported core (extension/core): small helpers that join the
// pure logic to what's stored (data/Wallet.kt, data/DayStore.kt, data/KaakPrefs.kt equivalents).
import * as store from "./store.js";
import { MINUTE_MS, FOREVER, Chaos, TrustLevel, rules } from "../core/model.js";
import { KaakBrain } from "../core/kaak-brain.js";
import { SITES, siteById, classifyUrl as classify, excludeMatchesFor } from "../core/sites.js";
import { LINES, FIXED, Lines } from "../core/lines.js";
import { DayStats, Trust, ReturnedTime, KaakTimes } from "../core/week.js";
import { Bedtime, dayKeyOf } from "../core/tasks.js";
import { StrictPlan } from "../core/commitment.js";
import { DetourCatalog, DetourPicker, DETOUR_TYPE_LABELS } from "../core/detours.js";
import { BribeCatalog, BribeLedger, LedgerDay, LEARNING_SITES as LS } from "../core/bribes.js";

export { MINUTE_MS, FOREVER };
export const LEARNING_SITES = LS.map(s => ({ id: s.id, name: s.name, url: s.url, matches: [...s.matches] }));

// ------------------------------------------------------------------ brain
export function newBrain(onSessionEnd) { return new KaakBrain({ onSessionEnd }); }
export function restoreBrain(json, onSessionEnd) {
  try { return KaakBrain.fromJSON(json, { onSessionEnd }); } catch (e) { store.crash("restoreBrain", e); return newBrain(onSessionEnd); }
}
const st = b => b.toJSON().state;
export const arrived = b => !!st(b).arrived;
export const lastDetection = b => st(b).lastDetection || null;
export const lastStats = b => st(b).lastStats || null;

export function makeRules(o) {
  const { trustPoints, ...rest } = o;
  return rules({ ...rest, chaos: Chaos.from(o.chaos) || Chaos.KAAK, trust: TrustLevel.of(Math.max(0, trustPoints || 0)) });
}
export const trustSteals = r => r.trust.steals;
export const trustLabel = points => TrustLevel.of(Math.max(0, points)).label;
export function trustNext(points) {
  const n = TrustLevel.of(Math.max(0, points)).next;
  return n ? { points: n.minPoints - points, label: n.label } : null;
}
export const gentlerChaos = name => (Chaos.from(name) || Chaos.KAAK).gentler().name;

// ------------------------------------------------------------------ time
export const today = t => dayKeyOf(new Date(t));
export const isBedtime = (minute, bedtimeMinute) => Bedtime.isBedtime(minute, bedtimeMinute);
export const lateMinuteOf = m => Trust.lateMinuteOf(m);
export function weekDays(dayKey) {
  const y = Math.floor(dayKey / 10000), m = Math.floor(dayKey / 100) % 100 - 1, d = dayKey % 100;
  return [6, 5, 4, 3, 2, 1, 0].map(back => dayKeyOf(new Date(y, m, d - back)));
}
export function tomorrowMorning(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 6, 0, 0).getTime();
}

// ------------------------------------------------------------------ days
export const blankDay = k => ({ ...DayStats({ day: k }) });
export const dayStats = k => store.day(k) || blankDay(k);
export const updateDay = (k, fn) => store.updateDay(k, fn, blankDay);
export const trustDayDelta = (d, limitMin) => Trust.dayDelta(d, limitMin);

// ------------------------------------------------------------------ wallet (data/Wallet.kt)
const SHINIES = ["bottle cap", "coin", "key", "broken watch", "marble", "button"];
function ledger() {
  const l = store.wallet().ledger;
  return new BribeLedger({ today: LedgerDay(l.day, l.minutes, l.honor) });
}
export function bonusMinutes(dayKey) { return ledger().minutesToday(dayKey); }
export function bribeMinutesLeft(dayKey) { return ledger().minutesLeft(dayKey); }
export function honorLeft(dayKey) { return ledger().honorLeft(dayKey); }
export function addTrust(delta) { store.setWallet({ trust: Math.max(0, store.wallet().trust + delta) }); }
function addLoot(item) {
  const loot = { ...store.wallet().loot };
  loot[item] = (loot[item] || 0) + 1;
  store.setWallet({ loot });
}
export function addReturned(minutes) {
  if (minutes <= 0) return [];
  const w = store.wallet();
  let bucket = w.returnedBucket + minutes;
  const added = [];
  while (bucket >= 15) { bucket -= 15; added.push(SHINIES[Math.floor(Math.random() * SHINIES.length)]); }
  store.setWallet({ returnedMin: w.returnedMin + minutes, returnedBucket: bucket });
  added.forEach(addLoot);
  return added;
}
export function claimBribe(b, dayKey, honor) {
  const l = ledger();
  const r = l.claim(b, dayKey, honor || b.check === "HONOR");
  store.setWallet({ ledger: { day: l.today.day, minutes: l.today.minutes, honor: l.today.honor } });
  if (r.type !== "Granted") return { granted: false, reason: r.reason };
  if (r.loot) addLoot(r.loot);
  if (r.trust) addTrust(r.trust);
  if (r.quietHour) store.setWallet({ quietUntil: Date.now() + 3_600_000 });
  return { granted: true, minutes: r.minutes, loot: r.loot, trust: r.trust, capped: r.capped };
}

// ------------------------------------------------------------------ time Kaak got back
let returned = new ReturnedTime();
export function restoreReturned(j) { try { if (j) returned = ReturnedTime.fromJSON(j); } catch (e) {} }
export const returnedToJSON = () => returned.toJSON();
export const returnedFlush = t => returned.flush(t);
export const returnedOnKaakAction = (t, ends) => returned.onKaakAction(t, ends);
export const returnedOnEnterFeed = t => returned.onEnterFeed(t);
export const returnedOnLeaveFeed = t => returned.onLeaveFeed(t);

// ------------------------------------------------------------------ sites
export const classifyUrl = (url, feeds) => classify(url, feeds);
export const tileFor = id => { const s = siteById(id) || SITES[0]; return { label: s.initial, color: s.color }; };
export const homeUrl = id => (siteById(id) || SITES[0]).homeUrl;
export const coreOrigins = () => SITES.filter(s => !s.optional).flatMap(s => [...s.matches]);

/** Optional feeds (X, Reddit) get their content script registered at runtime. */
export async function registerOptionalFeeds(feeds) {
  const have = new Set((await chrome.scripting.getRegisteredContentScripts()).map(s => s.id));
  for (const s of SITES.filter(x => x.optional)) {
    const id = "feed-" + s.id;
    const want = feeds.includes(s.id) && await chrome.permissions.contains({ origins: [...s.matches] });
    if (want && !have.has(id)) {
      await chrome.scripting.registerContentScripts([{ id, matches: [...s.matches], excludeMatches: excludeMatchesFor([s.id]),
        js: ["engine/kaak-engine.js", "content/feed.js"], runAt: "document_idle", persistAcrossSessions: true }]);
    } else if (!want && have.has(id)) {
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
    }
  }
}
export async function registerSiteTimer(site) {
  const id = "site-" + site.id;
  const have = (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length > 0;
  if (!have) await chrome.scripting.registerContentScripts([{ id, matches: [...site.matches], js: ["content/site-time.js"], runAt: "document_idle", persistAcrossSessions: true }]);
}

// ------------------------------------------------------------------ lines
const LK = { en: "en", bl: "bl", bn: "bn" };
const ALIAS = { moodQ: "moodQuestion", worth: "worthIt" };
const EXTRA_POOLS = {
  stamp: { en: ["binding."], bl: ["pakka."], bn: ["পাক্কা।"] },
  goodChoice: { en: ["good choice."], bl: ["bhalo siddhanto."], bn: ["ভালো সিদ্ধান্ত।"] },
};
export function linesTable(lang) {
  const k = LK[lang] || "en";
  const pools = {}, fixed = {};
  for (const [key, v] of Object.entries(LINES)) pools[key] = v[k];
  for (const [key, v] of Object.entries(EXTRA_POOLS)) pools[key] = v[k];
  for (const [key, v] of Object.entries(FIXED)) fixed[key] = v[k];
  return { pools, fixed };
}
export function line(key, lang) {
  const k = LK[lang] || "en";
  const pool = (LINES[key] || EXTRA_POOLS[key] || {})[k];
  if (pool && pool.length) return pool[Math.floor(Math.random() * pool.length)];
  return fixed(key, lang);
}
export function fixed(key, lang) {
  const k = LK[lang] || "en";
  const f = FIXED[ALIAS[key] || key];
  return f ? f[k] : "";
}
const langName = code => ({ en: "ENGLISH", bl: "BANGLISH", bn: "BANGLA" })[code] || "ENGLISH";
export function moodChoices(lang) {
  const L = new Lines(); L.lang = langName(lang);
  return ["BORED", "TIRED", "AVOIDING", "LONELY"].map(id => ({ id, label: L.moodLabel(id) }));
}
export function moodReply(mood, lang) { const L = new Lines(); L.lang = langName(lang); return L.moodReply(mood); }
export function worthAnswers(lang) {
  return { en: ["Yes", "Meh", "No"], bl: ["Haan", "Meh", "Na"], bn: ["হ্যাঁ", "মোটামুটি", "না"] }[LK[lang] || "en"];
}

// ------------------------------------------------------------------ strict mode
export const strictActive = (t, until, coolOffAt) => StrictPlan.active(t, until || 0, coolOffAt);
export const strictUntil = (choice, d) => StrictPlan.capUntil(StrictPlan.untilFor(choice, d), d.getTime());
export const coolOffLeft = (t, coolOffAt) => StrictPlan.coolOffLeftMs(t, coolOffAt);
/** While strict: no pause, no removing feeds, no raising the limit (data/Strict.kt). */
export function guardPrefs(p, patch, strict) {
  if (!strict) return patch;
  const out = { ...patch };
  if ("paused" in out || "pausedUntil" in out) { delete out.paused; delete out.pausedUntil; }
  if ("dailyLimitMin" in out && out.dailyLimitMin > p.dailyLimitMin) delete out.dailyLimitMin;
  if ("feeds" in out && p.feeds.some(f => !out.feeds.includes(f))) delete out.feeds;
  if ("strictUntil" in out || "strictCoolOffAt" in out) { delete out.strictUntil; delete out.strictCoolOffAt; }
  return out;
}

// ------------------------------------------------------------------ detours
export function pickDetours(p, bedtime, hour) {
  const day = 24 * 3600_000, now = Date.now();
  const recent = Object.entries(p.recentDetours || {}).filter(([, at]) => now - at < day).map(([id]) => id);
  const picked = DetourPicker.pick(p.detourIds || DetourCatalog.DEFAULT_IDS, hour, bedtime, recent, undefined, 3, { feedsLocked: true });
  return picked.filter(Boolean).map(d => ({
    id: d.id, title: d.title, type: d.type, typeLabel: DETOUR_TYPE_LABELS[d.type], opener: d.opener, bribeId: d.bribeId,
    url: (p.detourLinks && p.detourLinks[d.id]) || d.url,
  }));
}

// ------------------------------------------------------------------ bribes
const plain = b => ({ ...b });
export const selectableBribes = () => BribeCatalog.selectable.map(plain);
export const bribeById = id => BribeCatalog.byId(id);
export const noteOk = (words, min) => words >= min;
export const canvasOk = (proof, min, elapsed) => (proof.strokes || 0) >= min && elapsed >= 15_000;

// ------------------------------------------------------------------ morning gift and Kaak Times
export function morningGiftDue(now, p) {
  return Bedtime.morningGift(now, p.bedtimeMinute, p.lastGiftDay || null,
    p.lastFeedUseWall ? new Date(p.lastFeedUseWall) : null, new Date(p.installedAt || Date.now()));
}
export function timesDue(now, p) {
  if (now.getDay() !== 0 || p.lastTimesDay === dayKeyOf(now)) return false;
  return store.allDays(weekDays(dayKeyOf(now))).length >= 2;
}
export function writeTimes(now, p) {
  const keys = weekDays(dayKeyOf(now));
  const thisWeek = store.allDays(keys);
  if (thisWeek.length < 2) return null;
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const lastWeek = store.allDays(weekDays(dayKeyOf(first)));
  const label = "Week ending " + now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return JSON.parse(JSON.stringify(KaakTimes.compose(thisWeek.map(d => DayStats(d)), lastWeek.map(d => DayStats(d)), label)));
}

// ------------------------------------------------------------------ "Report a problem"
export function reportText(data, ua, version, live) {
  const p = data.prefs;
  return [
    `Kaak for the browser ${version}`,
    `Browser: ${ua}`,
    `Feeds: ${p.feeds.join(", ")} · limit ${p.dailyLimitMin} min · chaos ${p.chaos} · jumpscare ${p.jumpscare} · lang ${p.lang}`,
    `Last action: ${live && live.lastAction || "none"}`,
    "",
    "Recent errors:",
    ...(data.crash || []).slice(-15),
    "",
    "Recent events:",
    ...(data.log || []).slice(-40),
  ].join("\n");
}
