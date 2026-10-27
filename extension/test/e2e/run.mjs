// End-to-end: the real extension in a throwaway Edge/Chrome profile, against a fake feed site
// (the browser maps instagram.com etc. to test/e2e/fake-feed.mjs). Kaak's clock is moved forward
// with the dev hook so minutes pass in seconds. Usage: node test/e2e/run.mjs [--headed]
import { writeFileSync, mkdirSync } from "node:fs";
import { start } from "./fake-feed.mjs";
import { launch, findTarget, attach, sleep } from "./cdp.mjs";

const root = new URL("../../", import.meta.url);
const path = p => new URL(p, root).pathname.replace(/^\/(\w:)/, "$1");
const shots = path("test/e2e/shots/");
mkdirSync(shots, { recursive: true });
const headed = process.argv.includes("--headed");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const server = await start(443).catch(() => null);
if (!server) { console.error("could not listen on 443"); process.exit(2); }
const HOSTS = ["instagram.com", "facebook.com", "youtube.com", "tiktok.com"];
const hostRules = HOSTS.flatMap(h => [`MAP ${h} 127.0.0.1`, `MAP *.${h} 127.0.0.1`]).join(", ");
const extArg = process.argv.find(a => a.startsWith("--ext="));
const { cdp, proc } = await launch({ extDir: extArg ? extArg.slice(6) : path("."), hostRules, headless: !headed });
const errors = [];

