import { CONDITIONS } from './rules.js';
import { cleanEffects } from './effects.js';
// Persistence: everything is kept in this browser's localStorage, with JSON export/import for backups.
export const KEY = 'dnd-companion-v1';
export const SCHEMA_VERSION = 5;
export const SNAP_KEY = 'dnd-companion-snapshots'; // up to 3 automatic local snapshots, newest first: [{ id, at, reason, data }]
const SNAP_DAY_KEY = 'dnd-companion-snapday';      // local date (YYYY-MM-DD) of the last daily snapshot
const SNAP_MAX = { daily: 1, rest: 1, important: 3 }; // kept per kind; eviction only within a kind
export const ATTITUDES = ['friendly', 'neutral', 'hostile', 'unknown'];
export const QUEST_STATUS = ['active', 'done', 'failed', 'paused'];

// Ids only (never dice): random bits from the Web Crypto API plus a time suffix.
export const uid = () => crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36).padStart(7, '0'), '').slice(0, 8) + Date.now().toString(36).slice(-4);

// Item sub-objects for combat data. A magic bonus is read from names like "Weapon +1".
export const magicBonus = (name) => Number(/\+(\d)/.exec(String(name || ''))?.[1]) || 0;
export const newWeapon = (bonus = 0) => ({ base: '', category: 'simple', range: 'melee', finesse: false, thrown: false, props: '', mastery: '', bonus, firearm: false, damages: [{ id: uid(), dice: '1d6', type: 'Slashing' }] });
export const newArmor = (bonus = 0) => ({ base: '', armorType: 'light', baseAC: 11, bonus, str: 0, stealth: false });
export const newShield = (bonus = 0) => ({ bonus });

// Journal entries (schema v4). Every entry has an id, lowercase tags, notes and ISO timestamps.
const stamp = () => new Date().toISOString();
const entry = (f) => ({ id: uid(), tags: [], notes: '', createdAt: stamp(), updatedAt: stamp(), ...f });
export const newNpc = (f = {}) => entry({ name: '', role: '', faction: '', attitude: 'unknown', location: '', ...f });
export const newPlace = (f = {}) => entry({ name: '', kind: '', region: '', ...f });
export const newFaction = (f = {}) => entry({ name: '', attitude: 'unknown', goals: '', ...f });
export const newQuest = (f = {}) => entry({ title: '', status: 'active', giver: '', reward: '', steps: [], ...f });
export const cleanTag = (t) => String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
export function newItem(fields = {}) {
  const it = { id: uid(), name: '', origin: 'found', planId: '', type: 'Wondrous', rarity: 'Uncommon', needsAttune: false, attuned: false, equipped: false, charges: 0, chargesMax: 0, notes: '', qty: 1, weight: 0, acBonus: 0, effects: [], ...fields };
  ensureItemData(it);
  return it;
}
// Adds the weapon/armor/shield sub-object for the item's type if missing (also fixes up older items).
export function ensureItemData(it) {
  it.qty = it.qty === undefined ? 1 : it.qty;
  it.weight = it.weight === undefined ? 0 : it.weight;
  it.acBonus = it.acBonus === undefined ? 0 : it.acBonus;
  if (!Array.isArray(it.effects)) it.effects = [];
  const b = magicBonus(it.name);
  if (it.type === 'Weapon' && !it.weapon) it.weapon = newWeapon(b);
  if (it.type === 'Armor' && !it.armor) it.armor = newArmor(b);
  if (it.type === 'Shield' && !it.shield) it.shield = newShield(b);
  if (it.armor) { it.armor.str ??= 0; it.armor.stealth ??= false; }
  if (it.weapon && !Array.isArray(it.weapon.damages)) it.weapon.damages = [{ id: uid(), dice: '1d6', type: '' }];
  return it;
}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    character: {
      name: '', player: '', species: '', background: '', alignment: '', xp: 0, level: 1, size: 'Medium', resistances: '',
      abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 10 }, // BASE scores (feats, items and spells add on top: see effects.js)
      saveProf: { str: false, dex: false, con: true, int: true, wis: false, cha: false },
      saveBonus: 0,
      skills: {}, // skillKey -> 0 none, 1 proficient, 2 expertise
      hp: { max: 10, current: 10, temp: 0, auto: true },
      hdUsed: 0,
      ac: 13, acAuto: true, acMisc: 0, speed: 30, initBonus: 0,
      inspiration: false, exhaustion: 0,
      deathSaves: { success: 0, fail: 0 },
      conditions: [],
      concentration: { id: '', name: '' }, // spell id (or '' for a custom effect) and its display name; empty name = not concentrating
      attacks: [],
      uses: {},           // feature key -> used count
      slotsUsed: [0, 0, 0, 0, 0],
      cannons: [],        // active Eldritch Cannons: { id, hp }
      spells: {},         // spell id -> 'prepared' (levelled) | 'known' (cantrip)
      spellNotes: {},
      plans: { known: {}, custom: [] },
      items: [],
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      gear: '',
      feats: [],          // { id, featId, level, notes, choices: {}, effects: [] }
      buffs: [],          // ids of non-concentration spells switched on (Longstrider, Shield...); a long rest clears them
      proficiencies: { armor: '', weapons: '', tools: '', languages: '' },
      bio: { appearance: '', personality: '', backstory: '', allies: '', notes: '' },
      voice: { personality: '', ideals: '', bonds: '', flaws: '', quirks: '', goals: [], lines: [] }, // goals: { id, text, done }; lines: { id, text }
    },
    campaign: { name: '', dm: '', setting: 'Eberron', startDate: '', notes: '' },
    sessions: [],       // each has tags: []
    journal: { npcs: [], places: [], factions: [], quests: [] },
    ui: { tab: 'combat', theme: 'dark', sub: { workshop: 'equipment', journal: 'journal', character: 'stats' }, f: {}, haptics: true, trackWeight: true, drive: { connected: false, folderId: '', fileId: '', lastSyncAt: '', lastRemoteModified: '', syncedHash: '', backupDay: '', needsConfirm: false } }, // drive = Google Drive sync metadata (local only, never uploaded, no tokens); theme: dark | light | auto; sub = last sub-tab per section; haptics = vibrate on actions; trackWeight = weight fields and the carried counter
  };
}

