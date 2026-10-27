// Screenshot of the toolbar popup page and the settings page, for a visual check. Dev only.
import { writeFileSync } from "node:fs";
import { launch, findTarget, attach, sleep } from "./cdp.mjs";
const path = p => new URL(p, new URL("../../", import.meta.url)).pathname.replace(/^\/(\w:)/, "$1");
const { cdp, proc } = await launch({ extDir: path("."), port: 9335, width: 420, height: 520 });
try {
  const sw = await findTarget(cdp, t => t.type === "service_worker" && t.url.includes("/sw/service-worker.js"));
  const id = new URL(sw.url).host;
  for (const [name, url] of [["popup", "pages/popup.html"], ["welcome-2", "pages/kaak.html#welcome"]]) {
    const { targetId } = await cdp.send("Target.createTarget", { url: `chrome-extension://${id}/${url}` });
    const s = await attach(cdp, targetId);
    await sleep(1500);
    const r = await s.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path(`test/e2e/shots/${name}.png`), Buffer.from(r.data, "base64"));
  }
} finally { proc.kill(); }
