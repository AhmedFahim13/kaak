// Bribe menu and each bribe's screen (ui/BribeActivity.kt + ui/TaskActivity.kt, desktop checks).
import { ask, el } from "../common.js";
import { header } from "./home.js";
import { line } from "../kaak.js";
import { BribeCatalog, Check, STRETCHES, LEARNING_SITES } from "../../core/bribes.js";
import { countWords, StrokeCounter } from "../../core/proof.js";

const HOW = {
  AWAY: b => `Kaak checks the computer stays idle for ${b.amount} minutes.`,
  EYE_BREAK: () => "20 seconds without touching anything, eyes on something far away.",
  SITE_TIME: b => `${b.amount} minutes with a learning site's tab in front.`,
  BREATHING: b => `${b.amount} minutes, guided, on this page.`,
  STRETCH: b => `${b.amount} one-minute stretch${b.amount > 1 ? "es" : ""}, timed on this page.`,
  CANVAS: () => "Draw him on this page. He'll judge.",
  NOTE: b => `At least ${b.amount} words. Never saved: only the word count is checked.`,
  NO_FEED: b => `No feed tab open for ${b.amount} minutes straight.`,
  HONOR: () => "Kaak takes your word (3 a day).",
};

export async function bribes(ctx) {
  const r = await ask({ t: "bribes" });
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(header(ctx, "Bribe Kaak", `Earn feed minutes for later. ${r.minutesLeft} of 30 bribe minutes left today, ${r.honorLeft} honor bribes left.`));
  if (r.current) {
    wrap.append(el("div", { class: "card soft" }, el("div", { class: "spread" },
      el("h3", { text: `In progress: ${r.current.title}` }),
      el("button", { class: "btn small main", type: "button", onclick: () => ctx.go("task/" + r.current.id) }, "Continue"))));
  }
  const list = el("div", { class: "list" });
  for (const b of r.bribes) {
    const reward = [b.rewardMin ? `+${b.rewardMin} min` : null, b.loot ? b.loot : null, b.trust ? `trust +${b.trust}` : null].filter(Boolean).join(" · ");
    list.append(el("div", { class: "item" },
      el("div", { class: "grow" }, el("div", { class: "label", text: b.title }), el("div", { class: "hint", text: (HOW[b.check] || (() => ""))(b) })),
      el("span", { class: "tag grey", text: reward }),
      el("button", { class: "btn small", type: "button", onclick: () => ctx.go("task/" + b.id) }, "Do it")));
  }
  wrap.append(list);
}

