// Plan and catalog item effects: craft copies a plan's effects, the catalog picker, armor +N counted once, one-time "Apply catalog effects", generic plan pick.
import { openPage, go, saved, text, auditOk, tryRequire } from '../lib.mjs';

export const name = 'Item effects (plans and catalog)';

export async function run(env, t) {
  const axe = tryRequire('axe-core');
  let p;
  const axeOk = async (label) => {
    if (!axe) return;
    const v = await p.evaluate(async (src) => { if (!window.axe) (0, eval)(src); const x = await window.axe.run(document, { resultTypes: ['violations'] }); return x.violations.filter((q) => q.impact === 'serious' || q.impact === 'critical').map((q) => `${q.id}(${q.nodes.length})`); }, axe.source);
    t.ok(v.length === 0, `${label}: axe ${v}`);
  };
  const items = async () => (await saved(p)).character.items;
  const named = async (n) => (await items()).find((i) => i.name === n);
  const card = (n) => p.locator(`#list .icard:has-text("${n}")`);
  const combat = async (sel) => { await go(p, 'combat'); return text(p, sel); };
  const fromCatalog = async (id) => { await go(p, 'workshop', 'items'); await p.selectOption('select[data-catalog="newitem"]', id); };
  const on = async (n, ...acts) => { await go(p, 'workshop', 'items'); for (const a of acts) await card(n).locator(`[data-action="${a}"]`).click(); };

  // ---- craft Wand of the War Mage +1 from its plan: spell attack +1 only while attuned
  p = await openPage(env, t, { mut: (s) => {
    s.character.items = s.character.items.filter((i) => i.name !== 'Wand of the War Mage +1');
    s.character.plans.known = { '2-wand-of-the-war-mage-1': true };
  } });
  const base = await combat('.plate [data-calc="satk"]');
  await go(p, 'workshop', 'plans');
  await p.click('[data-action="craft"][data-id="2-wand-of-the-war-mage-1"]');
  let wand = await named('Wand of the War Mage +1');
  t.ok(wand && wand.catalogId === 'plan:2-wand-of-the-war-mage-1' && wand.fxSrc === 'SRD 5.2.1' && wand.needsAttune && wand.equipped && wand.effects.length === 1 && wand.effects[0].type === 'spellAttack' && wand.effects[0].value === 1 && wand.effects[0].id, 'craft copies the plan effect (fresh id) and attunement: ' + JSON.stringify(wand));
  t.eq(await combat('.plate [data-calc="satk"]'), base, 'not attuned: spell attack unchanged');
  await on('Wand of the War Mage', 'toggleAttune');
  const withWand = await combat('.plate [data-calc="satk"]');
  t.eq(Number(withWand), Number(base) + 1, `attuned: spell attack +1 (${base} -> ${withWand})`);
  await go(p, 'combat');
  await p.click('.rr-tile[data-key="satk"]');
  t.ok(/Wand of the War Mage \+1/.test(await text(p, '.bd[data-bdkey="satk"]')), 'the + breakdown names the wand');
  await p.ctx.close();

  // ---- catalog picker: Ring of Protection (AC and all saves +1), Headband of Intellect (INT 19), Gloves of Thievery (skill bonus)
  p = await openPage(env, t, { tab: 'items', mut: (s) => { s.character.items = s.character.items.filter((i) => i.name !== 'Wand of the War Mage +1'); } });
  await go(p, 'workshop', 'items');
  t.ok(await p.locator('select[data-catalog="newitem"] option').count() > 100, 'catalog picker lists the SRD items');
  await auditOk(t, p, 'magic items with catalog picker'); await axeOk('magic items with catalog picker');
  const ac0 = await combat('.plate [data-calc="ac"]'); const save0 = Number((await combat('[data-calc="save:con"]')).replace('−', '-'));
  await fromCatalog('ring-of-protection');
  let ring = await named('Ring of Protection');
  t.ok(ring && ring.type === 'Ring' && ring.rarity === 'Rare' && ring.needsAttune && !ring.equipped && ring.catalogId === 'item:ring-of-protection' && ring.effects.map((e) => e.type).join() === 'ac,save', 'picked item has its effects prefilled: ' + JSON.stringify(ring?.effects));
  t.ok(/Ring of Protection added/.test(await text(p, '.toast')) && await p.locator('.toast [data-action="undo"]').count() === 1, 'toast with Undo');
  await on('Ring of Protection', 'toggleEquip');
  t.eq(await combat('.plate [data-calc="ac"]'), ac0, 'equipped but not attuned: AC unchanged');
  await on('Ring of Protection', 'toggleAttune');
  t.eq([Number(await combat('.plate [data-calc="ac"]')), Number((await combat('[data-calc="save:con"]')).replace('−', '-'))], [Number(ac0) + 1, save0 + 1], 'attuned: AC +1 and saves +1');
  await fromCatalog('headband-of-intellect');
  await on('Headband of Intellect', 'toggleEquip', 'toggleAttune');
  await go(p, 'character', 'stats');
  t.eq(await text(p, '[data-calc="abil:int"]'), '19', 'Headband of Intellect sets INT 19 (base 18)');
  await fromCatalog('gloves-of-thievery');
  await on('Gloves of Thievery', 'toggleEquip');
  await go(p, 'character', 'stats');
  const soh = await text(p, '[data-calc="skill:sleightOfHand"]');
  t.eq(soh, '+7', 'Gloves of Thievery add +5 to Sleight of Hand (DEX +2)');
  await auditOk(t, p, 'stats with item effects');
  await p.ctx.close();

  // ---- Armor +1 counts once (armor bonus, no second ac effect)
  p = await openPage(env, t, { tab: 'equipment' });
  await go(p, 'workshop', 'items');
  await p.selectOption('select[data-catalog="newitem"]', 'armor-1');
  const arm = await named('Armor +1');
  t.ok(arm && arm.type === 'Armor' && arm.armor.bonus === 1 && arm.effects.length === 0 && !arm.equipped, 'Armor +1: magic bonus 1 on the armor, no effects: ' + JSON.stringify(arm?.effects));
  await go(p, 'workshop', 'equipment');
  await p.locator('#list .icard:has-text("Studded Leather +1") [data-action="toggleEquip"]').click();
  await p.locator('#list .icard:has-text("Armor +1") [data-action="toggleEquip"]').click();
  const dex = Math.floor(((await saved(p)).character.abilities.dex - 10) / 2);
  t.eq(Number(await combat('.plate [data-calc="ac"]')), 11 + 1 + dex, 'Armor +1 adds +1 to AC once');
  await p.ctx.close();

  // ---- an old item gets a one-time "Apply catalog effects" button; nothing changes on its own
  p = await openPage(env, t, { tab: 'items' });
  await go(p, 'workshop', 'items');
  wand = await named('Wand of the War Mage +1');
  t.eq(wand.effects.length, 0, 'the old wand has no effects (no silent migration)');
  await on('Wand of the War Mage', 'toggleEquip'); // the seeded wand is attuned but in the bag
  const before = Number(await combat('.plate [data-calc="satk"]'));
  await go(p, 'workshop', 'items');
  t.eq(await p.locator('[data-action="applyFx"]').count(), 1, 'one item (exact catalog name) offers Apply catalog effects');
  await p.click('[data-action="applyFx"]');
  wand = await named('Wand of the War Mage +1');
  t.ok(wand.effects.length === 1 && wand.effects[0].type === 'spellAttack' && wand.catalogId === 'item:wand-of-the-war-mage-1', 'applying copies the effect and remembers the source');
  t.eq(await p.locator('[data-action="applyFx"]').count(), 0, 'the button is gone after applying');
  t.eq(Number(await combat('.plate [data-calc="satk"]')), before + 1, 'equipped and attuned wand: spell attack +1');
  await go(p, 'workshop', 'items');
  await p.click('.toast [data-action="undo"]');
  t.ok((await named('Wand of the War Mage +1')).effects.length === 0 && await p.locator('[data-action="applyFx"]').count() === 1, 'undo reverts it and brings the button back');
  await p.ctx.close();

  // ---- a plan learned from a generic one: pick a catalog item, or stay custom
  const custom = { id: 'c1', custom: true, tier: 10, name: 'My Thing', type: 'Wondrous', attune: null, base: 'Uncommon Wondrous Item (not cursed)' };
  p = await openPage(env, t, { tab: 'plans', mut: (s) => { s.character.plans.known = {}; s.character.plans.custom = [custom]; s.character.items = s.character.items.filter((i) => i.origin !== 'replicated'); } });
  await go(p, 'workshop', 'plans');
  await p.click('[data-action="craft"][data-id="c1"]');
  t.ok(await p.locator('#sheet-root .sheet').count() === 1 && await p.locator('.sheet [data-action="craftPick"]').count() > 3, 'a generic plan offers catalog items of its rarity');
  t.ok(/Cloak of Protection/.test(await text(p, '.sheet')) && !/Ring of Protection/.test(await text(p, '.sheet')), 'only Uncommon Wondrous items are listed');
  await auditOk(t, p, 'catalog pick sheet'); await axeOk('catalog pick sheet');
  await p.click('.sheet [data-cat="cloak-of-protection"]');
  const cloak = await named('Cloak of Protection');
  t.ok(cloak && cloak.planId === 'c1' && cloak.origin === 'replicated' && cloak.rarity === 'Uncommon' && cloak.needsAttune && cloak.effects.length === 2, 'picked item is made with its effects');
  await p.click('[data-action="craft"][data-id="c1"]');
  await p.click('.sheet [data-action="craftPick"][data-cat=""]');
  const cust = await named('My Thing');
  t.ok(cust && cust.effects.length === 0 && cust.planId === 'c1', 'Custom item stays as named, without effects');
  await p.ctx.close();
  // ---- review fixes: no double AC on Apply, armor/shield bonus needs attunement, empty pools, unverified tag, base-less armor
  const { newItem } = await import(new URL('../../js/store.js', import.meta.url));
  p = await openPage(env, t, { tab: 'items', mut: (s) => {
    s.character.items.push(newItem({ name: 'Ring of Protection', type: 'Ring', rarity: 'Rare', needsAttune: true, attuned: true, equipped: true, acBonus: 1 }));
  } });
  const acBefore = Number(await combat('.plate [data-calc="ac"]'));
  await go(p, 'workshop', 'items');
  await p.locator('#list .icard:has-text("Ring of Protection") [data-action="applyFx"]').click();
  const rp = await named('Ring of Protection');
  t.ok(rp.acBonus === 0 && rp.effects.some((e) => e.type === 'ac'), 'Apply clears the hand-entered AC bonus when the catalog adds an ac effect');
  t.eq(Number(await combat('.plate [data-calc="ac"]')), acBefore, 'AC unchanged: the bonus is counted once');
  await fromCatalog('shield-of-the-cavalier');
  await on('Shield of the Cavalier', 'toggleEquip');
  t.eq(Number(await combat('.plate [data-calc="ac"]')), acBefore + 2, 'shield equipped but not attuned: base +2 only, no magic bonus');
  await on('Shield of the Cavalier', 'toggleAttune');
  t.eq(Number(await combat('.plate [data-calc="ac"]')), acBefore + 4, 'attuned: the +2 magic bonus counts');
  await p.ctx.close();

  const gen = (o) => ({ id: 'g1', custom: true, tier: 2, name: 'Thing', type: 'Wondrous', attune: null, base: 'Common magic item (not a Potion, Scroll, or cursed)', ...o });
  p = await openPage(env, t, { tab: 'plans', mut: (s) => { s.character.plans.known = {}; s.character.plans.custom = [gen({})]; s.character.items = s.character.items.filter((i) => i.origin !== 'replicated'); } });
  await go(p, 'workshop', 'plans');
  await p.click('[data-action="craft"][data-id="g1"]');
  t.ok(await p.locator('#sheet-root .sheet').count() === 0 && (await named('Thing'))?.effects.length === 0, 'Common generic plan: no empty pick sheet, a custom item is made');
  await p.ctx.close();
  p = await openPage(env, t, { tab: 'plans', mut: (s) => { s.character.plans.known = {}; s.character.plans.custom = [gen({ tier: 10, name: 'Ring of Protection', base: 'Uncommon Wondrous Item (not cursed)' })]; s.character.items = s.character.items.filter((i) => i.origin !== 'replicated'); } });
  await go(p, 'workshop', 'plans');
  await p.click('[data-action="craft"][data-id="g1"]');
  t.eq(await p.locator('#sheet-root .sheet').count(), 1, 'a catalog name of the wrong rarity/type is not auto-matched: the pick sheet opens');
  await p.ctx.close();

  p = await openPage(env, t, { tab: 'plans', mut: (s) => { s.character.plans.known = { '2-manifold-tool': true, '10-elven-chain': true }; s.character.items = s.character.items.filter((i) => i.origin !== 'replicated'); } });
  await go(p, 'workshop', 'plans');
  await p.click('[data-action="craft"][data-id="2-manifold-tool"]');
  await p.click('[data-action="craft"][data-id="10-elven-chain"]');
  await go(p, 'workshop', 'items');
  t.ok(await card('Manifold Tool').locator('.tag-s:has-text("Effects unverified")').count() === 1, 'community effects carry an "unverified" tag');
  t.ok(await card('Elven Chain').locator('.tag-s:has-text("Pick the armor type")').count() === 1 && (await named('Elven Chain')).armor.bonus === 1, 'base-less armor from a plan is flagged; its +1 is the armor bonus');
  await auditOk(t, p, 'item cards with tags');
  await card('Manifold Tool').locator('details.edit > summary').click();
  await p.locator('#list [data-action="removeEffect"]').first().click();
  const mt = await named('Manifold Tool');
  t.ok(mt.effects.length === 0 && mt.catalogId === '' && mt.fxSrc === '', 'deleting all effects clears catalogId and fxSrc');
  await p.ctx.close();
  t.noErrors();
}