function merge(base, data) {
  if (Array.isArray(base)) return Array.isArray(data) ? data : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const k of Object.keys(data)) out[k] = k in base ? merge(base[k], data[k]) : data[k];
    }
    return out;
  }
  return data === undefined || data === null ? base : data;
}

// ----- schema v4: journal, character voice, session tags. Coerces every field, so it is safe to run on v4 data again.
const str = (v) => (typeof v === 'string' ? v : v == null || typeof v === 'object' ? '' : String(v));
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const when = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : stamp());
export function cleanTags(v) {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return [...new Set(raw.map(cleanTag).filter(Boolean))];
}
// Ids are used inside data-bind paths, so keep them to [A-Za-z0-9_-]; unique within one list (regenerated on a clash).
export function fixIds(list, onRename) {
  const seen = new Set();
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const old = typeof x.id === 'string' || typeof x.id === 'number' ? String(x.id) : '';
    let id = old.replace(/[^A-Za-z0-9_-]/g, '-');
    if (!id || seen.has(id)) id = uid();
    seen.add(id);
    if (old && id !== old) onRename?.(old, id);
    x.id = id;
  }
  return list;
}
const listOf = (v, fn) => (Array.isArray(v) ? v : []).filter(isObj).map(fn);
const cleanStep = (x) => ({ ...x, id: str(x.id) || uid(), text: str(x.text), done: x.done === true });
const base = (x) => ({ ...x, id: str(x.id) || uid(), tags: cleanTags(x.tags), notes: str(x.notes), createdAt: when(x.createdAt), updatedAt: when(x.updatedAt) });
const JOURNAL_SHAPES = {
  npcs: (x) => ({ ...base(x), name: str(x.name), role: str(x.role), faction: str(x.faction), attitude: oneOf(x.attitude, ATTITUDES, 'unknown'), location: str(x.location) }),
  places: (x) => ({ ...base(x), name: str(x.name), kind: str(x.kind), region: str(x.region) }),
  factions: (x) => ({ ...base(x), name: str(x.name), attitude: oneOf(x.attitude, ATTITUDES, 'unknown'), goals: str(x.goals) }),
  quests: (x) => ({ ...base(x), title: str(x.title), status: oneOf(x.status, QUEST_STATUS, 'active'), giver: str(x.giver), reward: str(x.reward), steps: listOf(x.steps, cleanStep) }),
};
function normalizeV4(s, data) {
  const from = Number(data?.version) || 0;
  s.sessions = listOf(s.sessions, (x) => ({ ...x, tags: cleanTags(x.tags) }));
  fixIds(s.sessions);
  const j = isObj(s.journal) ? s.journal : {};
  s.journal = {};
  for (const k of Object.keys(JOURNAL_SHAPES)) s.journal[k] = listOf(j[k], JOURNAL_SHAPES[k]);
  const c = s.character;
  const v = isObj(c.voice) ? c.voice : {};
  c.voice = {
    ...v, personality: str(v.personality), ideals: str(v.ideals), bonds: str(v.bonds), flaws: str(v.flaws), quirks: str(v.quirks),
    goals: listOf(v.goals, (x) => ({ ...x, id: str(x.id) || uid(), text: str(x.text), done: x.done === true })),
    lines: listOf(v.lines, (x) => ({ ...x, id: str(x.id) || uid(), text: str(x.text) })),
  };
  // Older saves: the old bio personality text becomes the voice personality (bio itself is kept as it was).
  for (const k of Object.keys(JOURNAL_SHAPES)) { fixIds(s.journal[k]); if (k === 'quests') s.journal[k].forEach((q) => fixIds(q.steps)); }
  fixIds(c.voice.goals); fixIds(c.voice.lines);
  if (data && from < 4 && !c.voice.personality && str(c.bio?.personality).trim()) c.voice.personality = str(c.bio.personality);
}

