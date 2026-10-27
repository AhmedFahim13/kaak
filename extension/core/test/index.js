// Entry point so `node --test extension/core/test/` works: Node 25 runs a directory argument
// as one module (package.json "main"), so this loads every *.test.js file in this folder.
// `node --test extension/core/test/*.test.js` works too.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.js')).sort()) {
  await import(pathToFileURL(join(dir, f)).href);
}
