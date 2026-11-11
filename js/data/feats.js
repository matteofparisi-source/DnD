// Feats from: Player's Handbook (2024), Tasha's Cauldron of Everything, Xanathar's Guide to Everything,
// Eberron: Forge of the Artificer. Summaries are short reminders in our own words, not the rules text.
// req: { lvl, abil: [...], min, text, need } — `need` is checked automatically where possible:
//   'fightingStyle' | 'heavyArmor' | 'species:<words>' | 'feat:<feat id>' | 'anyMark'
const F = (name, cat, src, req = {}, sum = '', repeatable = false) => ({ name, cat, src, req, sum, repeatable });
const G4 = (extra = {}) => ({ lvl: 4, ...extra });

export const FEATS = [
  // ---- PHB 2024: Origin
  F('Alert', 'Origin', 'PHB', {}, 'Add your Proficiency Bonus to Initiative; swap Initiative with a willing ally.'),
  F('Crafter', 'Origin', 'PHB', {}, "Three Artisan's Tools proficiencies, 20% discount on nonmagical gear, faster crafting."),
  F('Healer', 'Origin', 'PHB', {}, "Healer's Kit lets a creature spend a Hit Die to heal; reroll 1s on healing dice."),
  F('Lucky', 'Origin', 'PHB', {}, 'Luck points equal to your Proficiency Bonus per Long Rest: give yourself Advantage or impose Disadvantage.'),
  F('Magic Initiate', 'Origin', 'PHB', {}, 'Two cantrips and a level 1 spell from the Cleric, Druid or Wizard list; cast that spell once free per Long Rest.', true),
  F('Musician', 'Origin', 'PHB', {}, 'Instrument proficiencies; after a rest, give Heroic Inspiration to allies.'),
  F('Savage Attacker', 'Origin', 'PHB', {}, 'Once per turn, roll weapon damage dice twice and use either roll.'),
  F('Skilled', 'Origin', 'PHB', {}, 'Proficiency in any three skills or tools.', true),
  F('Tavern Brawler', 'Origin', 'PHB', {}, 'Better Unarmed Strikes (1d4), reroll 1s, push on hit, improvised weapon proficiency.'),
  F('Tough', 'Origin', 'PHB', {}, '+2 Hit Point maximum per character level.'),

  // ---- PHB 2024: General (level 4+)
  F('Ability Score Improvement', 'General', 'PHB', G4(), '+2 to one ability score or +1 to two (max 20).', true),
  F('Actor', 'General', 'PHB', G4({ abil: ['cha'], min: 13 }), 'Impersonation and mimicry: Advantage on related Deception/Performance checks.'),
  F('Athlete', 'General', 'PHB', G4({ abil: ['str', 'dex'], min: 13 }), 'Climb Speed, quick stand up, better jumps.'),
  F('Charger', 'General', 'PHB', G4({ abil: ['str', 'dex'], min: 13 }), 'Dash then attack for extra damage or a push.'),
  F('Chef', 'General', 'PHB', G4(), "Cook's Utensils; treats that give Temporary HP; extra healing on a Short Rest."),
  F('Crossbow Expert', 'General', 'PHB', G4({ abil: ['dex'], min: 13 }), 'Ignore Loading, no Disadvantage firing in melee, better dual-wielded crossbows.'),
  F('Crusher', 'General', 'PHB', G4({ abil: ['str', 'con'], min: 13 }), 'Bludgeoning hits push 5 ft; your critical hits grant allies Advantage.'),
  F('Defensive Duelist', 'General', 'PHB', G4({ abil: ['dex'], min: 13 }), 'Reaction: add Proficiency Bonus to AC while wielding a Finesse weapon.'),
  F('Dual Wielder', 'General', 'PHB', G4({ abil: ['str', 'dex'], min: 13 }), 'Extra off-hand attack options and draw two weapons at once.'),
  F('Durable', 'General', 'PHB', G4(), 'Advantage on Death Saving Throws; Bonus Action to spend a Hit Die and heal.'),
  F('Elemental Adept', 'General', 'PHB', G4({ text: 'Spellcasting or Pact Magic' }), 'Your spells ignore Resistance to a chosen damage type and treat 1s as 2s.', true),
  F('Fey Touched', 'General', 'PHB', G4(), '+1 INT/WIS/CHA. Misty Step and a level 1 Divination/Enchantment spell, each once free per Long Rest.'),
  F('Grappler', 'General', 'PHB', G4({ abil: ['str', 'dex'], min: 13 }), 'Better grappling: punch and grab, Advantage against grappled targets.'),
  F('Great Weapon Master', 'General', 'PHB', G4({ abil: ['str'], min: 13 }), 'Extra damage with Heavy weapons; Bonus Action attack after a crit or kill.'),
  F('Heavily Armored', 'General', 'PHB', G4({ text: 'Medium armor training' }), 'Heavy armor training.'),
  F('Heavy Armor Master', 'General', 'PHB', G4({ text: 'Heavy armor training', need: 'heavyArmor' }), 'Reduce bludgeoning, piercing and slashing damage while in heavy armor.'),
  F('Inspiring Leader', 'General', 'PHB', G4({ abil: ['wis', 'cha'], min: 13 }), 'After a rest, give allies Temporary HP.'),
  F('Keen Mind', 'General', 'PHB', G4({ abil: ['int'], min: 13 }), '+1 INT, expertise-style boost to a knowledge skill, Study action as a Bonus Action.'),
  F('Lightly Armored', 'General', 'PHB', G4(), 'Light armor and Shield training.'),
  F('Mage Slayer', 'General', 'PHB', G4(), 'Disrupt concentration, and once per rest succeed on a failed mental save.'),
  F('Martial Weapon Training', 'General', 'PHB', G4(), 'Martial weapon proficiency.'),
  F('Medium Armor Master', 'General', 'PHB', G4({ text: 'Medium armor training' }), 'Up to +3 DEX to AC in medium armor.'),
  F('Moderately Armored', 'General', 'PHB', G4({ text: 'Light armor training' }), 'Medium armor and Shield training.'),
  F('Mounted Combatant', 'General', 'PHB', G4(), 'Advantages while mounted; protect your mount.'),
  F('Observant', 'General', 'PHB', G4({ abil: ['int', 'wis'], min: 13 }), '+1 INT or WIS, skill boost, Search action as a Bonus Action.'),
  F('Piercer', 'General', 'PHB', G4(), 'Reroll a piercing damage die once per turn; bigger critical hits.'),
  F('Poisoner', 'General', 'PHB', G4(), "Ignore poison Resistance; make potent poisons with a Poisoner's Kit."),
  F('Polearm Master', 'General', 'PHB', G4({ abil: ['str', 'dex'], min: 13 }), 'Bonus Action butt-end attack; Reaction attack when enemies enter reach.'),
  F('Resilient', 'General', 'PHB', G4(), '+1 to an ability and proficiency in its saving throw (e.g. WIS or DEX).'),
  F('Ritual Caster', 'General', 'PHB', G4({ abil: ['int', 'wis', 'cha'], min: 13 }), 'Always have some level 1 Ritual spells prepared; quick ritual casting.'),
  F('Sentinel', 'General', 'PHB', G4({ abil: ['str', 'dex'], min: 13 }), 'Opportunity attacks stop movement and punish attacks on allies.'),
  F('Shadow Touched', 'General', 'PHB', G4(), '+1 INT/WIS/CHA. Invisibility and a level 1 Illusion/Necromancy spell, each once free per Long Rest.'),
  F('Sharpshooter', 'General', 'PHB', G4({ abil: ['dex'], min: 13 }), 'Ignore cover, long range without Disadvantage, fire in melee.'),
  F('Shield Master', 'General', 'PHB', G4({ text: 'Shield training' }), 'Shield bash push, add Shield to DEX saves, evasion-like Reaction.'),
  F('Skill Expert', 'General', 'PHB', G4(), '+1 ability, one skill proficiency, Expertise in one skill.'),
  F('Skulker', 'General', 'PHB', G4({ abil: ['dex'], min: 13 }), 'Blindsight 10 ft, stay hidden when you miss.'),
  F('Slasher', 'General', 'PHB', G4(), 'Slashing hits slow the target; crits impose Disadvantage.'),
  F('Speedy', 'General', 'PHB', G4({ abil: ['dex', 'con'], min: 13 }), '+10 ft Speed, Dash ignores Difficult Terrain.'),
  F('Spell Sniper', 'General', 'PHB', G4({ text: 'Spellcasting or Pact Magic' }), '+1 INT/WIS/CHA. Longer spell attack range, ignore Half and Three-Quarters Cover, no Disadvantage in melee.'),
  F('Telekinetic', 'General', 'PHB', G4(), '+1 INT/WIS/CHA. Invisible Mage Hand; Bonus Action shove 5 ft.'),
  F('Telepathic', 'General', 'PHB', G4(), '+1 INT/WIS/CHA. Telepathic speech; Detect Thoughts once free per Long Rest.'),
  F('War Caster', 'General', 'PHB', G4({ text: 'Spellcasting or Pact Magic' }), '+1 INT/WIS/CHA. Advantage on Concentration saves, cast with hands full, spell as an Opportunity Attack.'),
  F('Weapon Master', 'General', 'PHB', G4(), 'Mastery property of one more weapon kind.'),

  // ---- PHB 2024: Fighting Style (needs the Fighting Style feature; Artificers don't have it)
  ...['Archery', 'Blind Fighting', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Interception', 'Protection',
    'Thrown Weapon Fighting', 'Two-Weapon Fighting', 'Unarmed Fighting'].map((n) => F(n, 'Fighting Style', 'PHB', { text: 'Fighting Style feature', need: 'fightingStyle' })),

  // ---- PHB 2024: Epic Boons (level 19+)
  F('Boon of Combat Prowess', 'Epic Boon', 'PHB', { lvl: 19 }, 'Once per turn, turn a missed attack into a hit.'),
  F('Boon of Dimensional Travel', 'Epic Boon', 'PHB', { lvl: 19 }, 'Teleport 30 ft after an Attack or Magic action.'),
  F('Boon of Energy Resistance', 'Epic Boon', 'PHB', { lvl: 19 }, 'Resistance to two damage types; redirect that damage. Suggested by the Artificer class.'),
  F('Boon of Fate', 'Epic Boon', 'PHB', { lvl: 19 }, 'Add or subtract 2d4 from a D20 Test you can see.'),
  F('Boon of Fortitude', 'Epic Boon', 'PHB', { lvl: 19 }, '+40 HP maximum and extra healing.'),
  F('Boon of Irresistible Offense', 'Epic Boon', 'PHB', { lvl: 19 }, 'Ignore bludgeoning/piercing/slashing Resistance; bigger crits.'),
  F('Boon of Recovery', 'Epic Boon', 'PHB', { lvl: 19 }, 'Survive at 1 HP once per Long Rest; pool of d10s to heal.'),
  F('Boon of Skill', 'Epic Boon', 'PHB', { lvl: 19 }, 'Proficiency in all skills, Expertise in one.'),
  F('Boon of Speed', 'Epic Boon', 'PHB', { lvl: 19 }, '+30 ft Speed, Disengage as a Bonus Action.'),
  F('Boon of Spell Recall', 'Epic Boon', 'PHB', { lvl: 19, text: 'Spellcasting' }, 'When you cast with a level 1-4 slot, roll a d4: if it equals the slot level, the slot is not used up.'),
  F('Boon of the Night Spirit', 'Epic Boon', 'PHB', { lvl: 19 }, 'Invisible in Dim Light or Darkness; Resistance there.'),
  F('Boon of Truesight', 'Epic Boon', 'PHB', { lvl: 19 }, 'Truesight 60 ft.'),

  // ---- Tasha's Cauldron of Everything (feats not reprinted in the 2024 PHB)
  F('Artificer Initiate', 'General', "Tasha's", {}, 'An Artificer cantrip and level 1 spell; tool proficiency. Mostly useful for non-Artificers.'),
  F('Eldritch Adept', 'General', "Tasha's", { text: 'Spellcasting or Pact Magic' }, 'Learn one Eldritch Invocation (2014 Warlock).'),
  F('Fighting Initiate', 'General', "Tasha's", { text: 'Martial weapon proficiency' }, 'Learn a Fighting Style (2014 rules; superseded by 2024 Fighting Style feats).'),
  F('Gunner', 'General', "Tasha's", {}, '+1 DEX, firearms proficiency, ignore Loading, no Disadvantage on ranged attacks from hostile creatures within 5 ft. Firearms are rare in Eberron: ask your DM.'),
  F('Metamagic Adept', 'General', "Tasha's", { text: 'Spellcasting or Pact Magic' }, 'Two Metamagic options and 2 Sorcery Points.'),

  // ---- Xanathar's Guide to Everything (racial feats, 2014 species)
  F('Bountiful Luck', 'Racial', "Xanathar's", { text: 'Halfling', need: 'species:halfling' }, 'Share your Luck with nearby allies.'),
  F('Dragon Fear', 'Racial', "Xanathar's", { text: 'Dragonborn', need: 'species:dragonborn' }, 'Breath weapon use can frighten instead.'),
  F('Dragon Hide', 'Racial', "Xanathar's", { text: 'Dragonborn', need: 'species:dragonborn' }, 'Natural armor and claws.'),
  F('Drow High Magic', 'Racial', "Xanathar's", { text: 'Elf (drow)', need: 'species:elf' }, 'Detect Magic at will, Levitate and Dispel Magic once per Long Rest.'),
  F('Dwarven Fortitude', 'Racial', "Xanathar's", { text: 'Dwarf', need: 'species:dwarf' }, 'Spend a Hit Die when you Dodge.'),
  F('Elven Accuracy', 'Racial', "Xanathar's", { text: 'Elf or Khoravar (half-elf)', need: 'species:elf|khoravar|half-elf' }, 'Reroll one die when attacking with Advantage using DEX/INT/WIS/CHA.'),
  F('Fade Away', 'Racial', "Xanathar's", { text: 'Gnome', need: 'species:gnome' }, 'Reaction: turn invisible after taking damage.'),
  F('Fey Teleportation', 'Racial', "Xanathar's", { text: 'Elf (high)', need: 'species:elf' }, 'Misty Step once per rest; Sylvan.'),
  F('Flames of Phlegethos', 'Racial', "Xanathar's", { text: 'Tiefling', need: 'species:tiefling' }, 'Reroll 1s on fire spell damage; wreathed in flames.'),
  F('Infernal Constitution', 'Racial', "Xanathar's", { text: 'Tiefling', need: 'species:tiefling' }, 'Resistance to cold and poison.'),
  F('Orcish Fury', 'Racial', "Xanathar's", { text: 'Half-orc / Orc', need: 'species:orc' }, 'Extra weapon die once per rest.'),
  F('Prodigy', 'Racial', "Xanathar's", { text: 'Human, Khoravar (half-elf) or half-orc', need: 'species:human|khoravar|half-elf|orc' }, 'Skill, tool, language, and Expertise in one skill.'),
  F('Second Chance', 'Racial', "Xanathar's", { text: 'Halfling', need: 'species:halfling' }, 'Force an attacker to reroll once per rest.'),
  F('Squat Nimbleness', 'Racial', "Xanathar's", { text: 'Dwarf or a Small species', need: 'species:dwarf|gnome|halfling' }, '+5 ft Speed, Acrobatics or Athletics, escape grapples easily.'),
  F('Wood Elf Magic', 'Racial', "Xanathar's", { text: 'Elf (wood)', need: 'species:elf' }, 'A Druid cantrip, Longstrider and Pass without Trace.'),

  // ---- Eberron: Forge of the Artificer — Dragonmarks (certain Eberron backgrounds grant one at level 1, otherwise take it as a feat from level 4; one per character)
  ...[
    ['Aberrant Dragonmark', 'A Sorcerer cantrip and level 1 spell (CON), the spell free once per rest. Reaction: +1d4 to a failed CON save, once per Long Rest. Aberrant Surge.'],
    ['Mark of Detection', '+1d4 to Investigation and Insight; free Detect Magic, Detect Poison and Disease, See Invisibility.'],
    ['Mark of Finding', "+1d4 to Perception and Survival; free Hunter's Mark and Locate Object."],
    ['Mark of Handling', '+1d4 to Animal Handling and Nature; Animal Friendship and Speak with Animals.'],
    ['Mark of Healing', "+1d4 to Medicine and Herbalism Kit; free Cure Wounds and Lesser Restoration."],
    ['Mark of Hospitality', "+1d4 to Persuasion, Brewer's Supplies, Cook's Utensils; Purify Food and Drink, Unseen Servant, Calm Emotions."],
    ['Mark of Making', "+1d4 to Arcana and Artisan's Tools; Mending and Magic Weapon. A natural fit for an Artificer."],
    ['Mark of Passage', '+1d4 to Acrobatics and Athletics; +5 ft Speed; Misty Step.'],
    ['Mark of Scribing', "+1d4 to History and Calligrapher's Supplies; Message cantrip, Comprehend Languages; Magic Mouth at level 3."],
    ['Mark of Sentinel', '+1d4 to Insight and Perception; Shield; Reaction: swap places with a creature within 5 ft that was hit and take the hit (Proficiency Bonus uses per Long Rest).'],
    ['Mark of Shadow', '+1d4 to Performance and Stealth; Minor Illusion and Invisibility.'],
    ['Mark of Storm', "+1d4 to Acrobatics and Navigator's Tools; Lightning Resistance; Thunderclap and Gust of Wind."],
    ['Mark of Warding', "+1d4 to Investigation and Thieves' Tools; Alarm, Mage Armor, Arcane Lock."],
  ].map(([n, s]) => F(n, 'Dragonmark', 'Eberron', { text: 'Eberron campaign; no other Dragonmark feat' }, s)),
  // Greater Dragonmarks (level 4+, need the matching Dragonmark feat). The book files these under General; the
  // 'Greater Dragonmark' category is only our UI grouping. Each: +1 to an ability score (Aberrant: CON) and the mark's d4 becomes d6.
  ...[
    ['Aberrant', 'Aberrant Fortitude (1d6 on failed CON saves, Short or Long Rest); Mark of Inspiration: Hit Die temp HP and Force damage, Proficiency Bonus uses per Long Rest.'],
    ['Detection', 'Share See Invisibility with others (30 ft).'],
    ['Finding', "Hunter's Mark has double range and ignores invisibility."],
    ['Handling', 'Reaction benefit for your mount; Subdue Animal (WIS save, Proficiency Bonus uses per Long Rest).'],
    ['Healing', 'Cure Wounds free Proficiency Bonus times per Long Rest; healing dice of 1 or 2 count as 3.'],
    ['Hospitality', 'Purify Food and Drink can remove 1 Exhaustion level and grant temp HP, once per Long Rest.'],
    ['Making', 'Magic Weapon is cast at 3rd level.'],
    ['Passage', 'Reaction: teleport 2 allies up to 30 ft.'],
    ['Scribing', 'Share Comprehend Languages; telepathy at 1 mile, once per Long Rest.'],
    ['Sentinel', 'Make an attack when you swap places with Mark of Sentinel.'],
    ['Shadow', 'Invisibility is cast at 3rd level.'],
    ['Storm', 'Gust of Wind plus a 60 ft Fly Speed.'],
    ['Warding', 'Reaction: impose Disadvantage on an attack against an ally, Proficiency Bonus uses per Long Rest.'],
  ].map(([m, s]) => {
    const base = m === 'Aberrant' ? 'Aberrant Dragonmark' : `Mark of ${m}`;
    return F(m === 'Aberrant' ? 'Greater Aberrant Mark' : `Greater Mark of ${m}`, 'Greater Dragonmark', 'Eberron',
      { lvl: 4, text: base, need: `feat:${base}` }, `${m === 'Aberrant' ? '+1 CON' : '+1 to an ability'}; mark die d4 becomes d6. ${s}`);
  }),
  F('Potent Dragonmark', 'General', 'Eberron', { lvl: 4, text: 'Any Dragonmark feat', need: 'anyMark' }, "Your mark's spell list is always prepared. Gain one extra spell slot of a level equal to half your level (rounded up, max 5), for mark spells only; recharges on a Short or Long Rest."),
  F('Boon of Siberys', 'Epic Boon', 'Eberron', { lvl: 19, text: 'Eberron campaign' }, '+1 to an ability score (max 30). Pick one Sorcerer or Siberys-table spell of level 8 or lower: always prepared, cast once per Short or Long Rest without a slot or components.'),
].map((f) => ({ ...f, id: f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));

export const FEAT_CATEGORIES = ['Origin', 'General', 'Fighting Style', 'Epic Boon', 'Dragonmark', 'Greater Dragonmark', 'Racial'];
export const FEAT_SOURCES = ['PHB', "Tasha's", "Xanathar's", 'Eberron'];
