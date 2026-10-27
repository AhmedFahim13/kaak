// Smoke test on a real feed site (read-only: no sign-in, no clicks): does the content script load,
// do wheel swipes count, and does Kaak draw over the real page? Usage: node test/e2e/real-site.mjs [url]
import { writeFileSync, mkdirSync } from "node:fs";
import { launch, findTarget, attach, sleep } from "./cdp.mjs";
const path = p => new URL(p, new URL("../../", import.meta.url)).pathname.replace(/^\/(\w:)/, "$1");
const url = process.argv[2] || "https://www.youtube.com/shorts";
mkdirSync(path("test/e2e/shots"), { recursive: true });
const { cdp, proc } = await launch({ extDir: path("."), port: 9336 });
try {
  const swT = await findTarget(cdp, t => t.type === "service_worker" && t.url.includes("/sw/service-worker.js"));
  const sw = await attach(cdp, swT.targetId);
  const ask = m => sw.eval(`globalThis.__kaak.ask(${JSON.stringify(m)})`);
  for (let i = 0; i < 40 && await sw.eval("typeof globalThis.__kaak") !== "object"; i++) await sleep(250); // worker still starting
  await ask({ t: "onboarded", patch: { arrivalMin: 1, gagEverySec: 30 } });
  const { targetId } = await cdp.send("Target.createTarget", { url });
  const page = await attach(cdp, targetId);
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(6000);
  let d = await ask({ t: "debug" });
  console.log("tabs:", JSON.stringify(d.tabs));
  for (let i = 0; i < 10; i++) {
    await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: 120 });
    await sleep(1500);
    await ask({ t: "dev", advanceMs: 8000, tick: true });
  }
  d = await ask({ t: "debug" });
  console.log("detection:", JSON.stringify(d.detection), "stats:", JSON.stringify(d.stats && { n: d.stats.swipesInWindow, perMin: +d.stats.swipesPerMin.toFixed(1), dwell: d.stats.medianDwellMs }));
  console.log("last action:", d.lastAction, " mindless:", d.mindlessMin);
  await sleep(3000);
  const r = await page.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path("test/e2e/shots/real-site.png"), Buffer.from(r.data, "base64"));
  const { targetInfos } = await cdp.send("Target.getTargets");
  console.log("page url now:", (targetInfos.find(t => t.targetId === targetId) || {}).url);
} finally { proc.kill(); }
