// Navigation, themes, first run, migration on load, and loose responsiveness sanity. Every page must render without console errors.
import { openPage, go, saved, PAGES, withJournal, text } from '../lib.mjs';

export const name = 'Navigation, themes, no console errors';

export async function run(env, t) {
  // Fresh install: nothing stored, lands on Combat with defaults.
  let p = await openPage(env, t, { noSeed: true });
  t.eq((await saved(p)).ui.tab, 'combat', 'fresh start lands on Combat')
  t.ok((await p.locator('#panel').innerText()).length > 20, 'fresh start: Combat has content');
  await p.ctx.close();

  // Old v1 data migrates on load and the name shows in the header.
  p = await openPage(env, t, { raw: JSON.stringify({ version: 1, character: { name: 'Old Hero', classes: [{ name: 'Fighter', level: 2 }], inventory: [{ name: 'Rope', qty: 1 }] }, sessions: [{ id: 'x', number: 1, title: 'Old session' }] }) });
  t.eq(await text(p, 'h1'), 'Old Hero', 'v1 data migrates, name shown');
  await go(p, 'journal', 'journal');
  t.ok((await p.textContent('#panel')).includes('Old session'), 'old session kept');
  t.eq((await saved(p)).version, 5, 'stored copy upgraded to v5');
  await p.ctx.close();

  // Every page, both themes, phone viewport.
  for (const theme of ['dark', 'light']) {
    p = await openPage(env, t, { theme, mut: (s) => withJournal(s) });
    t.eq(await p.evaluate(() => document.documentElement.dataset.theme), theme, `${theme}: data-theme applied before first paint`);
    for (const [sec, sub] of PAGES) {
      await go(p, sec, sub);
      const label = `${theme} ${sec}/${sub || ''}`;
      t.ok((await p.locator('#panel').innerText()).length > 20, `${label}: renders content`);
      t.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${label}: no horizontal scroll`);
      t.eq(await p.locator('h1').count(), 1, `${label}: exactly one h1`);
    }
    // sub-tab is remembered per section
    await go(p, 'character', 'voice'); await go(p, 'combat'); await p.click('.bnav [data-key="character"]');
    t.eq(await p.locator('.seg [aria-selected="true"]').getAttribute('data-key'), 'voice', `${theme}: last sub-tab remembered`);
    // loose sanity only: a tab switch should not take a quarter of a second without CPU throttling
    const ms = await p.evaluate(() => new Promise((res) => { const t0 = performance.now(); document.querySelector('.bnav [data-key="spells"]').click(); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0))); }));
    t.ok(ms < 250, `${theme}: tab switch took ${Math.round(ms)} ms (< 250)`);
    await p.ctx.close();
  }

  // Theme button cycles dark -> light -> auto and persists.
  p = await openPage(env, t, { theme: 'dark' });
  const seen = [];
  for (let i = 0; i < 3; i++) { await p.click('.theme-btn'); seen.push((await saved(p)).ui.theme); }
  t.eq(seen, ['light', 'auto', 'dark'], 'theme button cycles light, auto, dark');
  await p.ctx.close();

  // Desktop layout (Windows laptop size) renders every main page without overflow.
  p = await openPage(env, t, { desktop: true, mut: (s) => withJournal(s) });
  for (const [sec, sub] of [['combat'], ['spells'], ['workshop', 'equipment'], ['journal', 'npcs'], ['character', 'stats']]) {
    await go(p, sec, sub);
    t.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `1366x768 ${sec}/${sub || ''}: no horizontal scroll`);
  }
  await p.ctx.close();
  t.noErrors();
}
