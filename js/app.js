import { ABILITIES, SKILLS, ALIGNMENTS, CONDITIONS, CONDITION_EFFECTS, DAMAGE_TYPES, WEAPON_MASTERIES, COIN_VALUES, mod, profBonus, fmt } from './rules.js';
import {
  PLANS_KNOWN, MAGIC_ITEMS, CANTRIPS, PREPARED, SLOTS, attunementLimit, maxSpellLevel, at, SKILL_CHOICES,
  PROFICIENCIES, ARTILLERIST_PROFICIENCIES, FEATURES, USES, ARTILLERIST_SPELLS, cannonStats, SPECIES_SUGGESTIONS,
} from './data/artificer.js';
import { SPELLS, SOURCE_LABEL, SCHOOLS, slug } from './data/spells.js';
import { APP_VERSION } from './version.js';
import { PLANS, PLAN_TYPES, TIERS } from './data/plans.js';
import { FEATS, FEAT_CATEGORIES, FEAT_SOURCES } from './data/feats.js';
import { WEAPONS, ARMOR } from './data/equipment.js';
import {
  KEY, load, save, uid, normalize, defaultState, backupFile, downloadFile, newItem, newWeapon, ensureItemData,
  newNpc, newPlace, newFaction, newQuest, cleanTags, readSnaps, takeSnapshot, localDay, loadInfo, releaseSave, isBackup, SCHEMA_VERSION,
} from './store.js';

let state = load();
// Google Drive sync (optional): js/drive.js is imported only when the Drive card opens or a sync is due.
let driveMod = null;
let driveLoading = null;
let driveTimer = 0;
let driveLastRun = 0;
let driveAsk = null; // resolver of the open conflict sheet
let hashCache = null; // hash of the synced part of the data (everything but ui); null = recompute
const driveRt = { busy: false, msg: '', review: false, reviewMtime: '', prep: '', intent: '', again: false, epoch: 0, from: '' }; // prep: '' | 'preparing' | 'ready' (sign-in prepared, waiting for the 2nd tap)
const view = document.getElementById('view');
const openCards = new Set(); // open journal cards (sessions, NPCs, places, factions, quests), by id
const openSpells = new Set();
const openFilters = new Set();
const openBlocks = new Set(); // open state of the collapsed editors on Combat
let jq = ''; // global journal search text
let jtag = ''; // global journal tag filter
const COLL_OF_TAB = { journal: 'sessions', npcs: 'npcs', places: 'places', factions: 'factions', quests: 'quests' };
let addMenuOpen = false;

// Spell details (about 100 KB) are loaded on demand the first time the Spells page renders.
let DETAILS = null;
let detailsState = 'idle'; // idle | loading | failed
function ensureDetails() {
  if (DETAILS || detailsState === 'loading') return;
  detailsState = 'loading';
  import('./data/spell-details.js')
    .then((m) => { DETAILS = m.SPELL_DETAILS; detailsState = 'idle'; })
    .catch(() => { detailsState = 'failed'; })
    .then(() => { if (state.ui.tab === 'spells') renderList(); });
}

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = () => state.character;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const lvl = () => C().level;
const F = (page) => (state.ui.f[page] ||= {});

function getPath(path) {
  return path.split('.').reduce((obj, seg) => {
    if (obj == null) return undefined;
    if (seg.startsWith('#')) return obj.find((x) => x.id === seg.slice(1));
    return obj[seg];
  }, state);
}
function setPath(path, value) {
  const segs = path.split('.');
  const last = segs.pop();
  const parent = getPath(segs.join('.'));
  if (parent) parent[last] = value;
}

let saveTimer;
// Saves now and shows the result in the footer (every save path goes through here).
function saveNow() {
  releaseSave();
  hashCache = null;
  const ok = save(state);
  const el = document.getElementById('saveStatus');
  if (el) { el.textContent = ok ? 'Saved' : 'Save failed: storage full or blocked'; el.classList.toggle('error', !ok); }
  return ok;
}
function persist() {
  releaseSave(); // a change by the user: from now on the (possibly fallback) state may be written
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
  hashCache = null;
  if (driveMod) driveSchedule();
}
function commit() { persist(); render(); }
const newSession = (n, f = {}) => ({ id: uid(), number: n, date: localDay(), ingameDate: '', title: '', summary: '', notes: '', loot: '', followUps: '', tags: [], ...f });
// Journal entries remember when they were last edited.
function touch(path) {
  const m = /^(journal\.\w+\.#[^.]+)\./.exec(path);
  const e = m && getPath(m[1]);
  if (e && 'updatedAt' in e) e.updatedAt = new Date().toISOString();
}
// Auto-grow textareas (data-grow): height follows the content.
function grow(ta) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; }
function focusBy(attr, val) { [...view.querySelectorAll(`[${attr}]`)].find((x) => x.getAttribute(attr) === val)?.focus({ preventScroll: true }); }

// ---------- derived values ----------
const pb = () => profBonus(lvl());
const am = (k) => mod(C().abilities[k]);
const intMod = () => am('int');
const saveMod = (k) => am(k) + (C().saveProf[k] ? pb() : 0) + num(C().saveBonus);
const skillMod = (key) => am(SKILLS.find((s) => s.key === key).ability) + num(C().skills[key]) * pb();
const spellDC = () => 8 + pb() + intMod();
const spellAtk = () => pb() + intMod();
const autoMaxHP = () => Math.max(1, 8 + am('con') + (lvl() - 1) * (5 + am('con')));
const maxHP = () => (C().hp.auto ? autoMaxHP() : num(C().hp.max));
const hdLeft = () => Math.max(0, lvl() - num(C().hdUsed));

function alwaysPrepared() {
  const ids = new Set(['mending']);
  if (lvl() >= 3) for (const [l, names] of ARTILLERIST_SPELLS) if (lvl() >= l) names.forEach((n) => ids.add(SPELLS.find((s) => s.name === n).id));
  return ids;
}
function spellStatus(s) {
  if (alwaysPrepared().has(s.id)) return 'always';
  return C().spells[s.id] || 'none';
}
const castable = (s) => s.level === 0 || s.level <= maxSpellLevel(lvl());
const preparedCount = () => SPELLS.filter((s) => s.level > 0 && spellStatus(s) === 'prepared').length;
const cantripCount = () => SPELLS.filter((s) => s.level === 0 && spellStatus(s) === 'known').length;

const allPlans = () => [...PLANS.filter((p) => !p.generic), ...PLANS.filter((p) => p.generic), ...C().plans.custom];
const planKnown = (p) => (p.custom ? true : !!C().plans.known[p.id]);
const knownPlans = () => [...PLANS.filter((p) => !p.generic && C().plans.known[p.id]), ...C().plans.custom];
const replicated = () => C().items.filter((i) => i.origin === 'replicated');
const attunedCount = () => C().items.filter((i) => i.attuned).length;
const equippedItems = () => C().items.filter((i) => i.equipped);

// Damage text such as "1d8 + 3 piercing + 2d4 fire". The flat bonus goes on the first component only.
function dmgText(damages, flat = 0) {
  const d = (damages || []).filter((x) => x.dice || x.type);
  if (!d.length) return flat ? `${flat > 0 ? '+' : '−'} ${Math.abs(flat)}` : '—';
  return d.map((x, i) => {
    let t = x.dice || '—';
    if (i === 0 && flat) t += ` ${flat > 0 ? '+' : '−'} ${Math.abs(flat)}`;
    if (x.type) t += ` ${x.type.toLowerCase()}`;
    return i ? `+ ${t}` : t;
  }).join(' ');
}
const FIREARM_NOTE = ' (+1d8 on Artificer spells cast through it)';

// Weapon attack numbers for an item of type Weapon.
function weaponStats(it) {
  ensureItemData(it);
  const w = it.weapon || newWeapon();
  const m = w.range === 'ranged' ? am('dex') : (w.finesse ? Math.max(am('str'), am('dex')) : am('str'));
  const prof = w.category === 'simple' || hasFeat('martial-weapon-training') || (w.range === 'ranged' && lvl() >= 3);
  const bonus = num(w.bonus);
  const hit = m + (prof ? pb() : 0) + bonus;
  const dmg = dmgText(w.damages, m + bonus) + (w.firearm && lvl() >= 5 ? FIREARM_NOTE : '');
  return { hit, dmg, prof };
}

// Armor Class from equipped items (or the manual value when "auto" is off).
function acInfo() {
  const c = C();
  if (!c.acAuto) return { ac: num(c.ac), text: '', warns: [] };
  const eq = equippedItems();
  eq.forEach(ensureItemData);
  const armors = eq.filter((i) => i.type === 'Armor');
  const shields = eq.filter((i) => i.type === 'Shield');
  const dex = am('dex');
  const parts = []; // [label, value]
  const armor = armors[0];
  if (armor) {
    const a = armor.armor || {};
    const cap = hasFeat('medium-armor-master') && num(c.abilities.dex) >= 16 ? 3 : 2; // feat cap: community sources
    const dexPart = a.armorType === 'heavy' ? 0 : a.armorType === 'medium' ? Math.min(dex, cap) : dex;
    parts.push([a.base || armor.name || 'Armor', num(a.baseAC) + num(a.bonus)]);
    if (a.armorType !== 'heavy') parts.push(['DEX', dexPart]);
  } else parts.push(['Unarmored', 10], ['DEX', dex]);
  // Only one armor and one shield can be worn at a time (SRD 5.2.1 p.92): the first of each counts.
  if (shields[0]) parts.push(['Shield', 2 + num(shields[0].shield?.bonus)]);
  for (const i of eq) {
    if (num(i.acBonus) && (!i.needsAttune || i.attuned)) parts.push([i.name || 'Item', num(i.acBonus)]);
  }
  if (num(c.acMisc)) parts.push(['Other', num(c.acMisc)]);
  const ac = parts.reduce((s, p) => s + p[1], 0);
  const text = parts.map((p, i) => (i === 0 ? `${p[0]} ${p[1]}` : `${p[1] < 0 ? '−' : '+'} ${p[0]} ${Math.abs(p[1])}`)).join(' ') + ` = ${ac}`;
  const warns = [];
  if (armor?.armor?.armorType === 'heavy') warns.push("Artificers aren't trained in heavy armor (Disadvantage on D20 Tests using STR or DEX, can't cast spells).");
  if (armor && num(armor.armor?.str) > num(c.abilities.str)) warns.push(`Speed −10 ft (needs STR ${num(armor.armor.str)}).`);
  if (armor?.armor?.stealth) warns.push('Disadvantage on Stealth checks.');
  if (armors.length > 1 || shields.length > 1) warns.push('More than one armor or shield is equipped: only the first of each counts.');
  return { ac, text, warns };
}

function itemEffect(it) {
  ensureItemData(it);
  if (it.type === 'Weapon') {
    const s = weaponStats(it);
    return `${fmt(s.hit)} to hit · ${s.dmg}${s.prof ? '' : ' · not proficient'}`;
  }
  if (it.type === 'Armor') {
    const a = it.armor || {};
    const dex = a.armorType === 'heavy' ? '' : a.armorType === 'medium' ? ' + DEX (max 2)' : ' + DEX';
    return `AC ${num(a.baseAC) + num(a.bonus)}${dex}`;
  }
  if (it.type === 'Shield') return `${fmt(2 + num(it.shield?.bonus))} AC`;
  return '';
}
const carriedWeight = () => {
  const coins = Object.values(C().coins).reduce((s, n) => s + num(n), 0);
  return C().items.reduce((s, i) => s + num(i.qty) * num(i.weight), 0) + coins / 50;
};

const featById = (id) => FEATS.find((f) => f.id === id);
const hasFeat = (id) => C().feats.some((f) => f.featId === id);
function featSlots() {
  const l = lvl();
  return 1 + [4, 8, 12, 16, 19].filter((x) => l >= x).length; // origin feat (background) + ASI levels + Epic Boon
}
function meetsReq(f) {
  const r = f.req || {};
  const c = C();
  if (r.lvl && lvl() < r.lvl) return false;
  if (r.abil && !r.abil.some((a) => num(c.abilities[a]) >= (r.min || 13))) return false;
  if (r.need === 'fightingStyle' || r.need === 'heavyArmor') return false;
  if (r.need?.startsWith('species:')) {
    const sp = (c.species || '').toLowerCase();
    return r.need.slice(8).split('|').some((w) => sp.includes(w));
  }
  if (r.need?.startsWith('feat:')) return hasFeat(featById(r.need.slice(5).toLowerCase().replace(/[^a-z0-9]+/g, '-'))?.id);
  if (r.need === 'anyMark') return c.feats.some((x) => featById(x.featId)?.cat === 'Dragonmark');
  if (f.cat === 'Dragonmark' && c.feats.some((x) => featById(x.featId)?.cat === 'Dragonmark' && x.featId !== f.id)) return false;
  return true;
}
const reqText = (f) => {
  const r = f.req || {};
  const parts = [];
  if (r.lvl) parts.push(`Level ${r.lvl}+`);
  if (r.abil) parts.push(`${r.abil.map((a) => a.toUpperCase()).join(' or ')} ${r.min}+`);
  if (r.text) parts.push(r.text);
  return parts.join(', ') || 'None';
};

function usesMax(key) {
  const u = USES[key];
  return lvl() >= u.minLvl ? u.max(lvl(), intMod()) : 0;
}

function calc(key) {
  const c = C();
  const [kind, arg] = key.split(':');
  switch (kind) {
    case 'mod': return fmt(am(arg));
    case 'save': return fmt(saveMod(arg));
    case 'skill': return fmt(skillMod(arg));
    case 'pb': return fmt(pb());
    case 'init': return fmt(am('dex') + num(c.initBonus));
    case 'passive': return String(10 + skillMod('perception'));
    case 'name': return c.name || 'Unnamed Artificer';
    case 'subtitle': return [`Artificer${lvl() >= 3 ? ' (Artillerist)' : ''} ${lvl()}`, c.species].filter(Boolean).join(' · ');
    case 'hp': return `${c.hp.current}${num(c.hp.temp) ? ` +${c.hp.temp}` : ''} / ${maxHP()}`;
    case 'hpcur': return String(num(c.hp.current));
    case 'hpmax': return String(maxHP());
    case 'hptemp': return num(c.hp.temp) ? `+${num(c.hp.temp)} temp` : '';
    case 'speed': return `${num(c.speed)} ft`;
    case 'slotleft': { const n = SLOTS[lvl() - 1][Number(arg)] || 0; return `${Math.max(0, n - num(c.slotsUsed[Number(arg)]))} / ${n}`; }
    case 'useleft': { const n = usesMax(arg); return `${Math.max(0, n - num(c.uses[arg]))} / ${n}`; }
    case 'hdleft': return `${hdLeft()} / ${lvl()}`;
    case 'cannonhp': return String(num(c.cannons.find((x) => x.id === arg)?.hp));
    case 'cannonpct': return String(Math.max(0, Math.min(100, (num(c.cannons.find((x) => x.id === arg)?.hp) / Math.max(1, 5 * lvl())) * 100)));
    case 'cannonnote': return num(c.cannons.find((x) => x.id === arg)?.hp) <= 0 ? 'This cannon is at 0 HP: it is destroyed. Dismiss it.' : '';
    case 'hpPct': return String(Math.max(0, Math.min(100, (num(c.hp.current) / Math.max(1, maxHP())) * 100)));
    case 'ac': return String(acInfo().ac);
    case 'acText': return acInfo().text;
    case 'iatk': { const i = c.items.find((x) => x.id === arg); return i ? fmt(weaponStats(i).hit) : ''; }
    case 'idmg': { const i = c.items.find((x) => x.id === arg); return i ? weaponStats(i).dmg : ''; }
    case 'iname': { const i = c.items.find((x) => x.id === arg); return i?.name || 'Unnamed item'; }
    case 'itemfx': { const i = c.items.find((x) => x.id === arg); return i ? itemEffect(i) : ''; }
    case 'dc': return String(spellDC());
    case 'satk': return fmt(spellAtk());
    case 'autoHP': return String(autoMaxHP());
    case 'atk': { const a = c.attacks.find((x) => x.id === arg); return a ? fmt(attackParts(a).hit) : ''; }
    case 'dmg': { const a = c.attacks.find((x) => x.id === arg); return a ? attackParts(a).dmg : ''; }
    case 'exhaustion': {
      const e = num(c.exhaustion);
      if (!e) return 'No exhaustion.';
      return e >= 6 ? 'Death: Exhaustion 6 is fatal.' : `Exhaustion ${e}: −${2 * e} to all D20 Tests, −${5 * e} ft Speed.`;
    }
    default: return '';
  }
}
function attackParts(a) {
  const m = a.ability ? am(a.ability) : 0;
  const hit = m + (a.proficient ? pb() : 0) + num(a.bonus);
  const dmgMod = (a.addMod ? m : 0) + num(a.dmgBonus);
  const dmg = dmgText(a.damages, dmgMod) + (a.firearm && lvl() >= 5 ? FIREARM_NOTE : '');
  return { hit, dmg };
}
function refreshDerived() {
  document.querySelectorAll('[data-calc]').forEach((el) => {
    const v = calc(el.dataset.calc);
    if (el.dataset.calcAttr) el.style.setProperty(el.dataset.calcAttr, `${v}%`);
    else if (el.textContent !== v) el.textContent = v;
  });
  document.querySelectorAll('[data-show-if]').forEach((el) => { el.hidden = !calc(el.dataset.showIf); });
}

// ---------- field builders ----------
function input(path, { type = 'text', label, aria = '', cls = '', placeholder = '', list = '', min, max, rerender = false } = {}) {
  const v = getPath(path);
  const attrs = [
    `data-bind="${esc(path)}"`, type === 'number' ? 'data-type="number" inputmode="numeric"' : '',
    `type="${type}"`, `value="${esc(v)}"`, placeholder ? `placeholder="${esc(placeholder)}"` : '',
    list ? `list="${list}"` : '', min !== undefined ? `min="${min}"` : '', max !== undefined ? `max="${max}"` : '',
    rerender ? 'data-rerender' : '', !label && (aria || placeholder) ? `aria-label="${esc(aria || placeholder)}"` : '',
  ].join(' ');
  const el = `<input ${attrs}>`;
  return label ? `<label class="field ${cls}"><span>${esc(label)}</span>${el}</label>` : el;
}
function textarea(path, { label, aria = '', rows = 4, placeholder = '', grow = false } = {}) {
  const el = `<textarea data-bind="${esc(path)}" ${grow ? 'data-grow' : ''} rows="${rows}" placeholder="${esc(placeholder)}" ${!label ? `aria-label="${esc(aria || placeholder || 'Notes')}"` : ''}>${esc(getPath(path))}</textarea>`;
  return label ? `<label class="field wide"><span>${esc(label)}</span>${el}</label>` : el;
}
function select(path, options, { label, cls = '', rerender = false, type = '' } = {}) {
  const v = String(getPath(path) ?? '');
  const opts = options.map((o) => {
    const [val, text] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(val)}" ${String(val) === v ? 'selected' : ''}>${esc(text)}</option>`;
  }).join('');
  const el = `<select data-bind="${esc(path)}" ${type ? `data-type="${type}"` : ''} ${rerender ? 'data-rerender' : ''}>${opts}</select>`;
  return label ? `<label class="field ${cls}"><span>${esc(label)}</span>${el}</label>` : el;
}
function check(path, label = '', { rerender = false, title = '' } = {}) {
  return `<label class="check" ${title ? `title="${esc(title)}"` : ''}><input type="checkbox" ${!label && title ? `aria-label="${esc(title)}"` : ''} data-bind="${esc(path)}" data-type="bool" ${getPath(path) ? 'checked' : ''} ${rerender ? 'data-rerender' : ''}>${label ? `<span>${esc(label)}</span>` : ''}</label>`;
}
function pips(path, max, used, label = 'use') {
  let out = '';
  for (let i = 0; i < max; i++) out += `<button class="pip ${i < used ? 'on' : ''}" aria-pressed="${i < used}" data-action="pip" data-path="${esc(path)}" data-i="${i}" aria-label="${esc(label)} ${i + 1}"></button>`;
  return `<span class="pips">${out || '<span class="muted">—</span>'}</span>`;
}
const calcSpan = (key, cls = '') => `<span class="${cls}" data-calc="${esc(key)}">${esc(calc(key))}</span>`;
const datalists = () => `
  <datalist id="dl-species">${SPECIES_SUGGESTIONS.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-align">${ALIGNMENTS.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-dmg">${DAMAGE_TYPES.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-mastery">${WEAPON_MASTERIES.map((c) => `<option value="${c}">`).join('')}</datalist>`;
const abilityOptions = [['', '—'], ...ABILITIES.map((a) => [a.key, a.short])];

// Filter controls. Values live in state.ui.f[page][key].
function chips(page, key, options, { multi = false, def = '' } = {}) {
  const cur = F(page)[key] || def; // def: the chip that counts as on while nothing is chosen
  return `<div class="chips">${options.map(([val, text]) => {
    const on = multi ? (cur || []).includes(val) : String(cur ?? '') === String(val);
    return `<button class="chip-btn ${on ? 'on' : ''}" data-action="filter" data-page="${page}" data-key="${key}" data-val="${esc(val)}" ${multi ? 'data-multi' : ''} aria-pressed="${on}">${esc(text)}</button>`;
  }).join('')}</div>`;
}
function fselect(page, key, options, label) {
  const cur = String(F(page)[key] ?? '');
  return `<label class="field xs-inline"><span>${esc(label)}</span><select data-filter="${page}.${key}">${options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}
function fsearch(page, placeholder) {
  return `<input type="search" class="fsearch" data-filter="${page}.q" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder.replace(/…$/, ''))}" value="${esc(F(page).q || '')}">`;
}
function fcheck(page, key, label) {
  return `<label class="check"><input type="checkbox" data-filter="${page}.${key}" ${F(page)[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`;
}
// Collapsible block for the less-used filters; the summary shows how many are on.
function fmore(page, keys, inner) {
  const n = keys.filter((k) => F(page)[k]).length;
  return `<details class="fmore" data-fmore="${page}" ${openFilters.has(page) ? 'open' : ''}><summary>More filters${n ? ` <span class="badge">${n} on</span>` : ''}</summary>${inner}</details>`;
}
const matchQ = (page, ...texts) => {
  const q = (F(page).q || '').trim().toLowerCase();
  return !q || texts.some((t) => String(t ?? '').toLowerCase().includes(q));
};
const counter = (n, max, label) => `<span class="counter ${n > max ? 'over' : n === max ? 'full' : ''}">${label}: <b>${n} / ${max}</b></span>`;
const statusTag = (st) => ({
  always: '<span class="flag always">Always prepared</span>',
  prepared: '<span class="flag prepared">Prepared</span>',
  known: '<span class="flag prepared">Known</span>',
  none: '<span class="flag none">Not prepared</span>',
}[st]);
const lvlTag = (l) => `<span class="lvl lvl${l}">${l === 0 ? 'Cantrip' : `Lv ${l}`}</span>`;

// ---------- navigation and theme ----------
// Five bottom-nav sections; Workshop and Character group several pages as sub-tabs.
const SECTIONS = [
  { key: 'combat', label: 'Combat' },
  { key: 'spells', label: 'Spells' },
  { key: 'workshop', label: 'Workshop', tabs: [['equipment', 'Equipment & bag'], ['items', 'Magic items'], ['plans', 'Plans']] },
  { key: 'journal', label: 'Journal', tabs: [['journal', 'Sessions'], ['npcs', 'NPCs'], ['places', 'Places'], ['factions', 'Factions'], ['quests', 'Quests']] },
  { key: 'character', label: 'Character', tabs: [['stats', 'Stats'], ['voice', 'Voice'], ['feats', 'Feats'], ['selected', '★ Selected'], ['data', 'Campaign & data']] },
];
const NAV_ICONS = {
  combat: '<path d="M4 4l11 11M13 17l4-4M16 16l4 4"/><path d="M20 4L9 15M11 17L7 13M8 16l-4 4"/>',
  spells: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/><circle cx="19" cy="5" r="1"/>',
  workshop: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  journal: '<path d="M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5z"/><path d="M12 6v13"/>',
  character: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5z"/>',
};
const sectionOf = (tab) => SECTIONS.find((s) => s.key === tab || s.tabs?.some(([k]) => k === tab)) || SECTIONS[0];
function setTab(key) {
  if (!RENDER[key]) return;
  state.ui.tab = key;
  const sec = sectionOf(key);
  if (sec.tabs) {
    if (!state.ui.sub || typeof state.ui.sub !== 'object' || Array.isArray(state.ui.sub)) state.ui.sub = {};
    state.ui.sub[sec.key] = key;
  }
}

