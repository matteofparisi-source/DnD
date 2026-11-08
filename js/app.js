import {
  ABILITIES, SKILLS, CLASSES, SPECIES, BACKGROUNDS, ALIGNMENTS, CONDITIONS, DAMAGE_TYPES,
  WEAPON_MASTERIES, FULL_CASTER_SLOTS, PACT_SLOTS, XP_THRESHOLDS, mod, profBonus, fmt, casterLevel,
} from './rules.js';
import { load, save, uid, normalize, defaultState, exportJSON } from './store.js';

let state = load();
const view = document.getElementById('view');
const openSessions = new Set();
let journalQuery = '';

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = () => state.character;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

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
    if (el) {
      el.textContent = ok ? 'Saved' : 'Save failed: storage full or blocked';
      el.classList.toggle('error', !ok);
    }
  }, 250);
}
function commit(rerender = true) {
  persist();
  if (rerender) render(); else refreshDerived();
}

// ---------- derived values ----------
const totalLevel = () => Math.max(1, C().classes.reduce((s, c) => s + num(c.level), 0));
const pb = () => profBonus(totalLevel());
const am = (k) => mod(C().abilities[k]);
const saveMod = (k) => am(k) + (C().saveProf[k] ? pb() : 0) + num(C().saveBonus);
function skillMod(key) {
  const sk = SKILLS.find((s) => s.key === key);
  const lvl = num(C().skills[key]);
  let bonus = lvl * pb();
  if (lvl === 0 && C().jackOfAllTrades) bonus = Math.floor(pb() / 2);
  return am(sk.ability) + bonus;
}
function spellAbility() {
  if (C().spellcasting.ability) return C().spellcasting.ability;
  const caster = C().classes.find((c) => CLASSES[c.name]?.spellAbility);
  return caster ? CLASSES[caster.name].spellAbility : '';
}
function attackParts(a) {
  const m = a.ability ? am(a.ability) : 0;
  const hit = m + (a.proficient ? pb() : 0) + num(a.bonus);
  const dmgMod = (a.addMod ? m : 0) + num(a.dmgBonus);
  const dmg = `${a.damage || '—'}${dmgMod ? ` ${dmgMod > 0 ? '+' : '−'} ${Math.abs(dmgMod)}` : ''}${a.damageType ? ` ${a.damageType.toLowerCase()}` : ''}`;
  return { hit, dmg };
}
const sizeMultiplier = { Tiny: 7.5, Small: 15, Medium: 15, Large: 30, Huge: 60, Gargantuan: 120 };
const carryWeight = () => C().inventory.reduce((s, i) => s + num(i.weight) * num(i.qty || 1), 0)
  + Object.values(C().coins).reduce((s, n) => s + num(n), 0) / 50; // 50 coins weigh 1 lb
const classSummary = () => C().classes.map((c) => `${c.name || '?'}${c.subclass ? ` (${c.subclass})` : ''} ${c.level}`).join(' / ');