export async function task(ctx, id) {
  const b = BribeCatalog.byId(id);
  if (!b) return ctx.go("bribes");
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(header(ctx, b.title, (HOW[b.check] || (() => ""))(b)));
  const card = el("div", { class: "card" });
  wrap.append(card);
  const done = r => {
    card.replaceChildren(el("h2", { text: r && r.granted ? line("bribeOk") : "Kaak isn't convinced." }),
      el("p", { text: r && r.granted ? `+${r.minutes} min for later${r.loot ? `, and a ${r.loot} for the nest` : ""}${r.trust ? `, trust +${r.trust}` : ""}.` : (r && r.reason) || "Try again, properly this time." }),
      el("div", { class: "row" }, el("button", { class: "btn main", type: "button", onclick: () => ctx.go("home") }, "Back home"),
        el("button", { class: "btn", type: "button", onclick: () => ctx.go("nest") }, "See the nest")));
  };
  const trustMe = () => el("button", { class: "btn link", type: "button", onclick: async () => done(await ask({ t: "trustMe", id })) }, "Ask Kaak to trust you (honor, 3 a day)");

  if (b.check === Check.HONOR) {
    card.append(el("p", { text: "Do it, then come back. Kaak takes your word, but only 3 times a day." }),
      el("button", { class: "btn main", type: "button", onclick: async () => done(await ask({ t: "trustMe", id })) }, "I did it"));
    return;
  }

  // checks the service worker runs in the background
  if ([Check.AWAY, Check.SITE_TIME, Check.NO_FEED, Check.FOCUS].includes(b.check)) {
    if (b.check === Check.SITE_TIME) {
      const r = await ask({ t: "bribes" });
      const pills = el("div", { class: "pills" });
      for (const s of LEARNING_SITES) {
        pills.append(el("button", { class: "pill", type: "button", "aria-pressed": r.granted.includes(s.id) ? "true" : "false", onclick: async () => {
          // the browser asks you to allow this one site; Kaak only learns whether its tab is in front
          const ok = await chrome.permissions.request({ origins: [...s.matches] });
          if (!ok) return;
          const st = await ask({ t: "startTask", id, siteId: s.id });
          if (st && st.error) { card.append(el("p", { text: st.error })); return; }
          window.open(s.url, "_blank");
          ctx.go("task/" + id);
        } }, s.name));
      }
      const st = await ask({ t: "taskState" });
      if (!st.task || st.task.id !== id) {
        card.append(el("h3", { text: "Pick a learning site" }), el("p", { class: "muted", text: "The browser will ask to let Kaak see when that site's tab is in front. Nothing else." }), pills, trustMe());
        return;
      }
    } else {
      const st = await ask({ t: "taskState" });
      if (!st.task || st.task.id !== id) await ask({ t: "startTask", id });
    }
    const bar = el("i", {}), note = el("p", {});
    card.append(el("div", { class: "bar green" }, bar), note,
      el("div", { class: "row" }, el("button", { class: "btn", type: "button", onclick: async () => { await ask({ t: "taskCancel" }); ctx.go("bribes"); } }, "Stop"), trustMe()));
    const poll = async () => {
      const st = await ask({ t: "taskState" });
      if (!st.task || st.task.id !== id) { clearInterval(tm); done({ granted: true, minutes: b.rewardMin, loot: b.loot, trust: b.trust }); return; }
      bar.style.width = Math.round(st.task.progress * 100) + "%";
      note.textContent = st.task.note;
    };
    const tm = setInterval(poll, 2000);
    ctx.onLeave(() => clearInterval(tm));
    poll();
    return;
  }

  await ask({ t: "startTask", id });
  const finish = async proof => done(await ask({ t: "taskDone", id, proof }));

  if (b.check === Check.EYE_BREAK) {
    const n = el("div", { class: "stat center", text: String(b.amount) });
    card.append(el("p", { text: "Look at something at least 20 feet away. Don't touch the mouse or keys." }), n, trustMe());
    let still = 0, last = performance.now();
    const reset = () => { still = 0; };
    ["pointermove", "keydown", "wheel", "pointerdown"].forEach(ev => addEventListener(ev, reset));
    const tm = setInterval(() => {
      const t = performance.now(); still += t - last; last = t;
      const left = Math.max(0, Math.ceil(b.amount - still / 1000));
      n.textContent = left ? String(left) : "done";
      if (!left) { clearInterval(tm); finish({ stillMs: still }); }
    }, 250);
    ctx.onLeave(() => { clearInterval(tm); ["pointermove", "keydown", "wheel", "pointerdown"].forEach(ev => removeEventListener(ev, reset)); });
    return;
  }

  if (b.check === Check.BREATHING || b.check === Check.STRETCH) {
    const total = b.amount * 60;
    const clock = el("div", { class: "stat center" });
    const cue = el("h3", { class: "center" });
    const circle = el("div", { class: "breath" });
    card.append(b.check === Check.BREATHING ? circle : el("div"), cue, clock, trustMe());
    const t0 = performance.now();
    const tm = setInterval(() => {
      const sec = Math.floor((performance.now() - t0) / 1000);
      const left = Math.max(0, total - sec);
      clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      if (b.check === Check.BREATHING) {
        const ph = sec % 12; // in 4, hold 4, out 4
        cue.textContent = ph < 4 ? "Breathe in" : ph < 8 ? "Hold" : "Breathe out";
        circle.classList.toggle("in", ph < 8);
      } else {
        cue.textContent = STRETCHES[Math.floor(sec / 60) % STRETCHES.length];
      }
      if (!left) { clearInterval(tm); finish({}); }
    }, 250);
    ctx.onLeave(() => clearInterval(tm));
    return;
  }

  if (b.check === Check.NOTE) {
    const box = el("textarea", { "aria-label": "Your note (never saved)", placeholder: b.id === "plan" ? "1.\n2.\n3." : "Three good things about today…" });
    const n = el("p", { class: "muted", text: `0 / ${b.amount} words` });
    const send = el("button", { class: "btn main", type: "button", disabled: true }, "Give it to Kaak");
    box.addEventListener("input", () => { const w = countWords(box.value); n.textContent = `${w} / ${b.amount} words`; send.disabled = w < b.amount; });
    send.addEventListener("click", () => { const words = countWords(box.value); box.value = ""; finish({ words }); });
    card.append(el("p", { class: "muted", text: "Only the number of words leaves this box. The note is thrown away." }), box, n, el("div", { class: "row" }, send, trustMe()));
    return;
  }

  if (b.check === Check.CANVAS) {
    const pose = el("div", { class: "stage-box", style: "height:220px;margin-bottom:12px" });
    const pad = el("canvas", { class: "draw", "aria-label": "Drawing area" });
    const n = el("p", { class: "muted", text: `0 / ${b.amount} strokes` });
    const send = el("button", { class: "btn main", type: "button", disabled: true }, "Show Kaak");
    card.append(pose, pad, n, el("div", { class: "row" }, send,
      el("button", { class: "btn", type: "button", onclick: () => { c.clearRect(0, 0, pad.width, pad.height); counter.clear(); n.textContent = `0 / ${b.amount} strokes`; send.disabled = true; } }, "Clear"), trustMe()));
    const s = ctx.stage(pose);
    s.sitNow();
    const dpr = devicePixelRatio || 1;
    pad.width = pad.clientWidth * dpr; pad.height = pad.clientHeight * dpr;
    const c = pad.getContext("2d");
    c.scale(dpr, dpr); c.lineWidth = 4; c.lineCap = "round"; c.strokeStyle = "#1F1A17";
    const counter = new StrokeCounter(() => { n.textContent = `${counter.strokes} / ${b.amount} strokes`; send.disabled = !counter.ok(b.amount); });
    let drawing = false, lastPt = null;
    const pt = e => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    pad.addEventListener("pointerdown", e => { drawing = true; lastPt = pt(e); pad.setPointerCapture(e.pointerId); counter.down && counter.down(lastPt.x, lastPt.y); });
    pad.addEventListener("pointermove", e => {
      if (!drawing) return;
      const p = pt(e);
      c.beginPath(); c.moveTo(lastPt.x, lastPt.y); c.lineTo(p.x, p.y); c.stroke();
      counter.move && counter.move(p.x, p.y);
      lastPt = p;
    });
    pad.addEventListener("pointerup", () => { if (drawing) counter.up(); drawing = false; });
    send.addEventListener("click", () => { s.say(line("drawing"), 2600); setTimeout(() => finish({ strokes: counter.strokes }), 1800); });
  }
}
