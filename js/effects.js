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
  init: { label: 'Initiative bonus', value: 'numpb', lo: -20, hi: 20, def: { value: 1 } },
  speed: { label: 'Speed bonus (ft)', value: 'num', lo: -300, hi: 300, def: { value: 10 } },
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
// Returns a clean copy of an effect, or null when it is not a usable effect (unknown type, not an object). Never throws.
export function cleanEffect(x) {
  if (!isObj(x)) return null;
  let type = str(x.type);
  if (type === 'hpPerLevel') { x = { ...x, type: 'hp', hpPerLevel: x.value ?? x.hpPerLevel, value: 0 }; type = 'hp'; } // alias used by the design notes
  const id = str(x.id);
  if (PASS.has(type)) return { ...x, id, type };
  const m = EFFECT_META[type];
  if (!m) return null;
  const o = { id, type };
  if (Array.isArray(m.target)) o.target = m.target.includes(x.target) ? x.target : m.def.target;
  else if (m.target === 'free') o.target = str(x.target).trim().slice(0, 40) || m.def.target;
  if (m.value) o.value = cleanValue(x.value, m);
  if (m.cond) o.cond = AC_CONDS.some(([k]) => k === x.cond) ? x.cond : '';
  if (m.text) o.text = str(x.text).slice(0, 200);
  if (type === 'ability' && nm(x.max) > 0) o.max = clampInt(x.max, 1, 40, 20);
  if (m.perLevel) o.hpPerLevel = clampInt(x.hpPerLevel, -20, 20, 0);
  return o;
}
export const cleanEffects = (list) => (Array.isArray(list) ? list : []).map(cleanEffect).filter(Boolean);
// A fresh effect (no id: the caller adds one) with the type's starting values.
export const newEffect = (type = 'ac') => cleanEffect({ type, ...(EFFECT_META[type]?.def || {}) }) || { type: 'ac', value: 1, cond: '' };

// Extension point for feats with choices: a `choice` effect { key, then: {...target: '$'} } becomes one effect per value picked in
// entry.choices[key] (a string or a list of strings), with '$' replaced by the pick. Without a pick it adds nothing.
export function resolveChoices(effects, choices) {
  const out = [];
  for (const e of Array.isArray(effects) ? effects : []) {
    if (e?.type !== 'choice') { out.push(e); continue; }
    if (!isObj(e.then)) continue;
    for (const v of [].concat(choices?.[e.key] ?? []).filter(Boolean)) out.push({ ...e.then, target: e.then.target === '$' ? v : e.then.target });
  }
  return out;
}

// All effects that currently apply, each with src { kind: 'feat' | 'item' | 'spell' | 'manual', id, name, fxSrc? }.
export function collect(state, cat = {}) {
  const c = state?.character || state || {};
  const out = [];
  const add = (list, src) => { for (const e of cleanEffects(list)) out.push({ ...e, src }); };
  for (const entry of Array.isArray(c.feats) ? c.feats : []) {
    if (!isObj(entry)) continue;
    const ft = (cat.feats || []).find((f) => f.id === entry.featId);
    const src = { kind: 'feat', id: str(entry.id), name: ft?.name || str(entry.featId) || 'Feat', fxSrc: ft?.fxSrc || '' };
    add(resolveChoices(ft?.fx, entry.choices), src);
    add(resolveChoices(entry.effects, entry.choices), { ...src, fxSrc: '' });
  }
  for (const it of Array.isArray(c.items) ? c.items : []) {
    if (!isObj(it) || !it.equipped || (it.needsAttune && !it.attuned)) continue; // worn, and attuned when the item needs it
    const src = { kind: 'item', id: str(it.id), name: str(it.name) || 'Item', fxSrc: '' };
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
  return out.filter((e) => !(e.src.kind === 'manual' && e.value === 0));
}

const part = (label, value, note) => (note ? { label, value, note } : { label, value });
const finish = (parts) => ({ total: parts.reduce((s, p) => s + p.value, 0), parts });
const NOTE = { feat: 'feat', item: 'item', spell: 'spell', manual: '' };

// Everything derived from one character. Each method returns { total, parts: [{label, value, note?}] } where the parts add up to total.
export function createFx(c, cat = {}) {
  const list = collect({ character: c }, cat);
  const level = Math.max(1, Math.min(20, Number(c.level) || 1));
  const pb = profBonus(level);
  const of = (type, pred) => list.filter((e) => e.type === type && (!pred || pred(e)));
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
    if (c.saveProf?.[a]) parts.push(part('Proficiency', pb));
    else if (eProf) parts.push(part(eProf.src.name, pb, noteOf(eProf, 'proficiency')));
    for (const e of of('save', (x) => x.target === 'all' || x.target === a)) parts.push(eff(e));
    return finish(parts);
  };
  const skillInfo = (key) => {
    const stored = clampInt(c.skills?.[key], 0, 2);
    let from = null;
    let lvl = stored;
    for (const e of of('skillProf', (x) => x.target === key)) if (lvl < 1) { lvl = 1; from = e; }
    for (const e of of('skillExpert', (x) => x.target === key)) if (lvl < 2) { lvl = 2; from = e; }
    return { stored, level: lvl, from };
  };
  const skill = (key) => {
    const ab = SKILLS.find((s) => s.key === key)?.ability || 'int';
    const parts = [part(`${short(ab)} modifier`, am(ab))];
    const { stored, level: lvl, from } = skillInfo(key);
    if (lvl > 0) parts.push(from ? part(from.src.name, pb * lvl, noteOf(from, lvl === 2 ? 'expertise' : 'proficiency')) : part(stored === 2 ? 'Expertise (double Proficiency)' : 'Proficiency', pb * lvl));
    return finish(parts);
  };
  const init = () => finish([part('DEX modifier', am('dex')), ...of('init').map((e) => (e.value === 'pb' ? eff(e, pb, 'Proficiency Bonus') : eff(e)))]);
  const speed = () => {
    const parts = [part('Base', nm(c.speed))];
    for (const e of of('speed')) parts.push(eff(e));
    let total = parts.reduce((s, p) => s + p.value, 0);
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
  const dc = () => finish([part('Base', 8), part('Proficiency', pb), part('INT modifier', am('int')), ...of('spellDC').map((e) => eff(e))]);
  const satk = () => finish([part('Proficiency', pb), part('INT modifier', am('int')), ...of('spellAttack').map((e) => eff(e))]);
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

  // key: abil:<a> | mod:<a> | save:<a> | skill:<k> | init | speed | hpmax | dc | satk | passive   (AC: pass the parts through ac())
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
      default: return { total: 0, parts: [] };
    }
  };

  return { list, level, pb, score: (a) => scores[a], am, abil, modOf, save, skill, skillInfo, init, speed, speedModes, hpmax, dc, satk, passive, ac, listings, breakdown };
}
