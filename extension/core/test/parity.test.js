// JS-only drift guard: reads the Kotlin sources (when this runs inside the repo) and checks the
// JS tables still match them: every Lines.kt string, the Chaos/Trust numbers, the escape sentences.
// Skipped when the app sources aren't next to the extension.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { FIXED, LINES, MOOD_LABELS, MOOD_REPLIES } from '../lines.js';
import { Chaos, MINUTE_MS, TrustLevel } from '../model.js';
import { EscapeRules } from '../commitment.js';
import { DetectorConfig } from '../rule-detector.js';

const core = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app', 'src', 'main', 'java', 'app', 'kaak', 'core');
const skip = !existsSync(join(core, 'Lines.kt')) && 'app sources not found';
const kt = (f) => readFileSync(join(core, f), 'utf8');

/** Kotlin string literals in a source fragment ("..." with \" escapes), $minutes -> {m}. */
function literals(src) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\$minutes/g, '{m}'));
  return out;
}

describe('parity with the Kotlin sources', { skip }, () => {
  test('every Lines.kt string is in lines.js, and nothing extra', () => {
    const src = kt('Lines.kt');
    const body = src.slice(src.indexOf('class Lines'), src.indexOf('private fun pick'));
    const pickKeys = [...body.matchAll(/pick\(\s*"([^"]+)"/g)].map((m) => m[1]);
    const ktStrings = new Set(literals(body).filter((s) => !pickKeys.includes(s)));
    const js = new Set([
      ...Object.values(LINES).flatMap((e) => [...e.en, ...e.bl, ...e.bn]),
      ...Object.values(FIXED).flatMap((e) => Object.values(e)),
      ...Object.values(MOOD_LABELS).flatMap((e) => Object.values(e)),
      ...Object.values(MOOD_REPLIES).flatMap((e) => Object.values(e)),
    ]);
    const missing = [...ktStrings].filter((s) => !js.has(s));
    assert.deepEqual(missing, [], 'in Lines.kt but not lines.js');
    // English mood labels come from Mood.label in Model.kt, so they aren't in Lines.kt
    const extra = [...js].filter((s) => !ktStrings.has(s) && !['Tired', 'Avoiding something', 'Lonely'].includes(s));
    assert.deepEqual(extra, [], 'in lines.js but not Lines.kt');
    assert.deepEqual(Object.keys(LINES).sort(), [...new Set(pickKeys)].sort());
  });

  test('Chaos and TrustLevel numbers match Model.kt', () => {
    const src = kt('Model.kt').replace(/_/g, '');
    for (const c of Chaos.entries) {
      const m = new RegExp(`${c.name}\\("([^"]+)", (\\d+) \\* MINUTEMS, (\\d+) \\* MINUTEMS, ([^)]+)\\)`).exec(src);
      assert.ok(m, c.name);
      const gap = m[4].includes('MINUTEMS') ? Number(m[4].split('*')[0]) * MINUTE_MS : Number(m[4].replace('L', ''));
      assert.deepEqual([c.label, c.arrivalMs, c.heckleMs, c.gapMs], [m[1], Number(m[2]) * MINUTE_MS, Number(m[3]) * MINUTE_MS, gap]);
    }
    for (const t of TrustLevel.entries) {
      const m = new RegExp(`${t.name}\\("([^"]+)", (\\d+), ([\\d.]+), (\\d+), (true|false), ([\\d.]+)\\)`).exec(src);
      assert.ok(m, t.name);
      assert.deepEqual([t.label, t.minPoints, t.gapFactor, t.warnBeforeMin, t.steals, t.jumpscareFactor],
        [m[1], Number(m[2]), Number(m[3]), Number(m[4]), m[5] === 'true', Number(m[6])]);
    }
  });

  test('DetectorConfig defaults match RuleDetector.kt', () => {
    const src = kt('RuleDetector.kt').replace(/_/g, '');
    const c = DetectorConfig();
    const num = (name) => {
      const m = new RegExp(`val ${name}: \\w+ = ([^,\\n]+)`).exec(src);
      assert.ok(m, name);
      const v = m[1].trim();
      return v.includes('MINUTEMS') ? Number(v.split('*')[0]) * MINUTE_MS : Number(v.replace('L', ''));
    };
    for (const k of Object.keys(c)) assert.equal(c[k], num(k), k);
  });

  test('escape sentences match Commitment.kt', () => {
    const src = kt('Commitment.kt');
    const block = src.slice(src.indexOf('TEMPLATES = listOf('), src.indexOf(')', src.indexOf('TEMPLATES = listOf(') + 20));
    assert.deepEqual(literals(block), [...EscapeRules.TEMPLATES]);
  });
});
