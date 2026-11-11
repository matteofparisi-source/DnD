// Shared helpers for the browser suites: static server, Playwright loading, seeded pages, navigation, audits.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KEY = 'dnd-companion-v1';
export const SNAP_KEY = 'dnd-companion-snapshots';

// ---------- Playwright (resolved from the environment, never vendored) ----------
export function tryRequire(name) {
  const dirs = [];
  try { dirs.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch { /* npm missing */ }
  if (process.env.NODE_PATH) dirs.push(...process.env.NODE_PATH.split(path.delimiter));
  dirs.push('/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules');
  for (const base of [path.join(ROOT, 'noop.js'), ...dirs.filter(Boolean).map((d) => path.join(d, 'noop.js'))]) {
    try { return createRequire(base)(name); } catch { /* try the next place */ }
  }
  return null;
}
export function loadPlaywright() {
  const pw = tryRequire('playwright');
  if (!pw) {
    console.error('Playwright was not found. Install it once, then run again:\n  npm i -g playwright && npx playwright install chromium\n(or: npx playwright install chromium, if playwright is already installed somewhere on NODE_PATH)');
    process.exit(2);
  }
  return pw;
}

// ---------- static server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
export const appVersion = () => /'(ledger-v\d+)'/.exec(fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8'))[1];

// Serves the repo root on a random free port. srv.setVersion('ledger-vNN') makes sw.js and js/version.js report another version (update test).
export function startServer() {
  const real = appVersion();
  const srv = { version: real, hits: [] };
  const server = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u.endsWith('/')) u += 'index.html';
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    srv.hits.push(u);
    let body = fs.readFileSync(f);
    if ((u === '/sw.js' || u === '/js/version.js') && srv.version !== real) body = Buffer.from(body.toString().split(real).join(srv.version));
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    srv.url = `http://127.0.0.1:${server.address().port}/`;
    srv.setVersion = (v) => { srv.version = v; };
    srv.close = () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
    resolve(srv);
  }));
}

