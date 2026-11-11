// Google Drive mirror against a stubbed Google sign-in and an in-memory fake Drive (no network, no real account).
import { openPage, go, goData, saved, localDay } from '../lib.mjs';
import { makeFake, STUB } from '../drive-fake.mjs';

export const name = 'Google Drive sync (stubbed)';

export async function run(env, t) {
  async function open(fake, opts = {}) {
    const p = await openPage(env, t, { ...opts, noGoto: true, init: STUB });
    if (opts.debounce !== undefined) await p.addInitScript((d) => { window.__driveDebounceMs = d; window.__driveBackoffMs = 20; }, opts.debounce);
    await p.ctx.route('https://www.googleapis.com/**', fake.handler);
    await p.ctx.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await p.goto(env.url); await p.waitForSelector('h1');
    return p;
  }
  const toasts = (p) => p.evaluate(() => document.getElementById('toasts').textContent);
  const status = (p) => p.textContent('#driveStatus');
  const rat = (p) => p.evaluate(() => window.__rat);
  const setName = async (p, v) => { await go(p, 'character', 'stats'); await p.fill('[data-bind="character.name"]', v); };
  // First tap may only prepare Google's script ("Sign in with Google"); a second tap then requests the token.
  const tapSign = async (p, sel) => { await p.click(sel); await p.waitForFunction((s) => document.querySelector(s)?.disabled === false, sel); const lab = await p.locator(sel).first().textContent(); if (/^Sign in/.test(lab.trim())) await p.click(sel); };
  const connect = async (p) => {
    await goData(p); await tapSign(p, '[data-action="driveConnect"]');
    await p.waitForFunction(() => /Connected/.test(document.getElementById('driveStatus')?.textContent || '') || document.querySelector('#sheet-root .sheet'));
    await p.waitForFunction(() => !document.querySelector('#driveStatus [data-action="driveSync"]:disabled'));
  };
  const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 });
  const poll = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return false; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- 1. Connect: folder, save file, content, daily backup, no token stored
  let fake = makeFake(); let p = await open(fake);
  t.ok(!p.reqs.some((u) => /drive\.js|accounts\.google\.com|googleapis/.test(u)), 'startup loads nothing from Drive or Google');
  await go(p, 'character', 'stats');
  t.ok(!p.reqs.some((u) => /drive\.js/.test(u)), 'Character > Stats still loads no Drive code');
  await goData(p);
  t.ok(p.reqs.some((u) => /\/js\/drive\.js/.test(u)) && !p.reqs.some((u) => /accounts\.google\.com/.test(u)), 'Drive card imports drive.js but not Google sign-in');
  // two taps: the first only prepares, the second asks for the token inside the user gesture
  await p.click('[data-action="driveConnect"]');
  await p.waitForFunction(() => /Sign in with Google/.test(document.querySelector('#driveStatus [data-action="driveConnect"]')?.textContent || ''));
  t.eq(await rat(p), 0, 'first tap does not open the pop-up');
  t.ok(p.reqs.some((u) => /accounts\.google\.com\/gsi\/client/.test(u)), 'Google script loads only after Connect');
  t.eq(await p.evaluate(() => document.activeElement?.dataset?.action), 'driveConnect', 'focus stays on the button');
  t.ok(/Sign-in is ready/.test(await toasts(p)), 'readiness announced in the live region');
  await p.click('[data-action="driveConnect"]');
  await until(p, () => /Connected/.test((document.getElementById('driveStatus')?.textContent || '')) && !document.querySelector('#driveStatus [data-action="driveSync"]:disabled'));
  t.eq(await p.evaluate(() => JSON.stringify(window.__ratLog)), '[true]', 'requestAccessToken ran synchronously inside the tap');
  const sf = fake.save(); const day = await localDay(p); const content = JSON.parse(sf.content);
  t.ok(fake.folder()?.mimeType === 'application/vnd.google-apps.folder' && fake.folder().parents.length === 0, 'folder "DnD Slop" created at the Drive root');
  t.ok(sf.parents[0] === fake.folder().id, 'save file lives inside the folder');
  t.ok(content.character?.name === "Vex d'Cannith" && content.savedAt && /Android Chrome/.test(content.device) && content.ui && !('drive' in content.ui), 'uploaded content: character, savedAt, device, ui without ui.drive');
  t.eq(fake.backups().map((f) => f.name), [`dnd-slop-${day}.json`], 'daily backup created');
  let st = await saved(p);
  t.ok(st.ui.drive.connected && st.ui.drive.folderId === fake.folder().id && st.ui.drive.fileId === sf.id && st.ui.drive.lastRemoteModified === sf.modifiedTime, 'ui.drive ids and timestamps stored');
  t.ok(!/access_token|"test"|Bearer/.test(await p.evaluate(() => JSON.stringify(Object.entries(localStorage)))), 'no token in localStorage');
  t.ok(!/access_token|Bearer/.test(sf.content), 'no token in the Drive file');
  await p.ctx.close();

  // ---- 2. Auto sync: one upload after the debounce; long rest and quick-add note sync at once
  fake = makeFake(); p = await open(fake, { debounce: 400 }); await connect(p);
  let n0 = fake.puts();
  await setName(p, 'Vex A'); await p.fill('[data-bind="character.name"]', 'Vex AB');
  t.eq(fake.puts(), n0, 'no upload before the debounce');
  await poll(() => fake.puts() > n0); await sleep(600);
  t.ok(fake.puts() === n0 + 1 && JSON.parse(fake.save().content).character.name === 'Vex AB', 'one auto upload with the latest content');
  await go(p, 'combat'); await p.click('[data-action="sheet"][data-kind="rest"]'); await p.click('[data-action="restTab"][data-key="long"]'); n0 = fake.puts();
  await p.click('[data-action="restConfirm"]'); await poll(() => fake.puts() > n0); await sleep(400);
  t.eq(fake.puts(), n0 + 1, 'long rest triggers a sync');
  n0 = fake.puts();
  await p.click('.add-btn'); await p.click('[data-action="qaPick"][data-k="session"]'); await p.fill('[data-field="main"]', 'drive test note'); await p.click('[data-action="quickSave"]');
  await poll(() => fake.puts() > n0); await sleep(400);
  t.ok(fake.puts() === n0 + 1 && /drive test note/.test(fake.save().content), 'quick-added session note syncs');
  await p.ctx.close();

  // ---- 3. Expired pass: strip button, no pop-up on its own, tap renews; reload never signs in by itself
  fake = makeFake(); p = await open(fake, { debounce: 300 });
  await p.evaluate(() => { window.__tokenTtl = 62; });
  await connect(p);
  t.eq(await p.locator('#driveStrip .drive-btn').count(), 0, 'no strip button while the pass is valid');
  await until(p, () => document.querySelectorAll('#driveStrip .drive-btn').length === 1);
  t.ok(/Sync to Drive/.test(await p.textContent('#driveStrip')), 'Sync to Drive appears when the pass expires');
  const r0 = await rat(p); n0 = fake.puts();
  await setName(p, 'After expiry'); await sleep(900);
  t.ok(fake.puts() === n0 && await rat(p) === r0, 'no upload and no pop-up while expired');
  await p.evaluate(() => { window.__tokenTtl = 3599; });
  await p.click('#driveStrip .drive-btn');
  await until(p, () => !document.querySelector('#driveStrip .drive-btn'));
  // The button hides as soon as the token arrives; the upload follows asynchronously, so wait for it.
  await poll(() => fake.puts() > n0); await sleep(400);
  t.ok(fake.puts() === n0 + 1 && JSON.parse(fake.save().content).character.name === 'After expiry', 'tap -> token -> sync');
  p.reqs.length = 0; await p.reload(); await p.waitForSelector('#driveStrip .drive-btn');
  t.ok(await rat(p) === 0 && !p.reqs.some((u) => /accounts\.google\.com/.test(u)), 'after reload: button shown, no automatic sign-in, Google script not loaded');
  await p.ctx.close();

  // ---- 4. Imports are not auto-uploaded (needsConfirm), then a confirmed upload keeps a before-import copy
  fake = makeFake(); p = await open(fake, { debounce: 300 }); await connect(p);
  const oldRemote = fake.save().content;
  const imp = JSON.parse(await p.evaluate(() => localStorage.getItem('dnd-companion-v1'))); imp.character.name = 'Imported hero'; delete imp.ui.drive;
  await goData(p);
  await p.setInputFiles('#importFile', { name: 'imp.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imp)) });
  await p.click('#sheet-root [data-action="confirmGo"]'); await p.waitForSelector('#sheet-root .sheet', { state: 'detached' });
  st = await saved(p);
  t.ok(st.character.name === 'Imported hero' && st.ui.drive.needsConfirm === true && st.ui.drive.connected, 'import keeps the Drive link and sets needsConfirm');
  n0 = fake.puts(); await setName(p, 'Imported hero 2'); await sleep(1000);
  t.ok(fake.puts() === n0 && fake.save().content === oldRemote, 'import + edit: no automatic upload');
  t.ok(/Upload imported data to Drive\?/.test(await p.textContent('#driveStrip')), 'strip asks for a tap');
  await p.click('#driveStrip .drive-btn'); await p.waitForSelector('#sheet-root .sheet'); await p.click('#sheet-root [data-action="confirmGo"]');
  await until(p, () => !document.querySelector('#sheet-root .sheet'));
  await poll(() => [...fake.files.values()].some((f) => /^dnd-slop-before-import-/.test(f.name)) && JSON.parse(fake.save().content).character.name === 'Imported hero 2');
  const bi = [...fake.files.values()].filter((f) => /^dnd-slop-before-import-/.test(f.name));
  t.ok(bi.length === 1 && bi[0].content === oldRemote && JSON.parse(fake.save().content).character.name === 'Imported hero 2', 'before-import copy of the old remote, then the upload');
  t.eq((await saved(p)).ui.drive.needsConfirm, false, 'needsConfirm cleared after the upload');
  await p.ctx.close();

  // ---- 5. Remote newer + local clean -> silent download with a snapshot
  fake = makeFake(); p = await open(fake); await connect(p);
  fake.external((d) => { d.character.name = 'From Drive'; });
  await p.click('#driveStatus [data-action="driveSync"]');
  await until(p, () => /Updated from Drive/.test(document.getElementById('toasts').textContent));
  st = await saved(p);
  t.ok(st.character.name === 'From Drive' && !('savedAt' in st) && !('device' in st) && st.ui.theme === 'dark' && st.ui.drive.connected, 'silent download applied; savedAt/device not leaked; local ui kept');
  t.ok((await p.evaluate(() => JSON.parse(localStorage.getItem('dnd-companion-snapshots') || '[]'))).some((x) => x.reason === 'Before Drive download'), 'snapshot taken before the download');
  await p.ctx.close();

  // ---- 6. Conflict sheet: Use Drive / Keep this device / Cancel; auto sync only shows a review button
  const conflict = async () => {
    fake = makeFake(); p = await open(fake); await connect(p);
    fake.external((d) => { d.character.name = 'Remote name'; });
    await setName(p, 'Local name'); await goData(p);
    await p.click('#driveStatus [data-action="driveSync"]'); await p.waitForSelector('#sheet-root .sheet');
  };
  await conflict();
  t.ok(/Drive has newer data from Windows Edge \(saved /.test(await p.textContent('#sheet-root .sheet')), 'conflict sheet names the other device');
  await p.click('#sheet-root [data-action="driveUse"]'); await until(p, () => !document.querySelector('#sheet-root .sheet'));
  st = await saved(p);
  const sn = (await p.evaluate(() => JSON.parse(localStorage.getItem('dnd-companion-snapshots') || '[]'))).find((x) => x.reason === 'Before Drive download');
  t.ok(st.character.name === 'Remote name' && sn && JSON.parse(sn.data).character.name === 'Local name' && sn.kind === 'important' && fake.conflicts().length === 0, 'Use Drive version replaces local; important snapshot keeps the local copy');
  await p.ctx.close();
  await conflict();
  await p.click('#sheet-root [data-action="driveKeep"]'); await until(p, () => !document.querySelector('#sheet-root .sheet'));
  await poll(() => JSON.parse(fake.save().content).character.name === 'Local name');
  t.ok(JSON.parse(fake.save().content).character.name === 'Local name' && fake.conflicts().length === 1 && JSON.parse(fake.conflicts()[0].content).character.name === 'Remote name', 'Keep this device overwrites Drive after copying the remote to dnd-slop-conflict-*');
  await p.ctx.close();
  await conflict();
  const before = fake.save().content; const pf = fake.puts();
  await p.click('#sheet-root [data-action="closeSheet"]'); await sleep(400);
  t.ok(fake.save().content === before && fake.puts() === pf && (await saved(p)).character.name === 'Local name' && /not synced/.test(await status(p)), 'Cancel changes nothing and stays marked unsynced');
  await p.ctx.close();
  fake = makeFake(); p = await open(fake, { debounce: 300 }); await connect(p);
  fake.external((d) => { d.character.name = 'Remote auto'; });
  await setName(p, 'Local auto');
  await p.waitForSelector('#driveStrip .drive-btn');
  t.ok(await p.locator('#sheet-root .sheet').count() === 0 && /review/.test(await p.textContent('#driveStrip')), 'auto sync + conflict: no sheet, a review button');
  await p.click('#driveStrip .drive-btn'); await p.waitForSelector('#sheet-root .sheet');
  await p.ctx.close();

  // ---- 7. Refusals and edge cases
  fake = makeFake(); p = await open(fake); await connect(p);
  fake.external((d) => { d.version = 99; d.character.name = 'Future'; });
  await p.click('#driveStatus [data-action="driveSync"]');
  await until(p, () => /newer version of the app/.test((document.getElementById('driveStatus')?.textContent || '')));
  t.eq((await saved(p)).character.name, "Vex d'Cannith", 'a newer schema version is refused and local data stays');
  await p.ctx.close();
  fake = makeFake(); p = await open(fake);
  await p.evaluate(() => { window.__noScope = true; });
  await goData(p); await tapSign(p, '[data-action="driveConnect"]');
  await until(p, () => /permission wasn't granted/.test((document.getElementById('driveStatus')?.textContent || '')));
  t.ok(/Not connected/.test(await status(p)) && fake.files.size === 0, 'scope not granted: stays disconnected, nothing created');
  await p.evaluate(() => { window.__noScope = false; });
  await p.click('[data-action="driveConnect"]'); await until(p, () => /Connected/.test((document.getElementById('driveStatus')?.textContent || '')));
  fake.delay = 1200;
  await p.click('#driveStatus [data-action="driveSync"]');
  t.ok(!(await p.locator('#driveStatus [data-action="driveDisconnect"]').isDisabled()), 'Disconnect stays enabled while syncing');
  await p.click('#driveStatus [data-action="driveDisconnect"]');
  await until(p, () => /Not connected/.test((document.getElementById('driveStatus')?.textContent || '')));
  st = await saved(p);
  t.ok(st.ui.drive.connected === false && !st.ui.drive.fileId, 'Disconnect clears the Drive link');
  fake.delay = 0; await p.ctx.close();
  fake = makeFake(); fake.create503 = 1;
  p = await open(fake, { debounce: 300 }); await connect(p);
  t.ok(fake.byName('dnd-slop-save.json').length === 1 && !!(await saved(p)).ui.drive.fileId, 'a create that answered 503 is re-listed instead of duplicated');
  await p.ctx.close();
  t.noErrors();
}
