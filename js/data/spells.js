// Artificer spells. [name, level, school, flags] where flags may contain C (concentration) and R (ritual).
// Source groups:
//  - 'list':   the Artificer spell list for the 2025 Forge of the Artificer class
//  - 'artillerist': Artillerist subclass spells (always prepared at the listed level; not on the class list)
//  - 'extra':  spells from official books outside the user's set (PHB 2024, Tasha's, Xanathar's, Eberron: Forge of
//              the Artificer). They sit on the 2025 list but carry a `book` name; hidden by default (see EXTRA_BOOK).
//  - 'legacy': spells on the 2020 Tasha's artificer list (Xanathar's/Tasha's spells) that the 2025 list
//              doesn't show. Hidden by default: check with your DM before using them.
const L = (name, level, school, flags = '') => ({ name, level, school, flags });

const LIST = [
  // Cantrips
  L('Acid Splash', 0, 'Evocation'), L('Dancing Lights', 0, 'Illusion', 'C'), L('Elementalism', 0, 'Transmutation'),
  L('Fire Bolt', 0, 'Evocation'), L('Guidance', 0, 'Divination', 'C'), L('Light', 0, 'Evocation'),
  L('Mage Hand', 0, 'Conjuration'), L('Message', 0, 'Transmutation'), L('Poison Spray', 0, 'Necromancy'),
  L('Prestidigitation', 0, 'Transmutation'), L('Ray of Frost', 0, 'Evocation'), L('Resistance', 0, 'Abjuration', 'C'),
  L('Shocking Grasp', 0, 'Evocation'), L('Spare the Dying', 0, 'Necromancy'), L('Thorn Whip', 0, 'Transmutation'),
  L('Thunderclap', 0, 'Evocation'), L('True Strike', 0, 'Divination'),
  // 1st
  L('Alarm', 1, 'Abjuration', 'R'), L('Cure Wounds', 1, 'Abjuration'), L('Detect Magic', 1, 'Divination', 'CR'),
  L('Disguise Self', 1, 'Illusion'), L('Expeditious Retreat', 1, 'Transmutation', 'C'), L('Faerie Fire', 1, 'Evocation', 'C'),
  L('False Life', 1, 'Necromancy'), L('Feather Fall', 1, 'Transmutation'), L('Grease', 1, 'Conjuration'),
  L('Identify', 1, 'Divination', 'R'), L('Jump', 1, 'Transmutation'), L('Longstrider', 1, 'Transmutation'),
  L('Purify Food and Drink', 1, 'Transmutation', 'R'), L('Quick Clothier', 1, 'Transmutation'), L('Sanctuary', 1, 'Abjuration'),
  // 2nd
  L('Aid', 2, 'Abjuration'), L('Alter Self', 2, 'Transmutation', 'C'), L('Arcane Lock', 2, 'Abjuration'),
  L('Arcane Vigor', 2, 'Abjuration'), L('Blur', 2, 'Illusion', 'C'), L('Conjure Tools', 2, 'Conjuration'),
  L('Continual Flame', 2, 'Evocation'), L('Darkvision', 2, 'Transmutation'), L("Dragon's Breath", 2, 'Transmutation', 'C'),
  L('Dueling Ground', 2, 'Abjuration', 'R'), L('Enhance Ability', 2, 'Transmutation', 'C'), L('Enlarge/Reduce', 2, 'Transmutation', 'C'),
  L('Heat Metal', 2, 'Transmutation', 'C'), L('Homunculus Servant', 2, 'Conjuration', 'R'), L('Invisibility', 2, 'Illusion', 'C'),
  L('Lesser Restoration', 2, 'Abjuration'), L('Levitate', 2, 'Transmutation', 'C'), L('Magic Mouth', 2, 'Illusion', 'R'),
  L('Magic Weapon', 2, 'Transmutation'), L('Protection from Poison', 2, 'Abjuration'), L('Rope Trick', 2, 'Transmutation'),
  L('See Invisibility', 2, 'Divination'), L('Spider Climb', 2, 'Transmutation', 'C'), L('Tortoise Shell', 2, 'Abjuration', 'C'),
  L('Uncertain Footing', 2, 'Illusion', 'C'), L('Web', 2, 'Conjuration', 'C'),
  // 3rd
  L('Blink', 3, 'Transmutation'), L('Catnap', 3, 'Enchantment'), L('Create Food and Water', 3, 'Conjuration'),
  L('Dispel Magic', 3, 'Abjuration'), L('Elemental Weapon', 3, 'Transmutation', 'C'), L('Fly', 3, 'Transmutation', 'C'),
  L('Glyph of Warding', 3, 'Abjuration'), L('Haste', 3, 'Transmutation', 'C'), L('Protection from Energy', 3, 'Abjuration', 'C'),
  L('Revivify', 3, 'Necromancy'), L('Water Breathing', 3, 'Transmutation', 'R'), L('Water Walk', 3, 'Transmutation', 'R'),
  // 4th
  L('Arcane Eye', 4, 'Divination', 'C'), L('Distorted Distance', 4, 'Illusion', 'C'), L('Fabricate', 4, 'Transmutation'),
  L('Freedom of Movement', 4, 'Abjuration'), L("Leomund's Secret Chest", 4, 'Conjuration'), L("Mordenkainen's Faithful Hound", 4, 'Conjuration'),
  L("Mordenkainen's Private Sanctum", 4, 'Abjuration'), L("Otiluke's Resilient Sphere", 4, 'Abjuration', 'C'), L('Stone Shape', 4, 'Transmutation'),
  L('Stoneskin', 4, 'Transmutation', 'C'), L('Summon Construct', 4, 'Conjuration', 'C'),
  // 5th
  L('Animate Objects', 5, 'Transmutation', 'C'), L("Bigby's Hand", 5, 'Evocation', 'C'), L('Circle of Power', 5, 'Abjuration', 'C'),
  L('Creation', 5, 'Illusion'), L('Greater Restoration', 5, 'Abjuration'), L('Spirit Lantern', 5, 'Necromancy'),
  L('Wall of Stone', 5, 'Evocation', 'C'),
];