// ----- schema v5: effects. Items and taken feats carry effect lists, taken feats carry choices, character.buffs lists switched-on spells.
// Abilities stay as they were (they are the base scores now). Coerces everything, so it is safe to run again.
function normalizeV5(c) {
  for (const it of c.items) { it.effects = cleanEffects(it.effects); fixIds(it.effects); }
  c.feats = (Array.isArray(c.feats) ? c.feats : []).filter(isObj);
  for (const f of c.feats) {
    f.effects = cleanEffects(f.effects); fixIds(f.effects);
    const ch = isObj(f.choices) ? f.choices : {};
    f.choices = {};
    for (const k of Object.keys(ch)) {
      const v = Array.isArray(ch[k]) ? ch[k].filter((x) => typeof x === 'string').map((x) => x.slice(0, 80)).slice(0, 20) : typeof ch[k] === 'string' ? ch[k].slice(0, 80) : null;
      if (v !== null) f.choices[k.slice(0, 40)] = v;
    }
  }
  c.buffs = [...new Set((Array.isArray(c.buffs) ? c.buffs : []).filter((x) => typeof x === 'string' && x).map((x) => x.slice(0, 80)))];
}

// True for a parsed backup/Drive file of this app: an object with an object `character`.
export const isBackup = (data) => isObj(data) && isObj(data.character);

export function normalize(data) {
  const d = data && typeof data === 'object' ? { ...data } : {};
  // v1 (generic sheet) -> v2 (Artificer): keep what still applies.
  if (d.character && (!d.version || d.version < 2)) {
    const c = { ...d.character };
    if (Array.isArray(c.classes)) c.level = c.classes.reduce((s, x) => s + (Number(x.level) || 0), 0) || 1;
    delete c.classes; delete c.spells; delete c.features; delete c.spellcasting;
    if (Array.isArray(c.inventory)) c.gear = c.inventory.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).filter(Boolean).join('\n');
    delete c.inventory;
    d.character = c;
  }
  d.version = SCHEMA_VERSION;
  const s = merge(defaultState(), d);
  const c = s.character;
  c.level = Math.max(1, Math.min(20, Number(c.level) || 1));
  const cc = c.concentration && typeof c.concentration === 'object' ? c.concentration : {};
  c.concentration = { id: String(cc.id ?? ''), name: String(cc.name ?? '') };
  while (c.slotsUsed.length < 5) c.slotsUsed.push(0);
  for (const list of [c.attacks, c.items, c.feats, c.cannons]) fixIds(list);
  fixIds(c.plans.custom, (o, n) => c.items.forEach((i) => { if (i.planId === o) i.planId = n; }));
  // v2 -> v3: attacks get a damage-component list; items get combat data; AC is computed from equipment.
  c.conditions = (Array.isArray(c.conditions) ? c.conditions : []).filter((n) => CONDITIONS.includes(n));
  if (data && data.version && data.version < 3) {
    c.acAuto = data.character?.ac === undefined || Number(data.character.ac) === 13; // keep a manual AC the user changed
    for (const it of c.items) {
      if (it.equipped && /^(Armor|Weapon) \+\d/.test(it.name || '')) {
        it.equipped = false;
        it.notes = it.notes || 'Choose the base armor/weapon in Equipment & bag, then equip it.';
      }
    }
  }
  for (const a of c.attacks) {
    if (!Array.isArray(a.damages)) a.damages = [{ id: uid(), dice: a.damage ?? '', type: a.damageType || '' }];
    delete a.damage; delete a.damageType;
    fixIds(a.damages);
  }
  for (const it of c.items) {
    ensureItemData(it);
    if (it.weapon) fixIds(it.weapon.damages);
  }
  normalizeV4(s, data);
  normalizeV5(c);
  if (!s.ui.sub || typeof s.ui.sub !== 'object' || Array.isArray(s.ui.sub)) s.ui.sub = { workshop: 'equipment', journal: 'journal', character: 'stats' };
  return s;
}