try {
  const swT = await findTarget(cdp, t => t.type === "service_worker" && t.url.includes("/sw/service-worker.js"));
  check("service worker starts", !!swT);
  const extId = new URL(swT.url).host;
  const sw = await attach(cdp, swT.targetId);
  await sw.send("Runtime.enable");
  cdp.on(m => {
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
  });

  // Kaak's welcome page opens on install
  const welcome = await findTarget(cdp, t => t.type === "page" && t.url.includes("kaak.html#welcome"));
  check("welcome page opens on install", !!welcome);
  const kp = await attach(cdp, welcome.targetId);
  await kp.send("Runtime.enable");
  await sleep(800);
  await shot(kp, "01-welcome");
  const ask = msg => sw.eval(`globalThis.__kaak.ask(${JSON.stringify(msg)})`);
  await ask({ t: "onboarded", patch: { arrivalMin: 1, gagEverySec: 30, dailyLimitMin: 6 } });

  // open a "Reels" tab and scroll like a person on autopilot
  const { targetId } = await cdp.send("Target.createTarget", { url: "https://www.instagram.com/reels/r0/" });
  const feed = await attach(cdp, targetId);
  await feed.send("Page.enable"); await feed.send("Runtime.enable");
  await feed.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(2500);
  let dbg = await ask({ t: "debug" });
  check("feed tab is seen as a feed", dbg.inFeed && dbg.tabs.some(t => t.isFeed && t.siteId === "instagram"), JSON.stringify(dbg.tabs));
  check("feed tab counts as watched (not looking away)", !dbg.lookingAway);

  async function scrollFor(n, advanceMs = 9000) {
    for (let i = 0; i < n; i++) {
      await feed.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 600, y: 400, deltaX: 0, deltaY: 640 });
      await sleep(400);
      await ask({ t: "dev", advanceMs, tick: true });
      await sleep(250);
    }
    return ask({ t: "debug" });
  }

  dbg = await scrollFor(10);
  check("fast swiping is MINDLESS", dbg.detection && dbg.detection.verdict === "MINDLESS", JSON.stringify(dbg.detection));
  check("Kaak arrives after 1 mindless minute", /ARRIVE|NUDGE|HECKLE/.test(dbg.lastAction), dbg.lastAction);
  await sleep(2600);
  await shot(feed, "02-arrive");

  // typing in a comment box flips the verdict
  await feed.eval(`document.getElementById("comment").focus()`);
  for (const ch of "nice") await feed.send("Input.dispatchKeyEvent", { type: "char", text: ch });
  await ask({ t: "dev", advanceMs: 3000, tick: true });
  dbg = await ask({ t: "debug" });
  check("typing counts as intentional", dbg.detection && dbg.detection.reason === "typing", JSON.stringify(dbg.detection));
  await feed.eval(`document.activeElement.blur()`);

  // switching to another tab is looking away, not leaving
  await feed.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  const other = await cdp.send("Target.createTarget", { url: "about:blank" });
  await cdp.send("Target.activateTarget", { targetId: other.targetId });
  await sleep(1200);
  dbg = await ask({ t: "debug" });
  check("blur = looking away, still in feed", dbg.inFeed && dbg.lookingAway, `inFeed ${dbg.inFeed} lookingAway ${dbg.lookingAway}`);
  await cdp.send("Target.closeTarget", { targetId: other.targetId });
  await cdp.send("Target.activateTarget", { targetId });
  await feed.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(800);
  dbg = await ask({ t: "debug" });
  check("back to the tab = looking again", dbg.inFeed && !dbg.lookingAway, `lookingAway ${dbg.lookingAway}`);

  // theft: close the feed, reopen within 2 minutes
  await cdp.send("Target.closeTarget", { targetId });
  await sleep(1200);
  await ask({ t: "dev", advanceMs: 30_000 });
  const t2 = await cdp.send("Target.createTarget", { url: "https://www.instagram.com/" });
  const feed2 = await attach(cdp, t2.targetId);
  await feed2.send("Page.enable"); await feed2.send("Runtime.enable");
  await feed2.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(1200);
  await shot(feed2, "03-steal");
  await sleep(3000);
  let url = await targetUrl(t2.targetId);
  check("reopening within 2 min = theft, tab goes to the chase", url.includes("kaak.html#theft"), url);
  const theft = await attach(cdp, t2.targetId);
  await theft.send("Runtime.enable");
  await theft.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(1500);
  await shot(theft, "04-chase");
  // every feed is locked while he has it: a new feed tab is redirected
  const t3 = await cdp.send("Target.createTarget", { url: "https://www.youtube.com/" });
  await sleep(1500);
  url = await targetUrl(t3.targetId);
  check("theft locks every feed (redirect rule)", url.includes("kaak.html") && url.includes("lock=theft"), url);
  await cdp.send("Target.closeTarget", { targetId: t3.targetId });
  // win the chase with the keyboard: 5 Enters (into the tab in front)
  await cdp.send("Target.activateTarget", { targetId: t2.targetId });
  await sleep(300);
  console.log("  chase state:", await theft.eval(`JSON.stringify({ chase: !!(globalThis.__kaakStage && __kaakStage.chase), hits: __kaakStage && __kaakStage.chase && __kaakStage.chase.hits, active: document.activeElement && document.activeElement.className, focus: document.hasFocus() })`));
  for (let i = 0; i < 5; i++) {
    await theft.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await theft.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(350);
  }
  console.log("  after keys:", await theft.eval(`JSON.stringify({ chase: !!__kaakStage.chase, hits: __kaakStage.chase && __kaakStage.chase.hits })`).catch(e => e.message));
  await sleep(6000);
  url = await targetUrl(t2.targetId);
  check("5 hits win the chase, back to the site", url.startsWith("https://www.instagram.com/"), url);
  const rules = await sw.eval(`chrome.declarativeNetRequest.getDynamicRules().then(r => r.length)`);
  check("no lock rules left after the chase", rules === 0, `${rules} rules`);

  // eating: keep scrolling to the 6-minute limit
  const feed3 = await attach(cdp, t2.targetId);
  await feed3.send("Runtime.enable");
  await feed3.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(1500);
  for (let i = 0; i < 40; i++) {
    await feed3.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 600, y: 400, deltaX: 0, deltaY: 640 }).catch(() => {});
    await sleep(300);
    await ask({ t: "dev", advanceMs: 12_000, tick: true });
    await sleep(200);
    dbg = await ask({ t: "debug" });
    if (/EAT/.test(dbg.lastAction)) break;
  }
  check("daily limit: Kaak eats the feed", /EAT/.test(dbg.lastAction), `${dbg.lastAction}, ${dbg.dailyMin} min`);
  await sleep(1400);
  await shot(feed3, "05-eating").catch(() => {});
  await sleep(4000);
  url = await targetUrl(t2.targetId);
  check("after eating, the tab shows the eaten screen", url.includes("kaak.html#eaten"), url);
  const eatenPage = await attach(cdp, t2.targetId);
  await sleep(1200);
  await shot(eatenPage, "06-eaten");

  // nap: feeds redirect to the nap cover; chats stay reachable
  const t4 = await cdp.send("Target.createTarget", { url: "https://www.instagram.com/explore/" });
  await sleep(1500);
  url = await targetUrl(t4.targetId);
  check("nap: a feed opens to the nap cover", url.includes("lock=nap") && url.includes("site=instagram"), url);
  const nap = await attach(cdp, t4.targetId);
  await nap.send("Runtime.enable");
  await sleep(1500);
  await shot(nap, "07-nap");
  const napText = await nap.eval(`document.body.innerText.slice(0, 120)`).catch(e => "error: " + e.message);
  check("nap cover actually renders (not blocked)", /asleep|full|ate/i.test(napText), napText.replace(/\s+/g, " "));
  const t5 = await cdp.send("Target.createTarget", { url: "https://www.instagram.com/direct/inbox/" });
  await sleep(1500);
  url = await targetUrl(t5.targetId);
  check("nap: chats are never locked", url.startsWith("https://www.instagram.com/direct/"), url);

  // escape: hold 20 s, type the sentence, get a pass
  await nap.send("Runtime.enable");
  await cdp.send("Target.activateTarget", { targetId: t4.targetId });
  await nap.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await nap.eval(`location.hash = "escape?site=instagram"`);
  await sleep(1500);
  await shot(nap, "08-escape");
  const ring = await nap.eval(`(() => { const r = document.querySelector(".ring").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await nap.send("Input.dispatchMouseEvent", { type: "mousePressed", x: ring.x, y: ring.y, button: "left", clickCount: 1 });
  await sleep(21_000);
  await nap.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ring.x, y: ring.y, button: "left", clickCount: 1 });
  const phrase = await nap.eval(`document.querySelector(".phrase").textContent`);
  // a paste is rejected
  await nap.eval(`document.querySelector("textarea").focus()`);
  await nap.send("Input.insertText", { text: phrase });
  const afterPaste = await nap.eval(`document.querySelector("textarea").value.length`);
  check("escape: pasting the sentence is rejected", afterPaste === 0, `length after paste ${afterPaste}`);
  for (const ch of phrase) await nap.send("Input.dispatchKeyEvent", { type: "char", text: ch });
  await sleep(300);
  const enabled = await nap.eval(`!document.querySelector(".btn.main").disabled`);
  check("escape: typing the sentence unlocks the button", enabled);
  await nap.eval(`document.querySelector(".btn.main").click()`);
  await sleep(2500);
  url = await targetUrl(t4.targetId);
  check("escape: a 5-minute pass into the feed", url.startsWith("https://www.instagram.com/"), url);
  const t6 = await cdp.send("Target.createTarget", { url: "https://www.facebook.com/" });
  await sleep(1500);
  url = await targetUrl(t6.targetId);
  check("escape pass: other feeds open too", url.startsWith("https://www.facebook.com/"), url);

  // the pass runs out: the nap comes back
  await ask({ t: "dev", advanceMs: 5 * 60_000 + 5000, tick: true });
  await sleep(2500);
  const t7 = await cdp.send("Target.createTarget", { url: "https://www.tiktok.com/" });
  await sleep(1500);
  url = await targetUrl(t7.targetId);
  check("pass over: feeds go back to the nap cover", url.includes("lock=nap"), url);

  // the nap ends: rules are gone, nothing is stuck
  await ask({ t: "dev", advanceMs: 21 * 60_000, tick: true });
  await sleep(1500);
  const left = await sw.eval(`chrome.declarativeNetRequest.getDynamicRules().then(r => r.length)`);
  check("nap over: no redirect rules left", left === 0, `${left} rules`);

  // Kaak's pages render
  for (const route of ["home", "bribes", "nest", "times", "settings", "stats", "detours", "task/breathing", "strict"]) {
    await kp.eval(`location.hash = ${JSON.stringify(route)}`);
    await sleep(900);
    const txt = await kp.eval(`document.getElementById("app").innerText.slice(0, 80)`);
    check(`page #${route} renders`, txt && !/Something went wrong/.test(txt), txt.replace(/\s+/g, " "));
    await shot(kp, "10-" + route.replace("/", "-"));
  }
} catch (e) {
  check("run finished", false, e.stack);
} finally {
  check("no errors in the service worker", errors.length === 0, errors.slice(0, 5).join(" | "));
  writeFileSync(path("test/e2e/shots/results.json"), JSON.stringify(results, null, 1));
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  proc.kill();
  server.close();
  process.exit(failed ? 1 : 0);
}

async function targetUrl(id) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  return (targetInfos.find(t => t.targetId === id) || {}).url || "";
}
async function shot(s, name) {
  try {
    const r = await s.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(shots + name + ".png", Buffer.from(r.data, "base64"));
  } catch (e) {}
}
