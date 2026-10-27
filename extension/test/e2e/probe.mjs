// Quick check: does the browser load the extension, and does its service worker start?
import { launch, findTarget, attach, sleep } from "./cdp.mjs";
const { cdp, proc } = await launch({ extDir: new URL("../../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") });
try {
  const sw = await findTarget(cdp, t => t.type === "service_worker" && t.url.includes("service-worker.js"), 40);
  console.log("service worker:", sw ? sw.url : "NOT FOUND");
  if (sw) {
    const s = await attach(cdp, sw.targetId);
    await sleep(1000);
    console.log(await s.eval(`(async () => { const r = await new Promise(res => chrome.runtime.sendMessage ? res('ok') : res('no')); return r; })()`));
  }
  const { targetInfos } = await cdp.send("Target.getTargets");
  console.log(targetInfos.map(t => t.type + " " + t.url).join("\n"));
} finally { proc.kill(); }
