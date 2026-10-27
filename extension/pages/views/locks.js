// The nap cover, the eaten screen, the theft chase and the escape screen.
// Every lock page first checks that its lock is real; if not, it clears the rules and lets you go
// (spec 7.6: never a trap, and clear the rules *before* sending you back, or you'd loop).
import { ask, el } from "../common.js";
import { line, fixedLine } from "../kaak.js";
import { EscapeRules } from "../../core/commitment.js";
import { SITES } from "../../core/sites.js";

const siteOf = id => SITES.find(s => s.id === id) || SITES[0];
const tileOf = s => ({ label: s.initial, color: s.color });

async function clearAndGo(site) {
  await ask({ t: "clearStaleLocks" });
  // belt and braces: if the worker is broken, remove our own redirect rules from here
  try {
    const info = await ask({ t: "lockInfo" });
    if (!info || (!info.nap && !info.theft)) {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      if (rules.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: rules.map(r => r.id) });
    }
  } catch (e) {}
  location.replace(siteOf(site).homeUrl);
}

function detourList(ctx, detours) {
  const box = el("div", { class: "detours" });
  for (const d of detours || []) {
    box.append(el("button", { class: "btn", type: "button", onclick: () => openDetour(ctx, d) },
      el("span", {}, d.title, el("small", { text: d.typeLabel || "" }))));
  }
  return box;
}
export async function openDetour(ctx, d) {
  await ask({ t: "detourUsed", id: d.id });
  if (d.bribeId) { ctx.go("task/" + d.bribeId); return; }
  if (d.url) { location.href = d.url; return; }
  ctx.go("detours?done=" + encodeURIComponent(d.id));
}

// ------------------------------------------------------------------ nap (Cards.asleep)
export async function nap(ctx, _arg, params, eatenFirst = false) {
  const site = siteOf(params.get("site"));
  const info = await ask({ t: "lockInfo" });
  if (!info || !info.nap) {
    if (params.get("fromLock")) return clearAndGo(site.id);
    return wokeUp(ctx, site);
  }
  document.body.className = "night";
  document.title = "Kaak is asleep";
  const page = el("div", { class: "cover-page" });
  const head = el("div", { class: "headline" });
  const title = el("h1", {});
  const sub = el("p", {});
  head.append(title, sub);
  page.append(head);
  ctx.app.append(page);
  const s = ctx.stage(page);
  const place = () => s.sleepOnTile(page.clientWidth / 2, page.clientHeight * 0.42, tileOf(site));
  place();

  const { detours } = await ask({ t: "detours" });
  const panel = el("div", { class: "panel" },
    el("div", { class: "card" },
      el("h3", { text: fixedLine("detours") || "Kaak's full. Try one of these:" }),
      detourList(ctx, detours),
      el("div", { class: "row" },
        el("button", { class: "btn", type: "button", onclick: () => ctx.go("bribes") }, "Earn time for later (bribe)"),
        el("button", { class: "btn link", type: "button", onclick: () => ctx.go(`escape?site=${site.id}`) }, "Go in anyway…"))));
  page.append(panel);

  const update = async () => {
    const i = await ask({ t: "lockInfo" });
    if (!i || !i.nap) { cleanupTimer(); return wokeUp(ctx, site, page, s); }
    title.textContent = eatenFirst ? (fixedLine("ate") || "He ate your feed.") : "Kaak is asleep.";
    ctx.minutes = i.nap.minutesLeft;
    sub.textContent = fixedLine("asleep") ? fixedLine("asleep").replace(/\d+/, i.nap.minutesLeft) : `Back in ${i.nap.minutesLeft} min.`;
  };
  const timer = setInterval(update, 5000);
  const cleanupTimer = () => clearInterval(timer);
  ctx.onLeave(cleanupTimer);
  await update();

  if (eatenFirst && info.firstEat) {
    ask({ t: "seen", tip: "eat" });
    panel.prepend(el("div", { class: "card soft" },
      el("h3", { text: "Kaak ate your feeds." }),
      el("p", { text: "For 20 minutes every feed opens to his nap. Try a detour, earn time for later, or go in anyway (it takes a while, on purpose)." })));
  }
}

