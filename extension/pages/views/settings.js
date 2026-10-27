// Settings (simple by default; "More settings" holds the rest), strict mode, previews, live detector.
import { ask, el } from "../common.js";
import { header } from "./home.js";
import { SITES } from "../../core/sites.js";
import { DetourCatalog } from "../../core/detours.js";
import { StrictPlan } from "../../core/commitment.js";

const CHAOS = [["PIGEON", "Pigeon (gentle)", 15, 180], ["KAAK", "Kaak (default)", 10, 90], ["MONKEY", "Monkey (harsh)", 6, 45]];
const JUMP = [["OFF", "Off"], ["GENTLE", "Gentle"], ["MEDIUM", "Medium"], ["FULL", "Full"]];
const LANGS = [["ENGLISH", "English"], ["BANGLISH", "Banglish"], ["BANGLA", "বাংলা"]];
const DAYS = [[7, "Sun"], [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"]];

function pills(options, current, onPick, multi = false) {
  const box = el("div", { class: "pills", role: multi ? "group" : "radiogroup" });
  for (const [value, label] of options) {
    const on = multi ? current.includes(value) : current === value;
    box.append(el("button", { class: "pill", type: "button", "aria-pressed": on ? "true" : "false", onclick: () => onPick(value) }, label));
  }
  return box;
}
function toggle(checked, onChange, label) {
  const input = el("input", { type: "checkbox", role: "switch", "aria-label": label });
  input.checked = !!checked;
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { class: "switch" }, input, el("span"));
}
function item(label, hint, control) {
  return el("div", { class: "item" }, el("div", { class: "grow" }, el("div", { class: "label", text: label }), hint ? el("div", { class: "hint", text: hint }) : null), control);
}
function slider(min, max, step, value, fmt, onChange, label) {
  const out = el("span", { class: "tag grey", text: fmt(value) });
  const input = el("input", { type: "range", min, max, step, value, "aria-label": label });
  input.addEventListener("input", () => { out.textContent = fmt(+input.value); });
  input.addEventListener("change", () => onChange(+input.value));
  return el("div", { style: "width:100%" }, el("div", { class: "spread" }, el("span", { class: "label", text: label }), out), input);
}
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

export async function settings(ctx, _arg, params) {
  const r = await ask({ t: "prefs" });
  const p = r.prefs, strict = r.strict;
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(header(ctx, "Settings", strict ? "Strict mode is on: some settings are locked." : "Kaak's knobs."));
  const note = el("p", { class: "muted" });
  const set = async patch => {
    const res = await ask({ t: "setPrefs", patch });
    if (res.refused && res.refused.length) note.textContent = "Strict mode is on: that one is locked until it ends.";
    rerender();
  };
  const rerender = () => settings(ctx, _arg, params).then(() => wrap.remove());

  // ---- how mean
  wrap.append(el("h2", { text: "How mean" }), el("div", { class: "card" },
    pills(CHAOS.map(([v, l]) => [v, l]), p.chaos, v => { const c = CHAOS.find(x => x[0] === v); set({ chaos: v, arrivalMin: c[2], gagEverySec: c[3] }); }),
    el("div", { style: "height:14px" }),
    slider(1, 30, 1, p.arrivalMin, v => `${v} min`, v => set({ arrivalMin: v }), "Shows up after"),
    el("div", { style: "height:10px" }),
    slider(30, 300, 15, p.gagEverySec, v => v < 60 ? `${v} s` : `${(v / 60).toFixed(v % 60 ? 1 : 0)} min`, v => set({ gagEverySec: v }), "Acts up every"),
    el("div", { style: "height:10px" }),
    slider(5, 180, 5, p.dailyLimitMin, v => `${v} min`, v => set({ dailyLimitMin: v }), "Daily limit (then he eats the feed)"),
    note));

  // ---- jumpscare and language
  wrap.append(el("div", { class: "card" },
    el("h3", { text: "Jumpscare" }), el("p", { class: "muted", text: "Once per session, at random, after about 20 minutes. One smooth dim, never a flicker." }),
    pills(JUMP, p.jumpscare, v => set({ jumpscare: v })),
    el("div", { style: "height:14px" }),
    el("h3", { text: "Language" }), pills(LANGS, p.lang, v => set({ lang: v }).then(() => location.reload()))));

  // ---- feeds
  const feeds = el("div", { class: "list" });
  for (const s of SITES) {
    feeds.append(item(s.name, s.optional ? "Optional. The browser will ask to allow this one site." : null,
      toggle(p.feeds.includes(s.id), async on => {
        if (on && s.optional) {
          const ok = await chrome.permissions.request({ origins: [...s.matches] });
          if (!ok) return rerender();
        }
        set({ feeds: on ? [...new Set([...p.feeds, s.id])] : p.feeds.filter(x => x !== s.id) });
      }, s.name)));
  }
  wrap.append(el("h2", { text: "Feeds" }), feeds);

  // ---- more settings
  const more = el("details", { open: params.get("more") ? true : null }, el("summary", { class: "btn", style: "margin-bottom:12px" }, "More settings"));
  wrap.append(more);
  const list = el("div", { class: "list" });
  const bed = el("input", { type: "time", value: hhmm(p.bedtimeMinute), style: "width:auto" });
  bed.addEventListener("change", () => set({ bedtimeMinute: fromHHMM(bed.value) }));
  list.append(
    item("Bedtime", "After this, Kaak arrives sooner, yawns, and pulls a blanket over the feed.", bed),
    item("Jumpscares at night", "Off by default between 11 p.m. and 5 a.m.", toggle(p.nightJumpscares, v => set({ nightJumpscares: v }), "Jumpscares at night")),
    item("Mood check", "\"Why are you scrolling?\" after about half of arrivals, at most 3 a day.", toggle(p.moodChecks, v => set({ moodChecks: v }), "Mood check")),
    item("Remove animations", "Kaak appears in place instead of flying; no white flash.", toggle(p.reduceMotion, v => set({ reduceMotion: v }), "Remove animations")),
    item("Work mode", "Stricter test, no theft, no jumpscares, gags half as often, tiny glasses.", toggle(p.workMode, v => set({ workMode: v }), "Work mode")));
  more.append(list);
  if (p.workMode) {
    const ws = el("input", { type: "time", value: hhmm(p.workStartMin), style: "width:auto" });
    const we = el("input", { type: "time", value: hhmm(p.workEndMin), style: "width:auto" });
    ws.addEventListener("change", () => set({ workStartMin: fromHHMM(ws.value) }));
    we.addEventListener("change", () => set({ workEndMin: fromHHMM(we.value) }));
    more.append(el("div", { class: "card" }, el("h3", { text: "Work hours" }),
      pills(DAYS, p.workDays, d => set({ workDays: p.workDays.includes(d) ? p.workDays.filter(x => x !== d) : [...p.workDays, d] }), true),
      el("div", { class: "row", style: "margin-top:10px" }, ws, el("span", { text: "to" }), we)));
  }

  // detours
  const chosen = p.detourIds || DetourCatalog.DEFAULT_IDS;
  const dl = el("div", { class: "card" }, el("h3", { text: "Your detours" }), el("p", { class: "muted", text: "Kaak suggests 3 of these when he eats a feed or puts you on a nap." }),
    pills(DetourCatalog.ALL.map(d => [d.id, d.title]), chosen, id => set({ detourIds: chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id] }), true));
  more.append(dl);

  // strict mode
  more.append(el("div", { class: "card" }, el("div", { class: "spread" },
    el("div", {}, el("h3", { text: "Strict mode" }), el("p", { class: "muted", style: "margin:0", text: strict ? "On." : "Lock pause, feed removal and limit increases, up to 7 days." })),
    el("button", { class: "btn small" + (strict ? "" : " main"), type: "button", onclick: () => ctx.go("strict") }, strict ? "Details" : "Turn on"))));

  // previews and the live detector
  more.append(previews(ctx), detector(ctx));
  more.append(el("div", { class: "card" }, el("h3", { text: "Privacy" }),
    el("p", { text: "Kaak only works on the feed sites you switch on. He uses that you scrolled and when, whether a key was a scrolling key or a typing key (never which letter), and which kind of page you're on. He never reads posts, captions, names, messages or anything you type. Everything stays in this browser. No internet connections at all." }),
    el("button", { class: "btn small", type: "button", onclick: () => ctx.go("stats") }, "See everything Kaak wrote down")));
}

