// Journal: quick add (every kind), lists, tags, search, quests, sessions; Voice page (goals, lines, copy).
import { openPage, go, saved, withJournal, localDay } from '../lib.mjs';

export const name = 'Journal, quick add, voice';

export async function run(env, t) {
  // ---- Quick add from Combat
  let p = await openPage(env, t);
  const plus = await p.locator('.add-btn').boundingBox();
  t.ok(plus.width >= 44 && plus.height >= 44, 'Quick add button is at least 44px');
  let taps = 0; const tap = async (sel) => { taps++; await p.click(sel); };
  await tap('.add-btn'); await p.waitForSelector('.sheet .qa-grid');
  await tap('[data-action="qaPick"][data-k="npc"]');
  t.ok(await p.evaluate(() => document.activeElement?.dataset.field === 'main'), 'main field focused after choosing NPC');
  await p.keyboard.type('Baron Gareth'); await p.keyboard.press('Enter');
  await p.waitForSelector('.sheet', { state: 'detached' });
  t.ok(taps <= 2, 'NPC quick add is two taps plus typing');
  t.ok(/Added NPC Baron Gareth/.test(await p.textContent('#toasts')) && await p.locator('#toasts .toast-open').count() === 1, 'toast says what was added and offers Open');
  let st = await saved(p);
  t.ok(st.journal.npcs.length === 1 && st.journal.npcs[0].attitude === 'unknown' && st.journal.npcs[0].id && st.journal.npcs[0].createdAt, 'NPC saved with defaults');
  await p.click('#toasts .toast-undo');
  t.eq((await saved(p)).journal.npcs.length, 0, 'Undo removes the quick-added NPC');

  const add = async (k, main, key, tags, note) => {
    await p.click('.add-btn'); await p.waitForSelector('.sheet .qa-grid'); await p.click(`[data-action="qaPick"][data-k="${k}"]`);
    await p.fill('[data-field="main"]', main);
    if (key) await p.fill('[data-field="key"]', key);
    for (const x of tags || []) { await p.fill('[data-field="tagIn"]', x); await p.keyboard.press('Enter'); }
    if (note) await p.fill('[data-field="notes"]', note);
    await p.click('[data-action="quickSave"]'); await p.waitForSelector('.sheet', { state: 'detached' });
  };
  await add('npc', 'Baron Gareth', 'noble', ['Sharn', 'noble', 'SHARN']);
  await add('place', 'Cogs', 'district', ['sharn'], 'dark under-city');
  await add('faction', 'House Cannith', 'forge the Last War', ['house']);
  await add('quest', 'Find the forge', 'Kellan', ['main']);
  await add('line', 'Stand back, I am calibrating!');
  await add('session', 'Met a smuggler');
  await add('session', 'Second note');
  st = await saved(p);
  t.ok(JSON.stringify(st.journal.npcs[0].tags) === '["sharn","noble"]' && st.journal.npcs[0].role === 'noble', 'NPC tags are lowercased and deduped; key field is the role');
  t.ok(st.journal.places[0].kind === 'district' && st.journal.places[0].notes === 'dark under-city', 'place kind and note');
  t.ok(st.journal.factions[0].goals === 'forge the Last War' && st.journal.quests[0].giver === 'Kellan' && st.journal.quests[0].status === 'active', 'faction goals and quest giver');
  t.ok(st.character.voice.lines.some((l) => l.text === 'Stand back, I am calibrating!'), 'in-character line added');
  const today = await localDay(p);
  const todays = st.sessions.filter((x) => x.date === today);
  t.ok(todays.length === 1 && todays[0].number === 4 && /^\[\d\d:\d\d\] Met a smuggler\n\[\d\d:\d\d\] Second note$/.test(todays[0].notes), 'session notes: "Session 4" for today with timestamped lines');
  t.eq(st.sessions.length, 3, 'existing sessions kept');
  await p.click('.add-btn'); await p.click('[data-action="qaPick"][data-k="place"]'); await p.fill('[data-field="main"]', 'Skyway'); await p.keyboard.press('Enter');
  await p.click('#toasts .toast-open');
  await p.waitForSelector('.jcard[open]');
  t.ok(await p.locator('.seg [data-key="places"][aria-selected="true"]').count() === 1 && /Skyway/.test(await p.textContent('.jcard[open] summary')), 'toast Open switches to Places and opens the card');
  t.eq((await saved(p)).ui.sub.journal, 'places', 'last journal sub-tab remembered');
  await p.click('.add-btn'); await p.keyboard.press('Escape');
  await p.waitForSelector('.sheet', { state: 'detached' });
  t.ok(await p.evaluate(() => document.activeElement?.classList.contains('add-btn')), 'Escape closes quick add and focus returns to the + button');
  // drafts survive closing, are per form kind, and are cleared on save
  await p.click('.add-btn'); await p.click('[data-action="qaPick"][data-k="npc"]'); await p.fill('[data-field="main"]', 'Half typed'); await p.fill('[data-field="key"]', 'spy');
  await p.keyboard.press('Escape'); await p.waitForSelector('.sheet', { state: 'detached' });
  await p.click('.add-btn'); await p.click('[data-action="qaPick"][data-k="npc"]');
  t.ok(await p.inputValue('[data-field="main"]') === 'Half typed' && await p.inputValue('[data-field="key"]') === 'spy', 'quick add draft restored after closing');
  await p.click('[data-action="qaBack"]'); await p.click('[data-action="qaPick"][data-k="place"]');
  t.eq(await p.inputValue('[data-field="main"]'), '', 'draft is per form kind');
  await p.click('.sheet .sheet-close');
  await p.ctx.close();

  // ---- Lists, tags, search, quests
  p = await openPage(env, t, { tab: 'journal', mut: (s) => withJournal(s) });
  await go(p, 'journal', 'npcs');
  t.eq(await p.locator('.jcard').count(), 4, 'NPC list shows 4 cards');
  t.eq(await p.locator('.jcard .lazy-body').count(), 0, 'closed cards have no body DOM');
  const sums = await p.$$eval('.jcard > summary', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  t.ok(sums.some((x) => /Friendly/.test(x)) && sums.some((x) => /Hostile/.test(x)) && sums.some((x) => /spy · Dragonmarked/.test(x)), 'NPC summary shows role, faction and a text attitude badge');
  await p.click('.chips [data-key="tag"][data-val="ally"]');
  t.eq(await p.locator('.jcard').count(), 2, 'tag chip filters the list');
  await p.click('.chips [data-key="tag"][data-val=""]');
  await p.fill('[data-filter="npcs.q"]', 'noble');
  t.eq(await p.locator('.jcard').count(), 1, 'list search matches tags');
  await p.fill('[data-filter="npcs.q"]', '');
  await p.click('.jcard >> nth=1 >> summary');
  await p.waitForSelector('.jcard[open] .lazy-body');
  await p.fill('.jcard[open] [data-tag-add]', 'Rumor'); await p.keyboard.press('Enter');
  await p.locator('.jcard[open] .tagchip', { hasText: '#rumor' }).waitFor();
  t.ok(await p.evaluate(() => document.activeElement?.dataset.tagAdd !== undefined), 'focus stays in the tag input');
  await p.keyboard.type('x1,y2,');
  await p.locator('.jcard[open] .tagchip', { hasText: '#y2' }).waitFor();
  t.ok(await p.locator('.jcard[open] .tagchip', { hasText: '#x1' }).count() === 1, 'comma adds tags');
  await p.click('.jcard[open] .tagchip button[aria-label="Remove tag rumor"]');
  await p.locator('.jcard[open] .tagchip', { hasText: '#rumor' }).waitFor({ state: 'detached' });
  await p.selectOption('.jcard[open] select', 'hostile');
  await p.waitForFunction(() => /Hostile/.test(document.querySelector('.jcard[open] > summary').textContent));
  await p.fill('.jcard[open] [data-bind$=".name"]', 'Renamed NPC');
  for (let i = 0; i < 20; i++) { st = await saved(p); if (st.journal.npcs.some((n) => n.name === 'Renamed NPC')) break; await p.waitForTimeout(100); }
  const ed = st.journal.npcs.find((n) => n.name === 'Renamed NPC');
  t.ok(ed && ed.updatedAt >= ed.createdAt, 'edit saved' + (ed ? '' : ': ' + JSON.stringify(st.journal.npcs.map((n) => n.name))));
  t.ok(ed && ed.updatedAt !== ed.createdAt, 'updatedAt bumped (' + (ed && ed.createdAt) + ' / ' + (ed && ed.updatedAt) + ')');
  await p.click('.jcard[open] [data-action="removeEntry"]');
  await p.waitForFunction(() => document.querySelectorAll('.jcard').length === 3);
  t.ok(/Deleted NPC Renamed NPC/.test(await p.textContent('#toasts')), 'delete shows a toast');
  await p.click('#toasts .toast-undo');
  await p.waitForFunction(() => document.querySelectorAll('.jcard').length === 4);
  t.ok(true, 'delete undone');

  await go(p, 'journal', 'quests');
  const qs = await p.$$eval('.jcard > summary', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  t.ok(/Active/.test(qs[0]) && /1\/2/.test(qs[0]), 'quest shows status text and 1/2 progress, active first');
  t.ok(qs.findIndex((x) => /Failed/.test(x)) > qs.findIndex((x) => /Done/.test(x)), 'quests ordered active, paused, done, failed');
  await p.click('.jcard >> nth=0 >> summary');
  await p.waitForSelector('.jcard[open] [data-list-add]');
  await p.fill('.jcard[open] [data-list-add]', 'three'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => /1\/3/.test(document.querySelector('.jcard[open] > summary').textContent));
  await p.click('.jcard[open] .steps li .check >> nth=1');
  await p.waitForFunction(() => /2\/3/.test(document.querySelector('.jcard[open] > summary').textContent));
  await p.click('.jcard[open] [data-action="listRemove"] >> nth=2');
  await p.waitForFunction(() => /2\/2/.test(document.querySelector('.jcard[open] > summary').textContent));
  t.ok(true, 'quest steps: add -> 1/3, toggle -> 2/3, remove -> 2/2');

  await p.fill('#jsearch', 'noble');
  await p.waitForFunction(() => document.querySelectorAll('.jres button').length === 1 && /Baron Gareth/.test(document.querySelector('.jres').textContent), null, { timeout: 5000 }).catch(() => {});
  t.ok(await p.locator('.jres button').count() === 1 && /Baron Gareth/.test(await p.textContent('.jres')), 'global search finds an NPC by tag');
  await p.fill('#jsearch', 'sharn');
  await p.waitForFunction(() => document.querySelectorAll('#jbody h3').length >= 2);
  await p.click('#jbody [data-action="jtag"][data-val="noble"]');
  await p.waitForFunction(() => document.querySelectorAll('.jres button').length === 1);
  await p.click('.jres button');
  await p.waitForSelector('.jcard[open]');
  t.ok(await p.locator('.seg [data-key="npcs"][aria-selected="true"]').count() === 1 && /Baron Gareth/.test(await p.textContent('.jcard[open] summary')), 'tapping a result opens its card on the right sub-tab');
  t.eq(await p.inputValue('#jsearch'), '', 'search cleared after the jump');
  await p.ctx.close();

  // ---- Empty state and sessions
  p = await openPage(env, t, { tab: 'journal' });
  await go(p, 'journal', 'factions');
  t.ok(/No factions yet/.test(await p.textContent('#list')) && await p.locator('#list [data-action="addEntry"]').count() === 1, 'empty state offers an Add button');
  await p.click('#list [data-action="addEntry"]');
  await p.waitForSelector('.jcard[open]');
  t.ok(await p.evaluate(() => document.activeElement?.tagName === 'INPUT'), 'Add faction opens the card and focuses a field');
  await go(p, 'journal', 'journal');
  await p.click('.jcard >> nth=0 >> summary');
  await p.waitForSelector('.jcard[open] [data-tag-add]');
  await p.fill('.jcard[open] [data-tag-add]', 'clue'); await p.keyboard.press('Enter');
  await p.locator('.jcard[open] .tagchip', { hasText: '#clue' }).waitFor();
  t.ok((await saved(p)).sessions.some((x) => x.tags.includes('clue')), 'session tags work');
  await p.fill('[data-filter="sessions.q"]', 'kellan');
  t.eq(await p.locator('.jcard').count(), 1, 'session search works');
  await p.ctx.close();

  // ---- Voice
  p = await openPage(env, t, { theme: 'light', tab: 'stats', mut: (s) => withJournal(s) });
  await go(p, 'character', 'voice');
  const segs = await p.$$eval('.seg button', (e) => e.map((x) => x.textContent.trim()));
  t.ok(segs[0] === 'Stats' && segs[1] === 'Voice', 'Voice sits right after Stats');
  await p.fill('textarea[aria-label="Ideals"]', 'Progress\nwith care\nand more\nlines of text to grow');
  t.ok(await p.$eval('textarea[aria-label="Ideals"]', (e) => e.clientHeight) > 60, 'textarea auto-grows');
  await p.fill('[data-list-add="character.voice.goals"]', 'Rebuild the forge'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('.steps li').length >= 2);
  await p.click('.steps li .check >> nth=0');
  st = await saved(p);
  t.ok(st.character.voice.goals.length === 2 && st.character.voice.goals[0].done && st.character.voice.ideals.startsWith('Progress'), 'goals and ideals saved');
  // a re-render from the previous click can swallow typed text, so retry the add until the new line shows
  for (let i = 0; i < 4 && await p.locator('[data-action="copyLine"]').count() < 2; i++) {
    await p.fill('[data-list-add="character.voice.lines"]', 'Another line'); await p.keyboard.press('Enter');
    await p.waitForTimeout(250);
  }
  await p.waitForFunction(() => document.querySelectorAll('[data-action="copyLine"]').length === 2);
  const cp = await p.locator('[data-action="copyLine"]').first().boundingBox();
  t.ok(cp.width >= 44 && cp.height >= 44, 'copy button is 44px');
  await p.click('[data-action="copyLine"] >> nth=0');
  await p.waitForFunction(() => /Copied/.test(document.getElementById('toasts').textContent));
  t.eq(await p.evaluate(() => navigator.clipboard.readText()), 'By the Flame, hold still!', 'line copied to the clipboard');
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true }); document.execCommand = (c) => { window.__cmd = c; return true; }; });
  await p.click('[data-action="copyLine"] >> nth=1');
  await p.waitForFunction(() => window.__cmd === 'copy');
  t.ok(true, 'clipboard failure falls back to execCommand');
  await p.click('[data-action="listRemove"][data-path="character.voice.lines"] >> nth=1');
  t.eq((await saved(p)).character.voice.lines.length, 1, 'line removed');
  t.eq(await p.locator('details[data-block="bio"]:not([open])').count(), 1, 'Background notes start collapsed');
  await p.ctx.close();
  t.noErrors();
}

