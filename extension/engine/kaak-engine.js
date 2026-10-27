/*
 * Kaak engine: the drawing and animation code from docs/kaak-animation-board.html
 * (itself a JavaScript port of KaakView.kt and CrowPainter.kt), made reusable.
 *
 * Classic script (no ES modules) so it can run as a Chrome content script and in
 * extension pages alike. Exposes globalThis.KaakEngine. No dependencies, no network.
 *
 * Differences from the board are listed in extension/engine/README.md.
 */
(function (root) {
  "use strict";
  if (root.KaakEngine && root.KaakEngine.version) return; // injected twice: keep the first

  const VERSION = "0.1.0";
  const DEFAULT_FONT = "'Nunito', 'Hind Siliguri', system-ui, sans-serif";
  const DEFAULT_TILE = Object.freeze({ label: "F", color: "#1877F2" });
  const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
  const prefersReducedMotion = () => {
    try { return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
  };

  // ====================================================================
  // Lines (the board's subset of Lines.kt, plus nudge; English is the default)
  // "{n}" is filled with a number (minutes); Bangla gets Bangla digits.
  // ====================================================================
  const LINES = {
    arrive: { en: ["I see you.", "hm.", "…"], bl: ["dekhi tomake.", "hm.", "…"], bn: ["তোমাকে দেখছি।", "হুম।", "…"] },
    peck: { en: ["tap tap.", "hello?", "knock knock."], bl: ["tak tak.", "hello?", "shuncho?"], bn: ["ঠক ঠক।", "হ্যালো?", "শুনছো?"] },
    again: { en: ["again?", "back already?", "oh. you."], bl: ["abar?", "eto taratari?", "o. tumi."], bn: ["আবার?", "এত তাড়াতাড়ি?", "ও। তুমি।"] },
    walk: { en: ["just passing through.", "don't mind me.", "nice feed. anyway."], bl: ["ami just jacchi.", "amake dekho na.", "bhalo feed. jak."], bn: ["আমি শুধু যাচ্ছি।", "আমাকে দেখো না।", "ভালো ফিড। যাক।"] },
    sit: { en: ["what are you doing", "again?", "bro, it's been {n} minutes"], bl: ["ki korcho eta", "abar?", "bhai {n} minute hoye gelo"], bn: ["কী করছো এটা", "আবার?", "ভাই, {n} মিনিট হয়ে গেলো"] },
    splat: { en: ["oops.", "my bad.", "that was on purpose."], bl: ["oops.", "sorry na.", "eta ichche kore."], bn: ["উফ।", "সরি না।", "এটা ইচ্ছে করে।"] },
    wiped: { en: ["thank you.", "much better.", "fine."], bl: ["dhonnobad.", "eibar bhalo.", "thik ache."], bn: ["ধন্যবাদ।", "এবার ভালো।", "ঠিক আছে।"] },
    steal: { en: ["mine now.", "nope.", "this? I'll take it."], bl: ["eta amar.", "na.", "eta ami nilam."], bn: ["এটা আমার।", "না।", "এটা আমি নিলাম।"] },
    hit: { en: ["hey!", "rude.", "ow.", "stop that."], bl: ["ei!", "beyadob.", "uff.", "thamo."], bn: ["এই!", "বেয়াদব।", "উফ।", "থামো।"] },
    chaseWon: { en: ["fine. take it.", "ugh. here.", "you win. this time."], bl: ["thik ache. nao.", "dhur. nao.", "tumi jitle. eibar."], bn: ["ঠিক আছে। নাও।", "ধুর। নাও।", "তুমি জিতলে। এবার।"] },
    chaseLost: { en: ["keeping it.", "too slow.", "it's in my nest now."], bl: ["eta rekhe dilam.", "onek slow.", "eta ekhon amar basay."], bn: ["এটা রেখে দিলাম।", "অনেক ধীর।", "এটা এখন আমার বাসায়।"] },
    warn: { en: ["{n} minutes till I eat this.", "getting hungry. {n} minutes."], bl: ["{n} minute pore eta khabo.", "khide pacche. {n} minute."], bn: ["{n} মিনিট পরে এটা খাব।", "খিদে পাচ্ছে। {n} মিনিট।"] },
    burp: { en: ["burp.", "delicious.", "all gone."], bl: ["dhekur.", "moja.", "shesh."], bn: ["ঢেকুর।", "মজা।", "শেষ।"] },
    holding: { en: ["…", "really?", "I'm watching."], bl: ["…", "sotti?", "dekhchi."], bn: ["…", "সত্যি?", "দেখছি।"] },
    letGo: { en: ["thought so.", "good choice."], bl: ["bhebechilam.", "bhalo siddhanto."], bn: ["ভেবেছিলাম।", "ভালো সিদ্ধান্ত।"] },
    escaped: { en: ["fine. I'll remember this.", "go. I'm judging."], bl: ["thik ache. mone rakhbo.", "jao. ami judge korchi."], bn: ["ঠিক আছে। মনে রাখব।", "যাও। আমি দেখছি।"] },
    yawn: { en: ["*yawn*", "it's late.", "bed. now."], bl: ["*hai*", "onek raat.", "ghumao. ekhon."], bn: ["*হাই*", "অনেক রাত।", "ঘুমাও। এখন।"] },
    morning: { en: ["you slept. here.", "good morning. for you.", "look what I found."], bl: ["tumi ghumiyecho. nao.", "shubho shokal. tomar jonno.", "dekho ki pelam."], bn: ["তুমি ঘুমিয়েছ। নাও।", "শুভ সকাল। তোমার জন্য।", "দেখো কী পেলাম।"] },
    stamp: { en: ["binding."], bl: ["pakka."], bn: ["পাক্কা।"] },
    goodChoice: { en: ["good choice."], bl: ["bhalo siddhanto."], bn: ["ভালো সিদ্ধান্ত।"] },
    working: { en: ["working, I see.", "very busy. very important.", "I'll be quiet. mostly."], bl: ["kaj korcho, dekhchi.", "onek busy. onek important.", "chup thakbo. mostly."], bn: ["কাজ করছো, দেখছি।", "অনেক ব্যস্ত। অনেক জরুরি।", "চুপ থাকব। বেশিরভাগ।"] },
    calm: { en: ["take your time.", "I trust you. a bit.", "just keeping you company."], bl: ["shomoy nao.", "tomake bishshash kori. ektu.", "shudhu shonge achi."], bn: ["সময় নাও।", "তোমাকে বিশ্বাস করি। একটু।", "শুধু সঙ্গে আছি।"] },
    // from Lines.kt nudge(minutes)
    nudge: {
      en: ["{n} minutes.", "still here.", "tap tap. {n} minutes.", "you've been at this {n} minutes.", "hello? {n} minutes.", "I'm not leaving."],
      bl: ["{n} minute.", "ekhono achi.", "tak tak. {n} minute.", "{n} minute dhore cholche.", "hello? {n} minute.", "ami jabo na."],
      bn: ["{n} মিনিট।", "এখনো আছি।", "ঠক ঠক। {n} মিনিট।", "{n} মিনিট ধরে চলছে।", "হ্যালো? {n} মিনিট।", "আমি যাব না।"],
    },
  };
  const FIXED = {
    kaa: { en: "KAA!", bl: "KAA!", bn: "কা!" },
    chomp: { en: "CHOMP.", bl: "CHOMP.", bn: "কচ।" },
    snore: { en: "zzz", bl: "zzz", bn: "zzz" },
    asleep: { en: "Kaak is full. Back in {n} min.", bl: "Kaak er pet bhora. {n} minute pore.", bn: "কাকের পেট ভরা। {n} মিনিট পরে।" },
    ate: { en: "He ate your feed app.", bl: "O tomar feed app kheye feleche.", bn: "সে তোমার ফিড অ্যাপ খেয়ে ফেলেছে।" },
    hold: { en: "Hold Kaak for 5 seconds to go in anyway", bl: "Tobuo dhukte Kaak ke 5 second chepe dhoro", bn: "তবুও ঢুকতে কাককে ৫ সেকেন্ড চেপে ধরো" },
    detours: { en: "Kaak's full. Try one of these:", bl: "Kaak er pet bhora. Egulor ekta koro:", bn: "কাকের পেট ভরা। এগুলোর একটা করো:" },
    worth: { en: "Was that worth it?", bl: "Eta ki worth chilo?", bn: "এটা কি দরকার ছিল?" },
    moodQ: { en: "Why are you scrolling?", bl: "Keno scroll korcho?", bn: "কেন স্ক্রল করছো?" },
    extra: { en: "EXTRA! EXTRA!", bl: "EXTRA! EXTRA!", bn: "গরম খবর!" },
    tapHint: { en: "Tap Kaak 5 times to get it back.", bl: "Ferot pete Kaak ke 5 bar tap koro.", bn: "ফেরত পেতে কাককে ৫ বার ট্যাপ করো।" },
    knowHow: { en: "Now you know how this works.", bl: "Ekhon tumi jano kivabe cholbe.", bn: "এখন তুমি জানো কীভাবে চলবে।" },
    nest: { en: "{n} things. all mine.", bl: "{n} ta jinish. shob amar.", bn: "{n}টা জিনিস। সব আমার।" },
  };
  const DEFAULT_ARGS = { sit: 40, warn: 5, asleep: 14, nest: 0 };
  const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
  function fill(s, arg, key, lang) {
    if (typeof s !== "string" || s.indexOf("{n}") < 0) return s;
    let n = arg != null ? arg : DEFAULT_ARGS[key] != null ? DEFAULT_ARGS[key] : "";
    n = String(n);
    if (lang === "bn") n = n.replace(/[0-9]/g, d => BN_DIGITS[+d]);
    return s.replace(/\{n\}/g, n);
  }
  /** A lineFn(key, n?) over LINES in one language; never repeats the last pick of a key. */
  function makeLineFn(lang) {
    lang = lang || "en";
    const last = {};
    return function (key, arg) {
      const set = LINES[key];
      if (!set) return FIXED[key] ? fill(FIXED[key][lang] || FIXED[key].en, arg, key, lang) : null;
      let pool = set[lang] || set.en;
      if (arg == null && DEFAULT_ARGS[key] == null) {
        const plain = pool.filter(s => s.indexOf("{n}") < 0);
        if (plain.length) pool = plain;
      }
      const opts = pool.length > 1 ? pool.filter(s => s !== last[key]) : pool;
      const pick = opts[Math.floor(Math.random() * opts.length)] || pool[0];
      last[key] = pick;
      return fill(pick, arg, key, lang);
    };
  }
  /** A fixedFn(key, n?) over FIXED in one language. */
  function makeFixedFn(lang) {
    lang = lang || "en";
    return function (key, arg) {
      const f = FIXED[key];
      return f ? fill(f[lang] || f.en, arg, key, lang) : null;
    };
  }

  // ====================================================================
  // Crow painter (port of CrowPainter.kt, Kaak v2)
  // ====================================================================
  const P = (x, y, o) => Object.assign({
    x, y, facing: -1, headTilt: 0, squash: 1, wing: 0, bob: 0, legPhase: 0,
    eyeOpen: 1, scale: 1, roll: 0, beakOpen: 0, fat: 0,
    brow: 0, lid: 0.32, look: 0.4, pupil: 1, tuft: 0, scarf: 0,
  }, o || {});
  const withP = (p, o) => Object.assign({}, p, o);

  const K = {
    ink: "#16161C", wingC: "#262634", sheen: "#5560A8", grey: "#83838E", greyLite: "#A3A3AD",
    beak: "#0F0F14", beakHi: "#3A3A46", mouth: "#6A1F2A", tongue: "#E07A8A",
    red: "#D9412E", white: "#FFFFFF", leg: "#2B2B33", brow: "#8E8E99", gold: "#E8B931",
  };
  const PATHS = {
    tail1: "M -20 -28 C -30 -33 -42 -35 -51 -32 C -44 -27 -32 -24 -20 -23 Z",
    tail2: "M -20 -26 C -32 -27 -45 -25 -52 -21 C -43 -18 -30 -19 -19 -21 Z",
    tail3: "M -20 -23 C -30 -21 -40 -16 -46 -10 C -36 -11 -27 -15 -18 -19 Z",
    body: "M 8 -52 C 28 -50 32 -24 16 -12 C 6 -5 -14 -7 -24 -19 C -32 -30 -22 -52 8 -52 Z",
    sheen: "M -19 -38 C -12 -48 0 -52 10 -51",
    shawl: "M 0 -58 C 18 -62 32 -50 30 -36 C 28 -26 18 -24 12 -30 C 6 -36 -6 -42 0 -58 Z",
    band: "M 2 -51 C 12 -47 22 -45 31 -47 L 32 -39.5 C 22 -37.5 12 -38.5 1 -43.5 Z",
    bandStripe1: "M 2 -48.6 C 12 -44.6 22 -42.6 31.4 -44.6",
    bandStripe2: "M 1.5 -45.8 C 12 -41.6 22 -40 31.7 -42",
    scarfA: "M 0 -48 C -8 -49 -15 -47 -21 -42 L -18 -37.5 C -12 -41 -6 -43.5 0 -44.5 Z",
    scarfB: "M 0 -46 C -6 -42 -9 -36 -11 -28 L -6.5 -28.5 C -5 -35 -2.5 -40 1.5 -43.5 Z",
    wing: "M 6 -46 C -8 -47 -22 -38 -30 -27 L -38 -22 L -29 -24.5 L -36 -16.5 L -27 -21 L -31 -12.5 L -19 -20 C -8 -26 2 -34 6 -46 Z",
    wingLine1: "M -2 -42 C -10 -38 -18 -31 -24 -24",
    wingLine2: "M 2 -37 C -6 -32 -12 -27 -17 -22",
    headSheen: "M 10 -73 C 14 -79 22 -81 28 -79",
    upper: "M 34 -71.5 C 40 -72 44 -71 46 -70 L 48.2 -67 L 50.6 -69 C 56 -67 61 -64 65.5 -60.5 L 36 -59.5 Z",
    beakHi: "M 37 -69 C 43 -69.5 46 -68.6 47 -68",
    lower: "M 36 -59.5 L 60.5 -59 C 54 -55.3 46 -53.3 37 -53 Z",
    mouth: "M 36 -61 L 56 -59.6 L 36.5 -55.5 Z",
    feather: "M 0 0 C -2.6 -6 -1.6 -11.5 2 -15 C 4.6 -10.5 4.2 -5 0 0 Z",
  };
  let p2dCache = null; // built on first draw, so the file also loads where Path2D is missing
  function getPaths() {
    if (!p2dCache) { p2dCache = {}; for (const k in PATHS) p2dCache[k] = new Path2D(PATHS[k]); }
    return p2dCache;
  }
  const HEAD = { x: 22, y: -64, r: 16.5 }, EYE = { x: 28.5, y: -66, r: 6.3 };
  const TUFT = [[11, -74.5, -0.7], [15.2, -77, -0.32], [19.6, -78, 0.04]];
  const DEFAULT_UNIT = 0.95; // one dp = 1 CSS px

  function drawCrow(c, p, unit, glassesOn) {
    if (unit == null) unit = DEFAULT_UNIT;
    const P2D = getPaths();
    if (glassesOn && !p.glasses) p = Object.assign({}, p, { glasses: true });
    const T = (fn) => { c.save(); fn(); c.restore(); };
    const rot = (px, py, a) => { c.translate(px, py); c.rotate(a); c.translate(-px, -py); };
    c.save();
    c.translate(p.x, p.y + p.bob);
    if (p.roll) { const piv = -34 * unit * p.scale; c.translate(0, piv); c.rotate(p.roll * Math.PI / 180); c.translate(0, -piv); }
    const sx = unit * p.scale * (1 + (1 - p.squash) * 0.5), sy = unit * p.scale * p.squash;
    c.scale(p.facing * sx, sy);
    c.lineJoin = "round"; c.lineCap = "round";
    const f = 1 + p.fat * 0.3;
    const legSwing = Math.sin(p.legPhase) * 4;
    const legs = [[-4, -12, -6 + legSwing], [6, -12, 8 - legSwing]];
    const tuftA = p.tuft, scarfA = p.scarf;

    // ---- pass 1: white die-cut sticker outline
    const OUT = 6;
    c.strokeStyle = K.white; c.fillStyle = K.white;
    legs.forEach(([hx, hy, fx]) => { c.lineWidth = 3.2 + OUT; c.beginPath(); c.moveTo(hx, hy); c.lineTo(fx, 0); c.stroke();
      c.lineWidth = 2.2 + OUT; c.beginPath(); c.moveTo(fx, 0); c.lineTo(fx + 6, 0.6); c.moveTo(fx, 0); c.lineTo(fx - 3.5, 0.6); c.stroke(); });
    c.lineWidth = OUT;
    T(() => { rot(-20, -24, tuftA * 0.4); ["tail1", "tail2", "tail3"].forEach(k => { c.stroke(P2D[k]); c.fill(P2D[k]); }); });
    T(() => { c.translate(-2, -30); c.scale(f, f); c.translate(2, 30); c.stroke(P2D.body); c.fill(P2D.body); });
    T(() => { rot(0, -46, scarfA); c.stroke(P2D.scarfA); c.fill(P2D.scarfA); });
    T(() => { rot(0, -46, scarfA * 1.35); c.stroke(P2D.scarfB); c.fill(P2D.scarfB); });
    T(() => { rot(2, -42, p.wing * 1.35); c.stroke(P2D.wing); c.fill(P2D.wing); });
    T(() => {
      rot(14, -46, p.headTilt);
      c.beginPath(); c.arc(HEAD.x, HEAD.y, HEAD.r, 0, Math.PI * 2); c.stroke(); c.fill();
      TUFT.forEach(([tx, ty, a]) => T(() => { c.translate(tx, ty); c.rotate(a + tuftA); c.scale(0.85, 0.85); c.stroke(P2D.feather); c.fill(P2D.feather); }));
      T(() => { rot(36, -59.5, -p.beakOpen * 0.42); c.stroke(P2D.upper); c.fill(P2D.upper); });
      T(() => { rot(36, -59.5, p.beakOpen * 0.38); c.stroke(P2D.lower); c.fill(P2D.lower); });
    });

    // ---- pass 2: colour
    legs.forEach(([hx, hy, fx]) => { c.strokeStyle = K.leg; c.lineWidth = 3.2; c.beginPath(); c.moveTo(hx, hy); c.lineTo(fx, 0); c.stroke();
      c.lineWidth = 2.2; c.beginPath(); c.moveTo(fx, 0); c.lineTo(fx + 6, 0.6); c.moveTo(fx, 0); c.lineTo(fx + 4.5, 2.2); c.moveTo(fx, 0); c.lineTo(fx - 3.5, 0.6); c.stroke(); });
    T(() => { rot(-20, -24, tuftA * 0.4); c.fillStyle = K.ink; ["tail1", "tail2", "tail3"].forEach(k => c.fill(P2D[k])); c.strokeStyle = K.sheen; c.globalAlpha = 0.5; c.lineWidth = 1; c.stroke(P2D.tail2); });
    T(() => {
      c.translate(-2, -30); c.scale(f, f); c.translate(2, 30);
      c.fillStyle = K.ink; c.fill(P2D.body);
      c.strokeStyle = K.sheen; c.globalAlpha = 0.6; c.lineWidth = 2.6; c.stroke(P2D.sheen);
    });
    // scarf tails (behind the head, in front of the body)
    [["scarfA", 1], ["scarfB", 1.35]].forEach(([k, m]) => T(() => {
      rot(0, -46, scarfA * m); c.fillStyle = K.red; c.fill(P2D[k]);
      c.save(); c.clip(P2D[k]); c.strokeStyle = K.white; c.lineWidth = 1.3;
      for (let i = -24; i < 4; i += 4.2) { c.beginPath(); c.moveTo(i, -52); c.lineTo(i + 6, -26); c.stroke(); }
      c.restore();
    }));
    T(() => {
      rot(2, -42, p.wing * 1.35);
      if (p.wing > 0.25) { c.translate(2, -42); c.scale(1 + p.wing * 0.12, 1); c.translate(-2, 42); }
      c.fillStyle = K.wingC; c.fill(P2D.wing);
      c.strokeStyle = K.sheen; c.globalAlpha = 0.7; c.lineWidth = 1.3; c.stroke(P2D.wingLine1); c.stroke(P2D.wingLine2);
    });
    T(() => {
      rot(14, -46, p.headTilt);
      c.fillStyle = K.grey; c.fill(P2D.shawl);
      // gamcha band with checks
      c.fillStyle = K.red; c.fill(P2D.band);
      T(() => { c.clip(P2D.band); c.strokeStyle = K.white; c.lineWidth = 1.2;
        c.stroke(P2D.bandStripe1); c.stroke(P2D.bandStripe2);
        for (let i = 4; i < 32; i += 5) { c.beginPath(); c.moveTo(i, -52); c.lineTo(i + 1.5, -36); c.stroke(); } });
      c.fillStyle = K.red; c.beginPath(); c.arc(0.5, -46, 3.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = K.white; c.lineWidth = 1; c.beginPath(); c.arc(0.5, -46, 1.8, 0, Math.PI * 2); c.stroke();
      // head
      c.fillStyle = K.ink; c.beginPath(); c.arc(HEAD.x, HEAD.y, HEAD.r, 0, Math.PI * 2); c.fill();
      TUFT.forEach(([tx, ty, a]) => T(() => { c.translate(tx, ty); c.rotate(a + tuftA); c.scale(0.85, 0.85); c.fillStyle = K.ink; c.fill(P2D.feather); }));
      c.strokeStyle = K.sheen; c.globalAlpha = 0.65; c.lineWidth = 2.2; c.stroke(P2D.headSheen); c.globalAlpha = 1;
      // beak
      if (p.beakOpen > 0.03) { c.fillStyle = K.mouth; c.fill(P2D.mouth); c.fillStyle = K.tongue; c.beginPath(); c.ellipse(44, -57.8, 4.5, 1.6, 0.05, 0, Math.PI * 2); c.fill(); }
      T(() => { rot(36, -59.5, p.beakOpen * 0.38); c.fillStyle = K.beak; c.fill(P2D.lower); });
      T(() => { rot(36, -59.5, -p.beakOpen * 0.42); c.fillStyle = K.beak; c.fill(P2D.upper);
        c.strokeStyle = K.beakHi; c.lineWidth = 1.3; c.stroke(P2D.beakHi); });
      if (p.beakOpen < 0.03) { c.strokeStyle = "#2A2A33"; c.lineWidth = 1.1; c.beginPath(); c.moveTo(36.5, -59.5); c.lineTo(60, -59.2); c.stroke(); }
      // eye
      const ex = EYE.x, ey = EYE.y, er = EYE.r;
      if (p.eyeOpen < 0) {
        c.strokeStyle = K.brow; c.lineWidth = 1.8; c.beginPath(); c.arc(ex, ey - 1.5, er * 0.8, 0.25, Math.PI - 0.25); c.stroke();
      } else {
        c.fillStyle = K.white; c.beginPath(); c.arc(ex, ey, er, 0, Math.PI * 2); c.fill();
        const pr = 3.3 * p.pupil, px = ex + 1.3 + p.look * 1.7, py = ey + 0.4;
        c.fillStyle = "#000"; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
        c.fillStyle = K.white; c.beginPath(); c.arc(px - pr * 0.35, py - pr * 0.45, Math.max(0.8, pr * 0.3), 0, Math.PI * 2); c.fill();
        const lid = Math.max(0, Math.min(1, Math.max(p.lid, 1 - p.eyeOpen)));
        if (lid > 0.01) T(() => {
          c.beginPath(); c.arc(ex, ey, er + 0.3, 0, Math.PI * 2); c.clip();
          const edge = ey - er + lid * er * 2.05;
          c.fillStyle = K.ink; c.beginPath(); c.moveTo(ex - er - 1, ey - er - 1); c.lineTo(ex + er + 1, ey - er - 1);
          c.lineTo(ex + er + 1, edge - 1.2); c.quadraticCurveTo(ex, edge + 1.4, ex - er - 1, edge - 0.6); c.closePath(); c.fill();
          c.strokeStyle = "#000"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(ex - er - 1, edge - 0.6); c.quadraticCurveTo(ex, edge + 1.4, ex + er + 1, edge - 1.2); c.stroke();
        });
      }
      // the grumpy grey eyebrow does the acting
      const b = p.brow;
      c.strokeStyle = K.brow; c.lineWidth = 3.2;
      c.beginPath(); c.moveTo(20.5, -74.5 - b * 1.6); c.quadraticCurveTo(27.5, -76.5 - b * 2.6, 35, -73.8 - b * 3.8 + (b < 0 ? -b * 1.2 : 0)); c.stroke();
      if (p.glasses) {
        c.strokeStyle = K.gold; c.lineWidth = 1.8; c.fillStyle = "rgba(191,227,255,0.22)";
        c.beginPath(); c.arc(ex + 0.5, ey, er + 2.2, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(ex - er - 1.6, ey - 0.5); c.lineTo(9, -63); c.stroke();
      }
    });
    c.restore();
  }

  function beakTip(p, unit) {
    if (unit == null) unit = DEFAULT_UNIT;
    const dx = 64 - 14, dy = -60 + 46;
    const cs = Math.cos(p.headTilt), sn = Math.sin(p.headTilt);
    const lx = 14 + dx * cs - dy * sn, ly = -46 + dx * sn + dy * cs;
    const sx = unit * p.scale * (1 + (1 - p.squash) * 0.5);
    return { x: p.x + p.facing * sx * lx, y: p.y + p.bob + unit * p.scale * p.squash * ly };
  }
  function headTopY(p, unit) { if (unit == null) unit = DEFAULT_UNIT; return p.y + p.bob - 92 * unit * p.scale * p.squash; }
  function crowBounds(p, unit) {
    if (unit == null) unit = DEFAULT_UNIT;
    const sx = unit * p.scale * (1 + (1 - p.squash) * 0.5), sy = unit * p.scale * p.squash;
    const a = p.x - 54 * sx * p.facing, b2 = p.x + 66 * sx * p.facing;
    return { l: Math.min(a, b2), t: p.y - 90 * sy, r: Math.max(a, b2), b: p.y + 4 * sy };
  }

  // ====================================================================
  // Small drawing helpers
  // ====================================================================
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function wrapText(c, text, x, y, maxW, lh) {
    const words = String(text).split(" "); let lineStr = ""; let yy = y;
    words.forEach(w => {
      const test = lineStr ? lineStr + " " + w : w;
      if (c.measureText(test).width > maxW && lineStr) { c.fillText(lineStr, x, yy); lineStr = w; yy += lh; }
      else lineStr = test;
    });
    if (lineStr) c.fillText(lineStr, x, yy);
    return yy;
  }
  function fitText(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 3 && c.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  function isLightColor(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return false;
    let h = m[1]; if (h.length === 3) h = h.split("").map(x => x + x).join("");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170;
  }
  /**
   * The site tile Kaak steals or sleeps on: the site's initial on its brand colour.
   * (x, y) is the tile's centre. tile = {label, color, ink?, font?}.
   */
  function drawSiteTile(c, x, y, size, tile, alpha) {
    tile = tile || DEFAULT_TILE;
    const a = alpha == null ? 1 : alpha;
    if (a <= 0 || size <= 0) return;
    const r = size / 2, color = tile.color || DEFAULT_TILE.color;
    const label = String(tile.label == null ? DEFAULT_TILE.label : tile.label).slice(0, 2);
    c.save();
    c.globalAlpha *= Math.min(1, a);
    c.fillStyle = color; roundRect(c, x - r, y - r, size, size, size * 0.24); c.fill();
    const g = c.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, "rgba(255,255,255,0.2)"); g.addColorStop(0.55, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,0.14)");
    c.fillStyle = g; roundRect(c, x - r, y - r, size, size, size * 0.24); c.fill();
    c.fillStyle = tile.ink || (isLightColor(color) ? "#19191D" : "#FFFFFF");
    c.font = `800 ${size * (label.length > 1 ? 0.42 : 0.56)}px ${tile.font || DEFAULT_FONT}`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(label, x, y + size * 0.03);
    c.restore();
  }
  function drawPaper(c, w, h) { c.fillStyle = "#FFFDF6"; c.fillRect(0, 0, w, h); }
  function drawPaperItem(c, x, y, a, dp) {
    const DP = dp == null ? 1 : dp;
    c.save(); c.globalAlpha = a; c.translate(x, y); c.rotate(-8 * Math.PI / 180);
    c.fillStyle = "#F3EEE2"; c.fillRect(-20 * DP, -13 * DP, 40 * DP, 26 * DP);
    c.fillStyle = "#2A2A2A"; c.fillRect(-16 * DP, -10 * DP, 32 * DP, 4 * DP);
    for (let i = 0; i < 4; i++) c.fillRect(-16 * DP, -1 * DP + i * 3.5 * DP, 32 * DP, 1.1 * DP);
    c.restore();
  }

  // ---- the nest (port of NestView.kt)
  const LOOT = ["bottle cap", "coin", "key", "broken watch", "feather", "pencil stub", "marble", "tea cup", "book page", "guitar pick", "candle", "tangled earphones", "golden spoon", "button", "seed", "crayon"];
  function drawLoot(c, name, x, y, s, i) {
    c.save(); c.translate(x, y); c.rotate(((i * 47) % 60 - 30) * Math.PI / 180);
    const circ = (cx, cy, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); };
    switch (name) {
      case "bottle cap": circ(0, 0, 7 * s, "#C0392B"); circ(0, 0, 4.5 * s, "#E57368"); break;
      case "coin": circ(0, 0, 7 * s, "#E8B931"); c.strokeStyle = "#B8891A"; c.lineWidth = 1.2 * s; c.beginPath(); c.arc(0, 0, 5 * s, 0, Math.PI * 2); c.stroke(); break;
      case "key": circ(-6 * s, 0, 4.5 * s, "#C9A23A"); c.fillRect(-3 * s, -1.3 * s, 12 * s, 2.6 * s); c.fillRect(5 * s, 0, 2 * s, 4 * s); circ(-6 * s, 0, 1.8 * s, "#3B2A1C"); break;
      case "broken watch": c.fillStyle = "#8A8F96"; c.fillRect(-3 * s, -11 * s, 6 * s, 22 * s); circ(0, 0, 6 * s, "#D5D8DC"); c.strokeStyle = "#222"; c.lineWidth = s; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -4 * s); c.moveTo(-4 * s, -3 * s); c.lineTo(2 * s, 4 * s); c.stroke(); break;
      case "feather": c.fillStyle = "#26262B"; c.beginPath(); c.ellipse(0, 0, 10 * s, 2.5 * s, 0, 0, Math.PI * 2); c.fill(); break;
      case "pencil stub": c.fillStyle = "#F2C14E"; c.fillRect(-7 * s, -2 * s, 12 * s, 4 * s); c.fillStyle = "#E58FA0"; c.fillRect(-9 * s, -2 * s, 2 * s, 4 * s); c.fillStyle = "#E8D2A6"; c.beginPath(); c.moveTo(5 * s, -2 * s); c.lineTo(9 * s, 0); c.lineTo(5 * s, 2 * s); c.fill(); break;
      case "marble": circ(0, 0, 5.5 * s, "#3F7FD6"); circ(-2 * s, -2 * s, 1.6 * s, "rgba(255,255,255,0.8)"); break;
      case "tea cup": c.fillStyle = "#F4F1EA"; roundRect(c, -6 * s, -4 * s, 12 * s, 9 * s, 3 * s); c.fill(); c.strokeStyle = "#F4F1EA"; c.lineWidth = 1.6 * s; c.beginPath(); c.arc(7 * s, 0, 2.5 * s, 0, Math.PI * 2); c.stroke(); c.fillStyle = "#9A5B2E"; c.fillRect(-5 * s, -4 * s, 10 * s, 1.5 * s); break;
      case "book page": c.fillStyle = "#F3EEDC"; c.fillRect(-6 * s, -8 * s, 12 * s, 16 * s); c.fillStyle = "#9A9384"; for (let k = 0; k < 5; k++) c.fillRect(-4 * s, -5 * s + k * 3 * s, 8 * s, 0.8 * s); break;
      case "guitar pick": c.fillStyle = "#E67E22"; c.beginPath(); c.moveTo(-6 * s, -5 * s); c.quadraticCurveTo(0, -8 * s, 6 * s, -5 * s); c.lineTo(0, 7 * s); c.fill(); break;
      case "candle": c.fillStyle = "#F8F4E8"; c.fillRect(-2.5 * s, -4 * s, 5 * s, 12 * s); c.fillStyle = "#FFB43B"; c.beginPath(); c.ellipse(0, -7 * s, 2 * s, 3 * s, 0, 0, Math.PI * 2); c.fill(); break;
      case "tangled earphones": c.strokeStyle = "#F4F4F4"; c.lineWidth = 1.2 * s; c.beginPath(); c.moveTo(-9 * s, 0); c.bezierCurveTo(-3 * s, -10 * s, 6 * s, 9 * s, 8 * s, -3 * s); c.bezierCurveTo(9 * s, -8 * s, -2 * s, -6 * s, 0, 5 * s); c.stroke(); circ(-9 * s, 0, 2.2 * s, "#F4F4F4"); circ(0, 5 * s, 2.2 * s, "#F4F4F4"); break;
      case "golden spoon": c.fillStyle = "#F0C330"; c.beginPath(); c.ellipse(-5 * s, 0, 4 * s, 4 * s, 0, 0, Math.PI * 2); c.fill(); c.fillRect(-2 * s, -1 * s, 12 * s, 2 * s); break;
      case "button": circ(0, 0, 5.5 * s, "#7D5BA6"); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => circ(a * 1.6 * s, b * 1.6 * s, 0.9 * s, "#3D2A55")); break;
      case "crayon": c.fillStyle = "#2E9E5B"; c.fillRect(-7 * s, -2 * s, 11 * s, 4 * s); c.beginPath(); c.moveTo(4 * s, -2 * s); c.lineTo(8 * s, 0); c.lineTo(4 * s, 2 * s); c.fill(); break;
      default: circ(0, 0, 3 * s, "#8B6B3E");
    }
    c.restore();
  }
  /** Rooftop sunset + nest with `count` loot items, filling w x h. Returns the nest ellipse. */
  function drawNestScene(c, count, W, H) {
    const g = c.createLinearGradient(0, 0, 0, H * 0.7);
    g.addColorStop(0, "#2B2440"); g.addColorStop(1, "#B4583F");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(255,196,120,0.85)"; c.beginPath(); c.arc(W * 0.3, H * 0.4, 34, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#1C1418";
    [[0, 0.5], [0.18, 0.44], [0.36, 0.52], [0.58, 0.4], [0.76, 0.48]].forEach(([x, y], i) => c.fillRect(W * x, H * y, W * (0.2 + (i % 2) * 0.04), H));
    c.fillStyle = "#6E6A66"; c.fillRect(0, H * 0.74, W, H); c.fillStyle = "#57534F"; c.fillRect(0, H * 0.74, W, H * 0.02);
    const cx = W * 0.46, cy = H * 0.7, rx = W * 0.32, ry = rx * 0.36;
    c.fillStyle = "#3B2A1C"; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const browns = ["#7A5A3A", "#5E432A", "#9C7650", "#6B4E31"];
    c.lineCap = "round";
    for (let k = 0; k < 90; k++) {
      const a = rnd() * Math.PI * 2, r = 0.82 + rnd() * 0.3;
      const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r, len = 11 + rnd() * 14;
      const t = a + Math.PI / 2 + (rnd() - 0.5) * 0.8;
      c.strokeStyle = browns[Math.floor(rnd() * 4)]; c.lineWidth = 1.4 + rnd() * 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(t) * len, y + Math.sin(t) * len * 0.5); c.stroke();
    }
    for (let i = 0; i < count; i++) {
      const a = i * 2.399963, r = Math.sqrt((i + 0.5) / 24);
      drawLoot(c, LOOT[(i * 7) % LOOT.length], cx + Math.cos(a) * rx * 0.72 * r, cy + Math.sin(a) * ry * 0.72 * r - 3, 0.9, i);
    }
    return { cx, cy, rx, ry };
  }

  // ====================================================================
  // Stage (port of KaakView.kt)
  // ====================================================================
  const STILL = 0, FLAP = 1, WALK = 2;
  const IDLE_MS = 250;  // perched idle: ~4 fps
  const SLEEP_MS = 66;  // asleep (zzz drifting): ~15 fps

  class Stage {
    constructor(canvas, opts) {
      opts = opts || {};
      this.canvas = canvas;
      this.c = canvas.getContext("2d");
      this.DP = opts.dp != null ? +opts.dp : 1.0;
      this.UNIT = this.DP * 0.95; // crow units, same ratio as the app
      this.dprOpt = opts.dpr;
      this.reduceMotion = opts.reduceMotion != null ? !!opts.reduceMotion : prefersReducedMotion();
      this.font = opts.font || DEFAULT_FONT;
      this.lineFn = opts.lineFn || makeLineFn("en");
      this.fixedFn = opts.fixedFn || makeFixedFn("en");
      this._lineFallback = makeLineFn("en"); this._fixedFallback = makeFixedFn("en");
      this.jumpLevel = opts.jumpLevel || "MEDIUM";
      this.bg = opts.bg || "none";
      this.topInset = (opts.topInset != null ? opts.topInset : 8) * this.DP;
      this.tile = Object.assign({}, DEFAULT_TILE, opts.tile || {});
      this.onIdle = opts.onIdle || null;
      this.onWantsPointer = opts.onWantsPointer || null;
      this.col = null;
      this.token = 0;
      this.running = false; this.raf = 0; this.timer = 0; this.blank = false; this.wasBusy = false; this.lastWants = false;
      this.hiddenAt = 0; this._detach = [];
      this._tick = this._tick.bind(this);
      this._onVis = this._onVis.bind(this);
      this.W = 0; this.H = 0;
      // size the canvas's CSS box only if nobody else does (no inline width, or we set it before)
      const st = canvas.style, ds = canvas.dataset;
      this.ownStyle = opts.setStyle != null ? !!opts.setStyle : !!(st && (!st.width || (ds && ds.kaakSized === "1")));
      this.reset();
      this.glasses = !!opts.glasses; this.calm = !!opts.calm;
      const w = opts.width != null ? opts.width : (canvas.clientWidth || root.innerWidth || 300);
      const h = opts.height != null ? opts.height : (canvas.clientHeight || root.innerHeight || 600);
      this.resize(w, h);
      if (opts.autoStart !== false) this.start();
    }

    // ---- lines
    line(key, arg) {
      let s = null;
      try { s = this.lineFn(key, arg); } catch (e) { s = null; }
      if (s == null || s === "") s = this._lineFallback(key, arg);
      return s == null ? "" : String(s);
    }
    fixed(key, arg) {
      let s = null;
      try { s = this.fixedFn(key, arg); } catch (e) { s = null; }
      if (s == null || s === "") s = this._fixedFallback(key, arg);
      return s == null ? "" : String(s);
    }

    // ---- state
    reset() {
      this.token++;
      this.queue = []; this.seg = null; this.segStart = 0;
      this.pose = P(-9999, -9999); this.from = this.pose;
      this.perched = false; this.sleeping = false;
      this.subtitle = null; this.subtitleUntil = 0;
      this.ripple = null; this.splatObj = null; this.carry = null; this.tileShown = null; this.tileAt = null;
      this.dropped = []; this.feathers = []; this.crack = null; this.bigText = null;
      this.shakeUntil = 0; this.shakeAmp = 0; this.chase = null; this.footprints = [];
      this.dim = 0; this.dimTarget = 0; this.blanketV = 0; this.blanketTarget = 0; this.eatenV = 0; this.eatenTarget = 0;
      this.hold = -1; this.holdStart = 0; this.holdMs = 5000; this.holdDone = null; this.touchDown = null;
      this.waiting = false; this.lastFrame = 0; this.idleSince = now(); this.fadeToBlack = 0;
      this.custom = null; this.calm = false; this.glasses = false;
      this.underlay = null; this.overlay = null; this.onEscape = null;
      this.tuftX = 0; this.tuftV = 0; this.scarfX = 0; this.scarfV = 0; this.lastPx = NaN; this.lastPy = NaN;
      this.vx = 0; this.vy = 0; this.flapping = false; this.puffs = []; this.flashUntil = 0; this.flashF = null;
      this.shakeTotal = 550; this.flickerFrom = -1; this.flickerUntil = 0; this.zoomUntil = 0; this.zoomMs = 300; this.zoomAt = null;
      this.whiteAt = -1; this.whiteMs = 0; this.vignetteAt = -1; this.vignetteMs = 0; this.shards = []; this.smearFrom = null;
      this.kick();
    }
    /** Remove Kaak and everything he left; keeps glasses/calm modes, the default tile and callbacks. */
    clear() {
      const g = this.glasses, calm = this.calm;
      this.reset();
      this.glasses = g; this.calm = calm;
      this.blankCanvas();
      this._syncPointer();
    }
    /** Leftovers from an interrupted performance never survive into the next one (KaakView.resetTransient). */
    resetTransient() {
      this.chase = null; this.carry = null; this.tileShown = null; this.tileAt = null;
      this.eatenV = 0; this.eatenTarget = 0;
      if (this.hold >= 0) { this.hold = -1; this.holdStart = 0; this.holdDone = null; }
    }
    blankCanvas() {
      const c = this.c;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.blank = true;
    }

    // ---- size
    resize(width, height) {
      const oldW = this.W, oldH = this.H;
      const oldPerch = oldW ? this.perch() : null;
      this.W = Math.max(1, +width || 1); this.H = Math.max(1, +height || 1);
      this.dpr = Math.min(this.dprOpt || root.devicePixelRatio || 1, 2.5);
      this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
      if (this.ownStyle && this.canvas.style) {
        this.canvas.style.width = this.W + "px"; this.canvas.style.height = this.H + "px";
        if (this.canvas.dataset) this.canvas.dataset.kaakSized = "1";
      }
      if (this.col) this.col = { l: Math.max(0, Math.min(this.col.l, this.W)), r: Math.max(0, Math.min(this.col.r, this.W)) };
      if (oldW && (oldW !== this.W || oldH !== this.H)) this.remap(oldW, oldH, oldPerch);
      this.blank = false;
      this.kick();
    }
    /** Optional: keep Kaak's spots near a content column (e.g. the feed) on wide windows. null = full width. */
    setColumn(left, right) {
      const idleOnPerch = this.perched && !this.seg && !this.queue.length && !this.chase && !this.sleeping && this.hold < 0;
      const old = this.perch();
      this.col = left == null || right == null || right - left < 40 ? null : { l: Math.max(0, left), r: Math.min(this.W, right) };
      if (idleOnPerch && Math.abs(this.pose.x - old.x) < 1 && Math.abs(this.pose.y - old.y) < 1) this.sitNow(this.perch());
      this.kick();
    }
    remap(oldW, oldH, oldPerch) {
      const W = this.W, H = this.H, newPerch = this.perch();
      const mx = x => x < 0 ? x : x > oldW ? W + (x - oldW) : x * W / oldW;
      const my = y => y < 0 ? y : y > oldH ? H + (y - oldH) : y * H / oldH;
      const near = p => oldPerch && Math.abs(p.x - oldPerch.x) < 1 && Math.abs(p.y - oldPerch.y) < 1;
      const pose = p => p && (near(p) ? withP(p, { x: newPerch.x, y: newPerch.y }) : withP(p, { x: mx(p.x), y: my(p.y) }));
      const pt = o => { if (o) { o.x = mx(o.x); o.y = my(o.y); } };
      this.pose = pose(this.pose); this.from = pose(this.from);
      if (this.seg) this.seg = Object.assign({}, this.seg, { to: pose(this.seg.to) });
      this.queue = this.queue.map(s => Object.assign({}, s, { to: pose(s.to) }));
      if (this.chase) { const a = this.chase.area; this.chase.area = { l: mx(a.l), t: my(a.t), r: mx(a.r), b: my(a.b) }; }
      if (this.splatObj) { this.splatObj.cx = mx(this.splatObj.cx); this.splatObj.cy = my(this.splatObj.cy); }
      if (this.tileAt) this.tileAt = { x: mx(this.tileAt.x), y: my(this.tileAt.y) };
      this.dropped.forEach(pt); this.footprints.forEach(pt); this.puffs.forEach(pt); pt(this.ripple); pt(this.smearFrom); pt(this.zoomAt);
      this.lastPx = NaN; this.lastPy = NaN;
    }

    // ---- effects
    dust(p) { const t = now(); for (let i = 0; i < 5; i++) this.puffs.push({ x: p.x, y: p.y, dir: (i - 2) / 2, start: t }); }
    flash(brow, lid, pupil, ms) { this.flashF = { brow, lid, pupil }; this.flashUntil = now() + ms; }
    /** Shake the overlay. Reduced motion caps it at 4 dp and 300 ms. */
    shake(amp, ms) {
      if (this.reduceMotion) { amp = Math.min(amp, 4 * this.DP); ms = Math.min(ms, 300); }
      this.shakeAmp = amp; this.shakeTotal = ms; this.shakeUntil = now() + ms; this.kick();
    }
    buzz(pattern) { try { if (root.navigator && root.navigator.vibrate && !this.reduceMotion) root.navigator.vibrate(pattern); } catch (e) {} }
    setDim(v, instant) { this.dimTarget = Math.max(0, Math.min(0.85, +v || 0)); if (instant) this.dim = this.dimTarget; this.kick(); }
    setBlanket(v, instant) { this.blanketTarget = Math.max(0, Math.min(1, +v || 0)); if (instant) this.blanketV = this.blanketTarget; this.kick(); }
    setEaten(v, instant) { this.eatenTarget = Math.max(0, Math.min(1, +v || 0)); if (instant) this.eatenV = this.eatenTarget; this.kick(); }
    setGlasses(on) { this.glasses = !!on; this.kick(); }
    updateSprings(dt) {
      const px = this.pose.x, py = this.pose.y, UNIT = this.UNIT;
      if (!isNaN(this.lastPx) && dt > 0) {
        this.vx = this.vx * 0.6 + ((px - this.lastPx) / UNIT / dt * 16) * 0.4;
        this.vy = this.vy * 0.6 + ((py - this.lastPy) / UNIT / dt * 16) * 0.4;
      }
      this.lastPx = px; this.lastPy = py;
      if (Math.abs(this.vx) > 400 || Math.abs(this.vy) > 400) { this.vx = 0; this.vy = 0; }
      const f = this.pose.facing, flutter = this.flapping ? Math.sin(now() / 70) * 0.18 : 0;
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      const tt = cl(-this.vx * f * 0.05 - this.vy * 0.03 + flutter, -0.9, 0.9);
      const st = cl(-this.vx * f * 0.07 + this.vy * 0.05 + flutter * 1.5, -1.1, 0.9);
      this.tuftV = (this.tuftV + (tt - this.tuftX) * 0.18) * 0.8; this.tuftX += this.tuftV;
      this.scarfV = (this.scarfV + (st - this.scarfX) * 0.12) * 0.84; this.scarfX += this.scarfV;
    }
    drawSpeedLines(c) {
      const DP = this.DP;
      const sp = Math.hypot(this.vx, this.vy);
      if (!this.flapping || sp < 3) return;
      const b = crowBounds(this.pose, this.UNIT), cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2, w = b.r - b.l, h = b.b - b.t;
      const nx = -this.vx / sp, ny = -this.vy / sp, a = Math.min(1, (sp - 3) / 6);
      c.strokeStyle = `rgba(255,255,255,${a * 0.8})`; c.lineWidth = 2.2 * DP; c.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        const ox = cx + nx * w * 0.45 - ny * i * 12 * DP, oy = cy + ny * h * 0.45 + nx * i * 12 * DP;
        const len = (16 + 8 * (1 - Math.abs(i))) * DP * (0.6 + a * 0.6);
        c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + nx * len, oy + ny * len); c.stroke();
      }
    }
    drawPuffs(c, t) {
      const DP = this.DP;
      this.puffs = this.puffs.filter(p => {
        const k = (t - p.start) / 420; if (k >= 1) return false;
        if (k < 0) return true;
        c.fillStyle = `rgba(244,241,234,${(1 - k) * 0.8})`;
        c.beginPath(); c.arc(p.x + p.dir * (10 + 26 * k) * DP, p.y - (2 + 6 * k) * DP * (1 - Math.abs(p.dir) * 0.4), (3 + 5 * k) * DP * (1 - Math.abs(p.dir) * 0.25), 0, Math.PI * 2); c.fill();
        return true;
      });
    }

    // ---- positions (same ratios as the board; clamped on screen)
    colL() { return this.col ? this.col.l : 0; }
    colR() { return this.col ? this.col.r : this.W; }
    cx(f) { return this.colL() + (this.colR() - this.colL()) * f; }
    /** Shift a pose so the whole crow is on screen (when it fits). */
    fit(p) {
      const b = crowBounds(p, this.UNIT), m = 4 * this.DP, mx = 14 * this.DP, W = this.W, H = this.H;
      let dx = 0, dy = 0;
      // sideways margin is wider: the tail and scarf swing past the body's bounds
      if (b.r - b.l < W - 2 * mx) { if (b.l < mx) dx = mx - b.l; else if (b.r > W - mx) dx = W - mx - b.r; }
      if (b.b - b.t < H - 2 * m) { if (b.t < m) dy = m - b.t; else if (b.b > H - m) dy = H - m - b.b; }
      return dx || dy ? withP(p, { x: p.x + dx, y: p.y + dy }) : p;
    }
    perch() {
      const DP = this.DP, H = this.H;
      return this.calm ? this.fit(P(this.colL() + 58 * DP, H * 0.115, { facing: 1, scale: 0.8 })) : this.fit(P(this.colR() - 54 * DP, H * 0.30));
    }
    offRight() { return P(this.W + 90 * this.DP, this.H * 0.12); }
    offLeft() { return P(-90 * this.DP, this.H * 0.12); }
    rail() { return this.fit(P(this.colR() - 48 * this.DP, this.H * 0.64)); }
    feetFor(cy, scale) { return cy + 32 * this.UNIT * scale; }
    defaultChaseArea() { const H = this.H; return { l: this.cx(0.15), t: H * 0.3, r: this.cx(0.85), b: H * 0.75 }; }
    /** Kaak's current bounding box in canvas CSS px {l, t, r, b} (for a focusable hit target). */
    kaakBounds() { return crowBounds(this.pose, this.UNIT); }
    kaakVisible() { const b = this.kaakBounds(); return b.r > -20 && b.l < this.W + 20 && b.b > -20 && b.t < this.H + 20; }

    // ---- script queue
    push(ms, to, motion, onStart) { this.queue.push({ ms, to, motion: motion || STILL, onStart: onStart || null }); this.kick(); }
    /** Hold the last queued pose for ms, then run fn (which may queue more). */
    wait(ms, fn) {
      const last = this.rest(this.queue.length ? this.queue[this.queue.length - 1].to : this.seg ? this.seg.to : this.pose);
      this.push(ms, last);
      if (fn) this.push(0, last, STILL, fn);
    }
    /** setTimeout that is cancelled by reset()/clear(). */
    later(ms, fn) { const tok = this.token; setTimeout(() => { if (this.token === tok) fn(); }, ms); }
    clearScript() { this.queue = []; if (this.seg) this.pose = this.rest(this.pose); this.seg = null; }
    say(text, ms) { this.subtitle = text; this.subtitleUntil = now() + (ms || 2600); this.kick(); }
    flyInTo(p, ms) {
      if (this.reduceMotion) { // appear in place, no flight
        this.push(0, p, STILL, () => { this.sleeping = false; this.perched = true; });
        this.push(160, p);
        return;
      }
      this.push(0, this.offRight(), STILL, () => { this.sleeping = false; });
      this.push(ms, p, FLAP);
      this.push(170, withP(p, { squash: 0.74, brow: -0.3 }), STILL, () => { this.perched = true; this.dust(p); });
      this.push(220, withP(p, { squash: 1.06 }));
      this.push(160, p);
    }
    hop(p) {
      const DP = this.DP;
      this.push(110, withP(p, { squash: 0.8 })); this.push(150, withP(p, { squash: 1.12, y: p.y - 10 * DP }));
      this.push(110, withP(p, { squash: 0.82 }), STILL, () => this.dust(p)); this.push(140, p);
    }
    returnToPerch() {
      const p = this.perch();
      if (this.reduceMotion) {
        this.push(0, p, STILL, () => { this.perched = true; });
        this.push(200, p);
        return;
      }
      this.push(110, withP(this.rest(this.pose), { squash: 0.78 }));
      this.push(1000, withP(p, { facing: 1 }), FLAP);
      this.push(170, withP(p, { squash: 0.76 }), STILL, () => { this.perched = true; this.dust(p); });
      this.push(200, p);
    }
    peckHit() { this.flash(-0.9, 0.15, 0.9, 220); const t = beakTip(this.pose, this.UNIT); this.ripple = { x: t.x, y: t.y, start: now() }; this.kick(); }
    sitNow(p) { this.pose = p || this.perch(); this.perched = true; this.kick(); }

    // ---- feed performances (milestone 1)
    arrive() {
      this.clearScript(); this.resetTransient();
      const p = this.perch();
      if (!this.perched) this.flyInTo(p, 1300);
      const stare = withP(p, { brow: -0.35, lid: 0.48, look: 1 });
      this.push(500, stare, STILL, () => this.say(this.line("arrive"), 2600));
      this.push(1700, stare);
      this.push(120, withP(stare, { headTilt: -0.2, squash: 1.05 }));
      this.push(110, withP(stare, { headTilt: 0.65, squash: 0.92 }), STILL, () => this.say(this.line("peck"), 2600));
      this.push(160, stare, STILL, () => this.peckHit());
      this.push(110, withP(stare, { headTilt: 0.65, squash: 0.92 }));
      this.push(160, stare, STILL, () => this.peckHit());
      this.push(400, p);
    }
    again(text) {
      this.clearScript(); this.resetTransient();
      const p = this.perch();
      if (!this.perched) this.flyInTo(p, 900); else this.hop(p);
      const meh = withP(p, { headTilt: -0.25, lid: 0.55, brow: 0.25, look: 1 });
      this.push(500, meh, STILL, () => this.say(text || this.line("again"), 2600));
      this.push(1600, meh);
      this.push(300, p);
    }
    /** A small poke between gags (KaakView.nudge). Never interrupts a performance; returns false if it didn't run. */
    nudge(minutes, kind) {
      if (this.seg || this.queue.length || this.chase) return false;
      if (this.sleeping) { this.say(this.fixed("snore"), 1600); return true; }
      this.resetTransient();
      const DP = this.DP;
      const text = this.line("nudge", minutes);
      const p = this.perched ? this.rest(this.pose) : this.perch();
      if (!this.perched) this.flyInTo(p, 900);
      const kinds = ["hop", "peck", "lean", "flap"];
      const k = typeof kind === "number" ? kinds[kind % 4] : kinds.indexOf(kind) >= 0 ? kind : kinds[Math.floor(Math.random() * 4)];
      if (k === "hop") {
        this.hop(p); this.push(500, withP(p, { lid: 0.5, brow: -0.4, look: 1 }), STILL, () => this.say(text, 2200));
      } else if (k === "peck") {
        this.push(110, withP(p, { headTilt: 0.65, squash: 0.92 }), STILL, () => this.say(text, 2200));
        this.push(150, p, STILL, () => this.peckHit());
        this.push(110, withP(p, { headTilt: 0.65, squash: 0.92 }));
        this.push(150, p, STILL, () => this.peckHit());
      } else if (k === "lean") {
        const lean = withP(p, { x: p.x + p.facing * 24 * DP, scale: (p.scale || 1) * 1.35, lid: 0.08, brow: -0.8, pupil: 0.8 });
        this.push(320, lean, STILL, () => this.say(text, 2200));
        this.push(1100, lean);
        this.push(300, p);
      } else {
        this.push(500, withP(p, { wing: 1, y: p.y - 8 * DP, brow: -0.6, beakOpen: 0.6 }), STILL, () => this.say(text, 2200));
        this.push(250, withP(p, { squash: 0.85 }), STILL, () => this.dust(p));
      }
      this.push(900, p);
      return true;
    }
    warn(minutes) {
      this.clearScript(); this.resetTransient();
      const p = this.perch();
      if (!this.perched) this.flyInTo(p, 900); else this.hop(p);
      this.push(400, withP(p, { headTilt: 0.3, beakOpen: 0.5, brow: -0.8, lid: 0.2 }), STILL, () => this.say(this.line("warn", minutes), 3200));
      this.push(1400, withP(p, { headTilt: 0.3, beakOpen: 0.2, brow: -0.8, lid: 0.2 }));
      this.push(300, p);
    }
    walkAcross() {
      this.clearScript(); this.resetTransient();
      const DP = this.DP, gy = this.H * 0.84;
      const start = this.fit(P(this.colR() - 40 * DP, gy)), end = this.fit(P(this.colL() + 40 * DP, gy));
      if (!this.perched) this.push(0, this.offRight());
      this.push(700, start, FLAP, () => { this.perched = false; });
      this.push(180, withP(start, { squash: 0.8 }), STILL, () => this.dust(start));
      this.push(5000, withP(end, { lid: 0.45, look: 1 }), WALK, () => this.say(this.line("walk"), 3500));
      this.push(300, withP(end, { facing: 1, headTilt: -0.3 }));
      this.returnToPerch();
    }
    sitOnRail(minutes) {
      this.clearScript(); this.resetTransient();
      const r = this.rail();
      if (!this.perched) this.push(0, this.offRight());
      this.push(650, r, FLAP, () => { this.perched = false; });
      this.push(200, withP(r, { squash: 0.78 }), STILL, () => this.dust(r));
      this.push(4800, withP(r, { squash: 0.8, lid: 0.55, brow: 0.2, look: -1 }), STILL, () => this.say(this.line("sit", minutes), 4600));
      this.returnToPerch();
    }
    splat() {
      this.clearScript(); this.resetTransient();
      const mid = P(this.cx(0.55), this.H * 0.16);
      if (!this.perched) this.push(0, this.offRight());
      this.push(800, mid, FLAP, () => { this.perched = false; });
      this.push(900, this.offLeft(), FLAP, () => { this.dropSplat(); this.say(this.line("splat"), 2600); });
      this.push(1200, this.offLeft());
      this.push(0, this.offRight());
      this.flyInTo(this.perch(), 1200);
    }

    // ---- theft and chase (milestone 2)
    steal(onGrabbed, onWon, onLost, tile, area) {
      this.clearScript(); this.resetTransient();
      const DP = this.DP, t = tile || this.tile;
      const grab = { x: this.cx(0.5), y: this.H * 0.42 };
      const at = P(grab.x + 34 * DP, this.feetFor(grab.y, 1) + 12 * DP, { headTilt: 0.35 });
      this.push(0, this.offRight(), STILL, () => { this.tileShown = t; this.tileAt = grab; this.perched = false; });
      this.push(700, at, FLAP);
      this.push(200, withP(at, { headTilt: 0.6, beakOpen: 1, brow: -1, lid: 0.1 }));
      this.push(160, withP(at, { headTilt: 0.1, brow: -1, lid: 0.15, beakOpen: 0.35 }), STILL, () => {
        this.carry = { kind: "icon", tile: t }; this.tileShown = null;
        this.ripple = { x: grab.x, y: grab.y, start: now() };
        this.say(this.line("steal"), 2200); onGrabbed && onGrabbed();
      });
      this.push(500, withP(at, { y: at.y - 60 * DP }), FLAP, () =>
        this.startChase(area || this.defaultChaseArea(), onWon, onLost));
    }
    stealButton(rect, label, onGrabbed, onWon) {
      this.clearScript(); this.resetTransient();
      const DP = this.DP, W = this.W, H = this.H;
      const at = P(rect.x + rect.w / 2 + 30 * DP, rect.y + rect.h / 2 + 22 * DP);
      this.push(0, this.offRight(), STILL, () => { this.perched = false; });
      this.push(900, at, FLAP);
      this.push(220, withP(at, { headTilt: 0.5, beakOpen: 1 }));
      this.push(160, at, STILL, () => { this.carry = { kind: "label", text: label }; onGrabbed && onGrabbed(); this.say(this.line("steal"), 2000); });
      this.push(400, withP(at, { y: at.y - 50 * DP }), FLAP, () =>
        this.startChase({ l: W * 0.12, t: H * 0.18, r: W * 0.88, b: H * 0.78 }, onWon, () => {
          if (this.carry) this.dropped.push({ carry: this.carry, x: this.pose.x, y: this.pose.y, start: now(), falls: true });
          this.carry = null; onWon && onWon();
        }, 25000));
    }
    /** Kaak flies in already carrying the tile and the 5-hit chase starts (Kaak's page after a theft). */
    holdingChase(tile, area, onWon, onLost, deadlineMs) {
      this.clearScript(); this.resetTransient();
      const t = tile || this.tile, a = area || this.defaultChaseArea();
      const spot = this.fit(P((a.l + a.r) / 2, (a.t + a.b) / 2, { brow: -0.6, lid: 0.2 }));
      this.carry = { kind: "icon", tile: t }; this.perched = false; this.sleeping = false;
      if (this.reduceMotion) this.push(0, spot);
      else { this.push(0, this.offRight()); this.push(900, spot, FLAP); }
      this.push(140, withP(spot, { squash: 0.8 }), STILL, () => { this.dust(spot); this.say(this.line("steal"), 2200); });
      this.push(140, spot, STILL, () => this.startChase(a, onWon, onLost, deadlineMs == null ? 15000 : deadlineMs));
    }
    startChase(area, onWon, onLost, deadlineMs) {
      this.chase = { needed: 5, hits: 0, deadline: now() + (deadlineMs == null ? 15000 : deadlineMs), area, onWon, onLost };
      this.chaseHop();
      this._syncPointer();
    }
    chaseHop() {
      const ch = this.chase; if (!ch) return;
      const spot = this.fit(P(ch.area.l + Math.random() * (ch.area.r - ch.area.l), ch.area.t + Math.random() * (ch.area.b - ch.area.t),
        { facing: Math.random() < 0.5 ? 1 : -1 }));
      this.push(90, withP(this.rest(this.pose), { squash: 0.8 }));
      this.push(480, spot, FLAP);
      this.push(140, withP(spot, { squash: 0.8 }), STILL, () => this.dust(spot));
      this.push(140, spot);
      this.push(1500 + Math.random() * 900, withP(spot, { headTilt: -0.2, brow: -0.6, lid: 0.2, beakOpen: 0.25 }));
      this.push(0, spot, STILL, () => { if (this.chase) this.chaseHop(); });
    }
    hitKaak() {
      const ch = this.chase; if (!ch) return;
      const DP = this.DP;
      ch.hits++;
      const b = this.kaakBounds(), cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
      for (let i = 0; i < 7; i++) this.feathers.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 260 * DP, vy: -Math.random() * 200 * DP, spin: (Math.random() - 0.5) * 720, start: now() });
      if (ch.hits >= ch.needed) {
        this.chase = null; this.clearScript();
        if (this.carry) this.dropped.push({ carry: this.carry, x: cx, y: cy, start: now(), falls: true });
        this.carry = null;
        this.say(this.line("chaseWon"), 2400);
        const p = this.rest(this.pose);
        this.push(250, withP(p, { squash: 0.9, headTilt: 0.4, brow: 0.9, lid: 0.6, look: -1 }));
        this.push(1300, withP(p, { squash: 0.9, headTilt: 0.4, brow: 0.9, lid: 0.6, look: -1 }));
        this.push(900, withP(this.offRight(), { facing: 1 }), FLAP, () => { this.perched = false; });
        this.push(0, this.offRight(), STILL, () => ch.onWon && ch.onWon());
      } else {
        this.flash(1, 0, 0.6, 450); this.say(this.line("hit"), 1200); this.clearScript(); this.chaseHop();
      }
      this._syncPointer();
    }
    /** Keyboard chase: counts as one hit on Kaak while a chase runs. Returns true if it counted. */
    keyHit() { if (!this.chase) return false; this.hitKaak(); return true; }
    loseChase() {
      const ch = this.chase; if (!ch) return;
      this.chase = null; this.clearScript();
      this.say(this.line("chaseLost"), 2200);
      this.push(1100, withP(this.offRight(), { facing: 1 }), FLAP);
      this.push(0, this.offRight(), STILL, () => { this.carry = null; ch.onLost && ch.onLost(); });
      this._syncPointer();
    }

    // ---- jumpscare
    jumpscare(level) {
      level = level || this.jumpLevel;
      if (level === "OFF") return false;
      this.clearScript(); this.resetTransient();
      const DP = this.DP, H = this.H;
      const full = level === "FULL", gentle = level === "GENTLE";
      const scale = gentle ? 2.6 : full ? 7.5 : 5;
      const center = { x: this.cx(0.5), y: H * 0.45 };
      const cx = center.x + 20 * DP * scale;
      const start = P(center.x, H * 0.56, { scale: 0.3, brow: -1, lid: 0 });
      const hit = P(cx, this.feetFor(H * 0.48, scale), { scale, wing: 1, beakOpen: 1, brow: -1, lid: 0, pupil: 0.45 });
      const lunge = full ? 240 : gentle ? 380 : 300;
      this.push(0, start, STILL, () => { this.perched = false; if (!gentle) { this.flickerFrom = now(); this.flickerUntil = now() + (full ? 560 : 340); } });
      if (!gentle) this.push(full ? 560 : 340, start);
      this.push(lunge, hit, FLAP, () => { this.zoomMs = lunge; this.zoomUntil = now() + lunge; this.zoomAt = { x: center.x, y: center.y }; });
      this.push(0, withP(hit, { squash: 0.88 }), STILL, () => this.impact(level, center));
      this.push(full ? 1100 : 750, withP(hit, { squash: 0.88, beakOpen: 0.75 }));
      this.push(1500, withP(hit, { y: H + 90 * DP * scale, roll: -22, squash: 0.84, wing: 0.4, lid: 0.3, brow: 0.6 }), STILL, () => { if (!gentle) this.smearFrom = { x: center.x, y: center.y }; });
      this.push(1600, this.offRight(), STILL, () => { this.smearFrom = null; });
      this.flyInTo(this.perch(), 1100);
      return true;
    }
    impact(level, at) {
      const DP = this.DP;
      const full = level === "FULL", gentle = level === "GENTLE", calm = this.reduceMotion;
      this.shake((gentle ? 4 : full ? 22 : 12) * DP, gentle ? 300 : full ? 950 : 620);
      this.flash(-1, 0, 0.45, 1300);
      this.bigText = { text: this.fixed("kaa"), size: (gentle ? 36 : full ? 112 : 78) * DP, start: now() };
      if (!gentle) {
        this.crack = this.makeCrack(at, full ? 18 : 10);
        // at most one white fade per jumpscare, none with reduced motion (photosensitivity)
        this.whiteAt = now(); this.whiteMs = calm ? 0 : full ? 280 : 150;
        this.vignetteAt = now(); this.vignetteMs = full ? 1500 : 900;
        for (let i = 0; i < (full ? 16 : 6); i++) this.shards.push({ x: at.x + (Math.random() - 0.5) * 60 * DP, y: at.y + (Math.random() - 0.5) * 60 * DP,
          vx: (Math.random() - 0.5) * 520 * DP, vy: -Math.random() * 260 * DP, size: (6 + Math.random() * 16) * DP, spin: (Math.random() - 0.5) * 900, start: now() });
        for (let i = 0; i < (full ? 22 : 10); i++) this.feathers.push({ x: at.x, y: at.y, vx: (Math.random() - 0.5) * 720 * DP, vy: -Math.random() * 520 * DP, spin: (Math.random() - 0.5) * 900, start: now() });
      }
      this.buzz(gentle ? [40] : full ? [140, 30, 240, 40, 140, 40, 90, 60, 50] : [90, 40, 160, 40, 60]);
    }
    makeCrack(at, rays) {
      const DP = this.DP;
      const maxLen = Math.max(this.W, this.H) * 0.6, paths = [], rayPts = [];
      for (let i = 0; i < rays; i++) {
        let a = i * 2 * Math.PI / rays + Math.random() * 0.35, x = at.x, y = at.y;
        const pts = [[x, y]], steps = 5 + Math.floor(Math.random() * 3), len = maxLen * (0.55 + Math.random() * 0.45);
        for (let k = 0; k < steps; k++) {
          a += (Math.random() - 0.5) * 0.45;
          const d = len / steps; x += Math.cos(a) * d; y += Math.sin(a) * d; pts.push([x, y]);
          if (k >= 1 && k <= 3 && Math.random() < 0.45) { const b = a + (Math.random() < 0.5 ? 0.75 : -0.75); paths.push([[x, y], [x + Math.cos(b) * d * 0.9, y + Math.sin(b) * d * 0.9]]); }
        }
        paths.push(pts); rayPts.push(pts);
      }
      for (let ring = 1; ring <= 2; ring++) for (let i = 0; i < rayPts.length; i++) {
        const a = rayPts[i][ring], b = rayPts[(i + 1) % rayPts.length][ring];
        if (a && b && Math.random() < 0.78) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; paths.push([a, [mx + (at.x - mx) * 0.12, my + (at.y - my) * 0.12], b]); }
      }
      const ring = [];
      for (let i = 0; i <= 10; i++) { const a = i * 2 * Math.PI / 10, r = 16 * DP * (0.75 + Math.random() * 0.5); ring.push([at.x + Math.cos(a) * r, at.y + Math.sin(a) * r]); }
      paths.push(ring);
      return { paths, start: now() };
    }

    // ---- limit, night, gifts
    eat(onDone) {
      this.clearScript(); this.resetTransient();
      const DP = this.DP, s = 2.2;
      const c = this.fit(P(this.cx(0.5) + 10 * DP, this.feetFor(this.H * 0.48, s), { scale: s }));
      if (!this.perched) this.push(0, this.offRight());
      this.push(800, c, FLAP, () => { this.perched = false; });
      for (let i = 0; i < 3; i++) {
        this.push(220, withP(c, { beakOpen: 1, headTilt: -0.15, brow: -0.9, lid: 0.1 }));
        this.push(150, withP(c, { beakOpen: 0, headTilt: 0.2 }), STILL, () => { this.eatenTarget = (i + 1) / 3; this.say(this.fixed("chomp"), 700); this.buzz([55]); });
        this.push(260, c);
      }
      this.push(500, withP(c, { fat: 1, squash: 0.92, brow: 0.4, lid: 0.6, beakOpen: 0.3 }), STILL, () => this.say(this.line("burp"), 1800));
      this.push(1100, withP(c, { fat: 1, squash: 0.92, eyeOpen: 0.5, brow: 0.4, lid: 0.6 }));
      this.push(0, withP(c, { fat: 1 }), STILL, () => onDone && onDone());
    }
    bedArrive() {
      this.clearScript(); this.resetTransient();
      const lie = this.fit(P(this.cx(0.5), this.H * 0.88, { squash: 0.72 }));
      if (!this.perched || this.sleeping) {
        if (this.reduceMotion) this.push(0, withP(lie, { squash: 1 }), STILL, () => { this.sleeping = false; });
        else {
          this.push(0, this.offRight(), STILL, () => { this.sleeping = false; });
          this.push(1200, withP(lie, { squash: 1 }), FLAP);
        }
      }
      this.push(220, lie, STILL, () => { this.perched = true; });
      this.push(900, withP(lie, { beakOpen: 1, eyeOpen: 0.4, headTilt: -0.3 }), STILL, () => { this.say(this.line("yawn"), 2400); this.dimTarget = Math.min(0.6, this.dimTarget + 0.15); });
      this.push(700, withP(lie, { eyeOpen: 0.3 }));
      this.push(0, lie, STILL, () => { this.sleeping = true; });
    }
    blanket() {
      this.clearScript(); this.resetTransient();
      const DP = this.DP;
      this.blanketTarget = this.blanketTarget === 0 ? 0.3 : Math.min(0.6, this.blanketTarget + 0.12);
      this.dimTarget = Math.min(0.6, this.dimTarget + 0.15);
      const top = this.fit(P(this.cx(0.55), this.H * (1 - this.blanketTarget) + 6 * DP, { squash: 0.72 }));
      this.sleeping = false;
      if (!this.perched) this.push(0, this.offRight());
      this.push(this.reduceMotion ? 0 : 900, withP(top, { squash: 1 }), FLAP);
      this.push(200, top, STILL, () => { this.perched = true; this.sleeping = true; this.say(this.fixed("snore"), 2600); });
    }
    morningGift() {
      this.clearScript(); this.resetTransient();
      const DP = this.DP;
      this.sleeping = false;
      const spot = this.fit(P(this.cx(0.55), this.H * 0.80));
      this.push(0, this.offRight(), STILL, () => { this.carry = { kind: "gift" }; });
      this.push(1300, spot, FLAP);
      this.push(220, withP(spot, { squash: 0.85, headTilt: 0.6 }));
      this.push(200, spot, STILL, () => {
        const t = beakTip(this.pose, this.UNIT);
        this.dropped.push({ carry: { kind: "gift" }, x: t.x, y: t.y + 6 * DP, start: now(), falls: false });
        this.carry = null; this.say(this.line("morning"), 3200);
      });
      this.push(2800, withP(spot, { headTilt: -0.2 }));
      this.push(900, withP(this.offRight(), { facing: 1 }), FLAP);
      this.push(1200, this.offRight());
    }
    timesDelivery(onDropped) {
      this.clearScript(); this.resetTransient();
      const DP = this.DP;
      const spot = this.fit(P(this.cx(0.5), this.H * 0.78));
      this.push(0, this.offRight(), STILL, () => { this.carry = { kind: "paper" }; });
      this.push(1300, spot, FLAP);
      this.push(220, withP(spot, { squash: 0.85, headTilt: 0.6 }));
      this.push(200, spot, STILL, () => {
        const t = beakTip(this.pose, this.UNIT);
        this.dropped.push({ carry: { kind: "paper" }, x: t.x - 10 * DP, y: t.y + 10 * DP, start: now(), falls: false });
        this.carry = null; this.say(this.fixed("extra"), 2600);
      });
      this.push(2000, withP(spot, { headTilt: -0.2, beakOpen: 0.6 }));
      this.push(900, withP(this.offRight(), { facing: 1 }), FLAP, () => onDropped && onDropped());
      this.push(400, this.offRight());
    }
    snatch(text, tile) {
      this.clearScript(); this.resetTransient();
      const DP = this.DP, t = tile || this.tile;
      const grab = { x: this.cx(0.5), y: this.H * 0.42 };
      const at = P(grab.x + 34 * DP, this.feetFor(grab.y, 1) + 12 * DP, { headTilt: 0.35 });
      this.push(0, this.offRight(), STILL, () => { this.tileShown = t; this.tileAt = grab; this.perched = false; });
      this.push(700, at, FLAP);
      this.push(200, withP(at, { headTilt: 0.6, beakOpen: 1 }));
      this.push(160, withP(at, { headTilt: 0.1 }), STILL, () => { this.carry = { kind: "icon", tile: t }; this.tileShown = null; this.say(text || this.line("steal"), 2600); });
      this.push(900, this.offLeft(), FLAP);
      this.push(0, this.offLeft(), STILL, () => { this.carry = null; });
    }
    sleepOnApp(cx, cy, tile) {
      this.clearScript(); this.resetTransient();
      const DP = this.DP;
      this.tileShown = tile || this.tile; this.tileAt = { x: cx, y: cy };
      this.pose = P(cx + 8 * DP, cy - 30 * DP, { scale: 1.5, fat: 0.7, squash: 0.8 });
      this.perched = true; this.sleeping = true;
      this.kick();
    }
    sleepOnTile(cx, cy, tile) { this.sleepOnApp(cx, cy, tile); }
    /** progress >= 0 shows the hold ring (0..1); -1 stops quietly; < -1.5 stops with a "let go" line. */
    setHold(progress) {
      const starting = this.hold < 0 && progress >= 0, stopping = this.hold >= 0 && progress < 0;
      this.hold = progress;
      if (starting) { this.sleeping = false; this.pose = withP(this.pose, { eyeOpen: 0.55 }); this.say(this.line("holding"), 5200); }
      if (stopping) { this.sleeping = true; if (progress < -1.5) this.say(this.line("letGo"), 1600); else this.subtitle = null; }
      this.kick(); this._syncPointer();
    }
    /** Start a timed hold (the board's 5 s; the escape screen uses 20-90 s). onDone runs when it completes. */
    beginHold(ms, onDone) {
      this.holdMs = ms || 5000; this.holdDone = onDone || null; this.holdStart = now(); this.setHold(0);
    }
    /** Release a timed hold early ("thought so."). */
    endHold() { if (!this.holdStart) return false; this.holdStart = 0; this.holdDone = null; this.setHold(-2); return true; }
    stamp(x, y, onDone) {
      this.clearScript(); this.resetTransient();
      const DP = this.DP;
      const at = P(x + 26 * DP, y + 8 * DP, { scale: 1.2 });
      this.push(0, this.offRight(), STILL, () => { this.perched = false; });
      this.push(this.reduceMotion ? 0 : 1000, withP(at, { squash: 1 }), FLAP);
      this.push(160, withP(at, { squash: 0.75 }), STILL, () => { this.footprints.push({ x, y, rot: -20 + Math.random() * 40 }); this.say(this.line("stamp"), 2200); this.buzz([55]); });
      this.push(300, at);
      this.push(1100, withP(at, { headTilt: -0.25 }));
      this.push(900, withP(this.offRight(), { facing: 1 }), FLAP);
      this.push(0, this.offRight(), STILL, () => onDone && onDone());
    }
    /** The calm / Friend-trust perch: small, top-left corner. */
    perchCalm(on) {
      on = on === undefined ? true : !!on;
      if (this.calm === on) return;
      this.calm = on;
      if (!this.perched || this.seg || this.queue.length || this.chase || this.sleeping || this.hold >= 0) { this.kick(); return; }
      const p = this.perch();
      if (this.reduceMotion) { this.sitNow(p); return; }
      this.push(110, withP(this.rest(this.pose), { squash: 0.8 }));
      this.push(800, p, FLAP);
      this.push(170, withP(p, { squash: 0.76 }), STILL, () => this.dust(p));
      this.push(160, p);
    }
    dropSplat() {
      const DP = this.DP, W = this.W, H = this.H;
      const span = this.colR() - this.colL();
      const cx = this.colL() + span * (0.38 + Math.random() * 0.24), cy = H * (0.38 + Math.random() * 0.16);
      const blobs = [], core = [], spray = [];
      const blob = (ox, oy, main, n) => {
        blobs.push([ox, oy, main]);
        for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI + Math.random() * 0.6, d = main * (0.7 + Math.random() * 0.55);
          blobs.push([ox + Math.cos(a) * d, oy + Math.sin(a) * d, main * (0.32 + Math.random() * 0.3)]); }
        for (let i = 0; i < 3; i++) core.push([ox + (Math.random() - 0.5) * main * 0.5, oy + (Math.random() - 0.5) * main * 0.5, main * (0.22 + Math.random() * 0.16)]);
      };
      blob(0, 0, 60 * DP, 11);
      for (let i = 0; i < 2; i++) { const a = Math.random() * 2 * Math.PI, d = (125 + Math.random() * 60) * DP; blob(Math.cos(a) * d, Math.sin(a) * d * 0.8, (22 + Math.random() * 10) * DP, 6); }
      for (let i = 0; i < 22; i++) { const a = Math.random() * 2 * Math.PI, d = (85 + Math.random() * 150) * DP; spray.push([Math.cos(a) * d, Math.sin(a) * d, (3 + Math.random() * 8) * DP]); }
      const drips = [0, 1, 2, 3, 4].map(() => [(-48 + Math.random() * 96) * DP, (45 + Math.random() * 80) * DP, (10 + Math.random() * 7) * DP]);
      this.splatObj = { cx: Math.max(0, Math.min(W, cx)), cy, blobs, core, spray, drips, droppedAt: now(), fadeStart: -1, wipeDx: 0, wipeDy: 0 };
      this.shake(6 * DP, 260);
      this._syncPointer();
    }
    wipe(thanked, dx, dy) {
      const s = this.splatObj; if (!s || s.fadeStart >= 0) return false;
      if (dx == null) dx = 0; if (dy == null) dy = 60;
      const len = Math.max(1, Math.hypot(dx, dy));
      s.wipeDx = dx / len * 160 * this.DP; s.wipeDy = dy / len * 160 * this.DP;
      s.fadeStart = now(); if (thanked) this.say(this.line("wiped"), 1800);
      this.kick(); this._syncPointer();
      return true;
    }

    // ---- pointer and keys
    toLocal(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * this.W / (r.width || this.W), y: (e.clientY - r.top) * this.H / (r.height || this.H) };
    }
    hitsKaak(pt, pad) {
      const b = this.kaakBounds(); pad = pad == null ? 22 * this.DP : pad;
      return pt.x > b.l - pad && pt.x < b.r + pad && pt.y > b.t - pad && pt.y < b.b + pad;
    }
    /** Feed a pointer event in ("down" | "move" | "up"). Returns true if the engine used it. */
    pointer(type, e) {
      const pt = this.toLocal(e);
      if (this.custom && this.custom(type, pt, e)) return true;
      const s = this.splatObj;
      if (s && s.fadeStart < 0) {
        if (type === "down") { this.touchDown = pt; const el = e.currentTarget || this.canvas; try { el.setPointerCapture && el.setPointerCapture(e.pointerId); } catch (err) {} }
        else if (type === "move" && this.touchDown && Math.hypot(pt.x - this.touchDown.x, pt.y - this.touchDown.y) > 60 * this.DP) this.wipe(true, pt.x - this.touchDown.x, pt.y - this.touchDown.y);
        else if (type === "up") this.touchDown = null;
        return true;
      }
      if (type === "down" && this.chase) {
        if (this.hitsKaak(pt)) { this.hitKaak(); return true; }
      }
      return false;
    }
    /** Add pointer listeners to element (usually the canvas). Returns a detach function. */
    attachPointer(el) {
      el = el || this.canvas;
      const map = [["pointerdown", "down"], ["pointermove", "move"], ["pointerup", "up"], ["pointercancel", "up"], ["pointerleave", "up"]];
      const fns = map.map(([ev, type]) => {
        const fn = e => { if (this.pointer(type, e) && type === "down" && e.cancelable) e.preventDefault(); };
        el.addEventListener(ev, fn);
        return [ev, fn];
      });
      const detach = () => fns.forEach(([ev, fn]) => el.removeEventListener(ev, fn));
      this._detach.push(detach);
      return detach;
    }
    /** Keyboard: Escape wipes the splat. Returns true if handled. */
    keyDown(e) {
      const key = typeof e === "string" ? e : e && e.key;
      if (key === "Escape" && this.splatObj && this.splatObj.fadeStart < 0) { this.wipe(true, 0, 60); return true; }
      return false;
    }
    /** Listen for Escape on target (default window). Never blocks the page's own handling. Returns detach. */
    attachKeys(target) {
      target = target || root;
      const fn = e => { this.keyDown(e); };
      target.addEventListener("keydown", fn, true);
      const detach = () => target.removeEventListener("keydown", fn, true);
      this._detach.push(detach);
      return detach;
    }
    /** True while the host should let pointer events reach the canvas. */
    wantsPointer() {
      return !!((this.splatObj && this.splatObj.fadeStart < 0) || this.chase || this.hold >= 0 || this.custom);
    }
    _syncPointer() {
      const w = this.wantsPointer();
      if (w !== this.lastWants) { this.lastWants = w; if (this.onWantsPointer) { try { this.onWantsPointer(w); } catch (e) {} } }
    }

    // ---- frame loop
    busy() {
      const t = now();
      return !!(this.seg || this.queue.length || this.chase || this.ripple || this.crack || this.bigText ||
        this.feathers.length || this.dropped.length || this.splatObj || this.waiting || this.hold >= 0 || this.puffs.length ||
        this.shards.length || this.smearFrom || t < this.flickerUntil || t < this.shakeUntil || t < this.flashUntil ||
        Math.abs(this.dim - this.dimTarget) > 0.001 || Math.abs(this.blanketV - this.blanketTarget) > 0.001 ||
        Math.abs(this.eatenV - this.eatenTarget) > 0.001);
    }
    isIdle() { return !this.busy(); }
    /** Anything at all to draw? (Kaak on screen, a mark, a cover, a bubble, a host hook.) */
    hasContent() {
      return !!(this.kaakVisible() || this.subtitle || this.splatObj || this.tileShown || this.footprints.length ||
        this.dim > 0.005 || this.dimTarget > 0 || this.blanketV > 0.005 || this.blanketTarget > 0 || this.eatenV > 0.005 || this.eatenTarget > 0 ||
        this.underlay || this.overlay || (this.bg && this.bg !== "none"));
    }
    start() {
      if (this.running) return;
      this.running = true;
      if (root.document && root.document.addEventListener) root.document.addEventListener("visibilitychange", this._onVis);
      this.kick();
    }
    stop() {
      this.running = false;
      if (this.raf && root.cancelAnimationFrame) root.cancelAnimationFrame(this.raf);
      if (this.timer) clearTimeout(this.timer);
      this.raf = 0; this.timer = 0;
      if (root.document && root.document.removeEventListener) root.document.removeEventListener("visibilitychange", this._onVis);
    }
    destroy() { this.stop(); this._detach.splice(0).forEach(f => { try { f(); } catch (e) {} }); }
    _hidden() { return !!(root.document && root.document.hidden); }
    _onVis() {
      if (this._hidden()) {
        this.hiddenAt = now();
        if (this.raf && root.cancelAnimationFrame) root.cancelAnimationFrame(this.raf);
        if (this.timer) clearTimeout(this.timer);
        this.raf = 0; this.timer = 0;
      } else {
        if (this.hiddenAt) { // freeze time while hidden: nothing ends behind your back
          const gap = now() - this.hiddenAt;
          this.segStart += gap; this.subtitleUntil += gap;
          if (this.chase) this.chase.deadline += gap;
          if (this.holdStart) this.holdStart += gap;
          if (this.splatObj) { this.splatObj.droppedAt += gap; if (this.splatObj.fadeStart >= 0) this.splatObj.fadeStart += gap; }
          this.hiddenAt = 0;
        }
        this.lastFrame = 0;
        this.kick();
      }
    }
    /** Make sure a frame is coming (called by every performance). */
    kick() {
      if (!this.running || this._hidden()) return;
      if (this.raf) return;
      if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
      const raf = root.requestAnimationFrame || (fn => setTimeout(() => fn(now()), 16));
      this.raf = raf(this._tick);
    }
    _schedule(ms) {
      if (!this.running || this._hidden() || this.raf || this.timer) return;
      if (ms <= 0) { this.kick(); return; }
      this.timer = setTimeout(() => { this.timer = 0; this.kick(); }, ms);
    }
    _tick(t) {
      this.raf = 0;
      if (!this.running || this._hidden()) return;
      if (typeof t !== "number") t = now();
      if (!this.busy() && !this.hasContent()) {
        if (!this.blank) this.blankCanvas();
        this.lastFrame = 0;
        if (this.wasBusy) { this.wasBusy = false; this._fireIdle(); }
        this._syncPointer();
        return; // nothing on stage: stop scheduling until the next kick()
      }
      this.blank = false;
      this.frame(t);
      const b = this.busy();
      if (this.wasBusy && !b) this._fireIdle();
      this.wasBusy = b;
      this._syncPointer();
      if (b) this._schedule(0);
      else if (!this.hasContent()) this._schedule(0); // one more tick blanks the canvas
      else this._schedule(this.sleeping ? SLEEP_MS : IDLE_MS);
    }
    _fireIdle() { if (this.onIdle) { try { this.onIdle(this); } catch (e) {} } }

    rest(p) { return withP(p, { bob: 0, legPhase: 0, eyeOpen: p.eyeOpen < 0 ? -1 : 1, wing: p.wing === 1 ? 1 : 0 }); }
    blink(t) { return (t % 3700) < 110 ? 0 : 1; }
    ease(t) { return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (-2 * t + 2) / 2; }
    interp(a, b, t, motion, elapsed, tnow) {
      const DP = this.DP;
      const e = motion === WALK ? t : this.ease(t);
      const l = (x, y) => x + (y - x) * e;
      const arc = motion === FLAP ? -Math.sin(Math.PI * t) * 28 * DP : 0;
      const explicitEyes = a.eyeOpen !== 1 || b.eyeOpen !== 1;
      return {
        x: l(a.x, b.x), y: l(a.y, b.y) + arc, facing: b.facing,
        headTilt: l(a.headTilt, b.headTilt) + (motion === WALK ? Math.sin(elapsed / 80) * 0.13 : 0),
        squash: l(a.squash, b.squash) * (motion === FLAP ? 1.05 : 1),
        wing: motion === FLAP ? Math.sin(elapsed / 55) * 0.5 + 0.5 : l(a.wing, b.wing),
        bob: motion === WALK ? -Math.abs(Math.sin(elapsed / 80)) * 2.5 * DP : motion === STILL ? (this.sleeping ? 0 : Math.sin(tnow / 450) * 0.7 * DP) : 0,
        legPhase: motion === WALK ? elapsed / 80 : 0,
        eyeOpen: explicitEyes ? l(a.eyeOpen, b.eyeOpen) : this.sleeping ? -1 : this.blink(tnow),
        scale: l(a.scale, b.scale), roll: l(a.roll, b.roll), beakOpen: l(a.beakOpen, b.beakOpen), fat: l(a.fat, b.fat),
        brow: l(a.brow, b.brow), lid: l(a.lid, b.lid), look: l(a.look, b.look), pupil: l(a.pupil, b.pupil),
      };
    }
    step(t) {
      for (let guard = 0; guard < 50; guard++) {
        let s = this.seg;
        if (!s) {
          const next = this.queue.shift();
          if (!next) {
            this.flapping = false;
            this.pose = withP(this.pose, {
              bob: this.perched && !this.sleeping ? Math.sin(t / 450) * 0.7 * this.DP : 0,
              eyeOpen: this.sleeping ? -1 : this.hold >= 0 ? 0.55 : this.blink(t),
            });
            return;
          }
          this.seg = next; this.segStart = t; this.from = this.rest(this.pose);
          next.onStart && next.onStart();
          if (this.seg !== next) continue;
          s = next;
        }
        const elapsed = t - this.segStart;
        const k = s.ms <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / s.ms));
        this.pose = this.interp(this.from, s.to, k, s.motion, elapsed, t);
        this.flapping = s.motion === FLAP;
        if (k < 1) return;
        this.seg = null; this.pose = this.rest(s.to);
        if (s.ms > 0) return;
      }
    }
    approach(v, target, stepV) { return v < target ? Math.min(target, v + stepV) : Math.max(target, v - stepV); }

    frame(t) {
      const dt = this.lastFrame ? Math.min(64, t - this.lastFrame) : 16;
      this.lastFrame = t;
      this.step(t);
      this.dim = this.approach(this.dim, this.dimTarget, dt / 1000 * 0.3);
      this.blanketV = this.approach(this.blanketV, this.blanketTarget, dt / 1000 * 0.5);
      this.eatenV = this.approach(this.eatenV, this.eatenTarget, dt / 1000 * 2.2);
      if (this.chase && now() > this.chase.deadline) this.loseChase();
      if (this.hold >= 0 && this.holdStart) {
        const p = Math.max(0, (now() - this.holdStart) / this.holdMs);
        if (p >= 1) {
          const done = this.holdDone || this.onEscape;
          this.holdStart = 0; this.holdDone = null; this.setHold(-1); this.say(this.line("escaped"), 1500);
          if (done) done();
        } else this.hold = p;
      }
      this.draw(t);
      if (this.busy()) this.idleSince = t;
    }

    draw(t) {
      const c = this.c, W = this.W, H = this.H, DP = this.DP;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.save();
      if (t < this.shakeUntil) {
        const k = (this.shakeUntil - t) / this.shakeTotal;
        c.translate((Math.random() - 0.5) * 2 * this.shakeAmp * k, (Math.random() - 0.5) * 2 * this.shakeAmp * k);
      }
      if (this.bg === "paper") drawPaper(c, W, H);
      else if (this.bg && this.bg !== "none") { c.fillStyle = this.bg; c.fillRect(0, 0, W, H); }
      if (this.underlay) this.underlay(c, t, this);

      if (this.dim > 0.005) { c.fillStyle = `rgba(0,0,0,${this.dim})`; c.fillRect(0, 0, W, H); }
      // one smooth dim, no rapid flicker (photosensitivity)
      if (t >= this.flickerFrom && t < this.flickerUntil) { const k = (t - this.flickerFrom) / (this.flickerUntil - this.flickerFrom); c.fillStyle = `rgba(0,0,0,${Math.sin(Math.PI * k) * 0.6})`; c.fillRect(0, 0, W, H); }
      if (t < this.zoomUntil) {
        const k = 1 - (this.zoomUntil - t) / this.zoomMs, zx = this.zoomAt ? this.zoomAt.x : W / 2, zy = this.zoomAt ? this.zoomAt.y : H * 0.45;
        c.strokeStyle = `rgba(255,255,255,${k * 0.67})`; c.lineWidth = 3 * DP; c.lineCap = "round";
        for (let i = 0; i < 26; i++) { const a = i * 2 * Math.PI / 26, r0 = Math.max(W, H) * (0.62 - k * 0.18), r1 = r0 - (40 + 90 * k) * DP;
          c.beginPath(); c.moveTo(zx + Math.cos(a) * r0, zy + Math.sin(a) * r0); c.lineTo(zx + Math.cos(a) * r1, zy + Math.sin(a) * r1); c.stroke(); }
      }
      if (this.blanketV > 0.005) this.drawBlanket(c);
      this.footprints.forEach(f => this.drawFootprint(c, f));
      const s = this.splatObj;
      if (s) {
        if (s.fadeStart < 0 && t - s.droppedAt > 10000) this.wipe(false);
        const a = s.fadeStart < 0 ? 1 : 1 - (now() - s.fadeStart) / 350;
        if (a <= 0) { this.splatObj = null; this._syncPointer(); } else this.drawSplat(c, s, a);
      }
      if (this.eatenV > 0.005) this.drawEaten(c);
      if (this.tileShown && this.tileAt) drawSiteTile(c, this.tileAt.x, this.tileAt.y, 92 * DP, this.tileShown, 1);
      this.drawDropped(c, t);
      this.updateSprings(16);
      if (this.smearFrom) {
        const b = this.kaakBounds();
        c.strokeStyle = "rgba(216,216,204,0.35)"; c.lineWidth = (b.r - b.l) * 0.32; c.lineCap = "round";
        c.beginPath(); c.moveTo(this.smearFrom.x, this.smearFrom.y); c.lineTo((b.l + b.r) / 2, (b.t + b.b) / 2); c.stroke();
      }
      this.drawSpeedLines(c);
      this.drawPuffs(c, t);
      if (this.kaakVisible()) {
        let drawn = withP(this.pose, { tuft: this.tuftX, scarf: this.scarfX });
        if (t < this.flashUntil && this.flashF) drawn = withP(drawn, this.flashF);
        drawCrow(c, drawn, this.UNIT, this.glasses);
      }
      if (this.carry) this.drawCarry(c, this.carry);
      this.drawFeathers(c, t);
      if (this.ripple) {
        const k = (t - this.ripple.start) / 450;
        if (k >= 1) this.ripple = null;
        else if (k >= 0) { c.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.8})`; c.lineWidth = 2.5 * DP; c.beginPath(); c.arc(this.ripple.x, this.ripple.y, 4 * DP + k * 26 * DP, 0, Math.PI * 2); c.stroke(); }
      }
      if (this.crack) {
        const age = t - this.crack.start, a = age < 2200 ? 1 : 1 - (age - 2200) / 900;
        if (a <= 0) this.crack = null;
        else {
          c.lineJoin = "round";
          for (const pts of this.crack.paths) {
            c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
            c.strokeStyle = `rgba(0,0,0,${0.67 * a})`; c.lineWidth = 4.2 * DP; c.stroke();
            c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 2.2 * DP; c.stroke();
          }
        }
      }
      this.shards = this.shards.filter(sh => {
        const k = Math.max(0, (t - sh.start) / 1000); if (k > 1.3) return false;
        const x = sh.x + sh.vx * k, y = sh.y + sh.vy * k + 1300 * DP * k * k, a = Math.max(0, 1 - k / 1.3);
        c.save(); c.translate(x, y); c.rotate(sh.spin * k * Math.PI / 180);
        c.beginPath(); c.moveTo(0, -sh.size); c.lineTo(sh.size * 0.7, sh.size * 0.4); c.lineTo(-sh.size * 0.5, sh.size * 0.6); c.closePath();
        c.fillStyle = `rgba(232,244,255,${0.85 * a})`; c.fill(); c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 1.2 * DP; c.stroke();
        c.restore(); return true;
      });
      if (this.sleeping && this.kaakVisible()) this.drawZzz(c, t);
      if (this.hold >= 0 && !this.noHoldRing) this.drawHoldRing(c); // the escape page draws its own ring
      c.restore();

      if (this.vignetteAt >= 0 && t - this.vignetteAt < this.vignetteMs && t >= this.vignetteAt) {
        const k = 1 - (t - this.vignetteAt) / this.vignetteMs;
        const g = c.createRadialGradient(W / 2, H / 2, Math.max(W, H) * 0.72 * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
        g.addColorStop(0, "rgba(224,80,58,0)"); g.addColorStop(1, `rgba(176,32,26,${0.9 * k})`);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      // the single white fade of a jumpscare (none with reduced motion: whiteMs is 0)
      if (this.whiteAt >= 0 && t >= this.whiteAt && t - this.whiteAt < this.whiteMs) { c.fillStyle = `rgba(255,255,255,${1 - (t - this.whiteAt) / this.whiteMs})`; c.fillRect(0, 0, W, H); }

      if (this.bigText) {
        const age = Math.max(0, t - this.bigText.start);
        if (age > 1400) this.bigText = null;
        else {
          const pop = age < 120 ? 0.6 + age / 300 : 1, a = age < 1000 ? 1 : 1 - (age - 1000) / 400;
          const size = this.bigText.size * pop;
          c.font = `800 ${size}px ${this.font}`; c.textAlign = "center";
          c.lineJoin = "round"; c.lineWidth = size * 0.12; c.strokeStyle = `rgba(0,0,0,${a})`; c.fillStyle = `rgba(255,255,255,${a})`;
          const jit = !this.reduceMotion && age < 650 ? this.bigText.size * 0.05 * (1 - age / 650) : 0, jx = (Math.random() - 0.5) * 2 * jit, jy = (Math.random() - 0.5) * 2 * jit;
          const bx = this.zoomAt ? this.zoomAt.x : W / 2;
          c.strokeText(this.bigText.text, bx + jx, H * 0.24 + jy); c.fillText(this.bigText.text, bx + jx, H * 0.24 + jy); c.textAlign = "left";
        }
      }
      if (this.overlay) this.overlay(c, t, this);
      if (this.subtitle) { if (now() < this.subtitleUntil) this.drawBubble(c, this.subtitle); else this.subtitle = null; }
    }

    // ---- drawing helpers
    drawBubble(c, text) {
      const DP = this.DP, W = this.W, H = this.H, top0 = this.topInset;
      const pad = 10 * DP;
      c.font = `700 ${15 * DP}px ${this.font}`;
      const tw = c.measureText(text).width, bw = tw + pad * 2, bh = 15 * DP + pad * 2;
      const ax = Math.max(0, Math.min(W, this.pose.x));
      const ay = Math.min(Math.max(headTopY(this.pose, this.UNIT) - 10 * DP, bh + top0), H - 8 * DP);
      const left = Math.min(Math.max(ax - bw / 2, 8 * DP), Math.max(8 * DP, W - 8 * DP - bw));
      const top = Math.max(ay - bh, top0);
      c.fillStyle = "rgba(20,20,24,0.9)"; roundRect(c, left, top, bw, bh, 12 * DP); c.fill();
      const tx = Math.min(Math.max(ax, left + 14 * DP), left + bw - 14 * DP);
      c.beginPath(); c.moveTo(tx - 7 * DP, top + bh - 1); c.lineTo(tx, top + bh + 8 * DP); c.lineTo(tx + 7 * DP, top + bh - 1); c.fill();
      c.fillStyle = "#fff"; c.fillText(text, left + pad, top + pad + 15 * DP * 0.82);
    }
    drawCarry(c, item) {
      const DP = this.DP, tip = beakTip(this.pose, this.UNIT), f = this.pose.facing;
      if (item.kind === "icon") drawSiteTile(c, tip.x + f * 14 * DP, tip.y + 16 * DP, 40 * DP, item.tile || this.tile, 1);
      else if (item.kind === "label") this.drawPill(c, item.text, tip.x + f * 10 * DP, tip.y + 14 * DP);
      else if (item.kind === "paper") drawPaperItem(c, tip.x + f * 6 * DP, tip.y + 12 * DP, 1, DP);
      else this.drawGift(c, tip.x + f * 4 * DP, tip.y + 6 * DP, 1);
    }
    drawPill(c, text, cx, cy) {
      const DP = this.DP;
      c.font = `700 ${15 * DP}px ${this.font}`;
      const tw = c.measureText(text).width;
      c.fillStyle = "#F2C14E"; roundRect(c, cx - tw / 2 - 14 * DP, cy - 16 * DP, tw + 28 * DP, 32 * DP, 16 * DP); c.fill();
      c.fillStyle = "#19191D"; c.textAlign = "center"; c.fillText(text, cx, cy + 5 * DP); c.textAlign = "left";
    }
    drawGift(c, x, y, a) {
      const DP = this.DP;
      c.fillStyle = `rgba(242,193,78,${a})`; c.beginPath(); c.arc(x, y, 9 * DP, 0, Math.PI * 2); c.fill();
      c.fillStyle = `rgba(255,244,194,${a})`; c.beginPath(); c.arc(x - 3 * DP, y - 3 * DP, 3 * DP, 0, Math.PI * 2); c.fill();
    }
    drawDropped(c, t) {
      const DP = this.DP;
      this.dropped = this.dropped.filter(d => {
        const age = Math.max(0, (t - d.start) / 1000);
        if (d.falls) {
          if (age > 1) return false;
          const y = d.y + 900 * DP * age * age;
          if (d.carry.kind === "icon") drawSiteTile(c, d.x, y, 40 * DP, d.carry.tile || this.tile, 1 - age);
          else if (d.carry.kind === "label") this.drawPill(c, d.carry.text, d.x, y);
          else this.drawGift(c, d.x, y, 1 - age);
        } else {
          if (age > 6) return false;
          const a = age < 5 ? 1 : 6 - age;
          if (d.carry.kind === "paper") { drawPaperItem(c, d.x, d.y, a, DP); return true; }
          this.drawGift(c, d.x, d.y, a);
          const tw = Math.sin(t / 160) * 0.5 + 0.5; // ~1 Hz twinkle
          c.fillStyle = `rgba(255,244,194,${a * tw})`; c.beginPath(); c.arc(d.x + 12 * DP, d.y - 12 * DP, 2.5 * DP, 0, Math.PI * 2); c.fill();
        }
        return true;
      });
    }
    drawFeathers(c, t) {
      const DP = this.DP;
      this.feathers = this.feathers.filter(f => {
        const k = Math.max(0, (t - f.start) / 1000);
        if (k > 0.9) return false;
        const x = f.x + f.vx * k, y = f.y + f.vy * k + 300 * DP * k * k;
        c.save(); c.translate(x, y); c.rotate(f.spin * k * Math.PI / 180);
        c.fillStyle = `rgba(38,38,43,${1 - k / 0.9})`; c.beginPath(); c.ellipse(0, 0, 7 * DP, 2.5 * DP, 0, 0, Math.PI * 2); c.fill();
        c.restore();
        return true;
      });
    }
    drawZzz(c, t) {
      const DP = this.DP, head = beakTip(this.pose, this.UNIT);
      for (let i = 0; i < 3; i++) {
        const k = ((t / 1800) + i / 3) % 1;
        const size = (12 + 10 * k) * DP;
        const a = Math.max(0, Math.min(1, k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85));
        const x = head.x + 14 * DP + k * 30 * DP, y = head.y - 24 * DP - k * 60 * DP;
        c.font = `italic 800 ${size}px ${this.font}`;
        c.fillStyle = `rgba(0,0,0,${a * 0.6})`; c.fillText("z", x + 1.5 * DP, y + 1.5 * DP);
        c.fillStyle = `rgba(255,255,255,${a})`; c.fillText("z", x, y);
      }
    }
    drawHoldRing(c) {
      const DP = this.DP;
      const b = this.kaakBounds(), r = Math.max(b.r - b.l, b.b - b.t) * 0.62, cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
      c.lineWidth = 6 * DP; c.lineCap = "round";
      c.strokeStyle = "rgba(255,255,255,0.2)"; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = "#F2C14E"; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, this.hold))); c.stroke();
    }
    drawBlanket(c) {
      const DP = this.DP, W = this.W, H = this.H;
      const top = H * (1 - this.blanketV);
      c.save();
      c.beginPath(); c.moveTo(0, top + 10 * DP);
      const stepW = W / 6;
      for (let x = 0; x < W; x += stepW) c.quadraticCurveTo(x + stepW / 2, top - 6 * DP, x + stepW, top + 10 * DP);
      c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.clip();
      const sq = 46 * DP, quilt = ["#3B4A8C", "#2F3C75", "#4F5FA8"];
      let row = 0;
      for (let y = top - 10 * DP; y < H; y += sq, row++) {
        let col = 0;
        for (let x = 0; x < W; x += sq, col++) {
          c.fillStyle = quilt[(row + col) % 3]; c.globalAlpha = 0.93; c.fillRect(x, y, sq, sq); c.globalAlpha = 1;
          c.setLineDash([5 * DP, 4 * DP]); c.strokeStyle = "rgba(255,255,255,0.33)"; c.lineWidth = 1.2 * DP;
          c.strokeRect(x + 4 * DP, y + 4 * DP, sq - 8 * DP, sq - 8 * DP); c.setLineDash([]);
        }
      }
      c.restore();
    }
    drawEaten(c) {
      const DP = this.DP, W = this.W, H = this.H;
      const edge = this.eatenV * (W + 60 * DP);
      c.fillStyle = "#0E0E12";
      c.fillRect(0, 0, Math.max(0, edge - 30 * DP), H);
      if (this.eatenV < 0.999) {
        const r = 38 * DP;
        for (let y = 0; y < H + r; y += r * 1.5) { c.beginPath(); c.arc(edge - 30 * DP, y, r, 0, Math.PI * 2); c.fill(); }
      }
    }
    drawFootprint(c, f) {
      const DP = this.DP;
      c.save(); c.translate(f.x, f.y); c.rotate(f.rot * Math.PI / 180);
      const s = 1.4 * DP;
      c.strokeStyle = "rgba(107,74,43,0.87)"; c.lineWidth = 5 * DP; c.lineCap = "round";
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -22 * s); c.moveTo(0, 0); c.lineTo(-14 * s, -16 * s);
      c.moveTo(0, 0); c.lineTo(14 * s, -16 * s); c.moveTo(0, 0); c.lineTo(0, 12 * s); c.stroke();
      c.restore();
    }
    drawSplat(c, s, a) {
      const DP = this.DP;
      const t = now(), age = t - s.droppedAt;
      const pop = age < 110 ? 0.25 + 0.95 * (age / 110) : age < 260 ? 1.2 - 0.2 * ((age - 110) / 150) : 1;
      const slide = s.fadeStart >= 0 ? Math.min(1, (t - s.fadeStart) / 350) : 0;
      const ooze = Math.min(1, age / 2600);
      const circle = (x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); };
      c.save();
      c.translate(s.wipeDx * slide, s.wipeDy * slide);
      c.translate(s.cx, s.cy); c.scale(pop, pop); c.translate(-s.cx, -s.cy);
      const shade = `rgba(207,207,194,${a})`, main = `rgba(244,244,236,${0.97 * a})`, edge = `rgba(0,0,0,${0.59 * a})`;
      s.drips.forEach(d => {
        const len = d[1] * (0.45 + 0.55 * ooze);
        c.fillStyle = edge; roundRect(c, s.cx + d[0] - d[2] / 2 - 1.5 * DP, s.cy, d[2] + 3 * DP, len + 12 * DP, d[2] / 2 + 1.5 * DP); c.fill();
        c.fillStyle = shade; roundRect(c, s.cx + d[0] - d[2] / 2, s.cy, d[2], len + 10 * DP, d[2] / 2); c.fill();
        circle(s.cx + d[0], s.cy + len + 10 * DP, d[2] * 0.62); c.fill();
      });
      c.fillStyle = shade; s.blobs.forEach(b => { circle(s.cx + b[0] + 3 * DP, s.cy + b[1] + 4 * DP, b[2]); c.fill(); });
      c.strokeStyle = edge; c.lineWidth = 3 * DP;
      s.blobs.forEach(b => { circle(s.cx + b[0], s.cy + b[1], b[2]); c.stroke(); });
      s.spray.forEach(b => { circle(s.cx + b[0], s.cy + b[1], b[2]); c.stroke(); });
      c.fillStyle = main;
      s.blobs.forEach(b => { circle(s.cx + b[0], s.cy + b[1], b[2]); c.fill(); });
      s.spray.forEach(b => { circle(s.cx + b[0], s.cy + b[1], b[2]); c.fill(); });
      s.drips.forEach(d => { const len = d[1] * (0.45 + 0.55 * ooze); roundRect(c, s.cx + d[0] - d[2] / 2 + 2 * DP, s.cy, d[2] - 4 * DP, len + 8 * DP, (d[2] - 4 * DP) / 2); c.fill(); });
      c.fillStyle = `rgba(154,156,126,${0.92 * a})`; s.core.forEach(k => { circle(s.cx + k[0], s.cy + k[1], k[2]); c.fill(); });
      c.fillStyle = `rgba(94,95,74,${0.9 * a})`; s.core.forEach((k, i) => { if (i % 2 === 0) { circle(s.cx + k[0] + k[2] * 0.3, s.cy + k[1] - k[2] * 0.2, k[2] * 0.35); c.fill(); } });
      const m = s.blobs[0];
      c.strokeStyle = `rgba(255,255,255,${0.9 * a})`; c.lineWidth = 3 * DP; c.lineCap = "round";
      c.beginPath(); c.arc(s.cx + m[0], s.cy + m[1], m[2] * 0.7, 200 * Math.PI / 180, 250 * Math.PI / 180); c.stroke();
      c.restore();
    }
  }

  function createStage(canvas, opts) { return new Stage(canvas, opts); }

  root.KaakEngine = Object.freeze({
    version: VERSION,
    createStage, Stage,
    // painter
    P, withP, K, PATHS, HEAD, EYE, TUFT, drawCrow, beakTip, headTopY, crowBounds,
    // helpers
    roundRect, wrapText, fitText, drawSiteTile, drawPaper, drawPaperItem,
    // nest
    LOOT, drawLoot, drawNestScene,
    // lines
    LINES, FIXED, makeLineFn, makeFixedFn,
    // constants
    STILL, FLAP, WALK, DEFAULT_FONT, DEFAULT_TILE,
  });
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this);