const THEMES = ['dark', 'light', 'auto'];
const THEME_LABEL = { dark: 'Dark', light: 'Light', auto: 'Auto' };
const THEME_BAR = { dark: '#12161b', light: '#e4dac0' }; // keep in sync with --theme-bar and index.html
const THEME_ICONS = {
  dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
};
const themeMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
const themePref = () => (THEMES.includes(state.ui.theme) ? state.ui.theme : 'dark');
function applyTheme() {
  const pref = themePref();
  const eff = pref === 'auto' ? (themeMQ?.matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = eff;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BAR[eff]);
}
themeMQ?.addEventListener?.('change', () => { if (themePref() === 'auto') applyTheme(); });

const svgIcon = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
function bottomNav(sec) {
  return `<nav class="bnav" aria-label="Sections"><div class="bnav-in">${SECTIONS.map((s) =>
    `<button data-action="section" data-key="${s.key}" ${s.key === sec.key ? 'aria-current="page"' : ''}>${svgIcon(NAV_ICONS[s.key])}<span>${s.label}</span></button>`).join('')}</div></nav>`;
}
function subTabs(sec, tab) {
  return `<div class="seg" role="tablist" aria-label="${sec.label}">${sec.tabs.map(([k, t]) =>
    `<button role="tab" id="tab-${k}" aria-selected="${k === tab}" aria-controls="panel" tabindex="${k === tab ? 0 : -1}" data-action="tab" data-key="${k}">${t}</button>`).join('')}</div>`;
}

function header(compact = false) {
  const t = themePref();
  const label = `Theme: ${THEME_LABEL[t]}`;
  const themeBtn = `<span class="hero-btns"><button class="icon add-btn" data-action="sheet" data-kind="quick" aria-label="Quick add" title="Quick add">${svgIcon('<path d="M12 5v14M5 12h14"/>')}</button><button class="icon theme-btn" data-action="theme" aria-label="${label}" title="${label}">${svgIcon(THEME_ICONS[t])}</button></span>`;
  // Combat shows HP in the dock, so its plates are AC / Prof / Spell DC / Spell atk only.
  const plates = `
    <div class="plates ${compact ? '' : 'four'}" role="group" aria-label="Key stats">
      ${compact ? `<div class="plate plate-hp"><small>HP</small><b>${calcSpan('hp')}</b><i class="bar" data-calc="hpPct" data-calc-attr="--pct" style="--pct:${calc('hpPct')}%"></i></div>` : ''}
      <div class="plate"><small>AC</small><b>${calcSpan('ac')}</b></div>
      <div class="plate"><small>Prof</small><b>${calcSpan('pb')}</b></div>
      <div class="plate"><small>Spell DC</small><b>${calcSpan('dc')}</b></div>
      <div class="plate"><small>Spell atk</small><b>${calcSpan('satk')}</b></div>
    </div>`;
  if (compact) {
    return `
  <header class="hero compact">
    <div class="hero-top"><div class="hero-main"><h1>${calcSpan('name')}</h1></div>${themeBtn}</div>${plates}
  </header>`;
  }
  return `
  <header class="hero">
    <div class="hero-top">
      <div class="hero-main">
        <h1>${calcSpan('name')}</h1>
        <p>${calcSpan('subtitle')}</p>
      </div>
      ${themeBtn}
    </div>${plates}
  </header>`;
}

// Small line icons (24x24 grid, drawn at 20px) for the 14 conditions.
const COND_ICONS = {
  Blinded: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  Charmed: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  Deafened: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a2.5 2.5 0 0 1-5 0"/><path d="M10 9a2 2 0 0 1 4 0"/><path d="M4 4l16 16"/>',
  Frightened: '<path d="M12 3v11"/><circle cx="12" cy="19" r="1.2"/><path d="M5 6l2.5 2M19 6l-2.5 2M3 12h3M18 12h3"/>',
  Grappled: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2 7-6 7-3 0-4.5-2-6-4.5L4 13.5a1.5 1.5 0 0 1 2.5-1.5L8 13.5"/>',
  Incapacitated: '<path d="M5 8a8 8 0 0 1 8-5"/><path d="M19 8a8 8 0 0 1-1 10"/><path d="M5 16a8 8 0 0 0 7 5"/>',
  Invisible: '<g stroke-dasharray="2.5 2.5"><circle cx="12" cy="7" r="3.5"/><path d="M5 21v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3"/></g>',
  Paralyzed: '<path d="M12 2L5 12h5l-1 7 7-10h-5z"/><rect x="16" y="15" width="6" height="6" rx="1"/><path d="M17.5 15v-1.5a1.5 1.5 0 0 1 3 0V15"/>',
  Petrified: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
  Poisoned: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7.5 15h9"/><circle cx="11" cy="18" r=".6"/>',
  Prone: '<circle cx="5" cy="14" r="2"/><path d="M8 15h12M14 15l2 4M11 15l-1 4M3 21h18"/>',
  Restrained: '<rect x="2.5" y="8.5" width="11" height="7" rx="3.5" transform="rotate(-20 8 12)"/><rect x="10.5" y="8.5" width="11" height="7" rx="3.5" transform="rotate(-20 16 12)"/>',
  Stunned: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/><path d="M5 16l.6 1.6L7 18l-1.4.4L5 20l-.6-1.6L3 18l1.4-.4z"/>',
  Unconscious: '<path d="M3 13c3 4 15 4 18 0"/><path d="M8 17l-1 2M12 18v2.5M16 17l1 2"/><path d="M14 3h4l-4 5h4"/>',
};
const condIcon = (name) => `<svg class="ci" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${COND_ICONS[name] || ''}</svg>`;
const condKey = (name) => String(name).toLowerCase().replace(/[^a-z]/g, '');

// Chips for active conditions and exhaustion. `action` is what tapping one does: 'tab' goes to Combat, 'sheet' opens the conditions sheet.
function statusChips(action = 'tab') {
  const c = C();
  const e = Math.min(6, num(c.exhaustion));
  const attrs = action === 'sheet' ? 'data-action="sheet" data-kind="cond"' : 'data-action="tab" data-key="combat"';
  const chips = c.conditions.map((n) => `<button class="status-chip k-${condKey(n)}" ${attrs} title="${esc(CONDITION_EFFECTS[n] || n)}">${condIcon(n)}<span>${esc(n)}</span></button>`);
  if (e) chips.unshift(`<button class="status-chip k-exhaustion x${e}" ${attrs} title="${esc(calc('exhaustion'))}">${e >= 6 ? 'Death (Exhaustion 6)' : `Exhaustion ${e}`}</button>`);
  return chips;
}
// Strip under the header on the other tabs: active conditions and exhaustion.
function statusStrip(compact = false) {
  const chips = statusChips('tab');
  return chips.length ? `<div class="status-strip ${compact ? 'compact' : ''}" aria-label="Active conditions">${chips.join('')}</div>` : '';
}

// Classes on <body> let the stylesheet show conditions and exhaustion on every tab.
function applyBodyFx() {
  const cl = document.body.classList;
  [...cl].filter((x) => /^(cond|exh)-/.test(x)).forEach((x) => cl.remove(x));
  C().conditions.filter((n) => CONDITIONS.includes(n)).forEach((n) => cl.add(`cond-${condKey(n)}`));
  const e = Math.min(6, num(C().exhaustion));
  if (e > 0) cl.add(`exh-${e}`);
}

// ----- Stats
function tabStats() {
  const c = C();
  const abilities = ABILITIES.map((a) => `
    <div class="ability ${a.key === 'int' ? 'key' : ''}">
      <span class="ab-name">${a.short}</span>
      <span class="ab-mod">${calcSpan(`mod:${a.key}`)}</span>
      ${input(`character.abilities.${a.key}`, { type: 'number', aria: `${a.name} score`, min: 1, max: 30, rerender: a.key === 'int' || a.key === 'con' })}
    </div>`).join('');
  const saves = ABILITIES.map((a) => `
    <li>${check(`character.saveProf.${a.key}`, '', { title: `${a.name} saving throw proficiency` })}<span class="grow">${a.name}${['con', 'int'].includes(a.key) ? ' <small class="muted">class</small>' : ''}</span>${calcSpan(`save:${a.key}`, 'val')}</li>`).join('');
  const chosen = SKILL_CHOICES.filter((k) => num(c.skills[k]) > 0).length;
  const skills = SKILLS.map((s) => {
    const l = num(c.skills[s.key]);
    const label = ['Not proficient', 'Proficient', 'Expertise'][l];
    const cls = SKILL_CHOICES.includes(s.key) ? '<small class="flag prepared mini" title="Artificer skill choice">A</small>' : '';
    return `<li>
      <button class="prof p${l}" data-action="cycleSkill" data-key="${s.key}" title="${label} (tap to change)" aria-label="${s.name}: ${label}"></button>
      <span class="grow">${s.name} <small class="muted">${s.ability.toUpperCase()}</small> ${cls}</span>${calcSpan(`skill:${s.key}`, 'val')}</li>`;
  }).join('');
  const haveF = FEATURES.filter((f) => lvl() >= f.lvl);
  const nextF = FEATURES.filter((f) => lvl() < f.lvl);
  const featRow = (f) => {
    const key = `ft${FEATURES.indexOf(f)}`;
    const u = f.uses && usesMax(f.uses) ? `<div class="row tight feat-uses">${pips(`character.uses.${f.uses}`, usesMax(f.uses), num(c.uses[f.uses]), f.name)}<small class="muted">${esc(USES[f.uses].name)}</small></div>` : '';
    return `<div class="feature">
      <details data-block="${key}" ${openBlocks.has(key) ? 'open' : ''}><summary><span class="lvl">L${f.lvl}</span><b class="grow">${esc(f.name)}</b></summary><p>${esc(f.text)}</p></details>${u}</div>`;
  };
  const feats = haveF.map(featRow).join('');
  const upcoming = nextF.length ? `<details class="upcoming" data-block="upcoming" ${openBlocks.has('upcoming') ? 'open' : ''}><summary>Upcoming features (${nextF.length})</summary>${nextF.map((f) => `<div class="up"><div class="row tight"><span class="lvl">L${f.lvl}</span><b>${esc(f.name)}</b></div><p>${esc(f.text)}</p></div>`).join('')}</details>` : '';

  return `
  <section class="card">
    <h2>Identity</h2>
    <div class="grid">
      ${input('character.name', { label: 'Character name' })}
      ${input('character.player', { label: 'Player' })}
      ${select('character.level', Array.from({ length: 20 }, (_, i) => [i + 1, `${i + 1}${i + 1 >= 3 ? ' · Artillerist' : ''}`]), { label: 'Level', type: 'number', rerender: true })}
      ${input('character.species', { label: 'Species', list: 'dl-species', rerender: true })}
      ${input('character.alignment', { label: 'Alignment', list: 'dl-align' })}
      ${select('character.size', ['Small', 'Medium'], { label: 'Size' })}
    </div>
    <p class="hint">Proficiency Bonus ${calcSpan('pb')}</p>
  </section>

  <section class="card">
    <h2>Ability scores</h2>
    <p class="hint">Intelligence is your spellcasting ability: it drives spell DC, spell attacks, cannon temp HP and Flash of Genius.</p>
    <div class="abilities">${abilities}</div>
  </section>

  <div class="two-col">
    <section class="card">
      <h2>Saving throws</h2>
      <ul class="list big-val">${saves}</ul>
      ${input('character.saveBonus', { label: 'Bonus to all saves (e.g. Cloak of Protection)', type: 'number', cls: 'wide' })}
      <h2>Senses</h2>
      <ul class="list"><li><span class="grow">Passive Perception</span>${calcSpan('passive', 'val')}</li></ul>
      <h2>Proficiencies</h2>
      <p class="hint"><b>Class:</b> ${esc(PROFICIENCIES.armor)}; ${esc(PROFICIENCIES.weapons)}${lvl() >= 3 ? `, ${esc(ARTILLERIST_PROFICIENCIES.weapons)}` : ''}.<br>
      <b>Tools:</b> ${esc(PROFICIENCIES.tools)}${lvl() >= 3 ? `; ${esc(ARTILLERIST_PROFICIENCIES.tools)}` : ''}.</p>
      ${input('character.proficiencies.tools', { label: 'Your Artisan\'s Tools & other tools', cls: 'wide' })}
      ${input('character.proficiencies.languages', { label: 'Languages', cls: 'wide' })}
      ${input('character.proficiencies.armor', { label: 'Other proficiencies (species, background, feats)', cls: 'wide' })}
      ${textarea('character.resistances', { label: 'Resistances (damage types, conditions…)', rows: 2 })}
    </section>
    <section class="card">
      <h2>Skills</h2>
      <p class="hint">Circle: empty = none, half = proficient, full = expertise. <span class="flag prepared mini">A</span> = Artificer choices: pick 2 (${chosen} picked).</p>
      <ul class="list big-val skills">${skills}</ul>
    </section>
  </div>

  <section class="card">
    <h2>Class features</h2>
    <p class="hint">Tap a feature to read it; tap circles to mark uses (the same uses as on Combat). Rests reset them.</p>
    <div class="features">${feats}</div>
    ${upcoming}
  </section>`;
}