function previews(ctx) {
  const box = el("div", { class: "stage-box", style: "height:420px" });
  const card = el("div", { class: "card" }, el("h3", { text: "Watch every performance" }), box);
  const grid = el("div", { class: "preview-grid" });
  card.append(grid);
  let s = null;
  const run = fn => { if (!s) s = ctx.stage(box); s.clearScript && s.clearScript(); s.reset && s.reset(); fn(s); };
  const W = () => box.clientWidth, H = () => box.clientHeight;
  const P = [
    ["Arrive", s => s.arrive()], ["Back again", s => { s.sitNow(); s.again(); }], ["Nudge", s => { s.sitNow(); s.nudge(17); }],
    ["Walk across", s => { s.sitNow(); s.walkAcross(); }], ["Sit on the like button", s => { s.sitNow(); s.sitOnRail(); }],
    ["Splat", s => { s.sitNow(); s.splat(); }], ["Warning", s => { s.sitNow(); s.warn(); }],
    ["Jumpscare", s => s.jumpscare("MEDIUM")], ["Eat", s => { s.sitNow(); s.eat(() => {}); }],
    ["Theft + chase", s => s.holdingChase({ label: "I", color: "#E1306C" }, { l: W() * 0.15, t: H() * 0.3, r: W() * 0.85, b: H() * 0.75 }, () => {}, () => {}, 15000)],
    ["Bedtime", s => s.bedArrive()], ["Blanket", s => { s.bedArrive(); setTimeout(() => s.blanket(), 2600); }],
    ["Work mode", s => { s.setGlasses(true); s.arrive(); }], ["Friend-level trust", s => { s.perchCalm(true); s.arrive(); }],
    ["Morning gift", s => s.morningGift()], ["Kaak Times delivery", s => s.timesDelivery(() => {})],
  ];
  for (const [label, fn] of P) grid.append(el("button", { class: "btn small", type: "button", onclick: () => run(st => { st.setGlasses && st.setGlasses(false); st.perchCalm && st.perchCalm(false); fn(st); }) }, label));
  return card;
}

