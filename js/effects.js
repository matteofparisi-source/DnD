// Effects engine: every number the sheet derives (ability scores, saves, skills, AC, speed, max HP, spell DC...) goes through here.
// Pure module: no DOM, no storage, importable in Node. app.js builds one `createFx(character, catalogs)` per render pass.
//
// An effect is { type, target?, value?, cond?, text? } (see EFFECT_META). Sources, in the order a breakdown lists them:
//   Base (stored value) -> Class (proficiency bonus, class saves) -> Feats -> Equipped items -> Spells -> Manual fields.
// Catalogs: { feats: [{id, name, fx?, fxSrc?}], spellFx: { [spellId]: { fx: [...], fxSrc } }, spells: [{id, name}] }.
import { ABILITIES, SKILLS, CONDITIONS, mod, profBonus } from './rules.js';

const AB = ABILITIES.map((a) => a.key);
const SK = SKILLS.map((s) => s.key);
const MODES = ['fly', 'swim', 'climb'];
export const AC_CONDS = [['', 'Always'], ['armor', 'While wearing armor'], ['noArmor', 'While not wearing armor'], ['noShield', 'While not using a shield'], ['noArmorNoShield', 'No armor and no shield']];
export const ABILITY_NAME = Object.fromEntries(ABILITIES.map((a) => [a.key, a.name]));
export const SKILL_NAME = Object.fromEntries(SKILLS.map((s) => [s.key, s.name]));

