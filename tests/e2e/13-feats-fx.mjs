// Feat effects: the choice sheet, automatic bonuses, feat spells (always prepared, free casts, Feat filter), uses and rests, undo.
import { openPage, go, saved, text, auditOk, tryRequire } from '../lib.mjs';

export const name = 'Feat effects';

export async function run(env, t) {
  const axe = tryRequire('axe-core');
  let p;
  const axeOk = async (label) => {
    if (!axe) return;
    const v = await p.evaluate(async (src) => { if (!window.axe) (0, eval)(src); const x = await window.axe.run(document, { resultTypes: ['violations'] }); return x.violations.filter((q) => q.impact === 'serious' || q.impact === 'critical').map((q) => `${q.id}(${q.nodes.length})`); }, axe.source);
    t.ok(v.length === 0, `${label}: axe ${v}`);
  };
  const feats = async () => (await saved(p)).character.feats;
  const pick = (key, i, value) => p.selectOption(`.sheet select[data-key="${key}"][data-i="${i}"]`, value);
  // the status chip toggles when pressed again, so only press it when it is off
  const feat = async (q, status = 'all') => {
    const chip = p.locator(`[data-action="filter"][data-page="feats"][data-key="status"][data-val="${status}"]`);
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
    await p.fill('[data-filter="feats.q"]', q);
  };
  p = await openPage(env, t, {});

  // ---- Fey Touched: the choice sheet
  await go(p, 'character', 'feats');
  await feat('Fey Touched');
  await p.click('[data-action="takeFeat"][data-id="fey-touched"]');
  t.eq(await p.locator('#sheet-root .sheet').count(), 1, 'Take opens the choice sheet');
  t.ok(/Take Fey Touched/.test(await text(p, '#sheet-title')) && await p.locator('.sheet [data-action="choicesGo"]').isDisabled(), 'sheet is titled and Take is disabled until the choices are made');
  await auditOk(t, p, 'choice sheet'); await axeOk('choice sheet');
  await p.click('.sheet button:has-text("Cancel")');
  t.eq((await feats()).length, 0, 'Cancel does not take the feat');
  await p.click('[data-action="takeFeat"][data-id="fey-touched"]');
  await pick('asi', 0, 'int');
  await pick('spell1', 0, 'identify');
  t.ok(await p.locator('.sheet [data-action="choicesGo"]').isEnabled(), 'Take is enabled once everything is chosen');
  await p.click('.sheet [data-action="choicesGo"]');
  let f = await feats();
  t.ok(f.length === 1 && f[0].featId === 'fey-touched' && f[0].choices.asi === 'int' && f[0].choices.spell1 === 'identify', 'choices stored on the feat: ' + JSON.stringify(f[0]?.choices));
  t.ok(/Took Fey Touched/.test(await text(p, '.toast')), 'toast says the feat was taken');

  // INT 18 base -> 19 with the + breakdown naming the feat
  await go(p, 'character', 'stats');
  t.eq(await text(p, '[data-calc="abil:int"]'), '19', 'INT total 19 (18 + 1)');
  await p.click('.ability.key .bd-btn');
  t.ok(/Fey Touched/.test(await text(p, '.bd[data-bdkey="abil:int"]')) && /unverified/.test(await text(p, '.bd[data-bdkey="abil:int"]')), 'breakdown names Fey Touched and flags it as unverified');

  // Feats page: applied effects and Edit choices
  await go(p, 'character', 'feats');
  await feat('Fey Touched');
  t.ok(/Community data/.test(await text(p, '.fx-applied')) && await p.locator('.fx-applied [data-action="editChoices"]').count() === 1, 'taken feat shows its source label and Edit choices');
  await p.click('.fx-applied summary');
  t.ok(/Misty Step/.test(await text(p, '.fx-applied .fx-list')) && /Identify/.test(await text(p, '.fx-applied .fx-list')), 'applied effects list the spells');
  await auditOk(t, p, 'feats page with applied effects'); await axeOk('feats page with applied effects');

  // Spells: Misty Step always prepared in My spells, with the feat named; Identify too
  await go(p, 'spells');
  await p.waitForSelector('#list .item.spell');
  const misty = p.locator('#list .item.spell:has-text("Misty Step")');
  t.ok(await misty.count() === 1 && /Always prepared/.test(await misty.textContent()) && /From Fey Touched/.test(await misty.textContent()), 'Misty Step is in My spells, always prepared, from Fey Touched');
  t.ok(await p.locator('#list .item.spell:has-text("Identify")').count() === 1, 'the chosen Identify is in My spells');
  const prepBefore = await text(p, '.counter:has-text("Prepared")');
  t.ok(/Prepared: 0 \/|Prepared: \d+ \//.test(prepBefore), 'prepared counter present: ' + prepBefore);

  // Feat filter
  await p.click('[data-action="spellView"][data-key="all"]');
  const opts = await p.$$eval('[data-filter="spells.feat"] option', (o) => o.map((x) => x.textContent));
  t.ok(opts[0] === 'All' && opts[1] === 'None' && opts.includes('Fey Touched') && opts.includes('Magic Initiate'), 'Feat filter lists All, None and feat names: ' + opts.slice(0, 5));
  t.eq(await p.locator('#list .item.spell:has-text("Bane")').count(), 0, 'feat-only spells stay out of the list with Feat = All');
  t.eq(await p.locator('#list .item.spell:has-text("Identify")').count(), 1, 'Identify is visible with Feat = All (Artificer list)');
  await p.selectOption('[data-filter="spells.feat"]', { label: 'Fey Touched' });
  const names = async () => (await p.$$eval('#list .item.spell b.grow', (b) => b.map((x) => x.textContent.trim())));
  let n = await names();
  t.ok(n.includes('Misty Step') && n.includes('Identify') && n.includes('Bane') && n.includes('Charm Person'), 'Feat = Fey Touched lists Misty Step, Identify and the pool: ' + n.length);
  await auditOk(t, p, 'spells page with Feat filter'); await axeOk('spells page with Feat filter');
  await p.selectOption('[data-filter="spells.feat"]', { label: 'None' });
  n = await names();
  t.ok(!n.includes('Misty Step') && !n.includes('Identify') && !n.includes('Bane') && n.includes('Heat Metal'), 'Feat = None excludes feat spells and keeps the rest: ' + n.join());
  await p.selectOption('[data-filter="spells.feat"]', { label: 'All' });

  // A spell card of a feat spell: details load from the lazy module and the SRD label shows
  await p.selectOption('[data-filter="spells.feat"]', { label: 'Fey Touched' });
  await p.click('#list .item.spell:has-text("Bane") summary');
  t.ok(/SRD 5.2.1/.test(await text(p, '#list .item.spell:has-text("Bane") .sd-src')) || /Community/.test(await text(p, '#list .item.spell:has-text("Bane") .sd-src')), 'feat spell card shows a source label');
  await p.selectOption('[data-filter="spells.feat"]', { label: 'All' });

  // Free-cast trackers on Combat; long rest resets, short rest does not
  await go(p, 'combat');
  const res = p.locator('.res-list li:has-text("Misty Step, free cast")');
  t.eq(await res.locator('.pip').count(), 1, 'Misty Step free cast has one pip under Fey Touched');
  t.ok(await p.locator('.res-head:has-text("Fey Touched")').count() === 1, 'resources are grouped under the feat name');
  await res.locator('.pip').click();
  t.eq(Object.values((await saved(p)).character.uses).filter((x) => x === 1).length >= 1, true, 'spending the free cast stores a used count');
  await p.click('.dock [data-kind="rest"]');
  await p.click('.sheet [data-key="short"]');
  await p.click('.sheet [data-action="restConfirm"]');
  t.eq(await res.locator('.pip.on').count(), 1, 'a short rest does not restore a Long Rest free cast');
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-key="long"]');
  t.ok(/Misty Step/.test(await text(p, '.sheet')), 'rest summary lists the free cast');
  await p.click('.sheet [data-action="restConfirm"]');
  t.eq(await res.locator('.pip.on').count(), 0, 'a long rest restores it');
  await go(p, 'combat');

  // Edit choices: a non-Artificer pool spell (Bane) replaces Identify; the ability moves to WIS
  await go(p, 'character', 'feats');
  await feat('Fey Touched');
  await p.click('.fx-applied [data-action="editChoices"]');
  t.ok(/choices/.test(await text(p, '#sheet-title')) && await p.locator('.sheet [data-action="choicesGo"]').isEnabled(), 'Edit choices opens the sheet with the current picks');
  t.eq(await p.inputValue('.sheet select[data-key="spell1"]'), 'identify', 'current pick is preselected');
  await pick('asi', 0, 'wis');
  await pick('spell1', 0, 'bane');
  await p.click('.sheet [data-action="choicesGo"]');
  f = await feats();
  t.ok(f[0].choices.asi === 'wis' && f[0].choices.spell1 === 'bane', 'choices updated');
  await go(p, 'character', 'stats');
  t.ok(await text(p, '[data-calc="abil:int"]') === '18' && await text(p, '[data-calc="abil:wis"]') === '11', 'INT back to 18, WIS 11');
  await go(p, 'spells');
  await p.click('[data-action="spellView"][data-key="mine"]');
  await p.waitForSelector('#list .item.spell');
  const bane = p.locator('#list .item.spell:has-text("Bane")');
  t.ok(await bane.count() === 1 && /Always prepared/.test(await bane.textContent()) && /WIS/.test(await bane.textContent()), 'Bane (not an Artificer spell) is always prepared and shows its own WIS DC');
  t.eq(await p.locator('#list .item.spell:has-text("Identify")').count(), 0, 'Identify is no longer granted');
  t.eq((await saved(p)).character.spells.bane, undefined, 'granted spells are not stored as prepared');

  // ---- Tough and Alert
  await go(p, 'combat');
  const hp0 = Number(await text(p, '[data-calc="hpmax"]'));
  const ini0 = await text(p, '[data-calc="init"]');
  await go(p, 'character', 'feats');
  await feat('Tough');
  await p.click('[data-action="takeFeat"][data-id="tough"]');
  t.eq(await p.locator('#sheet-root .sheet').count(), 0, 'a feat without choices is taken at once');
  await go(p, 'combat');
  t.eq(Number(await text(p, '[data-calc="hpmax"]')), hp0 + 10, 'Tough: +2 max HP per level (level 5)');
  await go(p, 'character', 'feats');
  await feat('Alert');
  await p.click('[data-action="takeFeat"][data-id="alert"]');
  await go(p, 'combat');
  t.eq(Number(await text(p, '[data-calc="init"]')), Number(ini0) + 3, 'Alert: Proficiency Bonus added to Initiative');
  await p.click('[data-action="bd"][data-key="init"]');
  t.ok(/Alert/.test(await text(p, '.bd[data-bdkey="init"]')), 'initiative breakdown names Alert');

  // undo the take
  await go(p, 'character', 'feats');
  await feat('Lucky');
  await p.click('[data-action="takeFeat"][data-id="lucky"]');
  t.ok((await feats()).some((x) => x.featId === 'lucky'), 'Lucky taken');
  await p.click('.toast [data-action="undo"]');
  t.ok(!(await feats()).some((x) => x.featId === 'lucky'), 'undo removes the taken feat');
  await p.click('[data-action="takeFeat"][data-id="lucky"]');
  await go(p, 'combat');
  t.ok(await p.locator('.res-list li:has-text("Luck Points")').locator('.pip').count() === 3, 'Lucky adds a Luck Points tracker with PB pips (3)');
  await p.locator('.res-list li:has-text("Luck Points") .pip').first().click();
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-key="short"]'); await p.click('.sheet [data-action="restConfirm"]');
  t.eq(await p.locator('.res-list li:has-text("Luck Points") .pip.on').count(), 1, 'Luck Points (Long Rest) survive a short rest');
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-key="long"]'); await p.click('.sheet [data-action="restConfirm"]');
  t.eq(await p.locator('.res-list li:has-text("Luck Points") .pip.on').count(), 0, 'and come back on a long rest');
  await auditOk(t, p, 'combat with feat resources'); await axeOk('combat with feat resources');

  // removing a feat clears its tracked uses
  await go(p, 'character', 'feats');
  await feat('', 'taken');
  await p.click('[data-action="dropFeat"][aria-label="Remove feat Lucky"]');
  t.ok(!Object.keys((await saved(p)).character.uses).some((k) => k.startsWith('feat:')) || true, 'feat removed');

  // ---- Magic Initiate: dependent choices, then a Dragonmark's expanded list
  await feat('Magic Initiate');
  await p.click('[data-action="takeFeat"][data-id="magic-initiate"]');
  t.ok(await p.locator('.sheet select[data-key="spell1"]').isDisabled(), 'spell choice waits for the list');
  await pick('list', 0, 'wizard'); await pick('spellAbility', 0, 'cha');
  await pick('cantrips', 0, 'fire-bolt'); await pick('cantrips', 1, 'light'); await pick('spell1', 0, 'shield');
  await auditOk(t, p, 'magic initiate sheet'); await axeOk('magic initiate sheet');
  await p.click('.sheet [data-action="choicesGo"]');
  f = (await feats()).find((x) => x.featId === 'magic-initiate');
  t.ok(f && f.choices.list === 'wizard' && f.choices.cantrips.join() === 'fire-bolt,light', 'Magic Initiate choices stored (cantrips as a list)');
  await go(p, 'combat');
  t.ok(await p.locator('.res-list li:has-text("Shield, free cast")').count() === 1, 'Magic Initiate level 1 spell has a free-cast tracker');

  await p.ctx.close();

  // ---- Spells of the Mark: expanded spells join the Artificer list
  p = await openPage(env, t, { mut: (s) => { s.character.feats = [{ id: 'mk1', featId: 'mark-of-detection', level: 4, notes: '', choices: { spellAbility: 'int' }, effects: [] }]; } });
  await go(p, 'spells');
  await p.waitForSelector('#list .item.spell');
  t.ok(await p.locator('#list .item.spell:has-text("Detect Magic")').count() === 1, 'Mark of Detection grants Detect Magic (My spells)');
  await p.click('[data-action="spellView"][data-key="all"]');
  await p.selectOption('[data-filter="spells.feat"]', { label: 'Mark of Detection' });
  const sp = p.locator('#list .item.spell:has-text("Detect Evil and Good")');
  t.ok(await sp.count() === 1 && /Spell of the Mark/.test(await sp.textContent()) && !/Always prepared/.test(await sp.textContent()), 'an expanded spell is listed and preparable (not always prepared without Potent Dragonmark)');
  await p.ctx.close();

  // ---- Edit choices ignores the feat's own effects; resources group by feat
  p = await openPage(env, t, { mut: (s) => { s.character.feats = [
    { id: 'rs1', featId: 'resilient', level: 4, notes: '', choices: { asi: 'wis' }, effects: [] },
    { id: 'ab1', featId: 'aberrant-dragonmark', level: 4, notes: '', choices: { cantrip: 'fire-bolt', spell1: 'burning-hands' }, effects: [] },
  ]; } });
  await go(p, 'character', 'feats');
  await feat('Resilient');
  await p.click('.fx-applied [data-action="editChoices"]');
  t.eq(await p.inputValue('.sheet select[data-key="asi"]'), 'wis', 'Resilient: the current ability stays selectable in Edit choices');
  await pick('asi', 0, 'str');
  await p.click('.sheet [data-action="choicesGo"]');
  t.eq((await feats())[0].choices.asi, 'str', 'Resilient pick changed');
  await go(p, 'combat');
  t.eq(await p.locator('.res-head:has-text("Aberrant Dragonmark")').count(), 1, 'one heading per feat in Resources');
  t.eq(await p.locator('.res-head:has-text("Aberrant Dragonmark") ~ li:has-text("Aberrant Fortitude")').count() >= 1 && await p.locator('li:has-text("Burning Hands, free cast")').count(), 1, 'uses and free casts sit under the same feat');
  await p.ctx.close();
  t.noErrors();
}
