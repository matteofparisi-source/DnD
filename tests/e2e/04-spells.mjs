// Spells page: lazy details, My/All views, filters (casting time, level, status, search), lazy card bodies, prepare over the limit.
import { openPage, go, saved, imp } from '../lib.mjs';

export const name = 'Spells page';

const lead = (s) => s.toLowerCase().split(/,| or /)[0].trim();

export async function run(env, t) {
  const { SPELLS } = await imp('js/data/spells.js'); const { SPELL_DETAILS } = await imp('js/data/spell-details.js');
  const { PREPARED, at } = await imp('js/data/artificer.js');
  const ids = (p) => p.$$eval('#list [data-spell]', (els) => els.map((e) => e.dataset.spell));
  const filter = (p, key, val) => p.click(`[data-action="filter"][data-page="spells"][data-key="${key}"][data-val="${val}"]`);

  let p = await openPage(env, t);
  t.ok(!p.reqs.some((u) => u.endsWith('/spell-details.js')), 'spell-details.js is not requested on first load');
  await go(p, 'spells'); await p.waitForSelector('#list [data-spell]');
  t.ok(p.reqs.some((u) => u.endsWith('/spell-details.js')), 'spell-details.js is requested when Spells opens');

  // My spells
  const mine = await ids(p);
  t.ok(['faerie-fire', 'fire-bolt', 'cure-wounds', 'web', 'mending'].every((i) => mine.includes(i)), 'My spells lists the selected spells and Mending: ' + mine);
  const groups = await p.$$eval('#list h3', (h) => h.map((x) => x.textContent.trim()));
  t.ok(groups[0].startsWith('Cantrips') && groups.length >= 3, 'grouped by level: ' + groups);
  t.eq(await p.locator('#list [data-spell]').count(), await p.locator('.flag.prepared, .flag.always').count(), 'every My spells card has a status flag');
  t.ok(await p.locator('#list .sd-list').count() === 0 && await p.locator('#list .lazy-body').count() === 0, 'closed cards hold no description DOM');
  await p.click('[data-spell="web"] > summary');
  await p.waitForSelector('[data-spell="web"] .sd-list');
  t.ok(await p.locator('[data-spell="web"] .sd-list').count() === 1 && /Dexterity|Web/.test(await p.textContent('[data-spell="web"] .sd-list')), 'opening a card builds its details');
  t.eq(await p.locator('#list .sd-list').count(), 1, 'only the opened card has description DOM');
  await p.click('[data-spell="web"] > summary');
  await p.waitForSelector('[data-spell="web"] .sd-list', { state: 'detached' });
  t.eq(await p.locator('[data-spell="web"] .sd-list').count(), 0, 'closing drops the body');
  await filter(p, 'cast', 'bonus');
  const expMine = ['faerie-fire', 'fire-bolt', 'cure-wounds', 'web', 'mending'].filter((i) => lead(SPELL_DETAILS[i].time) === 'bonus action').sort();
  t.eq((await ids(p)).sort(), expMine, 'My spells + Bonus Action filter matches the data');
  await filter(p, 'cast', 'bonus');

  // All spells: every toggle shows everything; casting-time chips match the data
  await p.click('[data-action="spellView"][data-key="all"]');
  await p.click('details[data-fmore="spells"] > summary');
  for (const k of ['showLocked', 'legacy', 'extra']) await p.check(`[data-filter="spells.${k}"]`);
  t.eq((await ids(p)).length, SPELLS.length, 'All spells with every toggle shows the full list');
  const cast = {
    action: (s) => /^(1 )?action\b/.test(lead(s)), bonus: (s) => /\bbonus action\b/.test(lead(s)), reaction: (s) => /\breaction\b/.test(lead(s)),
    ritual: (s) => /ritual/i.test(s), longer: (s) => /\b(minute|hour)s?\b/.test(lead(s)),
  };
  for (const k of Object.keys(cast)) {
    await filter(p, 'cast', k);
    const want = SPELLS.filter((s) => cast[k](SPELL_DETAILS[s.id].time) || (k === 'ritual' && s.flags.includes('R'))).map((s) => s.id).sort();
    t.eq((await ids(p)).sort(), want, `casting-time filter "${k}" matches the data`);
    await filter(p, 'cast', k);
  }
  await p.fill('[data-filter="spells.q"]', 'shield');
  t.ok(/Reaction/.test(await p.textContent('#list [data-spell="shield"] summary')), 'Shield shows a Reaction tag');
  t.ok(await p.evaluate(() => document.activeElement.dataset.filter) === 'spells.q', 'search keeps focus while typing');
  await p.fill('[data-filter="spells.q"]', 'jump');
  t.ok(/Bonus Action/.test(await p.textContent('#list [data-spell="jump"] summary')), 'Jump shows Bonus Action');
  await p.fill('[data-filter="spells.q"]', 'identify');
  const idt = await p.textContent('#list [data-spell="identify"] summary');
  t.ok(/Longer/.test(idt) && /Ritual/.test(idt), 'Identify shows Longer and Ritual');
  await p.fill('[data-filter="spells.q"]', '');
  await filter(p, 'level', '2');
  t.ok(await p.locator('.lvl:not(.lvl2)').count() === 0, 'level filter shows only level 2');
  await p.ctx.close();

  // Preparing and the over-limit sheet. Level 5 has 6 prepared slots.
  const maxPrep = at(PREPARED, 5);
  p = await openPage(env, t, { tab: 'spells', mut: (s) => {
    const full = SPELLS.filter((x) => x.level > 0 && x.level <= 3 && x.source === 'list' && !['shield', 'thunderwave', 'scorching-ray', 'shatter'].includes(x.id)).slice(0, maxPrep).map((x) => x.id);
    s.character.spells = Object.fromEntries(full.map((i) => [i, 'prepared']));
  } });
  await p.waitForSelector('#list [data-spell]');
  t.eq(await p.locator('.flag.always').count(), 5, 'level 5 always-prepared spells: Mending + 4 Artillerist spells');
  t.eq(await p.locator('.item.spell >> text=Fireball').count(), 0, 'Fireball hidden at level 5');
  t.eq(await p.locator('.item.spell >> text=Absorb Elements').count(), 0, 'legacy spells hidden by default');
  await p.click('[data-action="spellView"][data-key="all"]');
  await filter(p, 'status', 'none'); await filter(p, 'level', '1');
  const btn = p.locator('#list [data-action="toggleSpell"]:not([data-id=""])').first();
  const pid = await btn.getAttribute('data-id');
  await btn.click();
  t.ok(await p.locator('.sheet[role="dialog"]').count() === 1 && new RegExp(`${maxPrep}/${maxPrep}`).test(await p.textContent('.sheet')), 'preparing past the limit opens a sheet');
  t.ok(await p.locator('.sheet button:has-text("Cancel")').count() === 1 && await p.locator('.sheet button:has-text("Prepare anyway")').count() === 1, 'sheet offers Cancel and Prepare anyway');
  await p.click('.sheet button:has-text("Cancel")');
  t.ok(!(await saved(p)).character.spells[pid], 'Cancel leaves it unprepared');
  t.eq(await p.evaluate(() => document.activeElement?.dataset?.id), pid, 'focus returns to the Prepare button');
  await p.locator(`[data-action="toggleSpell"][data-id="${pid}"]`).click();
  await p.click('.sheet button:has-text("Prepare anyway")');
  t.eq((await saved(p)).character.spells[pid], 'prepared', 'Prepare anyway prepares it');
  await p.click('.toast [data-action="undo"]');
  t.ok(!(await saved(p)).character.spells[pid], 'undo reverts it');
  await p.ctx.close();

  // Preparing within the limit needs no sheet
  p = await openPage(env, t, { tab: 'spells' });
  await p.click('[data-action="spellView"][data-key="all"]');
  await p.click('[data-action="toggleSpell"][data-id="web"]:not([disabled])').catch(() => {});
  t.eq(await p.locator('.sheet').count(), 0, 'toggling within the limit opens no sheet');
  await p.ctx.close();
  t.noErrors();
}