function wokeUp(ctx, site, page, s) {
  ctx.app.replaceChildren();
  document.body.className = "";
  const wrap = el("div", { class: "wrap center" },
    el("h1", { text: "Kaak woke up." }),
    el("p", { text: "Your feeds are open again. He's watching." }),
    el("div", { class: "row", style: "justify-content:center" },
      el("button", { class: "btn main", type: "button", onclick: () => clearAndGo(site.id) }, `Back to ${site.name}`),
      el("button", { class: "btn", type: "button", onclick: () => ctx.go("home") }, "Kaak's home")));
  ctx.app.append(wrap);
}

export function eaten(ctx, arg, params) { return nap(ctx, arg, params, true); }

// ------------------------------------------------------------------ theft and chase
export async function theft(ctx, _arg, params) {
  const site = siteOf(params.get("site"));
  const info = await ask({ t: "lockInfo" });
  if (!info || !info.theft) {
    if (info && info.nap) return nap(ctx, _arg, params);
    if (params.get("fromLock")) return clearAndGo(site.id);
    return clearAndGo(site.id);
  }
  document.body.className = "chase-bg";
  document.title = "Kaak has your feeds";
  const page = el("div", { class: "cover-page" });
  const head = el("div", { class: "headline" }, el("h1", { text: `He took ${site.name}.` }), el("p", { id: "hint" }));
  page.append(head);
  ctx.app.append(page);
  const s = ctx.stage(page);
  const hint = head.querySelector("#hint");

  if (info.theft.forever) {
    hint.textContent = fixedLine("tapHint") || "Click Kaak 5 times to get it back.";
    if (info.firstTheft) {
      ask({ t: "seen", tip: "theft" });
      page.append(el("div", { class: "panel" }, el("div", { class: "card soft" },
        el("h3", { text: "He took your feeds." }),
        el("p", { text: "Click Kaak 5 times to get them back (or Tab to him and press Enter). Ignore him and every feed stays locked for 3 minutes." }))));
    }
    const area = { l: page.clientWidth * 0.15, t: page.clientHeight * 0.3, r: page.clientWidth * 0.85, b: page.clientHeight * 0.75 };
    s.holdingChase(tileOf(site), area, async () => {
      hint.textContent = "Fine. Take it.";
      await ask({ t: "chase", result: "won", site: site.id });
      setTimeout(() => clearAndGo(site.id), 1600);
    }, async () => {
      await ask({ t: "chase", result: "lost", site: site.id });
      setTimeout(() => theft(ctx, _arg, params), 1400);
    }, 15000);
    // keyboard: Enter or Space hits him
    const key = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); s.keyHit && s.keyHit(); } };
    addEventListener("keydown", key);
    ctx.onLeave(() => removeEventListener("keydown", key));
    const sr = el("button", { class: "sr", type: "button", "aria-label": "Hit Kaak (press 5 times)", onclick: () => s.keyHit && s.keyHit() });
    page.append(sr);
    sr.focus();
  } else {
    // he kept it: every feed is locked until the timer runs out
    s.sitNow();
    s.say(line("chaseLost"), 4000);
    const panel = el("div", { class: "panel" });
    const { detours } = await ask({ t: "detours" });
    const left = el("p", {});
    panel.append(el("div", { class: "card" }, el("h3", { text: "He kept it. Feeds locked for a bit." }), left, detourList(ctx, detours)));
    page.append(panel);
    const tickLeft = async () => {
      const i = await ask({ t: "lockInfo" });
      if (!i || !i.theft) { clearInterval(tm); left.textContent = ""; return clearAndGo(site.id); }
      left.textContent = `Back in ${Math.max(1, Math.ceil((i.theft.until - Date.now()) / 1000))} s.`;
    };
    const tm = setInterval(tickLeft, 1000);
    ctx.onLeave(() => clearInterval(tm));
    tickLeft();
  }
}