// ----- Combat
// Rows of [dice][type][remove] for a list of damage components; `path` is the owner (attack or weapon) path.
function damageEditor(path, damages) {
  const rows = (damages || []).map((d) => `
    <div class="dmg-row">
      ${input(`${path}.damages.#${d.id}.dice`, { placeholder: 'Dice (1d8)', aria: 'Damage dice' })}
      ${input(`${path}.damages.#${d.id}.type`, { placeholder: 'Type', aria: 'Damage type', list: 'dl-dmg' })}
      <button class="icon danger" data-action="removeDamage" data-path="${esc(path)}.damages" data-id="${esc(d.id)}" title="Remove damage" aria-label="Remove damage">✕</button>
    </div>`).join('');
  return `<div class="dmg-editor"><span class="lbl">Damage</span>${rows}<button class="ghost small" data-action="addDamage" data-path="${esc(path)}.damages">+ Add damage</button></div>`;
}

// Initiative, Speed and the concentration plate under the header (AC and Prof are already in the header plates).
function glance() {
  const c = C();
  const conc = c.concentration?.name;
  return `
  <section class="glance" aria-label="At a glance">
    <div class="g-tile"><small>Initiative</small><b>${calcSpan('init')}</b></div>
    <div class="g-tile"><small>Speed</small><b>${calcSpan('speed')}</b></div>
    <button class="g-conc ${conc ? 'on' : ''}" data-action="sheet" data-kind="conc"><small>Concentration</small><b>${conc ? esc(conc) : 'None'}</b></button>
  </section>`;
}

// Active conditions as chips, plus the button that opens the conditions sheet.
function condRow() {
  const chips = statusChips('sheet');
  return `
  <section class="cond-row" aria-label="Conditions">
    <div class="status-strip">${chips.join('') || '<span class="muted">No conditions</span>'}</div>
    <button data-action="sheet" data-kind="cond" ${chips.length ? 'class="wide"' : ''}>Edit conditions</button>
  </section>`;
}

function resourcesCard() {
  const c = C();
  const slots = SLOTS[lvl() - 1].map((n, i) => (n ? `<li><span class="res-info"><span class="res-name">Level ${i + 1} slots</span><span class="res-left" data-calc="slotleft:${i}">${calc(`slotleft:${i}`)}</span></span>${pips(`character.slotsUsed.${i}`, n, num(c.slotsUsed[i]), `level ${i + 1} slot`)}</li>` : '')).join('');
  const uses = Object.keys(USES).filter((k) => usesMax(k)).map((k) => `<li><span class="res-info"><span class="res-name">${esc(USES[k].name)}</span><span class="res-left" data-calc="useleft:${k}">${calc(`useleft:${k}`)}</span></span>${pips(`character.uses.${k}`, usesMax(k), num(c.uses[k]), USES[k].name)}</li>`).join('');
  return `
  <section class="card">
    <h2>Resources</h2>
    <p class="hint">Tap a circle to spend a slot or use; tap a lit one to give it back.</p>
    <ul class="list res-list">${slots}${uses}
      <li><span class="res-info"><span class="res-name">Hit Dice (d8)</span><span class="res-left" data-calc="hdleft">${calc('hdleft')}</span></span><button data-action="sheet" data-kind="hd" ${lvl() - num(c.hdUsed) > 0 ? '' : 'disabled'}>Spend</button></li>
    </ul>
  </section>`;
}

// Modifiers to read off when rolling real dice. No rolling happens here.
function rollReference() {
  const c = C();
  const tile = (label, key, mark = false, on = false) =>
    `<div class="rr-tile"><small>${label}${mark ? `<i class="pmark ${on ? 'on' : ''}" aria-hidden="true"></i>${on ? '<span class="sr"> proficient</span>' : ''}` : ''}</small><b>${calcSpan(key)}</b></div>`;
  const saves = ABILITIES.map((a) => tile(`${a.short} save`, `save:${a.key}`, true, !!c.saveProf[a.key])).join('');
  const weapons = equippedItems().filter((i) => i.type === 'Weapon').map((i) => ({ name: i.name || i.weapon?.base || 'Weapon', hit: `iatk:${i.id}`, dmg: `idmg:${i.id}` }));
  const custom = c.attacks.map((a) => ({ name: a.name || 'Attack', hit: `atk:${a.id}`, dmg: `dmg:${a.id}` }));
  const rows = [...weapons, ...custom].map((a) => `
    <li class="rr-atk"><span class="rr-name">${esc(a.name)}</span><b class="rr-hit">${calcSpan(a.hit)}</b><span class="rr-dmg">${calcSpan(a.dmg)}</span></li>`).join('');
  return `
  <section class="card">
    <h2>Roll reference</h2>
    <p class="hint">Add these to your d20. A dot marks a proficient saving throw.</p>
    <div class="rr-grid">${tile('Initiative', 'init')}${tile('Spell attack', 'satk')}${tile('Spell save DC', 'dc')}${saves}</div>
    <h3>Attacks</h3>
    <ul class="list rr-atks">${rows || '<li class="muted">No weapon is equipped and no custom attack exists. Add one under Edit attacks.</li>'}</ul>
  </section>`;
}

function cannonPanel() {
  const c = C();
  if (lvl() < 3) return '<section class="card"><h2>Eldritch Cannon</h2><p class="muted">Unlocks at Artificer level 3 (Artillerist).</p></section>';
  const st = cannonStats(lvl(), intMod());
  const free = Math.max(0, usesMax('cannon') - num(c.uses.cannon));
  const room = c.cannons.length < st.count;
  const cannons = c.cannons.map((k, i) => `
    <div class="cannon-card">
      <div class="cannon-head"><b>Cannon ${i + 1}</b><span class="badge">AC ${st.ac}</span><span class="cannon-hp"><b data-calc="cannonhp:${esc(k.id)}">${num(k.hp)}</b> / ${st.hp} HP</span></div>
      <i class="meter"><i data-calc="cannonpct:${esc(k.id)}" data-calc-attr="--pct" style="--pct:${calc(`cannonpct:${k.id}`)}%"></i></i>
      <p class="warn" data-calc="cannonnote:${esc(k.id)}" data-show-if="cannonnote:${esc(k.id)}" ${calc(`cannonnote:${k.id}`) ? '' : 'hidden'}>${esc(calc(`cannonnote:${k.id}`))}</p>
      <div class="cannon-steps">
        ${[-5, -1, 1, 5].map((n) => `<button class="${n < 0 ? 'danger' : 'ok'}" data-action="cannonStep" data-id="${esc(k.id)}" data-n="${n}" aria-label="${n < 0 ? 'Damage' : 'Repair'} cannon ${i + 1} by ${Math.abs(n)}">${n < 0 ? '−' : '+'}${Math.abs(n)}</button>`).join('')}
      </div>
      <div class="cannon-acts">
        <button data-action="sheet" data-kind="cannonhp" data-id="${esc(k.id)}" aria-label="Enter an HP amount for cannon ${i + 1}">Amount</button>
        ${lvl() >= 9 ? `<button class="danger" data-action="sheet" data-kind="detonate" data-id="${esc(k.id)}">Detonate</button>` : ''}
        <button data-action="dismissCannon" data-id="${esc(k.id)}">Dismiss</button>
      </div>
    </div>`).join('');
  return `
  <section class="card">
    <h2>Eldritch Cannon</h2>
    <p class="cannon-state ${c.cannons.length ? 'on' : ''}"><b>${c.cannons.length ? `Active (${c.cannons.length})` : 'Not deployed'}</b>
      <span class="counter">Free creations left: <b>${free} / ${usesMax('cannon')}</b></span></p>
    ${cannons || '<p class="hint">Creating one takes a Magic action with Smith\'s or Woodcarver\'s Tools; it lasts 1 hour or until 0 HP.</p>'}
    <div class="cannon-create">
      <button class="ok" data-action="createCannon" data-key="free" ${free > 0 && room ? '' : 'disabled'}>${lvl() >= 15 && c.cannons.length === 0 ? 'Create two (free)' : 'Create (free)'}</button>
      <button data-action="createCannon" data-key="slot" ${room ? '' : 'disabled'}>Create with a spell slot</button>
    </div>
    ${lvl() >= 15 ? '<p class="hint">One Magic action can create two cannons. The free creation covers both; a slot pays for one, so the second needs another slot.</p>' : ''}
    <h3>Modes</h3>
    <p class="hint">Bonus Action, cannon within 60 ft; it may move 15 ft. AC ${st.ac}, immune to Poison and Psychic; Mending restores 2d6 HP.</p>
    <ul class="modes">
      <li><span class="mode-name"><b>Flamethrower</b><small>15-foot Cone</small></span><span class="mode-num">${st.flame}</span><span class="mode-det">DEX save DC ${spellDC()}, half on success</span></li>
      <li><span class="mode-name"><b>Force Ballista</b><small>120 ft</small></span><span class="mode-num">${st.ballista}</span><span class="mode-det">Spell attack ${fmt(spellAtk())}, push 5 ft</span></li>
      <li><span class="mode-name"><b>Protector</b><small>10 ft</small></span><span class="mode-num">${st.protector}</span><span class="mode-det">Temp HP to the cannon and chosen creatures</span></li>
      ${st.detonate ? `<li><span class="mode-name"><b>Detonate</b><small>Reaction, 20 ft</small></span><span class="mode-num">${st.detonate}</span><span class="mode-det">DEX save DC ${spellDC()}, half on success</span></li>` : ''}
    </ul>
    ${lvl() >= 15 ? '<p class="hint"><b>Fortified Position:</b> two cannons, one Bonus Action activates both; Half Cover for you and allies within 10 ft of a cannon.</p>' : ''}
  </section>`;
}

function exhaustionMeter() {
  const e = Math.min(6, num(C().exhaustion));
  const segs = [1, 2, 3, 4, 5, 6].map((n) => `<button class="xseg s${n} ${n <= e ? 'on' : ''}" data-action="setExhaustion" data-fk="x${n}" data-n="${n}" aria-label="Exhaustion ${n}" aria-pressed="${n <= e}">${n}</button>`).join('');
  return `
    <div class="xmeter">
      <button class="xseg s0 ${e === 0 ? 'on' : ''}" data-action="setExhaustion" data-fk="x0" data-n="0" aria-label="Exhaustion 0, none" aria-pressed="${e === 0}">0</button>${segs}
    </div>
    <p class="xlabel ${e >= 6 ? 'dead' : ''}">${calcSpan('exhaustion')}</p>`;
}

function conditionButtons() {
  return CONDITIONS.map((name) => {
    const on = C().conditions.includes(name);
    const fx = CONDITION_EFFECTS[name] || '';
    return `<button class="cond k-${condKey(name)} ${on ? 'on' : ''}" data-action="toggleCondition" data-fk="c-${condKey(name)}" data-key="${name}" aria-pressed="${on}">
      <span class="cond-head">${condIcon(name)}<span class="cn">${esc(name)}</span></span>${on ? `<small class="ce">${esc(fx)}</small>` : ''}
    </button>`;
  }).join('');
}

function equipmentAttacks() {
  const list = equippedItems().filter((i) => i.type === 'Weapon');
  if (!list.length) return '<p class="muted">No weapon is equipped. Equip one on the Equipment tab and it shows up here.</p>';
  return list.map((i) => {
    ensureItemData(i);
    const w = i.weapon;
    const s = weaponStats(i);
    return `<div class="item eq-attack">
      <div class="row tight">
        <b class="grow">${esc(i.name || w.base || 'Weapon')}</b>
        <span class="badge">${calcSpan(`iatk:${i.id}`)} to hit</span>
        <button class="small" data-action="tab" data-key="equipment" title="Edit in Workshop, Equipment & bag">Equipment</button>
      </div>
      <div class="row tight tags-row">
        <span class="muted">Damage: ${calcSpan(`idmg:${i.id}`)}</span>
        ${w.props ? `<span class="tag-s">${esc(w.props)}</span>` : ''}
        ${w.mastery ? `<span class="tag-s mastery" title="Needs Weapon Mastery (Artificers don't have it) or the Weapon Master feat">${esc(w.mastery)}</span>` : ''}
        ${s.prof ? '' : '<span class="tag-s c">not proficient</span>'}
      </div>
    </div>`;
  }).join('');
}

function deathCard(urgent) {
  const c = C();
  return `
  <section class="card death-card ${urgent ? 'urgent' : ''}">
    <h2>Death saves</h2>
    ${urgent ? '<p class="warn">You are at 0 HP. Roll a death save on your turn and mark each result here. Any healing resets the marks.</p>' : '<p class="hint">Used only at 0 HP. Healing resets the marks.</p>'}
    <div class="row death">
      <span>Successes</span>${pips('character.deathSaves.success', 3, c.deathSaves.success, 'success')}
      <span>Failures</span>${pips('character.deathSaves.fail', 3, c.deathSaves.fail, 'failure')}
    </div>
  </section>`;
}

// Collapsed editors: opened state is remembered in openBlocks across re-renders.
function block(key, title, inner) {
  return `<details class="card block" data-block="${key}" ${openBlocks.has(key) ? 'open' : ''}><summary>${title}</summary>${inner}</details>`;
}

function tabCombat() {
  const c = C();
  const zero = num(c.hp.current) <= 0;
  const attacks = c.attacks.map((a) => `
    <div class="item">
      <div class="item-head">
        ${input(`character.attacks.#${a.id}.name`, { placeholder: 'Weapon or attack', aria: 'Attack name' })}
        <span class="badge">${calcSpan(`atk:${a.id}`)} to hit</span>
        <button class="icon danger" data-action="removeAttack" data-id="${esc(a.id)}" title="Delete" aria-label="Delete attack">✕</button>
      </div>
      <div class="row">
        ${select(`character.attacks.#${a.id}.ability`, abilityOptions, { label: 'Ability', cls: 'xs' })}
        ${input(`character.attacks.#${a.id}.bonus`, { label: 'Hit bonus', type: 'number', cls: 'xs' })}
        ${input(`character.attacks.#${a.id}.dmgBonus`, { label: 'Dmg bonus', type: 'number', cls: 'xs' })}
        ${input(`character.attacks.#${a.id}.mastery`, { label: 'Mastery', list: 'dl-mastery', cls: 'sm' })}
        ${input(`character.attacks.#${a.id}.notes`, { label: 'Range / properties', cls: 'grow' })}
      </div>
      ${damageEditor(`character.attacks.#${a.id}`, a.damages)}
      <div class="row">
        ${check(`character.attacks.#${a.id}.proficient`, 'Proficient')}
        ${check(`character.attacks.#${a.id}.addMod`, 'Add ability mod to damage (first component)')}
        ${lvl() >= 5 ? check(`character.attacks.#${a.id}.firearm`, 'Arcane Firearm') : ''}
      </div>
      <p class="muted dmg-line">Damage: ${calcSpan(`dmg:${a.id}`)}</p>
    </div>`).join('');
  const ai = acInfo();
  const defense = `
    <div class="grid three">
      ${input('character.hp.current', { label: 'Current HP', type: 'number' })}
      ${c.hp.auto ? `<div class="field"><span>Max (auto)</span><div class="static">${calcSpan('autoHP')}</div></div>` : input('character.hp.max', { label: 'Max HP', type: 'number', min: 1 })}
      ${input('character.hp.temp', { label: 'Temporary HP', type: 'number', min: 0 })}
    </div>
    ${check('character.hp.auto', 'Calculate max HP (8 + CON at level 1, then 5 + CON per level)', { rerender: true })}
    <h3>Armor Class</h3>
    <p class="ac-line"><span class="ac-big">AC ${calcSpan('ac')}</span> <small class="muted" data-calc="acText">${esc(calc('acText'))}</small></p>
    ${ai.warns.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
    ${check('character.acAuto', 'Auto AC from equipment', { rerender: true })}
    ${c.acAuto ? '' : '<p class="hint">Turn on Auto AC to calculate it from your equipped armor and shield.</p>'}
    <div class="grid">
      ${c.acAuto ? input('character.acMisc', { label: 'Other AC bonus', type: 'number' }) : input('character.ac', { label: 'Armor Class', type: 'number' })}
      ${input('character.speed', { label: 'Speed (ft)', type: 'number' })}
      ${input('character.initBonus', { label: 'Init bonus', type: 'number' })}
    </div>
    <p class="hint">Initiative ${calcSpan('init')} (DEX + bonus; Alert feat: add your Proficiency Bonus).</p>`;
  const atk = `
    <h3>From equipment</h3>
    ${equipmentAttacks()}
    <h3>Custom attacks</h3>
    ${attacks || '<p class="muted">No custom attacks yet.</p>'}
    <button class="ghost" data-action="addAttack">+ Add attack</button>`;

  return `
  ${zero ? deathCard(true) : ''}
  ${glance()}
  ${condRow()}
  ${resourcesCard()}
  ${rollReference()}
  ${cannonPanel()}
  ${zero ? '' : deathCard(false)}
  ${block('defense', 'Edit defense', defense)}
  ${block('attacks', 'Edit attacks', atk)}`;
}

// Fixed bar above the bottom navigation (Combat only): quick Damage, Heal and Rest.
function dock() {
  return `
  <div class="dock" role="region" aria-label="Hit points and quick actions">
    <button class="dock-btn danger" data-action="sheet" data-kind="damage">Damage</button>
    <div class="dock-hp">
      <div class="dock-line"><b class="dock-num" data-calc="hpcur">${calc('hpcur')}</b><span class="dock-max">/ <span data-calc="hpmax">${calc('hpmax')}</span> HP</span></div>
      <span class="dock-temp" data-calc="hptemp" data-show-if="hptemp" ${num(C().hp.temp) ? '' : 'hidden'}>${esc(calc('hptemp'))}</span>
      <i class="bar" data-calc="hpPct" data-calc-attr="--pct" style="--pct:${calc('hpPct')}%"></i>
    </div>
    <button class="dock-btn ok" data-action="sheet" data-kind="heal">Heal</button>
    <button class="dock-btn" data-action="sheet" data-kind="rest">Rest</button>
  </div>`;
}

// ----- Spells
// Casting-time tags come from the spell details (time string), not from stored data.
const CAST_FILTERS = [['', 'Any'], ['action', 'Action'], ['bonus', 'Bonus'], ['reaction', 'Reaction'], ['ritual', 'Ritual'], ['longer', 'Longer']];
const det = (id) => DETAILS?.[id];
function castInfo(s) {
  const t = String(det(s.id)?.time || '').toLowerCase();
  const lead = t.split(/,| or /)[0].trim(); // "Action or Ritual" -> "action"; "Reaction, which you take..." -> "reaction"
  return {
    action: /^(1 )?action\b/.test(lead),
    bonus: /\bbonus action\b/.test(lead),
    reaction: /\breaction\b/.test(lead),
    longer: /\b(minute|hour)s?\b/.test(lead),
    ritual: /\britual\b/.test(t) || s.flags.includes('R'),
  };
}
// Body of a spell card: built only when its <details> is opened.
function spellBody(s) {
  const d = det(s.id);
  const note = spellStatus(s) !== 'none' ? `<input class="note" data-bind="character.spellNotes.${esc(s.id)}" value="${esc(C().spellNotes[s.id] || '')}" placeholder="Your notes (range, damage, reminders)" aria-label="Your notes for ${esc(s.name)}">` : '';
  if (!d) return `<p class="muted">${detailsState === 'failed' ? "Spell details couldn't load (offline?)." : 'No details for this spell.'}</p>${note}`;
  const row = (l, v) => `<div class="sd-row"><dt>${l}</dt><dd>${esc(v)}</dd></div>`;
  const paras = (t) => String(t || '').split(/\n\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
  const long = (l, t) => `<div class="sd-long"><dt>${l}</dt><dd>${paras(t)}</dd></div>`;
  const higher = String(d.higher || '').replace(/^(Using a Higher-Level Spell Slot|Cantrip Upgrade)[.:]\s*/, '');
  const url = (/https?:\/\/[^\s),;]+/.exec(d.source) || [''])[0];
  const src = d.verbatim
    ? `<span class="tag-s ok">SRD 5.2.1 · official text</span> <span class="muted">${esc(d.source)}</span>`
    : /\(user's copy\)/.test(d.source)
    ? `<span class="tag-s ok">Checked against your book</span> <span class="muted">${esc(d.source)}</span>`
    : `<span class="tag-s warn">Community source · unverified</span> ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, ''))}</a>` : `<span class="muted">${esc(d.source)}</span>`}`;
  return `<dl class="sd-list">${row('Casting Time', d.time)}${row('Range', d.range)}${row('Components', d.components)}${row('Duration', d.duration)}${long('Description', d.desc)}${higher ? long('At Higher Levels', higher) : ''}</dl>
    <p class="sd-src">${src}</p>
    ${d.note ? `<p class="sd-note">${esc(d.note)}</p>` : ''}${note}`;
}
function spellCard(s) {
  const st = spellStatus(s);
  const ok = castable(s);
  const open = openSpells.has(s.id);
  const ci = castInfo(s);
  const btn = st === 'always'
    ? '<button class="small sp-act" disabled>Always</button>'
    : `<button class="small sp-act ${st === 'none' ? '' : 'ok'}" data-action="toggleSpell" data-id="${esc(s.id)}" aria-label="${st === 'none' ? (s.level ? 'Prepare' : 'Learn') : (s.level ? 'Unprepare' : 'Forget')} ${esc(s.name)}" ${ok ? '' : 'disabled'}>${st === 'none' ? (s.level ? 'Prepare' : 'Learn') : (s.level ? 'Unprepare' : 'Forget')}</button>`;
  return `<div class="item spell ${st !== 'none' ? 'sel' : ''} ${ok ? '' : 'locked'}">
    <details class="spell-card" data-spell="${esc(s.id)}" data-lazy="spell:${esc(s.id)}" ${open ? 'open' : ''}>
      <summary>
        <span class="sp-line">${lvlTag(s.level)}<b class="grow">${esc(s.name)}</b></span>
        <span class="row tight tags-row">
          ${statusTag(st)}
          ${ci.action ? '<span class="tag-s cast">Action</span>' : ''}${ci.bonus ? '<span class="tag-s cast">Bonus Action</span>' : ''}${ci.reaction ? '<span class="tag-s cast">Reaction</span>' : ''}${ci.longer ? '<span class="tag-s cast">Longer</span>' : ''}
          ${s.flags.includes('C') ? '<span class="tag-s c">Concentration</span>' : ''}
          ${ci.ritual ? '<span class="tag-s r">Ritual</span>' : ''}
          <span class="tag-s">${esc(s.school)}</span>
          <span class="tag-s src">${esc(s.book || SOURCE_LABEL[s.source])}</span>
          ${ok ? '' : `<span class="tag-s">needs level ${s.level} slots</span>`}
        </span>
      </summary>
      ${open ? `<div class="lazy-body">${spellBody(s)}</div>` : ''}
    </details>
    ${btn}
  </div>`;
}
function spellsList() {
  if (!DETAILS && detailsState !== 'failed') return '<p class="muted" role="status">Loading spell details…</p>';
  const f = F('spells');
  const mine = f.view !== 'all';
  const q = (f.q || '').trim().toLowerCase();
  // When searching, spells whose name matches come before description-only matches.
  const nameHit = (s) => (q && s.name.toLowerCase().includes(q) ? 1 : 0);
  const list = SPELLS.filter((s) => {
    const st = spellStatus(s);
    const chosen = st !== 'none'; // a spell you already selected stays visible whatever the toggles say
    if (f.cast && !castInfo(s)[f.cast]) return false;
    if (mine) {
      if (!chosen) return false;
    } else {
      if (s.source === 'legacy' && !f.legacy && !chosen) return false;
      if (s.source === 'extra' && !f.extra && !chosen) return false;
      if (s.source === 'artillerist' && st !== 'always' && !f.showLocked) return false;
      if (f.level !== undefined && f.level !== '' && String(s.level) !== String(f.level)) return false;
      if (f.status === 'selected' && !['always', 'prepared', 'known'].includes(st)) return false;
      if (f.status === 'prepared' && !['prepared', 'known'].includes(st)) return false;
      if (f.status === 'always' && st !== 'always') return false;
      if (f.status === 'none' && st !== 'none') return false;
      if (f.school && s.school !== f.school) return false;
      if (f.conc && !s.flags.includes('C')) return false;
      if (!f.showLocked && !castable(s) && !chosen) return false;
    }
    return matchQ('spells', s.name, s.school, SOURCE_LABEL[s.source], s.book, det(s.id)?.desc, C().spellNotes[s.id]);
  }).sort((a, b) => nameHit(b) - nameHit(a) || a.level - b.level || a.name.localeCompare(b.name));
  const fail = detailsState === 'failed' ? '<p class="warn">Spell details could not be loaded (offline before the first visit?). Names and prepare buttons still work; reopen this page to retry.</p>' : '';
  if (!list.length) {
    return fail + (mine && !Object.keys(C().spells).length && !f.cast && !q
      ? '<p class="muted">No spells selected yet. Open "All spells" to learn cantrips and prepare spells.</p>'
      : '<p class="muted">No spell matches these filters.</p>');
  }
  if (!mine) return fail + list.map(spellCard).join('');
  return fail + [0, 1, 2, 3, 4, 5].map((l) => {
    const arr = list.filter((s) => s.level === l);
    return arr.length ? `<h3 class="grp">${l === 0 ? 'Cantrips' : `Level ${l}`} <span class="muted">(${arr.length})</span></h3>${arr.map(spellCard).join('')}` : '';
  }).join('');
}
function tabSpells() {
  ensureDetails();
  const f = F('spells');
  const mine = f.view !== 'all';
  const maxL = maxSpellLevel(lvl());
  return `
  <section class="card">
    <h2>Artificer spells</h2>
    <div class="row">
      ${counter(preparedCount(), at(PREPARED, lvl()), 'Prepared')}
      ${counter(cantripCount(), at(CANTRIPS, lvl()), 'Cantrips')}
      <span class="counter">Highest slot: <b>${maxL}</b></span>
      <span class="counter">DC <b>${spellDC()}</b> · Atk <b>${fmt(spellAtk())}</b></span>
    </div>
    <div class="vseg" role="group" aria-label="Spell list">
      <button data-action="spellView" data-key="mine" aria-pressed="${mine}">My spells</button>
      <button data-action="spellView" data-key="all" aria-pressed="${!mine}">All spells</button>
    </div>
    <div class="filters">
      ${fsearch('spells', 'Search spells…')}
      ${chips('spells', 'cast', CAST_FILTERS)}
      ${mine ? '' : `
      ${chips('spells', 'level', [['', 'All levels'], [0, 'Cantrip'], ...Array.from({ length: 5 }, (_, i) => [i + 1, `Lv ${i + 1}`])])}
      ${chips('spells', 'status', [['', 'Any status'], ['selected', '★ Selected'], ['prepared', 'Prepared'], ['always', 'Always'], ['none', 'Not prepared']])}
      ${fmore('spells', ['school', 'conc', 'showLocked', 'legacy', 'extra'], `
      <div class="row">
        ${fselect('spells', 'school', [['', 'Any school'], ...SCHOOLS.map((s) => [s, s])], 'School')}
        ${fcheck('spells', 'conc', 'Concentration')}
        ${fcheck('spells', 'showLocked', 'Show spells above my level')}
        ${fcheck('spells', 'legacy', "Include Tasha's/Xanathar's legacy spells")}
        ${fcheck('spells', 'extra', 'Include other official books (Arcana Unleashed, D&D Beyond Drops)')}
      </div>
      `)}`}
    </div>
    <div id="list">${spellsList()}</div>
    <p class="hint">Always-prepared spells (Artillerist and Mending) don't count against your prepared total. You can change prepared spells after a Long Rest. Tap a spell's name for its details.</p>
    ${mine ? '' : '<p class="hint">The list follows the 2025 Forge of the Artificer Artificer, taken from a community transcription. "Legacy" spells were on the 2020 Tasha\'s Artificer list but aren\'t on the 2025 list: use them only if your DM agrees. Spells from "other official books" are on the list but come from books outside the ones you play with. Spells you have selected always stay visible.</p>'}
  </section>`;
}

// ----- Plans
function planCard(p) {
  const known = planKnown(p);
  const avail = p.tier <= lvl();
  const made = C().items.filter((i) => i.planId === p.id).length;
  let actions;
  if (p.generic) actions = `<button class="small" data-action="learnGeneric" data-id="${esc(p.id)}" ${avail ? '' : 'disabled'}>+ Learn an item</button>`;
  else actions = `
    ${known ? `<button class="small ok" data-action="craft" data-id="${esc(p.id)}">Create</button>` : ''}
    <button class="small ${known ? '' : 'ok'}" data-action="togglePlan" data-id="${esc(p.id)}" ${avail || known ? '' : 'disabled'}>${known ? (p.custom ? 'Remove' : 'Forget') : 'Learn'}</button>`;
  return `<div class="item ${known && !p.generic ? 'sel' : ''} ${avail ? '' : 'locked'}">
    <div class="row tight">
      <span class="lvl">L${p.tier}+</span>
      <b class="grow">${esc(p.name)}</b>
      ${actions}
    </div>
    <div class="row tight tags-row">
      ${p.generic ? '<span class="flag none">Any item of this kind: learn several</span>' : (known ? '<span class="flag prepared">Known</span>' : '<span class="flag none">Not known</span>')}
      <span class="tag-s">${esc(p.type)}</span>
      ${p.attune === true ? '<span class="tag-s c">Attunement</span>' : p.attune === false ? '<span class="tag-s">No attunement</span>' : '<span class="tag-s">Attunement varies</span>'}
      ${p.custom ? `<span class="tag-s src">${esc(p.base)}</span>` : ''}
      ${made ? `<span class="tag-s r">${made} made</span>` : ''}
    </div>
  </div>`;
}
function plansList() {
  const f = F('plans');
  const view = f.view || 'now'; // now = known first, then what I can learn now | known | all
  const list = allPlans().filter((p) => {
    if (f.tier && String(p.tier) !== String(f.tier)) return false;
    if (f.type && p.type !== f.type) return false;
    if (f.attune === 'yes' && p.attune !== true) return false;
    if (f.attune === 'no' && p.attune !== false) return false;
    return matchQ('plans', p.name, p.type, p.base);
  }).sort((a, b) => a.tier - b.tier || (!!a.generic - !!b.generic) || a.name.localeCompare(b.name));
  if (view === 'all') return list.length ? list.map(planCard).join('') : '<p class="muted">No plan matches these filters.</p>';
  const known = list.filter((p) => planKnown(p) && !p.generic);
  const section = (title, arr, empty) => `<h3 class="grp">${title} <span class="muted">(${arr.length})</span></h3>${arr.length ? arr.map(planCard).join('') : `<p class="muted">${empty}</p>`}`;
  const knownSec = section('Known plans', known, C().plans.custom.length || Object.keys(C().plans.known).length ? 'No known plan matches these filters.' : 'You have not learned any plans yet.');
  if (view === 'known') return knownSec;
  const now = list.filter((p) => !planKnown(p) && p.tier <= lvl());
  return knownSec + section('Learnable now', now, 'No other plan is available at your level with these filters.');
}
function tabPlans() {
  if (lvl() < 2) return '<section class="card"><h2>Plans</h2><p class="muted">Replicate Magic Item unlocks at Artificer level 2. Change your level on the Stats tab.</p></section>';
  return `
  <section class="card">
    <h2>Magic item plans</h2>
    <div class="row">
      ${counter(knownPlans().length, at(PLANS_KNOWN, lvl()), 'Plans known')}
      ${counter(replicated().length, at(MAGIC_ITEMS, lvl()), 'Items made')}
    </div>
    <p class="hint">At the end of a Long Rest, with Tinker's Tools, create one or two items from different known plans. If you go over your Magic Items total, the oldest one vanishes. Each time you gain a level you can swap one plan.</p>
    <div class="filters">
      ${fsearch('plans', 'Search plans…')}
      ${chips('plans', 'view', [['now', 'Known + learnable'], ['known', '★ Known'], ['all', 'All']], { def: 'now' })}
      ${chips('plans', 'tier', [['', 'All tiers'], ...TIERS.map((t) => [t, `Level ${t}+`])])}
      <div class="row">
        ${fselect('plans', 'type', [['', 'Any type'], ...PLAN_TYPES.map((t) => [t, t])], 'Type')}
        ${fselect('plans', 'attune', [['', 'Any'], ['yes', 'Requires attunement'], ['no', 'No attunement']], 'Attunement')}
      </div>
    </div>
    <div id="list">${plansList()}</div>
  </section>`;
}

// ----- Equipment & bag
const ITEM_TYPES = ['Armor', 'Shield', 'Weapon', 'Wand', 'Ring', 'Wondrous', 'Potion', 'Scroll', 'Staff', 'Rod', 'Other'];
const catalogSelect = (path, names, id, kind) => `<select data-bind="${esc(path)}" data-catalog="${kind}" data-id="${esc(id)}">${['', ...names].map((n) => `<option value="${esc(n)}" ${n === String(getPath(path) ?? '') ? 'selected' : ''}>${n ? esc(n) : '— choose from the list —'}</option>`).join('')}</select>`;

function weaponFields(i, p) {
  const w = i.weapon;
  const wp = `${p}.weapon`;
  return `
    <div class="subbox">
      <div class="row">
        <label class="field sm"><span>Base weapon</span>${catalogSelect(`${wp}.base`, WEAPONS.map((x) => x.name), i.id, 'weapon')}</label>
        ${select(`${wp}.category`, [['simple', 'Simple'], ['martial', 'Martial']], { label: 'Category', cls: 'sm' })}
        ${select(`${wp}.range`, [['melee', 'Melee'], ['ranged', 'Ranged']], { label: 'Range', cls: 'xs' })}
        ${input(`${wp}.bonus`, { label: 'Magic bonus (+N)', type: 'number', cls: 'xs' })}
      </div>
      <div class="row">
        ${check(`${wp}.finesse`, 'Finesse')}
        ${check(`${wp}.thrown`, 'Thrown')}
        ${lvl() >= 5 ? check(`${wp}.firearm`, 'Arcane Firearm') : ''}
      </div>
      <div class="row">
        ${input(`${wp}.props`, { label: 'Properties', cls: 'grow' })}
        ${input(`${wp}.mastery`, { label: 'Mastery', list: 'dl-mastery', cls: 'sm' })}
      </div>
      ${damageEditor(wp, w.damages)}
    </div>`;
}
function armorFields(i, p) {
  const ap = `${p}.armor`;
  return `
    <div class="subbox">
      <div class="row">
        <label class="field sm"><span>Base armor</span>${catalogSelect(`${ap}.base`, ARMOR.map((x) => x.name), i.id, 'armor')}</label>
        ${select(`${ap}.armorType`, [['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']], { label: 'Type', cls: 'xs', rerender: true })}
        ${input(`${ap}.baseAC`, { label: 'Base AC', type: 'number', cls: 'xs' })}
        ${input(`${ap}.bonus`, { label: 'Magic bonus (+N)', type: 'number', cls: 'xs' })}
        ${input(`${ap}.str`, { label: 'STR needed', type: 'number', min: 0, cls: 'xs' })}
      </div>
      <div class="row">${check(`${ap}.stealth`, 'Disadvantage on Stealth')}</div>
    </div>`;
}

