// A tiny Chrome DevTools Protocol client (Node's built-in WebSocket; no packages) and a launcher
// that starts Edge or Chrome with a throwaway profile and Kaak loaded. Dev only.
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];

export class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message + " " + (m.error.data || ""))) : res(m.result);
      } else if (m.method) c.handlers.forEach(h => h(m));
    };
    return c;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(fn) { this.handlers.push(fn); }
  close() { this.ws.close(); }
}

export async function launch({ extDir, port = 9333, hostRules, headless = true, width = 1280, height = 800 }) {
  const exe = BROWSERS.find(existsSync);
  if (!exe) throw new Error("no Edge/Chrome found");
  const profile = mkdtempSync(join(tmpdir(), "kaak-e2e-"));
  const ext = resolve(extDir);
  const args = [
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check",
    `--load-extension=${ext}`, `--disable-extensions-except=${ext}`,
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    "--ignore-certificate-errors", `--window-size=${width},${height}`, "--disable-sync", "--no-proxy-server",
    ...(hostRules ? [`--host-resolver-rules=${hostRules}`] : []),
    ...(headless ? ["--headless=new"] : []),
    "about:blank",
  ];
  const proc = spawn(exe, args, { stdio: "ignore" });
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    await sleep(250);
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) {}
  }
  if (!ver) { proc.kill(); throw new Error("browser didn't start"); }
  const cdp = await CDP.connect(ver.webSocketDebuggerUrl);
  return { cdp, proc, profile, exe };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Attach to a target and return a helper bound to its session. */
export async function attach(cdp, targetId) {
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const s = {
    sessionId,
    send: (m, p) => cdp.send(m, p, sessionId),
    async eval(expr) {
      const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
  };
  return s;
}

export async function findTarget(cdp, pred, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const t = targetInfos.find(pred);
    if (t) return t;
    await sleep(250);
  }
  return null;
}
