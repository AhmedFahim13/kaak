// Today, trust, the week, and the way to everything else (ui/MainActivity.kt, simplified).
import { ask, el, drawStillCrow } from "../common.js";

export function header(ctx, title, sub) {
  const crow = el("canvas", { class: "crow", width: "112", height: "112", "aria-hidden": "true" });
  const nav = el("nav", {},
    navBtn(ctx, "Home", "home"), navBtn(ctx, "Bribes", "bribes"), navBtn(ctx, "Nest", "nest"),
    navBtn(ctx, "Times", "times"), navBtn(ctx, "Settings", "settings"));
  const top = el("div", { class: "top" }, crow, el("div", {}, el("h1", { text: title }), sub ? el("p", { class: "muted", style: "margin:0", text: sub }) : null), nav);
  requestAnimationFrame(() => drawStillCrow(crow, { mood: "stare" }));
  return top;
}
function navBtn(ctx, label, route) {
  return el("button", { class: "btn small", type: "button", onclick: () => ctx.go(route) }, label);
}

export async function home(ctx) {
  const h = await ask({ t: "home" });
  if (!h) { ctx.app.textContent = "Kaak is waking up…"; setTimeout(() => ctx.go("home"), 800); return; }
  if (!h.status.onboarded) { ctx.go("welcome"); return; }
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(header(ctx, "Kaak", h.status.statusText));

  const pct = Math.min(100, Math.round(100 * h.status.dailyMin / Math.max(1, h.status.limitMin)));
  const today = el("div", { class: "card" },
    el("div", { class: "spread" }, el("span", { class: "muted", text: "Feed time today" }), el("span", { class: "tag" + (pct >= 100 ? "" : " grey"), text: pct >= 100 ? "eaten" : `${h.status.limitMin - h.status.dailyMin} min left` })),
    el("div", { class: "stat" }, String(h.status.dailyMin), el("small", { text: `/ ${h.status.limitMin} min` })),
    el("div", { class: "bar", style: "margin-top:10px" }, el("i", { style: `width:${pct}%` })),
    el("p", { class: "muted", style: "margin:10px 0 0", text: `Bribe minutes left today: ${h.bribeMinutesLeft}. Last thing Kaak did: ${h.lastAction}.` }));

  const next = h.trust.next;
  const trust = el("div", { class: "card" },
    el("div", { class: "spread" }, el("h3", { text: `Trust: ${h.trust.label}` }), el("span", { class: "tag grey", text: `${h.trust.points} points` })),
    el("p", { style: "margin:4px 0 0", text: next ? `${next.points} more to ${next.label}. Good days raise it; days he eats your feed or you escape lower it a little. It never resets.` : "Family. He trusts you. Mostly." }));

  const week = el("div", { class: "week", "aria-label": "Feed minutes, last 7 days" });
  const max = Math.max(h.prefs.dailyLimitMin, ...h.week.map(d => d.mindlessMin || 0), 1);
  for (const d of h.week) {
    const m = d.mindlessMin || 0;
    const dt = new Date(Math.floor(d.day / 10000), Math.floor(d.day / 100) % 100 - 1, d.day % 100);
    week.append(el("div", {}, el("i", { class: m > h.prefs.dailyLimitMin ? "over" : m > 0 ? "ok" : "", style: `height:${Math.max(4, Math.round(70 * m / max))}px`, title: `${m} min` }),
      dt.toLocaleDateString(undefined, { weekday: "short" })));
  }
  const t = h.today;
  const weekCard = el("div", { class: "card" }, el("h3", { text: "This week" }), week,
    el("p", { class: "muted", style: "margin:8px 0 0", text: `Today: ${t.feedOpens} feed visits, ${t.foiled} times Kaak stopped you, ${t.returnedMin} min he got back, ${t.escapes} escape${t.escapes === 1 ? "" : "s"}.` }));

  const actions = el("div", { class: "grid" },
    el("button", { class: "btn main", type: "button", onclick: () => ctx.go("bribes") }, "Earn time (bribe)"),
    el("button", { class: "btn", type: "button", onclick: () => ctx.go("nest") }, "Kaak's nest"),
    el("button", { class: "btn", type: "button", onclick: () => ctx.go("times") }, "Kaak Times"),
    el("button", { class: "btn", type: "button", onclick: () => ctx.go("detours") }, "Something better to do"),
    el("button", { class: "btn", type: "button", onclick: () => ctx.go("stats") }, "Share my stats"),
    el("button", { class: "btn", type: "button", onclick: () => ctx.go("settings") }, "Settings"));

  wrap.append(today, trust, weekCard, actions);
  if (h.status.badge) {
    wrap.prepend(el("div", { class: "card soft" }, el("div", { class: "spread" },
      el("h3", { text: h.status.badge === "times" ? "Kaak Times is out." : "Kaak left you a morning gift." }),
      el("button", { class: "btn small main", type: "button", onclick: () => ctx.go(h.status.badge === "times" ? "times" : "gift") }, "Open"))));
  }
}
