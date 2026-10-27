// Kaak's page: one page, hash-routed. Lock redirects arrive as ?lock=nap&site=instagram.
import { ask } from "./common.js";
import { Lines } from "../core/lines.js";
import * as homeViews from "./views/home.js";
import * as lockViews from "./views/locks.js";
import * as bribeViews from "./views/bribes.js";
import * as extraViews from "./views/extras.js";
import * as settingsViews from "./views/settings.js";
import * as welcomeViews from "./views/welcome.js";

const app = document.getElementById("app");
let cleanup = [];

export const ctx = {
  app,
  lines: new Lines(),
  langCode: "en",
  minutes: 0,
  onLeave(fn) { cleanup.push(fn); },
  go(route) { location.hash = route; },
  /** A Kaak stage on a canvas filling `box`. Cleaned up when the view changes. */
  stage(box, opts = {}) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    box.prepend(canvas);
    const r = box.getBoundingClientRect();
    const s = KaakEngine.createStage(canvas, {
      width: r.width || innerWidth, height: r.height || innerHeight, dp: opts.dp || 1, bg: "none",
      reduceMotion: ctx.reduceMotion,
      lineFn: key => line(key), fixedFn: key => fixedLine(key),
      font: "'Nunito', 'Hind Siliguri', system-ui, sans-serif",
    });
    s.attachPointer(canvas);
    s.start();
    globalThis.__kaakStage = s; // tests look at the last stage
    const ro = new ResizeObserver(() => { const b = box.getBoundingClientRect(); s.resize(b.width, b.height); });
    ro.observe(box);
    cleanup.push(() => { ro.disconnect(); s.stop(); s.clear(); });
    return s;
  },
};

// board keys that Lines.kt doesn't have (onboarding and the contract)
const EXTRA = {
  stamp: { en: ["binding."], bl: ["pakka."], bn: ["পাক্কা।"] },
  goodChoice: { en: ["good choice."], bl: ["bhalo siddhanto."], bn: ["ভালো সিদ্ধান্ত।"] },
};
const EXTRA_FIXED = {
  ate: { en: "He ate your feed.", bl: "O tomar feed kheye feleche.", bn: "সে তোমার ফিড খেয়ে ফেলেছে।" },
  tapHint: { en: "Click Kaak 5 times to get it back.", bl: "Ferot pete Kaak ke 5 bar click koro.", bn: "ফেরত পেতে কাককে ৫ বার ক্লিক করো।" },
  knowHow: { en: "Now you know how this works.", bl: "Ekhon tumi jano kivabe cholbe.", bn: "এখন তুমি জানো কীভাবে চলবে।" },
  detours: { en: "Kaak's full. Try one of these:", bl: "Kaak er pet bhora. Egulor ekta koro:", bn: "কাকের পেট ভরা। এগুলোর একটা করো:" },
  moodQ: { en: "Why are you scrolling?", bl: "Keno scroll korcho?", bn: "কেন স্ক্রল করছো?" },
  worth: { en: "Was that worth it?", bl: "Eta ki worth chilo?", bn: "এটা কি দরকার ছিল?" },
};
export function line(key) {
  try { return ctx.lines.pick(key, ctx.minutes); } catch (e) {
    const x = EXTRA[key];
    return x ? x[ctx.langCode][Math.floor(Math.random() * x[ctx.langCode].length)] : ""; // engine falls back to English
  }
}
export function fixedLine(key) {
  try { return ctx.lines.fixed(key, ctx.minutes); } catch (e) {
    const x = EXTRA_FIXED[key];
    return x ? x[ctx.langCode] : "";
  }
}

const ROUTES = {
  home: homeViews.home,
  nap: lockViews.nap,
  eaten: lockViews.eaten,
  theft: lockViews.theft,
  escape: lockViews.escape,
  bribes: bribeViews.bribes,
  task: bribeViews.task,
  nest: extraViews.nest,
  times: extraViews.times,
  gift: extraViews.gift,
  detours: extraViews.detours,
  stats: extraViews.stats,
  settings: settingsViews.settings,
  strict: settingsViews.strict,
  welcome: welcomeViews.welcome,
};

function parse() {
  // lock redirects use the query string; everything else uses the hash
  const q = new URLSearchParams(location.search);
  if (q.get("lock") && !location.hash) {
    return { name: q.get("lock") === "theft" ? "theft" : "nap", arg: null, params: new URLSearchParams({ site: q.get("site") || "instagram", fromLock: "1" }) };
  }
  const h = location.hash.replace(/^#/, "") || "home";
  const [path, query] = h.split("?");
  const [name, arg] = path.split("/");
  return { name, arg, params: new URLSearchParams(query || "") };
}

async function render() {
  for (const fn of cleanup.splice(0)) { try { fn(); } catch (e) {} }
  app.replaceChildren();
  document.body.className = "";
  const { name, arg, params } = parse();
  const view = ROUTES[name] || ROUTES.home;
  try {
    await view(ctx, arg, params);
  } catch (e) {
    console.error(e);
    app.textContent = "Something went wrong: " + e.message;
  }
  window.scrollTo(0, 0);
}

async function boot() {
  const r = await ask({ t: "prefs" });
  const p = (r && r.prefs) || {};
  ctx.lines.lang = p.lang || "ENGLISH";
  ctx.langCode = { ENGLISH: "en", BANGLISH: "bl", BANGLA: "bn" }[p.lang] || "en";
  document.documentElement.lang = ctx.langCode === "bn" ? "bn" : "en";
  ctx.reduceMotion = !!p.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = await ask({ t: "status" });
  ctx.minutes = st ? st.dailyMin : 0;
  ctx.prefs = p;
  addEventListener("hashchange", render);
  await render();
}

boot();