const ORIGINS = [['replicated', 'Replicated (plan)'], ['found', 'Found / loot'], ['bought', 'Bought'], ['reward', 'Reward / gift']];
const RARITIES = ['Mundane', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
const trackWeight = () => state.ui.trackWeight !== false;

// Read-only slot pips; slots past the limit show in the "bad" color.
function attuneBar() {
  const lim = attunementLimit(lvl());
  const n = attunedCount();
  const dots = Array.from({ length: Math.max(lim, n) }, (_, i) => `<i class="apip ${i < n ? 'on' : ''} ${i >= lim ? 'over' : ''}"></i>`).join('');
  return `<div class="attune-bar">${counter(n, lim, 'Attuned')}<span class="apips" role="img" aria-label="${n} of ${lim} attunement slots used${n > lim ? ' (over the limit)' : ''}">${dots}</span></div>`;
}

const qtyStep = (i) => `<span class="qty" role="group" aria-label="Quantity of ${esc(i.name || 'item')}">
  <button class="icon" data-action="qty" data-id="${esc(i.id)}" data-d="-1" aria-label="Decrease quantity of ${esc(i.name || 'item')}">−</button>
  <b class="qty-n">${num(i.qty)}</b>
  <button class="icon" data-action="qty" data-id="${esc(i.id)}" data-d="1" aria-label="Increase quantity of ${esc(i.name || 'item')}">+</button></span>`;

const needsAttuneCheck = (i) => `<label class="check"><input type="checkbox" data-action="toggleNeeds" data-id="${esc(i.id)}" ${i.needsAttune ? 'checked' : ''}><span>Requires attunement</span></label>`;
// Everything editable about an item; built only when the card's Edit block is opened.
function itemEdit(i, kind) {
  ensureItemData(i);
  const p = `character.items.#${i.id}`;
  const del = `<button class="danger small" data-action="removeItem" data-id="${esc(i.id)}">Delete item</button>`;
  if (kind === 'magic') {
    return `
    ${input(`${p}.name`, { label: 'Name', cls: 'wide' })}
    <div class="row">
      ${select(`${p}.origin`, ORIGINS, { label: 'Origin', cls: 'sm', rerender: true })}
      ${select(`${p}.type`, ITEM_TYPES, { label: 'Type', cls: 'sm', rerender: true })}
      ${select(`${p}.rarity`, RARITIES.filter((r) => r !== 'Mundane'), { label: 'Rarity', cls: 'sm', rerender: true })}
      ${input(`${p}.qty`, { label: 'Qty', type: 'number', min: 0, cls: 'xs', rerender: true })}
      ${input(`${p}.charges`, { label: 'Charges', type: 'number', min: 0, cls: 'xs' })}
      ${input(`${p}.chargesMax`, { label: 'Max', type: 'number', min: 0, cls: 'xs' })}
    </div>
    <div class="row">${needsAttuneCheck(i)}</div>
    ${textarea(`${p}.notes`, { rows: 2, placeholder: 'What it does, command words, where you found it…' })}
    <div class="row">${del}</div>`;
  }
  return `
    ${input(`${p}.name`, { label: 'Name', cls: 'wide' })}
    <div class="row">
      ${select(`${p}.type`, ITEM_TYPES, { label: 'Type', cls: 'sm', rerender: true })}
      ${select(`${p}.rarity`, RARITIES, { label: 'Rarity', cls: 'sm', rerender: true })}
      ${trackWeight() ? input(`${p}.weight`, { label: 'Weight (lb each)', type: 'number', min: 0, cls: 'xs' }) : ''}
    </div>
    ${i.type === 'Weapon' ? weaponFields(i, p) : i.type === 'Armor' ? armorFields(i, p) : i.type === 'Shield' ? `<div class="subbox"><div class="row">${input(`${p}.shield.bonus`, { label: 'Magic bonus (+N; base +2 AC is automatic)', type: 'number', cls: 'sm' })}</div></div>` : ''}
    <div class="row">
      ${needsAttuneCheck(i)}
      ${input(`${p}.acBonus`, { label: 'AC bonus while equipped', type: 'number', cls: 'xs' })}
    </div>
    ${textarea(`${p}.notes`, { rows: 2, placeholder: 'Notes, command words, where you found it…' })}
    <div class="row">${del}</div>`;
}

// Collapsed item card shared by Equipment & bag ('equip') and Magic items ('magic').
function itemCard(i, kind) {
  ensureItemData(i);
  const fx = itemEffect(i);
  const open = openBlocks.has(`e-${i.id}`);
  const charges = num(i.chargesMax) ? `<span class="tag-s r">Charges ${num(i.charges)}/${num(i.chargesMax)}</span>` : '';
  return `<div class="item icard ${i.equipped || i.attuned ? 'sel' : ''}">
    <div class="icard-top">
      <b class="icard-name" data-calc="iname:${esc(i.id)}">${esc(i.name || 'Unnamed item')}</b>
      ${kind === 'equip' ? qtyStep(i) : num(i.qty) > 1 ? `<span class="muted">×${num(i.qty)}</span>` : ''}
    </div>
    <div class="row tight tags-row">
      ${fx ? `<span class="badge fx" data-calc="itemfx:${esc(i.id)}">${esc(fx)}</span>` : ''}
      ${i.type === 'Armor' && i.armor.str ? `<span class="tag-s">STR ${esc(i.armor.str)}</span>` : ''}
      ${i.type === 'Armor' && i.armor.stealth ? '<span class="tag-s c">Stealth disadv.</span>' : ''}
      ${i.rarity === 'Mundane' ? '' : `<span class="tag-s src">${esc(i.rarity)}</span>`}
      ${kind === 'magic' ? `<span class="tag-s src">${esc(ORIGINS.find((o) => o[0] === i.origin)?.[1] || i.origin)}</span>` : ''}
      ${charges}
    </div>
    <div class="icard-tog">
      <button class="tog" data-action="toggleEquip" data-id="${esc(i.id)}" aria-pressed="${!!i.equipped}">Equipped</button>
      ${i.needsAttune || i.attuned ? `<button class="tog" data-action="toggleAttune" data-id="${esc(i.id)}" aria-pressed="${!!i.attuned}">Attuned</button>` : ''}
    </div>
    <details class="edit" data-block="e-${esc(i.id)}" data-lazy="${kind}:${esc(i.id)}" ${open ? 'open' : ''}>
      <summary>Edit</summary>
      ${open ? `<div class="lazy-body">${itemEdit(i, kind)}</div>` : ''}
    </details>
  </div>`;
}

function equipmentList() {
  const f = F('equipment');
  const list = C().items.filter((i) => {
    if (f.status === 'equipped' && !i.equipped) return false;
    if (f.status === 'bag' && i.equipped) return false;
    if (f.type && i.type !== f.type) return false;
    if (f.rarity && i.rarity !== f.rarity) return false;
    return matchQ('equipment', i.name, i.notes, i.type, i.rarity, i.weapon?.base, i.armor?.base);
  });
  if (!list.length) return `<p class="muted">${C().items.length ? 'No item matches these filters.' : 'Nothing here yet. Use "Add item" below.'}</p>`;
  const group = (title, arr) => (arr.length ? `<h3 class="grp">${title} <span class="muted">(${arr.length})</span></h3>${arr.map((i) => itemCard(i, 'equip')).join('')}` : '');
  return group('Equipped', list.filter((i) => i.equipped)) + group('Bag', list.filter((i) => !i.equipped));
}

const fmtGp = (n) => String(Math.round(n * 100) / 100);
function coinsCard() {
  const c = C().coins;
  const total = Object.entries(COIN_VALUES).reduce((s, [k, v]) => s + num(c[k]) * v, 0);
  return `
  <section class="card">
    <h2>Coins & other gear</h2>
    <div class="coins" role="group" aria-label="Coins">${['cp', 'sp', 'ep', 'gp', 'pp'].map((k) =>
      `<button class="coin" data-action="sheet" data-kind="coin" data-key="${k}" aria-label="${k.toUpperCase()} ${num(c[k])}, add or spend"><small>${k.toUpperCase()}</small> <b>${num(c[k])}</b></button>`).join('')}</div>
    <p class="coin-total">Total: <b>${fmtGp(total)} gp</b></p>
    <p class="hint">Tap a coin to add or spend. Total uses the SRD coin values (100 cp = 10 sp = 2 ep = 1 gp; 1 pp = 10 gp).</p>
    ${textarea('character.gear', { label: 'Other notes about gear', rows: 5 })}
  </section>`;
}

function tabEquipment() {
  const w = carriedWeight();
  const cap = num(C().abilities.str) * 15;
  const eq = equippedItems().length;
  return `
  <section class="card">
    <h2>Equipment & bag</h2>
    <div class="row">
      ${trackWeight() ? `<span class="counter ${w > cap ? 'over' : ''}">Carried: <b>${Math.round(w * 10) / 10} / ${cap} lb</b></span>` : ''}
      <span class="counter">Equipped: <b>${eq}</b></span>
      ${check('ui.trackWeight', 'Track weight', { rerender: true })}
    </div>
    ${attuneBar()}
    ${trackWeight() ? '<p class="hint">Weight counts quantity × weight plus coins (50 per lb). Capacity is STR × 15.</p>' : ''}
    <div class="filters">
      ${fsearch('equipment', 'Search equipment…')}
      ${chips('equipment', 'status', [['', 'All'], ['equipped', '★ Equipped'], ['bag', 'In bag']])}
      <div class="row">
        ${fselect('equipment', 'type', [['', 'Any type'], ...ITEM_TYPES.map((t) => [t, t])], 'Type')}
        ${fselect('equipment', 'rarity', [['', 'Any rarity'], ...RARITIES.map((r) => [r, r])], 'Rarity')}
      </div>
    </div>
    <div id="list">${equipmentList()}</div>
    <button class="ghost" data-action="addMenu">${addMenuOpen ? 'Cancel' : '+ Add item'}</button>
    ${addMenuOpen ? `<div class="row add-menu">
      <button data-action="addEquip" data-kind="Weapon">+ Weapon</button>
      <button data-action="addEquip" data-kind="Armor">+ Armor</button>
      <button data-action="addEquip" data-kind="Shield">+ Shield</button>
      <button data-action="addEquip" data-kind="Other">+ Other item</button>
    </div>` : ''}
  </section>
  ${coinsCard()}`;
}

// ----- Magic items
function itemsList() {
  const f = F('items');
  const list = C().items.filter((i) => {
    if (i.rarity === 'Mundane') return false;
    if (f.origin && i.origin !== f.origin) return false;
    if (f.status === 'attuned' && !i.attuned) return false;
    if (f.status === 'equipped' && !i.equipped) return false;
    if (f.status === 'needsAttune' && !(i.needsAttune && !i.attuned)) return false;
    if (f.rarity && i.rarity !== f.rarity) return false;
    if (f.type && i.type !== f.type) return false;
    return matchQ('items', i.name, i.notes, i.type, i.rarity);
  });
  if (!list.length) return `<p class="muted">${C().items.some((i) => i.rarity !== 'Mundane') ? 'No item matches these filters.' : 'No magic items yet. Create one from the Plans tab or add a found item.'}</p>`;
  return list.map((i) => itemCard(i, 'magic')).join('');
}
function tabItems() {
  return `
  <section class="card">
    <h2>Magic items</h2>
    ${attuneBar()}
    ${lvl() >= 2 ? `<div class="row">${counter(replicated().length, at(MAGIC_ITEMS, lvl()), 'Replicated')}</div>` : ''}
    <div class="filters">
      ${fsearch('items', 'Search items…')}
      ${chips('items', 'status', [['', 'All'], ['attuned', '★ Attuned'], ['equipped', 'Equipped'], ['needsAttune', 'Not yet attuned']])}
      <div class="row">
        ${fselect('items', 'origin', [['', 'Any origin'], ...ORIGINS], 'Origin')}
        ${fselect('items', 'type', [['', 'Any type'], ...ITEM_TYPES.map((t) => [t, t])], 'Type')}
        ${fselect('items', 'rarity', [['', 'Any rarity'], ...RARITIES.filter((r) => r !== 'Mundane').map((r) => [r, r])], 'Rarity')}
      </div>
    </div>
    <div id="list">${itemsList()}</div>
    <button class="ghost" data-action="addItem">+ Add found item</button>
    <p class="hint">Weapons, armor, weight and coins are on the Equipment & bag tab.</p>
  </section>`;
}

// ----- Feats
function featsList() {
  const f = F('feats');
  const view = f.status || 'available'; // available = I qualify and don't have it (or it repeats) | taken | all
  const list = FEATS.filter((ft) => {
    const taken = hasFeat(ft.id);
    if (f.cat && ft.cat !== f.cat) return false;
    if (f.src && ft.src !== f.src) return false;
    if (view === 'taken' && !taken) return false;
    if (view === 'available' && ((taken && !ft.repeatable) || !meetsReq(ft))) return false;
    return matchQ('feats', ft.name, ft.sum, ft.cat, ft.src);
  });
  if (!list.length) return `<p class="muted">${view === 'available' ? 'No more feats match these filters that you qualify for. Try "All".' : 'No feat matches these filters.'}</p>`;
  return list.map((ft) => {
    const taken = C().feats.filter((x) => x.featId === ft.id);
    const ok = meetsReq(ft);
    return `<div class="item ${taken.length ? 'sel' : ''} ${ok || taken.length ? '' : 'locked'}">
      <div class="row tight">
        <b class="grow">${esc(ft.name)}</b>
        ${(!taken.length || ft.repeatable) ? `<button class="small ${ok ? 'ok' : ''}" data-action="takeFeat" data-id="${esc(ft.id)}" aria-label="${taken.length ? 'Take again' : 'Take'} ${esc(ft.name)}">${taken.length ? 'Take again' : 'Take'}</button>` : ''}
      </div>
      <div class="row tight tags-row">
        ${taken.length ? `<span class="flag prepared">Taken${taken.length > 1 ? ` ×${taken.length}` : ''}</span>` : ''}
        <span class="tag-s">${esc(ft.cat)}</span>
        <span class="tag-s src">${esc(ft.src)}</span>
        <span class="tag-s ${ok ? 'r' : 'c'}">${ok ? 'Prerequisites met' : 'Prerequisite'}: ${esc(reqText(ft))}</span>
      </div>
      ${ft.sum ? `<p class="sum">${esc(ft.sum)}</p>` : ''}
      ${taken.map((t) => `
        <div class="row taken">
          ${input(`character.feats.#${t.id}.level`, { label: 'Taken at level', type: 'number', min: 1, max: 20, cls: 'xs' })}
          ${input(`character.feats.#${t.id}.notes`, { label: 'Choices (ability +1, spells, skills…)', cls: 'grow' })}
          <button class="icon danger" data-action="dropFeat" data-id="${esc(t.id)}" title="Remove" aria-label="Remove feat ${esc(ft.name)}">✕</button>
        </div>`).join('')}
    </div>`;
  }).join('');
}
function tabFeats() {
  const mine = C().feats.map((t) => `<span class="pill">${esc(featById(t.featId)?.name || t.featId)} <small>L${esc(t.level)}</small></span>`).join('');
  return `
  <section class="card">
    <h2>Feats</h2>
    <div class="row yourfeats"><span class="counter ${C().feats.length > featSlots() ? 'over' : ''}">Your feats (${C().feats.length}): <b>${C().feats.length} / ${featSlots()}</b></span>${mine || '<span class="muted">none yet</span>'}</div>
    <details class="howto"><summary>How feats work</summary><p class="hint">You get an Origin feat from your background, then a feat at levels 4, 8, 12, 16 and an Epic Boon at 19. In Eberron, certain house backgrounds grant a Dragonmark at level 1; otherwise take one as a feat from level 4. Sources: Player's Handbook 2024, Tasha's, Xanathar's, Forge of the Artificer. Where a Tasha's/Xanathar's feat was reprinted in the 2024 PHB, only the 2024 version is listed. Summaries are short reminders: check the book for exact rules.</p></details>
    <div class="filters">
      ${fsearch('feats', 'Search feats…')}
      ${chips('feats', 'status', [['available', 'Available to me'], ['taken', '★ Taken'], ['all', 'All']], { def: 'available' })}
      ${fmore('feats', ['cat', 'src'], `
      ${chips('feats', 'cat', [['', 'All categories'], ...FEAT_CATEGORIES.map((c) => [c, c === 'Greater Dragonmark' ? 'Greater marks (General)' : c])])}
      <div class="row">${fselect('feats', 'src', [['', 'Any book'], ...FEAT_SOURCES.map((s) => [s, s])], 'Source')}</div>
      `)}
    </div>
    <div id="list">${featsList()}</div>
  </section>`;
}

// ----- Selected (read-only overview of what is chosen right now; each card has an Open button to the page where it is edited)
function tabSelected() {
  const c = C();
  const spells = SPELLS.filter((s) => spellStatus(s) !== 'none').sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const byLevel = [0, 1, 2, 3, 4, 5].map((l) => {
    const sp = spells.filter((s) => s.level === l);
    if (!sp.length) return '';
    return `<div class="sel-group">${lvlTag(l)} ${sp.map((s) => `<span class="pill ${spellStatus(s)}">${esc(s.name)}${spellStatus(s) === 'always' ? ' <small>always</small>' : ''}${s.flags.includes('C') ? ' <small>C</small>' : ''}${s.flags.includes('R') ? ' <small>R</small>' : ''}</span>`).join('')}</div>`;
  }).join('');
  const plans = knownPlans().map((p) => `<span class="pill">${esc(p.name)} <small>L${p.tier}+</small></span>`).join('');
  const equipped = equippedItems().map((i) => {
    const fx = itemEffect(i);
    return `<span class="pill">${esc(i.name || 'Unnamed item')}${i.attuned ? ' <small>attuned</small>' : ''}${fx ? ` <small>${esc(fx)}</small>` : ''}</span>`;
  }).join('');
  const attunedOnly = c.items.filter((i) => i.attuned && !i.equipped).map((i) => `<span class="pill always">${esc(i.name || 'Unnamed item')} <small>attuned</small></span>`).join('');
  const feats = c.feats.map((t) => { const ft = featById(t.featId); return `<span class="pill">${esc(ft?.name || t.featId)} <small>L${esc(t.level)}</small></span>`; }).join('');
  const skills = SKILLS.filter((s) => num(c.skills[s.key])).map((s) => `<span class="pill ${num(c.skills[s.key]) > 1 ? 'always' : ''}">${s.name} ${calcSpan(`skill:${s.key}`)}${num(c.skills[s.key]) > 1 ? ' <small>expertise</small>' : ''}</span>`).join('');
  const conc = c.concentration?.name;
  const conds = c.conditions.map((x) => `<span class="pill always">${esc(x)}</span>`).join('');
  const exh = num(c.exhaustion) ? `<span class="pill always">Exhaustion ${num(c.exhaustion)}</span>` : '';
  const section = (title, tab, count, body, view = '') => `
    <section class="card" aria-labelledby="sel-${slug(title)}">
      <div class="row tight"><h2 class="grow" id="sel-${slug(title)}">${title}</h2>${count}<button class="small" data-action="selOpen" data-key="${tab}" ${view ? `data-view="${view}"` : ''} aria-label="Open ${esc(title)}">Open</button></div>
      ${body || '<p class="muted">Nothing selected yet.</p>'}
    </section>`;
  return `
  <p class="hint sel-note">A read-only summary. Use Open to change anything.</p>
  ${section('Right now', 'combat', '', `
    <div class="sel-stats"><span class="counter">AC <b>${acInfo().ac}</b></span><span class="counter">Prof <b>${fmt(pb())}</b></span><span class="counter">Spell DC <b>${spellDC()}</b></span><span class="counter">Spell atk <b>${fmt(spellAtk())}</b></span></div>
    <div class="sel-group"><span class="muted">Concentration</span> ${conc ? `<span class="pill always">${esc(conc)}</span>` : '<span class="muted">none</span>'}</div>
    <div class="sel-group"><span class="muted">Conditions</span> ${conds || exh ? `${conds}${exh}` : '<span class="muted">none</span>'}</div>`)}
  ${section('Spells', 'spells', `${counter(preparedCount(), at(PREPARED, lvl()), 'Prepared')} ${counter(cantripCount(), at(CANTRIPS, lvl()), 'Cantrips')}`,
    byLevel && `${byLevel}<p class="hint"><span class="pill always">Always prepared</span> <span class="pill prepared">Prepared / known</span> C = Concentration, R = Ritual</p>`, 'mine')}
  ${lvl() >= 2 ? section('Known plans', 'plans', counter(knownPlans().length, at(PLANS_KNOWN, lvl()), 'Known'), plans && `<div class="sel-group">${plans}</div>`) : ''}
  ${section('Equipped and attuned', 'equipment', `<span class="counter">Equipped <b>${equippedItems().length}</b></span>${counter(attunedCount(), attunementLimit(lvl()), 'Attuned')}`, (equipped || attunedOnly) && `<div class="sel-group">${equipped}${attunedOnly}</div>`)}
  ${section('Feats', 'feats', counter(c.feats.length, featSlots(), 'Taken'), feats && `<div class="sel-group">${feats}</div>`)}
  ${section('Skills', 'stats', '', skills && `<div class="sel-group">${skills}</div>`)}`;
}

// ----- Journal
// Five sub-tabs. Sessions live in state.sessions; NPCs, places, factions and quests in state.journal. All card bodies are lazy.
const JK = {
  sessions: { tab: 'journal', one: 'session', many: 'Sessions', hint: 'Log what happened each game night.' },
  npcs: { tab: 'npcs', one: 'NPC', many: 'NPCs', hint: 'Keep track of the people you meet: role, faction and how they feel about you.' },
  places: { tab: 'places', one: 'place', many: 'Places', hint: 'Cities, districts, dungeons and anywhere worth remembering.' },
  factions: { tab: 'factions', one: 'faction', many: 'Factions', hint: 'Houses, guilds and groups, and what they want.' },
  quests: { tab: 'quests', one: 'quest', many: 'Quests', hint: 'Jobs, hooks and goals, with steps you can tick off.' },
};
const jItems = (coll) => (coll === 'sessions' ? state.sessions : state.journal[coll]);
const jFind = (coll, id) => jItems(coll).find((x) => x.id === id);
const jPath = (coll, id) => (coll === 'sessions' ? `sessions.#${id}` : `journal.${coll}.#${id}`);
const ATT_LABEL = { friendly: 'Friendly', neutral: 'Neutral', hostile: 'Hostile', unknown: 'Unknown' };
const ST_LABEL = { active: 'Active', done: 'Done', failed: 'Failed', paused: 'Paused' };
const QUEST_ORDER = ['active', 'paused', 'done', 'failed'];
const jbadge = (v, label) => `<span class="jbadge b-${esc(v)}">${esc(label)}</span>`;
const stepProgress = (q) => (q.steps.length ? `${q.steps.filter((s) => s.done).length}/${q.steps.length}` : '');
const dotJoin = (...a) => a.map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ');

const jTitle = (coll, e) => (coll === 'sessions' ? e.title || 'Untitled session' : coll === 'quests' ? e.title || 'Untitled quest' : e.name || `Unnamed ${JK[coll].one}`);
const jSub = (coll, e) => ({
  sessions: () => dotJoin(e.date, e.ingameDate),
  npcs: () => dotJoin(e.role, e.faction),
  places: () => dotJoin(e.kind, e.region),
  factions: () => '',
  quests: () => (e.giver ? `from ${e.giver}` : ''),
}[coll]());
function jBadges(coll, e) {
  if (coll === 'npcs' || coll === 'factions') return jbadge(e.attitude, ATT_LABEL[e.attitude]);
  if (coll === 'quests') return `${jbadge(e.status, ST_LABEL[e.status])}${e.steps.length ? `<span class="jprog" role="img" aria-label="${e.steps.filter((x) => x.done).length} of ${e.steps.length} steps done">${stepProgress(e)}</span>` : ''}`;
  return '';
}
// All searchable text of an entry (lowercase), including tags.
function jText(coll, e) {
  const parts = {
    sessions: [e.number, e.title, e.summary, e.notes, e.loot, e.followUps, e.ingameDate, e.date],
    npcs: [e.name, e.role, e.faction, e.attitude, e.location, e.notes],
    places: [e.name, e.kind, e.region, e.notes],
    factions: [e.name, e.attitude, e.goals, e.notes],
    quests: [e.title, e.status, e.giver, e.reward, e.notes, e.steps?.map((s) => s.text).join('\n')],
  }[coll];
  return [...parts, ...(e.tags || [])].join('\n').toLowerCase();
}
function jSort(coll, list) {
  const l = [...list];
  if (coll === 'sessions') return l.sort((a, b) => num(b.number) - num(a.number));
  l.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)); // newest first
  if (coll === 'quests') l.sort((a, b) => QUEST_ORDER.indexOf(a.status) - QUEST_ORDER.indexOf(b.status));
  return l;
}
function topTags(items, max = 12) {
  const n = {};
  for (const e of items) for (const t of e.tags || []) n[t] = (n[t] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, max).map((x) => x[0]);
}

// Tags editor: chips with a 44px remove button, plus an input (Enter or comma adds).
function tagsEditor(path, tags) {
  return `<div class="tags-ed">
    <span class="lbl">Tags</span>
    ${tags.length ? `<div class="tag-list">${tags.map((t) => `<span class="tagchip">#${esc(t)}<button class="icon" data-action="removeTag" data-path="${esc(path)}" data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">✕</button></span>`).join('')}</div>` : ''}
    <div class="row tight"><input class="grow" data-tag-add="${esc(path)}" aria-label="Add a tag" placeholder="Add a tag, then Enter" autocomplete="off" autocapitalize="none" enterkeyhint="done" maxlength="40"><button data-action="addTag" data-path="${esc(path)}">Add tag</button></div>
  </div>`;
}
// Checklist (quest steps, character goals): tick, edit, remove, plus an add row.
function checklist(path, label) {
  const list = getPath(path) || [];
  return `<ul class="list steps">${list.map((x) => `<li class="${x.done ? 'done' : ''}">
      ${check(`${path}.#${x.id}.done`, '', { title: `${label} done: ${x.text || 'untitled'}` })}
      <input class="grow" data-bind="${esc(path)}.#${esc(x.id)}.text" value="${esc(x.text)}" aria-label="${esc(label)}" autocomplete="off">
      <button class="icon" data-action="listRemove" data-path="${esc(path)}" data-id="${esc(x.id)}" aria-label="Remove ${esc(label.toLowerCase())}: ${esc(x.text || 'untitled')}">✕</button></li>`).join('')}</ul>
    <div class="row tight"><input class="grow" data-list-add="${esc(path)}" aria-label="Add a ${esc(label.toLowerCase())}" placeholder="Add a ${esc(label.toLowerCase())}, then Enter" autocomplete="off" enterkeyhint="done"><button data-action="listAdd" data-path="${esc(path)}">Add</button></div>`;
}

