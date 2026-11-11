// Accessibility: every control >= 44px and named, no horizontal scroll, on every page, open card, and bottom sheet, in both themes.
// If the axe-core package can be resolved (global install or NODE_PATH) it also runs axe and fails on serious/critical violations.
import { openPage, go, PAGES, audit, withJournal, tryRequire, imp } from '../lib.mjs';

export const name = 'Accessibility (44px targets, names, axe if available)';

export async function run(env, t) {
  const axe = tryRequire('axe-core');
  if (!axe) t.skip('axe-core not installed (npm i -g axe-core to enable)');
  const { SPELLS } = await imp('js/data/spells.js');

  const check = async (p, label) => {
    const r = await audit(p);
    t.ok(!r.small.length && !r.unnamed.length && !r.overflow, `${label}: <44px ${r.small.slice(0, 3)} unnamed ${r.unnamed.slice(0, 3)} hscroll ${r.overflow}`);
    if (axe) {
      const v = await p.evaluate(async (src) => { if (!window.axe) (0, eval)(src); const x = await window.axe.run(document, { resultTypes: ['violations'] }); return x.violations.filter((q) => q.impact === 'serious' || q.impact === 'critical').map((q) => `${q.id}(${q.nodes.length})`); }, axe.source);
      t.ok(v.length === 0, `${label}: axe ${v}`);
    }
  };
  const mut = async (s) => {
    await withJournal(s);
    Object.assign(s.character, { level: 9, slotsUsed: [0, 1, 0, 0, 0] }); s.character.uses.cannon = 1;
    SPELLS.filter((x) => x.level === 1 && x.source === 'list').slice(0, 12).forEach((x) => { s.character.spells[x.id] = 'prepared'; });
    s.character.feats.push({ id: 'f1', featId: 'war-caster', level: 4, notes: 'x' });
    s.character.plans.known = { '2-bag-of-holding': true };
  };

  for (const [theme, width] of [['dark', 360], ['light', 412]]) {
    const p = await openPage(env, t, { theme, mut, vp: { width, height: 800 } });
    for (const [sec, sub] of PAGES) {
      await go(p, sec, sub);
      const label = `${theme} ${width}px ${sec}/${sub || ''}`;
      await check(p, label);
      // open the first collapsible card / edit block, and the filter drawer where there is one
      const sum = p.locator('#panel details > summary:visible').first();
      if (await sum.count()) { await sum.click(); await p.waitForTimeout(120); await check(p, label + ' (card open)'); }
      if (sec === 'spells') { await p.click('[data-action="spellView"][data-key="all"]'); await p.click('details[data-fmore="spells"] > summary'); await check(p, label + ' (all spells, filters)'); }
      if (sub === 'feats') { await p.click('details[data-fmore="feats"] > summary'); await check(p, label + ' (filters)'); }
    }
    // quick add form and the global journal search results
    await go(p, 'journal', 'journal'); await p.fill('#jsearch', 'sharn'); await p.waitForSelector('.jres'); await check(p, `${theme} ${width}px journal search results`);
    await p.fill('#jsearch', '');
    await p.click('.add-btn'); await check(p, `${theme} ${width}px quick add picker`);
    await p.click('[data-action="qaPick"][data-k="quest"]'); await p.fill('[data-field="tagIn"]', 'abc'); await p.keyboard.press('Enter'); await check(p, `${theme} ${width}px quick add form`);
    await p.keyboard.press('Escape');
    await p.ctx.close();
  }

  // Bottom sheets on Combat: controls and fit
  const sheets = [['damage', '.dock [data-kind="damage"]'], ['heal', '.dock [data-kind="heal"]'], ['rest', '.dock [data-kind="rest"]'], ['cond', '[data-action="sheet"][data-kind="cond"]'],
    ['conc', '.g-conc'], ['hd', '.res-list [data-kind="hd"]'], ['cannonhp', '[data-action="sheet"][data-kind="cannonhp"]'], ['detonate', '[data-action="sheet"][data-kind="detonate"]']];
  for (const theme of ['dark', 'light']) {
    const p = await openPage(env, t, { theme, mut, vp: { width: 360, height: 800 } });
    for (const [kind, sel] of sheets) {
      await go(p, 'combat'); await p.evaluate(() => window.scrollTo(0, 0));
      await p.locator(sel).first().click();
      await p.waitForSelector('#sheet-root .sheet');
      await check(p, `${theme} sheet ${kind}`);
      const fit = await p.evaluate(() => document.querySelector('.sheet').getBoundingClientRect().height <= innerHeight * 0.9);
      t.ok(fit, `${theme} sheet ${kind} fits the screen`);
      await p.keyboard.press('Escape'); await p.waitForSelector('#sheet-root .sheet', { state: 'detached' });
    }
    await p.ctx.close();
  }
  {
    // sheets that need other state: slot picker (no cannon), coin keypad, generic plan, confirm (over the prepared limit)
    const p = await openPage(env, t, { mut: async (s) => { await mut(s); s.character.cannons = []; s.character.uses.cannon = 1; } });
    await p.click('[data-action="createCannon"][data-key="slot"]'); await p.waitForSelector('#sheet-root .sheet'); await check(p, 'sheet slot picker'); await p.keyboard.press('Escape');
    await go(p, 'workshop', 'equipment'); await p.click('.coin[data-key="gp"]'); await p.waitForSelector('#sheet-root .sheet'); await check(p, 'sheet coin keypad'); await p.keyboard.press('Escape');
    await go(p, 'workshop', 'plans'); await p.click('#list [data-action="learnGeneric"] >> nth=0'); await p.waitForSelector('#sheet-root .sheet'); await check(p, 'sheet generic plan'); await p.keyboard.press('Escape');
    await go(p, 'spells'); await p.click('[data-action="spellView"][data-key="all"]');
    await p.click('[data-action="filter"][data-page="spells"][data-key="status"][data-val="none"]');
    const over = p.locator('#list [data-action="toggleSpell"]:not([disabled])', { hasText: 'Prepare' }).first();
    if (await over.count()) { await over.click(); await p.waitForSelector('#sheet-root .sheet'); await check(p, 'sheet confirm'); await p.keyboard.press('Escape'); }
    await p.ctx.close();
  }
  t.noErrors();
}
