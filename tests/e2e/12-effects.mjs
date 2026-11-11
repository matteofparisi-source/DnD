// Effects: item effects (equipped/attuned gating), ability bonus and breakdown text, "+" toggles, spell effects (concentration, buffs), long rest.
import { openPage, go, saved, text, auditOk, tryRequire } from '../lib.mjs';

export const name = 'Effects and breakdowns';

export async function run(env, t) {
  const { newItem } = await import(new URL('../../js/store.js', import.meta.url));
  const mut = (s) => {
    const c = s.character;
    c.abilities.int = 16;
    c.items.push(newItem({ name: 'Warding Charm', type: 'Wondrous', rarity: 'Rare', needsAttune: true, effects: [{ id: 'e1', type: 'ac', value: 1, cond: '' }] }));
    c.items.push(newItem({ name: 'Mind Band', type: 'Wondrous', rarity: 'Rare', equipped: true, effects: [{ id: 'e2', type: 'ability', target: 'int', value: 2 }, { type: 'resist', id: 'e3', target: 'Fire' }] }));
    c.items.find((i) => i.name === 'Wand of the War Mage +1').attuned = false; // keep attunement slots free
    c.spells.haste = 'prepared';
    c.spells.aid = 'prepared';
  };
  const axe = tryRequire('axe-core');
  const axeOk = async (label) => {
    if (!axe) return;
    const v = await p.evaluate(async (src) => { if (!window.axe) (0, eval)(src); const x = await window.axe.run(document, { resultTypes: ['violations'] }); return x.violations.filter((q) => q.impact === 'serious' || q.impact === 'critical').map((q) => `${q.id}(${q.nodes.length})`); }, axe.source);
    t.ok(v.length === 0, `${label}: axe ${v}`);
  };
  const p = await openPage(env, t, { mut });

  // ability +2 from an equipped item: DC 8 + 3 + 4 (INT 18)
  t.eq(await text(p, '.plate [data-calc="dc"]'), '15', 'INT 16 + 2 from the item gives DC 15');
  t.eq(await text(p, '[data-calc="ac"]'), '15', 'AC 15 before the charm counts');

  // charm: not equipped -> no effect; equipped but unattuned -> none; attuned -> +1
  await go(p, 'workshop', 'equipment');
  const card = p.locator('#list .icard:has-text("Warding Charm")');
  await card.locator('[data-action="toggleEquip"]').click();
  await go(p, 'combat');
  t.eq(await text(p, '[data-calc="ac"]'), '15', 'equipped but not attuned: no AC bonus');
  await go(p, 'workshop', 'equipment');
  await p.locator('#list .icard:has-text("Warding Charm") [data-action="toggleAttune"]').click();
  await go(p, 'combat');
  t.eq(await text(p, '[data-calc="ac"]'), '16', 'attuned: +1 AC');
  await go(p, 'workshop', 'equipment');
  await p.locator('#list .icard:has-text("Warding Charm") [data-action="toggleEquip"]').click();
  await go(p, 'combat');
  t.eq(await text(p, '[data-calc="ac"]'), '15', 'put away: bonus gone');

  // the effects editor adds an effect that undo reverts
  await go(p, 'workshop', 'equipment');
  await p.locator('#list .icard:has-text("Warding Charm") details.edit > summary').click();
  await p.click('#list [data-action="addEffect"]');
  t.eq((await saved(p)).character.items.find((i) => i.name === 'Warding Charm').effects.length, 2, 'Add effect stores a second effect');
  t.eq(await p.locator('#list .fx-row').count(), 2, 'effect rows are listed');
  await auditOk(t, p, 'effects editor'); await axeOk('effects editor');
  await p.click('.toast [data-action="undo"]');
  t.eq((await saved(p)).character.items.find((i) => i.name === 'Warding Charm').effects.length, 1, 'undo removes it');

  // two added effects get distinct ids; editing the second leaves the first alone; removing one keeps the other
  await p.click('#list [data-action="addEffect"]'); await p.click('#list [data-action="addEffect"]');
  let fx = (await saved(p)).character.items.find((i) => i.name === 'Warding Charm').effects;
  t.ok(fx.length === 3 && new Set(fx.map((e) => e.id)).size === 3 && fx.every((e) => e.id), 'new effects get unique ids');
  const third = p.locator('#list .fx-row').nth(2).locator('input[type="number"]').first();
  await third.fill('3'); await third.dispatchEvent('change');
  fx = (await saved(p)).character.items.find((i) => i.name === 'Warding Charm').effects;
  t.ok(fx[2].value === 3 && fx[1].value !== 3 && fx[0].value === 1, 'editing the third effect changes only that one: ' + fx.map((e) => e.value));
  await p.locator('#list .fx-row').nth(2).locator('[data-action="removeEffect"]').click();
  await p.locator('#list .fx-row').nth(1).locator('[data-action="removeEffect"]').click();
  fx = (await saved(p)).character.items.find((i) => i.name === 'Warding Charm').effects;
  t.ok(fx.length === 1 && fx[0].id === 'e1', 'removing added effects keeps the original');

  // Stats: base input, total, "+" breakdown
  await go(p, 'character', 'stats');
  const btn = p.locator('.ability.key .bd-btn');
  t.eq(await btn.getAttribute('aria-expanded'), 'false', '+ starts closed');
  t.ok((await btn.textContent()).includes('Show how Intelligence score is calculated') && (await btn.getAttribute('aria-label')) === null, '+ has a screen-reader sentence and no aria-label');
  await btn.click();
  t.eq(await btn.getAttribute('aria-expanded'), 'true', '+ opens');
  const bd = await text(p, '.bd[data-bdkey="abil:int"]');
  t.ok(/Base\s*16/.test(bd) && /Mind Band/.test(bd) && /\+2/.test(bd) && /18/.test(bd), 'breakdown lists Base 16, the item and +2: ' + bd);
  await p.fill('[data-bind="character.abilities.int"]', '17');
  t.ok(/Base\s*17/.test(await text(p, '.bd[data-bdkey="abil:int"]')) && (await text(p, '[data-calc="abil:int"]')) === '19', 'breakdown follows the base input');
  t.ok(/Fire/.test(await text(p, '.fx-list')) && /Mind Band/.test(await text(p, '.fx-list')), 'resistance from the item is listed with its source');
  await auditOk(t, p, 'stats with breakdown open'); await axeOk('stats with breakdown open');
  await btn.click();
  t.eq(await p.locator('.bd[data-bdkey="abil:int"]').count(), 0, '+ closes');

  // Combat: roll reference tile toggles its breakdown; AC plate too
  await go(p, 'combat');
  await p.click('.rr-tile[data-key="dc"]');
  t.ok(/Proficiency/.test(await text(p, '.bd[data-bdkey="dc"]')), 'Spell DC breakdown shows Proficiency');
  await p.click('.plate[data-key="ac"]');
  t.ok(/Studded Leather/.test(await text(p, '.bd[data-bdkey="ac"]')), 'AC breakdown names the armor');
  await auditOk(t, p, 'combat with breakdowns open'); await axeOk('combat with breakdowns open');

  // concentration on Haste: speed doubled, AC +2
  t.eq(await text(p, '.g-tile [data-calc="speed"]'), '30 ft', 'speed 30 ft');
  await p.click('.g-conc'); await p.click('.pick-list [data-id="haste"]');
  t.eq(await text(p, '.g-tile [data-calc="speed"]'), '60 ft', 'Haste doubles speed');
  t.eq(await text(p, '.plate [data-calc="ac"]'), '17', 'Haste adds 2 AC');
  await p.click('.g-conc'); await p.click('.sheet [data-action="concEnd"]');
  t.eq(await text(p, '.g-tile [data-calc="speed"]'), '30 ft', 'ending concentration removes it');

  // buff toggle (Shield is always prepared for an Artillerist) and long rest
  const sw = p.locator('[data-action="toggleBuff"][data-id="shield"]');
  await sw.click();
  t.eq(await text(p, '.plate [data-calc="ac"]'), '20', 'Shield +5 AC');
  t.eq((await saved(p)).character.buffs, ['shield'], 'buff stored');
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-key="long"]');
  t.ok(/Spell effects ended/.test(await p.textContent('.sheet')), 'rest summary mentions spell effects');
  await p.click('.sheet [data-action="restConfirm"]');
  t.eq((await saved(p)).character.buffs, [], 'long rest clears buffs');
  t.eq(await text(p, '.plate [data-calc="ac"]'), '15', 'AC back to normal');

  // Aid: +5 max HP; ending it (toggle or long rest) never leaves current HP above the max
  const max0 = Number(await text(p, '[data-calc="hpmax"]'));
  await p.locator('[data-action="toggleBuff"][data-id="aid"]').click();
  t.eq(Number(await text(p, '[data-calc="hpmax"]')), max0 + 5, 'Aid adds 5 max HP');
  await p.locator('[data-action="toggleBuff"][data-id="aid"]').click();
  let c5 = (await saved(p)).character;
  t.ok(c5.hp.current <= max0, `toggling Aid off caps current HP (${c5.hp.current}/${max0})`);
  await p.locator('[data-action="toggleBuff"][data-id="aid"]').click();
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-key="long"]'); await p.click('.sheet [data-action="restConfirm"]');
  c5 = (await saved(p)).character;
  t.ok(c5.hp.current === max0 && c5.buffs.length === 0, `long rest with Aid on: HP ${c5.hp.current} = max ${max0}`);
  await p.ctx.close();
  t.noErrors();
}
