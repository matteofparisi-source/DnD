// Checked against the official D&D System Reference Document 5.2.1 (CC-BY-4.0), weapons p.91, armor p.92, on 2026-11-09.
// Easy to correct: one line per entry.
// W(name, category, range, dice, type, props, mastery). finesse/thrown are read from the properties text.
const W = (name, category, range, dice, type, props, mastery) => ({
  name, category, range, dice, type, props, mastery,
  finesse: /\bfinesse\b/i.test(props), thrown: /\bthrown\b/i.test(props),
});

export const WEAPONS = [
  // Simple melee
  W('Club', 'simple', 'melee', '1d4', 'Bludgeoning', 'Light', 'Slow'),
  W('Dagger', 'simple', 'melee', '1d4', 'Piercing', 'Finesse, Light, Thrown (20/60)', 'Nick'),
  W('Greatclub', 'simple', 'melee', '1d8', 'Bludgeoning', 'Two-Handed', 'Push'),
  W('Handaxe', 'simple', 'melee', '1d6', 'Slashing', 'Light, Thrown (20/60)', 'Vex'),
  W('Javelin', 'simple', 'melee', '1d6', 'Piercing', 'Thrown (30/120)', 'Slow'),
  W('Light Hammer', 'simple', 'melee', '1d4', 'Bludgeoning', 'Light, Thrown (20/60)', 'Nick'),
  W('Mace', 'simple', 'melee', '1d6', 'Bludgeoning', '', 'Sap'),
  W('Quarterstaff', 'simple', 'melee', '1d6', 'Bludgeoning', 'Versatile (1d8)', 'Topple'),
  W('Sickle', 'simple', 'melee', '1d4', 'Slashing', 'Light', 'Nick'),
  W('Spear', 'simple', 'melee', '1d6', 'Piercing', 'Thrown (20/60), Versatile (1d8)', 'Sap'),
  // Simple ranged
  W('Dart', 'simple', 'ranged', '1d4', 'Piercing', 'Finesse, Thrown (20/60)', 'Vex'),
  W('Light Crossbow', 'simple', 'ranged', '1d8', 'Piercing', 'Ammunition (80/320), Loading, Two-Handed', 'Slow'),
  W('Shortbow', 'simple', 'ranged', '1d6', 'Piercing', 'Ammunition (80/320), Two-Handed', 'Vex'),
  W('Sling', 'simple', 'ranged', '1d4', 'Bludgeoning', 'Ammunition (30/120)', 'Slow'),
  // Martial melee
  W('Battleaxe', 'martial', 'melee', '1d8', 'Slashing', 'Versatile (1d10)', 'Topple'),
  W('Flail', 'martial', 'melee', '1d8', 'Bludgeoning', '', 'Sap'),
  W('Glaive', 'martial', 'melee', '1d10', 'Slashing', 'Heavy, Reach, Two-Handed', 'Graze'),
  W('Greataxe', 'martial', 'melee', '1d12', 'Slashing', 'Heavy, Two-Handed', 'Cleave'),
  W('Greatsword', 'martial', 'melee', '2d6', 'Slashing', 'Heavy, Two-Handed', 'Graze'),
  W('Halberd', 'martial', 'melee', '1d10', 'Slashing', 'Heavy, Reach, Two-Handed', 'Cleave'),
  W('Lance', 'martial', 'melee', '1d10', 'Piercing', 'Heavy, Reach, Two-Handed (unless mounted)', 'Topple'),
  W('Longsword', 'martial', 'melee', '1d8', 'Slashing', 'Versatile (1d10)', 'Sap'),
  W('Maul', 'martial', 'melee', '2d6', 'Bludgeoning', 'Heavy, Two-Handed', 'Topple'),
  W('Morningstar', 'martial', 'melee', '1d8', 'Piercing', '', 'Sap'),
  W('Pike', 'martial', 'melee', '1d10', 'Piercing', 'Heavy, Reach, Two-Handed', 'Push'),
  W('Rapier', 'martial', 'melee', '1d8', 'Piercing', 'Finesse', 'Vex'),
  W('Scimitar', 'martial', 'melee', '1d6', 'Slashing', 'Finesse, Light', 'Nick'),
  W('Shortsword', 'martial', 'melee', '1d6', 'Piercing', 'Finesse, Light', 'Vex'),
  W('Trident', 'martial', 'melee', '1d8', 'Piercing', 'Thrown (20/60), Versatile (1d10)', 'Topple'),
  W('Warhammer', 'martial', 'melee', '1d8', 'Bludgeoning', 'Versatile (1d10)', 'Push'),
  W('War Pick', 'martial', 'melee', '1d8', 'Piercing', 'Versatile (1d10)', 'Sap'),
  W('Whip', 'martial', 'melee', '1d4', 'Slashing', 'Finesse, Reach', 'Slow'),
  // Martial ranged
  W('Blowgun', 'martial', 'ranged', '1', 'Piercing', 'Ammunition (25/100), Loading', 'Vex'),
  W('Hand Crossbow', 'martial', 'ranged', '1d6', 'Piercing', 'Ammunition (30/120), Light, Loading', 'Vex'),
  W('Heavy Crossbow', 'martial', 'ranged', '1d10', 'Piercing', 'Ammunition (100/400), Heavy, Loading, Two-Handed', 'Push'),
  W('Longbow', 'martial', 'ranged', '1d8', 'Piercing', 'Ammunition (150/600), Heavy, Two-Handed', 'Slow'),
  W('Musket', 'martial', 'ranged', '1d12', 'Piercing', 'Ammunition (40/120), Loading, Two-Handed', 'Slow'),
  W('Pistol', 'martial', 'ranged', '1d10', 'Piercing', 'Ammunition (30/90), Loading', 'Vex'),
];

// A(name, armorType, baseAC, str requirement or 0, stealth Disadvantage)
const A = (name, armorType, baseAC, str = 0, stealth = false) => ({ name, armorType, baseAC, str, stealth });
export const ARMOR = [
  A('Padded', 'light', 11, 0, true), A('Leather', 'light', 11), A('Studded Leather', 'light', 12),
  A('Hide', 'medium', 12), A('Chain Shirt', 'medium', 13), A('Scale Mail', 'medium', 14, 0, true),
  A('Breastplate', 'medium', 14), A('Half Plate', 'medium', 15, 0, true),
  A('Ring Mail', 'heavy', 14, 0, true), A('Chain Mail', 'heavy', 16, 13, true), A('Splint', 'heavy', 17, 15, true), A('Plate', 'heavy', 18, 15, true),
];
