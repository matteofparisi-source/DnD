// D&D 5e 2024 (revised Player's Handbook) reference data used for calculations and suggestions.
// Everything here is used as a suggestion only: every field in the app stays editable.

export const ABILITIES = [
  { key: 'str', name: 'Strength', short: 'STR' },
  { key: 'dex', name: 'Dexterity', short: 'DEX' },
  { key: 'con', name: 'Constitution', short: 'CON' },
  { key: 'int', name: 'Intelligence', short: 'INT' },
  { key: 'wis', name: 'Wisdom', short: 'WIS' },
  { key: 'cha', name: 'Charisma', short: 'CHA' },
];

export const SKILLS = [
  { key: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { key: 'animalHandling', name: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', name: 'Arcana', ability: 'int' },
  { key: 'athletics', name: 'Athletics', ability: 'str' },
  { key: 'deception', name: 'Deception', ability: 'cha' },
  { key: 'history', name: 'History', ability: 'int' },
  { key: 'insight', name: 'Insight', ability: 'wis' },
  { key: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { key: 'investigation', name: 'Investigation', ability: 'int' },
  { key: 'medicine', name: 'Medicine', ability: 'wis' },
  { key: 'nature', name: 'Nature', ability: 'int' },
  { key: 'perception', name: 'Perception', ability: 'wis' },
  { key: 'performance', name: 'Performance', ability: 'cha' },
  { key: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { key: 'religion', name: 'Religion', ability: 'int' },
  { key: 'sleightOfHand', name: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', name: 'Stealth', ability: 'dex' },
  { key: 'survival', name: 'Survival', ability: 'wis' },
];

// Hit die, saving throw proficiencies and spellcasting type per class (PHB 2024).
// caster: 'full' | 'half' | 'pact' | null
export const CLASSES = {
  Barbarian: { hitDie: 12, saves: ['str', 'con'], caster: null, spellAbility: null },
  Bard: { hitDie: 8, saves: ['dex', 'cha'], caster: 'full', spellAbility: 'cha' },
  Cleric: { hitDie: 8, saves: ['wis', 'cha'], caster: 'full', spellAbility: 'wis' },
  Druid: { hitDie: 8, saves: ['int', 'wis'], caster: 'full', spellAbility: 'wis' },
  Fighter: { hitDie: 10, saves: ['str', 'con'], caster: null, spellAbility: null },
  Monk: { hitDie: 8, saves: ['str', 'dex'], caster: null, spellAbility: null },
  Paladin: { hitDie: 10, saves: ['wis', 'cha'], caster: 'half', spellAbility: 'cha' },
  Ranger: { hitDie: 10, saves: ['str', 'dex'], caster: 'half', spellAbility: 'wis' },
  Rogue: { hitDie: 8, saves: ['dex', 'int'], caster: null, spellAbility: null },
  Sorcerer: { hitDie: 6, saves: ['con', 'cha'], caster: 'full', spellAbility: 'cha' },
  Warlock: { hitDie: 8, saves: ['wis', 'cha'], caster: 'pact', spellAbility: 'cha' },
  Wizard: { hitDie: 6, saves: ['int', 'wis'], caster: 'full', spellAbility: 'int' },
};

export const SPECIES = ['Aasimar', 'Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling'];

export const BACKGROUNDS = [
  'Acolyte', 'Artisan', 'Charlatan', 'Criminal', 'Entertainer', 'Farmer', 'Guard', 'Guide',
  'Hermit', 'Merchant', 'Noble', 'Sage', 'Sailor', 'Scribe', 'Soldier', 'Wayfarer',
];

export const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral',
  'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned',
];

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

export const DAMAGE_TYPES = [
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing',
  'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder',
];

export const WEAPON_MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];

// Spell slots by spellcaster level (multiclass Spellcaster table / full-caster progression).
// Index 0 = caster level 1. Each row lists slots for spell levels 1-9.
export const FULL_CASTER_SLOTS = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// Warlock Pact Magic: [number of slots, slot level] by Warlock level.
export const PACT_SLOTS = [
  [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5],
];

export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export const mod = (score) => Math.floor((Number(score || 0) - 10) / 2);
export const profBonus = (level) => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
export const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);

// Spellcaster level for slot purposes (PHB 2024 multiclassing: full casters count their full level,
// Paladins and Rangers count half their level rounded up). Warlock levels are excluded (Pact Magic).
export function casterLevel(classes) {
  let level = 0;
  for (const c of classes) {
    const info = CLASSES[c.name];
    if (!info) continue;
    if (info.caster === 'full') level += Number(c.level) || 0;
    else if (info.caster === 'half') level += Math.ceil((Number(c.level) || 0) / 2);
  }
  return level;
}
