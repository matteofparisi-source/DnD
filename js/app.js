import { ABILITIES, SKILLS, ALIGNMENTS, CONDITIONS, DAMAGE_TYPES, WEAPON_MASTERIES, XP_THRESHOLDS, mod, profBonus, fmt } from './rules.js';
import {
  PLANS_KNOWN, MAGIC_ITEMS, CANTRIPS, PREPARED, SLOTS, attunementLimit, maxSpellLevel, at, SKILL_CHOICES,
  PROFICIENCIES, ARTILLERIST_PROFICIENCIES, FEATURES, USES, ARTILLERIST_SPELLS, cannonStats, SPECIES_SUGGESTIONS, BACKGROUNDS,
} from './data/artificer.js';
import { SPELLS, SOURCE_LABEL, SCHOOLS } from './data/spells.js';
import { PLANS, PLAN_TYPES, TIERS } from './data/plans.js';
import { FEATS, FEAT_CATEGORIES, FEAT_SOURCES } from './data/feats.js';
import { KEY, load, save, uid, normalize, defaultState, backupFile, downloadFile } from './store.js';

let state = load();
const view = document.getElementById('view');
const openSessions = new Set();
let journalQuery = '';

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
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ok = save(state);
    const el = document.getElementById('saveStatus');
    if (el) { el.textContent = ok ? 'Saved' : 'Save failed: storage full or blocked'; el.classList.toggle('error', !ok); }
  }, 250);
}
function commit() { persist(); render(); }

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
    case 'subtitle': return [`Artificer${lvl() >= 3 ? ' (Artillerist)' : ''} ${lvl()}`, c.species, c.background].filter(Boolean).join(' · ');
    case 'hp': return `${c.hp.current}${num(c.hp.temp) ? ` +${c.hp.temp}` : ''} / ${maxHP()}`;
    case 'hpPct': return String(Math.max(0, Math.min(100, (num(c.hp.current) / Math.max(1, maxHP())) * 100)));
    case 'ac': return String(num(c.ac));
    case 'dc': return String(spellDC());
    case 'satk': return fmt(spellAtk());
    case 'autoHP': return String(autoMaxHP());
    case 'atk': { const a = c.attacks.find((x) => x.id === arg); return a ? fmt(attackParts(a).hit) : ''; }
    case 'dmg': { const a = c.attacks.find((x) => x.id === arg); return a ? attackParts(a).dmg : ''; }
    case 'xpNext': return lvl() >= 20 ? 'max level' : `${XP_THRESHOLDS[lvl()].toLocaleString()} XP for level ${lvl() + 1}`;
    case 'exhaustion': {
      const e = num(c.exhaustion);
      if (!e) return '';
      return e >= 6 ? 'Exhaustion 6: you die.' : `Exhaustion ${e}: −${2 * e} to all D20 Tests, −${5 * e} ft Speed.`;
    }
    default: return '';
  }
}
function attackParts(a) {
  const m = a.ability ? am(a.ability) : 0;
  const hit = m + (a.proficient ? pb() : 0) + num(a.bonus);
  const dmgMod = (a.addMod ? m : 0) + num(a.dmgBonus);
  const dmg = `${a.damage || '—'}${dmgMod ? ` ${dmgMod > 0 ? '+' : '−'} ${Math.abs(dmgMod)}` : ''}${a.firearm ? ' (+1d8 Arcane Firearm on spells)' : ''}${a.damageType ? ` ${a.damageType.toLowerCase()}` : ''}`;
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
function input(path, { type = 'text', label, cls = '', placeholder = '', list = '', min, max, rerender = false } = {}) {
  const v = getPath(path);
  const attrs = [
    `data-bind="${esc(path)}"`, type === 'number' ? 'data-type="number" inputmode="numeric"' : '',
    `type="${type}"`, `value="${esc(v)}"`, placeholder ? `placeholder="${esc(placeholder)}"` : '',
    list ? `list="${list}"` : '', min !== undefined ? `min="${min}"` : '', max !== undefined ? `max="${max}"` : '',
    rerender ? 'data-rerender' : '',
  ].join(' ');
  const el = `<input ${attrs}>`;
  return label ? `<label class="field ${cls}"><span>${esc(label)}</span>${el}</label>` : el;
}
function textarea(path, { label, rows = 4, placeholder = '' } = {}) {
  const el = `<textarea data-bind="${esc(path)}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(getPath(path))}</textarea>`;
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
  return `<label class="check" ${title ? `title="${esc(title)}"` : ''}><input type="checkbox" data-bind="${esc(path)}" data-type="bool" ${getPath(path) ? 'checked' : ''} ${rerender ? 'data-rerender' : ''}>${label ? `<span>${esc(label)}</span>` : ''}</label>`;
}
function pips(path, max, used, label = 'use') {
  let out = '';
  for (let i = 0; i < max; i++) out += `<button class="pip ${i < used ? 'on' : ''}" data-action="pip" data-path="${esc(path)}" data-i="${i}" aria-label="${esc(label)} ${i + 1}"></button>`;
  return `<span class="pips">${out || '<span class="muted">—</span>'}</span>`;
}
const calcSpan = (key, cls = '') => `<span class="${cls}" data-calc="${esc(key)}">${esc(calc(key))}</span>`;
const datalists = () => `
  <datalist id="dl-species">${SPECIES_SUGGESTIONS.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-bg">${BACKGROUNDS.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-align">${ALIGNMENTS.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-dmg">${DAMAGE_TYPES.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-mastery">${WEAPON_MASTERIES.map((c) => `<option value="${c}">`).join('')}</datalist>`;
const abilityOptions = [['', '—'], ...ABILITIES.map((a) => [a.key, a.short])];

// Filter controls. Values live in state.ui.f[page][key].
function chips(page, key, options, { multi = false } = {}) {
  const cur = F(page)[key];
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
  return `<input type="search" class="fsearch" data-filter="${page}.q" placeholder="${esc(placeholder)}" value="${esc(F(page).q || '')}">`;
}
function fcheck(page, key, label) {
  return `<label class="check"><input type="checkbox" data-filter="${page}.${key}" ${F(page)[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`;
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

// ---------- tabs ----------
const TABS = [
  ['stats', 'Stats'], ['combat', 'Combat'], ['spells', 'Spells'], ['plans', 'Plans'], ['items', 'Magic items'],
  ['feats', 'Feats'], ['selected', '★ Selected'], ['journal', 'Journal'], ['data', 'Campaign & data'],
];

function header() {
  return `
  <header class="hero">
    <div class="hero-main">
      <h1>${calcSpan('name')}</h1>
      <p class="muted">${calcSpan('subtitle')}</p>
    </div>
    <div class="hero-stats">
      <div class="chip"><b>${calcSpan('hp')}</b><small>HP</small><i class="bar" data-calc="hpPct" data-calc-attr="--pct" style="--pct:${calc('hpPct')}%"></i></div>
      <div class="chip"><b>${calcSpan('ac')}</b><small>AC</small></div>
      <div class="chip"><b>${calcSpan('dc')}</b><small>Spell DC</small></div>
      <div class="chip"><b>${calcSpan('satk')}</b><small>Spell atk</small></div>
    </div>
    <div class="hero-actions">
      <button data-action="shortRest">Short rest</button>
      <button data-action="longRest">Long rest</button>
    </div>
    <p class="warn" data-show-if="exhaustion" ${calc('exhaustion') ? '' : 'hidden'}>${calcSpan('exhaustion')}</p>
  </header>`;
}

// ----- Stats
function tabStats() {
  const c = C();
  const abilities = ABILITIES.map((a) => `
    <div class="ability ${a.key === 'int' ? 'key' : ''}">
      <span class="ab-name">${a.short}</span>
      <span class="ab-mod">${calcSpan(`mod:${a.key}`)}</span>
      ${input(`character.abilities.${a.key}`, { type: 'number', min: 1, max: 30, rerender: a.key === 'int' || a.key === 'con' })}
    </div>`).join('');
  const saves = ABILITIES.map((a) => `
    <li>${check(`character.saveProf.${a.key}`, '', { title: 'Proficient' })}<span class="grow">${a.name}${['con', 'int'].includes(a.key) ? ' <small class="muted">class</small>' : ''}</span>${calcSpan(`save:${a.key}`, 'val')}</li>`).join('');
  const chosen = SKILL_CHOICES.filter((k) => num(c.skills[k]) > 0).length;
  const skills = SKILLS.map((s) => {
    const l = num(c.skills[s.key]);
    const label = ['Not proficient', 'Proficient', 'Expertise'][l];
    const cls = SKILL_CHOICES.includes(s.key) ? '<small class="flag prepared mini" title="Artificer skill choice">A</small>' : '';
    return `<li>
      <button class="prof p${l}" data-action="cycleSkill" data-key="${s.key}" title="${label} (tap to change)" aria-label="${s.name}: ${label}"></button>
      <span class="grow">${s.name} <small class="muted">${s.ability.toUpperCase()}</small> ${cls}</span>${calcSpan(`skill:${s.key}`, 'val')}</li>`;
  }).join('');
  const feats = FEATURES.map((f) => {
    const has = lvl() >= f.lvl;
    const u = f.uses && has && usesMax(f.uses) ? `<div class="row">${pips(`character.uses.${f.uses}`, usesMax(f.uses), num(c.uses[f.uses]), f.name)}<small class="muted">${USES[f.uses].name}</small></div>` : '';
    return `<div class="feature ${has ? '' : 'locked'}">
      <div class="row tight"><span class="lvl">L${f.lvl}</span><b class="grow">${esc(f.name)}</b>${has ? '' : '<small class="muted">not yet</small>'}</div>
      <p>${esc(f.text)}</p>${u}</div>`;
  }).join('');

  return `
  <section class="card">
    <h2>Identity</h2>
    <div class="grid">
      ${input('character.name', { label: 'Character name' })}
      ${input('character.player', { label: 'Player' })}
      ${select('character.level', Array.from({ length: 20 }, (_, i) => [i + 1, `Artificer ${i + 1}${i + 1 >= 3 ? ' · Artillerist' : ''}`]), { label: 'Level', type: 'number', rerender: true })}
      ${input('character.species', { label: 'Species', list: 'dl-species', rerender: true })}
      ${input('character.background', { label: 'Background', list: 'dl-bg' })}
      ${input('character.alignment', { label: 'Alignment', list: 'dl-align' })}
      ${select('character.size', ['Small', 'Medium'], { label: 'Size' })}
      ${input('character.xp', { label: 'Experience points', type: 'number', min: 0 })}
    </div>
    <p class="hint">Next: ${calcSpan('xpNext')} · Proficiency Bonus ${calcSpan('pb')}</p>
  </section>

  <section class="card">
    <h2>Ability scores</h2>
    <p class="hint">Intelligence is your spellcasting ability: it drives spell DC, spell attacks, cannon temp HP and Flash of Genius.</p>
    <div class="abilities">${abilities}</div>
  </section>

  <div class="two-col">
    <section class="card">
      <h2>Saving throws</h2>
      <ul class="list">${saves}</ul>
      ${input('character.saveBonus', { label: 'Bonus to all saves (e.g. Cloak of Protection)', type: 'number', cls: 'wide' })}
      <h2>Senses</h2>
      <ul class="list"><li><span class="grow">Passive Perception</span>${calcSpan('passive', 'val')}</li></ul>
      <h2>Proficiencies</h2>
      <p class="hint"><b>Class:</b> ${esc(PROFICIENCIES.armor)}; ${esc(PROFICIENCIES.weapons)}${lvl() >= 3 ? `, ${esc(ARTILLERIST_PROFICIENCIES.weapons)}` : ''}.<br>
      <b>Tools:</b> ${esc(PROFICIENCIES.tools)}${lvl() >= 3 ? `; ${esc(ARTILLERIST_PROFICIENCIES.tools)}` : ''}.</p>
      ${input('character.proficiencies.tools', { label: 'Your Artisan\'s Tools & other tools', cls: 'wide' })}
      ${input('character.proficiencies.languages', { label: 'Languages', cls: 'wide' })}
      ${input('character.proficiencies.armor', { label: 'Other proficiencies (species, background, feats)', cls: 'wide' })}
    </section>
    <section class="card">
      <h2>Skills</h2>
      <p class="hint">Tap the circle: empty = none, half = proficient, full = expertise.
        <span class="flag prepared mini">A</span> = Artificer choices: pick 2 (${chosen} picked).</p>
      <ul class="list">${skills}</ul>
    </section>
  </div>

  <section class="card">
    <h2>Class features</h2>
    <p class="hint">Features you have are highlighted; tap circles to mark uses. Rests reset them.</p>
    <div class="features">${feats}</div>
  </section>

  <section class="card">
    <h2>Character</h2>
    ${textarea('character.bio.appearance', { label: 'Appearance', rows: 2 })}
    ${textarea('character.bio.personality', { label: 'Personality, ideals, bonds, flaws', rows: 3 })}
    ${textarea('character.bio.backstory', { label: 'Backstory', rows: 6 })}
    ${textarea('character.bio.allies', { label: 'Allies, house, organizations', rows: 3 })}
  </section>`;
}

// ----- Combat
function cannonPanel() {
  const c = C();
  if (lvl() < 3) return '<section class="card"><h2>Eldritch Cannon</h2><p class="muted">Unlocks at Artificer level 3 (Artillerist).</p></section>';
  const st = cannonStats(lvl(), intMod());
  const free = usesMax('cannon') - num(c.uses.cannon);
  const cannons = c.cannons.map((k, i) => `
    <div class="item cannon">
      <div class="row tight">
        <b class="grow">Cannon ${i + 1}</b>
        <span class="badge">AC ${st.ac}</span>
        <label class="field xs"><span>HP / ${st.hp}</span><input type="number" inputmode="numeric" data-bind="character.cannons.#${k.id}.hp" data-type="number" value="${esc(k.hp)}"></label>
        ${lvl() >= 9 ? `<button class="danger small" data-action="detonate" data-id="${k.id}">Detonate</button>` : ''}
        <button class="small" data-action="dismissCannon" data-id="${k.id}">Dismiss</button>
      </div>
    </div>`).join('');
  return `
  <section class="card">
    <h2>Eldritch Cannon</h2>
    <div class="row">
      <span class="counter">Free creations left: <b>${Math.max(0, free)} / ${usesMax('cannon')}</b></span>
      <span class="counter">Active: <b>${c.cannons.length} / ${st.count}</b></span>
    </div>
    <div class="row">
      <button class="ok" data-action="createCannon" data-key="free" ${free > 0 && c.cannons.length < st.count ? '' : 'disabled'}>Create (free)</button>
      <button data-action="createCannon" data-key="slot" ${c.cannons.length < st.count ? '' : 'disabled'}>Create with a spell slot</button>
    </div>
    ${cannons || '<p class="muted">No cannon deployed. Creating one takes a Magic action with Smith\'s or Woodcarver\'s Tools; it lasts 1 hour or until 0 HP.</p>'}
    <table class="ref">
      <tr><th>Mode (Bonus Action, within 60 ft; cannon may move 15 ft)</th><th>Effect</th></tr>
      <tr><td><b>Flamethrower</b> 15-ft cone</td><td>DEX save DC ${spellDC()}: ${st.flame}, half on success</td></tr>
      <tr><td><b>Force Ballista</b> 120 ft</td><td>Spell attack ${fmt(spellAtk())}: ${st.ballista}, push 5 ft</td></tr>
      <tr><td><b>Protector</b> 10 ft</td><td>Temp HP ${st.protector} to cannon and chosen creatures</td></tr>
      ${st.detonate ? `<tr><td><b>Detonate</b> (Reaction when it takes damage)</td><td>20 ft: DEX save DC ${spellDC()}, ${st.detonate}, half on success</td></tr>` : ''}
      ${lvl() >= 15 ? '<tr><td><b>Fortified Position</b></td><td>Two cannons, one Bonus Action activates both; Half Cover within 10 ft of a cannon</td></tr>' : ''}
    </table>
    <p class="hint">HP ${st.hp} (5 × level), AC ${st.ac}, immune to Poison and Psychic damage. Mending restores 2d6 HP.</p>
  </section>`;
}

function tabCombat() {
  const c = C();
  const conds = CONDITIONS.map((name) => `<button class="tag ${c.conditions.includes(name) ? 'on' : ''}" data-action="toggleCondition" data-key="${name}">${name}</button>`).join('');
  const hdLeft = Math.max(0, lvl() - num(c.hdUsed));
  const slots = SLOTS[lvl() - 1].map((n, i) => `<div class="slot"><span class="slot-lvl">${i + 1}</span>${pips(`character.slotsUsed.${i}`, n, num(c.slotsUsed[i]), `level ${i + 1} slot`)}</div>`).join('');
  const quickUses = Object.keys(USES).filter((k) => usesMax(k)).map((k) => `<li><span class="grow">${esc(USES[k].name)}</span>${pips(`character.uses.${k}`, usesMax(k), num(c.uses[k]), USES[k].name)}</li>`).join('');
  const attacks = c.attacks.map((a) => `
    <div class="item">
      <div class="item-head">
        ${input(`character.attacks.#${a.id}.name`, { placeholder: 'Weapon or attack' })}
        <span class="badge">${calcSpan(`atk:${a.id}`)} to hit</span>
        <button class="icon danger" data-action="removeAttack" data-id="${a.id}" title="Delete">✕</button>
      </div>
      <div class="row">
        ${select(`character.attacks.#${a.id}.ability`, abilityOptions, { label: 'Ability', cls: 'xs' })}
        ${input(`character.attacks.#${a.id}.bonus`, { label: 'Hit bonus', type: 'number', cls: 'xs' })}
        ${input(`character.attacks.#${a.id}.damage`, { label: 'Damage dice', placeholder: '1d8', cls: 'sm' })}
        ${input(`character.attacks.#${a.id}.dmgBonus`, { label: 'Dmg bonus', type: 'number', cls: 'xs' })}
        ${input(`character.attacks.#${a.id}.damageType`, { label: 'Type', list: 'dl-dmg', cls: 'sm' })}
        ${input(`character.attacks.#${a.id}.mastery`, { label: 'Mastery', list: 'dl-mastery', cls: 'sm' })}
        ${input(`character.attacks.#${a.id}.notes`, { label: 'Range / properties', cls: 'grow' })}
      </div>
      <div class="row">
        ${check(`character.attacks.#${a.id}.proficient`, 'Proficient')}
        ${check(`character.attacks.#${a.id}.addMod`, 'Add ability mod to damage')}
        ${lvl() >= 5 ? check(`character.attacks.#${a.id}.firearm`, 'Arcane Firearm') : ''}
        <span class="muted">Damage: ${calcSpan(`dmg:${a.id}`)}</span>
      </div>
    </div>`).join('');

  return `
  <div class="two-col">
    <section class="card">
      <h2>Hit points</h2>
      <div class="grid three">
        ${input('character.hp.current', { label: 'Current', type: 'number' })}
        ${c.hp.auto ? `<div class="field"><span>Max (auto)</span><div class="static">${calcSpan('autoHP')}</div></div>` : input('character.hp.max', { label: 'Max', type: 'number', min: 1 })}
        ${input('character.hp.temp', { label: 'Temporary', type: 'number', min: 0 })}
      </div>
      ${check('character.hp.auto', 'Calculate max HP (8 + CON at level 1, then 5 + CON per level)', { rerender: true })}
      <div class="row hp-quick">
        <input id="hpAmount" type="number" inputmode="numeric" min="0" placeholder="Amount" aria-label="Amount">
        <button class="danger" data-action="hp" data-key="damage">Damage</button>
        <button class="ok" data-action="hp" data-key="heal">Heal</button>
        <button data-action="hp" data-key="temp">Set temp</button>
      </div>
      <h3>Death saves</h3>
      <div class="row death">
        <span>Successes</span>${pips('character.deathSaves.success', 3, c.deathSaves.success, 'success')}
        <span>Failures</span>${pips('character.deathSaves.fail', 3, c.deathSaves.fail, 'failure')}
      </div>
      <h3>Hit dice</h3>
      <ul class="list"><li><span class="grow">d8</span><span class="val">${hdLeft} / ${lvl()}</span>
        <button class="small" data-action="spendHD" ${hdLeft ? '' : 'disabled'}>Spend</button></li></ul>
    </section>
    <section class="card">
      <h2>Defense</h2>
      <div class="grid three">
        ${input('character.ac', { label: 'Armor Class', type: 'number' })}
        ${input('character.speed', { label: 'Speed (ft)', type: 'number' })}
        ${input('character.initBonus', { label: 'Init bonus', type: 'number' })}
      </div>
      <p class="hint">Initiative ${calcSpan('init')} (DEX + bonus; Alert feat: add your Proficiency Bonus).</p>
      <div class="row">
        ${check('character.inspiration', 'Heroic Inspiration')}
        ${select('character.exhaustion', [0, 1, 2, 3, 4, 5, 6].map((n) => [n, `Exhaustion ${n}`]), { type: 'number' })}
      </div>
      <h3>Conditions</h3>
      <div class="tags">${conds}</div>
    </section>
  </div>
  ${cannonPanel()}
  <div class="two-col">
    <section class="card">
      <h2>Spell slots</h2>
      <p class="hint">Save DC ${spellDC()} · Spell attack ${fmt(spellAtk())}${lvl() >= 5 ? ' · Arcane Firearm: +1d8 to one damage roll' : ''}</p>
      <div class="slots">${slots}</div>
    </section>
    <section class="card">
      <h2>Limited uses</h2>
      <ul class="list">${quickUses || '<li class="muted">None at this level.</li>'}</ul>
    </section>
  </div>
  <section class="card">
    <h2>Weapons & attacks</h2>
    ${attacks || '<p class="muted">No attacks yet.</p>'}
    <button class="ghost" data-action="addAttack">+ Add attack</button>
  </section>`;
}

// ----- Spells
function spellsList() {
  const f = F('spells');
  const list = SPELLS.filter((s) => {
    const st = spellStatus(s);
    if (s.source === 'legacy' && !f.legacy) return false;
    if (s.source === 'artillerist' && st !== 'always' && !f.showLocked) return false;
    if (f.level !== undefined && f.level !== '' && String(s.level) !== String(f.level)) return false;
    if (f.status === 'selected' && !['always', 'prepared', 'known'].includes(st)) return false;
    if (f.status === 'prepared' && !['prepared', 'known'].includes(st)) return false;
    if (f.status === 'always' && st !== 'always') return false;
    if (f.status === 'none' && st !== 'none') return false;
    if (f.school && s.school !== f.school) return false;
    if (f.conc && !s.flags.includes('C')) return false;
    if (f.ritual && !s.flags.includes('R')) return false;
    if (!f.showLocked && !castable(s)) return false;
    return matchQ('spells', s.name, s.school, SOURCE_LABEL[s.source], C().spellNotes[s.id]);
  }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  if (!list.length) return '<p class="muted">No spell matches these filters.</p>';
  return list.map((s) => {
    const st = spellStatus(s);
    const ok = castable(s);
    const btn = st === 'always'
      ? '<button class="small" disabled>Always</button>'
      : `<button class="small ${st === 'none' ? '' : 'ok'}" data-action="toggleSpell" data-id="${s.id}" ${ok ? '' : 'disabled'}>${st === 'none' ? (s.level ? 'Prepare' : 'Learn') : (s.level ? 'Unprepare' : 'Forget')}</button>`;
    return `<div class="item spell ${st !== 'none' ? 'sel' : ''} ${ok ? '' : 'locked'}">
      <div class="row tight">
        ${lvlTag(s.level)}
        <b class="grow">${esc(s.name)}</b>
        ${btn}
      </div>
      <div class="row tight tags-row">
        ${statusTag(st === 'known' ? 'known' : st)}
        <span class="tag-s">${esc(s.school)}</span>
        ${s.flags.includes('C') ? '<span class="tag-s c">Concentration</span>' : ''}
        ${s.flags.includes('R') ? '<span class="tag-s r">Ritual</span>' : ''}
        <span class="tag-s src">${esc(SOURCE_LABEL[s.source])}</span>
        ${ok ? '' : `<span class="tag-s">needs level ${s.level} slots</span>`}
      </div>
      ${st !== 'none' ? `<input class="note" data-bind="character.spellNotes.${s.id}" value="${esc(C().spellNotes[s.id] || '')}" placeholder="Your notes (range, damage, reminders)">` : ''}
    </div>`;
  }).join('');
}
function tabSpells() {
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
    <p class="hint">Always-prepared spells (Artillerist and Mending) don't count against your prepared total. You can change prepared spells after a Long Rest.</p>
    <div class="filters">
      ${fsearch('spells', 'Search spells…')}
      ${chips('spells', 'level', [['', 'All levels'], [0, 'Cantrip'], ...Array.from({ length: 5 }, (_, i) => [i + 1, `Lv ${i + 1}`])])}
      ${chips('spells', 'status', [['', 'Any status'], ['selected', '★ Selected'], ['prepared', 'Prepared'], ['always', 'Always'], ['none', 'Not prepared']])}
      <div class="row">
        ${fselect('spells', 'school', [['', 'Any school'], ...SCHOOLS.map((s) => [s, s])], 'School')}
        ${fcheck('spells', 'conc', 'Concentration')}
        ${fcheck('spells', 'ritual', 'Ritual')}
        ${fcheck('spells', 'showLocked', 'Show spells above my level')}
        ${fcheck('spells', 'legacy', "Include Tasha's/Xanathar's legacy spells")}
      </div>
    </div>
    <div id="list">${spellsList()}</div>
    <p class="hint">The list follows the 2025 Forge of the Artificer Artificer, taken from a community transcription. "Legacy" spells were on the 2020 Tasha's Artificer list but aren't on the 2025 list: use them only if your DM agrees.</p>
  </section>`;
}

// ----- Plans
function plansList() {
  const f = F('plans');
  const list = allPlans().filter((p) => {
    const known = planKnown(p);
    if (p.generic && f.status === 'known') return false;
    if (f.tier && String(p.tier) !== String(f.tier)) return false;
    if (f.type && p.type !== f.type) return false;
    if (f.attune === 'yes' && p.attune !== true) return false;
    if (f.attune === 'no' && p.attune !== false) return false;
    if (f.status === 'known' && !known) return false;
    if (f.status === 'unknown' && (known || p.custom)) return false;
    if (f.available && p.tier > lvl()) return false;
    return matchQ('plans', p.name, p.type, p.base);
  }).sort((a, b) => a.tier - b.tier || (a.generic - b.generic) || a.name.localeCompare(b.name));
  if (!list.length) return '<p class="muted">No plan matches these filters.</p>';
  return list.map((p) => {
    const known = planKnown(p);
    const avail = p.tier <= lvl();
    const made = C().items.filter((i) => i.planId === p.id).length;
    let actions;
    if (p.generic) actions = `<button class="small" data-action="learnGeneric" data-id="${p.id}" ${avail ? '' : 'disabled'}>+ Learn an item</button>`;
    else actions = `
      ${known ? `<button class="small ok" data-action="craft" data-id="${p.id}">Create</button>` : ''}
      <button class="small ${known ? '' : 'ok'}" data-action="togglePlan" data-id="${p.id}" ${avail || known ? '' : 'disabled'}>${known ? (p.custom ? 'Remove' : 'Forget') : 'Learn'}</button>`;
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
  }).join('');
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
      ${chips('plans', 'tier', [['', 'All tiers'], ...TIERS.map((t) => [t, `Level ${t}+`])])}
      ${chips('plans', 'status', [['', 'All'], ['known', '★ Known'], ['unknown', 'Not known']])}
      <div class="row">
        ${fselect('plans', 'type', [['', 'Any type'], ...PLAN_TYPES.map((t) => [t, t])], 'Type')}
        ${fselect('plans', 'attune', [['', 'Any'], ['yes', 'Requires attunement'], ['no', 'No attunement']], 'Attunement')}
        ${fcheck('plans', 'available', 'Only plans I can learn now')}
      </div>
    </div>
    <div id="list">${plansList()}</div>
  </section>`;
}

// ----- Magic items
const ORIGINS = [['replicated', 'Replicated (plan)'], ['found', 'Found / loot'], ['bought', 'Bought'], ['reward', 'Reward / gift']];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
function itemsList() {
  const f = F('items');
  const list = C().items.filter((i) => {
    if (f.origin && i.origin !== f.origin) return false;
    if (f.status === 'attuned' && !i.attuned) return false;
    if (f.status === 'equipped' && !i.equipped) return false;
    if (f.status === 'needsAttune' && !(i.needsAttune && !i.attuned)) return false;
    if (f.rarity && i.rarity !== f.rarity) return false;
    if (f.type && i.type !== f.type) return false;
    return matchQ('items', i.name, i.notes, i.type, i.rarity);
  });
  if (!list.length) return `<p class="muted">${C().items.length ? 'No item matches these filters.' : 'No magic items yet. Create one from the Plans tab or add a found item.'}</p>`;
  return list.map((i) => {
    const p = `character.items.#${i.id}`;
    return `<div class="item ${i.attuned || i.equipped ? 'sel' : ''}">
      <div class="item-head">
        ${input(`${p}.name`, { placeholder: 'Item name' })}
        <button class="icon danger" data-action="removeItem" data-id="${i.id}" title="Delete">✕</button>
      </div>
      <div class="row tight tags-row">
        ${i.attuned ? '<span class="flag always">Attuned</span>' : ''}
        ${i.equipped ? '<span class="flag prepared">Equipped</span>' : ''}
        ${i.needsAttune && !i.attuned ? '<span class="flag none">Needs attunement</span>' : ''}
        <span class="tag-s src">${esc(ORIGINS.find((o) => o[0] === i.origin)?.[1] || i.origin)}</span>
      </div>
      <div class="row">
        ${select(`${p}.origin`, ORIGINS, { label: 'Origin', cls: 'sm', rerender: true })}
        ${select(`${p}.type`, PLAN_TYPES.filter((t) => t !== 'Any').concat(['Potion', 'Scroll', 'Staff', 'Rod', 'Other']), { label: 'Type', cls: 'sm', rerender: true })}
        ${select(`${p}.rarity`, RARITIES, { label: 'Rarity', cls: 'sm', rerender: true })}
        ${input(`${p}.charges`, { label: 'Charges', type: 'number', min: 0, cls: 'xs' })}
        ${input(`${p}.chargesMax`, { label: 'Max', type: 'number', min: 0, cls: 'xs' })}
      </div>
      <div class="row">
        ${check(`${p}.needsAttune`, 'Requires attunement', { rerender: true })}
        ${i.needsAttune ? check(`${p}.attuned`, 'Attuned', { rerender: true }) : ''}
        ${check(`${p}.equipped`, 'Equipped / carried', { rerender: true })}
      </div>
      ${textarea(`${p}.notes`, { rows: 2, placeholder: 'What it does, command words, where you found it…' })}
    </div>`;
  }).join('');
}
function tabItems() {
  return `
  <section class="card">
    <h2>Magic items</h2>
    <div class="row">
      ${counter(attunedCount(), attunementLimit(lvl()), 'Attuned')}
      ${lvl() >= 2 ? counter(replicated().length, at(MAGIC_ITEMS, lvl()), 'Replicated') : ''}
    </div>
    <div class="filters">
      ${fsearch('items', 'Search items…')}
      ${chips('items', 'status', [['', 'All'], ['attuned', '★ Attuned'], ['equipped', 'Equipped'], ['needsAttune', 'Not yet attuned']])}
      <div class="row">
        ${fselect('items', 'origin', [['', 'Any origin'], ...ORIGINS], 'Origin')}
        ${fselect('items', 'type', [['', 'Any type'], ...PLAN_TYPES.filter((t) => t !== 'Any').concat(['Potion', 'Scroll', 'Staff', 'Rod', 'Other']).map((t) => [t, t])], 'Type')}
        ${fselect('items', 'rarity', [['', 'Any rarity'], ...RARITIES.map((r) => [r, r])], 'Rarity')}
      </div>
    </div>
    <div id="list">${itemsList()}</div>
    <button class="ghost" data-action="addItem">+ Add found item</button>
  </section>
  <section class="card">
    <h2>Coins & other gear</h2>
    <div class="row">${['cp', 'sp', 'ep', 'gp', 'pp'].map((k) => input(`character.coins.${k}`, { label: k.toUpperCase(), type: 'number', min: 0, cls: 'xs' })).join('')}</div>
    ${textarea('character.gear', { label: 'Mundane equipment (tools, pack, armor…)', rows: 5 })}
  </section>`;
}

// ----- Feats
function featsList() {
  const f = F('feats');
  const list = FEATS.filter((ft) => {
    const taken = hasFeat(ft.id);
    if (f.cat && ft.cat !== f.cat) return false;
    if (f.src && ft.src !== f.src) return false;
    if (f.status === 'taken' && !taken) return false;
    if (f.status === 'available' && (taken && !ft.repeatable)) return false;
    if (f.eligible && !meetsReq(ft)) return false;
    return matchQ('feats', ft.name, ft.sum, ft.cat, ft.src);
  });
  if (!list.length) return '<p class="muted">No feat matches these filters.</p>';
  return list.map((ft) => {
    const taken = C().feats.filter((x) => x.featId === ft.id);
    const ok = meetsReq(ft);
    return `<div class="item ${taken.length ? 'sel' : ''} ${ok || taken.length ? '' : 'locked'}">
      <div class="row tight">
        <b class="grow">${esc(ft.name)}</b>
        ${(!taken.length || ft.repeatable) ? `<button class="small ${ok ? 'ok' : ''}" data-action="takeFeat" data-id="${ft.id}">${taken.length ? 'Take again' : 'Take'}</button>` : ''}
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
          <button class="icon danger" data-action="dropFeat" data-id="${t.id}" title="Remove">✕</button>
        </div>`).join('')}
    </div>`;
  }).join('');
}
function tabFeats() {
  return `
  <section class="card">
    <h2>Feats</h2>
    <div class="row">${counter(C().feats.length, featSlots(), 'Feats taken')}</div>
    <p class="hint">You get an Origin feat from your background (in Eberron a Dragonmark can replace it), then a feat at levels 4, 8, 12, 16 and an Epic Boon at 19. Sources: Player's Handbook 2024, Tasha's, Xanathar's, Forge of the Artificer. Where a Tasha's/Xanathar's feat was reprinted in the 2024 PHB, only the 2024 version is listed. Summaries are short reminders: check the book for exact rules.</p>
    <div class="filters">
      ${fsearch('feats', 'Search feats…')}
      ${chips('feats', 'cat', [['', 'All'], ...FEAT_CATEGORIES.map((c) => [c, c])])}
      ${chips('feats', 'status', [['', 'Any'], ['taken', '★ Taken'], ['available', 'Not taken']])}
      <div class="row">
        ${fselect('feats', 'src', [['', 'Any book'], ...FEAT_SOURCES.map((s) => [s, s])], 'Source')}
        ${fcheck('feats', 'eligible', 'Only feats I qualify for')}
      </div>
    </div>
    <div id="list">${featsList()}</div>
  </section>`;
}

// ----- Selected (everything chosen / prepared)
function tabSelected() {
  const c = C();
  const spells = SPELLS.filter((s) => spellStatus(s) !== 'none').sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const byLevel = [0, 1, 2, 3, 4, 5].map((l) => {
    const sp = spells.filter((s) => s.level === l);
    if (!sp.length) return '';
    return `<div class="sel-group">${lvlTag(l)} ${sp.map((s) => `<span class="pill ${spellStatus(s)}">${esc(s.name)}${s.flags.includes('C') ? ' <small>C</small>' : ''}${s.flags.includes('R') ? ' <small>R</small>' : ''}</span>`).join('')}</div>`;
  }).join('');
  const plans = knownPlans().map((p) => `<span class="pill">${esc(p.name)} <small>L${p.tier}+</small></span>`).join('');
  const items = c.items.map((i) => `<span class="pill ${i.attuned ? 'always' : ''}">${esc(i.name || 'Unnamed item')}${i.attuned ? ' <small>attuned</small>' : ''}${i.chargesMax ? ` <small>${num(i.charges)}/${num(i.chargesMax)}</small>` : ''}</span>`).join('');
  const feats = c.feats.map((t) => { const ft = featById(t.featId); return `<span class="pill">${esc(ft?.name || t.featId)} <small>L${esc(t.level)}</small>${t.notes ? ` <small>${esc(t.notes)}</small>` : ''}</span>`; }).join('');
  const skills = SKILLS.filter((s) => num(c.skills[s.key])).map((s) => `<span class="pill">${s.name} ${calcSpan(`skill:${s.key}`)}</span>`).join('');
  const section = (title, tab, count, body) => `
    <section class="card">
      <div class="row tight"><h2 class="grow">${title}</h2>${count}<button class="small" data-action="tab" data-key="${tab}">Open</button></div>
      ${body || '<p class="muted">Nothing selected yet.</p>'}
    </section>`;
  return `
  ${section('Spells', 'spells', `${counter(preparedCount(), at(PREPARED, lvl()), 'Prepared')} ${counter(cantripCount(), at(CANTRIPS, lvl()), 'Cantrips')}`,
    byLevel && `${byLevel}<p class="hint"><span class="pill always">Always prepared</span> <span class="pill prepared">Prepared / known</span> C = Concentration, R = Ritual</p>`)}
  ${lvl() >= 2 ? section('Known plans', 'plans', counter(knownPlans().length, at(PLANS_KNOWN, lvl()), 'Known'), plans && `<div class="sel-group">${plans}</div>`) : ''}
  ${section('Magic items', 'items', counter(attunedCount(), attunementLimit(lvl()), 'Attuned'), items && `<div class="sel-group">${items}</div>`)}
  ${section('Feats', 'feats', counter(c.feats.length, featSlots(), 'Taken'), feats && `<div class="sel-group">${feats}</div>`)}
  ${section('Skill proficiencies', 'stats', '', skills && `<div class="sel-group">${skills}</div>`)}
  ${c.conditions.length ? section('Active conditions', 'combat', '', `<div class="sel-group">${c.conditions.map((x) => `<span class="pill always">${x}</span>`).join('')}</div>`) : ''}`;
}

// ----- Journal
function sessionMatches(s, q) {
  if (!q) return true;
  return ['title', 'summary', 'notes', 'loot', 'followUps', 'ingameDate', 'date', 'number'].some((k) => String(s[k] ?? '').toLowerCase().includes(q));
}
function journalList() {
  const q = journalQuery.trim().toLowerCase();
  const list = [...state.sessions].sort((a, b) => num(b.number) - num(a.number)).filter((s) => sessionMatches(s, q));
  if (!list.length) return `<p class="muted">${state.sessions.length ? 'No session matches your search.' : 'No sessions yet.'}</p>`;
  return list.map((s) => {
    const p = `sessions.#${s.id}`;
    return `
    <details class="item session" data-session="${s.id}" ${openSessions.has(s.id) ? 'open' : ''}>
      <summary><span class="badge">#${esc(s.number)}</span><b class="grow">${esc(s.title || 'Untitled session')}</b><small class="muted">${esc(s.date || '')}</small></summary>
      <div class="grid">
        ${input(`${p}.number`, { label: 'Session #', type: 'number', min: 0 })}
        ${input(`${p}.date`, { label: 'Real date', type: 'date' })}
        ${input(`${p}.ingameDate`, { label: 'In-game date / location' })}
        ${input(`${p}.title`, { label: 'Title' })}
      </div>
      ${textarea(`${p}.summary`, { label: 'Summary', rows: 3 })}
      ${textarea(`${p}.notes`, { label: 'Notes', rows: 8, placeholder: 'NPCs, places, clues, quotes…' })}
      ${textarea(`${p}.loot`, { label: 'Loot & XP', rows: 2 })}
      ${textarea(`${p}.followUps`, { label: 'To remember / open threads', rows: 3 })}
      <button class="danger small" data-action="removeSession" data-id="${s.id}">Delete session</button>
    </details>`;
  }).join('');
}
function tabJournal() {
  return `
  <section class="card">
    <div class="row"><h2 class="grow">Session journal</h2><button data-action="addSession">+ New session</button></div>
    <input id="journalSearch" type="search" placeholder="Search all sessions…" value="${esc(journalQuery)}">
    <div id="journalList">${journalList()}</div>
  </section>`;
}