// Shape of every effect type. target: list of allowed keys, or 'free' (short text, e.g. a damage type).
// value: 'num' | 'numpb' (number or 'pb' = Proficiency Bonus) | 'nummode' (number or 'walk' = your walking Speed).
// def: starting target/value when a new effect of this type is made (or the type of an existing one is changed).
export const EFFECT_META = {
  ability: { label: 'Ability score bonus', target: AB, value: 'num', lo: -30, hi: 30, def: { target: 'int', value: 1 } },
  abilityMin: { label: 'Ability score is at least', target: AB, value: 'num', lo: 1, hi: 30, def: { target: 'int', value: 19 } },
  ac: { label: 'Armor Class bonus', value: 'num', cond: true, lo: -10, hi: 20, def: { value: 1 } },
  save: { label: 'Saving throw bonus', target: ['all', ...AB], value: 'num', lo: -20, hi: 20, def: { target: 'all', value: 1 } },
  saveProf: { label: 'Saving throw proficiency', target: AB, def: { target: 'wis' } },
  skillProf: { label: 'Skill proficiency', target: SK, def: { target: 'perception' } },
  skillExpert: { label: 'Skill expertise', target: SK, def: { target: 'perception' } },
  skillBonus: { label: 'Skill check bonus', target: SK, value: 'num', lo: -20, hi: 20, def: { target: 'perception', value: 1 } },
  pb: { label: 'Proficiency Bonus bonus', value: 'num', lo: -5, hi: 10, def: { value: 1 } },
  init: { label: 'Initiative bonus', value: 'numpb', lo: -20, hi: 20, def: { value: 1 } },
  speed: { label: 'Speed bonus (ft)', value: 'num', lo: -300, hi: 300, def: { value: 10 } },
  speedMin: { label: 'Speed is at least (ft)', value: 'num', lo: 0, hi: 300, def: { value: 30 } },
  speedMult: { label: 'Speed multiplier', value: 'num', lo: 0, hi: 10, def: { value: 2 } },
  speedMode: { label: 'Other speed (fly, swim, climb)', target: MODES, value: 'nummode', lo: 0, hi: 600, def: { target: 'fly', value: 'walk' } },
  hp: { label: 'Max HP bonus', value: 'num', lo: -500, hi: 500, perLevel: true, def: { value: 5 } },
  spellAttack: { label: 'Spell attack bonus', value: 'num', lo: -10, hi: 10, def: { value: 1 } },
  spellDC: { label: 'Spell save DC bonus', value: 'num', lo: -10, hi: 10, def: { value: 1 } },
  resist: { label: 'Damage resistance', target: 'free', def: { target: 'Fire' } },
  immune: { label: 'Damage immunity', target: 'free', def: { target: 'Poison' } },
  condImmune: { label: 'Condition immunity', target: CONDITIONS, def: { target: 'Charmed' } },
  sense: { label: 'Sense', text: true, def: { text: 'Darkvision 60 ft' } },
  prof: { label: 'Proficiency (armor, weapon, tool, language)', text: true, def: { text: '' } },
  note: { label: 'Reminder (no number)', text: true, def: { text: '' } },
};
// Kept as stored when seen but not computed here: spell, use and choice effects arrive with the feat/plan data (choice is expanded by resolveChoices).
const PASS = new Set(['spell', 'use', 'choice']);
export const EFFECT_TYPES = Object.keys(EFFECT_META);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const clampInt = (v, lo, hi, def = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const nm = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function cleanValue(v, m) {
  if (m.value === 'numpb' && String(v).toLowerCase() === 'pb') return 'pb';
  if (m.value === 'nummode' && String(v).toLowerCase() === 'walk') return 'walk';
  return clampInt(v, m.lo, m.hi, 0);
}
// spell, use and choice effects: only known keys, strings cut to 80 characters, ids restricted to [A-Za-z0-9_-].
const slugId = (v) => str(v).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
const s80 = (v) => str(v).slice(0, 80);
const bool = (v) => (v ? true : undefined);
const TPL_KEYS = ['type', 'target', 'value', 'max', 'text', 'cond', 'orExpert', 'hpPerLevel', 'always', 'free', 'freeCount', 'ability', 'cantrip', 'known', 'minLevel', 'mods', 'name', 'reset'];
// A template inside a choice: like an effect, but its target may be '$' (filled in with the pick).
const cleanTpl = (t) => (Array.isArray(t) ? t.map(cleanTpl).filter(Boolean) : isObj(t) ? Object.fromEntries(TPL_KEYS.filter((k) => t[k] !== undefined && t[k] !== null && typeof t[k] !== 'object').map((k) => [k, typeof t[k] === 'string' ? t[k].slice(0, k === 'text' ? 200 : 80) : t[k]])) : null);
function cleanPass(x, type, id, strict) {
  const dropU = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  if (type === 'spell') {
    const target = slugId(x.target);
    if (!target) return null;
    const ability = str(x.ability);
    if (strict && ability && !AB.includes(ability)) return null; // a bad pick skips the effect instead of falling back to a default
    return dropU({ id, type, target, always: bool(x.always), known: bool(x.known), cantrip: bool(x.cantrip), free: ['long', 'short', 'atWill'].includes(x.free) ? x.free : null, freeCount: clampInt(x.freeCount, 1, 9, 1), ability, minLevel: clampInt(x.minLevel, 0, 20, 0) || undefined, mods: str(x.mods).slice(0, 200) || undefined });
  }
  if (type === 'use') {
    const target = slugId(x.target);
    const v = x.value;
    const value = v === 'pb' || /^mod:(str|dex|con|int|wis|cha)$/.test(str(v)) ? v : clampInt(v, 0, 99, 0);
    return target ? { id, type, target, name: s80(x.name) || target, value, reset: x.reset === 'short' ? 'short' : 'long' } : null;
  }
  const key = slugId(x.key);
  if (!key) return null;
  const opts = (v) => (Array.isArray(v) ? v.filter((q) => typeof q === 'string').map(s80).slice(0, 200) : undefined);
  const by = isObj(x.optionsBy) ? Object.fromEntries(Object.entries(x.optionsBy).slice(0, 20).map(([k, v]) => [s80(k), Array.isArray(v) ? opts(v) : s80(v)])) : undefined;
  return dropU({ id, type, key, label: s80(x.label), n: x.n === 'pb' ? 'pb' : clampInt(x.n, 1, 20, 1), of: s80(x.of), options: opts(x.options), pool: s80(x.pool) || undefined, optionsBy: by, dependsOn: s80(x.dependsOn) || undefined, allowSame: bool(x.allowSame), requiresProf: bool(x.requiresProf), excludeSaveProf: bool(x.excludeSaveProf), then: cleanTpl(x.then), thenTool: cleanTpl(x.thenTool) });
}
// Returns a clean copy of an effect, or null when it is not a usable effect (unknown type, not an object). Never throws.
// strict (used for effects resolved from feat choices): a target that is not allowed drops the effect instead of falling back to the type's default.
export function cleanEffect(x, strict = false) {
  if (!isObj(x)) return null;
  let type = str(x.type);
  if (type === 'hpPerLevel') { x = { ...x, type: 'hp', hpPerLevel: x.value ?? x.hpPerLevel, value: 0 }; type = 'hp'; } // alias used by the design notes
  const id = str(x.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (PASS.has(type)) return cleanPass(x, type, id, strict);
  const m = EFFECT_META[type];
  if (!m) return null;
  const o = { id, type };
  if (Array.isArray(m.target)) {
    if (strict && !m.target.includes(x.target)) return null;
    o.target = m.target.includes(x.target) ? x.target : m.def.target;
  }
  else if (m.target === 'free') o.target = str(x.target).trim().slice(0, 40) || m.def.target;
  if (m.value) o.value = cleanValue(x.value, m);
  if (m.cond) o.cond = AC_CONDS.some(([k]) => k === x.cond) ? x.cond : '';
  if (m.text) o.text = str(x.text).slice(0, 200);
  if (type === 'ability' && nm(x.max) > 0) o.max = clampInt(x.max, 1, 40, 20);
  if (type === 'skillProf' && x.orExpert) o.orExpert = true; // proficiency, or Expertise when you already have it (Keen Mind)
  if (m.perLevel) o.hpPerLevel = clampInt(x.hpPerLevel, -20, 20, 0);
  return o;
}
export const cleanEffects = (list, strict = false) => (Array.isArray(list) ? list : []).map((e) => cleanEffect(e, strict)).filter(Boolean);
// A fresh effect (no id: the caller adds one) with the type's starting values.
export const newEffect = (type = 'ac') => cleanEffect({ type, ...(EFFECT_META[type]?.def || {}) }) || { type: 'ac', value: 1, cond: '' };

// Feats with choices. A `choice` effect { key, n, of, options | pool | optionsBy, then, thenTool } becomes one set of effects per value picked in
// entry.choices[key] (a string or a list of strings): '$' in `then` is replaced by the pick and 'choice:<key>' (e.g. a spell's ability) by that other pick.
// `then` may be one effect, a list, or null (a pick that is only referred to by others). Without a pick it adds nothing. `thenTool` is used for a pick that is not a skill.
const fillStr = (v, pick, choices) => {
  if (typeof v !== 'string') return v;
  if (v.startsWith('choice:')) return [].concat(choices?.[v.slice(7)] ?? []).find((x) => typeof x === 'string' && x) || 'int';
  return v.split('$').join(pick);
};
export function resolveChoices(effects, choices = {}) {
  const out = [];
  const fill = (t, pick) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, fillStr(v, pick, choices)]));
  for (const e of Array.isArray(effects) ? effects : []) {
    if (!isObj(e)) continue;
    if (e.type !== 'choice') { out.push(fill(e, '$')); continue; }
    for (const v of [].concat(choices?.[e.key] ?? []).filter((x) => typeof x === 'string' && x)) {
      const tpl = e.thenTool && !SK.includes(v) ? e.thenTool : e.then;
      for (const t of [].concat(tpl || [])) if (isObj(t)) out.push(fill(t, v));
    }
  }
  return out;
}
// How many picks a choice asks for (n may be 'pb' = your effective Proficiency Bonus, passed in) and which values it offers (null = free text, e.g. a tool name).
export const choiceCount = (ch, pb = 2) => (ch.n === 'pb' ? Math.max(1, pb) : Math.max(1, Number(ch.n) || 1)); // pb: the effective Proficiency Bonus (FX().pb)
export function choiceOptions(ch, choices = {}, pools = {}) {
  if (ch.dependsOn && ch.optionsBy) {
    const src = ch.optionsBy[[].concat(choices?.[ch.dependsOn] ?? [])[0]];
    return Array.isArray(src) ? src : pools[src] || [];
  }
  if (ch.pool) return pools[ch.pool] || [];
  if (Array.isArray(ch.options) && ch.options.length) return ch.options;
  if (ch.of === 'skill' || ch.of === 'skillOrTool') return SK;
  if (ch.of === 'ability') return AB;
  return null;
}
// The choice effects of a feat, in order.
export const featChoices = (fx) => (Array.isArray(fx) ? fx : []).filter((e) => e?.type === 'choice' && e.key);

