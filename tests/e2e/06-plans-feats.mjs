// Replicate Magic Item plans (learn, limits, generic, craft) and feats (default view, prerequisite sheet, notes).
import { openPage, go, saved, imp } from '../lib.mjs';

export const name = 'Plans and feats';

export async function run(env, t) {
  const { PLANS_KNOWN, MAGIC_ITEMS, at } = await imp('js/data/artificer.js'); const { newItem } = await imp('js/store.js');
  const knownMax = at(PLANS_KNOWN, 5); const itemsMax = at(MAGIC_ITEMS, 5);
  const start = ['2-bag-of-holding', '2-wand-of-the-war-mage-1'];

  // Plans list and learning up to / beyond the limit
  let p = await openPage(env, t, { tab: 'plans', mut: (s) => { s.character.plans.known = Object.fromEntries(start.map((i) => [i, true])); s.character.plans.custom = []; } });
  await go(p, 'workshop', 'plans');
  const heads = await p.$$eval('#list h3', (h) => h.map((x) => x.textContent.trim()));
  t.ok(heads.length === 2 && heads[0].startsWith('Known plans') && heads[1].startsWith('Learnable now'), 'plan headings: ' + heads);
  t.ok(await p.locator('#list .item .lvl').evaluateAll((e) => e.every((x) => Number(x.textContent.replace(/\D/g, '')) <= 5)), 'Learnable now only offers tiers up to the level');
  t.eq(await p.locator('#list [data-action="craft"]').count(), 2, 'known plans have a Create button');
  const unknown = (await p.$$eval('#list [data-action="togglePlan"]', (b) => b.map((x) => x.dataset.id))).filter((i) => !start.includes(i));
  for (let k = 0; k < knownMax - 2; k++) await p.click(`#list [data-action="togglePlan"][data-id="${unknown[k]}"]`);
  t.eq(await p.locator('.sheet').count(), 0, `learning up to ${knownMax} plans opens no sheet`);
  await p.click(`#list [data-action="togglePlan"][data-id="${unknown[knownMax - 2]}"]`);
  t.ok(await p.locator('.sheet').count() === 1 && /anyway/i.test(await p.textContent('.sheet')), 'learning beyond the limit opens a sheet');
  await p.click('.sheet button:has-text("Cancel")');
  await p.click('#list [data-action="learnGeneric"] >> nth=0');
  t.ok(await p.locator('.sheet label:has-text("Which item?") input').count() === 1 && await p.evaluate(() => document.activeElement.dataset.sh === 'text'), 'generic sheet: labelled input has focus');
  t.ok(await p.locator('.sheet [data-action="genericGo"]').isDisabled(), 'Learn is disabled while empty');
  t.ok(/over your limit/.test(await p.textContent('.sheet .warn')), 'generic sheet warns when over the limit');
  await p.keyboard.type('Test Lantern'); await p.keyboard.press('Enter');
  t.ok(await p.locator('.sheet').count() === 0 && (await saved(p)).character.plans.custom.some((c) => c.name === 'Test Lantern'), 'Enter saves the generic plan');
  await p.ctx.close();

  // Crafting: normal, filters, and the vanishing-item sheet at the item limit
  p = await openPage(env, t, { tab: 'plans', mut: (s) => { s.character.plans.known = {}; s.character.items = s.character.items.filter((i) => i.origin !== 'replicated'); } });
  await go(p, 'workshop', 'plans');
  for (const id of start) await p.click(`[data-action="togglePlan"][data-id="${id}"]`);
  await p.click('[data-action="craft"][data-id="2-wand-of-the-war-mage-1"]');
  await p.click('[data-action="filter"][data-page="plans"][data-key="view"][data-val="known"]');
  t.eq(await p.locator('#list .item').count(), 2, 'known filter shows the 2 learned plans');
  await p.click('[data-action="filter"][data-page="plans"][data-key="view"][data-val="all"]');
  await p.selectOption('[data-filter="plans.type"]', 'Ring');
  t.ok(await p.locator('#list .item').count() > 3, 'type filter narrows to rings');
  const { SOURCE_LINKS } = await imp('js/data/sources.js');
  t.ok(await p.locator('#list .item a.src-link[target="_blank"][rel~="noopener"]').count() >= 3, 'plan cards have Source links');
  await go(p, 'workshop', 'items');
  t.ok((await p.locator('.icard-name').allTextContents()).includes('Wand of the War Mage +1'), 'crafted item appears in Magic items');
  t.eq(await p.getAttribute('.icard:has-text("Wand of the War Mage") a.src-link', 'href'), SOURCE_LINKS.plan['2-wand-of-the-war-mage-1'], 'crafted item Source link points to its plan');
  await p.click('.icard:has-text("Wand of the War Mage") [data-action="toggleAttune"]');
  t.ok((await p.textContent('.counter')).includes('1 / 3'), 'attuning the crafted item counts 1 / 3');
  await p.ctx.close();

  p = await openPage(env, t, { tab: 'plans', mut: (s) => {
    s.character.plans.known = { '2-bag-of-holding': true };
    s.character.items = s.character.items.filter((i) => i.origin !== 'replicated');
    for (let k = 0; k < itemsMax; k++) s.character.items.push(newItem({ name: `Rep ${k}`, origin: 'replicated', planId: '2-bag-of-holding' }));
  } });
  await go(p, 'workshop', 'plans');
  await p.click('#list [data-action="craft"]');
  t.ok(await p.locator('.sheet').count() === 1 && /Rep 0/.test(await p.textContent('.sheet')) && /vanish/.test(await p.textContent('.sheet')), 'crafting at the item limit names the item that vanishes');
  await p.click('.sheet button:has-text("Cancel")');
  t.ok((await saved(p)).character.items.filter((i) => i.origin === 'replicated').length === itemsMax, 'Cancel crafts nothing');
  await p.click('#list [data-action="craft"]'); await p.click('.sheet button:has-text("Continue")');
  const items = (await saved(p)).character.items;
  t.ok(!items.some((i) => i.name === 'Rep 0') && items.some((i) => i.name === 'Bag of Holding'), 'Continue: oldest replicated item vanishes, the new one exists');
  await p.ctx.close();

  // Feats
  p = await openPage(env, t, { tab: 'feats' });
  await go(p, 'character', 'feats');
  t.ok(await p.locator('#list .item a.src-link[target="_blank"]').count() > 5, 'feat rows have Source links');
  t.eq(await p.locator('#list .item a.src-link').first().textContent(), 'Source', 'feat link text is Source');
  const cards = await p.$$eval('#list .item', (els) => els.map((e) => ({ met: /Prerequisites met/.test(e.textContent), taken: /Taken/.test(e.querySelector('.flag')?.textContent || '') })));
  t.ok(cards.length > 5 && cards.every((c) => c.met && !c.taken), `default view: ${cards.length} feats, all prerequisites met and untaken`);
  t.ok(/Your feats \(0\)/.test(await p.textContent('.yourfeats')), 'summary row shows 0 taken');
  await p.click('[data-action="filter"][data-page="feats"][data-key="status"][data-val="all"]');
  t.ok(await p.locator('#list .item').count() > cards.length, 'All shows more feats');
  const locked = p.locator('#list .item.locked [data-action="takeFeat"]').first();
  const lockedId = await locked.getAttribute('data-id');
  await locked.click();
  t.ok(await p.locator('.sheet').count() === 1 && /prerequisite/i.test(await p.textContent('.sheet')) && await p.locator('.sheet button:has-text("Take anyway")').count() === 1, 'unmet prerequisite opens a sheet');
  await p.click('.sheet button:has-text("Take anyway")');
  t.ok((await saved(p)).character.feats.some((f) => f.featId === lockedId), 'Take anyway takes the feat');
  t.ok(/Your feats \(1\)/.test(await p.textContent('.yourfeats')), 'summary row updates');
  await p.click('[data-action="filter"][data-page="feats"][data-key="status"][data-val="taken"]');
  t.ok(await p.locator('#list .item').count() === 1 && await p.locator('#list [data-bind$=".notes"]').count() === 1, 'Taken view shows the feat with editable notes');
  await p.ctx.close();

  // Dragonmark chain: Greater Mark of Making needs Mark of Making; Fighting Style is not eligible for an Artificer
  p = await openPage(env, t, { tab: 'feats' });
  await go(p, 'character', 'feats');
  await p.click('details[data-fmore="feats"] > summary');
  await p.click('[data-action="filter"][data-page="feats"][data-key="cat"][data-val="Dragonmark"]');
  await p.click('[data-action="takeFeat"][data-id="mark-of-making"]');
  await p.click('[data-action="filter"][data-page="feats"][data-key="cat"][data-val="Greater Dragonmark"]');
  const eligible = await p.locator('#list .item b').allTextContents();
  t.ok(eligible.includes('Greater Mark of Making') && !eligible.includes('Greater Mark of Storm'), 'greater mark offered only after its base mark: ' + eligible);
  await p.click('[data-action="filter"][data-page="feats"][data-key="cat"][data-val="Greater Dragonmark"]');
  await p.click('[data-action="filter"][data-page="feats"][data-key="cat"][data-val="Fighting Style"]');
  t.eq(await p.locator('#list .item').count(), 0, 'no Fighting Style feats are available to an Artificer');
  await p.ctx.close();
  t.noErrors();
}
