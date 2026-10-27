// Kaak's service worker: the browser version of service/KaakAccessibilityService.kt.
// Feed tabs report swipes, typing and focus; the brain (a port of core/KaakBrain.kt) decides;
// this file turns its Actions into performances, cards, locks and log lines.
//
// Desktop rule (decided 2026-10-26): leaving a feed = closing the feed tab or navigating off the
// feed. Switching to another tab or window is "looking away": the clock pauses, nothing else.
import * as store from "./store.js";
import * as locks from "./locks.js";
import * as tasks from "./tasks.js";
import * as K from "./kaak-core.js";

const TICK_MS = 5000;
const ALARM_TICK = "tick";
const startedAt = Date.now();
let devOffset = 0; // tests only: moves Kaak's clock forward
const now = () => Date.now() + devOffset;

// ------------------------------------------------------------------ state
let brain = null;
let live = null; // everything else that must survive a worker restart
/** tabId -> { port, siteId, isFeed, watching, item, lastSwipeAt } */
const tabs = new Map();
let screenLocked = false;
let lastBeatAt = 0;

const LIVE_DEFAULTS = {
  brain: null,
  lookingAway: false,
  lookAwaySince: 0,
  quietReturn: false,
  detoursOnHome: false,
  lastMindlessWritten: -1,
  lastLateWritten: -1,
  returned: null,
  lastSiteId: "instagram",
  pendingJudge: false,
};

const ready = init().catch(e => console.error("Kaak init failed", e));

async function init() {
  await store.load();
  const saved = await store.loadLive();
  live = { ...LIVE_DEFAULTS, ...(saved || {}) };
  brain = live.brain ? K.restoreBrain(live.brain, onSessionEnd) : K.newBrain(onSessionEnd);
  K.restoreReturned(live.returned);
  brain.rules = rules();
  // was Kaak switched off or stopped for a while? (the app logs the same as service_on)
  const p = store.prefs();
  const gapMin = p.lastAliveWall ? Math.floor((Date.now() - p.lastAliveWall) / 60_000) : 0;
  if (!saved || gapMin >= 3) {
    store.logLine({ event: "service_on", detail: gapMin >= 3 ? `after a ${gapMin}-minute gap` : "" });
    if (gapMin >= 3 && strictActive() && p.lastAliveWall < p.strictUntil) {
      // strict mode can't stop a switch-off, but it isn't free either (spec section 6)
      K.addTrust(-1);
      store.logLine({ event: "strict_gap", detail: `${gapMin} min` });
    }
  }
  store.setPrefs({ lastAliveWall: Date.now() });
  chrome.idle.setDetectionInterval(15);
  chrome.alarms.create(ALARM_TICK, { periodInMinutes: 0.5 });
  await reconcileLocks();
  await checkHostAccess();
  setBadge();
  // feed tabs reconnect within a moment after a restart; until then, don't mistake silence for leaving
  setTimeout(() => sync("startup"), 3000);
}

async function persist(durable = false) {
  if (!brain) return;
  live.brain = brain.toJSON();
  live.returned = K.returnedToJSON();
  if (durable) await store.saveLiveDurable(live); else await store.saveLive(live);
  await store.flush();
}

function onSessionEnd(s) {
  store.logLine({ session: { activeMin: +(s.activeMs / 60000).toFixed(1), mindlessMin: +(s.mindlessMs / 60000).toFixed(1), swipes: s.swipes, actions: s.actions, arrived: s.arrived } });
}

// ------------------------------------------------------------------ rules (KaakAccessibilityService.rules())
function pausedNow() {
  const p = store.prefs();
  return p.paused || Date.now() < p.pausedUntil;
}
function strictActive() {
  const p = store.prefs();
  return K.strictActive(now(), p.strictUntil, p.strictCoolOffAt || null);
}
function rules() {
  const p = store.prefs(), w = store.wallet();
  const d = new Date(now());
  const minute = d.getHours() * 60 + d.getMinutes();
  const night = d.getHours() >= 23 || d.getHours() < 5;
  const isoDay = d.getDay() === 0 ? 7 : d.getDay();
  const work = p.workMode && p.workDays.includes(isoDay) && minute >= p.workStartMin && minute < p.workEndMin;
  return K.makeRules({
    chaos: p.chaos,
    dailyLimitMs: p.dailyLimitMin * K.MINUTE_MS,
    bonusMs: K.bonusMinutes(K.today(now())) * K.MINUTE_MS,
    bedtime: K.isBedtime(minute, p.bedtimeMinute),
    jumpscareAllowed: p.jumpscare !== "OFF" && (p.nightJumpscares || !night),
    quiet: Date.now() < w.quietUntil,
    work,
    trustPoints: w.trust,
    arrivalMs: p.arrivalMin * K.MINUTE_MS,
    heckleMs: (p.arrivalMin + Math.max(2, Math.floor(p.arrivalMin / 2))) * K.MINUTE_MS,
    gapMs: p.gagEverySec * 1000,
    nudgeMs: Math.min(60_000, Math.max(20_000, p.gagEverySec * 400)),
  });
}
const hour = () => new Date(now()).getHours();