// Short readable text for an effect (feat rows, summaries). nameOf(spellId) gives a spell's name.
export function describeEffect(e, nameOf = (id) => id) {
  const sgn = (n) => `${nm(n) >= 0 ? '+' : '−'}${Math.abs(nm(n))}`;
  const ab = (a) => ABILITY_NAME[a] || a;
  switch (e.type) {
    case 'ability': return `${ab(e.target)} ${sgn(e.value)}${nm(e.max) > 20 ? ` (max ${e.max})` : ''}`;
    case 'abilityMin': return `${ab(e.target)} is at least ${e.value}`;
    case 'ac': return `Armor Class ${sgn(e.value)}${e.cond ? ` (${(AC_CONDS.find(([k]) => k === e.cond) || ['', ''])[1].toLowerCase()})` : ''}`;
    case 'save': return e.target === 'all' ? `All saving throws ${sgn(e.value)}` : `${ab(e.target)} saving throws ${sgn(e.value)}`;
    case 'saveProf': return `Saving throw proficiency: ${ab(e.target)}`;
    case 'skillProf': return `Proficiency: ${SKILL_NAME[e.target] || e.target}${e.orExpert ? ' (Expertise if already proficient)' : ''}`;
    case 'skillExpert': return `Expertise: ${SKILL_NAME[e.target] || e.target}`;
    case 'init': return `Initiative ${e.value === 'pb' ? '+ Proficiency Bonus' : sgn(e.value)}`;
    case 'skillBonus': return `${SKILL_NAME[e.target] || e.target} checks ${sgn(e.value)}`;
    case 'pb': return `Proficiency Bonus ${sgn(e.value)}`;
    case 'speedMin': return `Speed is at least ${e.value} ft`;
    case 'speed': return `Speed ${sgn(e.value)} ft`;
    case 'speedMult': return `Speed ×${e.value}`;
    case 'speedMode': return `${e.target[0].toUpperCase()}${e.target.slice(1)} speed ${e.value === 'walk' ? 'equal to your Speed' : `${e.value} ft`}`;
    case 'hp': return `Max HP ${[nm(e.value) ? sgn(e.value) : '', nm(e.hpPerLevel) ? `${sgn(e.hpPerLevel)} per level` : ''].filter(Boolean).join(' ')}`;
    case 'spellAttack': return `Spell attack ${sgn(e.value)}`;
    case 'spellDC': return `Spell save DC ${sgn(e.value)}`;
    case 'resist': return `Resistance: ${e.target}`;
    case 'immune': return `Immunity: ${e.target}`;
    case 'condImmune': return `Immune to ${e.target}`;
    case 'sense': return e.text;
    case 'prof': return `Proficiency: ${e.text}`;
    case 'note': return e.text;
    case 'spell': {
      const how = [e.always ? 'always prepared' : e.known ? 'known' : '', e.free === 'atWill' ? 'at will' : e.free ? `free ${nm(e.freeCount) > 1 ? `${e.freeCount}×` : 'once'} per ${e.free === 'short' ? 'Short or Long' : 'Long'} Rest` : '', e.ability && e.ability !== 'int' ? `${(e.ability || '').toUpperCase()} spellcasting` : '', e.minLevel ? `from level ${e.minLevel}` : ''].filter(Boolean);
      return `Spell: ${nameOf(e.target)}${how.length ? ` (${how.join(', ')})` : ''}`;
    }
    case 'use': return `${e.name || e.target}: ${e.value === 'pb' ? 'Proficiency Bonus' : String(e.value).startsWith('mod:') ? `${(String(e.value).slice(4)).toUpperCase()} modifier` : e.value} per ${e.reset === 'short' ? 'Short or Long' : 'Long'} Rest`;
    default: return '';
  }
}

