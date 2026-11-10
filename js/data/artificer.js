// Artificer (Eberron: Forge of the Artificer, 2025 rules) and the Artillerist subclass.
// Numbers only; read the book for the full rules text.

// Per Artificer level 1-20.
export const PLANS_KNOWN = [0, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8];
export const MAGIC_ITEMS = [0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6];
export const CANTRIPS = [2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4];
export const PREPARED = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15];
// Spell slots for spell levels 1-5.
export const SLOTS = [
  [2], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2],
];
export const attunementLimit = (lvl) => (lvl >= 18 ? 6 : lvl >= 14 ? 5 : lvl >= 10 ? 4 : 3);
export const maxSpellLevel = (lvl) => SLOTS[lvl - 1].length;
export const at = (arr, lvl) => arr[Math.max(1, Math.min(20, lvl)) - 1];

export const SKILL_CHOICES = ['arcana', 'history', 'investigation', 'medicine', 'nature', 'perception', 'sleightOfHand'];
export const PROFICIENCIES = {
  armor: 'Light and Medium armor, Shields',
  weapons: 'Simple weapons',
  tools: "Thieves' Tools, Tinker's Tools, one Artisan's Tools of your choice",
};
export const ARTILLERIST_PROFICIENCIES = {
  weapons: 'Martial Ranged weapons',
  tools: "Woodcarver's Tools (or another Artisan's Tools if you already have them)",
};

// Class and subclass features. `uses` is a key into USES (tracked, reset on rests).
export const FEATURES = [
  { lvl: 1, name: 'Spellcasting', text: 'INT-based half caster. Focus: Thieves\', Tinker\'s or other Artisan\'s Tools you are proficient with. Change prepared spells on a Long Rest, and swap one cantrip for another Artificer cantrip.' },
  { lvl: 1, name: "Tinker's Magic", uses: 'tinker', text: "You know Mending. Magic action with Tinker's Tools: make a small mundane item (e.g. rope, torch, bell, vial) that vanishes at the end of your next Long Rest." },
  { lvl: 2, name: 'Replicate Magic Item', text: 'Learn plans. At the end of a Long Rest, with Tinker\'s Tools, create one or two items from different known plans, up to your Magic Items total (the oldest vanishes if you exceed it). You can swap one plan each time you gain a level. Items vanish 1d4 days after you die, or at once if you replace their plan. A Wand or weapon you create can be your spellcasting focus.' },
  { lvl: 3, name: 'Artillerist: Tools of the Trade', sub: true, text: "Martial Ranged weapon and Woodcarver's Tools proficiency; crafting a magic Wand takes half the time. If you already have Woodcarver's Tools, pick another Artisan's Tools instead." },
  { lvl: 3, name: 'Artillerist: Eldritch Cannon', sub: true, uses: 'cannon', text: 'See the Eldritch Cannon panel in Combat. The cannon appears within 5 ft on a horizontal surface. One free creation per Long Rest; more by expending a spell slot. Dismiss it with a Magic action.' },
  { lvl: 4, name: 'Ability Score Improvement', text: 'Take the ASI feat or another feat you qualify for (Feats tab).' },
  { lvl: 5, name: 'Artillerist: Arcane Firearm', sub: true, text: "After a Long Rest, carve sigils (Woodcarver's Tools) into a Rod, Staff, Wand or Martial Ranged weapon. It works as your spellcasting focus, and Artificer spells cast through it add 1d8 to one damage roll. Carving a new item moves the sigils." },
  { lvl: 6, name: 'Magic Item Tinker', uses: 'drain', text: 'Charge (Bonus Action: expend a slot to restore that many charges to an item you made), Drain (Bonus Action, 1/Long Rest: an item vanishes and becomes a level 1 slot if Common, level 2 if Uncommon or Rare), Transmute (Magic action, 1/Long Rest: turn an item you made into another of your plans).' },
  { lvl: 6, name: 'Magic Item Tinker: Transmute', uses: 'transmute', text: 'Once per Long Rest.' },
  { lvl: 7, name: 'Flash of Genius', uses: 'flash', text: 'Reaction: add your INT modifier to a failed ability check or saving throw by you or a creature within 30 ft (turning it into a success if enough). Uses = INT modifier per Long Rest.' },
  { lvl: 8, name: 'Ability Score Improvement', text: 'ASI or a feat.' },
  { lvl: 9, name: 'Artillerist: Explosive Cannon', sub: true, text: 'Cannon damage and Protector temp HP +1d8. Reaction when the cannon takes damage and you are within 60 ft: detonate it (3d10 Force, DEX save for half, within 20 ft).' },
  { lvl: 10, name: 'Magic Item Adept', text: 'You can attune to up to 4 magic items.' },
  { lvl: 11, name: 'Spell-Storing Item', text: 'On a Long Rest, store a level 1-3 Artificer spell (casting time of an action) in a weapon or focus. Usable 2 × INT modifier times (min 2) with a Magic action. The spell can\'t need a consumed material component; a creature can\'t use the item again until the start of its next turn.' },
  { lvl: 12, name: 'Ability Score Improvement', text: 'ASI or a feat.' },
  { lvl: 14, name: 'Advanced Artifice', text: 'Attune to up to 5 items. Refreshed Genius: regain one Flash of Genius use on a Short Rest.' },
  { lvl: 15, name: 'Artillerist: Fortified Position', sub: true, text: 'Have two cannons at once and activate both with one Bonus Action. One Magic action creates up to two cannons: the free creation covers both, but if you pay a spell slot for the first, the second needs another slot. You and your allies within 10 ft of a cannon have Half Cover.' },
  { lvl: 16, name: 'Ability Score Improvement', text: 'ASI or a feat.' },
  { lvl: 18, name: 'Magic Item Master', text: 'Attune to up to 6 items.' },
  { lvl: 19, name: 'Epic Boon', text: 'An Epic Boon feat (Boon of Energy Resistance suggested) or another feat.' },
  { lvl: 20, name: 'Soul of Artifice', text: 'Cheat Death: at 0 HP (not killed outright), disintegrate any number of your Uncommon or Rare replicated items to go to 20 HP per item. Magical Guidance: regain all Flash of Genius uses on a Short Rest if attuned to at least one item.' },
];