// ----- Campaign & data
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
  </section>`;
}

const RENDER = { stats: tabStats, combat: tabCombat, spells: tabSpells, plans: tabPlans, items: tabItems, feats: tabFeats, selected: tabSelected, journal: tabJournal, data: tabData };
const LIST_RENDER = { spells: spellsList, plans: plansList, items: itemsList, feats: featsList };

function render() {
  const tab = RENDER[state.ui.tab] ? state.ui.tab : 'stats';
  const y = window.scrollY;
  const focused = document.activeElement?.dataset?.bind || document.activeElement?.dataset?.filter;
  view.innerHTML = `
    ${header()}
    <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="${k === tab ? 'active' : ''}" aria-selected="${k === tab}" data-action="tab" data-key="${k}">${t}</button>`).join('')}</nav>
    <main>${RENDER[tab]()}</main>
    <footer class="muted"><span id="saveStatus">Saved</span> · Artificer (Forge of the Artificer) · D&D 2024 rules</footer>
    ${datalists()}`;
  window.scrollTo(0, y);
  if (focused) {
    const el = [...view.querySelectorAll('[data-bind],[data-filter]')].find((x) => (x.dataset.bind || x.dataset.filter) === focused);
    el?.focus({ preventScroll: true });
  }
  view.querySelector('.tabs .active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (tab === 'data') showPersistInfo();
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
function rest(kind) {
  const c = C();
  if (kind === 'short') {
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
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function useSlot() {
  const c = C();
  const avail = SLOTS[lvl() - 1].map((n, i) => n - num(c.slotsUsed[i]));
  const lowest = avail.findIndex((n) => n > 0);
  if (lowest < 0) { alert('No spell slots left.'); return false; }
  const options = avail.map((n, i) => (n > 0 ? i + 1 : null)).filter(Boolean);
  const ans = prompt(`Spend which spell slot level? Available: ${options.join(', ')}`, String(options[0]));
  if (ans === null) return false;
  const l = Number(ans);
  if (!options.includes(l)) { alert('That slot level is not available.'); return false; }
  c.slotsUsed[l - 1] = num(c.slotsUsed[l - 1]) + 1;
  return true;
}

const actions = {
  tab: (el) => { state.ui.tab = el.dataset.key; commit(); window.scrollTo(0, 0); },
  filter: (el) => {
    const f = F(el.dataset.page);
    const key = el.dataset.key;
    const val = el.dataset.val;
    f[key] = String(f[key] ?? '') === val ? '' : val;
    persist();
    // re-render filter chips + list
    render();
  },
  cycleSkill: (el) => { const k = el.dataset.key; C().skills[k] = (num(C().skills[k]) + 1) % 3; commit(); },
  toggleCondition: (el) => {
    const c = C(); const k = el.dataset.key;
    c.conditions = c.conditions.includes(k) ? c.conditions.filter((x) => x !== k) : [...c.conditions, k];
    commit();
  },
  pip: (el) => {
    const i = Number(el.dataset.i);
    const used = num(getPath(el.dataset.path));
    setPath(el.dataset.path, used > i ? i : i + 1);
    commit();
  },
  hp: (el) => {
    const amtEl = document.getElementById('hpAmount');
    const amt = Math.max(0, Math.floor(num(amtEl.value)));
    if (!amt && el.dataset.key !== 'temp') return amtEl.focus();
    const hp = C().hp;
    if (el.dataset.key === 'damage') {
      const fromTemp = Math.min(num(hp.temp), amt);
      hp.temp = num(hp.temp) - fromTemp;
      hp.current = Math.max(0, num(hp.current) - (amt - fromTemp));
    } else if (el.dataset.key === 'heal') {
      hp.current = Math.min(maxHP(), num(hp.current) + amt);
      if (hp.current > 0) C().deathSaves = { success: 0, fail: 0 };
    } else hp.temp = amt; // temp HP don't stack
    commit();
  },
  spendHD: () => {
    const conMod = am('con');
    const answer = prompt(`Roll 1d8 and type the result (CON ${fmt(conMod)} is added).\nLeave empty to roll for you.`, '');
    if (answer === null) return;
    const roll = answer.trim() === '' ? 1 + Math.floor(Math.random() * 8) : Math.max(1, Math.min(8, Math.floor(num(answer))));
    const gained = Math.max(0, roll + conMod);
    C().hdUsed = num(C().hdUsed) + 1;
    C().hp.current = Math.min(maxHP(), num(C().hp.current) + gained);
    commit();
    toast(`Rolled ${roll} ${fmt(conMod)} → +${gained} HP`);
  },
  shortRest: () => {
    const extra = lvl() >= 20 ? ' Magical Guidance restores all Flash of Genius uses if you are attuned to an item.' : lvl() >= 14 ? ' Refreshed Genius restores one Flash of Genius use.' : '';
    if (!confirm(`Short rest. Spend Hit Dice on the Combat tab.${extra}`)) return;
    rest('short'); state.ui.tab = 'combat'; commit(); toast('Short rest done');
  },
  longRest: () => {
    if (!confirm('Long rest: full HP, all Hit Dice and spell slots, all feature uses, cannons removed, Exhaustion −1. Then you can change prepared spells and create items from your plans.')) return;
    rest('long'); commit(); toast('Long rest done');
  },
  createCannon: (el) => {
    const c = C();
    if (el.dataset.key === 'free') c.uses.cannon = num(c.uses.cannon) + 1;
    else if (!useSlot()) return;
    c.cannons.push({ id: uid(), hp: 5 * lvl() });
    commit();
  },
  dismissCannon: (el) => { C().cannons = C().cannons.filter((k) => k.id !== el.dataset.id); commit(); },
  detonate: (el) => {
    if (!confirm(`Detonate: each creature within 20 ft makes a DEX save (DC ${spellDC()}), 3d10 Force damage, half on success. The cannon is destroyed.`)) return;
    actions.dismissCannon(el);
  },
  addAttack: () => {
    C().attacks.push({ id: uid(), name: '', ability: 'dex', proficient: true, bonus: 0, damage: '1d8', dmgBonus: 0, addMod: true, damageType: 'Piercing', mastery: '', notes: '', firearm: false });
    commit();
  },
  removeAttack: (el) => {
    const a = C().attacks.find((x) => x.id === el.dataset.id);
    if (a?.name && !confirm(`Delete "${a.name}"?`)) return;
    C().attacks = C().attacks.filter((x) => x.id !== el.dataset.id); commit();
  },
  toggleSpell: (el) => {
    const s = SPELLS.find((x) => x.id === el.dataset.id);
    const sp = C().spells;
    if (sp[s.id]) delete sp[s.id];
    else {
      const max = s.level === 0 ? at(CANTRIPS, lvl()) : at(PREPARED, lvl());
      const cur = s.level === 0 ? cantripCount() : preparedCount();
      if (cur >= max && !confirm(`You already have ${cur} of ${max} ${s.level === 0 ? 'cantrips' : 'prepared spells'}. Add anyway?`)) return;
      sp[s.id] = s.level === 0 ? 'known' : 'prepared';
    }
    persist(); render();
  },
  togglePlan: (el) => {
    const c = C();
    const custom = c.plans.custom.find((p) => p.id === el.dataset.id);
    if (custom) {
      if (!confirm(`Remove the plan "${custom.name}"? Items made from it vanish.`)) return;
      c.plans.custom = c.plans.custom.filter((p) => p.id !== custom.id);
      c.items = c.items.filter((i) => i.planId !== custom.id || i.origin !== 'replicated');
    } else if (c.plans.known[el.dataset.id]) {
      const made = c.items.filter((i) => i.planId === el.dataset.id && i.origin === 'replicated');
      if (made.length && !confirm('Items made from this plan vanish when you replace it. Continue?')) return;
      delete c.plans.known[el.dataset.id];
      c.items = c.items.filter((i) => !(i.planId === el.dataset.id && i.origin === 'replicated'));
    } else {
      const max = at(PLANS_KNOWN, lvl());
      if (knownPlans().length >= max && !confirm(`You already know ${knownPlans().length} of ${max} plans. Learn anyway?`)) return;
      c.plans.known[el.dataset.id] = true;
    }
    commit();
  },
  learnGeneric: (el) => {
    const base = PLANS.find((p) => p.id === el.dataset.id);
    const name = prompt(`Which item? (${base.name})`, '');
    if (!name?.trim()) return;
    const max = at(PLANS_KNOWN, lvl());
    if (knownPlans().length >= max && !confirm(`You already know ${knownPlans().length} of ${max} plans. Learn anyway?`)) return;
    C().plans.custom.push({ id: uid(), custom: true, tier: base.tier, name: name.trim(), type: base.type === 'Any' ? 'Wondrous' : base.type, attune: null, base: base.name });
    commit();
  },
  craft: (el) => {
    const c = C();
    const plan = allPlans().find((p) => p.id === el.dataset.id);
    const max = at(MAGIC_ITEMS, lvl());
    const reps = replicated();
    if (reps.length >= max) {
      if (!confirm(`You already have ${reps.length} of ${max} replicated items. The oldest (${reps[0].name}) vanishes. Continue?`)) return;
      c.items = c.items.filter((i) => i.id !== reps[0].id);
    }
    const rarity = plan.tier >= 14 ? 'Rare' : 'Uncommon';
    c.items.push({ id: uid(), name: plan.name, origin: 'replicated', planId: plan.id, type: plan.type === 'Any' ? 'Other' : plan.type, rarity, needsAttune: plan.attune === true, attuned: false, equipped: true, charges: 0, chargesMax: 0, notes: '' });
    commit();
    toast(`${plan.name} created: set rarity/charges on Magic items`);
  },
  addItem: () => {
    C().items.push({ id: uid(), name: '', origin: 'found', planId: '', type: 'Wondrous', rarity: 'Uncommon', needsAttune: false, attuned: false, equipped: false, charges: 0, chargesMax: 0, notes: '' });
    commit();
  },
  removeItem: (el) => {
    const it = C().items.find((x) => x.id === el.dataset.id);
    if (it?.name && !confirm(`Delete "${it.name}"?`)) return;
    C().items = C().items.filter((x) => x.id !== el.dataset.id); commit();
  },
  takeFeat: (el) => {
    const ft = featById(el.dataset.id);
    if (!meetsReq(ft) && !confirm(`You don't seem to meet the prerequisite (${reqText(ft)}). Take it anyway?`)) return;
    C().feats.push({ id: uid(), featId: ft.id, level: lvl(), notes: '' });
    commit();
  },
  dropFeat: (el) => {
    if (!confirm('Remove this feat?')) return;
    C().feats = C().feats.filter((x) => x.id !== el.dataset.id); commit();
  },
  addSession: () => {
    const next = state.sessions.reduce((m, s) => Math.max(m, num(s.number)), 0) + 1;
    const s = { id: uid(), number: next, date: new Date().toISOString().slice(0, 10), ingameDate: '', title: '', summary: '', notes: '', loot: '', followUps: '' };
    state.sessions.push(s); openSessions.add(s.id); journalQuery = '';
    commit();
  },
  removeSession: (el) => {
    if (!confirm('Delete this session and its notes?')) return;
    state.sessions = state.sessions.filter((s) => s.id !== el.dataset.id); commit();
  },
  export: () => downloadFile(backupFile(state)),
  share: async () => {
    const file = backupFile(state);
    try { await navigator.share({ files: [file], title: file.name }); } catch (e) { if (e.name !== 'AbortError') downloadFile(file); }
  },
  reset: () => {
    if (!confirm('Delete your character, campaign and all sessions from this device? Export a backup first if unsure.')) return;
    if (!confirm('Really delete everything? This cannot be undone.')) return;
    state = defaultState(); commit();
  },
};

// ---------- events ----------
view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action] && !el.disabled) { e.preventDefault(); actions[el.dataset.action](el); }
});
function readValue(el) {
  if (el.dataset.type === 'bool') return el.checked;
  if (el.dataset.type === 'number') return el.value === '' ? 0 : num(el.value);
  return el.value;
}
view.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'journalSearch') { journalQuery = el.value; document.getElementById('journalList').innerHTML = journalList(); return; }
  if (el.dataset.filter) {
    const [page, key] = el.dataset.filter.split('.');
    F(page)[key] = el.type === 'checkbox' ? el.checked : el.value;
    persist();
    renderList();
    return;
  }
  if (!el.dataset.bind) return;
  const before = maxHP();
  const wasFull = num(C().hp.current) >= before;
  setPath(el.dataset.bind, readValue(el));
  // Leveling up or raising CON while at full HP keeps you at full HP.
  if (wasFull && maxHP() !== before && el.dataset.bind !== 'character.hp.current') C().hp.current = maxHP();
  persist();
  refreshDerived();
});
view.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'importFile') return importFile(el.files[0]);
  if (el.dataset.bind && (el.hasAttribute('data-rerender') || el.type === 'checkbox' || el.tagName === 'SELECT')) setTimeout(render, 0);
});
view.addEventListener('toggle', (e) => {
  const id = e.target.dataset?.session;
  if (!id) return;
  if (e.target.open) openSessions.add(id); else openSessions.delete(id);
}, true);

async function importFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !data.character) throw new Error('This is not a backup from this app.');
    if (!confirm('Replace everything on this device with the imported backup?')) return;
    state = normalize(data);
    commit();
    toast('Backup imported');
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
}

window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { const tab = state.ui.tab; state = normalize(JSON.parse(e.newValue)); state.ui.tab = tab; render(); } catch { /* ignore */ }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(state); });
window.addEventListener('pagehide', () => save(state));

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
}

render();