// All effects that currently apply, each with src { kind: 'feat' | 'item' | 'spell' | 'manual', id, name, fxSrc? }.
export function collect(state, cat = {}) {
  const c = state?.character || state || {};
  const out = [];
  const add = (list, src, strict = false) => { for (const e of cleanEffects(list, strict)) out.push({ ...e, src }); };
  for (const entry of Array.isArray(c.feats) ? c.feats : []) {
    if (!isObj(entry)) continue;
    const ft = (cat.feats || []).find((f) => f.id === entry.featId);
    const src = { kind: 'feat', id: str(entry.id), name: ft?.name || str(entry.featId) || 'Feat', fxSrc: ft?.fxSrc || '' };
    add(resolveChoices(ft?.fx, entry.choices), src, true);
    add(resolveChoices(entry.effects, entry.choices), { ...src, fxSrc: '' }, true);
  }
  for (const it of Array.isArray(c.items) ? c.items : []) {
    if (!isObj(it) || !it.equipped || (it.needsAttune && !it.attuned)) continue; // worn, and attuned when the item needs it
    const src = { kind: 'item', id: str(it.id), name: str(it.name) || 'Item', fxSrc: it.fxSrc === 'community' ? 'community' : '' };
    add(it.effects, src);
    if (nm(it.acBonus)) add([{ type: 'ac', value: it.acBonus }], src);
  }
  const spellIds = [...new Set([c.concentration?.name ? c.concentration.id : '', ...(Array.isArray(c.buffs) ? c.buffs : [])].filter((id) => typeof id === 'string' && id))];
  for (const id of spellIds) {
    const sfx = cat.spellFx?.[id];
    if (sfx) add(sfx.fx, { kind: 'spell', id, name: (cat.spells || []).find((s) => s.id === id)?.name || id, fxSrc: sfx.fxSrc || '' });
  }
  const manual = { kind: 'manual', id: '', name: 'Manual', fxSrc: '' };
  add([{ type: 'save', target: 'all', value: c.saveBonus }, { type: 'init', value: c.initBonus }], manual);
  if (c.acAuto !== false) add([{ type: 'ac', value: c.acMisc }], manual);
  const level = Math.max(1, Math.min(20, Number(c.level) || 1));
  return out.filter((e) => !(e.src.kind === 'manual' && e.value === 0) && !(e.type === 'spell' && nm(e.minLevel) > level));
}