// ------------------------------------------------------------------ feed presence
function feedTabs() { return [...tabs.entries()].filter(([, t]) => t.isFeed); }
function watchingTab() {
  if (screenLocked) return null;
  const w = feedTabs().find(([, t]) => t.watching);
  return w ? w[0] : null;
}

/** Bring the brain in line with which feed tabs exist and whether one is being looked at. */
function sync(why) {
  if (!brain) return;
  const t = now();
  const anyFeed = feedTabs().length > 0 && !pausedNow();
  // right after a worker restart the tabs haven't said hello yet
  if (!anyFeed && brain.inFeed && Date.now() - startedAt < 3000) return;
  brain.rules = rules();
  if (anyFeed && !brain.inFeed) {
    const tabId = watchingTab() ?? feedTabs()[0][0];
    enteredFeed(t);
    live.lookingAway = false;
    const action = brain.onForeground(true, t, hour());
    store.setPrefs({ lastFeedUseWall: Date.now() });
    act(action, tabId);
    maybeAskWorth(tabId, action);
  } else if (!anyFeed && brain.inFeed) {
    leftFeed(t);
    brain.onForeground(false, t, hour());
    const label = brain.takeLabel();
    if (label) store.setPrefs({ pendingWorth: { at: Date.now(), label } });
    live.lookingAway = false;
  }
  if (brain.inFeed) {
    const watching = watchingTab() != null;
    if (!watching && !live.lookingAway) {
      brain.lookAway(t); live.lookingAway = true; live.lookAwaySince = t;
    } else if (watching && live.lookingAway) {
      // back after 30+ min away: the session ended, and Kaak leaves (Hide)
      const a = brain.lookBack(t); live.lookingAway = false;
      if (a && a.type !== "None") act(a, watchingTab());
    }
  }
  persist();
}

// ------------------------------------------------------------------ ports from feed tabs
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "feed") return;
  const tabId = port.sender && port.sender.tab && port.sender.tab.id;
  if (tabId == null) return;
  port.onMessage.addListener(msg => ready.then(() => safely("port", () => onFeedMessage(tabId, port, msg))));
  port.onDisconnect.addListener(() => ready.then(() => safely("disconnect", () => {
    const t = tabs.get(tabId);
    if (t && t.port === port) { tabs.delete(tabId); sync("closed"); }
  })));
});

function onFeedMessage(tabId, port, msg) {
  const t = now();
  switch (msg.t) {
    case "hello": {
      const c = K.classifyUrl(msg.url, enabledFeeds());
      tabs.set(tabId, { port, siteId: c.siteId, isFeed: c.isFeed, watching: !!msg.watching, item: c.item, lastSwipeAt: 0 });
      if (c.siteId) live.lastSiteId = c.siteId;
      port.postMessage({ t: "setup", lines: K.linesTable(langCode()), lang: langCode(), settings: { reduceMotion: store.prefs().reduceMotion }, font: fontB64 });
      fontReady.then(b64 => { if (b64 && !fontSentTo.has(port)) { fontSentTo.add(port); try { port.postMessage({ t: "setup", lines: K.linesTable(langCode()), lang: langCode(), settings: { reduceMotion: store.prefs().reduceMotion }, font: b64 }); } catch (e) {} } });
      sync("hello");
      // after an escape, the first thing Kaak does is judge you (app: grantEscape)
      if (live.pendingJudge && c.isFeed) {
        live.pendingJudge = false;
        setTimeout(() => sendAct(tabId, { type: "Say" }, { text: K.line("escaped", langCode()), ms: 3000 }), 1800);
      }
      if (c.isFeed && brain.inFeed && K.arrived(brain)) sendAct(tabId, { type: "Resume" }, {});
      break;
    }
    case "nav": {
      const cur = tabs.get(tabId);
      if (!cur) return;
      const c = K.classifyUrl(msg.url, enabledFeeds());
      const wasFeed = cur.isFeed;
      cur.siteId = c.siteId; cur.isFeed = c.isFeed;
      // a new Short/Reel/TikTok is a swipe, unless it came with a swipe already counted
      if (c.isFeed && c.item && c.item !== cur.item && msg.sinceInput > 1000 && t - cur.lastSwipeAt > 1000) {
        cur.lastSwipeAt = t;
        brain.onScroll(t);
      }
      cur.item = c.item;
      if (wasFeed !== c.isFeed) { if (!c.isFeed) port.postMessage({ t: "hideAll" }); sync("nav"); }
      break;
    }
    case "swipe": {
      const cur = tabs.get(tabId);
      if (!cur || !cur.isFeed) return;
      cur.lastSwipeAt = t;
      brain.onScroll(t);
      tasks.onFeedActivity();
      break;
    }
    case "type": {
      const cur = tabs.get(tabId);
      if (cur && cur.isFeed) brain.onTyping(t);
      break;
    }
    case "focus": {
      const cur = tabs.get(tabId);
      if (!cur) return;
      cur.watching = !!msg.watching;
      sync("focus");
      break;
    }
    case "beat": {
      const cur = tabs.get(tabId);
      if (cur) cur.watching = true;
      if (Date.now() - lastBeatAt >= TICK_MS - 500) { lastBeatAt = Date.now(); tick(); }
      break;
    }
    case "eaten": afterEaten(tabId); break;
    case "stolen": afterStolen(tabId); break;
    case "snatched": goTo(tabId, "task/focus15"); break;
    case "card": onCard(tabId, msg.id, msg.answer); break;
  }
}

