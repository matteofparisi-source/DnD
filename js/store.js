// Persistence: everything is kept in this browser's localStorage, with JSON export/import for backups.
const KEY = 'dnd-companion-v1';
export const SCHEMA_VERSION = 1;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    character: {
      name: '', player: '', species: '', background: '', alignment: '', xp: 0,
      classes: [{ id: uid(), name: 'Fighter', subclass: '', level: 1, hdUsed: 0 }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProf: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
      saveBonus: 0,
      skills: {}, // skillKey -> 0 none, 1 proficient, 2 expertise
      jackOfAllTrades: false,
      hp: { max: 10, current: 10, temp: 0 },
      ac: 10, speed: 30, initBonus: 0, size: 'Medium',
      inspiration: false, exhaustion: 0,
      deathSaves: { success: 0, fail: 0 },
      conditions: [],
      attacks: [],
      spellcasting: {
        ability: '', bonusAttack: 0, bonusDC: 0,
        slots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })),
        pact: { max: 0, level: 1, used: 0 },
      },
      spells: [],
      inventory: [],
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      features: [],
      proficiencies: { armor: '', weapons: '', tools: '', languages: '' },
      bio: { appearance: '', personality: '', backstory: '', allies: '', notes: '' },
    },
    campaign: { name: '', dm: '', setting: '', startDate: '', notes: '' },
    sessions: [],
    ui: { tab: 'stats' },
  };
}

// Fill in any field missing from older saves or imports so the app never crashes on partial data.
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
  const s = merge(defaultState(), data || {});
  const slots = s.character.spellcasting.slots;
  while (slots.length < 9) slots.push({ max: 0, used: 0 });
  s.character.classes.forEach((c) => { c.id ||= uid(); c.hdUsed ||= 0; });
  for (const list of ['attacks', 'spells', 'inventory', 'features']) s.character[list].forEach((x) => { x.id ||= uid(); });
  s.sessions.forEach((x) => { x.id ||= uid(); });
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

export function exportJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const name = (state.character.name || 'character').replace(/[^\w-]+/g, '_');
  a.href = URL.createObjectURL(blob);
  a.download = `dnd-${name}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