// "Spells of the Mark": spells a taken feat adds to the caster's own spell list. Returns { ids: Map(spellId -> [feat names]), always: Set(spellId) }.
// `always` holds the ids a taken Potent Dragonmark (alwaysPreparedExpanded) makes always prepared, and only those of a spell level you can cast
// (cat.maxSpellLevel(level) when given). The data cannot tell which Mark a Potent Dragonmark belongs to, so it covers the lists of every Mark taken.
// cat.feats entries carry `expanded` (spell level -> ids), `alwaysPreparedExpanded` and `name`.
export function expandedSpells(c, cat = {}) {
  const ids = new Map();
  const always = new Set();
  const potent = (Array.isArray(c?.feats) ? c.feats : []).some((e) => (cat.feats || []).find((f) => f.id === e?.featId)?.alwaysPreparedExpanded);
  const maxL = typeof cat.maxSpellLevel === 'function' ? cat.maxSpellLevel(Math.max(1, Math.min(20, Number(c?.level) || 1))) : 9;
  for (const entry of Array.isArray(c?.feats) ? c.feats : []) {
    const ft = (cat.feats || []).find((f) => f.id === entry?.featId);
    if (!ft) continue;
    for (const [lv, list] of Object.entries(ft.expanded || {})) {
      for (const id of list) {
        ids.set(id, [...new Set([...(ids.get(id) || []), ft.name])]);
        if (potent && Number(lv) <= maxL) always.add(id);
      }
    }
  }
  return { ids, always };
}