// Tracked limited uses: max uses (from level and INT modifier) and what restores them (all on a Long Rest unless noted).
export const USES = {
  tinker: { name: "Tinker's Magic", max: (l, int) => Math.max(1, int), minLvl: 1 },
  cannon: { name: 'Eldritch Cannon (free creation)', max: () => 1, minLvl: 3 },
  drain: { name: 'Drain Magic Item', max: () => 1, minLvl: 6 },
  transmute: { name: 'Transmute Magic Item', max: () => 1, minLvl: 6 },
  flash: { name: 'Flash of Genius', max: (l, int) => Math.max(1, int), minLvl: 7 },
};

// Always-prepared spells by Artificer level (they don't count against prepared spells).
export const ARTILLERIST_SPELLS = [
  [3, ['Shield', 'Thunderwave']],
  [5, ['Scorching Ray', 'Shatter']],
  [9, ['Fireball', 'Wind Wall']],
  [13, ['Ice Storm', 'Wall of Fire']],
  [17, ['Cone of Cold', 'Wall of Force']],
];

export function cannonStats(level, intMod) {
  const extra = level >= 9 ? 1 : 0;
  return {
    ac: 18,
    hp: 5 * level,
    count: level >= 15 ? 2 : 1,
    flame: `${2 + extra}d8 Fire`,
    ballista: `${2 + extra}d8 Force`,
    protector: `${1 + extra}d8 ${intMod >= 0 ? '+' : '−'} ${Math.abs(intMod)} (min 1)`,
    detonate: level >= 9 ? '3d10 Force' : null,
  };
}

export const SPECIES_SUGGESTIONS = [
  'Aasimar', 'Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling',
  'Changeling', 'Kalashtar', 'Khoravar', 'Shifter', 'Warforged',
];
