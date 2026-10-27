// Runs and verifies the bribe in progress: the browser's tasks/TaskCenter.kt.
// Every check happens in the browser; nothing about it is saved except "done" and the reward.
let ctx = null;
export function bind(c) { ctx = c; }

const task = () => ctx.store.prefs().task || null;
const setTask = v => ctx.store.setPrefs({ task: v });

export function list(t) {
  const { K, store } = ctx;
  const day = K.today(t);
  return {
    bribes: K.selectableBribes(),
    minutesLeft: K.bribeMinutesLeft(day),
    honorLeft: K.honorLeft(day),
    current: state(t).task,
    learningSites: K.LEARNING_SITES,
    granted: store.prefs().learningSites,
  };
}

export async function start(id, t, siteId) {
  const { K, store } = ctx;
  const b = K.bribeById(id);
  if (!b) return { error: "no such bribe" };
  if (b.check === "SITE_TIME") {
    if (!siteId) return { error: "pick a site" };
    const site = K.LEARNING_SITES.find(s => s.id === siteId);
    if (!site) return { error: "unknown site" };
    const ok = await chrome.permissions.contains({ origins: site.matches });
    if (!ok) return { error: "no access", needs: site.matches };
    await K.registerSiteTimer(site);
    if (!store.prefs().learningSites.includes(siteId)) store.setPrefs({ learningSites: [...store.prefs().learningSites, siteId] });
  }
  setTask({ id, check: b.check, target: b.amount, startedAt: t, siteId: siteId || null, awayStart: 0, accMs: 0, lastBeat: 0, noFeedSince: ctx.feedTabs().length ? 0 : t });
  ctx.log({ event: "bribe_start", detail: id });
  return state(t);
}

export function cancel() { setTask(null); return { ok: true }; }

export function state(t) {
  const { K } = ctx;
  const k = task();
  if (!k) return { task: null };
  const b = K.bribeById(k.id);
  const targetMs = (k.target || 0) * 60_000;
  let progress = 0, note = "";
  switch (k.check) {
    case "AWAY": progress = k.awayStart ? Math.min(1, (t - k.awayStart + 15_000) / targetMs) : 0;
      note = k.awayStart ? "Away…" : "Step away: no mouse, no keys. Kaak is counting from when the computer goes idle."; break;
    case "SITE_TIME": progress = Math.min(1, k.accMs / targetMs); note = `${Math.floor(k.accMs / 60_000)} of ${k.target} min`; break;
    case "NO_FEED": case "FOCUS": progress = k.noFeedSince ? Math.min(1, (t - k.noFeedSince) / targetMs) : 0;
      note = k.noFeedSince ? "No feeds. Keep going." : "Close every feed tab to start the clock."; break;
    default: progress = Math.min(1, (t - k.startedAt) / Math.max(1, targetMs));
  }
  return { task: { ...k, title: b && b.title, rewardMin: b && b.rewardMin, loot: b && b.loot, progress, note } };
}

function claim(b, t, honor = false) {
  const { K, store } = ctx;
  const r = K.claimBribe(b, K.today(t), honor);
  if (r.granted) {
    K.updateDay(K.today(t), d => ({ ...d, bribes: d.bribes + 1 }));
    ctx.log({ event: "bribe", detail: `${b.id} +${r.minutes} min${r.loot ? " +" + r.loot : ""}${r.trust ? " trust+" + r.trust : ""}` });
  }
  if (task() && task().id === b.id) setTask(null);
  ctx.persist();
  return r;
}

export function claimById(id) {
  const b = ctx.K.bribeById(id);
  if (b) claim(b, ctx.now());
}

export function claimHonor(id, t) {
  const b = ctx.K.bribeById(id);
  if (!b) return { error: "no such bribe" };
  return claim(b, t, true);
}

/** Bribes done on Kaak's own page report here with what they can show (never the content). */
export function complete(id, proof, t) {
  const { K } = ctx;
  const k = task();
  const b = K.bribeById(id);
  if (!b || !k || k.id !== id) return { error: "not running" };
  const elapsed = t - k.startedAt;
  const ok = (() => {
    switch (b.check) {
      case "BREATHING": case "STRETCH": return elapsed >= b.amount * 60_000 - 3000;
      case "EYE_BREAK": return elapsed >= 20_000 && proof.stillMs >= 20_000;
      case "NOTE": return K.noteOk(proof.words || 0, b.amount);
      case "CANVAS": return K.canvasOk(proof, b.amount, elapsed);
      case "AWAY": case "SITE_TIME": case "NO_FEED": case "FOCUS": return state(t).task.progress >= 1;
      default: return false;
    }
  })();
  if (!ok) return { ok: false };
  return { ok: true, ...claim(b, t) };
}

// ---- checks that run in the background
export function onIdleState(st, t) {
  const k = task();
  if (!k || k.check !== "AWAY") return;
  if (st === "idle" || st === "locked") {
    if (!k.awayStart) setTask({ ...k, awayStart: t - 15_000 }); // idle fires after 15 s without input
  } else if (st === "active" && k.awayStart) {
    if (t - k.awayStart >= k.target * 60_000) claim(ctx.K.bribeById(k.id), t);
    else setTask({ ...k, awayStart: 0 }); // came back too soon: start again
  }
}

export function onFeedActivity() {
  const k = task();
  if (k && (k.check === "NO_FEED" || k.check === "FOCUS") && k.noFeedSince) setTask({ ...k, noFeedSince: 0 });
}

export function siteBeat(siteId, t) {
  const k = task();
  if (!k || k.check !== "SITE_TIME" || k.siteId !== siteId) return;
  const add = k.lastBeat && t - k.lastBeat < 12_000 ? t - k.lastBeat : 0;
  setTask({ ...k, accMs: k.accMs + add, lastBeat: t });
  if (k.accMs + add >= k.target * 60_000) claim(ctx.K.bribeById(k.id), t);
}

export function tick(t) {
  const k = task();
  if (!k) return;
  if (k.check === "NO_FEED" || k.check === "FOCUS") {
    const open = ctx.feedTabs().length > 0;
    if (open && k.noFeedSince) setTask({ ...k, noFeedSince: 0 });
    else if (!open && !k.noFeedSince) setTask({ ...k, noFeedSince: t });
    else if (!open && t - k.noFeedSince >= k.target * 60_000) claim(ctx.K.bribeById(k.id), t);
  }
  // a stale task (the browser was closed mid-bribe) ends after a day
  if (t - k.startedAt > 24 * 3600_000) setTask(null);
}