const part = (label, value, note) => (note ? { label, value, note } : { label, value });
const finish = (parts) => ({ total: parts.reduce((s, p) => s + p.value, 0), parts });
const NOTE = { feat: 'feat', item: 'item', spell: 'spell', manual: '' };

// Everything derived from one character. Each method returns { total, parts: [{label, value, note?}] } where the parts add up to total.
export function createFx(c, cat = {}) {
  const list = collect({ character: c }, cat);
  const level = Math.max(1, Math.min(20, Number(c.level) || 1));
  const of = (type, pred) => list.filter((e) => e.type === type && (!pred || pred(e)));
  const pbEffects = of('pb'); // Proficiency Bonus effects (Ioun Stone of Mastery): every use of the bonus below includes them
  const pb = profBonus(level) + pbEffects.reduce((sum, e) => sum + nm(e.value), 0);
  const noteOf = (e, extra = '') => [NOTE[e.src.kind], e.src.fxSrc === 'community' ? 'unverified' : '', extra].filter(Boolean).join(', ');
  const eff = (e, value = nm(e.value), extra = '') => part(e.src.name, value, noteOf(e, extra));

  // Ability scores: base, then every `ability` bonus (stopping at its cap, 20 unless it names a higher `max`), then `abilityMin`.
  const scores = {};
  const sparts = {};
  for (const a of AB) {
    const base = nm(c.abilities?.[a]);
    let run = base;
    const parts = [part('Base', base)];
    for (const e of of('ability', (x) => x.target === a)) {
      const v = nm(e.value);
      const cap = e.max ?? 20;
      const next = v > 0 ? Math.max(run, Math.min(run + v, cap)) : Math.max(1, run + v);
      parts.push(eff(e, next - run, next - run !== v ? `capped at ${cap}` : ''));
      run = next;
    }
    for (const e of of('abilityMin', (x) => x.target === a)) {
      const n = nm(e.value);
      parts.push(eff(e, Math.max(0, n - run), n > run ? `sets the score to ${n}` : `already ${n} or more`));
      run = Math.max(run, n);
    }
    scores[a] = run;
    sparts[a] = parts;
  }
  const am = (a) => mod(scores[a]);
  const short = (a) => ABILITIES.find((x) => x.key === a)?.short || a;

  const abil = (a) => ({ total: scores[a], parts: sparts[a] });
  const modOf = (a) => ({ total: am(a), parts: [part(`Score ${scores[a]}`, am(a))] });
  const save = (a) => {
    const parts = [part(`${short(a)} modifier`, am(a))];
    const eProf = of('saveProf', (e) => e.target === a)[0];
    if (c.saveProf?.[a]) parts.push(pbPart());
    else if (eProf) parts.push(part(eProf.src.name, pb, noteOf(eProf, 'proficiency')));
    for (const e of of('save', (x) => x.target === 'all' || x.target === a)) parts.push(eff(e));
    return finish(parts);
  };
  const skillInfo = (key) => {
    const stored = clampInt(c.skills?.[key], 0, 2);
    let from = null;
    let lvl = stored;
    for (const e of of('skillProf', (x) => x.target === key)) {
      if (lvl < 1) { lvl = 1; from = e; } else if (e.orExpert && lvl < 2) { lvl = 2; from = e; }
    }
    for (const e of of('skillExpert', (x) => x.target === key)) if (lvl < 2) { lvl = 2; from = e; }
    return { stored, level: lvl, from };
  };
  const skill = (key) => {
    const ab = SKILLS.find((s) => s.key === key)?.ability || 'int';
    const parts = [part(`${short(ab)} modifier`, am(ab))];
    const { stored, level: lvl, from } = skillInfo(key);
    if (lvl > 0) parts.push(from ? part(from.src.name, pb * lvl, noteOf(from, lvl === 2 ? 'expertise' : 'proficiency')) : part(stored === 2 ? 'Expertise (double Proficiency)' : 'Proficiency', pb * lvl));
    for (const e of of('skillBonus', (x) => x.target === key)) parts.push(eff(e));
    return finish(parts);
  };
  const init = () => finish([part('DEX modifier', am('dex')), ...of('init').map((e) => (e.value === 'pb' ? eff(e, pb, 'Proficiency Bonus') : eff(e)))]);
  const speed = () => {
    const parts = [part('Base', nm(c.speed))];
    for (const e of of('speed')) parts.push(eff(e));
    let total = parts.reduce((s, p) => s + p.value, 0);
    for (const e of of('speedMin')) { const n = nm(e.value); if (n > total) { parts.push(eff(e, n - total, `raises Speed to ${n}`)); total = n; } }
    for (const e of of('speedMult')) { const m = nm(e.value); parts.push(eff(e, total * m - total, `×${m}`)); total *= m; }
    return finish(parts);
  };
  const speedModes = () => {
    const walk = speed().total;
    return MODES.map((m) => {
      const es = of('speedMode', (e) => e.target === m);
      if (!es.length) return null;
      const v = Math.max(...es.map((e) => (e.value === 'walk' ? walk : nm(e.value))));
      return { mode: m, value: v, sources: [...new Set(es.map((e) => e.src.name))] };
    }).filter(Boolean);
  };
  const hpmax = (auto = c.hp?.auto !== false) => {
    if (!auto) return finish([part('Manual maximum', nm(c.hp?.max))]);
    const con = am('con');
    const parts = [part('Hit die, level 1', 8), part(`CON ${con >= 0 ? '+' : '−'}${Math.abs(con)} × ${level} levels`, con * level)];
    if (level > 1) parts.push(part(`Levels 2–${level} (5 each)`, 5 * (level - 1)));
    const sum = parts.reduce((s, p) => s + p.value, 0);
    if (sum < 1) parts.push(part('Minimum 1', 1 - sum));
    for (const e of of('hp')) {
      const v = nm(e.value) + nm(e.hpPerLevel) * level;
      if (v) parts.push(eff(e, v, nm(e.hpPerLevel) ? `${nm(e.hpPerLevel) > 0 ? '+' : ''}${nm(e.hpPerLevel)} per level` : ''));
    }
    return finish(parts);
  };
  const dc = (a = 'int') => finish([part('Base', 8), pbPart(), part(`${short(a)} modifier`, am(a)), ...of('spellDC').map((e) => eff(e))]);
  const satk = (a = 'int') => finish([pbPart(), part(`${short(a)} modifier`, am(a)), ...of('spellAttack').map((e) => eff(e))]);

  // Spells that taken feats grant: [{ id, always, known, free: '' | 'long' | 'short' | 'atWill', freeCount, ability, cantrip, mods, entry, feat, fxSrc }].
  const grants = () => of('spell').filter((e) => e.target).map((e) => ({
    id: e.target, always: !!e.always, known: !!e.known, free: e.free || '', freeCount: Math.max(1, nm(e.freeCount) || 1), ability: AB.includes(e.ability) ? e.ability : 'int',
    cantrip: !!e.cantrip, mods: str(e.mods), entry: e.src.id, feat: e.src.name, fxSrc: e.src.fxSrc || '',
  }));
  // Limited uses to track (`use` effects and free casts): [{ key, name, max, reset: 'long' | 'short', feat, entry, spellId? }]. Stored as used counts in character.uses[key].
  const spellName = (id) => (cat.spells || []).find((x) => x.id === id)?.name || id;
  const uses = () => {
    const out = [];
    for (const e of of('use')) {
      const v = e.value;
      const max = v === 'pb' ? pb : String(v).startsWith('mod:') ? Math.max(1, am(String(v).slice(4))) : Math.max(0, nm(v));
      if (max > 0 && e.target) out.push({ key: `feat:${e.src.id}:${e.target}`, name: str(e.name) || str(e.target), max, reset: e.reset === 'short' ? 'short' : 'long', feat: e.src.name, entry: e.src.id });
    }
    for (const g of grants()) {
      if (g.free !== 'long' && g.free !== 'short') continue;
      out.push({ key: `feat:${g.entry}:cast-${g.id}`, name: `${spellName(g.id)}, free cast`, max: g.freeCount, reset: g.free, feat: g.feat, entry: g.entry, spellId: g.id });
    }
    return out;
  };
  const expanded = () => expandedSpells(c, cat);
  const pbPart = () => part('Proficiency', pb, pbEffects.length ? `includes ${[...new Set(pbEffects.map((e) => e.src.name))].join(', ')}` : '');
  const pbBreak = () => finish([part(`Level ${level}`, profBonus(level)), ...pbEffects.map((e) => eff(e))]);
  const passive = () => finish([part('Base', 10), ...skill('perception').parts]);
  // Armor Class: the caller supplies the armor/DEX/shield parts; ac effects (and the manual bonus) are added when their condition holds.
  const ac = (base, ctx = {}) => {
    const ok = (e) => !e.cond || (e.cond === 'armor' ? ctx.armor : e.cond === 'noArmor' ? !ctx.armor : e.cond === 'noShield' ? !ctx.shield : !ctx.armor && !ctx.shield);
    return finish([...base.map((p) => ({ ...p })), ...of('ac', ok).map((e) => eff(e))]);
  };

  // Read-only lists for the Stats and Selected pages: each entry { text, sources: [names] }.
  const group = (type, textOf) => {
    const map = new Map();
    for (const e of of(type)) {
      const text = textOf(e).trim();
      if (!text) continue;
      if (!map.has(text)) map.set(text, new Set());
      map.get(text).add(e.src.name);
    }
    return [...map].map(([text, s]) => ({ text, sources: [...s] }));
  };
  const listings = () => {
    const l = {
      resist: group('resist', (e) => e.target), immune: group('immune', (e) => e.target), condImmune: group('condImmune', (e) => e.target),
      sense: group('sense', (e) => e.text), prof: group('prof', (e) => e.text), note: group('note', (e) => e.text),
      speeds: speedModes().map((s) => ({ text: `${s.mode[0].toUpperCase()}${s.mode.slice(1)} ${s.value} ft`, sources: s.sources })),
    };
    l.any = Object.values(l).some((v) => Array.isArray(v) && v.length);
    return l;
  };

  // key: abil:<a> | mod:<a> | save:<a> | skill:<k> | init | speed | hpmax | dc | satk | passive | pb   (AC: pass the parts through ac())
  const breakdown = (key) => {
    const [kind, arg] = String(key).split(':');
    switch (kind) {
      case 'abil': return abil(arg);
      case 'mod': return modOf(arg);
      case 'save': return save(arg);
      case 'skill': return skill(arg);
      case 'init': return init();
      case 'speed': return speed();
      case 'hpmax': return hpmax();
      case 'dc': return dc();
      case 'satk': return satk();
      case 'passive': return passive();
      case 'pb': return pbBreak();
      default: return { total: 0, parts: [] };
    }
  };

  return { list, level, pb, grants, uses, expanded, score: (a) => scores[a], am, abil, modOf, save, skill, skillInfo, init, speed, speedModes, hpmax, dc, satk, passive, ac, listings, breakdown };
}
