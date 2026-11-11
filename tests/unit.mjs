#!/usr/bin/env node
// Pure-Node checks (no browser): syntax, data integrity, version/asset sync, manifest, store migrations. node tests/unit.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { makeT, ROOT } from './lib.mjs';

export const name = 'Unit (Node only)';
const rel = (...p) => path.join(ROOT, ...p);
const read = (f) => fs.readFileSync(rel(f), 'utf8');
const imp = (f) => import(pathToFileURL(rel(f)));
const walk = (dir, ext) => fs.readdirSync(rel(dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name), ext) : d.name.endsWith(ext) ? [path.join(dir, d.name)] : []));

export async function run(t) {
  // --- localStorage stub so store.js can be exercised in Node
  const mem = new Map(); const fail = { key: null, count: 0 };
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), removeItem: (k) => mem.delete(k),
    setItem(k, v) { if (k === fail.key && fail.count !== 0) { if (fail.count > 0) fail.count--; throw new Error('QuotaExceeded'); } mem.set(k, String(v)); },
  };

  // --- 1. syntax of every script, plus the service worker and the tests themselves
  const scripts = [...walk('js', '.js'), 'sw.js', ...walk('tests', '.mjs')];
  for (const f of scripts) {
    try { execFileSync(process.execPath, ['--check', rel(f)], { stdio: 'pipe' }); t.ok(true); } catch (e) { t.ok(false, `syntax error in ${f}: ${String(e.stderr).split('\n').slice(0, 3).join(' ')}`); }
  }
  t.ok(scripts.length >= 14, 'found the expected scripts: ' + scripts.length);

  // --- 2. no Math.random anywhere in shipped code (real dice only; ids use Web Crypto)
  for (const f of [...walk('js', '.js'), 'sw.js', 'index.html']) t.ok(!/Math\.random/.test(read(f)), `Math.random in ${f}`);

  // --- 3. data integrity
  const { SPELLS } = await imp('js/data/spells.js'); const { SPELL_DETAILS } = await imp('js/data/spell-details.js');
  const { FEATS } = await imp('js/data/feats.js'); const { PLANS } = await imp('js/data/plans.js');
  const art = await imp('js/data/artificer.js'); const { WEAPONS, ARMOR } = await imp('js/data/equipment.js');
  const dupes = (ids) => ids.filter((x, i) => ids.indexOf(x) !== i);
  t.eq(dupes(SPELLS.map((s) => s.id)), [], 'SPELLS ids unique');
  t.eq(dupes(FEATS.map((x) => x.id)), [], 'FEATS ids unique');
  t.eq(dupes(PLANS.map((x) => x.id)), [], 'PLANS ids unique');
  t.ok(SPELLS.length > 100 && FEATS.length > 30 && PLANS.length > 30, `data sizes look sane (${SPELLS.length} spells, ${FEATS.length} feats, ${PLANS.length} plans)`);
  const detailIds = Object.keys(SPELL_DETAILS);
  t.eq(SPELLS.map((s) => s.id).filter((i) => !SPELL_DETAILS[i]), [], 'every spell has SPELL_DETAILS');
  t.eq(detailIds.filter((i) => !SPELLS.some((s) => s.id === i)), [], 'every SPELL_DETAILS key is a spell');
  for (const s of SPELLS) t.ok(s.name && Number.isInteger(s.level) && s.level >= 0 && s.level <= 9 && s.school && s.source, `spell fields: ${s.id}`);
  for (const [id, d] of Object.entries(SPELL_DETAILS)) {
    t.ok(d.time && d.range && d.components && d.duration && typeof d.desc === 'string' && d.desc.length > 10, `spell details complete: ${id}`);
    // Sanity guard against pasting book text: non-SRD descriptions stay short, own-words summaries.
    if (d.verbatim !== true && d.checked !== true) t.ok(d.desc.length <= 900, `non-verbatim description is short (${d.desc.length} chars): ${id}`);
  }
  t.ok(Object.values(SPELL_DETAILS).filter((d) => d.verbatim).length >= 80, 'SRD verbatim spells still present');
  for (const f of FEATS) t.ok(f.name && FEAT_CATS().includes(f.cat) && f.src && f.req && typeof f.req === 'object', `feat fields: ${f.id}`);
  function FEAT_CATS() { return ['Origin', 'General', 'Fighting Style', 'Epic Boon', 'Dragonmark', 'Greater Dragonmark', 'Racial']; }
  for (const p of PLANS) t.ok(p.name && [2, 6, 10, 14].includes(p.tier) && p.type, `plan fields: ${p.id}`);
  for (const k of ['PLANS_KNOWN', 'MAGIC_ITEMS', 'CANTRIPS', 'PREPARED', 'SLOTS']) t.ok(art[k].length === 20, `${k} has 20 levels`);
  t.ok(art.SLOTS.every((r, i) => Array.isArray(r) && r.length >= 1 && (i === 0 || r.length >= art.SLOTS[i - 1].length)), 'SLOTS rows are non-shrinking arrays');
  t.ok(art.at(art.PREPARED, 1) === 2 && art.at(art.PREPARED, 99) === art.PREPARED[19] && art.at(art.PREPARED, 0) === 2, 'at() clamps the level');
  for (const w of WEAPONS) t.ok(w.name && w.category && w.range && /^\d+(d\d+)?$/.test(w.dice) && w.type && 'mastery' in w, `weapon fields: ${w.name}`);
  for (const a of ARMOR) t.ok(a.name && a.armorType && Number.isFinite(a.baseAC) && 'str' in a && 'stealth' in a, `armor fields: ${a.name}`);
  t.eq(dupes(WEAPONS.map((w) => w.name)).concat(dupes(ARMOR.map((a) => a.name))), [], 'weapon/armor names unique');

  // --- 4. version sync and offline asset list
  const swText = read('sw.js');
  const cache = /const CACHE = '([^']+)'/.exec(swText)?.[1];
  const { APP_VERSION } = await imp('js/version.js');
  t.ok(cache && cache === APP_VERSION, `js/version.js APP_VERSION (${APP_VERSION}) equals CACHE in sw.js (${cache})`);
  const assets = [...(/const ASSETS = \[([\s\S]*?)\];/.exec(swText)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  t.ok(assets.length > 15, 'parsed sw.js ASSETS: ' + assets.length);
  t.eq(dupes(assets), [], 'ASSETS has no duplicates');
  const norm = (u) => (u === './' ? 'index.html' : u.replace(/^\.\//, ''));
  for (const a of assets) t.ok(fs.existsSync(rel(norm(a))), `ASSETS file exists: ${a}`);
  const inAssets = (u) => assets.map(norm).includes(u.replace(/^\.?\//, '').split(/[?#]/)[0]);
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u));
  for (const u of refs) if (/\.(js|css|woff2|png|svg|webmanifest)$/.test(u)) t.ok(inAssets(u), `index.html reference is cached offline: ${u}`);
  for (const m of read('css/styles.css').matchAll(/url\(["']?([^"')]+)["']?\)/g)) if (!/^data:/.test(m[1])) t.ok(inAssets(path.posix.normalize(path.posix.join('css', m[1]))), `CSS url() is cached offline: ${m[1]}`);
  for (const f of walk('js', '.js')) {
    const src = read(f);
    for (const m of src.matchAll(/(?:from\s+|import\()\s*['"](\.[^'"]+)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f.split(path.sep).join('/')), m[1]));
      t.ok(fs.existsSync(rel(target)) && inAssets(target), `${f} imports ${m[1]}, which exists and is cached offline`);
    }
  }

  // --- 5. manifest and icons
  const man = JSON.parse(read('manifest.webmanifest'));
  t.ok(man.name && man.short_name && man.start_url && man.display === 'standalone' && /^#[0-9a-f]{6}$/i.test(man.theme_color), 'manifest basics');
  t.ok(man.icons.some((i) => i.sizes === '192x192') && man.icons.some((i) => i.sizes === '512x512') && man.icons.some((i) => i.purpose === 'maskable'), 'manifest has 192, 512 and maskable icons');
  for (const i of man.icons) {
    const buf = fs.readFileSync(rel(i.src));
    const isPng = buf.slice(1, 4).toString() === 'PNG';
    const dim = isPng ? `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}` : '';
    t.ok(isPng && dim === i.sizes, `icon ${i.src} is ${dim}, declared ${i.sizes}`);
    t.ok(inAssets(i.src), `icon cached offline: ${i.src}`);
  }
  t.ok(fs.existsSync(rel('icons/icon-180.png')) && buf180(), 'apple-touch icon is 180x180');
  function buf180() { const b = fs.readFileSync(rel('icons/icon-180.png')); return b.readUInt32BE(16) === 180 && b.readUInt32BE(20) === 180; }

  const quiet = { warn: console.warn, error: console.error }; console.warn = console.error = () => {}; // store.js logs on purpose in the failure cases below
  // --- 6. store.js: migrations, id sanitising, snapshots, quota fallback
  const st = await imp('js/store.js'); const { normalize, defaultState, SCHEMA_VERSION } = st;
  t.ok(SCHEMA_VERSION === 4, 'SCHEMA_VERSION is 4 (update the migration tests when it changes)');
  const v1 = { character: { name: 'Old Hero', classes: [{ name: 'Wizard', level: 4 }], inventory: [{ name: 'Rope', qty: 2 }], bio: { personality: 'Curious and loud' } }, sessions: [{ number: 1, title: 'Old session' }] };
  const v2 = { version: 2, character: { name: 'V2', level: 3, ac: 15, bio: { personality: 'Dry wit', backstory: 'Forged' }, items: [{ name: 'Armor +1', equipped: true }] }, sessions: [{ id: 's1', number: 2, title: 'S', tags: 'bad' }] };
  const v3 = (() => { const d = defaultState(); d.version = 3; delete d.journal; delete d.character.voice; d.character.bio.personality = 'Quiet'; d.sessions = [{ id: 'a', number: 1, title: 'x' }]; return JSON.parse(JSON.stringify(d)); })();
  const junk = { version: 4, character: { voice: { goals: [{ text: 5 }, 'x', null], lines: 'zzz', personality: 7 } }, journal: { npcs: [{ name: 'Bob', attitude: 'weird', tags: ['A', ' a ', 'B b', ''] }, 4, null], quests: [{ title: 'Q', status: 'nope', steps: [{ text: 'a', done: 'yes' }, { id: 'k' }] }], places: 'x' }, sessions: [null, { number: 1 }] };
  for (const [n, d] of [['v1', v1], ['v2', v2], ['v3', v3], ['junk-v4', junk]]) {
    const a = normalize(JSON.parse(JSON.stringify(d))); const b = normalize(JSON.parse(JSON.stringify(a)));
    t.ok(a.version === SCHEMA_VERSION, `${n}: migrated to v${SCHEMA_VERSION}`);
    t.ok(JSON.stringify(a) === JSON.stringify(b), `${n}: normalize is idempotent`);
    t.ok(['npcs', 'places', 'factions', 'quests'].every((k) => Array.isArray(a.journal[k])), `${n}: journal defaults`);
    t.ok(a.sessions.every((s) => Array.isArray(s.tags) && s.id), `${n}: sessions have tags and ids`);
    t.ok(a.character.voice && Array.isArray(a.character.voice.goals) && Array.isArray(a.character.voice.lines), `${n}: voice shape`);
  }
  const a1 = normalize(v1), a2 = normalize(v2), a3 = normalize(v3);
  t.ok(a1.character.voice.personality === 'Curious and loud' && a1.character.bio.personality === 'Curious and loud', 'v1: bio.personality copied to voice, bio kept');
  t.ok(a2.character.voice.personality === 'Dry wit' && a2.character.bio.backstory === 'Forged', 'v2: personality copied, backstory kept');
  t.ok(a3.character.voice.personality === 'Quiet', 'v3: personality copied');
  t.eq(a2.sessions[0].tags, ['bad'], 'bad session tags coerced');
  const j = normalize(junk);
  t.ok(j.journal.npcs.length === 1 && j.journal.npcs[0].attitude === 'unknown', 'junk npc coerced, non-objects dropped');
  t.eq(j.journal.npcs[0].tags, ['a', 'b b'], 'tags lowercased and deduped');
  t.ok(j.journal.quests[0].status === 'active' && j.journal.quests[0].steps.length === 2 && j.journal.quests[0].steps.every((s) => s.id && typeof s.text === 'string' && typeof s.done === 'boolean'), 'junk quest coerced');
  t.ok(j.character.voice.goals.length === 1 && j.character.voice.goals[0].text === '5' && j.character.voice.lines.length === 0 && j.character.voice.personality === '7', 'junk voice coerced');
  const cleared = normalize(a3); cleared.character.voice.personality = '';
  t.ok(normalize(JSON.parse(JSON.stringify(cleared))).character.voice.personality === '', 'v4 data does not re-copy bio.personality');
  t.ok(normalize(null).version === SCHEMA_VERSION && normalize(null).character.voice.lines.length === 0, 'normalize(null) gives a fresh state');
  const ids = normalize({ version: 3, character: { items: [{ id: 'a.b c', name: 'x' }, { id: 'dup' }, { id: 'dup' }, {}], plans: { custom: [{ id: 'p.1', name: 'c' }], known: {} } } });
  t.ok(ids.character.items.every((i) => /^[A-Za-z0-9_-]+$/.test(i.id)) && new Set(ids.character.items.map((i) => i.id)).size === 4 && ids.character.items[0].id === 'a-b-c', 'item ids sanitised and unique');
  const pl = normalize({ version: 3, character: { plans: { custom: [{ id: 'p.1' }], known: {} }, items: [{ id: 'i1', planId: 'p.1', origin: 'replicated' }] } });
  t.ok(pl.character.items[0].planId === 'p-1' && pl.character.plans.custom[0].id === 'p-1', 'planId follows a renamed custom plan');
  const jid = normalize({ version: 4, journal: { quests: [{ title: 'q', id: 'q.1', steps: [{ id: 's s', text: 'a' }, { id: 's-s', text: 'b' }, { id: 's s' }] }] }, character: { voice: { goals: [{ id: 'g.1', text: 'x' }], lines: [{ id: '#x', text: 'y' }] } }, sessions: [{ id: 'a b' }] });
  t.ok(/^[\w-]+$/.test(jid.journal.quests[0].id) && jid.journal.quests[0].steps.every((x) => /^[\w-]+$/.test(x.id)) && new Set(jid.journal.quests[0].steps.map((x) => x.id)).size === 3 && /^[\w-]+$/.test(jid.character.voice.lines[0].id) && jid.sessions[0].id === 'a-b', 'journal, voice and session ids sanitised and unique');
  t.ok(JSON.stringify(normalize(JSON.parse(JSON.stringify(jid)))) === JSON.stringify(jid), 'id sanitising is idempotent');
  const it = normalize({ version: 3, character: { items: [{ id: 'w', name: 'Sword +2', type: 'Weapon' }] } }).character.items[0];
  t.ok(it.weapon && it.qty >= 1 && st.magicBonus('Sword +2') === 2, 'items get their weapon sub-object and a +N bonus is parsed from the name');
  t.ok(st.uid() !== st.uid() && /^[a-z0-9]+$/.test(st.uid()), 'uid() gives distinct ids');

  // snapshot retention: 1 daily, 1 rest, 3 important; eviction only inside a kind
  mem.clear();
  const reasons = () => st.readSnaps().map((x) => `${x.kind}:${x.reason}`);
  st.takeSnapshot('{"a":1}', 'Daily', 'daily'); st.takeSnapshot('{"a":2}', 'Daily', 'daily');
  t.ok(st.readSnaps().filter((x) => x.kind === 'daily').length === 1 && JSON.parse(st.readSnaps()[0].data).a === 2, 'one daily snapshot kept (replaced)');
  st.takeSnapshot('{}', 'Before long rest', 'rest'); st.takeSnapshot('{}', 'Before long rest', 'rest');
  t.ok(st.readSnaps().filter((x) => x.kind === 'rest').length === 1, 'one long-rest snapshot kept');
  for (const r of ['i1', 'i2', 'i3', 'i4']) st.takeSnapshot('{}', r);
  t.ok(st.readSnaps().filter((x) => x.kind === 'important').length === 3 && !reasons().includes('important:i1') && reasons().includes('important:i4'), 'important keeps 3, drops the oldest');
  t.ok(reasons().includes('daily:Daily') && reasons().includes('rest:Before long rest'), 'important snapshots do not evict daily or rest');
  t.ok(st.readSnaps().every((x, i, a) => !i || a[i - 1].at >= x.at), 'snapshots are newest first');
  fail.key = 'dnd-companion-snapshots'; fail.count = -1;
  t.ok(st.takeSnapshot('{}', 'x') === false, 'takeSnapshot returns false (no throw) when storage is full');
  fail.key = null;
  mem.clear(); st.takeSnapshot('{}', 'Daily', 'daily'); st.takeSnapshot('{}', 'Before long rest', 'rest'); st.takeSnapshot('{}', 'imp');
  fail.key = 'dnd-companion-v1'; fail.count = 2;
  t.ok(st.save({ version: 4 }) === true, 'save() retries after dropping snapshots on a quota error');
  t.eq(reasons(), ['important:imp'], 'save() dropped daily and rest first, kept the important one');
  fail.count = -1; t.ok(st.save({ version: 4 }) === false, 'save() returns false when nothing helps'); fail.key = null; fail.count = 0;
  // unreadable data is preserved, not overwritten
  mem.clear(); mem.set('dnd-companion-v1', '{"broken');
  const ld = st.load();
  t.ok(ld.version === 4 && st.loadInfo.unreadable, 'unreadable data: fallback state and flag');
  t.ok(st.readSnaps()[0].reason === 'Unreadable data' && st.readSnaps()[0].kind === 'important' && st.readSnaps()[0].data === '{"broken', 'raw string kept as an important snapshot');
  st.save(ld); t.ok(mem.get('dnd-companion-v1') === '{"broken', 'main key not overwritten before the user changes something');
  st.releaseSave(); st.save(ld); t.ok(mem.get('dnd-companion-v1') !== '{"broken', 'saves again after releaseSave()');
  mem.clear(); mem.set('dnd-companion-v1', JSON.stringify({ version: 4, character: { items: [{ id: 'x', weapon: { damages: 5 } }] } }));
  t.ok(st.load().version === 4, 'odd but parseable data loads without throwing');
  Object.assign(console, quiet);
  t.ok(st.isBackup({ character: {} }) && !st.isBackup([]) && !st.isBackup({ character: null }) && !st.isBackup('x'), 'isBackup accepts only objects with a character object');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t = makeT('unit'); const t0 = Date.now();
  await run(t);
  console.log(`${t.fail ? 'FAIL' : 'ok  '} unit ${t.pass} passed ${t.fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  for (const f of t.failures) console.log('     - ' + f);
  process.exit(t.fail ? 1 : 0);
}
