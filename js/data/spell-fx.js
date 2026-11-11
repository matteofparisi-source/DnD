// What a spell changes on the caster's own numbers, keyed by spell id (see effects.js for the effect shapes).
// Only self-buffs whose numbers appear in the SRD 5.2.1 text kept (word for word) in spell-details.js (verbatim: true) are listed here.
// The effects assume you are the target. Concentration spells apply while you concentrate on them; the others get an "Active" switch on Combat.
// `note` is a short reminder in our own words; every entry carries fxSrc 'SRD 5.2.1'.
const SRD = 'SRD 5.2.1';
export const SPELL_FX = {
  shield: { fxSrc: SRD, fx: [{ type: 'ac', value: 5 }], note: 'Reaction. Lasts until the start of your next turn.' },
  haste: {
    fxSrc: SRD,
    fx: [{ type: 'ac', value: 2 }, { type: 'speedMult', value: 2 }, { type: 'note', text: 'Haste: Advantage on DEX saves and an extra limited action each turn. When it ends you are Incapacitated with Speed 0 until the end of your next turn.' }],
    note: 'Speed doubled, +2 AC. Assumes you are the target.',
  },
  longstrider: { fxSrc: SRD, fx: [{ type: 'speed', value: 10 }], note: '1 hour.' },
  aid: { fxSrc: SRD, fx: [{ type: 'hp', value: 5 }], note: '+5 max HP cast at level 2; +5 more per slot level above 2. Your current HP rises too, which you set by hand.' },
  stoneskin: { fxSrc: SRD, fx: [{ type: 'resist', target: 'Bludgeoning' }, { type: 'resist', target: 'Piercing' }, { type: 'resist', target: 'Slashing' }], note: 'Resistance to weapon damage types.' },
  darkvision: { fxSrc: SRD, fx: [{ type: 'sense', text: 'Darkvision 150 ft' }], note: '8 hours.' },
  fly: { fxSrc: SRD, fx: [{ type: 'speedMode', target: 'fly', value: 60 }, { type: 'note', text: 'Fly: you can hover; you fall when it ends if still aloft.' }], note: 'Fly Speed 60 ft.' },
  'spider-climb': { fxSrc: SRD, fx: [{ type: 'speedMode', target: 'climb', value: 'walk' }, { type: 'note', text: 'Spider Climb: walk on walls and ceilings with your hands free.' }], note: 'Climb Speed equal to your Speed.' },
  'protection-from-poison': { fxSrc: SRD, fx: [{ type: 'resist', target: 'Poison' }, { type: 'note', text: 'Protection from Poison: Advantage on saves against the Poisoned condition.' }], note: '1 hour.' },
  'freedom-of-movement': { fxSrc: SRD, fx: [{ type: 'speedMode', target: 'swim', value: 'walk' }, { type: 'note', text: 'Freedom of Movement: ignores Difficult Terrain; spells and effects cannot slow, Paralyze or Restrain you.' }], note: 'Swim Speed equal to your Speed.' },
  'see-invisibility': { fxSrc: SRD, fx: [{ type: 'sense', text: 'Sees Invisible creatures and objects (see invisibility)' }], note: '1 hour.' },
  blur: { fxSrc: SRD, fx: [{ type: 'note', text: 'Blur: creatures have Disadvantage on attack rolls against you (not if they have Blindsight or Truesight).' }], note: 'Reminder only, no number changes.' },
};
