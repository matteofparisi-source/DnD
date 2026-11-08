// Persistence: everything is kept in this browser's localStorage, with JSON export/import for backups.
export const KEY = 'dnd-companion-v1';
export const SCHEMA_VERSION = 2;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    character: {
      name: '', player: '', species: '', background: '', alignment: '', xp: 0, level: 1, size: 'Medium',
      abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 10, cha: 10 },
      saveProf: { str: false, dex: false, con: true, int: true, wis: false, cha: false },
      saveBonus: 0,
      skills: {}, // skillKey -> 0 none, 1 proficient, 2 expertise
      hp: { max: 10, current: 10, temp: 0, auto: true },
      hdUsed: 0,
      ac: 13, speed: 30, initBonus: 0,
      inspiration: false, exhaustion: 0,
      deathSaves: { success: 0, fail: 0 },
      conditions: [],
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
    ui: { tab: 'stats', f: {} },
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
  while (c.slotsUsed.length < 5) c.slotsUsed.push(0);
  for (const list of [c.attacks, c.items, c.feats, c.cannons, c.plans.custom, s.sessions]) list.forEach((x) => { x.id ||= uid(); });
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
