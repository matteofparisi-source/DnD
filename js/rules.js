// Generic D&D 2024 rules data.
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

export const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral',
  'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned',
];

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

// Short summaries in our own words, checked against the official SRD 5.2.1 Rules Glossary (pp.177-191) on 2026-11-09.
export const CONDITION_EFFECTS = {
  Blinded: "Can't see; auto-fail ability checks that need sight. Attacks against you have Advantage; your attacks have Disadvantage.",
  Charmed: "Can't attack the charmer or target it with damaging abilities or magical effects. The charmer has Advantage on social checks against you.",
  Deafened: "Can't hear; auto-fail ability checks that need hearing.",
  Frightened: "Disadvantage on checks and attacks while the source is in sight; can't move closer to it.",
  Grappled: 'Speed 0. Disadvantage on attacks against anyone but the grappler.',
  Incapacitated: "No actions, Bonus Actions or Reactions. Concentration breaks; can't speak.",
  Invisible: 'Advantage on Initiative. Attacks against you have Disadvantage; yours have Advantage (if unseen).',
  Paralyzed: 'Incapacitated, Speed 0, auto-fail STR/DEX saves. Attacks against you have Advantage; hits within 5 ft are crits.',
  Petrified: 'Turned to stone; includes Incapacitated. Speed 0, Resistance to all damage, auto-fail STR/DEX saves, attacks against you have Advantage.',
  Poisoned: 'Disadvantage on attacks and ability checks.',
  Prone: 'Crawl, or stand up (costs half your Speed). Disadvantage on your attacks. Attacks against you have Advantage within 5 ft, Disadvantage beyond.',
  Restrained: 'Speed 0. Attacks against you have Advantage; yours have Disadvantage. Disadvantage on DEX saves.',
  Stunned: 'Incapacitated, auto-fail STR/DEX saves. Attacks against you have Advantage.',
  Unconscious: 'Incapacitated and Prone, drops items, Speed 0, auto-fail STR/DEX saves. Attacks against you have Advantage; hits within 5 ft are crits.',
};

export const DAMAGE_TYPES = [
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing',
  'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder',
];

export const WEAPON_MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];

export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export const mod = (score) => Math.floor((Number(score || 0) - 10) / 2);
export const profBonus = (level) => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
export const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);

// SRD 5.2.1 Coin Values (Equipment chapter): value of one coin in gold pieces.
export const COIN_VALUES = { cp: 1 / 100, sp: 1 / 10, ep: 1 / 2, gp: 1, pp: 10 };