// ---------- tiny assert collector ----------
export function makeT(name) {
  const t = { name, pass: 0, fail: 0, failures: [], errs: [], skipped: [] };
  t.ok = (cond, msg) => { if (cond) t.pass++; else { t.fail++; t.failures.push(msg); } return !!cond; };
  t.eq = (got, want, msg) => t.ok(JSON.stringify(got) === JSON.stringify(want), `${msg} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
  t.skip = (why) => t.skipped.push(why);
  // Console/page errors collected from pages opened with openPage(); allow = regex of messages to ignore.
  t.noErrors = (allow) => { const bad = t.errs.filter((e) => !(allow && allow.test(e))); t.ok(bad.length === 0, 'no console/page errors: ' + bad.slice(0, 3).join(' | ')); };
  return t;
}

// ---------- state seed (a level 5 Artificer with a bit of everything) ----------
export async function seedFactory() {
  const { defaultState, newItem, uid } = await import(pathToFileURL(path.join(ROOT, 'js/store.js')));
  return function seed(theme = 'dark', tab = 'combat') {
    const s = defaultState(); const c = s.character;
    Object.assign(c, { name: "Vex d'Cannith", species: 'Khoravar', level: 5 });
    c.abilities.int = 18; c.abilities.con = 14;
    c.hp.current = 24; c.hp.temp = 3;
    c.conditions = ['Poisoned', 'Frightened']; c.exhaustion = 1;
    c.slotsUsed = [2, 1, 0, 0, 0]; c.uses = { flash: 1 };
    c.skills = { arcana: 1, investigation: 2, history: 1 };
    c.spells = { 'faerie-fire': 'prepared', 'fire-bolt': 'known', 'cure-wounds': 'prepared', web: 'prepared' };
    c.cannons = [{ id: uid(), hp: 20 }];
    c.deathSaves = { success: 1, fail: 0 };
    c.items = [
      newItem({ name: 'Light Crossbow', type: 'Weapon', rarity: 'Mundane', equipped: true }),
      newItem({ name: 'Studded Leather +1', type: 'Armor', rarity: 'Uncommon', equipped: true, needsAttune: false }),
      newItem({ name: 'Wand of the War Mage +1', type: 'Wand', rarity: 'Uncommon', needsAttune: true, attuned: true, origin: 'replicated' }),
      newItem({ name: "Thieves' tools", type: 'Other', rarity: 'Mundane' }),
    ];
    c.items[0].weapon.damages = [{ id: uid(), dice: '1d8', type: 'Piercing' }]; c.items[0].weapon.base = 'Light Crossbow';
    c.items[1].armor.baseAC = 12; c.items[1].armor.base = 'Studded Leather'; c.items[1].armor.armorType = 'light';
    s.sessions = [
      { id: 'a1', number: 3, title: 'The Sharn undercity', date: '2026-10-30', ingameDate: '12 Zarantyr', summary: 'Followed the smuggler through the Cogs.', notes: 'Met Kellan, a forged courier.', loot: '120 gp', followUps: 'Who paid for the cannon plans?' },
      { id: 'a2', number: 2, title: 'Deserter', date: '2026-10-23', summary: 'Left the Last War behind.' },
    ];
    s.ui.theme = theme; s.ui.tab = tab; s.ui.sub = { workshop: 'equipment', character: 'stats' };
    return s;
  };
}
export async function factories() { return import(pathToFileURL(path.join(ROOT, 'js/store.js'))); }

// Journal sample data (4 of each kind, a few tags, steps, voice lines).
export async function withJournal(s, n = 4) {
  const { newNpc, newPlace, newFaction, newQuest } = await factories();
  const range = (f) => Array.from({ length: n }, (_, i) => f(i));
  s.journal.npcs = range((i) => newNpc({ name: `NPC ${i}`, role: 'spy', faction: 'Dragonmarked', attitude: ['friendly', 'hostile', 'neutral', 'unknown'][i % 4], tags: i % 2 ? ['sharn', 'ally'] : ['sharn'], notes: 'n' }));
  s.journal.npcs[0].name = 'Baron Gareth'; s.journal.npcs[0].tags = ['noble', 'sharn'];
  s.journal.places = range((i) => newPlace({ name: `Place ${i}`, kind: 'district', region: 'Sharn', tags: ['city'] }));
  s.journal.factions = range((i) => newFaction({ name: `Faction ${i}`, attitude: 'neutral', goals: 'power', tags: ['house'] }));
  s.journal.quests = range((i) => newQuest({ title: `Quest ${i}`, status: ['active', 'done', 'failed', 'paused'][i % 4], giver: 'Kellan', steps: [{ id: 'x' + i, text: 'one', done: true }, { id: 'y' + i, text: 'two', done: false }], tags: ['job'] }));
  s.character.voice.lines = [{ id: 'l1', text: 'By the Flame, hold still!' }];
  s.character.voice.goals = [{ id: 'g1', text: 'Find the Cannith forge', done: false }];
  s.character.voice.personality = 'Dry';
  return s;
}

// ---------- environment given to every suite ----------
// env = { browser, devices, srv, url, seed }
export async function makeEnv(headed) {
  const pw = loadPlaywright();
  const srv = await startServer();
  const browser = await pw.chromium.launch({ headless: !headed });
  return { pw, browser, devices: pw.devices, srv, url: srv.url, seed: await seedFactory() };
}

// Opens a new context + page, seeds localStorage once per context, collects console/page errors into t.errs.
// opts: theme, tab, mut(state), raw (string stored as-is), state (object stored as-is), vp {width,height}, desktop (1366x768),
//       noSW, offline-capable ctx options via ctx, init (fn run before app scripts), noSeed
export async function openPage(env, t, opts = {}) {
  const base = opts.desktop ? { viewport: { width: 1366, height: 768 } } : { ...env.devices['Pixel 7'], ...(opts.vp ? { viewport: opts.vp } : {}) };
  const ctx = opts.context || await env.browser.newContext({
    ...base, serviceWorkers: opts.sw ? 'allow' : 'block', permissions: ['clipboard-read', 'clipboard-write'], ...(opts.ctxOpts || {}),
  });
  const p = await ctx.newPage();
  p.ctx = ctx; p.reqs = [];
  p.on('pageerror', (e) => t.errs.push('PAGE ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) t.errs.push(m.text()); });
  p.on('request', (r) => p.reqs.push(r.url()));
  if (opts.init) await p.addInitScript(opts.init);
  if (!opts.noSeed) {
    let payload = opts.raw;
    if (payload === undefined) { const s = opts.state || env.seed(opts.theme || 'dark', opts.tab || 'combat'); if (opts.mut) await opts.mut(s); payload = JSON.stringify(s); }
    await p.addInitScript((v) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('dnd-companion-v1', v); } }, payload);
  }
  if (!opts.noGoto) { await p.goto(env.url); await p.waitForSelector('h1'); }
  return p;
}

// ---------- navigation and state helpers ----------
export const go = async (p, sec, sub) => {
  await p.click(`.bnav [data-key="${sec}"]`);
  if (sub) await p.click(`.seg [data-key="${sub}"]`);
  await p.waitForSelector('#panel');
};
export const goData = async (p) => { await go(p, 'character', 'data'); await p.waitForSelector('#drive'); };
// The app saves in-memory state on pagehide; firing it makes the read deterministic (no sleeping on the 250 ms debounce).
export const saved = (p) => p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem('dnd-companion-v1')); });
export const snaps = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('dnd-companion-snapshots') || '[]'));
export const text = (p, sel) => p.locator(sel).first().textContent().then((s) => s.trim());
export const keypad = async (p, digits) => { for (const d of digits) await p.click(`.sheet [data-action="kp"][data-k="${d}"]`); };
export const sheetOpen = (p) => p.locator('#sheet-root .sheet').count().then((n) => n === 1);
export const closeSheet = async (p) => { await p.keyboard.press('Escape'); await p.waitForSelector('#sheet-root .sheet', { state: 'detached' }); };
export const localDay = (p) => p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });

// Every pageable view: [section, sub-tab]
export const PAGES = [
  ['combat'], ['spells'], ['workshop', 'equipment'], ['workshop', 'items'], ['workshop', 'plans'],
  ['journal', 'journal'], ['journal', 'npcs'], ['journal', 'places'], ['journal', 'factions'], ['journal', 'quests'],
  ['character', 'stats'], ['character', 'voice'], ['character', 'feats'], ['character', 'selected'], ['character', 'data'],
];

// Interactive controls under 44px, unnamed controls and horizontal overflow on the current screen (view + open sheet).
export const audit = (p) => p.evaluate(() => {
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary';
  const small = []; const unnamed = [];
  document.querySelectorAll(`#view ${sel}, #sheet-root ${sel}, #toasts button, #update-banner button`).forEach((el) => {
    const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') return;
    let box = el.getBoundingClientRect();
    if (el.type === 'checkbox' && el.closest('label')) box = el.closest('label').getBoundingClientRect();
    const id = `${el.tagName}.${el.className}[${el.dataset.action || el.dataset.bind || el.dataset.filter || ''}]`;
    if (box.width < 43.5 || box.height < 43.5) small.push(`${id} ${Math.round(box.width)}x${Math.round(box.height)}`);
    if (el.tagName !== 'SUMMARY' && !(el.getAttribute('aria-label') || el.labels?.length || el.textContent.trim() || el.getAttribute('title') || el.getAttribute('aria-labelledby'))) unnamed.push(id);
  });
  return { small, unnamed, overflow: document.documentElement.scrollWidth > innerWidth };
});
export const auditOk = async (t, p, label) => {
  const r = await audit(p);
  t.ok(!r.small.length && !r.unnamed.length && !r.overflow, `${label}: <44px ${r.small.slice(0, 3)} unnamed ${r.unnamed.slice(0, 3)} hscroll ${r.overflow}`);
};

// Import a repo module in Node (data files, store.js...): await imp('js/data/spells.js')
export const imp = (f) => import(pathToFileURL(path.join(ROOT, f)));