function enabledFeeds() {
  return pausedNow() ? [] : store.prefs().feeds;
}
function langCode() {
  return { ENGLISH: "en", BANGLISH: "bl", BANGLA: "bn" }[store.prefs().lang] || "en";
}

// the content script can't read extension files without exposing them to the site (spec 7.3)
let fontB64 = null;
const fontSentTo = new WeakSet();
const fontReady = (async () => {
  try {
    const buf = await (await fetch(chrome.runtime.getURL("assets/fonts/Nunito.ttf"))).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    fontB64 = btoa(s);
    return fontB64;
  } catch (e) { return null; }
})();

// ------------------------------------------------------------------ tick
async function tick() {
  if (!brain) return;
  safely("tick", () => {
    const t = now();
    store.setPrefs({ lastAliveWall: Date.now() });
    rollTrust();
    credit(K.returnedFlush(t));
    brain.rules = rules();
    if (pausedNow() && brain.inFeed) { brain.onForeground(false, t, hour()); broadcast({ t: "hideAll" }); }
    const snap = brain.tick(t, hour(), K.today(t));
    if (snap.inFeed && !live.lookingAway) {
      store.setPrefs({ lastFeedUseWall: Date.now() });
      const mindless = Math.floor(snap.dailyMs / K.MINUTE_MS);
      if (mindless !== live.lastMindlessWritten) {
        live.lastMindlessWritten = mindless;
        K.updateDay(K.today(t), d => ({ ...d, mindlessMin: mindless }));
      }
      const dt = new Date(t);
      const late = K.lateMinuteOf(dt.getHours() * 60 + dt.getMinutes());
      if (late >= 0 && late !== live.lastLateWritten) {
        live.lastLateWritten = late;
        K.updateDay(K.today(t), d => ({ ...d, lateMinute: Math.max(d.lateMinute, late) }));
      }
    }
    act(snap.action, watchingTab() ?? (feedTabs()[0] || [null])[0]);
    tasks.tick(t);
  });
  await reconcileLocks();
  setBadge();
  await persist();
}

chrome.alarms.onAlarm.addListener(a => ready.then(async () => {
  if (a.name === ALARM_TICK) {
    // the 5 s heartbeat drives the brain while a feed is watched; this keeps locks and days honest otherwise
    if (Date.now() - lastBeatAt > 20_000) await tick(); else await reconcileLocks();
    checkMorningAndTimes();
  } else if (a.name.startsWith("lock:")) {
    await reconcileLocks();
  }
}));

chrome.runtime.onStartup.addListener(() => ready.then(async () => { await reconcileLocks(); checkMorningAndTimes(); }));
chrome.runtime.onInstalled.addListener(d => ready.then(async () => {
  await reconcileLocks();
  if (d.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("pages/kaak.html#welcome") });
}));

// ------------------------------------------------------------------ idle: locked screen = screen off
chrome.idle.onStateChanged.addListener(state => ready.then(() => safely("idle", () => {
  tasks.onIdleState(state, now());
  if (state === "locked") {
    screenLocked = true;
    broadcast({ t: "hideAll" });
    if (brain.inFeed) live.quietReturn = true;
    sync("locked");
  } else if (state === "active") {
    if (screenLocked) {
      screenLocked = false;
      sync("unlocked");
      const tabId = watchingTab();
      if (tabId != null && brain.inFeed && K.arrived(brain)) sendAct(tabId, { type: "Resume" }, {});
    }
    checkMorningAndTimes();
  }
})));

