// The nest, Kaak Times, the morning gift, detours and "Share my stats".
import { ask, el } from "../common.js";
import { header } from "./home.js";
import { line } from "../kaak.js";
import { openDetour } from "./locks.js";

export async function nest(ctx) {
  const r = await ask({ t: "nest" });
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(header(ctx, "Kaak's nest", `${r.returnedMin} minutes Kaak got back for you.`));
  const box = el("div", { class: "stage-box dusk", style: "height:380px" });
  wrap.append(box);
  const canvas = el("canvas", { "aria-label": "Kaak's nest on a rooftop at dusk" });
  box.append(canvas);
  const items = Object.entries(r.loot || {});
  const draw = () => {
    const dpr = devicePixelRatio || 1, w = box.clientWidth, h = box.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { KaakEngine.drawNestScene(c, items.reduce((n, [, k]) => n + k, 0), w, h); } catch (e) { console.warn(e); }
  };
  draw();
  const ro = new ResizeObserver(draw); ro.observe(box); ctx.onLeave(() => ro.disconnect());
  const list = el("div", { class: "card" }, el("h3", { text: "In the nest" }));
  if (!items.length) list.append(el("p", { text: "Nothing yet. Bribes add loot, and every 15 minutes Kaak gets back for you adds something shiny." }));
  else list.append(el("div", { class: "pills" }, items.map(([name, n]) => el("span", { class: "tag grey", text: n > 1 ? `${name} ×${n}` : name }))));
  wrap.append(list);
}

export async function times(ctx) {
  const r = await ask({ t: "times" });
  document.body.className = "paper-bg";
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(header(ctx, "Kaak Times", "Your week, as a tabloid. Written on this computer from templates."));
  const p = r && r.paper;
  if (!p) {
    wrap.append(el("div", { class: "card" }, el("h3", { text: "Not enough week yet." }), el("p", { text: "Kaak needs at least two days of numbers before he can write about you. Sundays, he delivers." })));
    return;
  }
  const paper = el("article", { class: "paper" },
    el("div", { class: "mast" }, el("small", { text: p.weekLabel }), el("h1", { text: "The Kaak Times" }), el("small", { text: "All the news Kaak sees fit to print" })),
    el("h2", { text: p.headline }), el("div", { class: "sub", text: p.subhead }),
    el("div", { class: "cols" }, (p.stories || []).map(s => el("section", { class: "story" }, el("h3", { text: s.title }), el("p", { text: s.body })))),
    el("div", { class: "side" },
      el("div", {}, el("strong", { text: "Weather. " }), p.weather || ""),
      el("div", {}, el("strong", { text: "Classified. " }), p.classified || "")));
  wrap.append(paper);
}

export async function gift(ctx) {
  await ask({ t: "gift" });
  document.body.className = "night";
  const page = el("div", { class: "cover-page" });
  ctx.app.append(page);
  const s = ctx.stage(page);
  s.morningGift();
  page.append(el("div", { class: "panel" }, el("div", { class: "card" },
    el("h3", { text: "You stayed off the feeds last night." }),
    el("p", { text: "Kaak brought you something for the nest, and a little trust." }),
    el("button", { class: "btn main", type: "button", onclick: () => ctx.go("nest") }, "See the nest"))));
}

export async function detours(ctx, _arg, params) {
  const r = await ask({ t: "detours" });
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  const lonely = params.get("lonely");
  wrap.append(header(ctx, lonely ? "Talk to someone" : "Something better", lonely ? "Kaak can't hug. Someone you know can." : "Three things that beat doomscrolling, picked for this time of day."));
  if (params.get("done")) wrap.append(el("div", { class: "card soft" }, el("h3", { text: line("goodChoice") }), el("p", { text: "Go do it. Kaak will be here. Unfortunately." })));
  const box = el("div", { class: "detours" });
  for (const d of r.detours || []) box.append(el("button", { class: "btn", type: "button", onclick: () => openDetour(ctx, d) }, el("span", {}, d.title, el("small", { text: d.typeLabel || "" }))));
  wrap.append(el("div", { class: "card" }, box,
    el("div", { class: "row" }, el("button", { class: "btn", type: "button", onclick: () => ctx.go("detours") }, "Three others"),
      el("button", { class: "btn link", type: "button", onclick: () => ctx.go("settings") }, "Choose your detours"))));
}

export async function stats(ctx) {
  const r = await ask({ t: "stats" });
  const wrap = el("div", { class: "wrap" });
  ctx.app.append(wrap);
  wrap.append(header(ctx, "Your numbers", "Everything Kaak wrote down, on this computer only. You decide whether to share it."));
  const lines = r.log || [];
  wrap.append(el("div", { class: "card" },
    el("h3", { text: "Share my stats" }),
    el("p", { text: `${lines.length} lines: minutes, counts and what Kaak did. No sites' content, no URLs, nothing you typed.` }),
    el("div", { class: "row" },
      el("button", { class: "btn main", type: "button", onclick: () => download("kaak-stats.jsonl", lines.join("\n") + "\n") }, "Download the file"),
      el("button", { class: "btn", type: "button", onclick: () => download("kaak-days.json", JSON.stringify(r.days, null, 1)) }, "Download daily totals"))));
  const rep = await ask({ t: "report" });
  const area = el("textarea", { readonly: true, style: "min-height:160px;font:600 12px ui-monospace,Consolas,monospace" });
  area.value = rep.text;
  wrap.append(el("div", { class: "card" },
    el("h3", { text: "Report a problem" }),
    el("p", { text: "Copies your browser version, Kaak's version, recent errors and recent events. Then send it by email." }),
    area,
    el("div", { class: "row", style: "margin-top:10px" },
      el("button", { class: "btn main", type: "button", onclick: async () => { await navigator.clipboard.writeText(rep.text); } }, "Copy"),
      el("a", { class: "btn", href: "mailto:theoslab.dev@gmail.com?subject=" + encodeURIComponent("Kaak for the browser: a problem") }, "Write an email"))));
  const recent = lines.slice(-40).reverse();
  wrap.append(el("div", { class: "card" }, el("h3", { text: "Recent" }), el("div", { class: "detector", text: recent.join("\n") || "Nothing yet." })));
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
