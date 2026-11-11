#!/usr/bin/env node
// Test entry point: node tests/run.mjs [--only name] [--headed] [--list]
// Runs tests/unit.mjs (pure Node) and every tests/e2e/*.mjs (Playwright) against its own static server.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeT, makeEnv } from './lib.mjs';
import * as unit from './unit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const headed = args.includes('--headed');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? (args[onlyIdx + 1] || '').toLowerCase() : '';
const SUITE_TIMEOUT = 180000;

const files = fs.readdirSync(path.join(here, 'e2e')).filter((f) => f.endsWith('.mjs')).sort();
const suites = [{ id: 'unit', title: unit.name, load: async () => unit }];
for (const f of files) suites.push({ id: f.replace(/\.mjs$/, ''), title: f, load: () => import(pathToFileURL(path.join(here, 'e2e', f))) });
if (args.includes('--list')) { for (const s of suites) console.log(s.id); process.exit(0); }
const picked = suites.filter((s) => !only || s.id.toLowerCase().includes(only));
if (!picked.length) { console.error(`No suite matches "${only}". Try --list.`); process.exit(2); }

const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms))]);

const started = Date.now();
let env = null;
const results = [];
for (const s of picked) {
  const t = makeT(s.id); const t0 = Date.now();
  try {
    const mod = await s.load();
    if (s.id !== 'unit' && !env) env = await makeEnv(headed);
    await withTimeout(Promise.resolve(mod.run(s.id === 'unit' ? t : env, t)), SUITE_TIMEOUT, s.id);
  } catch (e) {
    t.fail++; t.failures.push('suite crashed: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' / ') : e));
  }
  if (env) for (const c of env.browser.contexts()) await c.close().catch(() => {});
  t.ms = Date.now() - t0; results.push(t);
  console.log(`${t.fail ? 'FAIL' : 'ok  '} ${s.id.padEnd(18)} ${String(t.pass).padStart(4)} passed ${String(t.fail).padStart(3)} failed  ${(t.ms / 1000).toFixed(1)}s${t.skipped.length ? '  (skipped: ' + t.skipped.join('; ') + ')' : ''}`);
  for (const f of t.failures) console.log('     - ' + f);
}
if (env) { await env.browser.close().catch(() => {}); await env.srv.close(); }
const pass = results.reduce((n, r) => n + r.pass, 0); const fail = results.reduce((n, r) => n + r.fail, 0);
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} checks passed, ${fail} failed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(fail ? 1 : 0);
