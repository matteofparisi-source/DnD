// Plan and magic item descriptions: lazy module, collapsible Description on plan and item cards, SRD vs community tag, search by description text, axe.
import { openPage, go, saved, tryRequire } from '../lib.mjs';

export const name = 'Plan and item descriptions';

export async function run(env, t) {
  const axe = tryRequire('axe-core');
  const axeOk = async (p, label) => {
    if (!axe) return;
    const v = await p.evaluate(async (src) => { if (!window.axe) (0, eval)(src); const x = await window.axe.run(document, { resultTypes: ['violations'] }); return x.violations.filter((q) => q.impact === 'serious' || q.impact === 'critical').map((q) => `${q.id}(${q.nodes.length}) ${q.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message || '')).join(' ## ')}`); }, axe.source);
    t.ok(v.length === 0, `${label}: axe ${v}`);
  };
  const loaded = (p) => p.reqs.some((u) => /plan-details\.js/.test(u));
  const known = { '2-bag-of-holding': true, '2-alchemy-jug': true, '2-weapon-1': true };
  const custom = [{ id: 'cust-slip', custom: true, tier: 10, name: 'Slippers of Spider Climbing', type: 'Wondrous', attune: null, base: 'Uncommon Wondrous Item (not cursed)' }, { id: 'cust-none', custom: true, tier: 10, name: 'Test Lantern', type: 'Wondrous', attune: null, base: 'Uncommon Wondrous Item (not cursed)' }];
  const p = await openPage(env, t, { tab: 'combat', mut: (s) => { s.character.items = []; s.character.plans.known = { ...known }; s.character.plans.custom = custom; } });
  t.ok(!loaded(p), 'the description module is not loaded at startup');
  await go(p, 'workshop', 'plans');
  await p.waitForFunction(() => document.querySelector('#list details.pd'));
  t.ok(loaded(p), 'the Plans page loads the description module');
  const card = (n) => p.locator('#list .item').filter({ has: p.locator('b.grow', { hasText: new RegExp(`^${n.replace(/[()]/g, '\\$&')}$`) }) });
  t.eq(await p.locator('#list details.pd > summary button, #list details.pd > summary a').count(), 0, 'no buttons or links inside the Description summaries');
  t.eq(await card('Bag of Holding').locator('details.pd .lazy-body').count(), 0, 'closed Description has no body');

  // SRD plan: official text and tag
  await card('Bag of Holding').locator('details.pd > summary').click();
  let body = await card('Bag of Holding').locator('details.pd .lazy-body').textContent();
  t.ok(/considerably larger than its outside dimensions/.test(body) && /Wondrous Item, Uncommon/.test(body) && /SRD 5\.2\.1 · official text/.test(body), 'SRD plan shows the cat line, the text and the SRD tag');
  t.eq(await card('Bag of Holding').locator('details.pd .lazy-body p:not(.sd-src):not(.pd-cat)').count(), 3, 'the SRD text keeps its three paragraphs');
  await axeOk(p, 'plans with an open description');
  await card('Bag of Holding').locator('details.pd > summary').click();
  await p.waitForFunction(() => !document.querySelector('#list details.pd .lazy-body'));
  t.eq(await card('Bag of Holding').locator('details.pd .lazy-body').count(), 0, 'closing removes the body');

  await p.click('[data-action="filter"][data-page="plans"][data-key="view"][data-val="all"]'); // generic plans are hidden in the default view
  await p.waitForSelector('#list details.pd');

  // community plan: short own-words summary with the unverified tag
  await card('Alchemy Jug').locator('details.pd > summary').click();
  body = await card('Alchemy Jug').locator('details.pd .lazy-body').textContent();
  t.ok(/Community source · unverified/.test(body) && !/SRD 5\.2\.1 · official/.test(body), 'community plan carries the unverified tag');

  // generic plan: one-line explanation
  await card('Uncommon Wondrous Item (not cursed)').locator('details.pd > summary').click();
  t.ok(/pick one Uncommon Wondrous Item/.test(await card('Uncommon Wondrous Item (not cursed)').locator('details.pd .lazy-body').textContent()), 'generic plan explains itself');

  // a plan learned from a generic one shows the catalog text of the same name; none for an unknown name
  await card('Slippers of Spider Climbing').locator('details.pd > summary').click();
  t.ok(/light shoes/.test(await card('Slippers of Spider Climbing').locator('details.pd .lazy-body').textContent()), 'custom plan with a catalog name shows the SRD text');
  t.eq(await card('Test Lantern').locator('details.pd').count(), 0, 'custom plan without a catalog match has no Description');

  // search also matches the description text
  await p.fill('input.fsearch[data-filter="plans.q"]', 'gate to the Astral');
  await p.waitForFunction(() => document.querySelectorAll('#list .item').length === 1);
  t.ok(/Bag of Holding/.test(await p.textContent('#list')), 'plan search finds a plan by its description text');
  await p.fill('input.fsearch[data-filter="plans.q"]', '');

  // a crafted item shows the same description on Magic items and Equipment
  await p.click('#list [data-action="craft"][data-id="2-bag-of-holding"]');
  await go(p, 'workshop', 'items');
  const ic = p.locator('#list .icard:has-text("Bag of Holding")').first();
  await ic.locator('details.pd > summary').click();
  t.ok(/considerably larger than its outside dimensions/.test(await ic.locator('details.pd .lazy-body').textContent()), 'crafted item shows the plan description');
  t.eq(await p.locator('#list .icard details.pd > summary button, #list .icard details.pd > summary a').count(), 0, 'no buttons or links inside the item Description summary');
  await axeOk(p, 'magic items with an open description');
  await go(p, 'workshop', 'equipment');
  t.eq(await p.locator('#list .icard:has-text("Bag of Holding") details.pd').count(), 1, 'Equipment card has the Description too');

  // a catalog item (Ioun Stone: family intro plus its own paragraph)
  await go(p, 'workshop', 'items');
  await p.selectOption('select[data-catalog="newitem"]', 'ioun-stone-mastery');
  const io = p.locator('#list .icard:has-text("Ioun Stone of Mastery")').first();
  await io.locator('details.pd > summary').click();
  body = await io.locator('details.pd .lazy-body').textContent();
  t.ok(/Proficiency Bonus increases by 1/.test(body) && !/Dexterity increases by 2/.test(body), 'Ioun Stone shows its own paragraph only');
  const s = await saved(p);
  t.ok(s.character.items.every((i) => !('desc' in i)), 'descriptions are not copied into the saved data');
  await p.ctx.close();

  // module failure (offline): the body says so instead of hanging
  const q = await openPage(env, t, { tab: 'combat', mut: (st) => { st.character.plans.known = { '2-bag-of-holding': true }; st.character.plans.custom = []; } });
  await q.route('**/plan-details.js', (r) => r.abort());
  await go(q, 'workshop', 'plans');
  await q.locator('#list .item:has-text("Bag of Holding") details.pd > summary').click();
  await q.waitForFunction(() => /couldn.t load/.test(document.querySelector('#list details.pd .lazy-body')?.textContent || ''));
  t.ok(true, 'failed load shows a message');
  await q.ctx.close();
}
