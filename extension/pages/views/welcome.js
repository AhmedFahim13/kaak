// Onboarding (ui/OnboardingActivity.kt): Kaak steals Next, then feeds, how mean, bedtime + limit,
// detours, privacy + two browser steps, and the contract he stamps with a muddy foot.
import { ask, el } from "../common.js";
import { SITES } from "../../core/sites.js";
import { DetourCatalog } from "../../core/detours.js";

const CHAOS = [["PIGEON", "Pigeon (gentle)", 15, 180], ["KAAK", "Kaak (default)", 10, 90], ["MONKEY", "Monkey (harsh)", 6, 45]];
const JUMP = [["OFF", "Off"], ["GENTLE", "Gentle"], ["MEDIUM", "Medium"], ["FULL", "Full"]];

export async function welcome(ctx) {
  const r = await ask({ t: "prefs" });
  const draft = {
    feeds: [...r.prefs.feeds], chaos: r.prefs.chaos, arrivalMin: r.prefs.arrivalMin, gagEverySec: r.prefs.gagEverySec,
    jumpscare: r.prefs.jumpscare, dailyLimitMin: r.prefs.dailyLimitMin, bedtimeMinute: r.prefs.bedtimeMinute,
    detourIds: r.prefs.detourIds || [...DetourCatalog.DEFAULT_IDS], friendName: r.prefs.friendName || "",
  };
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  const steps = el("div", { class: "steps" });
  const N = 7;
  for (let i = 0; i < N; i++) steps.append(el("i"));
  wrap.append(steps);
  const body = el("div");
  wrap.append(body);
  let page = 0;

  const nav = (canBack = true, nextLabel = "Next") => {
    const next = el("button", { class: "btn main", type: "button", onclick: () => show(page + 1) }, nextLabel);
    return { row: el("div", { class: "row", style: "margin-top:16px" }, canBack ? el("button", { class: "btn", type: "button", onclick: () => show(page - 1) }, "Back") : null, next), next };
  };
  const pill = (label, on, fn) => el("button", { class: "pill", type: "button", "aria-pressed": on ? "true" : "false", onclick: fn }, label);

  function show(i) {
    page = Math.max(0, Math.min(N - 1, i));
    [...steps.children].forEach((s, k) => s.classList.toggle("on", k <= page));
    body.replaceChildren();
    PAGES[page]();
  }

  const PAGES = [
    // 1. Kaak steals Next before you can read anything
    () => {
      const box = el("div", { class: "stage-box", style: "height:340px" });
      const n = nav(false);
      body.append(el("h1", { text: "This is Kaak." }), el("p", { text: "A petty Dhaka house crow. He hates doomscrolling. Yours, specifically." }), box, n.row);
      const s = ctx.stage(box);
      setTimeout(() => {
        const br = n.next.getBoundingClientRect(), bx = box.getBoundingClientRect();
        // the button is below the stage: he grabs a copy of it from the bottom edge
        const rect = { x: Math.min(bx.width - 90, Math.max(10, br.left - bx.left)), y: bx.height - 60, w: Math.max(80, br.width), h: 44 };
        s.stealButton(rect, "Next", () => { n.next.style.visibility = "hidden"; }, () => { n.next.style.visibility = "visible"; s.say(ctx.lines.pick("chaseWon"), 2200); });
        body.append(el("p", { class: "muted", text: "He took the button. Click him 5 times to get it back." }));
      }, 900);
    },
    // 2. feeds
    () => {
      const list = el("div", { class: "list" });
      for (const s of SITES) {
        const on = draft.feeds.includes(s.id);
        const input = el("input", { type: "checkbox", role: "switch", "aria-label": s.name });
        input.checked = on;
        input.addEventListener("change", async () => {
          if (input.checked && s.optional && !(await chrome.permissions.request({ origins: [...s.matches] }))) { input.checked = false; return; }
          draft.feeds = input.checked ? [...new Set([...draft.feeds, s.id])] : draft.feeds.filter(x => x !== s.id);
        });
        list.append(el("div", { class: "item" }, el("div", { class: "grow" }, el("div", { class: "label", text: s.name }),
          s.optional ? el("div", { class: "hint", text: "Optional: the browser will ask to allow this site." }) : null), el("label", { class: "switch" }, input, el("span"))));
      }
      body.append(el("h1", { text: "Which feeds?" }), el("p", { text: "Kaak only ever appears on these. Chats, Messenger, YouTube Studio and Business Suite are never touched." }), list, nav().row);
    },
    // 3. how mean
    () => {
      const chaos = el("div", { class: "pills" }), jump = el("div", { class: "pills" });
      const draw = () => {
        chaos.replaceChildren(...CHAOS.map(([v, l, a, g]) => pill(l, draft.chaos === v, () => { Object.assign(draft, { chaos: v, arrivalMin: a, gagEverySec: g }); draw(); })));
        jump.replaceChildren(...JUMP.map(([v, l]) => pill(l, draft.jumpscare === v, () => { draft.jumpscare = v; draw(); })));
      };
      draw();
      body.append(el("h1", { text: "How mean should he be?" }), el("p", { text: "Kaak (default) shows up after 10 mindless minutes and acts up every minute and a half." }),
        el("div", { class: "card" }, chaos, el("h3", { text: "Jumpscare", style: "margin-top:16px" }),
          el("p", { class: "muted", text: "Once per session, at random, after about 20 minutes. One smooth dim, never a flicker. Never at night unless you allow it." }), jump), nav().row);
    },
    // 4. bedtime and the daily limit
    () => {
      const lim = el("input", { type: "range", min: 5, max: 180, step: 5, value: draft.dailyLimitMin, "aria-label": "Daily limit" });
      const out = el("span", { class: "tag grey", text: `${draft.dailyLimitMin} min` });
      lim.addEventListener("input", () => { draft.dailyLimitMin = +lim.value; out.textContent = `${lim.value} min`; });
      const hh = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const bed = el("input", { type: "time", value: hh(draft.bedtimeMinute), style: "width:auto" });
      bed.addEventListener("change", () => { const [h, m] = bed.value.split(":").map(Number); draft.bedtimeMinute = h * 60 + m; });
      body.append(el("h1", { text: "Limit and bedtime" }),
        el("div", { class: "card" }, el("div", { class: "spread" }, el("h3", { text: "Daily limit" }), out), lim,
          el("p", { class: "muted", text: "All feed time counts, except typing and one long video watched on purpose. At the limit he eats the feed and naps on it for 20 minutes." })),
        el("div", { class: "card" }, el("div", { class: "spread" }, el("h3", { text: "Bedtime" }), bed),
          el("p", { class: "muted", text: "After bedtime he arrives sooner, yawns, and pulls a blanket over the feed. No feeds all night = a morning gift." })), nav().row);
    },
    // 5. detours
    () => {
      const box = el("div", { class: "pills" });
      const draw = () => box.replaceChildren(...DetourCatalog.ALL.filter(d => d.opener !== "SLEEP").map(d =>
        pill(d.title, draft.detourIds.includes(d.id), () => { draft.detourIds = draft.detourIds.includes(d.id) ? draft.detourIds.filter(x => x !== d.id) : [...draft.detourIds, d.id]; draw(); })));
      draw();
      const friend = el("input", { type: "text", placeholder: "A friend's name (optional)", value: draft.friendName });
      friend.addEventListener("input", () => { draft.friendName = friend.value; });
      body.append(el("h1", { text: "Better things to do" }), el("p", { text: "When Kaak eats a feed, he suggests 3 of these. Pick the ones you'd actually do." }),
        el("div", { class: "card" }, box), el("div", { class: "card" }, el("h3", { text: "Someone to call" }), friend), nav().row);
    },
    // 6. privacy, honestly, and two browser steps
    () => {
      body.append(el("h1", { text: "What Kaak sees" }),
        el("div", { class: "card" },
          el("p", { text: "Your browser says Kaak can \"read and change your data\" on the feed sites. That's the only way an extension can draw a crow on a page." }),
          el("p", { text: "What he actually uses: that you scrolled and when, whether a key was a scrolling key or a typing key (never which letter), and which kind of page you're on (a Short, a Reel, a feed)." }),
          el("p", { text: "He never reads posts, captions, names, messages or anything you type, and never takes screenshots. Everything stays in this browser. Kaak makes no internet connections at all." })),
        el("div", { class: "card soft" },
          el("h3", { text: "Two browser steps" }),
          el("p", { text: "1. Pin Kaak: click the puzzle-piece icon next to the address bar, then the pin next to Kaak." }),
          el("p", { text: "2. Optional: allow Kaak in private windows (Incognito/InPrivate). Without it, private windows are Kaak-free. That's allowed: Kaak is friction, not a cage." }),
          el("button", { class: "btn small", type: "button", onclick: () => chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id }) }, "Open Kaak's browser settings")),
        nav().row);
    },
    // 7. the contract
    () => {
      const name = el("input", { type: "text", placeholder: "Your name", "aria-label": "Your name" });
      const sig = el("div", { class: "signature", "aria-live": "polite" });
      name.addEventListener("input", () => { sig.textContent = name.value; sign.disabled = !name.value.trim(); });
      const sign = el("button", { class: "btn main", type: "button", disabled: true }, "Sign");
      const paper = el("div", { class: "card contract" },
        el("h2", { text: "The contract" }),
        el("p", { text: "I agree that Kaak may show up when I scroll without thinking, steal my feeds when I come back too fast, and eat them when I hit my limit. I can always leave, but he'll remember." }),
        sig, el("p", { class: "muted", style: "margin-top:6px", text: "Signed" }));
      body.append(paper, name, el("div", { class: "row", style: "margin-top:16px" }, el("button", { class: "btn", type: "button", onclick: () => show(page - 1) }, "Back"), sign));
      const s = ctx.stage(paper);
      sign.addEventListener("click", () => {
        sign.disabled = true;
        const r = sig.getBoundingClientRect(), pr = paper.getBoundingClientRect();
        s.stamp(r.left - pr.left + Math.min(r.width, 260) * 0.7, r.top - pr.top + r.height / 2, async () => {
          await ask({ t: "onboarded", patch: { ...draft, friendName: draft.friendName.trim() || null } });
          body.append(el("div", { class: "card soft", style: "margin-top:16px" }, el("h3", { text: "Binding." }),
            el("p", { text: "Kaak is watching your feeds now. Open Instagram, Facebook, TikTok or YouTube in a tab and scroll like you usually do." }),
            el("button", { class: "btn main", type: "button", onclick: () => ctx.go("home") }, "Go to Kaak's home")));
        });
      });
    },
  ];
  show(0);
}
