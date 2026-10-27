// Kaak's content script on feed sites.
//
// What it reads, and nothing more (spec section 10.1):
// - that a wheel / scroll / touch / scrolling key happened, and when;
// - that a key was pressed inside a text field (never which key, never the text);
// - the page URL, only to tell the service worker which kind of page this is. Not stored.
// It never reads the page's text, titles, images or DOM content.
(() => {
  "use strict";
  if (globalThis.__kaakFeed) return;
  globalThis.__kaakFeed = true;

  const SWIPE_GAP_MS = 350;
  const BEAT_MS = 5000;
  const TYPING_THROTTLE_MS = 2000;
  const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Spacebar", "j", "k", "Home", "End"]);

  let port = null;
  let alive = true;
  let lastInputAt = -1e9;
  let lastTypingSent = -1e9;
  let lastHref = location.href;
  let beatTimer = null;
  let lines = null;
  let lang = "en";
  let settings = { reduceMotion: false };

  // ------------------------------------------------------------------ port
  function connect() {
    if (!alive) return;
    try {
      port = chrome.runtime.connect({ name: "feed" });
    } catch (e) {
      // extension reloaded or removed: this script is orphaned, go quiet
      alive = false;
      teardown();
      return;
    }
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      // the service worker restarted: reconnect and tell it where we are
      if (alive) setTimeout(connect, 250);
    });
    send({ t: "hello", url: location.href, watching: watching() });
  }
  function send(msg) {
    if (!port) return;
    try { port.postMessage(msg); } catch (e) { port = null; }
  }

  // ------------------------------------------------------------------ sensors
  function watching() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  function swipe() {
    const t = Date.now();
    if (t - lastInputAt > SWIPE_GAP_MS) send({ t: "swipe", at: t });
    lastInputAt = t;
    if (stage && stage.splatObj && stage.splatObj.fadeStart < 0) stage.wipe(true, 0, 60);
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "image", "color"].includes(type);
    }
    return false;
  }
  function typed() {
    const t = Date.now();
    if (t - lastTypingSent < TYPING_THROTTLE_MS) return;
    lastTypingSent = t;
    send({ t: "type", at: t });
  }

  // A scroll event alone can be the page moving itself (carousels, autoplay), so it only counts
  // when a person did something just before: a press (scrollbar drag) or a gesture.
  let lastGestureAt = -1e9;
  const gesture = () => { lastGestureAt = Date.now(); };
  const opts = { passive: true, capture: true };
  window.addEventListener("wheel", () => { gesture(); swipe(); }, opts);
  window.addEventListener("touchmove", () => { gesture(); swipe(); }, opts);
  window.addEventListener("pointerdown", gesture, opts);
  window.addEventListener("scroll", () => { if (Date.now() - lastGestureAt < 1000) swipe(); }, opts);
  window.addEventListener("keydown", e => {
    if (isEditable(e.composedPath()[0] || e.target)) { typed(); return; }
    // the key is looked at only to sort it into "scrolling key" or not; it is not kept
    if (SCROLL_KEYS.has(e.key)) { gesture(); swipe(); }
    if (e.key === "Escape" && stage) { stage.wipe(true, 0, 60); closeCard(); }
  }, { capture: true });
  window.addEventListener("input", e => { if (isEditable(e.composedPath()[0] || e.target)) typed(); }, { capture: true });

  function focusChanged() {
    const w = watching();
    send({ t: "focus", watching: w });
    if (w) startBeat(); else stopBeat();
  }
  document.addEventListener("visibilitychange", focusChanged);
  window.addEventListener("focus", focusChanged);
  window.addEventListener("blur", focusChanged);

  function startBeat() {
    if (beatTimer) return;
    beatTimer = setInterval(() => {
      if (!watching()) { stopBeat(); send({ t: "focus", watching: false }); return; }
      send({ t: "beat", at: Date.now() });
    }, BEAT_MS);
  }
  function stopBeat() { clearInterval(beatTimer); beatTimer = null; }

  // single-page sites change the URL without reloading: check once a second
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    send({ t: "nav", url: lastHref, at: Date.now(), sinceInput: Date.now() - lastInputAt });
  }, 1000);

  // ------------------------------------------------------------------ overlay
  let host = null, root = null, canvas = null, stage = null, cardEl = null, pointerTimer = null, splatTimer = null;

  function ensureOverlay() {
    if (stage) return stage;
    host = document.createElement("kaak-overlay");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "all:initial;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;" +
      "background:transparent;z-index:2147483647;pointer-events:none;overflow:hidden;display:block;";
    root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CARD_CSS;
    root.appendChild(style);
    canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    root.appendChild(canvas);
    (document.body || document.documentElement).appendChild(host);
    if (host.showPopover) {
      host.setAttribute("popover", "manual");
      try { host.showPopover(); } catch (e) {}
    }
    stage = KaakEngine.createStage(canvas, {
      width: innerWidth, height: innerHeight, dp: 1.0, bg: "none",
      reduceMotion: settings.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
      lineFn: pickLine, fixedFn: fixed,
      font: "'Nunito', 'Hind Siliguri', system-ui, sans-serif",
    });
    stage.attachPointer(canvas);
    stage.start();
    placeColumn();
    addEventListener("resize", () => { if (!stage) return; stage.resize(innerWidth, innerHeight); placeColumn(); });
    // the page may open its own top-layer element (a dialog, fullscreen): stay above it
    document.addEventListener("fullscreenchange", reshow, true);
    pointerTimer = setInterval(() => {
      if (!stage) return;
      canvas.style.pointerEvents = stage.wantsPointer() ? "auto" : "none";
    }, 100);
    return stage;
  }
  // Feeds sit in a centred column on wide windows: keep Kaak beside it (just right of the
  // video's like/comment buttons) instead of at the far edge. Window size only; no page reading.
  function placeColumn() {
    const half = 480;
    if (innerWidth > 2 * half + 160) stage.setColumn(innerWidth / 2 - half, innerWidth / 2 + half);
    else stage.setColumn(null, null);
  }
  function reshow() {
    if (!host || !host.showPopover) return;
    try { host.hidePopover(); host.showPopover(); } catch (e) {}
  }
  function teardown() {
    stopBeat();
    clearInterval(pointerTimer);
    clearTimeout(splatTimer);
    if (stage) { try { stage.stop(); stage.clear(); } catch (e) {} }
    if (host) host.remove();
    host = root = canvas = stage = cardEl = null;
  }

  async function loadFont(b64) {
    try {
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const face = new FontFace("Nunito", bytes.buffer, { weight: "200 1000" });
      await face.load();
      document.fonts.add(face);
    } catch (e) {}
  }

  // lines come from the service worker (a port of Lines.kt), one language at a time
  const recent = {};
  let curMinutes = 0;
  function pickLine(key) {
    const list = lines && lines.pools && lines.pools[key];
    if (!list || !list.length) return ""; // the engine falls back to its own English line
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === recent[key]) i = (i + 1) % list.length;
    recent[key] = i;
    return String(list[i]).replaceAll("{m}", String(curMinutes));
  }
  function fixed(key) { return (lines && lines.fixed && lines.fixed[key]) || ""; }

  function exitFullscreen() {
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
  }

  function perform(a, o) {
    const s = ensureOverlay();
    if (o.minutes != null) curMinutes = o.minutes;
    else if (a.minutes != null) curMinutes = a.minutes;
    s.setGlasses && s.setGlasses(!!o.work);
    s.perchCalm && s.perchCalm(!!o.calm);
    switch (a.type) {
      case "Arrive": o.bedtime ? s.bedArrive() : s.arrive(); break;
      case "Return": o.bedtime ? s.bedArrive() : s.again(o.text); break;
      case "Resume": s.sitNow(); break;
      case "Nudge": s.nudge(a.minutes); break;
      case "Warn": s.warn(); break;
      case "Heckle":
        if (o.bedtime) { s.blanket(); break; }
        if (a.gag === "WALK_ACROSS") s.walkAcross();
        else if (a.gag === "SIT_ON_RAIL") s.sitOnRail();
        else {
          s.splat();
          clearTimeout(splatTimer);
          splatTimer = setTimeout(() => stage && stage.wipe(false, 0, 60), 10_000 + 1700);
        }
        break;
      case "Jumpscare": exitFullscreen(); s.jumpscare(o.level || "MEDIUM"); break;
      case "Eat":
        exitFullscreen();
        s.eat(() => send({ t: "eaten" }));
        break;
      case "Steal":
        exitFullscreen();
        s.snatch(o.text || pickLine("steal"), o.tile);
        setTimeout(() => send({ t: "stolen" }), 2000);
        break;
      case "Snatch": // mood "avoiding": he takes the feed and opens the focus timer
        s.snatch(o.text, o.tile);
        setTimeout(() => send({ t: "snatched" }), 2000);
        break;
      case "Say": if (!s.perched) s.sitNow(); s.say(o.text, o.ms || 2600); break;
      case "Tired": s.bedArrive(); if (o.text) setTimeout(() => s.say(o.text, 2800), 2400); break;
      case "Hide": s.clear(); closeCard(); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ cards (Cards.kt, in the Kit style)
  const CARD_CSS = `
    :host { all: initial; }
    .card { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); width: min(360px, calc(100vw - 32px));
      background: #fff; color: #1F1A17; border-radius: 22px; padding: 18px 18px 16px; box-sizing: border-box;
      box-shadow: 0 6px 0 #E8E2DC, 0 18px 40px rgba(0,0,0,.18); border: 2px solid #EEE8E2;
      font: 600 15px/1.35 'Nunito', 'Hind Siliguri', system-ui, sans-serif; pointer-events: auto;
      animation: up .28s cubic-bezier(.2,1.4,.4,1) both; }
    @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
    @keyframes up { from { transform: translate(-50%, 30px); opacity: 0; } }
    h2 { margin: 0 0 6px; font: 900 19px/1.2 'Nunito', 'Hind Siliguri', system-ui, sans-serif; }
    p { margin: 0 0 12px; color: #5B524C; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    button { flex: 1 1 auto; min-height: 44px; border-radius: 14px; border: 2px solid #E6DFD8; background: #fff; color: #1F1A17;
      font: 800 15px 'Nunito', 'Hind Siliguri', system-ui, sans-serif; box-shadow: 0 4px 0 #E6DFD8; cursor: pointer; padding: 8px 12px; }
    button:active { transform: translateY(3px); box-shadow: 0 1px 0 #E6DFD8; }
    button.main { background: #EF4B3F; border-color: #EF4B3F; color: #fff; box-shadow: 0 4px 0 #B8362C; }
    button.main:active { box-shadow: 0 1px 0 #B8362C; }
    button:focus-visible { outline: 3px solid #1F1A17; outline-offset: 2px; }
    .x { position: absolute; top: 8px; right: 10px; flex: none; min-height: 0; width: 32px; height: 32px; padding: 0; box-shadow: none; border: none; font-size: 18px; color: #8A817A; }
  `;
  let cardTimer = null;
  function closeCard() {
    clearTimeout(cardTimer);
    if (cardEl) { cardEl.remove(); cardEl = null; }
    if (host) host.setAttribute("aria-hidden", "true");
  }
  /** card: {id, title, body, buttons:[{id,label,main}], autoDismissMs} */
  function showCard(card) {
    ensureOverlay();
    closeCard();
    const el = document.createElement("div");
    el.className = "card";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", card.title || "Kaak");
    const h = document.createElement("h2"); h.textContent = card.title || ""; el.appendChild(h);
    if (card.body) { const p = document.createElement("p"); p.textContent = card.body; el.appendChild(p); }
    const rows = card.rows || [card.buttons || []];
    for (const r of rows) {
      const row = document.createElement("div"); row.className = "row";
      for (const b of r) {
        const btn = document.createElement("button");
        btn.type = "button"; btn.textContent = b.label; if (b.main) btn.className = "main";
        btn.addEventListener("click", () => { closeCard(); send({ t: "card", id: card.id, answer: b.id }); });
        row.appendChild(btn);
      }
      el.appendChild(row);
    }
    const x = document.createElement("button");
    x.className = "x"; x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", "Close");
    x.addEventListener("click", () => { closeCard(); send({ t: "card", id: card.id, answer: null }); });
    el.appendChild(x);
    root.appendChild(el);
    cardEl = el;
    host.removeAttribute("aria-hidden");
    if (card.autoDismissMs) cardTimer = setTimeout(() => { if (cardEl === el) { closeCard(); send({ t: "card", id: card.id, answer: null }); } }, card.autoDismissMs);
  }

  // ------------------------------------------------------------------ messages from the service worker
  function onMessage(m) {
    switch (m.t) {
      case "setup":
        lines = m.lines; lang = m.lang; settings = m.settings || settings;
        if (m.font) loadFont(m.font);
        if (watching()) startBeat();
        break;
      case "lines": lines = m.lines; lang = m.lang; break;
      case "act": perform(m.action, m.opts || {}); break;
      case "card": showCard(m.card); break;
      case "closeCard": closeCard(); break;
      case "hideAll": if (stage) stage.clear(); closeCard(); break;
      case "bye": alive = false; teardown(); break;
    }
  }

  connect();
  if (watching()) startBeat();
})();
