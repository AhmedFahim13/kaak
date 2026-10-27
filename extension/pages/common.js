// Shared by Kaak's pages and popup. Pages never change state themselves: they ask the
// service worker, which owns the brain, the wallet and the settings.

export function ask(msg) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; resolve(r); });
    } catch (e) { resolve(null); }
  });
}

export function openKaak(route = "home") {
  const url = chrome.runtime.getURL("pages/kaak.html#" + route);
  chrome.tabs.create({ url });
  if (location.pathname.endsWith("popup.html")) window.close();
}

/** Kaak sitting still (no animation): popup, headers, small figures. */
export function drawStillCrow(canvas, { mood = "stare", glasses = false, scale = 1 } = {}) {
  const E = globalThis.KaakEngine;
  if (!E) return;
  const dpr = Math.min(devicePixelRatio || 1, 2.5);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const faces = {
    stare: { brow: -0.35, lid: 0.48, look: 1 },
    grin: { brow: 0.4, lid: 0.3, beakOpen: 0.3 },
    sulk: { brow: 0.9, lid: 0.6, look: -1, headTilt: 0.4 },
    sleep: { eyeOpen: 0, squash: 0.85 },
  };
  const unit = (h / 120) * scale;
  const p = E.P(w * 0.42, h * 0.72, { facing: 1, ...(faces[mood] || faces.stare) });
  E.drawCrow(c, p, unit, glasses);
}

export const fmtMin = m => `${m} min`;

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