// ----- Automatic local snapshots: a second localStorage key, newest first, this device only.
// Kinds: 'daily' (1 kept), 'rest' (1 kept, before a long rest), 'important' (3 kept: upgrade, import, restore, delete everything, unreadable data).
export const kindOf = (x) => x.kind || (x.reason === 'Daily' ? 'daily' : x.reason === 'Before long rest' ? 'rest' : 'important');
export function readSnaps() {
  try {
    const a = JSON.parse(localStorage.getItem(SNAP_KEY));
    return Array.isArray(a) ? a.filter((x) => x && typeof x.data === 'string').map((x) => ({ ...x, kind: kindOf(x) })) : [];
  } catch { return []; }
}
function writeSnaps(list) { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); }
// Drops one snapshot to make room: oldest daily/rest first, then the oldest important. False when nothing is left to drop.
function dropOneSnap() {
  const list = readSnaps();
  const i = list.findLastIndex((x) => x.kind !== 'important') >= 0 ? list.findLastIndex((x) => x.kind !== 'important') : list.length - 1;
  if (i < 0) return false;
  list.splice(i, 1);
  try { writeSnaps(list); return true; } catch { try { localStorage.removeItem(SNAP_KEY); return true; } catch { return false; } }
}
// `state` is a state object or its JSON string. Never throws; returns false when the copy could not be stored.
export function takeSnapshot(state, reason, kind = 'important') {
  try {
    const data = typeof state === 'string' ? state : JSON.stringify(state);
    const entry = { id: uid(), at: new Date().toISOString(), reason, kind, data };
    const same = [];
    const others = [];
    for (const x of readSnaps()) (x.kind === kind ? same : others).push(x);
    let next = [entry, ...same].slice(0, SNAP_MAX[kind] ?? 3);
    const merged = () => [...next, ...others].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    let list = merged();
    for (;;) {
      try { writeSnaps(list); return true; } catch (e) {
        const i = list.findLastIndex((x) => x.id !== entry.id && x.kind !== 'important');
        const j = i >= 0 ? i : list.findLastIndex((x) => x.id !== entry.id);
        if (j < 0) { console.warn('Snapshot not saved', e); return false; }
        list.splice(j, 1);
      }
    }
  } catch (e) { console.warn('Snapshot not saved', e); return false; }
}
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const loadInfo = { unreadable: false };
let holdSave = false; // set when saved data could not be read: the fallback state is not written until the user changes something
export const releaseSave = () => { holdSave = false; };

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const state = normalize(parsed);
    if (raw && parsed && typeof parsed === 'object') {
      const day = localDay();
      let lastDay = '';
      try { lastDay = localStorage.getItem(SNAP_DAY_KEY) || ''; } catch { /* storage blocked */ }
      const migrated = (Number(parsed.version) || 0) < SCHEMA_VERSION;
      if (migrated || lastDay !== day) {
        takeSnapshot(raw, migrated ? `Before upgrade to v${SCHEMA_VERSION}` : 'Daily', migrated ? 'important' : 'daily');
        try { localStorage.setItem(SNAP_DAY_KEY, day); } catch { /* ignore */ }
      }
      if (migrated) save(state); // store the upgraded copy now so the upgrade snapshot is taken only once
    }
    return state;
  } catch (e) {
    console.error('Could not load saved data', e);
    if (raw) { try { takeSnapshot(raw, 'Unreadable data', 'important'); } catch { /* ignore */ } }
    loadInfo.unreadable = !!raw;
    holdSave = !!raw;
    return defaultState();
  }
}

export function save(state) {
  if (holdSave) return true;
  let json;
  try { json = JSON.stringify(state); } catch (e) { console.error('Could not save', e); return false; }
  for (;;) {
    try { localStorage.setItem(KEY, json); return true; } catch (e) {
      // Storage is full: give up snapshot space (oldest daily/rest first, then oldest important) and try again.
      if (!dropOneSnap()) { console.error('Could not save', e); return false; }
    }
  }
}

export function backupFile(state, tag = '') {
  const name = (state.character.name || 'artificer').replace(/[^\w-]+/g, '_');
  const filename = `dnd-${name}-${tag ? `${tag}-` : ''}${new Date().toISOString().slice(0, 10)}.json`;
  const out = { ...state, ui: { ...state.ui, drive: undefined } }; // Drive ids are per device
  return new File([JSON.stringify(out, null, 2)], filename, { type: 'application/json' });
}

export function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