function jBody(coll, e) {
  const p = jPath(coll, e.id);
  const del = coll === 'sessions'
    ? `<button class="danger small" data-action="removeSession" data-id="${esc(e.id)}">Delete session</button>`
    : `<button class="danger small" data-action="removeEntry" data-ref="${coll}:${esc(e.id)}">Delete ${JK[coll].one}</button>`;
  const notes = coll === 'sessions' ? '' : textarea(`${p}.notes`, { label: 'Notes', rows: 4, grow: true });
  const meta = coll === 'sessions' ? '' : `<p class="hint">Added ${esc(String(e.createdAt).slice(0, 10))}${e.updatedAt !== e.createdAt ? `, edited ${esc(String(e.updatedAt).slice(0, 10))}` : ''}</p>`;
  const fields = {
    sessions: () => `
      <div class="grid">
        ${input(`${p}.number`, { label: 'Session #', type: 'number', min: 0 })}
        ${input(`${p}.date`, { label: 'Real date', type: 'date' })}
        ${input(`${p}.ingameDate`, { label: 'In-game date / location' })}
        ${input(`${p}.title`, { label: 'Title' })}
      </div>
      ${textarea(`${p}.summary`, { label: 'Summary', rows: 3, grow: true })}
      ${textarea(`${p}.notes`, { label: 'Notes', rows: 8, placeholder: 'NPCs, places, clues, quotes…', grow: true })}
      ${textarea(`${p}.loot`, { label: 'Loot & XP', rows: 2, grow: true })}
      ${textarea(`${p}.followUps`, { label: 'To remember / open threads', rows: 3, grow: true })}`,
    npcs: () => `
      <div class="grid">
        ${input(`${p}.name`, { label: 'Name' })}
        ${input(`${p}.role`, { label: 'Role' })}
        ${input(`${p}.faction`, { label: 'Faction' })}
        ${input(`${p}.location`, { label: 'Location' })}
        ${select(`${p}.attitude`, Object.entries(ATT_LABEL), { label: 'Attitude toward you', rerender: true })}
      </div>`,
    places: () => `
      <div class="grid">
        ${input(`${p}.name`, { label: 'Name' })}
        ${input(`${p}.kind`, { label: 'Kind (city, district, dungeon…)' })}
        ${input(`${p}.region`, { label: 'Region' })}
      </div>`,
    factions: () => `
      <div class="grid">
        ${input(`${p}.name`, { label: 'Name' })}
        ${select(`${p}.attitude`, Object.entries(ATT_LABEL), { label: 'Attitude toward you', rerender: true })}
      </div>
      ${textarea(`${p}.goals`, { label: 'Goals', rows: 2, grow: true })}`,
    quests: () => `
      <div class="grid">
        ${input(`${p}.title`, { label: 'Title' })}
        ${select(`${p}.status`, Object.entries(ST_LABEL), { label: 'Status', rerender: true })}
        ${input(`${p}.giver`, { label: 'Quest giver' })}
        ${input(`${p}.reward`, { label: 'Reward' })}
      </div>
      <h3>Steps ${e.steps.length ? `<small class="muted">${stepProgress(e)}</small>` : ''}</h3>
      ${checklist(`${p}.steps`, 'Step')}`,
  }[coll]();
  return `${fields}${tagsEditor(`${p}.tags`, e.tags)}${notes}${meta}${del}`;
}
function jCard(coll, e) {
  const open = openCards.has(e.id);
  const sub = jSub(coll, e);
  return `<details class="item jcard" data-jcard="${coll}:${esc(e.id)}" data-jid="${esc(e.id)}" ${open ? 'open' : ''}>
    <summary><span class="jsum"><b>${coll === 'sessions' ? `<span class="badge">#${esc(e.number)}</span> ` : ''}${esc(jTitle(coll, e))}</b>${sub ? `<small class="muted">${esc(sub)}</small>` : ''}</span>${jBadges(coll, e)}</summary>
    ${open ? `<div class="lazy-body">${jBody(coll, e)}</div>` : ''}
  </details>`;
}
function jList(coll) {
  const k = JK[coll];
  const all = jItems(coll);
  if (!all.length) return `<div class="empty"><p class="muted">No ${k.many.toLowerCase()} yet. ${k.hint}</p><button class="ok" data-action="${coll === 'sessions' ? 'addSession' : 'addEntry'}" data-coll="${coll}">Add ${k.one}</button></div>`;
  const tag = F(coll).tag || '';
  const hasQ = !!(F(coll).q || '').trim();
  const list = jSort(coll, all.filter((e) => (!tag || e.tags.includes(tag)) && (!hasQ || matchQ(coll, jText(coll, e)))));
  return list.length ? list.map((e) => jCard(coll, e)).join('') : `<p class="muted">No ${k.one} matches your search.</p>`;
}
function jPage(coll) {
  const k = JK[coll];
  const n = jItems(coll).length;
  const tags = topTags(jItems(coll));
  const cur = F(coll).tag || '';
  if (cur && !tags.includes(cur)) tags.push(cur);
  return `
    <div class="row tight"><h2 class="grow">${k.many} <small class="muted">${n}</small></h2><button data-action="${coll === 'sessions' ? 'addSession' : 'addEntry'}" data-coll="${coll}">+ New ${k.one}</button></div>
    ${n ? fsearch(coll, `Search ${k.many.toLowerCase()}…`) : ''}
    ${tags.length ? chips(coll, 'tag', [['', 'All'], ...tags.map((t) => [t, `#${t}`])]) : ''}
    <div id="list">${jList(coll)}</div>`;
}

// Global search over everything in the journal; a tag chip narrows all kinds at once.
function jResults() {
  const q = jq.trim().toLowerCase();
  const all = Object.keys(JK).flatMap((c) => jItems(c));
  const tags = topTags(all, 14);
  if (jtag && !tags.includes(jtag)) tags.push(jtag);
  const groups = Object.keys(JK).map((coll) => {
    const hits = jSort(coll, jItems(coll).filter((e) => (!jtag || e.tags.includes(jtag)) && (!q || jText(coll, e).includes(q))));
    if (!hits.length) return '';
    return `<h3>${JK[coll].many} (${hits.length})</h3><ul class="jres">${hits.map((e) => `<li><button data-action="openEntry" data-ref="${coll}:${esc(e.id)}">
      <span class="jsum"><b>${esc(jTitle(coll, e))}</b><small class="muted">${esc(dotJoin(jSub(coll, e), e.tags.map((t) => `#${t}`).join(' ')))}</small></span>${jBadges(coll, e)}</button></li>`).join('')}</ul>`;
  }).join('');
  const chipBar = tags.length ? `<div class="chips" role="group" aria-label="Filter results by tag">${[['', 'All tags'], ...tags.map((t) => [t, `#${t}`])].map(([v, t]) =>
    `<button class="chip-btn ${jtag === v ? 'on' : ''}" data-action="jtag" data-val="${esc(v)}" aria-pressed="${jtag === v}">${esc(t)}</button>`).join('')}</div>` : '';
  return `${chipBar}<h2 class="sr-only">Search results</h2>${groups || '<p class="muted" role="status">Nothing in the journal matches.</p>'}`;
}
function journalShell(coll) {
  return `
  <section class="card">
    <input id="jsearch" type="search" placeholder="Search journal (names, notes, tags)…" aria-label="Search journal" value="${esc(jq)}">
    <div id="jbody">${jq.trim() || jtag ? jResults() : jPage(coll)}</div>
  </section>`;
}
const tabJournal = () => journalShell('sessions');
const tabNpcs = () => journalShell('npcs');
const tabPlaces = () => journalShell('places');
const tabFactions = () => journalShell('factions');
const tabQuests = () => journalShell('quests');
const jRefresh = () => { document.getElementById('jbody').innerHTML = jq.trim() || jtag ? jResults() : jPage(COLL_OF_TAB[state.ui.tab] || 'sessions'); };

// Jump to a card (from a search result or a toast): switch sub-tab, open it, scroll to it.
function goEntry(ref) {
  const [coll, id] = String(ref).split(':');
  if (coll === 'voice') { setTab('voice'); commit(); window.scrollTo(0, 0); return; }
  if (!JK[coll] || !jFind(coll, id)) return;
  jq = ''; jtag = '';
  Object.assign(F(coll), { q: '', tag: '' });
  openCards.add(id);
  setTab(JK[coll].tab);
  commit();
  const card = [...view.querySelectorAll('[data-jid]')].find((x) => x.dataset.jid === id);
  if (card) { card.scrollIntoView({ block: 'start' }); card.querySelector('summary').focus({ preventScroll: true }); }
}

// ----- Character voice
const VOICE_FIELDS = [['personality', 'Personality', 'How do they come across?'], ['ideals', 'Ideals', 'What do they believe in?'], ['bonds', 'Bonds', 'Who or what do they care about?'], ['flaws', 'Flaws', 'What gets them in trouble?'], ['quirks', 'Speech quirks', 'Catchphrases, accent, habits, mannerisms…']];
function tabVoice() {
  const v = C().voice;
  const bioField = (k, label) => textarea(`character.bio.${k}`, { label, rows: 3, grow: true });
  return `
  ${VOICE_FIELDS.map(([k, title, ph]) => `<section class="card"><h2>${title}</h2>${textarea(`character.voice.${k}`, { aria: title, placeholder: ph, rows: 2, grow: true })}</section>`).join('')}
  <section class="card">
    <h2>Goals &amp; hooks</h2>
    <p class="hint">What your character is after. Tick goals off as you reach them.</p>
    ${checklist('character.voice.goals', 'Goal')}
  </section>
  <section class="card">
    <h2>In-character lines</h2>
    <p class="hint">Short lines to say at the table. Tap Copy to put one on the clipboard.</p>
    <ul class="list vlines">${v.lines.map((l) => `<li><span class="grow vtext">${esc(l.text)}</span>
      <button class="icon" data-action="copyLine" data-id="${esc(l.id)}" aria-label="Copy line: ${esc(l.text.slice(0, 40))}" title="Copy">${svgIcon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>')}</button>
      <button class="icon" data-action="listRemove" data-path="character.voice.lines" data-id="${esc(l.id)}" aria-label="Remove line: ${esc(l.text.slice(0, 40))}">✕</button></li>`).join('') || '<li class="muted">No lines yet.</li>'}</ul>
    <div class="row tight"><input class="grow" data-list-add="character.voice.lines" aria-label="Add an in-character line" placeholder="Add a line, then Enter" autocomplete="off" enterkeyhint="done"><button data-action="listAdd" data-path="character.voice.lines">Add</button></div>
  </section>
  <details class="card block" data-block="bio" ${openBlocks.has('bio') ? 'open' : ''}>
    <summary>Background notes</summary>
    ${bioField('appearance', 'Appearance')}
    ${bioField('backstory', 'Backstory')}
    ${bioField('allies', 'Allies & contacts')}
    ${bioField('notes', 'Other notes')}
    ${C().bio.personality ? bioField('personality', 'Older personality note (copied to Personality above)') : ''}
  </details>`;
}

// ----- Campaign & data
const snapTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
function snapshotsCard() {
  const snaps = readSnaps();
  return `<section class="card" id="snapshots">
    <h2>Snapshots</h2>
    <p class="hint">Automatic copies of your data, kept <b>only on this device</b>: one daily, one from before your last long rest, and the 3 newest &ldquo;important&rdquo; ones (before an upgrade, an import, a restore, a Drive download, or when saved data could not be read). They are not a replacement for a downloaded backup.</p>
    ${snaps.length ? `<ul class="snap-list">${snaps.map((x) => `<li>
      <span class="grow"><b>${esc(snapTime(x.at))}</b><small class="muted">${esc(x.reason)} · ${Math.max(1, Math.round(x.data.length / 1024))} KB</small></span>
      <button data-action="snapRestore" data-id="${esc(x.id)}" aria-label="Restore snapshot from ${esc(snapTime(x.at))}">Restore</button>
      <button data-action="snapDownload" data-id="${esc(x.id)}" aria-label="Download snapshot from ${esc(snapTime(x.at))}">Download</button></li>`).join('')}</ul>` : '<p class="muted">No snapshots yet. The first one is taken on your next launch.</p>'}
  </section>`;
}
function tabData() {
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [backupFile(state)] }));
  return `
  <section class="card">
    <h2>Campaign</h2>
    <div class="grid">
      ${input('campaign.name', { label: 'Campaign name' })}
      ${input('campaign.dm', { label: 'Dungeon Master' })}
      ${input('campaign.setting', { label: 'Setting' })}
      ${input('campaign.startDate', { label: 'Started on', type: 'date' })}
    </div>
    ${textarea('campaign.notes', { label: 'Campaign notes (party, house rules, schedule…)', rows: 6 })}
  </section>
  <section class="card">
    <h2>Feedback</h2>
    ${check('ui.haptics', 'Vibration on actions', { rerender: false })}
    <p class="hint">A short buzz when you spend, heal, take damage or rest. Works on phones that support it (Android Chrome); desktop browsers ignore it.</p>
  </section>
  <section class="card">
    <h2>Your data</h2>
    <p>Everything is saved <b>only in this browser on this device</b>. Your phone and your PCs each have their own copy and <b>do not sync</b>.
      To move your character, export a backup on one device and import it on the other. Importing replaces the data on that device.</p>
    <p class="hint" id="persistInfo"></p>
    <div class="row">
      ${canShare ? '<button class="ok" data-action="share">Share backup (Drive, WhatsApp…)</button>' : ''}
      <button data-action="export">Download backup (.json)</button>
      <label class="button">Import backup<input id="importFile" type="file" accept="application/json,.json" hidden></label>
      <button class="danger" data-action="reset">Delete everything</button>
    </div>
  </section>
  ${driveCard()}
  ${snapshotsCard()}
  <section class="card credits">
    <h2>About and credits</h2>
    <p class="muted">DnD Slop &middot; Version <b>${esc(APP_VERSION)}</b></p>
    <p>This work includes material from the System Reference Document 5.2.1 (&ldquo;SRD 5.2.1&rdquo;) by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</p>
    <p>Spell descriptions marked &ldquo;SRD 5.2.1 &middot; official text&rdquo; are copied from the SRD. Other rules data is our own summary of community sources and is unverified.</p>
    <p>Fonts Source Sans 3 and IM Fell English SC are used under the <a href="https://openfontlicense.org" target="_blank" rel="noopener">SIL Open Font License 1.1</a>.</p>
  </section>`;
}

const RENDER = { stats: tabStats, combat: tabCombat, equipment: tabEquipment, spells: tabSpells, plans: tabPlans, items: tabItems, feats: tabFeats, selected: tabSelected, journal: tabJournal, npcs: tabNpcs, places: tabPlaces, factions: tabFactions, quests: tabQuests, voice: tabVoice, data: tabData };
const LIST_RENDER = { equipment: equipmentList, spells: spellsList, plans: plansList, items: itemsList, feats: featsList, journal: () => jList('sessions'), npcs: () => jList('npcs'), places: () => jList('places'), factions: () => jList('factions'), quests: () => jList('quests') };

function render() {
  applyTheme();
  const tab = RENDER[state.ui.tab] ? state.ui.tab : 'combat';
  const sec = sectionOf(tab);
  const combat = sec.key === 'combat';
  document.body.classList.toggle('has-dock', combat);
  const y = window.scrollY;
  const ae = document.activeElement;
  const focused = ae?.dataset?.bind || ae?.dataset?.filter;
  const navFocus = ae?.closest?.('.bnav, .seg') ? `${ae.closest('.bnav') ? '.bnav' : '.seg'} [data-key="${ae.dataset.key}"]` : '';
  view.innerHTML = `
    ${header(!combat)}
    <main id="main" tabindex="-1">
    <div id="driveStrip" class="drive-strip ${driveStripState().empty ? 'is-empty' : ''}">${driveStripInner()}</div>
    ${combat ? '' : statusStrip(true)}
    ${sec.tabs ? subTabs(sec, tab) : ''}
    <div id="panel" ${sec.tabs ? `role="tabpanel" aria-labelledby="tab-${tab}"` : ''}>${RENDER[tab]()}</div>
    </main>
    <footer class="muted"><span id="saveStatus">Saved</span> · Artificer (Forge of the Artificer) · D&D 2024 rules</footer>
    ${datalists()}
    ${combat ? dock() : ''}
    ${bottomNav(sec)}`;
  applyBodyFx();
  view.querySelectorAll('textarea[data-grow]').forEach(grow);
  window.scrollTo(0, y);
  if (focused) {
    const el = [...view.querySelectorAll('[data-bind],[data-filter]')].find((x) => (x.dataset.bind || x.dataset.filter) === focused);
    el?.focus({ preventScroll: true });
  }
  if (navFocus) view.querySelector(navFocus)?.focus({ preventScroll: true });
  const seg = view.querySelector('.seg');
  const on = seg?.querySelector('[aria-selected="true"]');
  if (seg && on) seg.scrollLeft = on.offsetLeft - (seg.clientWidth - on.offsetWidth) / 2;
  if (tab === 'data') { showPersistInfo(); ensureDrive().then(() => { (driveOn() ? driveMod.preload() : Promise.resolve()).then(paintDrive); paintDrive(); }).catch(() => {}); }
}
function renderList() {
  const fn = LIST_RENDER[state.ui.tab];
  const el = document.getElementById('list');
  if (fn && el) el.innerHTML = fn(); else render();
}

async function showPersistInfo() {
  const el = document.getElementById('persistInfo');
  if (!el || !navigator.storage?.persisted) return;
  const persisted = await navigator.storage.persisted();
  el.textContent = persisted
    ? 'This browser has granted persistent storage: it will not clear your data on its own. Clearing browsing data still deletes it.'
    : 'Storage is not marked persistent: the browser may clear it if the device runs low on space. Install the app (Add to Home screen / Install) and export backups regularly.';
}

// ---------- actions ----------
// ---------- undo, haptics, toasts ----------
// In-memory undo stack: JSON snapshots of character + sessions + campaign + journal (not ui), taken BEFORE a mutating action.
const undoStack = []; // entries { id, raw }
let snapSeq = 0;
const snapRaw = () => JSON.stringify({ character: state.character, sessions: state.sessions, campaign: state.campaign, journal: state.journal });
function clearUndo() {
  undoStack.length = 0;
  toastRoot.querySelectorAll('.toast-undo').forEach((b) => b.remove());
}
function snap() {
  toastRoot.querySelectorAll('.toast-undo').forEach((b) => b.remove()); // an older toast must not undo a newer action
  undoStack.push({ id: ++snapSeq, raw: snapRaw() });
  if (undoStack.length > 20) undoStack.shift();
}
// True (and the snapshot is dropped) when the action since the last snap() changed nothing.
function dropIfNoop() {
  const top = undoStack[undoStack.length - 1];
  if (top && top.raw === snapRaw()) { undoStack.pop(); return true; }
  return false;
}
function undo(el) {
  const top = undoStack[undoStack.length - 1];
  if (!top) return toast('Nothing to undo');
  if (el?.dataset?.id && Number(el.dataset.id) !== top.id) return; // only the toast's own action can be undone
  undoStack.pop();
  const d = JSON.parse(top.raw);
  Object.assign(state, { character: d.character, sessions: d.sessions, campaign: d.campaign, journal: d.journal });
  persist();
  if (sh) { sh.dirty = true; renderSheet(); }
  render();
  toast('Undone');
}
// Vibration is independent of prefers-reduced-motion (that only affects visual effects).
function buzz(pattern = 10) {
  if (state.ui.haptics === false || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* unsupported */ }
}
// Snapshot, change state, save, then update the screen: 'full' re-renders, 'fast' only refreshes the calculated numbers.
function mutate(fn, { msg = '', sub = '', vib = 10, mode = 'full', ms, open } = {}) {
  snap();
  fn();
  if (dropIfNoop()) return;
  persist();
  if (mode === 'full') render(); else if (mode === 'fast') refreshDerived();
  buzz(vib);
  if (msg) toast(msg, { undo: true, sub, ms, open });
}

const toastRoot = document.createElement('div');
toastRoot.id = 'toasts';
toastRoot.setAttribute('role', 'status');
toastRoot.setAttribute('aria-live', 'polite');
toastRoot.setAttribute('aria-atomic', 'true');
document.body.appendChild(toastRoot);
let toastTimer;
function toast(msg, { undo: withUndo = false, sub = '', ms, open = '' } = {}) {
  clearTimeout(toastTimer);
  let undoId = 0;
  if (withUndo) {
    if (dropIfNoop()) return; // nothing changed: no snapshot, no toast
    undoId = undoStack[undoStack.length - 1]?.id || 0;
    withUndo = !!undoId;
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-msg"><b>${esc(msg)}</b> ${sub ? `<span>${esc(sub)}</span>` : ''}</span>${open ? `<button class="toast-open" data-action="openEntry" data-ref="${esc(open)}">Open</button>` : ''}${withUndo ? `<button class="toast-undo" data-action="undo" data-id="${undoId}">Undo</button>` : ''}`;
  toastRoot.replaceChildren(t);
  // The toast stays while it has focus or the pointer is over it.
  const hide = () => {
    if (t.contains(document.activeElement) || t.matches(':hover')) { toastTimer = setTimeout(hide, 1500); return; }
    t.remove();
  };
  toastTimer = setTimeout(hide, ms ?? (withUndo ? 6000 : 2600));
}
function pulseHP(kind) {
  document.querySelectorAll('.dock-num, .plate-hp b').forEach((el) => {
    el.classList.remove('pulse-dmg', 'pulse-heal');
    void el.offsetWidth;
    el.classList.add(`pulse-${kind}`);
  });
}

// ---------- bottom sheet ----------
// One dialog at a time, rendered outside #view so a re-render of the page does not close it.
// `sh` holds its kind and small working state (typed amount, d8 roll, rest tab...).
const sheetRoot = document.createElement('div');
sheetRoot.id = 'sheet-root';
document.body.appendChild(sheetRoot);
let sh = null;