const ARTILLERIST = [
  L('Shield', 1, 'Abjuration'), L('Thunderwave', 1, 'Evocation'), L('Scorching Ray', 2, 'Evocation'), L('Shatter', 2, 'Evocation'),
  L('Fireball', 3, 'Evocation'), L('Wind Wall', 3, 'Evocation', 'C'), L('Ice Storm', 4, 'Evocation'), L('Wall of Fire', 4, 'Evocation', 'C'),
  L('Cone of Cold', 5, 'Evocation'), L('Wall of Force', 5, 'Evocation', 'C'),
];

const LEGACY = [
  L('Booming Blade', 0, 'Evocation'), L('Create Bonfire', 0, 'Conjuration', 'C'), L('Frostbite', 0, 'Evocation'),
  L('Green-Flame Blade', 0, 'Evocation'), L('Lightning Lure', 0, 'Evocation'), L('Magic Stone', 0, 'Transmutation'),
  L('Sword Burst', 0, 'Conjuration'),
  L('Absorb Elements', 1, 'Abjuration'), L('Catapult', 1, 'Transmutation'), L('Snare', 1, 'Abjuration'),
  L("Tasha's Caustic Brew", 1, 'Evocation', 'C'),
  L('Pyrotechnics', 2, 'Transmutation'), L('Skywrite', 2, 'Transmutation', 'CR'),
  L('Flame Arrows', 3, 'Transmutation', 'C'), L('Intellect Fortress', 3, 'Abjuration', 'C'), L('Tiny Servant', 3, 'Transmutation'),
  L('Elemental Bane', 4, 'Transmutation', 'C'),
  L('Skill Empowerment', 5, 'Transmutation', 'C'), L('Transmute Rock', 5, 'Transmutation'),
];

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const EXTRA_BOOK = {
  'Spirit Lantern': 'Arcana Unleashed', 'Distorted Distance': 'Arcana Unleashed', 'Uncertain Footing': 'Arcana Unleashed',
  'Dueling Ground': 'Arcana Unleashed', 'Tortoise Shell': 'D&D Beyond Drops (June 2026)',
  'Conjure Tools': 'D&D Beyond Drops (September 2026)', 'Quick Clothier': 'D&D Beyond Drops (September 2026)',
};
const tag = (src) => (s) => (EXTRA_BOOK[s.name]
  ? { ...s, id: slug(s.name), source: 'extra', book: EXTRA_BOOK[s.name] }
  : { ...s, id: slug(s.name), source: src });

export const SPELLS = [
  ...LIST.map(tag('list')),
  { ...L('Mending', 0, 'Transmutation'), id: 'mending', source: 'tinker' },
  ...ARTILLERIST.map(tag('artillerist')),
  ...LEGACY.map(tag('legacy')),
];

export const SOURCE_LABEL = {
  list: 'Artificer list',
  tinker: "Tinker's Magic",
  artillerist: 'Artillerist',
  legacy: "Tasha's 2020 list",
  extra: 'Other official book',
};
export const SCHOOLS = [...new Set(SPELLS.map((s) => s.school))].sort();
