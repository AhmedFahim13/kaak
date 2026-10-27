// A stand-in "feed site" for end-to-end tests. The test browser maps instagram.com, youtube.com etc.
// to this server (--host-resolver-rules), so the real extension runs against it without touching
// the real sites. Dev only: not part of the extension zip.
import https from "node:https";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prettyFeed } from "./pretty-feed.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const certDir = join(here, ".cert");

function cert() {
  const key = join(certDir, "key.pem"), crt = join(certDir, "cert.pem");
  if (!existsSync(key)) {
    mkdirSync(certDir, { recursive: true });
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt,
      "-days", "30", "-subj", "/CN=kaak-test"], { stdio: "ignore" });
  }
  return { key: readFileSync(key), cert: readFileSync(crt) };
}

const FEED = (title, kind) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;font:16px system-ui;background:#fafafa}.post{height:620px;margin:16px auto;max-width:470px;background:#fff;border:1px solid #ddd;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:40px;color:#999}
input{display:block;margin:12px auto;width:300px;font-size:16px}</style></head><body>
<input id="comment" placeholder="Add a comment">
${Array.from({ length: 200 }, (_, i) => `<div class="post" data-i="${i}">${kind} ${i}</div>`).join("")}
<script>
  // like Reels/Shorts: the URL names the item you're on
  let cur = -1;
  addEventListener("scroll", () => {
    const i = Math.floor(scrollY / 636);
    if (i !== cur && ${kind === "reel" ? "true" : "false"}) { cur = i; history.replaceState(null, "", "/reels/r" + i + "/"); }
  });
</script></body></html>`;

const CHAT = `<!doctype html><html><head><title>Chats</title></head><body><h1>Direct messages</h1><input placeholder="Message"></body></html>`;

export function start(port = 8787, { pretty = false } = {}) {
  const server = https.createServer(cert(), (req, res) => {
    const host = (req.headers.host || "").split(":")[0];
    const path = req.url || "/";
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (path.startsWith("/direct") || path.startsWith("/messages")) return res.end(CHAT);
    if (pretty) return res.end(prettyFeed());
    if (path.startsWith("/reels")) return res.end(FEED("Reels", "reel"));
    res.end(FEED(host, "post"));
  });
  return new Promise(r => server.listen(port, "127.0.0.1", () => r(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().then(() => console.log("fake feed on https://127.0.0.1:8787"));
}