const openerSel = (el) => (el?.dataset?.action ? `[data-action="${el.dataset.action}"]${['kind', 'id', 'key'].filter((k) => el.dataset[k] !== undefined).map((k) => `[data-${k}="${el.dataset[k]}"]`).join('')}` : '');
function openSheet(kind, opener, init = {}) {
  if (sh) return;
  sh = { kind, opener: openerSel(opener), amt: '', roll: 0, rolls: [], tab: 'short', clear: false, text: '', dirty: false, qk: '', f: { tags: [] }, ...init };
  view.inert = true;
  document.body.classList.add('sheet-open');
  sheetRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="closeSheet"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <header class="sheet-head"><h2 class="sheet-title" id="sheet-title"></h2><button class="sheet-close" data-action="closeSheet">Close</button></header>
      <div class="sheet-body"></div>
    </section>`;
  renderSheet();
  const first = sheetRoot.querySelector('[data-autofocus]');
  (first || sheetRoot.querySelector('.sheet')).focus({ preventScroll: true });
}
// Cancel / Continue dialog for a risky choice. `run` is called when the player confirms.
function confirmSheet(opener, c) { openSheet('confirm', opener, { c: { ok: 'Continue', tone: 'ok', ...c } }); }
function closeSheet({ render: force = false } = {}) {
  if (!sh) return;
  if (sh.kind === 'quick' && sh.qk) { // keep typed text as an in-memory draft for the next time this form opens
    const f = sh.f;
    if ([f.main, f.key, f.notes, f.tagIn].some((x) => (x || '').trim()) || (f.tags || []).length) qaDraft[sh.qk] = { ...f }; else delete qaDraft[sh.qk];
  }
  if (sh.kind === 'driveconflict') settleConflict('cancel');
  const { opener, dirty } = sh;
  sh = null;
  sheetRoot.innerHTML = '';
  view.inert = false;
  document.body.classList.remove('sheet-open');
  if (force || dirty) render();
  const target = (opener && view.querySelector(opener)) || view.querySelector('.dock button');
  if (target) target.focus({ preventScroll: true });
  else { document.getElementById('main')?.focus({ preventScroll: true }); } // opener is gone (e.g. the item moved lists)
}
function renderSheet() {
  if (!sh) return;
  const { title, body } = SHEETS[sh.kind]();
  const fk = document.activeElement?.closest?.('#sheet-root') ? document.activeElement.dataset.fk : '';
  const scroll = sheetRoot.querySelector('.sheet-body');
  const top = scroll.scrollTop;
  sheetRoot.querySelector('#sheet-title').textContent = title;
  scroll.innerHTML = body;
  scroll.scrollTop = top;
  if (fk) sheetRoot.querySelector(`[data-fk="${fk}"]`)?.focus({ preventScroll: true });
}

const d8Grid = (action, picked = 0) => `<div class="d8-grid" role="group" aria-label="d8 result">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
  `<button class="key" data-action="${action}" data-n="${n}" data-fk="d${n}" aria-pressed="${picked === n}">${n}</button>`).join('')}</div>`;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'clear'];
const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5h11v14H9L3 12z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>';
function keypad() {
  return `<div class="keypad" role="group" aria-label="Number pad">${KEYS.map((k) =>
    `<button class="key" data-action="kp" data-k="${k}" data-fk="k${k}" ${k === 'back' ? 'aria-label="Backspace"' : ''}>${k === 'back' ? BACK_ICON : k === 'clear' ? 'Clear' : k}</button>`).join('')}</div>`;
}
const kpDisplay = () => `<div class="kp-display" aria-live="polite" aria-atomic="true"><span class="kp-amt">${esc(sh.amt || '0')}</span></div>`;
const kpChips = () => `<div class="kp-chips" role="group" aria-label="Add to amount">${[1, 2, 5, 10].map((n) => `<button data-action="chip" data-n="${n}" data-fk="chip${n}">+${n}</button>`).join('')}</div>`;

// What damage does to current and temporary HP (temp HP absorb first).
function hpAfterDamage(amt) {
  const hp = C().hp;
  const fromTemp = Math.min(num(hp.temp), amt);
  return { temp: num(hp.temp) - fromTemp, cur: Math.max(0, num(hp.current) - (amt - fromTemp)) };
}
const hpText = (cur, temp) => `${cur} HP${temp ? ` + ${temp} temp` : ''}`;

// Resting: one function computes the result on a copy, the same function applies it for real.
function applyRest(c, kind, { clearConds = false, rolls = [] } = {}) {
  if (kind === 'short') {
    for (const r of rolls) {
      c.hdUsed = num(c.hdUsed) + 1;
      c.hp.current = Math.min(maxHP(), num(c.hp.current) + Math.max(0, r + am('con')));
      if (c.hp.current > 0) c.deathSaves = { success: 0, fail: 0 };
    }
    if (lvl() >= 20 && c.items.some((i) => i.attuned)) c.uses.flash = 0; // Magical Guidance
    else if (lvl() >= 14) c.uses.flash = Math.max(0, num(c.uses.flash) - 1); // Refreshed Genius
    return;
  }
  c.hp.current = maxHP();
  c.hp.temp = 0;
  c.hdUsed = 0;
  c.slotsUsed = [0, 0, 0, 0, 0];
  c.uses = {};
  c.cannons = [];
  c.exhaustion = Math.max(0, num(c.exhaustion) - 1);
  c.deathSaves = { success: 0, fail: 0 };
  if (clearConds) c.conditions = [];
}
function restSummary(kind, opts) {
  const b = C();
  const a = JSON.parse(JSON.stringify(b));
  applyRest(a, kind, opts);
  const lines = [];
  if (num(b.hp.current) !== num(a.hp.current)) lines.push(`HP ${num(b.hp.current)} → ${num(a.hp.current)} (max ${maxHP()})`);
  if (num(b.hp.temp) !== num(a.hp.temp)) lines.push(`Temp HP ${num(b.hp.temp)} removed`);
  if (num(b.hdUsed) !== num(a.hdUsed)) lines.push(`Hit Dice ${lvl() - num(b.hdUsed)}/${lvl()} → ${lvl() - num(a.hdUsed)}/${lvl()}`);
  const slotLines = SLOTS[lvl() - 1].map((n, i) => [i + 1, n - num(b.slotsUsed[i]), n - num(a.slotsUsed[i])]).filter(([, x, y]) => x !== y);
  if (slotLines.length) lines.push(`Spell slots restored (${slotLines.map(([l, x, y]) => `L${l} ${x}→${y}`).join(', ')})`);
  for (const k of Object.keys(USES)) {
    const max = usesMax(k);
    if (!max) continue;
    const x = Math.max(0, max - num(b.uses[k]));
    const y = Math.max(0, max - num(a.uses[k]));
    if (x !== y) lines.push(`${USES[k].name} ${x}→${y}`);
  }
  if (b.cannons.length && !a.cannons.length) lines.push(`${b.cannons.length === 1 ? 'Cannon' : 'Cannons'} removed`);
  if (num(b.exhaustion) !== num(a.exhaustion)) lines.push(`Exhaustion ${num(b.exhaustion)} → ${num(a.exhaustion)}`);
  if ((num(b.deathSaves.success) || num(b.deathSaves.fail)) && !(num(a.deathSaves.success) || num(a.deathSaves.fail))) lines.push('Death saves reset');
  if (b.conditions.length && !a.conditions.length) lines.push(`Conditions cleared (${b.conditions.join(', ')})`);
  return lines;
}

const kpKinds = ['damage', 'heal', 'cannonhp', 'coin'];
const incapacitating = (n) => n === 'Incapacitated' || /Incapacitated/.test(CONDITION_EFFECTS[n] || '');
const concSpells = () => SPELLS.filter((s) => s.flags.includes('C') && spellStatus(s) !== 'none').sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

// Quick-add forms: main field (name/title/text), one key field, tags, optional note.
const QUICK = {
  session: { menu: 'Session note', hint: 'Add a line to tonight’s log', title: 'Session note', main: 'Note', ph: 'What just happened?', save: 'Add note' },
  npc: { menu: 'NPC', hint: 'Someone you met', title: 'New NPC', main: 'Name', key: ['role', 'Role', 'e.g. innkeeper, spy'], tags: 1, note: 1, save: 'Add NPC' },
  place: { menu: 'Place', hint: 'City, district, dungeon…', title: 'New place', main: 'Name', key: ['kind', 'Kind', 'city, district, dungeon…'], tags: 1, note: 1, save: 'Add place' },
  faction: { menu: 'Faction', hint: 'House, guild or group', title: 'New faction', main: 'Name', key: ['goals', 'Goals', 'What do they want?'], tags: 1, note: 1, save: 'Add faction' },
  quest: { menu: 'Quest', hint: 'A job or hook', title: 'New quest', main: 'Title', key: ['giver', 'Quest giver', 'Who asked?'], tags: 1, note: 1, save: 'Add quest' },
  line: { menu: 'In-character line', hint: 'Something to say at the table', title: 'In-character line', main: 'Line', ph: 'Say it in character…', save: 'Add line' },
};
const qaDraft = {}; // unsent quick-add forms by kind
function qaAddTags() {
  sh.f.tags = [...new Set([...(sh.f.tags || []), ...cleanTags(sh.f.tagIn)])];
  sh.f.tagIn = '';
  renderSheet();
  sheetRoot.querySelector('[data-fk="f-tagIn"]')?.focus({ preventScroll: true });
}
const SHEETS = {
  damage() {
    const amt = num(sh.amt);
    const p = hpAfterDamage(amt);
    return {
      title: 'Damage',
      body: `${kpDisplay()}
        <p class="kp-preview">${amt ? `Now ${hpText(num(C().hp.current), num(C().hp.temp))} → ${hpText(p.cur, p.temp)}` : `Now ${hpText(num(C().hp.current), num(C().hp.temp))}. Temp HP are used up first.`}</p>
        ${kpChips()}${keypad()}
        <div class="sheet-actions"><button class="danger big" data-action="applyDmg" ${amt ? '' : 'disabled'}>Apply damage</button></div>`,
    };
  },
  heal() {
    const amt = num(sh.amt);
    const cur = num(C().hp.current);
    return {
      title: 'Heal',
      body: `${kpDisplay()}
        <p class="kp-preview">${amt ? `HP ${cur} → ${Math.min(maxHP(), cur + amt)} (max ${maxHP()})` : `HP ${cur} / ${maxHP()}${num(C().hp.temp) ? `, ${num(C().hp.temp)} temp` : ''}`}</p>
        ${kpChips()}${keypad()}
        <div class="sheet-actions"><button class="ok big" data-action="applyHeal" ${amt ? '' : 'disabled'}>Heal</button>
          <button class="big" data-action="setTemp" ${amt ? '' : 'disabled'}>Set temp HP</button></div>
        <p class="hint">Temp HP do not stack: setting them replaces the old amount (currently ${num(C().hp.temp)}).</p>`,
    };
  },
  cannonhp() {
    const k = C().cannons.find((x) => x.id === sh.id);
    const max = 5 * lvl();
    const i = C().cannons.indexOf(k) + 1;
    return {
      title: `Cannon ${i} HP`,
      body: `${kpDisplay()}
        <p class="kp-preview">${k ? `Cannon HP ${num(k.hp)} / ${max}` : 'This cannon is gone.'}</p>
        ${kpChips()}${keypad()}
        <div class="sheet-actions"><button class="danger big" data-action="cannonAmt" data-dir="-1" ${num(sh.amt) && k ? '' : 'disabled'}>Damage cannon</button>
          <button class="ok big" data-action="cannonAmt" data-dir="1" ${num(sh.amt) && k ? '' : 'disabled'}>Repair cannon</button></div>`,
    };
  },
  hd() {
    const con = am('con');
    const roll = sh.roll;
    const gained = Math.max(0, roll + con);
    const cur = num(C().hp.current);
    return {
      title: 'Spend a Hit Die',
      body: `<p>You have <b>${hdLeft()}</b> d8 left. Roll one and tap the number you got.</p>
        ${d8Grid('hdPick', roll)}
        <p class="kp-preview big">${roll ? `${roll} ${fmt(con)} CON = <b>${gained} HP healed</b> (HP ${cur} → ${Math.min(maxHP(), cur + gained)})` : `CON modifier ${fmt(con)} is added to the roll.`}</p>
        <div class="sheet-actions"><button class="ok big" data-action="hdApply" ${roll && hdLeft() ? '' : 'disabled'}>Spend Hit Die</button></div>`,
    };
  },
  rest() {
    const long = sh.tab === 'long';
    const opts = { clearConds: long && sh.clear, rolls: long ? [] : sh.rolls };
    const lines = restSummary(sh.tab, opts);
    const con = am('con');
    const left = hdLeft() - sh.rolls.length;
    const tabs = `<div class="seg-mini" role="group" aria-label="Rest type">
      <button data-action="restTab" data-key="short" data-fk="t-short" aria-pressed="${!long}">Short rest</button>
      <button data-action="restTab" data-key="long" data-fk="t-long" aria-pressed="${long}">Long rest</button></div>`;
    const shortPart = `
      <h3>Spend Hit Dice (${left} left)</h3>
      <p class="hint">Roll a d8 for each Hit Die you spend and tap the result. ${fmt(con)} (CON) is added to each.</p>
      ${d8Grid('restRoll')}
      ${sh.rolls.length ? `<ul class="roll-list">${sh.rolls.map((r, i) => `<li><span>d8 ${r} ${fmt(con)} = <b>+${Math.max(0, r + con)} HP</b></span><button class="icon" data-action="restUnroll" data-i="${i}" aria-label="Remove roll ${i + 1}">✕</button></li>`).join('')}</ul>` : ''}`;
    const longPart = `<label class="check"><input type="checkbox" data-sh="clear" data-fk="clear" ${sh.clear ? 'checked' : ''}><span>Also clear conditions (off by default: conditions end by their own source)</span></label>`;
    return {
      title: 'Rest',
      body: `${tabs}${long ? longPart : shortPart}
        <h3>What changes</h3>
        <ul class="sum-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('') || '<li class="muted">Nothing to restore.</li>'}</ul>
        ${long ? '<p class="hint">Afterwards you can change prepared spells and create items from your plans.</p>' : ''}
        <div class="sheet-actions"><button class="ok big" data-action="restConfirm">${long ? 'Take long rest' : 'Take short rest'}</button></div>`,
    };
  },
  cond() {
    return { title: 'Conditions', body: `<div class="conds">${conditionButtons()}</div><h3>Exhaustion</h3>${exhaustionMeter()}` };
  },
  conc() {
    const cur = C().concentration || { id: '', name: '' };
    const list = concSpells();
    return {
      title: 'Concentration',
      body: `${cur.name ? `<p class="kp-preview big">Concentrating on <b>${esc(cur.name)}</b></p>` : '<p class="muted">Not concentrating.</p>'}
        <h3>Prepared spells that need it</h3>
        <ul class="pick-list">${list.map((s) => `<li><button data-action="concPick" data-id="${esc(s.id)}" data-fk="s-${esc(s.id)}" aria-pressed="${cur.id === s.id}"><span>${esc(s.name)}</span>${lvlTag(s.level)}</button></li>`).join('') || '<li class="muted">None of your prepared spells need Concentration. Use "Other effect".</li>'}</ul>
        <h3>Other effect</h3>
        <div class="row"><label class="field grow"><span>Name</span><input data-sh="text" data-fk="other" maxlength="40" value="${esc(sh.text)}" placeholder="Effect or item"></label><button data-action="concOther">Set</button></div>
        <div class="sheet-actions"><button class="danger big" data-action="concEnd" ${cur.name ? '' : 'disabled'}>End concentration</button></div>
        <p class="hint">Ends when you start another Concentration spell, become Incapacitated, or die.</p>`,
    };
  },
  slot() {
    const avail = SLOTS[lvl() - 1].map((n, i) => [i + 1, n - num(C().slotsUsed[i])]).filter(([, n]) => n > 0);
    return {
      title: 'Create with a spell slot',
      body: `<p>Pick the slot to spend. A slot pays for one cannon.</p>
        <ul class="pick-list">${avail.map(([l, n]) => `<li><button data-action="slotPick" data-level="${l}" data-fk="sl${l}"><span>Level ${l} slot</span><small>${n} left</small></button></li>`).join('') || '<li class="muted">No spell slots left.</li>'}</ul>`,
    };
  },
  quick() {
    if (!sh.qk) {
      return { title: 'Quick add', body: `<div class="qa-grid">${Object.entries(QUICK).map(([k, q]) =>
        `<button class="qa-btn" data-action="qaPick" data-k="${k}" data-fk="qa-${k}"><b>${q.menu}</b><small>${q.hint}</small></button>`).join('')}</div>` };
    }
    const q = QUICK[sh.qk];
    const f = sh.f;
    const fld = (field, label, ph, auto) => `<label class="field"><span>${label}</span><input data-sh="f" data-field="${field}" data-fk="f-${field}" ${auto ? 'data-autofocus' : ''} autocomplete="off" maxlength="200" enterkeyhint="done" placeholder="${esc(ph || '')}" value="${esc(f[field] || '')}"></label>`;
    return {
      title: q.title,
      body: `${fld('main', q.main, q.ph, true)}
        ${q.key ? fld('key', q.key[1], q.key[2]) : ''}
        ${q.tags ? `<div class="tags-ed"><span class="lbl">Tags</span>
          ${(f.tags || []).length ? `<div class="tag-list">${f.tags.map((t) => `<span class="tagchip">#${esc(t)}<button class="icon" data-action="qaTagRemove" data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">✕</button></span>`).join('')}</div>` : ''}
          <div class="row tight"><input class="grow" data-sh="f" data-field="tagIn" data-fk="f-tagIn" aria-label="Add a tag" placeholder="Add a tag, then Enter" autocomplete="off" autocapitalize="none" maxlength="40" value="${esc(f.tagIn || '')}"><button data-action="qaTagAdd">Add tag</button></div></div>` : ''}
        ${q.note ? `<label class="field wide"><span>Note (optional)</span><textarea data-sh="f" data-field="notes" data-fk="f-notes" rows="2" maxlength="2000">${esc(f.notes || '')}</textarea></label>` : ''}
        <div class="sheet-actions"><button class="big" data-action="qaBack">Back</button><button class="ok big" data-action="quickSave" ${(f.main || '').trim() ? '' : 'disabled'}>${q.save}</button></div>`,
    };
  },
  driveconflict() {
    const m = sh.meta || {};
    return {
      title: 'Drive has newer data',
      body: `<p>Drive has newer data from <b>${esc(m.device || 'another device')}</b> (saved ${esc(driveTime(m.savedAt || m.modifiedTime))}), and this device has changes that are not in Drive yet.</p>
        <p class="hint"><b>Use Drive version</b> replaces this device&rsquo;s data after saving it as a snapshot (&ldquo;Before Drive download&rdquo;). <b>Keep this device&rsquo;s version</b> overwrites Drive; the Drive version is first copied to a dated &ldquo;dnd-slop-conflict&rdquo; file in the folder.</p>
        <div class="sheet-actions"><button class="big" data-action="closeSheet">Cancel</button><button class="big" data-action="driveKeep">Keep this device&rsquo;s version</button><button class="ok big" data-action="driveUse">Use Drive version</button></div>`,
    };
  },
  confirm() {
    const c = sh.c;
    return {
      title: c.title,
      body: `<p>${esc(c.text)}</p>
        <div class="sheet-actions"><button class="big" data-action="closeSheet">Cancel</button>${c.download ? '<button class="big" data-action="downloadCurrent">Download current data first</button>' : ''}<button class="${c.tone} big" data-action="confirmGo">${esc(c.ok)}</button></div>`,
    };
  },
  generic() {
    const base = PLANS.find((p) => p.id === sh.id);
    const max = at(PLANS_KNOWN, lvl());
    const over = knownPlans().length >= max;
    return {
      title: 'Learn an item',
      body: `<p>${esc(base?.name || 'Plan')}: name the specific item you are learning.</p>
        <label class="field"><span>Which item?</span><input data-sh="text" data-autofocus data-fk="gname" maxlength="60" autocomplete="off" value="${esc(sh.text)}" placeholder="e.g. Everbright Lantern"></label>
        ${over ? `<p class="warn">You already know ${knownPlans().length} of ${max} plans. Learning this one puts you over your limit.</p>` : ''}
        <div class="sheet-actions"><button class="big" data-action="closeSheet">Cancel</button><button class="ok big" data-action="genericGo" ${sh.text.trim() ? '' : 'disabled'}>${over ? 'Learn anyway' : 'Learn'}</button></div>`,
    };
  },
  coin() {
    const K = String(sh.key).toUpperCase();
    const have = num(C().coins[sh.key]);
    const amt = num(sh.amt);
    return {
      title: `${K} coins`,
      body: `${kpDisplay()}
        <p class="kp-preview">${amt ? `Add: ${have} → ${have + amt}. Spend: ${amt > have ? `not enough (you have ${have})` : `${have} → ${have - amt}`}.` : `You have ${have} ${K}. Type an amount.`}</p>
        ${kpChips()}${keypad()}
        <div class="sheet-actions"><button class="ok big" data-action="coinGo" data-dir="1" ${amt ? '' : 'disabled'}>Add</button><button class="big" data-action="coinGo" data-dir="-1" ${amt && amt <= have ? '' : 'disabled'}>Spend</button></div>`,
    };
  },
  detonate() {
    const st = cannonStats(lvl(), intMod());
    return {
      title: 'Detonate the cannon?',
      body: `<p>Each creature within 20 ft makes a DEX save (DC ${spellDC()}) and takes ${esc(st.detonate || '')} damage, half on a success. The cannon is destroyed.</p>
        <div class="sheet-actions"><button class="danger big" data-action="detonateGo">Detonate</button><button class="big" data-action="closeSheet">Cancel</button></div>`,
    };
  },
};

// A condition or exhaustion change happened (inside the conditions sheet): save, update the sheet and the screen effects.
function condChanged(msg, sub = '') {
  persist();
  applyBodyFx();
  if (sh) { sh.dirty = true; renderSheet(); } else render();
  refreshDerived();
  buzz(10);
  toast(msg, { undo: true, sub });
}
function pipMessage(path, spent) {
  const seg = path.split('.');
  if (seg[1] === 'slotsUsed') return `Level ${Number(seg[2]) + 1} slot ${spent ? 'spent' : 'restored'}`;
  if (seg[1] === 'uses') return `${USES[seg[2]]?.name || 'Use'} ${spent ? 'used' : 'restored'}`;
  if (seg[1] === 'deathSaves') return `Death save ${seg[2] === 'fail' ? 'failure' : 'success'} ${spent ? 'marked' : 'cleared'}`;
  return 'Updated';
}
// Update every pip of one group in place (faster than re-rendering the page).
function syncPips(path) {
  const used = num(getPath(path));
  document.querySelectorAll('.pip').forEach((b) => {
    if (b.dataset.path !== path) return;
    const on = Number(b.dataset.i) < used;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
function makeCannons(mode, level = 0) {
  const c = C();
  snap();
  if (mode === 'free') c.uses.cannon = num(c.uses.cannon) + 1;
  else c.slotsUsed[level - 1] = num(c.slotsUsed[level - 1]) + 1;
  // Level 15+: one free creation makes two cannons at once (a slot-paid creation makes one).
  const n = mode === 'free' && lvl() >= 15 && c.cannons.length === 0 ? 2 : 1;
  for (let i = 0; i < n; i++) c.cannons.push({ id: uid(), hp: 5 * lvl() });
  persist();
  render();
  buzz(10);
  toast(n === 2 ? 'Two cannons created' : 'Cannon created', { undo: true });
}

const actions = {
  tab: (el) => { setTab(el.dataset.key); jq = ''; jtag = ''; commit(); window.scrollTo(0, 0); },
  section: (el) => {
    const sec = SECTIONS.find((x) => x.key === el.dataset.key);
    if (!sec) return;
    const last = state.ui.sub?.[sec.key];
    setTab(sec.tabs ? (sec.tabs.some(([k]) => k === last) ? last : sec.tabs[0][0]) : sec.key);
    jq = ''; jtag = '';
    commit(); window.scrollTo(0, 0);
  },
  theme: () => { state.ui.theme = THEMES[(THEMES.indexOf(themePref()) + 1) % THEMES.length]; commit(); },
  filter: (el) => {
    const f = F(el.dataset.page);
    const key = el.dataset.key;
    const val = el.dataset.val;
    f[key] = String(f[key] ?? '') === val ? '' : val;
    persist();
    // re-render filter chips + list
    render();
  },
  reloadApp: () => { clearTimeout(saveTimer); save(state); location.reload(); }, // save() respects the unreadable-data hold (never saveNow(), which releases it)
  dismissUpdate: () => { document.getElementById('update-banner')?.remove(); document.body.classList.remove('has-update'); },
  selOpen: (el) => { if (el.dataset.view) F('spells').view = el.dataset.view; setTab(el.dataset.key); jq = ''; jtag = ''; commit(); window.scrollTo(0, 0); },
  spellView: (el) => { F('spells').view = el.dataset.key; persist(); render(); },
  cycleSkill: (el) => { const k = el.dataset.key; C().skills[k] = (num(C().skills[k]) + 1) % 3; commit(); },
  setExhaustion: (el) => {
    const n = Number(el.dataset.n);
    snap();
    C().exhaustion = n === num(C().exhaustion) && n > 0 ? n - 1 : n;
    condChanged(`Exhaustion ${num(C().exhaustion)}`);
  },
  toggleCondition: (el) => {
    const c = C(); const k = el.dataset.key;
    const on = c.conditions.includes(k);
    snap();
    c.conditions = on ? c.conditions.filter((x) => x !== k) : [...c.conditions, k];
    let sub = '';
    if (!on && c.concentration?.name && incapacitating(k)) { c.concentration = { id: '', name: '' }; sub = 'Concentration ended (Incapacitated)'; }
    condChanged(`${k} ${on ? 'removed' : 'added'}`, sub);
  },
  pip: (el) => {
    const i = Number(el.dataset.i);
    const path = el.dataset.path;
    const used = num(getPath(path));
    const next = used > i ? i : i + 1;
    mutate(() => setPath(path, next), { mode: 'none', msg: pipMessage(path, next > used) });
    syncPips(path);
    refreshDerived();
    if (path === 'character.uses.cannon') render(); // the cannon card depends on the free use
  },
  sheet: (el) => openSheet(el.dataset.kind, el, { id: el.dataset.id, key: el.dataset.key }),
  confirmGo: () => { const run = sh?.c?.run; if (!run) return; if (run() === 'stay') return; closeSheet(); },
  downloadCurrent: () => downloadFile(backupFile(state)),
  closeSheet: () => closeSheet(),
  driveConnect: (el) => { driveFrom(el); driveConnect(); },
  driveSync: (el) => { driveFrom(el); driveRun(true); },
  driveRestore: (el) => { driveFrom(el); driveRestore(); },
  driveDisconnect: () => driveDisconnect(),
  driveUse: () => { settleConflict('drive'); closeSheet(); },
  driveKeep: () => { settleConflict('keep'); closeSheet(); },
  undo: (el) => undo(el),
  kp: (el) => {
    const k = el.dataset.k;
    if (k === 'clear') sh.amt = '';
    else if (k === 'back') sh.amt = sh.amt.slice(0, -1);
    else if (sh.amt.length < 4) sh.amt = String(Number(sh.amt + k));
    renderSheet();
  },
  chip: (el) => { sh.amt = String(Math.min(9999, num(sh.amt) + Number(el.dataset.n))); renderSheet(); },
  applyDmg: () => {
    const amt = Math.floor(num(sh.amt));
    if (!amt) return;
    const hp = C().hp;
    const wasUp = num(hp.current) > 0;
    snap();
    const after = hpAfterDamage(amt);
    hp.temp = after.temp;
    hp.current = after.cur;
    persist();
    const zero = after.cur <= 0;
    closeSheet({ render: wasUp === zero });
    refreshDerived();
    pulseHP('dmg');
    buzz(zero ? [80, 50, 80, 50, 160] : 30);
    const conc = C().concentration?.name;
    const sub = !conc ? '' : zero ? `0 HP: Concentration on ${conc} ends if you are Incapacitated or die.`
      : `Concentration save: DC ${Math.min(30, Math.max(10, Math.floor(amt / 2)))} (CON save ${fmt(saveMod('con'))})`;
    toast(`Took ${amt} damage: ${hpText(after.cur, after.temp)}`, { undo: true, sub, ms: sub ? 10000 : 6000 });
  },
  applyHeal: () => {
    const amt = Math.floor(num(sh.amt));
    if (!amt) return;
    const hp = C().hp;
    const wasZero = num(hp.current) <= 0;
    snap();
    const before = num(hp.current);
    hp.current = Math.max(before, Math.min(maxHP(), before + amt)); // healing never lowers HP
    if (hp.current > 0) C().deathSaves = { success: 0, fail: 0 };
    persist();
    closeSheet({ render: wasZero && hp.current > 0 });
    refreshDerived();
    pulseHP('heal');
    buzz(10);
    toast(`Healed ${hp.current - before}: ${hpText(hp.current, num(hp.temp))}`, { undo: true });
  },
  setTemp: () => {
    const amt = Math.floor(num(sh.amt));
    if (!amt) return;
    snap();
    C().hp.temp = amt; // temp HP don't stack: the new amount replaces the old one
    persist();
    closeSheet();
    refreshDerived();
    pulseHP('heal');
    buzz(10);
    toast(`Temp HP set to ${amt}`, { undo: true });
  },
  hdPick: (el) => { sh.roll = Number(el.dataset.n); renderSheet(); },
  hdApply: () => {
    const roll = sh.roll;
    if (!roll || !hdLeft()) return;
    const gained = Math.max(0, roll + am('con'));
    snap();
    C().hdUsed = num(C().hdUsed) + 1;
    C().hp.current = Math.min(maxHP(), num(C().hp.current) + gained);
    if (C().hp.current > 0) C().deathSaves = { success: 0, fail: 0 };
    persist();
    closeSheet({ render: true });
    pulseHP('heal');
    buzz(10);
    toast(`Hit Die: ${roll} ${fmt(am('con'))} = +${gained} HP`, { undo: true });
  },
  restTab: (el) => { sh.tab = el.dataset.key; renderSheet(); },
  restRoll: (el) => { if (sh.rolls.length < hdLeft()) { sh.rolls.push(Number(el.dataset.n)); renderSheet(); } },
  restUnroll: (el) => { sh.rolls.splice(Number(el.dataset.i), 1); renderSheet(); },
  restConfirm: () => {
    const kind = sh.tab;
    const snapOk = kind !== 'long' || takeSnapshot(state, 'Before long rest', 'rest');
    snap();
    applyRest(C(), kind, { clearConds: kind === 'long' && sh.clear, rolls: kind === 'long' ? [] : sh.rolls });
    persist();
    closeSheet({ render: true });
    buzz(10);
    if (kind === 'long') driveSchedule(true);
    toast(`${kind === 'long' ? 'Long' : 'Short'} rest done`, { undo: true, sub: snapOk ? '' : 'Warning: the safety snapshot could not be saved (storage full).' });
  },
  concPick: (el) => {
    const s = SPELLS.find((x) => x.id === el.dataset.id);
    if (!s) return;
    const prev = C().concentration?.name;
    snap();
    C().concentration = { id: s.id, name: s.name };
    persist();
    closeSheet({ render: true });
    buzz(10);
    toast(`Concentrating on ${s.name}`, { undo: true, sub: prev && prev !== s.name ? `${prev} ended` : '' });
  },
  concOther: () => {
    const name = sh.text.trim();
    if (!name) return;
    snap();
    C().concentration = { id: '', name };
    persist();
    closeSheet({ render: true });
    buzz(10);
    toast(`Concentrating on ${name}`, { undo: true });
  },
  concEnd: () => {
    if (!C().concentration?.name) return;
    snap();
    C().concentration = { id: '', name: '' };
    persist();
    closeSheet({ render: true });
    buzz(10);
    toast('Concentration ended', { undo: true });
  },
  createCannon: (el) => {
    if (el.dataset.key === 'slot') return openSheet('slot', el);
    if (usesMax('cannon') - num(C().uses.cannon) <= 0) return toast('No free creation left');
    makeCannons('free');
  },
  slotPick: (el) => {
    const l = Number(el.dataset.level);
    if (SLOTS[lvl() - 1][l - 1] - num(C().slotsUsed[l - 1]) <= 0) return;
    makeCannons('slot', l);
    closeSheet({ render: true });
  },
  cannonStep: (el) => {
    const n = Number(el.dataset.n);
    const k = C().cannons.find((x) => x.id === el.dataset.id);
    if (!k) return;
    mutate(() => { k.hp = Math.max(0, Math.min(5 * lvl(), num(k.hp) + n)); }, { mode: 'fast', msg: `Cannon HP ${Math.max(0, Math.min(5 * lvl(), num(k.hp) + n))} / ${5 * lvl()}` });
  },
  cannonAmt: (el) => {
    const k = C().cannons.find((x) => x.id === sh.id);
    const amt = Math.floor(num(sh.amt)) * Number(el.dataset.dir);
    if (!k || !amt) return;
    snap();
    k.hp = Math.max(0, Math.min(5 * lvl(), num(k.hp) + amt));
    persist();
    closeSheet({ render: true });
    buzz(10);
    toast(`Cannon HP ${k.hp} / ${5 * lvl()}`, { undo: true });
  },
  dismissCannon: (el) => mutate(() => { C().cannons = C().cannons.filter((k) => k.id !== el.dataset.id); }, { msg: 'Cannon dismissed' }),
  detonateGo: () => {
    const id = sh.id;
    snap();
    C().cannons = C().cannons.filter((k) => k.id !== id);
    persist();
    closeSheet({ render: true });
    buzz(30);
    toast('Cannon detonated', { undo: true });
  },
  addAttack: () => {
    mutate(() => { C().attacks.push({ id: uid(), name: '', ability: 'dex', proficient: true, bonus: 0, dmgBonus: 0, addMod: true, mastery: '', notes: '', firearm: false, damages: [{ id: uid(), dice: '1d8', type: 'Piercing' }] }); });
  },
  addDamage: (el) => {
    const list = getPath(el.dataset.path);
    if (Array.isArray(list)) mutate(() => { getPath(el.dataset.path).push({ id: uid(), dice: '', type: '' }); });
  },
  removeDamage: (el) => {
    const path = el.dataset.path;
    const list = getPath(path);
    if (Array.isArray(list)) mutate(() => { setPath(path, getPath(path).filter((x) => x.id !== el.dataset.id)); });
  },
  removeAttack: (el) => {
    const a = C().attacks.find((x) => x.id === el.dataset.id);
    mutate(() => { C().attacks = C().attacks.filter((x) => x.id !== el.dataset.id); }, { msg: `Deleted ${a?.name ? `"${a.name}"` : 'attack'}` });
  },
  toggleSpell: (el) => {
    const s = SPELLS.find((x) => x.id === el.dataset.id);
    if (!s) return;
    const had = !!C().spells[s.id];
    const verb = had ? (s.level ? 'Unprepared' : 'Forgot') : (s.level ? 'Prepared' : 'Learned');
    const apply = () => mutate(() => {
      const sp = C().spells;
      if (had) delete sp[s.id]; else sp[s.id] = s.level === 0 ? 'known' : 'prepared';
    }, { msg: `${verb} ${s.name}` });
    if (had) return apply();
    const max = s.level === 0 ? at(CANTRIPS, lvl()) : at(PREPARED, lvl());
    const cur = s.level === 0 ? cantripCount() : preparedCount();
    if (cur < max) return apply();
    confirmSheet(el, {
      title: 'Over your limit',
      text: `You have ${cur}/${max} ${s.level === 0 ? 'cantrips' : 'prepared'}. ${s.level ? 'Prepare' : 'Learn'} ${s.name} anyway?`,
      ok: `${s.level ? 'Prepare' : 'Learn'} anyway`, run: apply,
    });
  },
  togglePlan: (el) => {
    const c = C();
    const id = el.dataset.id;
    const custom = c.plans.custom.find((p) => p.id === id);
    if (custom || c.plans.known[id]) {
      const name = custom ? custom.name : allPlans().find((p) => p.id === id)?.name || 'Plan';
      return mutate(() => {
        const cc = C();
        if (custom) cc.plans.custom = cc.plans.custom.filter((p) => p.id !== id); else delete cc.plans.known[id];
        cc.items = cc.items.filter((i) => !(i.planId === id && i.origin === 'replicated'));
      }, { msg: `Plan removed: ${name}`, sub: 'Items made from it vanished.' });
    }
    const name = allPlans().find((p) => p.id === id)?.name || 'Plan';
    const apply = () => mutate(() => { C().plans.known[id] = true; }, { msg: `Learned ${name}` });
    const max = at(PLANS_KNOWN, lvl());
    if (knownPlans().length < max) return apply();
    confirmSheet(el, { title: 'Over your limit', text: `You already know ${knownPlans().length} of ${max} plans. Learn ${name} anyway?`, ok: 'Learn anyway', run: apply });
  },
  learnGeneric: (el) => openSheet('generic', el, { id: el.dataset.id }),
  genericGo: () => {
    const base = PLANS.find((p) => p.id === sh.id);
    const name = sh.text.trim();
    if (!base || !name) return;
    mutate(() => { C().plans.custom.push({ id: uid(), custom: true, tier: base.tier, name, type: base.type === 'Any' ? 'Wondrous' : base.type, attune: null, base: base.name }); }, { msg: `Learned ${name}` });
    closeSheet();
  },
  craft: (el) => {
    const plan = allPlans().find((p) => p.id === el.dataset.id);
    if (!plan) return;
    const max = at(MAGIC_ITEMS, lvl());
    const reps = replicated();
    const apply = () => mutate(() => {
      const c = C();
      const old = c.items.filter((i) => i.origin === 'replicated');
      if (old.length >= max) c.items = c.items.filter((i) => i.id !== old[0].id);
      const rarity = plan.tier >= 14 ? 'Rare' : 'Uncommon';
      const generic = /^(Armor|Weapon) \+\d/.test(plan.name); // base unknown: don't count it until the player picks one
      c.items.push(newItem({ name: plan.name, origin: 'replicated', planId: plan.id, type: plan.type === 'Any' ? 'Other' : plan.type, rarity, needsAttune: plan.attune === true, equipped: !generic, notes: generic ? 'Choose the base armor/weapon in Equipment & bag, then equip it.' : '' }));
    }, { msg: `${plan.name} created`, sub: 'Set rarity and charges on Magic items.' });
    if (reps.length < max) return apply();
    confirmSheet(el, {
      title: 'Over your item limit',
      text: `You already have ${reps.length} of ${max} replicated items. Creating ${plan.name} makes the oldest one (${reps[0].name}) vanish.`,
      ok: 'Continue', run: apply,
    });
  },
  addItem: () => {
    const it = newItem();
    openBlocks.add(`e-${it.id}`);
    mutate(() => { C().items.push(it); });
  },
  toggleEquip: (el) => {
    const it = C().items.find((x) => x.id === el.dataset.id);
    if (!it) return;
    const on = !it.equipped;
    mutate(() => { it.equipped = on; }, { msg: `${it.name || 'Item'} ${on ? 'equipped' : 'put away'}` });
  },
  toggleNeeds: (el) => {
    const it = C().items.find((x) => x.id === el.dataset.id);
    if (!it) return;
    const on = !it.needsAttune;
    mutate(() => { it.needsAttune = on; if (!on) it.attuned = false; }, { msg: `${it.name || 'Item'}: ${on ? 'requires attunement' : 'no attunement needed'}` });
  },
  toggleAttune: (el) => {
    const it = C().items.find((x) => x.id === el.dataset.id);
    if (!it) return;
    const on = !it.attuned;
    mutate(() => { it.attuned = on; }, { msg: `${it.name || 'Item'} ${on ? 'attuned' : 'no longer attuned'}`, sub: on && attunedCount() >= attunementLimit(lvl()) ? `That is over your limit of ${attunementLimit(lvl())} attuned items.` : '' });
  },
  qty: (el) => {
    const it = C().items.find((x) => x.id === el.dataset.id);
    if (!it) return;
    const n = Math.max(0, num(it.qty) + Number(el.dataset.d));
    mutate(() => { it.qty = n; }, { vib: 5, msg: `Quantity ${n}` });
  },
  coinGo: (el) => {
    const amt = Math.floor(num(sh.amt)) * Number(el.dataset.dir);
    const k = sh.key;
    const have = num(C().coins[k]);
    if (!amt || have + amt < 0) return;
    snap();
    C().coins[k] = have + amt;
    persist();
    closeSheet({ render: true });
    buzz(10);
    toast(`${amt > 0 ? 'Added' : 'Spent'} ${Math.abs(amt)} ${k.toUpperCase()}: now ${have + amt}`, { undo: true });
  },
  addMenu: () => { addMenuOpen = !addMenuOpen; render(); },
  addEquip: (el) => {
    const kind = el.dataset.kind;
    const it = newItem({ origin: 'bought', rarity: 'Mundane', type: kind });
    openBlocks.add(`e-${it.id}`);
    addMenuOpen = false;
    mutate(() => { C().items.push(it); });
  },
  removeItem: (el) => {
    const it = C().items.find((x) => x.id === el.dataset.id);
    mutate(() => { C().items = C().items.filter((x) => x.id !== el.dataset.id); }, { msg: `Deleted ${it?.name ? `"${it.name}"` : 'item'}` });
    openBlocks.delete(`e-${el.dataset.id}`);
  },
  takeFeat: (el) => {
    const ft = featById(el.dataset.id);
    if (!ft) return;
    const apply = () => mutate(() => { C().feats.push({ id: uid(), featId: ft.id, level: lvl(), notes: '' }); }, { msg: `Took ${ft.name}` });
    if (meetsReq(ft)) return apply();
    confirmSheet(el, { title: 'Prerequisite not met', text: `You don't seem to meet the prerequisite (${reqText(ft)}). Take ${ft.name} anyway?`, ok: 'Take anyway', run: apply });
  },
  dropFeat: (el) => {
    mutate(() => { C().feats = C().feats.filter((x) => x.id !== el.dataset.id); }, { msg: 'Feat removed' });
  },
  addSession: () => {
    const next = state.sessions.reduce((m, s) => Math.max(m, num(s.number)), 0) + 1;
    const s = newSession(next);
    state.sessions.push(s); openCards.add(s.id); F('sessions').q = '';
    commit();
  },
  removeSession: (el) => {
    const ses = state.sessions.find((x) => x.id === el.dataset.id);
    mutate(() => { state.sessions = state.sessions.filter((x) => x.id !== el.dataset.id); }, { msg: `Session ${ses?.number ?? ''} deleted`.replace('  ', ' ') });
  },
  addEntry: (el) => {
    const coll = el.dataset.coll;
    const make = { npcs: newNpc, places: newPlace, factions: newFaction, quests: newQuest }[coll];
    if (!make) return;
    const e = make();
    openCards.add(e.id);
    Object.assign(F(coll), { q: '', tag: '' });
    jq = ''; jtag = '';
    mutate(() => { state.journal[coll].push(e); });
    const card = [...view.querySelectorAll('[data-jid]')].find((x) => x.dataset.jid === e.id);
    card?.querySelector('input')?.focus();
  },
  removeEntry: (el) => {
    const [coll, id] = el.dataset.ref.split(':');
    const e = jFind(coll, id);
    if (!e) return;
    mutate(() => { state.journal[coll] = state.journal[coll].filter((x) => x.id !== id); }, { msg: `Deleted ${JK[coll].one} ${jTitle(coll, e)}` });
    openCards.delete(id);
  },
  addTag: (el) => {
    const path = el.dataset.path;
    const inp = [...view.querySelectorAll('[data-tag-add]')].find((x) => x.dataset.tagAdd === path);
    const cur = getPath(path);
    if (!inp || !Array.isArray(cur)) return;
    const next = [...new Set([...cur, ...cleanTags(inp.value)])];
    inp.value = '';
    if (next.length !== cur.length) mutate(() => { setPath(path, next); touch(path); });
    focusBy('data-tag-add', path);
  },
  removeTag: (el) => {
    const path = el.dataset.path;
    const cur = getPath(path);
    if (!Array.isArray(cur)) return;
    mutate(() => { setPath(path, cur.filter((t) => t !== el.dataset.tag)); touch(path); }, { msg: `Tag #${el.dataset.tag} removed` });
    focusBy('data-tag-add', path);
  },
  listAdd: (el) => {
    const path = el.dataset.path;
    const inp = [...view.querySelectorAll('[data-list-add]')].find((x) => x.dataset.listAdd === path);
    const text = (inp?.value || '').trim();
    if (!text || !Array.isArray(getPath(path))) return;
    const item = path.endsWith('.lines') ? { id: uid(), text } : { id: uid(), text, done: false };
    mutate(() => { getPath(path).push(item); touch(path); });
    focusBy('data-list-add', path);
  },
  listRemove: (el) => {
    const path = el.dataset.path;
    const it = (getPath(path) || []).find((x) => x.id === el.dataset.id);
    if (!it) return;
    mutate(() => { setPath(path, getPath(path).filter((x) => x.id !== it.id)); touch(path); }, { msg: `Removed "${it.text.slice(0, 30)}"` });
    focusBy('data-list-add', path);
  },
  copyLine: async (el) => {
    const l = C().voice.lines.find((x) => x.id === el.dataset.id);
    if (!l) return;
    const prev = document.activeElement;
    let ok = false;
    try { await navigator.clipboard.writeText(l.text); ok = true; } catch { ok = fallbackCopy(l.text); }
    prev?.focus?.({ preventScroll: true });
    toast(ok ? 'Copied' : 'Could not copy', { sub: ok ? l.text.slice(0, 60) : 'Select the line and copy it by hand.' });
  },
  jtag: (el) => {
    jtag = jtag === el.dataset.val ? '' : el.dataset.val;
    jRefresh();
    [...view.querySelectorAll('[data-action="jtag"]')].find((x) => x.dataset.val === jtag)?.focus({ preventScroll: true });
  },
  openEntry: (el) => goEntry(el.dataset.ref),
  qaPick: (el) => { sh.qk = el.dataset.k; sh.f = qaDraft[sh.qk] ? { ...qaDraft[sh.qk], tags: [...(qaDraft[sh.qk].tags || [])] } : { tags: [] }; renderSheet(); sheetRoot.querySelector('[data-autofocus]')?.focus({ preventScroll: true }); },
  qaBack: () => { sh.qk = ''; renderSheet(); sheetRoot.querySelector('.qa-btn')?.focus({ preventScroll: true }); },
  qaTagAdd: () => qaAddTags(),
  qaTagRemove: (el) => { sh.f.tags = sh.f.tags.filter((t) => t !== el.dataset.tag); renderSheet(); sheetRoot.querySelector('[data-fk="f-tagIn"]')?.focus({ preventScroll: true }); },
  quickSave: () => {
    const q = QUICK[sh.qk];
    const sh0 = sh.qk;
    const f = sh.f;
    const main = (f.main || '').trim();
    if (!q || !main) return;
    const fields = { tags: cleanTags([...(f.tags || []), ...cleanTags(f.tagIn)]), notes: (f.notes || '').trim() };
    const key = (f.key || '').trim();
    if (sh.qk === 'line') {
      mutate(() => { C().voice.lines.push({ id: uid(), text: main }); }, { msg: 'Added in-character line', open: 'voice:' });
    } else if (sh.qk === 'session') {
      const day = localDay();
      const today = state.sessions.filter((x) => x.date === day).sort((a, b) => num(b.number) - num(a.number))[0];
      const ses = today || newSession(state.sessions.reduce((m, x) => Math.max(m, num(x.number)), 0) + 1, { date: day });
      if (!today) ses.title = `Session ${ses.number}`;
      const line = `[${new Date().toTimeString().slice(0, 5)}] ${main}`;
      mutate(() => {
        if (!today) state.sessions.push(ses);
        ses.notes = `${ses.notes ? `${ses.notes.replace(/\s+$/, '')}\n` : ''}${line}`;
      }, { msg: `${today ? 'Added to' : 'Started'} Session ${ses.number}`, sub: main.slice(0, 60), open: `sessions:${ses.id}` });
      driveSchedule(true);
    } else {
      const coll = { npc: 'npcs', place: 'places', faction: 'factions', quest: 'quests' }[sh.qk];
      const e = {
        npc: () => newNpc({ name: main, role: key, ...fields }),
        place: () => newPlace({ name: main, kind: key, ...fields }),
        faction: () => newFaction({ name: main, goals: key, ...fields }),
        quest: () => newQuest({ title: main, giver: key, ...fields }),
      }[sh.qk]();
      mutate(() => { state.journal[coll].push(e); }, { msg: `Added ${JK[coll].one} ${main}`, open: `${coll}:${e.id}` });
    }
    closeSheet();
    delete qaDraft[sh0];
  },
  snapRestore: (el) => {
    const snap0 = readSnaps().find((x) => x.id === el.dataset.id);
    if (!snap0) return;
    replaceWithSafety(el, 'Before restore', {
      title: 'Restore this snapshot?',
      text: `Replace everything on this device with the snapshot from ${snapTime(snap0.at)} (${snap0.reason})? Your current data is saved as a new snapshot first ("Before restore").`,
      ok: 'Restore', tone: 'danger',
    }, () => {
      let next;
      try { next = normalize(JSON.parse(snap0.data)); } catch { toast('That snapshot could not be read'); return; }
      next.ui = state.ui;
      state = next;
      if (driveOn()) dv().needsConfirm = true;
      hashCache = null;
      clearUndo();
      render();
      saveNow();
      toast('Snapshot restored');
    });
  },
  snapDownload: (el) => {
    const snap0 = readSnaps().find((x) => x.id === el.dataset.id);
    if (!snap0) return;
    try { downloadFile(backupFile(normalize(JSON.parse(snap0.data)), 'snapshot')); } catch { toast('That snapshot could not be read'); }
  },
  export: () => downloadFile(backupFile(state)),
  share: async () => {
    const file = backupFile(state);
    try { await navigator.share({ files: [file], title: file.name }); } catch (e) { if (e.name !== 'AbortError') downloadFile(file); }
  },
  reset: () => {
    if (!confirm('Delete your character, campaign, sessions and journal from this device? A snapshot is kept in Snapshots ("Before delete everything"). Export a backup first if unsure.')) return;
    if (!confirm('Really delete everything? This cannot be undone.')) return;
    takeSnapshot(state, 'Before delete everything');
    state = defaultState(); clearUndo(); commit();
  },
};