// ------------------------------------------------------------------ acting (KaakAccessibilityService.act)
function act(incoming, tabId) {
  if (!incoming || incoming.type === "None") return;
  let action = incoming;
  if (live.quietReturn && action.type === "Return") action = { type: "Resume" };
  live.quietReturn = false;
  const t = now();
  if (action.type === "Steal" || action.type === "Eat") K.returnedOnKaakAction(t, true);
  else if (["Arrive", "Return", "Jumpscare", "Heckle", "Warn"].includes(action.type)) K.returnedOnKaakAction(t, false);
  if (["Steal", "Bounce", "Eat", "Asleep"].includes(action.type)) {
    K.updateDay(K.today(t), d => ({ ...d, foiled: d.foiled + 1, eaten: d.eaten + (action.type === "Eat" ? 1 : 0) }));
  }
  const r = brain.rules;
  const o = { bedtime: r.bedtime, work: r.work, calm: !K.trustSteals(r), level: store.prefs().jumpscare, tile: tileFor(tabId), minutes: Math.floor(brain.dailyMs / K.MINUTE_MS) };
  switch (action.type) {
    case "Steal": sendAct(tabId, action, o); break;
    case "Bounce": goTo(tabId, `theft?site=${siteOf(tabId)}`); break;
    case "Eat": sendAct(tabId, action, o); break;
    case "Asleep": goTo(tabId, `nap?site=${siteOf(tabId)}`); break;
    case "Wake": break;
    case "Hide": broadcast({ t: "hideAll" }); break;
    case "Jumpscare": {
      const level = o.level === "OFF" ? "MEDIUM" : o.level;
      sendAct(tabId, action, { ...o, level });
      setTimeout(() => { if (brain.inFeed) offerTooMuch(tabId); }, 3200);
      break;
    }
    default: {
      sendAct(tabId, action, o);
      if (action.type === "Arrive" && !r.bedtime && !r.work) {
        if (!seen("arrive")) firstTime(tabId, "arrive", 4500, "That's Kaak.",
          "He shows up when you scroll without thinking. Close the feed and he leaves too. Stay, and he gets worse.");
        else maybeAskMood(tabId);
      }
    }
  }
  if (action.type !== "Hide" && action.type !== "Wake") {
    const name = describe(action);
    live.lastAction = `${name} at ${new Date().toTimeString().slice(0, 5)}`;
    store.logLine({ action: name, site: siteOf(tabId), activeMin: +(brain.activeMs / 60000).toFixed(1), mindlessMin: +(brain.mindlessMs / 60000).toFixed(1) });
  }
}

function describe(a) {
  if (a.type === "Heckle") return "HECKLE_" + a.gag;
  return a.type.toUpperCase();
}

function sendAct(tabId, action, opts) {
  const t = tabs.get(tabId);
  if (!t) return;
  try { t.port.postMessage({ t: "act", action, opts }); } catch (e) {}
}
function broadcast(msg) {
  for (const [, t] of tabs) { try { t.port.postMessage(msg); } catch (e) {} }
}
function siteOf(tabId) {
  const t = tabs.get(tabId);
  return (t && t.siteId) || live.lastSiteId || "instagram";
}
function tileFor(tabId) {
  return K.tileFor(siteOf(tabId));
}

/** Send a tab to one of Kaak's pages (allowed without the "tabs" permission). */
function goTo(tabId, route) {
  if (tabId == null) return;
  // Kaak's own screens are not a real exit (app: enteredOwnApp -> forgiveNextReturn)
  brain.forgiveNextReturn(now());
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL("pages/kaak.html#" + route) }).catch(() => {});
}

async function afterStolen(tabId) {
  const site = siteOf(tabId);
  await reconcileLocks();
  goTo(tabId, `theft?site=${site}`);
  // every other open feed tab goes too: Kaak has all of them
  for (const [id, t] of feedTabs()) if (id !== tabId) goTo(id, `theft?site=${t.siteId}`);
}

async function afterEaten(tabId) {
  const site = siteOf(tabId);
  live.detoursOnHome = seen("eat");
  await reconcileLocks();
  goTo(tabId, `eaten?site=${site}`);
  for (const [id, t] of feedTabs()) if (id !== tabId) goTo(id, `nap?site=${t.siteId}`);
  await persist(true);
}