function detector(ctx) {
  const out = el("div", { class: "detector", text: "…" });
  const card = el("div", { class: "card" }, el("h3", { text: "Live detector" }), el("p", { class: "muted", text: "Open a feed in another tab and scroll: this updates every 2 seconds." }), out);
  const poll = async () => {
    const d = await ask({ t: "debug" });
    if (!d) return;
    const det = d.detection ? `${d.detection.verdict} (${d.detection.reason})` : "no verdict yet";
    const st = d.stats ? `swipes in window ${d.stats.swipesInWindow}, ${d.stats.swipesPerMin.toFixed(1)}/min, median dwell ${d.stats.medianDwellMs == null ? "–" : (d.stats.medianDwellMs / 1000).toFixed(1) + " s"}` : "";
    out.textContent = [
      `in feed: ${d.inFeed}${d.lookingAway ? " (looking away)" : ""}${d.blocked ? " (blocked)" : ""}`,
      `feed tabs: ${d.tabs.filter(t => t.isFeed).map(t => t.siteId + (t.watching ? "*" : "")).join(", ") || "none"}`,
      `verdict: ${det}`, st,
      `session: ${d.activeMin} min active, ${d.mindlessMin} min mindless · today: ${d.dailyMin} min`,
      `last action: ${d.lastAction}`,
    ].filter(Boolean).join("\n");
  };
  const tm = setInterval(poll, 2000);
  ctx.onLeave(() => clearInterval(tm));
  poll();
  return card;
}

export async function strict(ctx) {
  const r = await ask({ t: "strict", action: "status" });
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(header(ctx, "Strict mode", "An impulse becomes a 15-minute decision. Not a prison."));
  const card = el("div", { class: "card" });
  wrap.append(card);
  card.append(el("p", { text: "While it's on: pause, removing feeds and raising the daily limit are locked. Leaving early means asking, then waiting 15 minutes." }),
    el("p", { text: "What it can't do: a browser lets anyone switch an extension off or remove it, and Kaak can't stop that (nor should he). If he's switched off during strict mode, he notices when he's back, and it costs a little trust." }));
  if (!r.strict) {
    card.append(el("h3", { text: "Turn on for" }), pills(StrictPlan.CHOICES.map(c => [c.id, c.label]), null, async id => {
      await ask({ t: "strict", action: "start", choice: id });
      ctx.go("strict"); strict(ctx).then(() => wrap.remove());
    }));
    return;
  }
  card.append(el("p", { class: "tag", text: `On until ${new Date(r.until).toLocaleString()}` }));
  if (r.coolOffLeftMs == null) {
    card.append(el("button", { class: "btn", type: "button", onclick: async () => { await ask({ t: "strict", action: "ask" }); strict(ctx).then(() => wrap.remove()); } }, "Ask to leave strict mode"));
  } else {
    const left = Math.ceil(r.coolOffLeftMs / 60000);
    card.append(el("p", { text: left > 0 ? `You asked. Strict mode ends in ${left} min, unless you change your mind (just don't do anything).` : "Strict mode is ending." }));
  }
}