// ---------- events ----------
// One delegated click handler for the page, the sheet and the toasts.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action] && !el.disabled) { e.preventDefault(); actions[el.dataset.action](el); }
});
document.getElementById('skip')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('main')?.focus(); });
// Sheet: text field, checkbox, Esc to close, Tab kept inside, digits on a hardware keyboard.
sheetRoot.addEventListener('input', (e) => {
  if (e.target.dataset.sh === 'f') {
    const field = e.target.dataset.field;
    sh.f[field] = e.target.value;
    if (field === 'tagIn' && e.target.value.includes(',')) return qaAddTags();
    const go = sheetRoot.querySelector('[data-action="quickSave"]');
    if (go) go.disabled = !(sh.f.main || '').trim();
    return;
  }
  if (e.target.dataset.sh !== 'text') return;
  sh.text = e.target.value;
  if (sh.kind === 'generic') sheetRoot.querySelector('[data-action="genericGo"]').disabled = !sh.text.trim();
});
sheetRoot.addEventListener('change', (e) => {
  if (e.target.dataset.sh === 'clear') { sh.clear = e.target.checked; renderSheet(); }
});
document.addEventListener('keydown', (e) => {
  if (!sh) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Tab') {
    const f = [...sheetRoot.querySelectorAll('button:not(:disabled), input, textarea, select, [tabindex="0"]')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (!sheetRoot.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('sheet'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  if (e.key === 'Enter' && e.target.dataset?.sh === 'f' && e.target.tagName === 'INPUT' && !e.isComposing) {
    e.preventDefault();
    if (e.target.dataset.field === 'tagIn' && e.target.value.trim()) qaAddTags(); else actions.quickSave();
    return;
  }
  if (e.key === 'Enter' && e.target.dataset?.sh === 'text') {
    e.preventDefault();
    if (sh.kind === 'conc') actions.concOther(); else if (sh.kind === 'generic') actions.genericGo();
    return;
  }
  if (kpKinds.includes(sh.kind) && e.target.tagName !== 'INPUT' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (/^\d$/.test(e.key)) actions.kp({ dataset: { k: e.key } });
    else if (e.key === 'Backspace') actions.kp({ dataset: { k: 'back' } });
  }
});
function readValue(el) {
  if (el.dataset.type === 'bool') return el.checked;
  if (el.dataset.type === 'number') return el.value === '' ? 0 : num(el.value);
  return el.value;
}
// Arrow keys move between sub-tabs (tablist pattern).
view.addEventListener('keydown', (e) => {
  const t = e.target.closest?.('[role="tab"]');
  if (!t || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...t.parentElement.querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(t);
  const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
  e.preventDefault(); next.focus(); next.click();
});
view.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'jsearch') { jq = el.value; jRefresh(); return; }
  if (el.dataset.tagAdd !== undefined) { if (el.value.includes(',')) actions.addTag({ dataset: { path: el.dataset.tagAdd } }); return; }
  if (el.dataset.filter) {
    const [page, key] = el.dataset.filter.split('.');
    F(page)[key] = el.type === 'checkbox' ? el.checked : el.value;
    persist();
    renderList();
    return;
  }
  if (!el.dataset.bind) return;
  if (undoStack.length) clearUndo(); // typed edits must never be reverted by Undo
  const before = maxHP();
  const wasFull = num(C().hp.current) >= before;
  setPath(el.dataset.bind, readValue(el));
  touch(el.dataset.bind);
  if (el.dataset.grow !== undefined) grow(el);
  // Leveling up or raising CON while at full HP keeps you at full HP.
  if (wasFull && maxHP() !== before && el.dataset.bind !== 'character.hp.current') C().hp.current = maxHP();
  persist();
  refreshDerived();
});
view.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key !== 'Enter' || e.isComposing) return;
  if (t.dataset?.tagAdd !== undefined) { e.preventDefault(); actions.addTag({ dataset: { path: t.dataset.tagAdd } }); }
  else if (t.dataset?.listAdd !== undefined) { e.preventDefault(); actions.listAdd({ dataset: { path: t.dataset.listAdd } }); }
});
view.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'importFile') return importFile(el);
  if (el.dataset.catalog) applyCatalog(el);
  if (el.dataset.bind && (el.hasAttribute('data-rerender') || el.type === 'checkbox' || el.tagName === 'SELECT')) setTimeout(render, 0);
});
// Bodies of spell cards and item Edit blocks are built when opened and dropped when closed (keeps the page small).
const LAZY = {
  spell: (id) => { const sp = SPELLS.find((x) => x.id === id); return sp ? spellBody(sp) : ''; },
  equip: (id) => { const it = C().items.find((x) => x.id === id); return it ? itemEdit(it, 'equip') : ''; },
  magic: (id) => { const it = C().items.find((x) => x.id === id); return it ? itemEdit(it, 'magic') : ''; },
};
view.addEventListener('toggle', (e) => {
  const t = e.target;
  const d = t.dataset || {};
  if (d.fmore) { if (t.open) openFilters.add(d.fmore); else openFilters.delete(d.fmore); return; }
  if (d.jcard) {
    const [coll, id] = d.jcard.split(':');
    const body = t.querySelector(':scope > .lazy-body');
    if (t.open) {
      openCards.add(id);
      const e2 = jFind(coll, id);
      if (!body && e2) { t.insertAdjacentHTML('beforeend', `<div class="lazy-body">${jBody(coll, e2)}</div>`); t.querySelectorAll('textarea[data-grow]').forEach(grow); }
    } else { openCards.delete(id); body?.remove(); }
    return;
  }
  if (d.lazy) {
    const [kind, id] = d.lazy.split(':');
    const set = kind === 'spell' ? openSpells : openBlocks;
    const key = kind === 'spell' ? id : d.block;
    const body = t.querySelector(':scope > .lazy-body');
    if (t.open) {
      set.add(key);
      if (!body) t.insertAdjacentHTML('beforeend', `<div class="lazy-body">${LAZY[kind](id)}</div>`);
    } else { set.delete(key); body?.remove(); }
    return;
  }
  if (d.block) { if (t.open) openBlocks.add(d.block); else openBlocks.delete(d.block); return; }
}, true);