function calc(key) {
  const [kind, arg] = key.split(':');
  const c = C();
  switch (kind) {
    case 'mod': return fmt(am(arg));
    case 'save': return fmt(saveMod(arg));
    case 'skill': return fmt(skillMod(arg));
    case 'pb': return fmt(pb());
    case 'level': return String(totalLevel());
    case 'init': return fmt(am('dex') + num(c.initBonus));
    case 'passive': return String(10 + skillMod('perception'));
    case 'classSummary': return classSummary();
    case 'name': return c.name || 'Unnamed hero';
    case 'subtitle': return [classSummary(), c.species, c.background].filter(Boolean).join(' · ');
    case 'ac': return String(num(c.ac));
    case 'hp': return `${c.hp.current}${num(c.hp.temp) ? ` +${c.hp.temp}` : ''} / ${c.hp.max}`;
    case 'hpPct': return String(Math.max(0, Math.min(100, (num(c.hp.current) / Math.max(1, num(c.hp.max))) * 100)));
    case 'spellDC': { const a = spellAbility(); return a ? String(8 + pb() + am(a) + num(c.spellcasting.bonusDC)) : '—'; }
    case 'spellAtk': { const a = spellAbility(); return a ? fmt(pb() + am(a) + num(c.spellcasting.bonusAttack)) : '—'; }
    case 'spellAbility': { const a = spellAbility(); return a ? a.toUpperCase() : 'none'; }
    case 'atk': { const a = c.attacks.find((x) => x.id === arg); return a ? fmt(attackParts(a).hit) : ''; }
    case 'dmg': { const a = c.attacks.find((x) => x.id === arg); return a ? attackParts(a).dmg : ''; }
    case 'weight': return `${Math.round(carryWeight() * 10) / 10} lb`;
    case 'capacity': return `${num(c.abilities.str) * (sizeMultiplier[c.size] || 15)} lb`;
    case 'xpNext': {
      const lvl = totalLevel();
      return lvl >= 20 ? 'max level' : `${XP_THRESHOLDS[lvl].toLocaleString()} XP for level ${lvl + 1}`;
    }
    case 'exhaustion': {
      const e = num(c.exhaustion);
      if (!e) return '';
      return e >= 6 ? 'Exhaustion 6: you die.' : `Exhaustion ${e}: −${2 * e} to all D20 Tests, −${5 * e} ft Speed.`;
    }
    default: return '';
  }
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
// Clickable circles: `used` of `max` are filled.
function pips(path, max, used, { label = 'use' } = {}) {
  let out = '';
  for (let i = 0; i < max; i++) {
    out += `<button class="pip ${i < used ? 'on' : ''}" data-action="pip" data-path="${esc(path)}" data-i="${i}" aria-label="${label} ${i + 1}"></button>`;
  }
  return `<span class="pips">${out || '<span class="muted">—</span>'}</span>`;
}
const calcSpan = (key, cls = '') => `<span class="${cls}" data-calc="${esc(key)}">${esc(calc(key))}</span>`;
const datalists = () => `
  <datalist id="dl-classes">${Object.keys(CLASSES).map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-species">${SPECIES.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-bg">${BACKGROUNDS.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-align">${ALIGNMENTS.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-dmg">${DAMAGE_TYPES.map((c) => `<option value="${c}">`).join('')}</datalist>
  <datalist id="dl-mastery">${WEAPON_MASTERIES.map((c) => `<option value="${c}">`).join('')}</datalist>`;
const abilityOptions = [['', '—'], ...ABILITIES.map((a) => [a.key, a.short])];

// ---------- tabs ----------
const TABS = [
  ['stats', 'Stats'], ['combat', 'Combat'], ['spells', 'Spells'], ['gear', 'Gear'],
  ['traits', 'Features'], ['journal', 'Journal'], ['campaign', 'Campaign'],
];

function header() {
  const c = C();
  return `
  <header class="hero">
    <div class="hero-main">
      <h1>${calcSpan('name')}</h1>
      <p class="muted">${calcSpan('subtitle')}</p>
    </div>
    <div class="hero-stats">
      <div class="chip"><b>${calcSpan('hp')}</b><small>HP</small><i class="bar" data-calc="hpPct" data-calc-attr="--pct" style="--pct:${calc('hpPct')}%"></i></div>
      <div class="chip"><b>${calcSpan('ac')}</b><small>AC</small></div>
      <div class="chip"><b>${calcSpan('init')}</b><small>Init</small></div>
      <div class="chip"><b>${calcSpan('pb')}</b><small>Prof</small></div>
    </div>
    <div class="hero-actions">
      <button data-action="shortRest">Short rest</button>
      <button data-action="longRest">Long rest</button>
    </div>
    <p class="warn" data-show-if="exhaustion" ${calc('exhaustion') ? '' : 'hidden'}>${calcSpan('exhaustion')}</p>
  </header>`;
}

function tabStats() {
  const c = C();
  const classes = c.classes.map((cl) => `
    <div class="row class-row">
      ${input(`character.classes.#${cl.id}.name`, { label: 'Class', list: 'dl-classes' })}
      ${input(`character.classes.#${cl.id}.subclass`, { label: 'Subclass' })}
      ${input(`character.classes.#${cl.id}.level`, { label: 'Level', type: 'number', min: 1, max: 20, cls: 'xs' })}
      ${c.classes.length > 1 ? `<button class="icon danger" data-action="removeClass" data-id="${cl.id}" title="Remove class">✕</button>` : ''}
    </div>`).join('');

  const abilities = ABILITIES.map((a) => `
    <div class="ability">
      <span class="ab-name">${a.short}</span>
      <span class="ab-mod">${calcSpan(`mod:${a.key}`)}</span>
      ${input(`character.abilities.${a.key}`, { type: 'number', min: 1, max: 30 })}
    </div>`).join('');

  const saves = ABILITIES.map((a) => `
    <li>${check(`character.saveProf.${a.key}`, '', { title: 'Proficient' })}<span class="grow">${a.name}</span>${calcSpan(`save:${a.key}`, 'val')}</li>`).join('');

  const skills = SKILLS.map((s) => {
    const lvl = num(c.skills[s.key]);
    const label = ['Not proficient', 'Proficient', 'Expertise'][lvl];
    return `<li>
      <button class="prof p${lvl}" data-action="cycleSkill" data-key="${s.key}" title="${label} (tap to change)" aria-label="${s.name}: ${label}"></button>
      <span class="grow">${s.name} <small class="muted">${s.ability.toUpperCase()}</small></span>${calcSpan(`skill:${s.key}`, 'val')}</li>`;
  }).join('');

  return `
  <section class="card">
    <h2>Identity</h2>
    <div class="grid">
      ${input('character.name', { label: 'Character name', rerender: false })}
      ${input('character.player', { label: 'Player' })}
      ${input('character.species', { label: 'Species', list: 'dl-species' })}
      ${input('character.background', { label: 'Background', list: 'dl-bg' })}
      ${input('character.alignment', { label: 'Alignment', list: 'dl-align' })}
      ${select('character.size', ['Tiny', 'Small', 'Medium', 'Large'], { label: 'Size' })}
      ${input('character.xp', { label: 'Experience points', type: 'number', min: 0 })}
    </div>
    <p class="hint">Next: ${calcSpan('xpNext')}</p>
    <h3>Classes <small class="muted">total level ${calcSpan('level')}</small></h3>
    ${classes}
    <button class="ghost" data-action="addClass">+ Multiclass</button>
    <button class="ghost" data-action="applyClassSaves" title="Sets save proficiencies from your first class">Apply class saving throws</button>
  </section>

  <section class="card">
    <h2>Ability scores</h2>
    <div class="abilities">${abilities}</div>
  </section>

  <div class="two-col">
    <section class="card">
      <h2>Saving throws</h2>
      <ul class="list">${saves}</ul>
      ${input('character.saveBonus', { label: 'Bonus to all saves (e.g. Cloak of Protection)', type: 'number', cls: 'wide' })}
      <h2>Senses</h2>
      <ul class="list"><li><span class="grow">Passive Perception</span>${calcSpan('passive', 'val')}</li></ul>
    </section>
    <section class="card">
      <h2>Skills</h2>
      <p class="hint">Tap the circle: empty = none, half = proficient, full = expertise.</p>
      <ul class="list">${skills}</ul>
      ${check('character.jackOfAllTrades', 'Jack of All Trades (Bard)')}
    </section>
  </div>`;
}

function tabCombat() {
  const c = C();
  const conds = CONDITIONS.map((name) => `
    <button class="tag ${c.conditions.includes(name) ? 'on' : ''}" data-action="toggleCondition" data-key="${name}">${name}</button>`).join('');
  const hitDice = c.classes.map((cl) => {
    const die = CLASSES[cl.name]?.hitDie;
    const left = Math.max(0, num(cl.level) - num(cl.hdUsed));
    return `<li><span class="grow">${esc(cl.name)} ${die ? `d${die}` : '(unknown die)'}</span>
      <span class="val">${left} / ${num(cl.level)}</span>
      <button class="small" data-action="spendHD" data-id="${cl.id}" ${left && die ? '' : 'disabled'}>Spend</button></li>`;
  }).join('');
  const attacks = c.attacks.map((a) => `
    <div class="item">
      <div class="item-head">
        ${input(`character.attacks.#${a.id}.name`, { placeholder: 'Weapon or attack' })}
        <span class="badge">${calcSpan(`atk:${a.id}`)} to hit</span>
        <button class="icon danger" data-action="remove" data-list="attacks" data-id="${a.id}" title="Delete">✕</button>
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
        <span class="muted">Damage: ${calcSpan(`dmg:${a.id}`)}</span>
      </div>
    </div>`).join('');

  return `
  <div class="two-col">
    <section class="card">
      <h2>Hit points</h2>
      <div class="grid three">
        ${input('character.hp.current', { label: 'Current', type: 'number' })}
        ${input('character.hp.max', { label: 'Max', type: 'number', min: 1 })}
        ${input('character.hp.temp', { label: 'Temporary', type: 'number', min: 0 })}
      </div>
      <div class="row hp-quick">
        <input id="hpAmount" type="number" inputmode="numeric" min="0" placeholder="Amount" aria-label="Amount">
        <button class="danger" data-action="hp" data-key="damage">Damage</button>
        <button class="ok" data-action="hp" data-key="heal">Heal</button>
        <button data-action="hp" data-key="temp">Set temp</button>
      </div>
      <h3>Death saves</h3>
      <div class="row death">
        <span>Successes</span>${pips('character.deathSaves.success', 3, c.deathSaves.success, { label: 'success' })}
        <span>Failures</span>${pips('character.deathSaves.fail', 3, c.deathSaves.fail, { label: 'failure' })}
      </div>
      <h3>Hit dice</h3>
      <ul class="list">${hitDice}</ul>
    </section>
    <section class="card">
      <h2>Defense & movement</h2>
      <div class="grid three">
        ${input('character.ac', { label: 'Armor Class', type: 'number' })}
        ${input('character.speed', { label: 'Speed (ft)', type: 'number' })}
        ${input('character.initBonus', { label: 'Initiative bonus', type: 'number' })}
      </div>
      <p class="hint">Initiative = DEX mod + bonus (2024 Alert feat: add your Proficiency Bonus here).</p>
      <div class="row">
        ${check('character.inspiration', 'Heroic Inspiration')}
        ${select('character.exhaustion', [0, 1, 2, 3, 4, 5, 6].map((n) => [n, `Exhaustion ${n}`]), { type: 'number' })}
      </div>
      <h3>Conditions</h3>
      <div class="tags">${conds}</div>
    </section>
  </div>
  <section class="card">
    <h2>Weapons & attacks</h2>
    ${attacks || '<p class="muted">No attacks yet.</p>'}
    <button class="ghost" data-action="add" data-list="attacks">+ Add attack</button>
  </section>`;
}

function tabSpells() {
  const c = C();
  const sc = c.spellcasting;
  const slots = sc.slots.map((s, i) => `
    <div class="slot">
      <span class="slot-lvl">${i + 1}</span>
      ${input(`character.spellcasting.slots.${i}.max`, { type: 'number', min: 0, max: 9, rerender: true })}
      ${pips(`character.spellcasting.slots.${i}.used`, num(s.max), num(s.used), { label: `level ${i + 1} slot` })}
    </div>`).join('');
  const levels = [...new Set(c.spells.map((s) => num(s.level)))].sort((a, b) => a - b);
  const spellRow = (s) => `
    <div class="item spell">
      <div class="item-head">
        ${check(`character.spells.#${s.id}.prepared`, '', { title: 'Prepared' })}
        ${input(`character.spells.#${s.id}.name`, { placeholder: 'Spell name' })}
        ${select(`character.spells.#${s.id}.level`, [[0, 'Cantrip'], 1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => (Array.isArray(x) ? x : [x, `Level ${x}`])), { type: 'number', rerender: true })}
        <button class="icon danger" data-action="remove" data-list="spells" data-id="${s.id}" title="Delete">✕</button>
      </div>
      <div class="row">
        ${check(`character.spells.#${s.id}.concentration`, 'Concentration')}
        ${check(`character.spells.#${s.id}.ritual`, 'Ritual')}
        ${input(`character.spells.#${s.id}.time`, { label: 'Casting time', cls: 'sm', placeholder: 'Action' })}
        ${input(`character.spells.#${s.id}.range`, { label: 'Range', cls: 'sm' })}
        ${input(`character.spells.#${s.id}.notes`, { label: 'Notes', cls: 'grow' })}
      </div>
    </div>`;
  const list = levels.map((lvl) => `
    <h3>${lvl === 0 ? 'Cantrips' : `Level ${lvl}`}</h3>
    ${c.spells.filter((s) => num(s.level) === lvl).map(spellRow).join('')}`).join('');

  return `
  <section class="card">
    <h2>Spellcasting</h2>
    <div class="row">
      ${select('character.spellcasting.ability', [['', `Auto (${calc('spellAbility')})`], ...ABILITIES.map((a) => [a.key, a.name])], { label: 'Ability', rerender: true })}
      ${input('character.spellcasting.bonusDC', { label: 'DC bonus', type: 'number', cls: 'xs' })}
      ${input('character.spellcasting.bonusAttack', { label: 'Attack bonus', type: 'number', cls: 'xs' })}
      <div class="stat"><small>Save DC</small><b>${calcSpan('spellDC')}</b></div>
      <div class="stat"><small>Spell attack</small><b>${calcSpan('spellAtk')}</b></div>
    </div>
  </section>
  <section class="card">
    <h2>Spell slots</h2>
    <p class="hint">Set the maximum per level, tap circles to mark slots as spent. Long rest refills them.</p>
    <div class="slots">${slots}</div>
    <button class="ghost" data-action="autoSlots">Fill slots from my classes</button>
    <h3>Pact Magic (Warlock)</h3>
    <div class="row">
      ${input('character.spellcasting.pact.max', { label: 'Slots', type: 'number', min: 0, cls: 'xs', rerender: true })}
      ${input('character.spellcasting.pact.level', { label: 'Slot level', type: 'number', min: 1, max: 5, cls: 'xs' })}
      ${pips('character.spellcasting.pact.used', num(sc.pact.max), num(sc.pact.used), { label: 'pact slot' })}
    </div>
    <p class="hint">Pact slots come back on a short or long rest.</p>
  </section>
  <section class="card">
    <h2>Spells <small class="muted">${c.spells.filter((s) => s.prepared && num(s.level) > 0).length} prepared</small></h2>
    ${list || '<p class="muted">No spells yet.</p>'}
    <button class="ghost" data-action="add" data-list="spells">+ Add spell</button>
  </section>`;
}

function tabGear() {
  const c = C();
  const coins = ['cp', 'sp', 'ep', 'gp', 'pp'].map((k) => input(`character.coins.${k}`, { label: k.toUpperCase(), type: 'number', min: 0, cls: 'xs' })).join('');
  const items = c.inventory.map((i) => `
    <div class="item">
      <div class="item-head">
        ${check(`character.inventory.#${i.id}.equipped`, '', { title: 'Equipped' })}
        ${input(`character.inventory.#${i.id}.name`, { placeholder: 'Item' })}
        <button class="icon danger" data-action="remove" data-list="inventory" data-id="${i.id}" title="Delete">✕</button>
      </div>
      <div class="row">
        ${input(`character.inventory.#${i.id}.qty`, { label: 'Qty', type: 'number', min: 0, cls: 'xs' })}
        ${input(`character.inventory.#${i.id}.weight`, { label: 'Weight (lb each)', type: 'number', min: 0, cls: 'sm' })}
        ${check(`character.inventory.#${i.id}.attuned`, 'Attuned')}
        ${input(`character.inventory.#${i.id}.notes`, { label: 'Notes', cls: 'grow' })}
      </div>
    </div>`).join('');
  const attuned = c.inventory.filter((i) => i.attuned).length;
  return `
  <section class="card">
    <h2>Coins</h2>
    <div class="row">${coins}</div>
  </section>
  <section class="card">
    <h2>Inventory</h2>
    <p class="hint">Carried: ${calcSpan('weight')} of ${calcSpan('capacity')} capacity (STR × 15 for Small/Medium, coins at 50 per lb).
      Attunement: <b class="${attuned > 3 ? 'bad' : ''}">${attuned} / 3</b>. The checkbox marks an item as equipped.</p>
    ${items || '<p class="muted">Empty pack.</p>'}
    <button class="ghost" data-action="add" data-list="inventory">+ Add item</button>
  </section>`;
}

function tabTraits() {
  const c = C();
  const recharge = [['', 'No recharge'], ['short', 'Short or Long rest'], ['long', 'Long rest'], ['dawn', 'Dawn (manual)']];
  const feats = c.features.map((f) => `
    <div class="item">
      <div class="item-head">
        ${input(`character.features.#${f.id}.name`, { placeholder: 'Feature, feat or trait' })}
        <button class="icon danger" data-action="remove" data-list="features" data-id="${f.id}" title="Delete">✕</button>
      </div>
      <div class="row">
        ${input(`character.features.#${f.id}.source`, { label: 'Source', placeholder: 'Class, species, feat…', cls: 'sm' })}
        ${input(`character.features.#${f.id}.max`, { label: 'Uses', type: 'number', min: 0, cls: 'xs', rerender: true })}
        ${select(`character.features.#${f.id}.recharge`, recharge, { label: 'Recharge', cls: 'sm' })}
        ${num(f.max) ? pips(`character.features.#${f.id}.used`, num(f.max), num(f.used)) : ''}
      </div>
      ${textarea(`character.features.#${f.id}.description`, { rows: 2, placeholder: 'What it does' })}
    </div>`).join('');
  return `
  <section class="card">
    <h2>Features & traits</h2>
    <p class="hint">Class features, species traits, feats. Give them uses and a recharge, and the rest buttons reset them.</p>
    ${feats || '<p class="muted">None yet.</p>'}
    <button class="ghost" data-action="add" data-list="features">+ Add feature</button>
  </section>
  <section class="card">
    <h2>Proficiencies & languages</h2>
    <div class="grid">
      ${input('character.proficiencies.armor', { label: 'Armor training' })}
      ${input('character.proficiencies.weapons', { label: 'Weapons' })}
      ${input('character.proficiencies.tools', { label: 'Tools' })}
      ${input('character.proficiencies.languages', { label: 'Languages' })}
    </div>
  </section>
  <section class="card">
    <h2>Character</h2>
    ${textarea('character.bio.appearance', { label: 'Appearance', rows: 2 })}
    ${textarea('character.bio.personality', { label: 'Personality, ideals, bonds, flaws', rows: 3 })}
    ${textarea('character.bio.backstory', { label: 'Backstory', rows: 6 })}
    ${textarea('character.bio.allies', { label: 'Allies & organizations', rows: 3 })}
    ${textarea('character.bio.notes', { label: 'Other notes', rows: 3 })}
  </section>`;
}

function sessionMatches(s, q) {
  if (!q) return true;
  return ['title', 'summary', 'notes', 'loot', 'followUps', 'ingameDate', 'date', 'number']
    .some((k) => String(s[k] ?? '').toLowerCase().includes(q));
}
function journalList() {
  const q = journalQuery.trim().toLowerCase();
  const list = [...state.sessions].sort((a, b) => num(b.number) - num(a.number)).filter((s) => sessionMatches(s, q));
  if (!list.length) return `<p class="muted">${state.sessions.length ? 'No session matches your search.' : 'No sessions yet. Add one after (or during) your first game.'}</p>`;
  return list.map((s) => {
    const p = `sessions.#${s.id}`;
    return `
    <details class="item session" data-session="${s.id}" ${openSessions.has(s.id) ? 'open' : ''}>
      <summary>
        <span class="badge">#${esc(s.number)}</span>
        <b class="grow">${esc(s.title || 'Untitled session')}</b>
        <small class="muted">${esc(s.date || '')}</small>
      </summary>
      <div class="grid">
        ${input(`${p}.number`, { label: 'Session #', type: 'number', min: 0 })}
        ${input(`${p}.date`, { label: 'Real date', type: 'date' })}
        ${input(`${p}.ingameDate`, { label: 'In-game date / location' })}
        ${input(`${p}.title`, { label: 'Title' })}
      </div>
      ${textarea(`${p}.summary`, { label: 'Summary', rows: 3, placeholder: 'What happened, in a few lines' })}
      ${textarea(`${p}.notes`, { label: 'Notes', rows: 8, placeholder: 'NPCs met, places, clues, quotes…' })}
      ${textarea(`${p}.loot`, { label: 'Loot & XP', rows: 2 })}
      ${textarea(`${p}.followUps`, { label: 'To remember / open threads', rows: 3 })}
      <button class="danger small" data-action="removeSession" data-id="${s.id}">Delete session</button>
    </details>`;
  }).join('');
}
function tabJournal() {
  return `
  <section class="card">
    <div class="row">
      <h2 class="grow">Session journal</h2>
      <button data-action="addSession">+ New session</button>
    </div>
    <input id="journalSearch" type="search" placeholder="Search all sessions…" value="${esc(journalQuery)}">
    <div id="journalList">${journalList()}</div>
  </section>`;
}

