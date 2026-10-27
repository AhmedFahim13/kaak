// Store images for Edge Add-ons and Opera add-ons, made with the real extension in a throwaway
// headless profile against an unbranded fake feed (no real site's content or logos).
// Writes extension/store/images/. Usage: node test/e2e/store-shots.mjs   (needs port 443 free)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { start } from "./fake-feed.mjs";
import { launch, findTarget, attach, sleep } from "./cdp.mjs";

const root = new URL("../../", import.meta.url);
const path = p => new URL(p, root).pathname.replace(/^\/(\w:)/, "$1");
const out = path("store/images/");
mkdirSync(out + "opera", { recursive: true });
const W = 1280, H = 800;

const server = await start(443, { pretty: true });
const HOSTS = ["instagram.com", "facebook.com", "youtube.com", "tiktok.com"];
const hostRules = HOSTS.flatMap(h => [`MAP ${h} 127.0.0.1`, `MAP *.${h} 127.0.0.1`]).join(", ");
const { cdp, proc } = await launch({ extDir: path("."), hostRules, width: W, height: H });
const shots = [];

try {
  const swT = await findTarget(cdp, t => t.type === "service_worker" && t.url.includes("/sw/service-worker.js"));
  const sw = await attach(cdp, swT.targetId);
  for (let i = 0; i < 40 && await sw.eval("typeof globalThis.__kaak") !== "object"; i++) await sleep(250);
  const ask = m => sw.eval(`globalThis.__kaak.ask(${JSON.stringify(m)})`);
  // the welcome tab Kaak opens on install keeps other headless tabs hidden (unpainted): close it
  const welcome = await findTarget(cdp, t => t.type === "page" && t.url.includes("kaak.html#welcome"));
  if (welcome) await cdp.send("Target.closeTarget", { targetId: welcome.targetId });
  await ask({ t: "onboarded", patch: { arrivalMin: 1, gagEverySec: 300, dailyLimitMin: 6, jumpscare: "OFF" } });

  const open = async url => {
    const { targetId } = await cdp.send("Target.createTarget", { url });
    const s = await attach(cdp, targetId);
    await cdp.send("Target.activateTarget", { targetId });
    await s.send("Page.bringToFront");
    await s.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await s.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await s.send("Runtime.enable");
    return { ...s, targetId };
  };
  const shot = async (s, name) => {
    const r = await s.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(out + name + ".png", Buffer.from(r.data, "base64"));
    shots.push(name);
    console.log("shot", name);
  };
  const key = async (s, k, code, vk) => {
    await s.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
    await s.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
  };
  const wheel = s => s.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 420, deltaX: 0, deltaY: 690 });
  const lastAction = async () => (await ask({ t: "debug" })).lastAction;

  // 1. he arrives, with the first-time card
  let feed = await open("https://www.instagram.com/reels/p0/");
  await sleep(2500);
  for (let i = 0; i < 20 && !/ARRIVE/.test(await lastAction()); i++) {
    await wheel(feed); await sleep(350);
    await ask({ t: "dev", advanceMs: 9000, tick: true }); await sleep(200);
  }
  await sleep(5600);
  await shot(feed, "1-arrive");
  await key(feed, "Escape", "Escape", 27);
  await sleep(4000);

  // 2. a heckle that leaves a mark
  await ask({ t: "dev", act: { type: "Heckle", gag: "SPLAT", minutes: 23 } });
  await sleep(2600);
  await shot(feed, "2-splat");
  await key(feed, "Escape", "Escape", 27);
  await sleep(6000);

  // 3. the jumpscare (one smooth dim, a crack, KAA!)
  await ask({ t: "dev", act: { type: "Jumpscare" }, opts: { level: "MEDIUM" } });
  await sleep(1150);
  await shot(feed, "3-jumpscare");
  await sleep(7000);

  // 4. theft: close the feed, come back within 2 minutes
  await cdp.send("Target.closeTarget", { targetId: feed.targetId });
  await sleep(1200);
  await ask({ t: "dev", advanceMs: 30_000 });
  feed = await open("https://www.instagram.com/");
  await sleep(4200);
  const chase = await attach(cdp, feed.targetId);
  await cdp.send("Target.activateTarget", { targetId: feed.targetId });
  await chase.send("Page.bringToFront");
  await chase.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await chase.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(2400);
  await chase.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await chase.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(250);
  await shot(chase, "4-theft");
  await cdp.send("Target.activateTarget", { targetId: feed.targetId });
  for (let i = 0; i < 5; i++) { await key(chase, "Enter", "Enter", 13); await sleep(350); }
  await sleep(6500);

  // 5. the daily limit: he eats the feed and naps on it
  feed = await open("https://www.instagram.com/reels/p3/");
  await sleep(2000);
  for (let i = 0; i < 40 && !/EAT/.test(await lastAction()); i++) {
    await wheel(feed).catch(() => {}); await sleep(300);
    await ask({ t: "dev", advanceMs: 12_000, tick: true }); await sleep(200);
  }
  await sleep(6000);
  const nap = await open("https://www.instagram.com/explore/");
  await sleep(2500);
  await shot(nap, "5-nap");

  // 6. the way out: hold him, then type a sentence
  await cdp.send("Target.activateTarget", { targetId: nap.targetId });
  await nap.send("Page.bringToFront");
  await nap.eval(`location.hash = "escape?site=instagram"`);
  await sleep(1500);
  const ring = await nap.eval(`(() => { const r = document.querySelector(".ring").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await nap.send("Input.dispatchMouseEvent", { type: "mousePressed", x: ring.x, y: ring.y, button: "left", clickCount: 1 });
  await sleep(8500);
  await shot(nap, "6-escape");
  await nap.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ring.x, y: ring.y, button: "left", clickCount: 1 });

  // Opera: 612x408 (3:2), cropped from the centre of each 1280x800 shot
  const page = await open("about:blank");
  for (const name of shots) {
    const b64 = readFileSync(out + name + ".png").toString("base64");
    const small = await page.eval(`new Promise(res => { const img = new Image(); img.onload = () => {
      const c = document.createElement("canvas"); c.width = 612; c.height = 408; const g = c.getContext("2d");
      g.imageSmoothingQuality = "high"; const sw = 800 * 1.5; g.drawImage(img, (1280 - sw) / 2, 0, sw, 800, 0, 0, 612, 408);
      res(c.toDataURL("image/png").split(",")[1]); }; img.src = "data:image/png;base64,${b64}"; })`);
    writeFileSync(out + "opera/" + name + ".png", Buffer.from(small, "base64"));
  }

  // logo and promotional tiles, drawn with the engine's own crow and the bundled Nunito font
  const font = readFileSync(path("assets/fonts/Nunito.ttf")).toString("base64");
  await page.eval(readFileSync(path("engine/kaak-engine.js"), "utf8") + ";0");
  await page.eval(`(async () => { const b = Uint8Array.from(atob("${font}"), c => c.charCodeAt(0));
    const f = new FontFace("Nunito", b.buffer, { weight: "200 1000" }); await f.load(); document.fonts.add(f); return 1; })()`);
  const art = async (name, w, h, js) => {
    const b64 = await page.eval(`(() => { const E = KaakEngine, c = document.createElement("canvas"); c.width = ${w}; c.height = ${h};
      const g = c.getContext("2d"); ${js}; return c.toDataURL("image/png").split(",")[1]; })()`);
    writeFileSync(out + name + ".png", Buffer.from(b64, "base64"));
    console.log("art", name);
  };
  const crow = (x, y, size, facing) => `E.drawCrow(g, E.P(${x} + ${size} * (${facing} > 0 ? 0.43 : 0.57), ${y} + ${size} * 0.86, { facing: ${facing}, brow: -0.35, lid: 0.48, look: 1 }), ${size} / 118, false);`;
  // logo: Kaak on a soft cream disc (Edge shows it on white)
  await art("logo-300", 300, 300, `g.fillStyle = "#FDECEA"; g.beginPath(); g.arc(150, 150, 146, 0, Math.PI * 2); g.fill(); ${crow(30, 26, 240, 1)}`);
  const tile = (w, h, size, title, sub, tx, ty, ts, ss) => `
    const grad = g.createLinearGradient(0, 0, ${w}, ${h}); grad.addColorStop(0, "#EF4B3F"); grad.addColorStop(1, "#C8372D");
    g.fillStyle = grad; g.fillRect(0, 0, ${w}, ${h});
    g.fillStyle = "rgba(255,255,255,.10)"; for (let i = 0; i < 9; i++) g.fillRect(i * ${w} / 9, 0, ${w} / 18, ${h});
    ${crow(w - size - Math.round(h * 0.02), (h - size) / 2 + h * 0.04, size, -1)}
    g.fillStyle = "#fff"; g.textBaseline = "alphabetic";
    g.font = "900 ${ts}px Nunito"; g.fillText(${JSON.stringify(title)}, ${tx}, ${ty});
    g.font = "800 ${ss}px Nunito"; g.fillStyle = "rgba(255,255,255,.92)";
    ${JSON.stringify(sub)}.split("\\n").forEach((l, i) => g.fillText(l, ${tx}, ${ty} + ${ss} * 1.35 * (i + 1) + ${ss} * 0.3));`;
  await art("tile-small-440x280", 440, 280, tile(440, 280, 168, "Kaak", "The crow who\nhates doomscrolling.", 24, 120, 60, 20));
  await art("tile-large-1400x560", 1400, 560, tile(1400, 560, 470, "Kaak", "A petty Dhaka house crow who\ninterrupts your doomscrolling.", 90, 250, 150, 46));
} finally {
  proc.kill();
  server.close();
}