// Picking a base weapon/armor fills in its numbers (and the name when empty); everything stays editable.
function applyCatalog(el) {
  const it = C().items.find((x) => x.id === el.dataset.id);
  if (!it) return;
  if (el.dataset.catalog === 'weapon') {
    const w = WEAPONS.find((x) => x.name === el.value);
    if (!w) return;
    Object.assign(it.weapon, { base: w.name, category: w.category, range: w.range, finesse: w.finesse, thrown: w.thrown, props: w.props, mastery: w.mastery, damages: [{ id: uid(), dice: w.dice, type: w.type }] });
    if (!it.name) it.name = w.name;
  } else {
    const a = ARMOR.find((x) => x.name === el.value);
    if (!a) return;
    Object.assign(it.armor, { base: a.name, armorType: a.armorType, baseAC: a.baseAC, str: a.str, stealth: a.stealth });
    if (!it.name) it.name = a.name;
  }
  persist();
}

// ---------- Google Drive ----------
// Local storage always saves first; Drive is a mirror. Only the user's taps request a Google token (pop-up), never a timer.
const dv = () => state.ui.drive;
const driveOn = () => !!dv()?.connected;
const driveTokenOk = () => !!driveMod?.hasToken();
function ensureDrive() {
  return (driveLoading ||= import('./drive.js').then((m) => (driveMod = m)).catch((e) => { driveLoading = null; throw e; }));
}
function dataHash() { // FNV-1a over the saved data without ui (ui holds tab, filters and the Drive metadata itself)
  if (hashCache !== null) return hashCache;
  const { ui, ...rest } = state; // eslint-disable-line no-unused-vars
  const s = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (hashCache = `${(h >>> 0).toString(16)}-${s.length}`);
}
const driveDirty = () => dataHash() !== dv().syncedHash;
// The Drive file: the same content as a backup, without ui.drive, plus savedAt and a short device label.
function driveText() {
  return JSON.stringify({ ...state, ui: { ...state.ui, drive: undefined }, savedAt: new Date().toISOString(), device: driveMod.deviceLabel() }, null, 2);
}
function keepDriveMeta(next) { next.ui.drive = state.ui.drive; return next; }
function replaceFromDrive(data) {
  const next = { ...data };
  delete next.savedAt; delete next.device;
  const ui = state.ui; // the local ui (tab, filters, Drive metadata) is kept
  state = normalize(next);
  state.ui = ui;
  hashCache = null;
  clearUndo();
  render();
}
const driveHost = {
  isDirty: () => driveDirty(),
  upload: () => { saveNow(); return { text: driveText(), hash: dataHash() }; },
  validate: (d) => { if (!isBackup(d)) return false; try { normalize({ ...d }); return true; } catch { return false; } },
  tooNew: (d) => Number(d.version) > SCHEMA_VERSION,
  save: () => saveNow(),
  today: () => localDay(),
  markSynced: (h) => { dv().syncedHash = h; },
  applyRemote: (data, meta) => {
    const ok = takeSnapshot(state, 'Before Drive download');
    if (!ok && driveDirty()) throw new Error('A safety snapshot could not be saved (storage full), so nothing was changed');
    replaceFromDrive(data);
    dv().syncedHash = dataHash();
    dv().needsConfirm = false;
    saveNow();
    toast('Updated from Drive', { sub: meta?.device ? `Saved on ${meta.device}` : '' });
  },
  ask: (meta) => new Promise((resolve) => {
    if (sh) { resolve('cancel'); return; }
    driveAsk = resolve;
    openSheet('driveconflict', null, { meta });
  }),
};
const driveFrom = (el) => { driveRt.from = `${el.closest('#driveStrip') ? '#driveStrip' : '#driveStatus'} [data-action="${el.dataset.action}"]`; };
function settleConflict(choice) { const r = driveAsk; driveAsk = null; r?.(choice); }

// Button text while sign-in is being prepared: the first tap loads Google's script, the second opens the pop-up.
function signLabel(def, intent) {
  if (driveRt.prep === 'preparing' && driveRt.intent === intent) return 'Preparing sign-in…';
  if (driveRt.prep === 'ready' && driveRt.intent === intent) return intent === 'connect' ? 'Sign in with Google' : intent === 'restore' ? 'Sign in to restore' : 'Sign in to sync';
  return def;
}
const driveTime = (iso) => (iso ? snapTime(iso) : 'never');
// The strip under the header: a button when a tap is needed, plus a persistent live region for messages.
function driveStripState() {
  const d = dv();
  const on = driveOn();
  const need = on && (!driveTokenOk() || driveRt.review || d.needsConfirm);
  const base = d.needsConfirm ? 'Upload imported data to Drive?' : driveRt.review ? 'Drive has newer data: review' : 'Sync to Drive';
  const off = driveRt.busy || driveRt.prep === 'preparing';
  const btn = need ? `<button class="drive-btn" data-action="driveSync" ${off ? 'disabled aria-busy="true"' : ''}>${driveRt.busy ? 'Syncing…' : signLabel(base, 'sync')}</button>` : '';
  const msg = on ? driveRt.msg : '';
  return { btn, msg, empty: !btn && !msg };
}
const driveStripInner = () => { const s = driveStripState(); return `<span id="driveStripBtn">${s.btn}</span><small id="driveStripMsg" class="muted" ${state.ui.tab === 'data' ? '' : 'role="status" aria-live="polite"'}>${esc(s.msg)}</small>`; };
function driveStatusHtml() {
  const d = dv();
  const on = driveOn();
  const st = !on ? 'Not connected' : driveRt.busy ? 'Connected · syncing…' : driveTokenOk() ? 'Connected' : 'Connected · sign-in pass expired (tap Sync now)';
  return `<p><b>Status:</b> ${esc(st)}</p>
    ${on ? `<p><b>Last sync:</b> ${esc(driveTime(d.lastSyncAt))}${driveDirty() ? ' · changes on this device not synced yet' : ''}</p>` : ''}
    <p><b>File:</b> Drive › DnD Slop › dnd-slop-save.json</p>
    <div class="row">
      ${on ? `<button class="ok" data-action="driveSync" ${driveRt.busy || driveRt.prep === 'preparing' ? 'disabled' : ''}>${signLabel('Sync now', 'sync')}</button>
        <button data-action="driveRestore" ${driveRt.busy || driveRt.prep === 'preparing' ? 'disabled' : ''}>${signLabel('Restore from Drive', 'restore')}</button>
        <button class="danger" data-action="driveDisconnect">Disconnect</button>`
    : `<button class="ok" data-action="driveConnect" ${driveRt.busy || driveRt.prep === 'preparing' ? 'disabled' : ''}>${signLabel('Connect Google Drive', 'connect')}</button>`}
    </div>`;
}
function driveCard() {
  return `<section class="card" id="drive">
    <h2>Google Drive</h2>
    <div id="driveStatus"><div id="driveBody">${driveStatusHtml()}</div><p id="driveMsg" class="warn" role="status" aria-live="polite">${esc(driveRt.msg)}</p></div>
    <p class="hint">Saves only to a DnD Slop folder in your own Google Drive; the app can&rsquo;t see your other files. Your data is saved on this device first; Drive is a copy. A daily backup is kept there too (the last 7).</p>
    <p class="hint">Disconnect revokes access when you&rsquo;re signed in. To remove this app&rsquo;s access at any time, visit <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</p>
    <p class="hint">While the app is in Google&rsquo;s testing mode, Google may ask you to approve again about every 7 days, and the sign-in pass expires about hourly: then a &ldquo;Sync to Drive&rdquo; button appears and one tap renews it.</p>
  </section>`;
}
// Repaints the Drive strip and card in place (no full render), keeping keyboard focus on the same button.
// The message areas are persistent live regions: only their text changes.
function paintDrive() {
  const ae = document.activeElement;
  const where = ae?.closest?.('#driveStrip') ? '#driveStrip' : ae?.closest?.('#driveStatus') ? '#driveStatus' : '';
  const act = where ? ae.dataset.action : '';
  const lost = !ae || ae === document.body || ae.disabled;
  const s = document.getElementById('driveStrip');
  if (s) {
    const st = driveStripState();
    s.classList.toggle('is-empty', st.empty);
    const b = document.getElementById('driveStripBtn');
    if (b) b.innerHTML = st.btn;
    const m = document.getElementById('driveStripMsg');
    if (m && m.textContent !== st.msg) m.textContent = st.msg;
  }
  const c = document.getElementById('driveBody');
  if (c) c.innerHTML = driveStatusHtml();
  const dm = document.getElementById('driveMsg');
  if (dm && dm.textContent !== driveRt.msg) dm.textContent = driveRt.msg;
  if (act) document.querySelector(`${where} [data-action="${act}"]`)?.focus({ preventScroll: true });
  if (driveRt.from && !driveRt.busy && driveRt.prep !== 'preparing') { // after a tap-started run: focus the re-enabled button
    const target = document.querySelector(driveRt.from) || document.querySelector('#driveStatus [data-action="driveSync"]');
    if (lost && target && !target.disabled) target.focus({ preventScroll: true });
    driveRt.from = '';
  }
}
let expiryTimer = 0;
function watchExpiry() {
  clearTimeout(expiryTimer);
  const ms = driveMod?.tokenMsLeft?.() ?? 0;
  if (ms > 0) expiryTimer = setTimeout(paintDrive, Math.min(ms + 200, 2 ** 30));
}

// Auto sync: 15 s after the last change (immediately after a long rest or a session note), never more than once per 15 s.
const driveGap = () => (typeof window.__driveDebounceMs === 'number' ? window.__driveDebounceMs : 15000); // test hook
function driveSchedule(immediate = false) {
  if (!driveMod || !driveOn() || !driveTokenOk()) return;
  clearTimeout(driveTimer);
  const wait = Math.max(immediate ? 0 : driveGap(), driveLastRun + driveGap() - Date.now());
  driveTimer = setTimeout(() => driveRun(false), wait);
}
const driveErr = (e) => (e && e.message ? String(e.message) : 'Drive sync failed');
// interactive = started by a tap: may open the Google pop-up and the conflict sheet.
async function driveRun(interactive, { confirmed = false } = {}) {
  if (!driveOn()) return;
  if (driveRt.busy) { if (!interactive) driveRt.again = true; return; }
  if (navigator.onLine === false) {
    driveRt.msg = 'Offline — will sync when you tap Sync';
    paintDrive();
    if (interactive) toast(driveRt.msg);
    return;
  }
  if (!driveTokenOk() && interactive) { beginSignIn('sync'); return; } // synchronous: nothing awaited before the pop-up request
  if (interactive && dv().needsConfirm && !confirmed && driveTokenOk()) { openImportConfirm(); return; }
  const ep = driveRt.epoch;
  driveRt.busy = true;
  driveRt.msg = '';
  paintDrive();
  try {
    await ensureDrive();
    if (!driveTokenOk()) return; // an expired pass is never renewed without a tap
    driveLastRun = Date.now();
    if (!interactive) {
      if (dv().needsConfirm || !driveDirty()) return; // imported data is never uploaded without a tap
      if (driveRt.review) { // a conflict waits for review: only look at the remote time, download nothing
        const m = await driveMod.peekRemote(dv());
        if (!m || m === driveRt.reviewMtime) return;
        driveRt.review = false;
      }
    }
    saveNow();
    const r = await driveMod.sync(driveHost, dv(), { interactive, beforeImport: !!dv().needsConfirm });
    if (ep !== driveRt.epoch) return;
    if (r.status === 'conflict') { driveRt.review = true; driveRt.reviewMtime = r.modifiedTime || ''; driveRt.msg = 'Drive has newer data than this device.'; }
    else if (r.status !== 'cancelled') driveRt.review = false;
    if (r.status === 'uploaded' || r.status === 'downloaded' || r.status === 'uptodate') dv().needsConfirm = false;
    if (r.status === 'uploaded' && interactive) toast('Synced to Drive');
    else if (r.status === 'uptodate' && interactive) toast('Drive is up to date');
  } catch (e) {
    if (ep === driveRt.epoch) { driveRt.msg = driveErr(e); toast(driveRt.msg); }
  } finally {
    if (ep === driveRt.epoch) {
      driveRt.busy = false;
      if (sh?.kind === 'driveconflict') closeSheet(); else settleConflict('cancel');
      if (driveOn()) saveNow();
      paintDrive();
      if (driveRt.again) { driveRt.again = false; driveSchedule(); }
    }
  }
}
function openImportConfirm() {
  confirmSheet(null, {
    title: 'Upload imported data to Drive?',
    text: 'This device now holds data you imported or restored from a snapshot. Uploading replaces the copy in Drive. The current Drive copy is first saved in the DnD Slop folder as dnd-slop-before-import-… .json.',
    ok: 'Upload', tone: 'danger',
    run: () => { driveRun(true, { confirmed: true }); },
  });
}
// Sign-in in two steps when Google's script is not loaded yet: the first tap prepares ("Preparing sign-in…"), the second
// tap calls requestAccessToken() synchronously (a pop-up needs a fresh user gesture, so nothing may be awaited before it).
function beginSignIn(intent) {
  if (driveRt.busy || driveRt.prep === 'preparing') return;
  if (driveMod?.isReady()) { // one tap is enough
    const pr = driveMod.requestToken();
    driveRt.busy = true; driveRt.msg = ''; driveRt.prep = ''; driveRt.intent = '';
    paintDrive();
    afterToken(intent, pr, driveRt.epoch);
    return;
  }
  driveRt.prep = 'preparing'; driveRt.intent = intent; driveRt.msg = '';
  paintDrive();
  ensureDrive().then(() => driveMod.prepare()).then(() => {
    driveRt.prep = 'ready';
    paintDrive();
    const sel = { connect: '#driveStatus [data-action="driveConnect"]', sync: '#driveStrip [data-action="driveSync"], #driveStatus [data-action="driveSync"]', restore: '#driveStatus [data-action="driveRestore"]' }[intent];
    document.querySelector(sel)?.focus({ preventScroll: true });
    toast('Sign-in is ready', { sub: 'Tap the button again to sign in with Google' });
  }).catch((e) => {
    driveRt.prep = ''; driveRt.intent = '';
    driveRt.msg = driveErr(e);
    toast(driveRt.msg);
    paintDrive();
  });
}
async function afterToken(intent, pr, ep) {
  try {
    await pr;
    watchExpiry();
  } catch (e) {
    if (ep !== driveRt.epoch) return; // disconnected meanwhile
    driveRt.busy = false;
    driveRt.msg = driveErr(e);
    toast(driveRt.msg);
    paintDrive();
    return;
  }
  if (ep !== driveRt.epoch) return;
  driveRt.busy = false;
  if (intent === 'connect') {
    dv().connected = true;
    saveNow();
    toast('Connected to Google Drive');
    paintDrive();
    await driveRun(true);
  } else if (intent === 'restore') { paintDrive(); await driveRestoreGo(); } else { paintDrive(); await driveRun(true); }
}
function driveConnect() { beginSignIn('connect'); }
function driveRestore() {
  if (driveRt.busy || !driveOn()) return;
  if (!driveTokenOk()) { beginSignIn('restore'); return; }
  driveRestoreGo();
}
async function driveRestoreGo() {
  driveRt.busy = true; driveRt.msg = ''; paintDrive();
  let got = null;
  try {
    await ensureDrive();
    got = await driveMod.download(driveHost, dv());
    if (!got) toast('No save file in Drive yet');
  } catch (e) {
    driveRt.msg = driveErr(e);
    toast(driveRt.msg);
  }
  driveRt.busy = false;
  paintDrive();
  if (!got) return;
  const { data, modifiedTime, meta } = got;
  try { normalize({ ...data }); } catch { toast('The Drive file could not be read'); return; }
  replaceWithSafety(null, 'Before Drive download', {
    title: 'Restore from Drive?',
    text: `Replace everything on this device with the copy in Drive from ${meta.device}, saved ${driveTime(meta.savedAt || modifiedTime)}. The current data is saved as a snapshot first ("Before Drive download").`,
    ok: 'Restore', tone: 'danger',
  }, () => {
    replaceFromDrive(data);
    Object.assign(dv(), { lastRemoteModified: modifiedTime, lastSyncAt: new Date().toISOString(), syncedHash: dataHash(), needsConfirm: false });
    saveNow();
    toast('Restored from Drive');
  });
}
// Usable at any time, even while a sync or sign-in is in progress.
async function driveDisconnect() {
  clearTimeout(driveTimer);
  driveRt.epoch++;
  Object.assign(driveRt, { busy: false, prep: '', intent: '', again: false, from: '', msg: '', review: false });
  driveMod?.abortPending('Disconnected');
  if (sh?.kind === 'driveconflict') closeSheet(); else settleConflict('cancel');
  Object.assign(dv(), { connected: false, folderId: '', fileId: '', lastSyncAt: '', lastRemoteModified: '', syncedHash: '', backupDay: '', needsConfirm: false });
  saveNow();
  paintDrive();
  try { await ensureDrive(); await driveMod.revokeAccess(); } catch { /* revoking is best effort */ }
  toast('Disconnected from Google Drive', { sub: 'Your files in Drive stay there; delete them in Drive if you like.' });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && driveMod) paintDrive(); });

// Import: read and check the file, ask in a sheet, snapshot the current data, then replace it (normalize() migrates older backups).
async function importFile(input) {
  const file = input.files[0];
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!isBackup(data)) throw new Error('This is not a backup from this app.');
    normalize(data);
  } catch (err) {
    input.value = '';
    alert(`Import failed: ${err.message}`);
    return;
  }
  input.value = '';
  replaceWithSafety(null, 'Before import', {
    title: 'Import this backup?',
    text: 'Everything on this device is replaced with the imported backup. The current data is saved as a snapshot first, so you can restore it from Campaign & data.',
    ok: 'Import', tone: 'danger',
  }, () => {
    state = keepDriveMeta(normalize(data));
    if (driveOn()) dv().needsConfirm = true; // imported data reaches Drive only after a tap
    hashCache = null;
    clearUndo();
    render();
    saveNow();
    toast('Backup imported');
  });
}
// Confirm sheet for actions that replace all data: takes a safety snapshot first; if that fails, says so and offers a download.
function replaceWithSafety(opener, reason, c, apply) {
  let warned = false;
  confirmSheet(opener, {
    ...c,
    run: () => {
      if (!warned && !takeSnapshot(state, reason)) {
        warned = true;
        sh.c = { ...sh.c, text: 'The safety copy of your current data could not be saved (storage is full or blocked). You can download your current data first, or continue without it.', download: true, ok: 'Continue anyway' };
        renderSheet();
        return 'stay';
      }
      apply();
    },
  });
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* blocked */ }
  ta.remove();
  return ok;
}

window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { const { tab, sub } = state.ui; state = normalize(JSON.parse(e.newValue)); Object.assign(state.ui, { tab, sub }); hashCache = null; clearUndo(); render(); } catch { /* ignore */ }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(state); });
window.addEventListener('pagehide', () => save(state));

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Update banner: when a new service worker takes over a page that already had one, offer a reload (never reload on its own).
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBanner(); });
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
  // Installed apps stay open for days: check for a new version when the app comes back to the front, at most every 30 minutes.
  let lastUpdateCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastUpdateCheck < 30 * 60 * 1000) return;
    lastUpdateCheck = Date.now();
    navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  });
}
function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const b = document.createElement('div');
  b.id = 'update-banner';
  b.setAttribute('role', 'status'); // inserted empty, filled on the next tick so screen readers announce the text
  document.body.appendChild(b);
  document.body.classList.add('has-update');
  setTimeout(() => {
    if (b.isConnected) b.innerHTML = '<span class="toast-msg"><b>DnD Slop was updated</b></span><button class="toast-undo" data-action="reloadApp">Reload</button><button class="toast-open" data-action="dismissUpdate" aria-label="Dismiss update notice">&times;</button>';
  }, 100);
}

render();
if (loadInfo.unreadable) toast('Saved data couldn’t be read — a copy is in Snapshots', { ms: 15000 });