// ------------------------------------------------------------------ locks
async function reconcileLocks() {
  if (!brain) return;
  const t = now();
  const feeds = store.prefs().feeds;
  const nap = brain.eatenUntil && t < brain.eatenUntil && !(brain.escapeUntil && t < brain.escapeUntil);
  const stolen = brain.stolenUntil && t < brain.stolenUntil;
  try {
    await locks.reconcile({
      nap: nap ? { until: brain.eatenUntil, siteIds: feeds } : null,
      theft: stolen && !nap ? { until: brain.stolenUntil, siteIds: feeds } : null,
    });
  } catch (e) { store.crash("locks", e); }
  // wake up exactly when something ends, so a rule never outlives its lock
  for (const [name, at] of [["lock:nap", nap ? brain.eatenUntil : 0], ["lock:pass", brain.escapeUntil || 0], ["lock:theft", stolen && brain.stolenUntil < K.FOREVER ? brain.stolenUntil : 0]]) {
    if (at > t) chrome.alarms.create(name, { when: Date.now() + (at - t) + 500 });
    else chrome.alarms.clear(name);
  }
  // the escape pass ran out while not on a feed: nothing else to do, the rules above are back
}

// ------------------------------------------------------------------ cards on the feed
const cardActions = new Map(); // card id -> handler(answer)
function showCard(tabId, card, handler) {
  const t = tabs.get(tabId);
  if (!t) return;
  if (handler) cardActions.set(card.id, handler);
  try { t.port.postMessage({ t: "card", card }); } catch (e) {}
}
function onCard(tabId, id, answer) {
  const h = cardActions.get(id);
  cardActions.delete(id);
  if (h) safely("card", () => h(answer, tabId));
}

function seen(tip) { return !!store.prefs().seen[tip]; }
function markSeen(tip) { store.setPrefs({ seen: { ...store.prefs().seen, [tip]: true } }); }
function firstTime(tabId, tip, delayMs, title, body) {
  if (seen(tip)) return;
  markSeen(tip);
  setTimeout(() => showCard(tabId, { id: "tip:" + tip, title, body, buttons: [{ id: "ok", label: "Got it", main: true }], autoDismissMs: 12_000 }), delayMs);
}

function offerTooMuch(tabId) {
  const L = langCode();
  showCard(tabId, {
    id: "toomuch", title: K.line("tooMuch", L) || "Too much?",
    buttons: [{ id: "yes", label: "Yes, tone it down", main: true }, { id: "no", label: "I'm fine" }], autoDismissMs: 6000,
  }, answer => {
    if (answer !== "yes") return;
    const p = store.prefs();
    store.setPrefs({ jumpscare: "OFF", chaos: K.gentlerChaos(p.chaos) });
    store.logLine({ event: "too_much" });
  });
}

function maybeAskMood(tabId) {
  const p = store.prefs();
  const d = K.dayStats(K.today(now()));
  if (!p.moodChecks || d.moodChecks >= 3 || Math.random() >= 0.5) return;
  setTimeout(() => {
    if (!brain.inFeed || brain.blocked) return;
    K.updateDay(K.today(now()), x => ({ ...x, moodChecks: x.moodChecks + 1 }));
    const L = langCode();
    const m = K.moodChoices(L);
    showCard(tabId, { id: "mood", title: K.fixed("moodQ", L) || "Why are you scrolling?", rows: [m.slice(0, 2), m.slice(2, 4)], autoDismissMs: 8000 },
      answer => answer && onMood(tabId, answer));
  }, 5000);
}

function onMood(tabId, mood) {
  store.logLine({ event: "mood", detail: mood });
  const L = langCode();
  const reply = K.moodReply(mood, L);
  const tile = tileFor(tabId);
  switch (mood) {
    case "TIRED": sendAct(tabId, { type: "Tired" }, { text: reply }); break;
    case "AVOIDING": sendAct(tabId, { type: "Snatch" }, { text: reply, tile }); break;
    case "LONELY":
      sendAct(tabId, { type: "Say" }, { text: reply, ms: 3200 });
      setTimeout(() => goTo(tabId, "detours?lonely=1"), 2200);
      break;
    case "BORED":
      sendAct(tabId, { type: "Say" }, { text: reply, ms: 2600 });
      setTimeout(() => goTo(tabId, "task/stretch1"), 2000);
      break;
  }
}

