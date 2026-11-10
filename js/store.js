import { CONDITIONS } from './rules.js';
// Persistence: everything is kept in this browser's localStorage, with JSON export/import for backups.
export const KEY = 'dnd-companion-v1';
export const SCHEMA_VERSION = 3;

// Ids only (never dice): random bits from the Web Crypto API plus a time suffix.
export const uid = () => crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36).padStart(7, '0'), '').slice(0, 8) + Date.now().toString(36).slice(-4);

// Item sub-objects for combat data. A magic bonus is read from names like "Weapon +1".
export const magicBonus = (name) => Number(/\+(\d)/.exec(String(name || ''))?.[1]) || 0;
export const newWeapon = (bonus = 0) => ({ base: '', category: 'simple', range: 'melee', finesse: false, thrown: false, props: '', mastery: '', bonus, firearm: false, damages: [{ id: uid(), dice: '1d6', type: 'Slashing' }] });
export const newArmor = (bonus = 0) => ({ base: '', armorType: 'light', baseAC: 11, bonus, str: 0, stealth: false });
export const newShield = (bonus = 0) => ({ bonus });
export function newItem(fields = {}) {
  const it = { id: uid(), name: '', origin: 'found', planId: '', type: 'Wondrous', rarity: 'Uncommon', needsAttune: false, attuned: false, equipped: false, charges: 0, chargesMax: 0, notes: '', qty: 1, weight: 0, acBonus: 0, ...fields };
  ensureItemData(it);
  return it;
}
// Adds the weapon/armor/shield sub-object for the item's type if missing (also fixes up older items).
export function ensureItemData(it) {
  it.qty = it.qty === undefined ? 1 : it.qty;
  it.weight = it.weight === undefined ? 0 : it.weight;
  it.acBonus = it.acBonus === undefined ? 0 : it.acBonus;
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
      abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 10 },
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
      feats: [],          // { id, featId, level, notes }
      proficiencies: { armor: '', weapons: '', tools: '', languages: '' },
      bio: { appearance: '', personality: '', backstory: '', allies: '', notes: '' },
    },
    campaign: { name: '', dm: '', setting: 'Eberron', startDate: '', notes: '' },
    sessions: [],
    ui: { tab: 'combat', theme: 'dark', sub: { workshop: 'equipment', character: 'stats' }, f: {}, haptics: true, trackWeight: true }, // theme: dark | light | auto; sub = last sub-tab per section; haptics = vibrate on actions; trackWeight = weight fields and the carried counter
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
  for (const list of [c.attacks, c.items, c.feats, c.cannons, c.plans.custom, s.sessions]) list.forEach((x) => { x.id ||= uid(); });
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
    a.damages.forEach((x) => { x.id ||= uid(); });
  }
  for (const it of c.items) {
    ensureItemData(it);
    it.weapon?.damages.forEach((x) => { x.id ||= uid(); });
  }
  if (!s.ui.sub || typeof s.ui.sub !== 'object' || Array.isArray(s.ui.sub)) s.ui.sub = { workshop: 'equipment', character: 'stats' };
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch (e) {
    console.error('Could not load saved data', e);
    return defaultState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Could not save', e);
    return false;
  }
}

export function backupFile(state) {
  const name = (state.character.name || 'artificer').replace(/[^\w-]+/g, '_');
  const filename = `dnd-${name}-${new Date().toISOString().slice(0, 10)}.json`;
  return new File([JSON.stringify(state, null, 2)], filename, { type: 'application/json' });
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
