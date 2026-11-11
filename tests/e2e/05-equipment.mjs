// Equipment & bag: AC from equipped armor/shield, weapon attacks in Combat, attunement, qty, weight toggle, coins keypad, magic items tab.
import { openPage, go, saved, text } from '../lib.mjs';

export const name = 'Equipment, AC, coins, attunement';

export async function run(env, t) {
  const { newItem } = await import(new URL('../../js/store.js', import.meta.url));
  const extra = (s) => {
    s.character.coins = { cp: 50, sp: 5, ep: 2, gp: 12, pp: 1 };
    for (let k = 0; k < 3; k++) s.character.items.push(newItem({ name: `Charm ${k}`, type: 'Wondrous', rarity: 'Rare', needsAttune: true, attuned: true }));
  };

  // AC and weapon attacks (Combat reads equipped items)
  let p = await openPage(env, t);
  t.eq(await text(p, '[data-calc="ac"]'), '15', 'AC 15 with Studded Leather +1 and DEX 14');
  t.ok(/Studded Leather 13 \+ DEX 2 = 15/.test(await text(p, '[data-calc="acText"]')), 'AC breakdown is explained');
  t.ok(/Light Crossbow/.test(await p.textContent('#panel')), 'equipped weapon is listed in Combat');
  const hit = await p.locator('[data-calc^="iatk:"]').first().textContent();
  t.ok(/^[+−-]\d+$/.test(hit.trim()), 'weapon to-hit is a signed number: ' + hit);
  await go(p, 'workshop', 'equipment');
  await p.click('[data-action="addMenu"]'); await p.click('[data-action="addEquip"][data-kind="Shield"]');
  t.eq(await p.locator('#list .icard details.edit[open]').count(), 1, 'new Shield opens in edit mode');
  await p.locator('#list .icard:has(details.edit[open]) [data-action="toggleEquip"]').click();
  await go(p, 'combat');
  t.eq(await text(p, '[data-calc="ac"]'), '17', 'equipped shield adds 2 (AC 17)');
  await go(p, 'workshop', 'equipment');
  await p.locator('#list .icard:has-text("Studded Leather") [data-action="toggleEquip"]').click();
  await go(p, 'combat');
  t.eq(await text(p, '[data-calc="ac"]'), '14', 'unarmored 10 + DEX 2 + shield 2 = 14');
  await p.ctx.close();

  // Item cards, attunement pips, toggles, qty, edit block, weight tracking
  p = await openPage(env, t, { mut: extra, tab: 'equipment' });
  await go(p, 'workshop', 'equipment');
  t.eq(await p.locator('#list .icard').count(), 7, 'all item cards listed');
  t.ok(await p.locator('#list [data-bind$=".name"]').count() === 0 && await p.locator('#list .lazy-body').count() === 0, 'collapsed cards hold no edit fields');
  t.ok(await p.locator('.apips .apip').count() === 4 && await p.locator('.apips .apip.on').count() === 4 && await p.locator('.apips .apip.over.on').count() === 1, 'attunement pips: 4 attuned, limit 3, 1 over');
  t.ok(/Attuned: 4 \/ 3/.test(await p.textContent('.attune-bar')) && (await p.getAttribute('.apips', 'aria-label')).includes('over the limit'), 'attunement text and accessible label');
  const eq = p.locator('#list .icard:has-text("Charm 0") [data-action="toggleEquip"]');
  t.eq(await eq.getAttribute('aria-pressed'), 'false', 'Equipped toggle starts off');
  await eq.click();
  t.eq((await saved(p)).character.items.find((i) => i.name === 'Charm 0').equipped, true, 'Equipped toggled on');
  await p.click('.toast [data-action="undo"]');
  t.eq((await saved(p)).character.items.find((i) => i.name === 'Charm 0').equipped, false, 'undo equip');
  await p.locator('#list .icard:has-text("Charm 0") [data-action="toggleAttune"]').click();
  t.ok((await saved(p)).character.items.find((i) => i.name === 'Charm 0').attuned === false && await p.locator('.apips .apip.over').count() === 0, 'un-attuning clears the over-limit pip');
  await p.locator('#list .icard:has-text("Light Crossbow") [data-action="qty"][data-d="1"]').click();
  t.eq((await saved(p)).character.items.find((i) => i.name === 'Light Crossbow').qty, 2, 'qty stepper +1');
  const card = p.locator('#list .icard:has-text("Light Crossbow")');
  await card.locator('details.edit > summary').click();
  await card.locator('[data-bind$=".name"]').waitFor();
  t.eq(await card.locator('[data-action="removeItem"]').count(), 1, 'Edit block has Delete');
  await card.locator('[data-bind$=".name"]').fill('Heavy Crossbow');
  t.eq(await text(p, '#list .icard .icard-name:has-text("Heavy")'), 'Heavy Crossbow', 'title follows the name field live');
  t.eq(await p.locator('.counter:has-text("Carried")').count(), 1, 'carried counter visible');
  await p.uncheck('[data-bind="ui.trackWeight"]');
  await p.waitForFunction(() => !document.querySelector('.counter')?.textContent.includes('Carried'));
  t.ok(await p.locator('.counter:has-text("Carried")').count() === 0 && await p.locator('[data-bind$=".weight"]').count() === 0, 'Track weight off hides the counter and weight fields');
  t.eq((await saved(p)).ui.trackWeight, false, 'trackWeight saved');
  await p.check('[data-bind="ui.trackWeight"]');
  await p.click('[data-action="addMenu"]'); await p.click('[data-action="addEquip"][data-kind="Armor"]');
  t.eq(await p.locator('#list .icard details.edit[open] [data-bind$=".armor.baseAC"]').count(), 1, 'new Armor opens with armor fields');

  // Coins keypad: add, spend, limits, undo, focus
  t.eq(await text(p, '.coin-total b'), `${50 / 100 + 5 / 10 + 2 / 2 + 12 + 10} gp`, 'coin total in gp');
  await p.click('.coin[data-key="gp"]');
  t.ok(await p.locator('.sheet').count() === 1 && /GP/.test(await p.textContent('.sheet-title')), 'coin sheet opens for gp');
  await p.click('.sheet [data-k="5"]'); await p.click('.sheet [data-action="coinGo"][data-dir="1"]');
  t.eq((await saved(p)).character.coins.gp, 17, 'Add 5 gp -> 17');
  t.eq(await p.evaluate(() => document.activeElement?.dataset?.key), 'gp', 'focus back on the coin');
  await p.click('.toast [data-action="undo"]');
  t.eq((await saved(p)).character.coins.gp, 12, 'undo add');
  await p.click('.coin[data-key="gp"]'); await p.click('.sheet [data-k="9"]'); await p.click('.sheet [data-k="9"]');
  t.ok(await p.locator('.sheet [data-action="coinGo"][data-dir="-1"]').isDisabled(), 'Spend is disabled when it would go below 0');
  await p.click('.sheet [data-k="back"]'); await p.click('.sheet [data-k="clear"]'); await p.click('.sheet [data-k="7"]');
  await p.click('.sheet [data-action="coinGo"][data-dir="-1"]');
  t.eq((await saved(p)).character.coins.gp, 5, 'Spend 7 gp -> 5');
  await p.ctx.close();

  // Magic items tab lists only non-mundane items and shows the attunement bar
  p = await openPage(env, t, { mut: extra });
  await go(p, 'workshop', 'items');
  t.eq(await p.locator('#list .icard').count(), 5, 'Magic items: Studded Leather +1, the wand and 3 charms');
  t.eq(await p.locator('.attune-bar').count(), 1, 'attunement bar on Magic items');
  await p.ctx.close();
  t.noErrors();
}
