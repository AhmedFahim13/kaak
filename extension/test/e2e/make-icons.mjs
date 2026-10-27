// Renders Kaak's toolbar/store icons with the engine's own drawCrow (sticker outline, gamcha,
// chipped beak) and writes PNGs to assets/icons. Run again if the crow drawing changes.
import { readFileSync, writeFileSync } from "node:fs";
import { launch, findTarget, attach } from "./cdp.mjs";

const root = new URL("../../", import.meta.url);
const path = p => new URL(p, root).pathname.replace(/^\/(\w:)/, "$1");
const engine = readFileSync(path("engine/kaak-engine.js"), "utf8");
const { cdp, proc } = await launch({ extDir: path("assets"), port: 9334 }); // any dir: no extension needed
try {
  const page = await findTarget(cdp, t => t.type === "page");
  const s = await attach(cdp, page.targetId);
  await s.eval(engine + ";0");
  for (const size of [16, 32, 48, 128]) {
    const b64 = await s.eval(`(() => {
      const E = globalThis.KaakEngine, n = ${size}, k = 4;           // draw 4x, then scale down smoothly
      const big = document.createElement("canvas"); big.width = big.height = n * k;
      const c = big.getContext("2d");
      const unit = n * k / 118;                                          // crow ~ 118 units tall incl. outline
      E.drawCrow(c, E.P(n * k * 0.43, n * k * 0.86, { facing: 1, brow: -0.35, lid: 0.48, look: 1 }), unit, false);
      const out = document.createElement("canvas"); out.width = out.height = n;
      const o = out.getContext("2d"); o.imageSmoothingQuality = "high"; o.drawImage(big, 0, 0, n, n);
      return out.toDataURL("image/png").split(",")[1];
    })()`);
    writeFileSync(path(`assets/icons/kaak-${size}.png`), Buffer.from(b64, "base64"));
    console.log("wrote", size);
  }
} finally { proc.kill(); }