function tabCampaign() {
  return `
  <section class="card">
    <h2>Campaign</h2>
    <div class="grid">
      ${input('campaign.name', { label: 'Campaign name' })}
      ${input('campaign.dm', { label: 'Dungeon Master' })}
      ${input('campaign.setting', { label: 'Setting / world' })}
      ${input('campaign.startDate', { label: 'Started on', type: 'date' })}
    </div>
    ${textarea('campaign.notes', { label: 'Campaign notes (party members, house rules, schedule…)', rows: 8 })}
  </section>
  <section class="card">
    <h2>Your data</h2>
    <p>Everything is saved <b>only in this browser on this device</b>. Nothing is sent anywhere.
      To move it to another device or keep a backup, export a file and import it on the other device.</p>
    <p class="hint" id="persistInfo"></p>
    <div class="row">
      <button data-action="export">Export backup (.json)</button>
      <label class="button">Import backup<input id="importFile" type="file" accept="application/json,.json" hidden></label>
      <button class="danger" data-action="reset">Delete everything</button>
    </div>
  </section>`;
}

const RENDER = { stats: tabStats, combat: tabCombat, spells: tabSpells, gear: tabGear, traits: tabTraits, journal: tabJournal, campaign: tabCampaign };

function render() {
  const tab = RENDER[state.ui.tab] ? state.ui.tab : 'stats';
  const y = window.scrollY;
  const focused = document.activeElement?.dataset?.bind;
  view.innerHTML = `
    ${header()}
    <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="${k === tab ? 'active' : ''}" aria-selected="${k === tab}" data-action="tab" data-key="${k}">${t}</button>`).join('')}</nav>
    <main>${RENDER[tab]()}</main>
    <footer class="muted"><span id="saveStatus">Saved</span> · D&D 5e 2024 rules</footer>
    ${datalists()}`;
  window.scrollTo(0, y);
  if (focused) {
    // Keep focus where the user was (e.g. tabbing from a field that triggers a re-render).
    const el = [...view.querySelectorAll('[data-bind]')].find((x) => x.dataset.bind === focused);
    el?.focus({ preventScroll: true });
  }
  if (tab === 'campaign') showPersistInfo();
}

async function showPersistInfo() {
  const el = document.getElementById('persistInfo');
  if (!el || !navigator.storage?.persisted) return;
  const persisted = await navigator.storage.persisted();
  el.textContent = persisted
    ? 'This browser has granted persistent storage, so your data will not be cleared automatically.'
    : 'Storage is not marked persistent: the browser may clear it if space runs low (Safari on iPhone can clear data of sites not used for 7 days unless you add the app to the Home Screen). Export a backup regularly.';
}

// ---------- actions ----------
function newItem(list) {
  const base = { id: uid() };
  switch (list) {
    case 'attacks': return { ...base, name: '', ability: 'str', proficient: true, bonus: 0, damage: '1d8', dmgBonus: 0, addMod: true, damageType: '', mastery: '', notes: '' };
    case 'spells': return { ...base, name: '', level: 0, prepared: false, concentration: false, ritual: false, time: '', range: '', notes: '' };
    case 'inventory': return { ...base, name: '', qty: 1, weight: 0, equipped: false, attuned: false, notes: '' };
    case 'features': return { ...base, name: '', source: '', max: 0, used: 0, recharge: '', description: '' };
    default: return base;
  }
}

function rest(kind) {
  const c = C();
  for (const f of c.features) {
    if (f.recharge === 'short' || (kind === 'long' && f.recharge === 'long')) f.used = 0;
  }
  c.spellcasting.pact.used = 0;
  if (kind === 'long') {
    // PHB 2024 Long Rest: regain all HP and all spent Hit Dice, Exhaustion level decreases by 1.
    c.hp.current = num(c.hp.max);
    c.hp.temp = 0;
    c.classes.forEach((cl) => { cl.hdUsed = 0; });
    c.spellcasting.slots.forEach((s) => { s.used = 0; });
    c.exhaustion = Math.max(0, num(c.exhaustion) - 1);
    c.deathSaves = { success: 0, fail: 0 };
  }
}

const actions = {
  tab: (el) => { state.ui.tab = el.dataset.key; commit(); window.scrollTo(0, 0); },
  add: (el) => { C()[el.dataset.list].push(newItem(el.dataset.list)); commit(); },
  remove: (el) => {
    const list = C()[el.dataset.list];
    const item = list.find((x) => x.id === el.dataset.id);
    if (item?.name && !confirm(`Delete "${item.name}"?`)) return;
    C()[el.dataset.list] = list.filter((x) => x.id !== el.dataset.id);
    commit();
  },
  addClass: () => { C().classes.push({ id: uid(), name: '', subclass: '', level: 1, hdUsed: 0 }); commit(); },
  removeClass: (el) => { C().classes = C().classes.filter((x) => x.id !== el.dataset.id); commit(); },
  applyClassSaves: () => {
    const info = CLASSES[C().classes[0]?.name];
    if (!info) return alert('Your first class is not one of the 12 PHB classes, so set saving throws by hand.');
    // Multiclassing never grants extra save proficiencies, so only the first class counts.
    ABILITIES.forEach((a) => { C().saveProf[a.key] = info.saves.includes(a.key); });
    commit();
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
      hp.current = Math.min(num(hp.max), num(hp.current) + amt);
      if (hp.current > 0) C().deathSaves = { success: 0, fail: 0 };
    } else {
      hp.temp = amt; // Temporary HP don't stack: the new value replaces the old one.
    }
    commit();
  },
  spendHD: (el) => {
    const cl = C().classes.find((x) => x.id === el.dataset.id);
    const die = CLASSES[cl.name]?.hitDie;
    const conMod = am('con');
    const answer = prompt(`Roll 1d${die} and type the result (CON ${fmt(conMod)} is added for you).\nLeave empty to roll for you.`, '');
    if (answer === null) return;
    const roll = answer.trim() === '' ? 1 + Math.floor(Math.random() * die) : Math.max(1, Math.min(die, Math.floor(num(answer))));
    const gained = Math.max(0, roll + conMod);
    cl.hdUsed = num(cl.hdUsed) + 1;
    C().hp.current = Math.min(num(C().hp.max), num(C().hp.current) + gained);
    commit();
    toast(`Rolled ${roll} ${fmt(conMod)} → +${gained} HP`);
  },
  shortRest: () => {
    if (!confirm('Short rest: resets features that recharge on a short rest and Pact Magic slots. Spend Hit Dice in the Combat tab.')) return;
    rest('short'); state.ui.tab = 'combat'; commit(); toast('Short rest done');
  },
  longRest: () => {
    if (!confirm('Long rest: full HP, all Hit Dice and spell slots back, features reset, Exhaustion −1, temporary HP removed.')) return;
    rest('long'); commit(); toast('Long rest done');
  },
  autoSlots: () => {
    const c = C();
    const lvl = casterLevel(c.classes);
    const warlock = c.classes.find((x) => x.name === 'Warlock');
    if (!lvl && !warlock) return alert('None of your classes has the Spellcasting feature by default. Subclasses like Eldritch Knight or Arcane Trickster need slots set by hand.');
    const row = lvl ? FULL_CASTER_SLOTS[Math.min(20, lvl) - 1] : [];
    c.spellcasting.slots.forEach((s, i) => { s.max = row[i] || 0; s.used = Math.min(num(s.used), s.max); });
    if (warlock) {
      const [n, l] = PACT_SLOTS[Math.min(20, Math.max(1, num(warlock.level))) - 1];
      c.spellcasting.pact.max = n; c.spellcasting.pact.level = l;
      c.spellcasting.pact.used = Math.min(num(c.spellcasting.pact.used), n);
    }
    commit();
    toast(`Slots set for spellcaster level ${lvl}${warlock ? ' + Pact Magic' : ''}`);
  },
  addSession: () => {
    const next = state.sessions.reduce((m, s) => Math.max(m, num(s.number)), 0) + 1;
    const s = { id: uid(), number: next, date: new Date().toISOString().slice(0, 10), ingameDate: '', title: '', summary: '', notes: '', loot: '', followUps: '' };
    state.sessions.push(s);
    openSessions.add(s.id);
    journalQuery = '';
    commit();
  },
  removeSession: (el) => {
    if (!confirm('Delete this session and its notes?')) return;
    state.sessions = state.sessions.filter((s) => s.id !== el.dataset.id);
    commit();
  },
  export: () => exportJSON(state),
  reset: () => {
    if (!confirm('Delete your character, campaign and all sessions from this device? Export a backup first if unsure.')) return;
    if (!confirm('Really delete everything? This cannot be undone.')) return;
    state = defaultState(); commit();
  },
};

function toast(msg) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- events ----------
view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) { e.preventDefault(); actions[el.dataset.action](el); }
});
function readValue(el) {
  if (el.dataset.type === 'bool') return el.checked;
  if (el.dataset.type === 'number') return el.value === '' ? 0 : num(el.value);
  return el.value;
}
view.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'journalSearch') {
    journalQuery = el.value;
    document.getElementById('journalList').innerHTML = journalList();
    return;
  }
  if (!el.dataset.bind) return;
  setPath(el.dataset.bind, readValue(el));
  persist();
  refreshDerived();
});
view.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'importFile') return importFile(el.files[0]);
  // Defer so that focus has already moved to the next field (render() restores it).
  if (el.dataset.bind && el.hasAttribute('data-rerender')) setTimeout(render, 0);
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

// Another tab/window saved: adopt its data so this (now stale) tab never overwrites it.
window.addEventListener('storage', (e) => {
  if (e.key !== 'dnd-companion-v1' || !e.newValue) return;
  try { const tab = state.ui.tab; state = normalize(JSON.parse(e.newValue)); state.ui.tab = tab; render(); } catch { /* ignore */ }
});

// Flush pending saves when the app is hidden or closed (important on phones).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(state); });
window.addEventListener('pagehide', () => save(state));

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
}

render();