/** Desktop: "Was that worth it?" comes at the start of the next feed visit, within 2 hours. */
function maybeAskWorth(tabId, action) {
  const pw = store.prefs().pendingWorth;
  if (!pw) return;
  store.setPrefs({ pendingWorth: null });
  if (Date.now() - pw.at > 2 * 3600_000) return;
  if (["Steal", "Bounce", "Asleep", "Eat"].includes(action.type)) return;
  const L = langCode();
  const ans = K.worthAnswers(L);
  setTimeout(() => showCard(tabId, {
    id: "worth", title: K.fixed("worth", L) || "Was that worth it?", body: "Your last visit, " + Math.round(pw.label.visitMs / 60000) + " min.",
    buttons: ans.map((a, i) => ({ id: ["yes", "meh", "no"][i], label: a, main: i === 0 })), autoDismissMs: 10_000,
  }, answer => {
    if (!answer) return;
    store.logLine({ label: answer, context: pw.label });
    store.setPrefs({ labelsGiven: store.prefs().labelsGiven + 1 });
    K.updateDay(K.today(now()), d => ({ ...d, worthYes: d.worthYes + (answer === "yes" ? 1 : 0), worthNo: d.worthNo + (answer === "no" ? 1 : 0) }));
  }), 1500);
}

// ------------------------------------------------------------------ trust, time returned, gift, Times
function enteredFeed(t) {
  credit(K.returnedOnEnterFeed(t));
  K.updateDay(K.today(t), d => ({ ...d, feedOpens: d.feedOpens + 1 }));
}
function leftFeed(t) {
  K.returnedOnLeaveFeed(t);
  const session = Math.floor(brain.activeMs / K.MINUTE_MS);
  K.updateDay(K.today(t), d => ({ ...d, longestSessionMin: Math.max(d.longestSessionMin, session) }));
}
function credit(ms) {
  const min = Math.floor((ms || 0) / K.MINUTE_MS);
  if (min <= 0) return;
  const loot = K.addReturned(min);
  K.updateDay(K.today(now()), d => ({ ...d, returnedMin: d.returnedMin + min }));
  store.logLine({ event: "returned", detail: `${min} min${loot.length ? " +" + loot.join(",") : ""}` });
}
function rollTrust() {
  const t = K.today(now());
  const p = store.prefs();
  if (p.lastTrustDay === t) return;
  if (p.lastTrustDay && store.day(p.lastTrustDay)) {
    const delta = K.trustDayDelta(store.day(p.lastTrustDay), p.dailyLimitMin);
    if (delta) K.addTrust(delta);
    store.logLine({ event: "trust", detail: String(delta) });
  }
  store.setPrefs({ lastTrustDay: t });
}

function checkMorningAndTimes() {
  safely("gift", () => {
    const p = store.prefs();
    if (!p.onboarded || pausedNow()) return;
    if (K.morningGiftDue(new Date(now()), p)) {
      store.setPrefs({ lastGiftDay: K.today(now()), badge: "gift" });
      tasks.claimById("bedtime");
      store.logLine({ event: "morning_gift" });
    } else if (K.timesDue(new Date(now()), p)) {
      store.setPrefs({ lastTimesDay: K.today(now()), badge: "times" });
      store.logLine({ event: "kaak_times" });
    }
    setBadge();
  });
}

function setBadge() {
  const b = store.prefs().badge;
  chrome.action.setBadgeBackgroundColor({ color: "#EF4B3F" });
  chrome.action.setBadgeText({ text: b === "gift" ? "🎁" : b === "times" ? "NEW" : "" });
}

// ------------------------------------------------------------------ site access can be withdrawn without a gap
async function checkHostAccess() {
  const ok = await chrome.permissions.contains({ origins: K.coreOrigins() });
  if (!ok) {
    store.logLine({ event: "site_access_removed" });
    if (strictActive()) K.addTrust(-1);
  }
}
chrome.permissions.onRemoved.addListener(() => ready.then(() => checkHostAccess()));

// ------------------------------------------------------------------ messages from Kaak's pages and popup
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  ready.then(async () => {
    let out = null;
    try { out = await onPageMessage(msg, sender); } catch (e) { store.crash("page:" + msg.t, e); out = { error: String(e) }; }
    await persist();
    reply(out);
  });
  return true;
});

