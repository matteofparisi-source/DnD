// Campaign & data: snapshots (upgrade, daily, long rest), export -> import round trip, restore, quota fallbacks, unreadable data, reset.
import fs from 'fs';
import { openPage, go, goData, saved, snaps, withJournal } from '../lib.mjs';

export const name = 'Snapshots, backup, import, restore';

const file = (name, obj) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const quotaOn = (p, key) => p.evaluate((k) => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (kk, v) { if (kk === k) throw new DOMException('full', 'QuotaExceededError'); return o.call(this, kk, v); }; }, key);

export async function run(env, t) {
  const seedV3 = () => { const v3 = env.seed('dark', 'combat'); delete v3.journal; delete v3.character.voice; v3.version = 3; v3.character.bio = { personality: 'Quiet', appearance: 'Tall' }; return v3; };

  // ---- Upgrade snapshot, daily marker, long-rest snapshot
  let p = await openPage(env, t, { state: seedV3() });
  let sn = await snaps(p);
  t.ok(sn.length === 1 && /Before upgrade to v4/.test(sn[0].reason) && JSON.parse(sn[0].data).version === 3, 'migration snapshot holds the old v3 data');
  t.eq((await saved(p)).version, 4, 'upgraded copy stored');
  await p.reload(); await p.waitForSelector('h1');
  t.eq((await snaps(p)).length, 1, 'no second snapshot on the same day');
  await p.evaluate(() => localStorage.setItem('dnd-companion-snapday', '2000-01-01'));
  await p.reload(); await p.waitForSelector('h1');
  sn = await snaps(p);
  t.ok(sn.length === 2 && sn[0].reason === 'Daily', 'daily snapshot on the first launch of a new day');
  await p.reload(); await p.waitForSelector('h1');
  t.eq((await snaps(p)).length, 2, 'only once per day');
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-action="restTab"][data-key="long"]'); await p.click('.sheet [data-action="restConfirm"]');
  sn = await snaps(p);
  t.ok(sn[0].reason === 'Before long rest' && JSON.parse(sn[0].data).character.hp.current === 24, 'long rest snapshot holds the pre-rest HP');
  const n0 = sn.length;
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-action="restConfirm"]');
  t.ok((await snaps(p)).length === n0 && (await snaps(p))[0].reason === 'Before long rest', 'a short rest takes no snapshot');
  await goData(p);
  t.eq(await p.locator('.snap-list li').count(), 3, 'Snapshots card lists upgrade, daily and long rest');
  t.ok(/only on this device/.test(await p.textContent('#snapshots')), 'card says snapshots stay on this device');

  // ---- Export -> import round trip, old-format import, cancel, bad files
  await p.click('.add-btn'); await p.click('[data-action="qaPick"][data-k="npc"]'); await p.fill('[data-field="main"]', 'Roundtrip NPC'); await p.fill('[data-field="tagIn"]', 'rt'); await p.keyboard.press('Enter'); await p.click('[data-action="quickSave"]');
  await p.click('.add-btn'); await p.click('[data-action="qaPick"][data-k="line"]'); await p.fill('[data-field="main"]', 'RT line'); await p.keyboard.press('Enter');
  await p.waitForSelector('.sheet', { state: 'detached' });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="export"]')]);
  const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  t.ok(exp.version === 4 && exp.journal.npcs.some((n) => n.name === 'Roundtrip NPC') && exp.character.voice.lines.some((l) => l.text === 'RT line'), 'export contains journal and voice');
  t.ok(!exp.ui || !('drive' in exp.ui), 'export has no Drive metadata');
  const v2 = { version: 2, character: { name: 'Imported Hero', level: 2, bio: { personality: 'Grumpy' } }, sessions: [{ number: 1, title: 'Imp session' }] };
  await p.setInputFiles('#importFile', file('v2.json', v2));
  await p.waitForSelector('.sheet [data-action="confirmGo"]');
  t.ok(/Import this backup/.test(await p.textContent('.sheet')), 'import asks through a sheet, not a native dialog');
  await p.click('.sheet [data-action="confirmGo"]');
  await p.waitForSelector('.sheet', { state: 'detached' });
  let st = await saved(p); sn = await snaps(p);
  t.ok(sn[0].reason === 'Before import' && JSON.parse(sn[0].data).journal.npcs.some((n) => n.name === 'Roundtrip NPC'), 'snapshot taken before import holds the previous data');
  t.ok(st.character.name === 'Imported Hero' && st.version === 4 && st.character.voice.personality === 'Grumpy' && st.journal.npcs.length === 0, 'v2 backup imported and migrated');
  await goData(p);
  await p.setInputFiles('#importFile', file('v2.json', v2));
  await p.waitForSelector('.sheet'); await p.click('.sheet [data-action="closeSheet"]');
  t.ok((await saved(p)).character.name === 'Imported Hero' && await p.locator('.sheet').count() === 0, 'cancelling an import changes nothing');
  await p.setInputFiles('#importFile', file('rt.json', exp));
  await p.waitForSelector('.sheet [data-action="confirmGo"]'); await p.click('.sheet [data-action="confirmGo"]');
  await p.waitForSelector('.sheet', { state: 'detached' });
  st = await saved(p);
  t.ok(JSON.stringify(st.journal) === JSON.stringify(exp.journal) && JSON.stringify(st.character.voice) === JSON.stringify(exp.character.voice), 'export -> import round trip keeps journal and voice');
  for (const body of ['{"nope":1}', '{"character":[]}', '{"character":"x"}', '[]', '{"character":null}', 'not json']) {
    await goData(p);
    const dialog = p.waitForEvent('dialog');
    await p.setInputFiles('#importFile', file('bad.json', body));
    const d = await dialog; const msg = d.message(); await d.accept();
    t.ok(/Import failed/.test(msg) && await p.locator('.sheet').count() === 0, 'invalid import rejected: ' + body);
  }

  // ---- Restore from a snapshot
  await goData(p);
  const target = (await snaps(p)).findIndex((x) => x.reason === 'Before import');
  const curName = (await saved(p)).character.name;
  await p.click(`.snap-list li >> nth=${target} >> [data-action="snapRestore"]`);
  await p.waitForSelector('.sheet [data-action="confirmGo"]');
  t.ok(/Restore this snapshot/.test(await p.textContent('.sheet')), 'restore asks first');
  await p.click('.sheet [data-action="confirmGo"]'); await p.waitForSelector('.sheet', { state: 'detached' });
  st = await saved(p); sn = await snaps(p);
  t.ok(st.character.name !== curName, 'restore replaced the state');
  t.ok(sn[0].reason === 'Before restore' && JSON.parse(sn[0].data).character.name === curName, 'restore snapshots the current state first');
  t.ok(sn.filter((x) => x.kind === 'important').length <= 3 && sn.filter((x) => x.kind === 'daily').length <= 1 && sn.filter((x) => x.kind === 'rest').length <= 1, 'retention per kind: 1 daily, 1 rest, 3 important');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('.snap-list li >> nth=0 >> [data-action="snapDownload"]')]);
  t.ok(/snapshot/.test(dl2.suggestedFilename()), 'snapshot download file name: ' + dl2.suggestedFilename());

  // ---- Quota failures: snapshots cannot be stored, then the main save fails
  await quotaOn(p, 'dnd-companion-snapshots');
  await go(p, 'combat');
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-action="restTab"][data-key="long"]'); await p.click('.sheet [data-action="restConfirm"]');
  await p.waitForFunction(() => /safety snapshot could not be saved/.test(document.getElementById('toasts').textContent));
  t.ok(true, 'long rest warns when its snapshot could not be saved');
  await go(p, 'character', 'stats'); await p.fill('[data-bind="character.name"]', 'Quota Test');
  t.eq((await saved(p)).character.name, 'Quota Test', 'saving still works while snapshot storage is full');
  await goData(p);
  await p.setInputFiles('#importFile', file('v2.json', v2));
  await p.waitForSelector('.sheet [data-action="confirmGo"]'); await p.click('.sheet [data-action="confirmGo"]');
  await p.waitForSelector('.sheet [data-action="downloadCurrent"]');
  t.ok(/could not be saved/.test(await p.textContent('.sheet')) && await p.locator('.sheet [data-action="closeSheet"]').count() >= 1, 'import warns that the safety snapshot failed and offers Cancel');
  t.eq((await saved(p)).character.name, 'Quota Test', 'nothing replaced yet');
  const [dl3] = await Promise.all([p.waitForEvent('download'), p.click('.sheet [data-action="downloadCurrent"]')]);
  t.eq(JSON.parse(fs.readFileSync(await dl3.path(), 'utf8')).character.name, 'Quota Test', 'Download current data first gives the current state');
  await p.click('.sheet [data-action="confirmGo"]'); await p.waitForSelector('.sheet', { state: 'detached' });
  t.eq((await saved(p)).character.name, 'Imported Hero', 'Continue anyway imports');
  t.ok(/Saved/.test(await p.textContent('#saveStatus')), 'save status shown after import');
  await quotaOn(p, 'dnd-companion-v1');
  await go(p, 'character', 'stats'); await p.fill('[data-bind="character.name"]', 'Cant save');
  await p.waitForFunction(() => /Save failed/.test(document.getElementById('saveStatus').textContent));
  t.ok(true, 'save status reports a failing save');
  await p.ctx.close();

  // ---- Unreadable data is kept, never overwritten; Delete everything snapshots first
  const ctx = await env.browser.newContext({ ...env.devices['Pixel 7'], serviceWorkers: 'block' });
  const q = await openPage(env, t, { context: ctx, raw: '{"character": {broken' });
  await q.waitForSelector('#toasts .toast');
  t.ok(/couldn.t be read — a copy is in Snapshots/.test(await q.textContent('#toasts')), 'unreadable data: start toast');
  let sx = await snaps(q);
  t.ok(sx.length === 1 && sx[0].reason === 'Unreadable data' && sx[0].kind === 'important' && sx[0].data === '{"character": {broken', 'raw text kept as an important snapshot');
  await q.reload(); await q.waitForSelector('h1');
  t.eq(await q.evaluate(() => { window.dispatchEvent(new Event('pagehide')); return localStorage.getItem('dnd-companion-v1'); }), '{"character": {broken', 'main key not overwritten by the fallback state');
  await go(q, 'character', 'stats'); await q.fill('[data-bind="character.name"]', 'Fresh');
  t.eq((await saved(q)).character.name, 'Fresh', 'saves once the user changes something');
  q.on('dialog', (d) => d.accept());
  await q.click('.seg [data-key="data"]'); await q.click('[data-action="reset"]');
  await q.waitForFunction(() => JSON.parse(localStorage.getItem('dnd-companion-snapshots') || '[]').some((x) => x.reason === 'Before delete everything'));
  sx = await snaps(q);
  t.ok(sx.some((x) => x.kind === 'important' && x.reason === 'Before delete everything') && sx.some((x) => x.reason === 'Unreadable data'), 'Delete everything snapshots first and keeps snapshots');
  await ctx.close();
  t.noErrors(/Could not save|QuotaExceeded|Could not load saved data/); // the quota and unreadable-data cases log on purpose
}