// ------------------------------------------------------------------ escape (EscapeActivity)
export async function escape(ctx, _arg, params) {
  const site = siteOf(params.get("site"));
  const info = await ask({ t: "lockInfo" });
  if (!info || !info.nap) return clearAndGo(site.id);
  const status = await ask({ t: "status" });
  const escapes = info.escapesToday;
  const hold = EscapeRules.holdSeconds(escapes);
  const d = new Date();
  const dayKey = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const phrase = EscapeRules.phrase(escapes, dayKey, status ? status.dailyMin : 0);

  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(el("h1", { text: "Go in anyway?" }),
    el("p", { text: `Hold Kaak for ${hold} seconds. Then type the sentence. You get 5 minutes, then the nap cover comes back.` }));

  // step 1: hold (mouse, touch, or Space)
  const ring = el("div", { class: "ring", role: "button", tabindex: "0", "aria-label": `Hold for ${hold} seconds (mouse button or Space)` });
  ring.innerHTML = `<svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="100" fill="none" stroke="#EEE8E2" stroke-width="14"/>
    <circle id="arc" cx="110" cy="110" r="100" fill="none" stroke="#EF4B3F" stroke-width="14" stroke-linecap="round" stroke-dasharray="628.3" stroke-dashoffset="628.3"/></svg>`;
  const mini = el("div", { style: "position:absolute;inset:22px;border-radius:50%;overflow:hidden;background:#FAF7F4" });
  ring.append(mini, el("div", { class: "count", id: "count", text: `${hold} s` }));
  wrap.append(el("div", { class: "card center", style: "padding-bottom:48px" }, ring));
  const s = ctx.stage(mini, { dp: 0.62 });
  s.noHoldRing = true; // the big ring around him is the progress
  s.sleepOnTile(80, 112, tileOf(site));

  const arc = ring.querySelector("#arc"), count = ring.querySelector("#count");
  let start = 0, raf = 0, held = false, passed = false;
  const step2 = el("div", { class: "card hidden" });
  const frame = () => {
    const p = Math.min(1, (performance.now() - start) / (hold * 1000));
    arc.setAttribute("stroke-dashoffset", String(628.3 * (1 - p)));
    count.textContent = `${Math.ceil(hold * (1 - p))} s`;
    s.setHold(p);
    if (p >= 1) { passed = true; held = false; ring.setAttribute("aria-disabled", "true"); count.textContent = "OK."; s.setHold(-1); showStep2(); return; }
    raf = requestAnimationFrame(frame);
  };
  const down = e => { if (passed || held) return; e.preventDefault(); held = true; start = performance.now(); raf = requestAnimationFrame(frame); };
  const up = () => {
    if (!held) return;
    held = false; cancelAnimationFrame(raf);
    arc.setAttribute("stroke-dashoffset", "628.3"); count.textContent = `${hold} s`;
    s.setHold(-2); // let go early: "thought so."
  };
  ring.addEventListener("pointerdown", down);
  addEventListener("pointerup", up);
  ring.addEventListener("pointerleave", up);
  ring.addEventListener("keydown", e => { if (e.key === " " && !e.repeat) down(e); });
  ring.addEventListener("keyup", e => { if (e.key === " ") up(); });
  ctx.onLeave(() => { removeEventListener("pointerup", up); cancelAnimationFrame(raf); });

  // step 2: type the sentence (no pasting, no dropping, no autocomplete)
  const box = el("textarea", { autocomplete: "off", autocorrect: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Type the sentence" });
  const msg = el("p", { class: "muted" });
  const go = el("button", { class: "btn main", type: "button", disabled: true }, "Go in for 5 minutes");
  step2.append(el("h3", { text: "Type this, exactly:" }), el("div", { class: "phrase", text: phrase }), box, msg, el("div", { class: "row" }, go,
    el("button", { class: "btn", type: "button", onclick: () => history.back() }, "Never mind")));
  wrap.append(step2);
  let lastLen = 0;
  const reject = text => { box.value = ""; lastLen = 0; msg.textContent = text; go.disabled = true; };
  box.addEventListener("paste", e => { e.preventDefault(); reject("No pasting. Type it."); });
  box.addEventListener("drop", e => { e.preventDefault(); reject("No dropping. Type it."); });
  box.addEventListener("beforeinput", e => { if (EscapeRules.PASTE_INPUT_TYPES.includes(e.inputType)) { e.preventDefault(); reject("No pasting. Type it."); } });
  box.addEventListener("input", e => {
    const inserted = box.value.length - lastLen;
    if (EscapeRules.isPaste({ inputType: e.inputType, inserted })) { reject("That looked like pasting. Type it."); return; }
    lastLen = box.value.length;
    msg.textContent = "";
    go.disabled = !EscapeRules.phraseOk(box.value, phrase);
  });
  function showStep2() { step2.classList.remove("hidden"); box.focus(); }
  go.addEventListener("click", async () => {
    go.disabled = true;
    const r = await ask({ t: "escape", site: site.id });
    if (r && r.ok) location.replace(r.home || site.homeUrl);
  });
}