async function onPageMessage(msg, sender) {
  const t = now();
  const p = store.prefs();
  switch (msg.t) {
    case "status": return status();
    case "prefs": return { prefs: p, wallet: store.wallet(), strict: strictActive() };
    case "setPrefs": {
      const patch = K.guardPrefs(p, msg.patch || {}, strictActive());
      store.setPrefs(patch);
      if (patch.lang) for (const [, tb] of tabs) { try { tb.port.postMessage({ t: "lines", lines: K.linesTable(langCode()), lang: langCode() }); } catch (e) {} }
      if (patch.feeds) { await K.registerOptionalFeeds(patch.feeds); sync("feeds"); }
      brain.rules = rules();
      await reconcileLocks();
      return { prefs: store.prefs(), refused: Object.keys(msg.patch || {}).filter(k => !(k in patch)) };
    }
    case "pause": {
      if (msg.how === "off") { store.setPrefs({ paused: false, pausedUntil: 0 }); sync("resume"); return status(); }
      if (strictActive()) return { refused: "strict" };
      const until = msg.how === "tomorrow" ? K.tomorrowMorning(new Date()) : Date.now() + Number(msg.how) * 60_000;
      store.setPrefs({ pausedUntil: until });
      broadcast({ t: "hideAll" });
      sync("pause");
      store.logLine({ event: "pause", detail: msg.how });
      return status();
    }
    case "lockInfo": {
      const nap = brain.eatenUntil && t < brain.eatenUntil;
      const passing = brain.escapeUntil && t < brain.escapeUntil;
      const stolen = brain.stolenUntil && t < brain.stolenUntil;
      return {
        nap: nap && !passing ? { minutesLeft: Math.max(1, Math.ceil((brain.eatenUntil - t) / 60_000)), until: brain.eatenUntil - t + Date.now() } : null,
        theft: stolen ? { forever: brain.stolenUntil >= K.FOREVER, until: brain.stolenUntil - t + Date.now() } : null,
        escapesToday: K.dayStats(K.today(t)).escapes,
        firstEat: !seen("eat"), firstTheft: !seen("theft"),
      };
    }
    case "seen": markSeen(msg.tip); return {};
    case "clearStaleLocks": await reconcileLocks(); return {};
    case "escape": {
      brain.escape(t);
      brain.forgiveNextReturn(t);
      store.logLine({ event: "escape", detail: msg.site || "" });
      K.updateDay(K.today(t), d => ({ ...d, escapes: d.escapes + 1 }));
      live.pendingJudge = true;
      await reconcileLocks();
      return { ok: true, home: K.homeUrl(msg.site) };
    }
    case "chase": {
      if (msg.result === "won") {
        brain.chaseWon(t);
        brain.forgiveNextReturn(t);
        store.logLine({ event: "chase", detail: "won" });
        K.updateDay(K.today(t), d => ({ ...d, chasesWon: d.chasesWon + 1 }));
      } else {
        brain.chaseLost(t);
        store.logLine({ event: "chase", detail: "lost" });
      }
      await reconcileLocks();
      return { ok: true, home: K.homeUrl(msg.site) };
    }
    case "detours": {
      const picked = K.pickDetours(p, rules().bedtime, hour());
      const recent = { ...p.recentDetours };
      for (const d of picked) recent[d.id] = Date.now();
      store.setPrefs({ recentDetours: recent });
      return { detours: picked };
    }
    case "detourUsed": store.logLine({ event: "detour", detail: msg.id }); return {};
    case "bribes": return tasks.list(t);
    case "startTask": return tasks.start(msg.id, t, msg.siteId);
    case "taskState": return tasks.state(t);
    case "taskDone": return tasks.complete(msg.id, msg.proof || {}, t);
    case "taskCancel": return tasks.cancel();
    case "siteBeat": {
      const site = K.LEARNING_SITES.find(s => s.matches.some(m => hostOk(msg.host, m)));
      if (site) tasks.siteBeat(site.id, t);
      return {};
    }
    case "trustMe": return tasks.claimHonor(msg.id, t);
    case "home": return home();
    case "nest": return { loot: store.wallet().loot, returnedMin: store.wallet().returnedMin, trust: store.wallet().trust };
    case "times": {
      if (p.badge === "times") { store.setPrefs({ badge: null }); setBadge(); }
      return { paper: K.writeTimes(new Date(now()), p, langCode()) };
    }
    case "gift": {
      if (p.badge === "gift") { store.setPrefs({ badge: null }); setBadge(); }
      return { lang: langCode() };
    }
    case "stats": return { log: store.data().log, crash: store.data().crash, days: store.data().days };
    case "report": return { text: K.reportText(store.data(), navigator.userAgent, chrome.runtime.getManifest().version, live) };
    case "strict": {
      if (msg.action === "start") {
        const until = K.strictUntil(msg.choice, new Date(now()));
        store.setPrefs({ strictUntil: until, strictCoolOffAt: 0 });
        store.logLine({ event: "strict_on", detail: msg.choice });
      } else if (msg.action === "ask") {
        store.setPrefs({ strictCoolOffAt: t });
        store.logLine({ event: "strict_leave_asked" });
      }
      return { strict: strictActive(), coolOffLeftMs: K.coolOffLeft(t, p.strictCoolOffAt || null), until: store.prefs().strictUntil };
    }
    case "onboarded": store.setPrefs({ onboarded: true, ...(msg.patch || {}) }); await K.registerOptionalFeeds(store.prefs().feeds); return {};
    case "lines": return { lines: K.linesTable(langCode()), lang: langCode() };
    case "debug": return debugState();
    case "dev": return dev(msg);
    default: return { error: "unknown " + msg.t };
  }
}

