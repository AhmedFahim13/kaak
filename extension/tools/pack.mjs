// Builds dist/kaak-extension-<version>.zip for the Edge/Opera stores and for "Load unpacked"
// testers. Only what the extension needs at runtime goes in: no tests, no tools, no docs.
// Node built-ins only (zlib for deflate and crc32). Usage: node tools/pack.mjs
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const INCLUDE = ["manifest.json", "sw", "content", "pages", "engine/kaak-engine.js", "assets",
  "core/model.js", "core/scroll-tracker.js", "core/rule-detector.js", "core/kaak-brain.js", "core/lines.js",
  "core/commitment.js", "core/week.js", "core/detours.js", "core/bribes.js", "core/sites.js", "core/tasks.js", "core/proof.js"];

function walk(p) {
  const full = join(root, p);
  if (statSync(full).isDirectory()) return readdirSync(full).flatMap(n => walk(join(p, n)));
  return [p];
}
const files = INCLUDE.flatMap(walk).map(p => p.split(sep).join("/")).sort();
const version = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")).version;

const chunks = [], central = [];
let offset = 0;
const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1; // fixed date: reproducible zips
for (const name of files) {
  const data = readFileSync(join(root, name));
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const nameBuf = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
  chunks.push(local, nameBuf, comp);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
  c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, nameBuf);
  offset += 30 + nameBuf.length + comp.length;
}
const cdSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", `kaak-extension-${version}.zip`);
writeFileSync(out, Buffer.concat([...chunks, ...central, end]));
console.log(`${relative(root, out)}: ${files.length} files, ${(statSync(out).size / 1024).toFixed(0)} KB`);
