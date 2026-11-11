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
  const { SPELLS } = await imp('js/data/spells.js'); const { FEAT_SPELL_DETAILS } = await imp('js/data/feat-spell-details.js');
  const SPELL_DETAILS = { ...(await imp('js/data/spell-details.js')).SPELL_DETAILS, ...FEAT_SPELL_DETAILS }; // the app merges both when the Spells page opens
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
    const noText = d.verbatim === false && d.checked === false && d.desc === '' && /^https:\/\//.test(d.source); // community feat spell: metadata and a Source link only
    t.ok(d.time && d.range && d.components && d.duration && typeof d.desc === 'string' && (d.desc.length > 10 || noText), `spell details complete: ${id}`);
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
  t.ok(SCHEMA_VERSION === 5, 'SCHEMA_VERSION is 5 (update the migration tests when it changes)');
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
  // Source links: one https link per spell, feat and plan, no stale keys
  {
    const { SOURCE_LINKS, CLASS_LINK, SUBCLASS_LINK } = await imp('js/data/sources.js');
    const { SPELLS } = await imp('js/data/spells.js'); const { FEATS } = await imp('js/data/feats.js'); const { PLANS } = await imp('js/data/plans.js');
    for (const [kind, list] of [['spell', SPELLS], ['feat', FEATS], ['plan', PLANS]]) {
      const ids = list.map((x) => x.id);
      t.eq(ids.filter((i) => !/^https:\/\//.test(SOURCE_LINKS[kind][i] || '')), [], `every ${kind} id has an https SOURCE_LINKS entry`);
      t.eq(Object.keys(SOURCE_LINKS[kind]).filter((k) => !ids.includes(k)), [], `no stale ${kind} keys in SOURCE_LINKS`);
    }
    t.ok(/^https:\/\//.test(CLASS_LINK) && /^https:\/\//.test(SUBCLASS_LINK), 'class and subclass links are https');
  }
  // unreadable data is preserved, not overwritten
  mem.clear(); mem.set('dnd-companion-v1', '{"broken');
  const ld = st.load();
  t.ok(ld.version === 5 && st.loadInfo.unreadable, 'unreadable data: fallback state and flag');
  t.ok(st.readSnaps()[0].reason === 'Unreadable data' && st.readSnaps()[0].kind === 'important' && st.readSnaps()[0].data === '{"broken', 'raw string kept as an important snapshot');
  st.save(ld); t.ok(mem.get('dnd-companion-v1') === '{"broken', 'main key not overwritten before the user changes something');
  st.releaseSave(); st.save(ld); t.ok(mem.get('dnd-companion-v1') !== '{"broken', 'saves again after releaseSave()');
  mem.clear(); mem.set('dnd-companion-v1', JSON.stringify({ version: 4, character: { items: [{ id: 'x', weapon: { damages: 5 } }] } }));
  t.ok(st.load().version === 5, 'odd but parseable data loads without throwing');
  Object.assign(console, quiet);
  t.ok(st.isBackup({ character: {} }) && !st.isBackup([]) && !st.isBackup({ character: null }) && !st.isBackup('x'), 'isBackup accepts only objects with a character object');

  // --- 7. effects.js: pure math, breakdown parts, attunement gating, v4 -> v5 migration
  {
    const fx = await imp('js/effects.js'); const { SPELL_FX } = await imp('js/data/spell-fx.js');
    const mk = (f) => { const d = defaultState().character; d.level = 5; d.abilities.int = 16; d.abilities.dex = 14; return f ? (f(d), d) : d; };
    const E = (c, cat = {}) => fx.createFx(c, cat);
    const sumOk = (b) => b.total === b.parts.reduce((n, p) => n + p.value, 0);
    t.ok(E(mk()).score('int') === 16 && E(mk()).dc().total === 8 + 3 + 3, 'no effects: score and DC unchanged');
    const ring = (eff, o = {}) => ({ id: 'i1', name: 'Thing', equipped: true, needsAttune: false, attuned: false, effects: eff, ...o });
    let c = mk((d) => { d.items = [ring([{ type: 'ability', target: 'int', value: 2 }])]; });
    t.ok(E(c).score('int') === 18 && E(c).dc().total === 15 && E(c).abil('int').parts.length === 2, 'ability +2 raises score and DC');
    c = mk((d) => { d.abilities.int = 19; d.items = [ring([{ type: 'ability', target: 'int', value: 2 }])]; });
    t.ok(E(c).score('int') === 20 && E(c).abil('int').parts[1].note.includes('capped at 20'), 'ability bonus capped at 20');
    c = mk((d) => { d.abilities.int = 19; d.items = [ring([{ type: 'ability', target: 'int', value: 2, max: 30 }])]; });
    t.ok(E(c).score('int') === 21, 'ability bonus with max 30');
    c = mk((d) => { d.abilities.int = 22; d.items = [ring([{ type: 'ability', target: 'int', value: 2 }])]; });
    t.ok(E(c).score('int') === 22, 'a base above the cap is never lowered');
    c = mk((d) => { d.items = [ring([{ type: 'abilityMin', target: 'int', value: 19 }])]; });
    t.ok(E(c).score('int') === 19 && sumOk(E(c).abil('int')), 'abilityMin raises a lower score');
    c = mk((d) => { d.abilities.int = 20; d.items = [ring([{ type: 'abilityMin', target: 'int', value: 19 }])]; });
    t.ok(E(c).score('int') === 20, 'abilityMin never lowers');
    c = mk((d) => { d.items = [ring([{ type: 'ability', target: 'int', value: 1 }, { type: 'abilityMin', target: 'int', value: 19 }])]; });
    t.ok(E(c).score('int') === 19, 'abilityMin applies after ability adds');
    // attunement gating
    c = mk((d) => { d.items = [ring([{ type: 'ac', value: 1 }], { needsAttune: true })]; });
    t.eq(E(c).ac([{ label: 'Base', value: 10 }]).total, 10, 'needs attunement and not attuned: no effect');
    c.items[0].attuned = true; t.eq(E(c).ac([{ label: 'Base', value: 10 }]).total, 11, 'attuned: effect applies');
    c.items[0].equipped = false; t.eq(E(c).ac([{ label: 'Base', value: 10 }]).total, 10, 'not equipped: no effect');
    // ac conditions
    c = mk((d) => { d.items = [ring([{ type: 'ac', value: 1, cond: 'armor' }, { type: 'ac', value: 2, cond: 'noArmor' }, { type: 'ac', value: 4, cond: 'noShield' }, { type: 'ac', value: 8, cond: 'noArmorNoShield' }])]; });
    const acT = (ctx) => E(c).ac([{ label: 'B', value: 0 }], ctx).total;
    t.eq([acT({ armor: true, shield: true }), acT({ armor: true, shield: false }), acT({ armor: false, shield: true }), acT({ armor: false, shield: false })], [1, 5, 2, 14], 'ac conditions');
    // breakdown parts sum to total for every key
    c = mk((d) => { d.hp.auto = true; d.saveBonus = 1; d.initBonus = 2; d.skills = { arcana: 1, stealth: 2 }; d.saveProf.int = true;
      d.items = [ring([{ type: 'ability', target: 'dex', value: 2 }, { type: 'save', target: 'all', value: 1 }, { type: 'speed', value: 10 }, { type: 'speedMult', value: 2 }, { type: 'hp', value: 3, hpPerLevel: 2 }, { type: 'spellDC', value: 1 }, { type: 'init', value: 'pb' }, { type: 'skillExpert', target: 'perception' }])]; });
    const f = E(c);
    const keys = ['abil:dex', 'mod:dex', 'save:int', 'save:str', 'skill:arcana', 'skill:perception', 'init', 'speed', 'hpmax', 'dc', 'satk', 'passive'];
    t.eq(keys.filter((k) => !sumOk(f.breakdown(k))), [], 'breakdown parts add up to the total');
    t.ok(f.init().total === 8 && f.speed().total === 80 && f.hpmax(true).total === f.hpmax(true).parts.reduce((n, p) => n + p.value, 0) && f.save('int').total === 3 + 3 + 1 + 1, 'init, speed, hp and save totals');
    t.ok(f.skillInfo('perception').level === 2 && f.passive().total === 10 + 0 + 3 * 2 + 1 * 0 + f.am('wis') - 0, 'effect expertise feeds skill and passive');
    // spell effects: concentration and buffs
    const cat = { spellFx: SPELL_FX, spells: [{ id: 'haste', name: 'Haste' }, { id: 'shield', name: 'Shield' }] };
    c = mk((d) => { d.concentration = { id: 'haste', name: 'Haste' }; });
    t.ok(E(c, cat).speed().total === 60 && E(c, cat).ac([{ label: 'B', value: 10 }]).total === 12, 'concentration spell effects apply');
    c.concentration = { id: '', name: '' }; c.buffs = ['shield'];
    t.eq(E(c, cat).ac([{ label: 'B', value: 10 }]).total, 15, 'buff spell applies');
    t.ok(Object.values(SPELL_FX).every((x) => x.fxSrc === 'SRD 5.2.1' && fx.cleanEffects(x.fx).length === x.fx.length), 'SPELL_FX entries are SRD-sourced and valid');
    // choices extension point
    t.eq(fx.resolveChoices([{ type: 'choice', key: 'a', then: { type: 'ability', target: '$', value: 1 } }], { a: ['int', 'con'] }).map((e) => e.target), ['int', 'con'], 'choice effects resolve from entry.choices');
    // coercion
    t.ok(fx.cleanEffect({ type: 'bogus' }) === null && fx.cleanEffect({ type: 'ability', target: 'zzz', value: 999 }).value === 30 && fx.cleanEffect({ type: 'hpPerLevel', value: 2 }).hpPerLevel === 2, 'cleanEffect drops unknown types, clamps, maps hpPerLevel');
    // v4 -> v5 migration
    const v4 = defaultState(); v4.version = 4; delete v4.character.buffs;
    v4.character.abilities.int = 17;
    v4.character.items = [{ id: 'a', name: 'Cloak', effects: [{ type: 'ac', value: 99 }, { type: 'nope' }, 5] }, { id: 'b', name: 'Plain' }];
    v4.character.feats = [{ id: 'f', featId: 'alert', level: 4, notes: 'x' }];
    const m1 = normalize(JSON.parse(JSON.stringify(v4))); const m2 = normalize(JSON.parse(JSON.stringify(m1)));
    t.ok(m1.version === SCHEMA_VERSION && m1.character.abilities.int === 17, 'v4 -> v5 keeps base scores');
    t.ok(m1.character.items[0].effects.length === 1 && m1.character.items[0].effects[0].value === 20 && /^[\w-]+$/.test(m1.character.items[0].effects[0].id) && m1.character.items[1].effects.length === 0, 'item effects coerced');
    t.ok(Array.isArray(m1.character.buffs) && m1.character.feats[0].effects.length === 0 && JSON.stringify(m1.character.feats[0].choices) === '{}', 'feat choices/effects and buffs added');
    t.ok(JSON.stringify(m1) === JSON.stringify(m2), 'v5 normalize is idempotent');
    t.ok(normalize({ version: 5, character: { buffs: ['x', 3, 'x'] } }).character.buffs.join() === 'x', 'buffs deduped and cleaned');
  }

  // --- 8. feats: effect data, feat spells, choice resolution, uses
  {
    const fx = await imp('js/effects.js'); const { FEAT_FX, POOLS } = await imp('js/data/feat-fx.js');
    const { FEAT_SPELLS, SPELL_FEATS } = await imp('js/data/feat-spells.js'); const srcLinks = (await imp('js/data/sources.js')).SOURCE_LINKS;
    const sid = new Set(SPELLS.map((s) => s.id));
    t.eq(Object.keys(FEAT_FX).filter((i) => !FEATS.some((f) => f.id === i)), [], 'every FEAT_FX id is a feat');
    t.eq(FEATS.map((f) => f.id).filter((i) => !FEAT_FX[i]), [], 'every feat has FEAT_FX');
    t.eq([Object.values(FEAT_FX).filter((x) => x.fxSrc === 'SRD 5.2.1').length, Object.values(FEAT_FX).filter((x) => x.fxSrc === 'community').length], [17, 106], 'feat fx sources: 17 SRD, 106 community');
    const bad = [];
    for (const [id, x] of Object.entries(FEAT_FX)) {
      if (!x.fx.length || !x.notes || !['SRD 5.2.1', 'community'].includes(x.fxSrc)) bad.push(`${id}: fields`);
      const tpls = x.fx.flatMap((e) => (e.type === 'choice' ? [].concat(e.then || [], e.thenTool || []) : [e]));
      for (const e of tpls) {
        if (!['spell', 'use'].includes(e.type) && !fx.cleanEffect({ ...e, target: e.target === '$' ? (fx.EFFECT_META[e.type]?.def?.target ?? 'x') : e.target })) bad.push(`${id}: bad effect ${e.type}`);
        if (e.type === 'spell' && e.target !== '$' && !sid.has(e.target)) bad.push(`${id}: unknown spell ${e.target}`);
        if (e.type === 'spell' && !['', null, 'long', 'short', 'atWill'].includes(e.free)) bad.push(`${id}: free ${e.free}`);
        if (e.type === 'use' && (!e.name || !['long', 'short'].includes(e.reset) || !(e.value === 'pb' || /^mod:(str|dex|con|int|wis|cha)$/.test(e.value) || e.value > 0))) bad.push(`${id}: use ${e.target}`);
      }
      for (const e of x.fx.filter((q) => q.type === 'choice')) {
        if (!e.key || !e.label || !(e.n === 'pb' || e.n >= 1)) bad.push(`${id}: choice fields ${e.key}`);
        if (e.pool && !POOLS[e.pool]) bad.push(`${id}: pool ${e.pool}`);
        for (const v of Object.values(e.optionsBy || {})) if (!POOLS[v]) bad.push(`${id}: optionsBy ${v}`);
        if (e.dependsOn && !x.fx.some((q) => q.key === e.dependsOn)) bad.push(`${id}: dependsOn ${e.dependsOn}`);
        if (e.of === 'spell') for (const o of fx.choiceOptions(e, { list: 'wizard' }, POOLS) || []) if (!sid.has(o)) bad.push(`${id}: choice option ${o}`);
        if (e.of === 'spell') for (const list of Object.keys(e.optionsBy || {})) for (const o of fx.choiceOptions(e, { [e.dependsOn]: list }, POOLS)) if (!sid.has(o)) bad.push(`${id}: choice option ${o}`);
        if (typeof e.then === 'string' || (e.then === undefined)) bad.push(`${id}: choice ${e.key} then`);
      }
      for (const l of Object.values(x.expanded || {})) for (const o of l) if (!sid.has(o)) bad.push(`${id}: expanded ${o}`);
    }
    t.eq(bad, [], 'feat fx data is valid');
    for (const [k, l] of Object.entries(POOLS)) t.eq(l.filter((o) => !sid.has(o)), [], `pool ${k}: all spells exist`);
    // feat membership: every spell a feat names (fixed, pool, expanded) lists that feat
    const missing = [];
    const need = (spell, feat) => { if (!SPELLS.find((s) => s.id === spell)?.feats.includes(feat)) missing.push(`${spell}<-${feat}`); };
    for (const [id, x] of Object.entries(FEAT_FX)) {
      for (const e of x.fx) {
        if (e.type === 'spell') need(e.target, id);
        if (e.type === 'choice' && e.of === 'spell') {
          for (const o of e.pool ? POOLS[e.pool] : e.options || []) need(o, id);
          for (const v of Object.values(e.optionsBy || {})) for (const o of POOLS[v]) need(o, id);
        }
      }
      for (const l of Object.values(x.expanded || {})) for (const o of l) need(o, id);
    }
    t.eq(missing, [], 'spells list the feats that reach them');
    t.eq(Object.keys(SPELL_FEATS).filter((i) => !sid.has(i)), [], 'SPELL_FEATS keys are spells');
    t.eq(Object.values(SPELL_FEATS).flat().filter((f) => !FEAT_FX[f]), [], 'SPELL_FEATS values are feats');
    const featOnly = SPELLS.filter((s) => s.source === 'feat');
    t.ok(featOnly.length === FEAT_SPELLS.length && featOnly.every((s) => s.feats.length && FEAT_SPELL_DETAILS[s.id] && SOURCE_LINKS_SPELL(s.id)), `feat-only spells have feats, details and a Source link (${featOnly.length})`);
    function SOURCE_LINKS_SPELL(id) { return /^https:\/\//.test(srcLinks.spell[id] || ''); }
    t.eq(Object.keys(FEAT_SPELL_DETAILS).filter((i) => !featOnly.some((s) => s.id === i)), [], 'feat spell details only for feat-only spells');
    t.ok(SPELLS.find((s) => s.id === 'identify').feats.includes('fey-touched') && SPELLS.find((s) => s.id === 'identify').source === 'list', 'Identify is an Artificer spell that Fey Touched also reaches');
    t.eq(SPELLS.filter((s) => s.source === 'feat' && s.feats.length === 0).length, 0, 'no feat-only spell without a feat');

    // choice resolution and effects
    const cat = { feats: FEATS.map((f) => ({ ...f, ...FEAT_FX[f.id] })), spells: SPELLS, spellFx: {} };
    const mkc = (taken, o = {}) => { const d = defaultState().character; d.level = 5; d.abilities.int = 16; d.feats = taken.map(([featId, choices, extra], i) => ({ id: `e${i}`, featId, level: 4, notes: '', choices: choices || {}, effects: [], ...extra })); return Object.assign(d, o); };
    const E = (c) => fx.createFx(c, cat);
    let c = mkc([['fey-touched', { asi: 'int', spell1: 'identify' }]]);
    let f = E(c);
    t.ok(f.score('int') === 17 && f.abil('int').parts.some((p) => p.label === 'Fey Touched' && p.value === 1 && /unverified/.test(p.note)), 'Fey Touched +1 INT with an unverified feat label');
    t.eq(f.grants().map((g) => [g.id, g.always, g.free, g.ability]), [['misty-step', true, 'long', 'int'], ['identify', true, 'long', 'int']], 'Fey Touched grants Misty Step and the chosen spell, spell ability = the ability chosen');
    t.eq(f.uses().map((u) => [u.key, u.max, u.reset]), [['feat:e0:cast-misty-step', 1, 'long'], ['feat:e0:cast-identify', 1, 'long']], 'free casts become trackers keyed by feat entry and spell');
    c = mkc([['fey-touched', { asi: 'cha', spell1: 'bane' }]]); f = E(c);
    t.ok(f.score('cha') === 11 && f.grants().every((g) => g.ability === 'cha') && f.dc('cha').total === 8 + 3 + 0 + 0 && f.satk('cha').total === 3, 'spell ability follows the choice; DC/attack for that ability');
    t.eq(E(mkc([['fey-touched', {}]])).grants().map((g) => g.id), ['misty-step'], 'unmade choices add nothing (except fixed grants)');
    c = mkc([['tough'], ['alert']]); f = E(c);
    t.ok(f.hpmax(true).total === E(mkc([])).hpmax(true).total + 10 && f.init().total === E(mkc([])).init().total + 3, 'Tough +2 per level; Alert adds the Proficiency Bonus');
    t.eq(E(mkc([['ability-score-improvement', { asi: ['int', 'int'] }]])).score('int'), 18, 'ASI picking the same ability twice gives +2');
    t.eq(E(mkc([['ability-score-improvement', { asi: ['int', 'int'] }]], { abilities: { ...defaultState().character.abilities, int: 19 } })).score('int'), 20, 'ASI never passes 20');
    c = mkc([['skilled', { skills: ['arcana', "Smith's Tools", 'stealth'] }]], { skills: {} }); f = E(c);
    t.ok(f.skillInfo('arcana').level === 1 && f.skillInfo('stealth').level === 1 && f.list.some((e) => e.type === 'prof' && e.text === "Smith's Tools"), 'Skilled: skills and a tool proficiency');
    c = mkc([['keen-mind', { skill: 'arcana' }]], { skills: { arcana: 1 } }); t.eq(E(c).skillInfo('arcana').level, 2, 'Keen Mind gives Expertise when already proficient');
    c = mkc([['keen-mind', { skill: 'history' }]], { skills: {} }); t.eq(E(c).skillInfo('history').level, 1, 'Keen Mind gives proficiency otherwise');
    c = mkc([['resilient', { asi: 'wis' }]]); f = E(c);
    t.ok(f.score('wis') === 11 && f.save('wis').parts.some((p) => p.label === 'Resilient'), 'Resilient: +1 and the save proficiency');
    c = mkc([['magic-initiate', { list: 'wizard', spellAbility: 'int', cantrips: ['fire-bolt', 'light'], spell1: 'shield' }]]); f = E(c);
    t.eq(f.grants().map((g) => g.id), ['fire-bolt', 'light', 'shield'], 'Magic Initiate: cantrips and level 1 spell from the chosen list');
    t.eq(fx.choiceOptions(FEAT_FX['magic-initiate'].fx.find((e) => e.key === 'spell1'), { list: 'cleric' }, POOLS).includes('bless'), true, 'dependent options follow the chosen list');
    t.eq(fx.choiceOptions(FEAT_FX['magic-initiate'].fx.find((e) => e.key === 'spell1'), {}, POOLS), [], 'no list yet: no options');
    c = mkc([['magic-initiate', { list: 'wizard', spellAbility: 'int', spell1: 'shield' }], ['magic-initiate', { list: 'cleric', spellAbility: 'wis', spell1: 'bless' }]]); f = E(c);
    t.eq(f.uses().map((u) => u.key), ['feat:e0:cast-shield', 'feat:e1:cast-bless'], 'repeatable feats resolve per entry');
    // uses: pb, fixed, mod; reset kinds; level gating
    c = mkc([['lucky'], ['mage-slayer'], ['mark-of-detection', { spellAbility: 'wis' }]]); f = E(c);
    const u = Object.fromEntries(f.uses().map((x) => [x.key, x]));
    t.ok(u['feat:e0:luck'].max === 3 && u['feat:e0:luck'].reset === 'long' && u['feat:e1:guardedMind'].reset === 'short', 'uses: PB max (level 5 = 3), short and long resets');
    t.eq(f.grants().map((g) => g.id), ['detect-magic', 'detect-poison-and-disease', 'see-invisibility'], 'Mark of Detection spells (see invisibility needs level 3)');
    c.level = 2; t.eq(E(c).grants().map((g) => g.id), ['detect-magic', 'detect-poison-and-disease'], 'minLevel gates a granted spell');
    const modFeat = { id: 'zz', name: 'Zz', fx: [{ type: 'use', target: 'k', name: 'K', value: 'mod:int', reset: 'long' }], fxSrc: 'SRD 5.2.1' };
    c = mkc([['zz']]); t.eq(fx.createFx(c, { feats: [modFeat] }).uses()[0].max, 3, 'mod:<ability> uses follow the modifier');
    // expanded lists
    const ex = fx.expandedSpells(mkc([['mark-of-detection', { spellAbility: 'int' }]]), cat);
    t.ok(ex.ids.has('identify') && ex.ids.has('legend-lore') && ex.always.size === 0, 'Spells of the Mark join the list');
    const pot = fx.expandedSpells(mkc([['mark-of-detection', {}], ['potent-dragonmark', { asi: 'int' }]]), { ...cat, maxSpellLevel: (l) => art.maxSpellLevel(l) });
    t.ok(pot.always.has('identify') && pot.always.has('find-traps') && !pot.always.has('clairvoyance') && pot.ids.has('legend-lore'), 'Potent Dragonmark: always prepared only up to the level you can cast (level 5: spells up to level 2)');
    t.ok(!fx.expandedSpells(mkc([['potent-dragonmark', { asi: 'int' }]]), cat).always.size, 'Potent Dragonmark alone has no list to prepare');
    const tpl = [[{ type: 'spell', target: 'a b!c', free: 'weird', ability: 'int', junk: 1 }], [{ type: 'use', target: 'x y', name: 'n'.repeat(200), value: 2 }], [{ type: 'choice', key: 'k', label: 'L', n: 1, of: 'ability', options: ['int'], then: { type: 'ability', target: '$', value: 1, evil: 1 } }]].map((l) => fx.cleanEffects(l)[0]);
    t.ok(tpl[0].target === 'abc' && tpl[0].free === null && !('junk' in tpl[0]) && tpl[1].target === 'xy' && tpl[1].name.length === 80 && tpl[2].then.target === '$' && !('evil' in tpl[2].then), 'spell/use/choice effects are sanitized (ids, strings, unknown keys)');
    t.eq(E(mkc([['fey-touched', { asi: 'zzz' }]])).score('int'), 16, 'an invalid pick adds nothing (no fallback to a default ability)');
    t.eq(E(mkc([['resilient', { asi: 'bogus' }]])).list.filter((e) => e.src.name === 'Resilient').length, 0, 'invalid pick: no effect at all');
    let longNotes = 0; for (const x of Object.values(FEAT_FX)) { if (x.notes.length > 110) longNotes++; for (const e of x.fx) if (e.type === 'note' && e.text.length > 110) longNotes++; }
    t.eq(longNotes, 0, 'feat notes are terse reminders (110 characters or less)');
    t.ok(/Misty Step/.test(fx.describeEffect({ type: 'spell', target: 'misty-step', always: true, free: 'long', freeCount: 1, ability: 'cha' }, (i) => 'Misty Step')) && fx.describeEffect({ type: 'init', value: 'pb' }).includes('Proficiency Bonus'), 'describeEffect reads well');
    // choices survive normalize
    const n = normalize({ version: 5, character: { feats: [{ id: 'a', featId: 'skilled', choices: { skills: ['arcana', 7, 'x'.repeat(200)], asi: 'int', bad: 5 } }] } }).character.feats[0].choices;
    t.ok(n.asi === 'int' && n.skills.length === 2 && n.skills[1].length === 80 && !('bad' in n), 'feat choices are cleaned by normalize');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t = makeT('unit'); const t0 = Date.now();
  await run(t);
  console.log(`${t.fail ? 'FAIL' : 'ok  '} unit ${t.pass} passed ${t.fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  for (const f of t.failures) console.log('     - ' + f);
  process.exit(t.fail ? 1 : 0);
}