function status() {
  const p = store.prefs(), t = now();
  const dailyMin = Math.floor(brain.dailyMs / K.MINUTE_MS);
  const limitMin = p.dailyLimitMin + K.bonusMinutes(K.today(t));
  const napping = !!(brain.eatenUntil && t < brain.eatenUntil);
  const pausedN = pausedNow();
  let statusText = "Watching your feeds.";
  if (pausedN) statusText = p.paused ? "Paused." : `Paused until ${new Date(p.pausedUntil).toTimeString().slice(0, 5)}.`;
  else if (napping) statusText = `Napping. Feeds open in ${Math.ceil((brain.eatenUntil - t) / 60000)} min.`;
  else if (brain.stolenUntil && t < brain.stolenUntil) statusText = "He has your feeds.";
  else if (rules().work) statusText = "Work mode: glasses on.";
  else if (rules().bedtime) statusText = "Bedtime. He's sleepy.";
  return {
    dailyMin, limitMin, trustLabel: K.trustLabel(store.wallet().trust), statusText,
    pausedNow: pausedN, napping, strict: strictActive(), badge: p.badge, onboarded: p.onboarded,
    version: chrome.runtime.getManifest().version,
  };
}

function home() {
  const t = now(), p = store.prefs(), w = store.wallet();
  return {
    status: status(),
    today: K.dayStats(K.today(t)),
    week: K.weekDays(K.today(t)).map(k => store.day(k) || K.blankDay(k)),
    wallet: w, trust: { points: w.trust, label: K.trustLabel(w.trust), next: K.trustNext(w.trust) },
    bribeMinutesLeft: K.bribeMinutesLeft(K.today(t)), honorLeft: K.honorLeft(K.today(t)),
    prefs: p, lastAction: live.lastAction || "none yet",
  };
}

function debugState() {
  const t = now();
  const snap = brain.toJSON();
  return {
    tabs: [...tabs.entries()].map(([id, x]) => ({ id, siteId: x.siteId, isFeed: x.isFeed, watching: x.watching })),
    inFeed: brain.inFeed, lookingAway: live.lookingAway, blocked: brain.blocked,
    activeMin: +(brain.activeMs / 60000).toFixed(2), mindlessMin: +(brain.mindlessMs / 60000).toFixed(2), dailyMin: +(brain.dailyMs / 60000).toFixed(2),
    detection: K.lastDetection(brain), stats: K.lastStats(brain, t),
    eatenUntil: brain.eatenUntil, stolenUntil: brain.stolenUntil, escapeUntil: brain.escapeUntil,
    lastAction: live.lastAction || "none yet", rules: brain.rules, snapshotKeys: Object.keys(snap),
  };
}

/** Test hooks (used by test/e2e). Harmless in normal use: they only move Kaak's own clock or settings. */
function dev(msg) {
  if (msg.advanceMs) devOffset += msg.advanceMs;
  if (msg.prefs) store.setPrefs(msg.prefs);
  if (msg.tick) tick();
  if (msg.act) {
    const tabId = watchingTab() ?? (feedTabs()[0] || [null])[0];
    const r = brain.rules;
    sendAct(tabId, msg.act, { bedtime: r.bedtime, work: r.work, calm: !K.trustSteals(r), level: "MEDIUM", tile: tileFor(tabId), minutes: Math.floor(brain.dailyMs / K.MINUTE_MS), ...(msg.opts || {}) });
  }
  return { now: now(), devOffset };
}

function hostOk(host, pattern) {
  const h = pattern.replace(/^\*:\/\//, "").replace(/\/\*$/, "");
  if (h.startsWith("*.")) { const d = h.slice(2); return host === d || host.endsWith("." + d); }
  return host === h;
}

function safely(where, fn) {
  try { return fn(); } catch (e) { console.error(where, e); store.crash(where, e); }
}

tasks.bind({ now, store, K, tabs: () => tabs, feedTabs, persist, log: store.logLine, notify: () => setBadge() });

// Test hook for test/e2e (CDP evaluates in the worker). Same handler the pages use.
globalThis.__kaak = {
  ask: msg => ready.then(() => onPageMessage(msg, { id: chrome.runtime.id })).then(async r => { await persist(); return r; }),
};
