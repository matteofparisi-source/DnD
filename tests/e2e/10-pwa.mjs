// Service worker: precache, update banner (served version swapped by the test server), reload keeps typed text, offline use after one visit.
import { openPage, go, appVersion, PAGES } from '../lib.mjs';

export const name = 'PWA: update banner and offline';

export async function run(env, t) {
  const real = appVersion(); const next = 'ledger-v9998'; const third = 'ledger-v9997';
  const swReady = (p) => p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 });
  const cacheNames = (p) => p.evaluate(async () => (await caches.keys()).join(','));
  const untilCaches = async (p, names) => { for (let i = 0; i < 100 && (await cacheNames(p)) !== names; i++) await new Promise((r) => setTimeout(r, 100)); };
  const checkUpdate = (p) => p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });

  // ---- Install, update banner, reload path, dismiss path
  let p = await openPage(env, t, { sw: true });
  await swReady(p);
  t.eq(await p.locator('#update-banner').count(), 0, 'first install shows no update banner');
  await p.reload(); await p.waitForSelector('h1'); await swReady(p);
  t.eq(await cacheNames(p), real, 'cache name equals the app version');
  const precached = await p.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length);
  t.ok(precached >= 20, 'precache holds the app shell and data: ' + precached);
  await go(p, 'character', 'data');
  t.ok((await p.textContent('.credits')).includes(`Version ${real}`), 'About shows the running version');
  try {
    env.srv.setVersion(next);
    await checkUpdate(p);
    await p.waitForSelector('#update-banner button', { timeout: 10000 });
    await untilCaches(p, next);
    t.eq(await cacheNames(p), next, 'old cache removed, only the new one remains');
    const sizes = await p.locator('#update-banner button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    t.ok(sizes.length === 2 && sizes.every(([w, h]) => w >= 44 && h >= 44), 'banner buttons are at least 44px: ' + JSON.stringify(sizes));
    await p.click('.add-btn');
    await p.waitForSelector('#sheet-root .sheet');
    t.ok(!(await p.locator('#update-banner').isVisible()), 'banner hidden while a sheet is open');
    await p.keyboard.press('Escape'); await p.waitForSelector('#sheet-root .sheet', { state: 'detached' });
    t.ok(await p.locator('#update-banner').isVisible(), 'banner visible again after the sheet closes');
    await p.fill('[data-bind="campaign.name"]', 'Banner test');
    await p.click('#update-banner [data-action="reloadApp"]');
    await p.waitForLoadState('load'); await p.waitForSelector('h1');
    t.eq(await p.locator('#update-banner').count(), 0, 'no banner after reloading');
    await go(p, 'character', 'data');
    t.ok((await p.textContent('.credits')).includes(`Version ${next}`), 'new version shown after reload');
    t.eq(await p.inputValue('[data-bind="campaign.name"]'), 'Banner test', 'text typed before tapping Reload was saved');
    env.srv.setVersion(third);
    await checkUpdate(p);
    await p.waitForSelector('#update-banner [data-action="dismissUpdate"]', { timeout: 10000 });
    await p.click('#update-banner [data-action="dismissUpdate"]');
    t.ok(await p.locator('#update-banner').count() === 0 && !(await p.evaluate(() => document.body.classList.contains('has-update'))), 'Dismiss removes the banner and its layout class');
  } finally { env.srv.setVersion(real); }
  await p.ctx.close();

  // ---- Offline after a single online visit (spells module loaded lazily, so visit Spells once)
  p = await openPage(env, t, { sw: true });
  await swReady(p);
  await go(p, 'spells'); await p.waitForSelector('#list [data-spell]');
  for (let i = 0; i < 100 && (await p.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length)) < 20; i++) await new Promise((r) => setTimeout(r, 100));
  await p.ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('h1');
  t.ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the offline load');
  for (const [sec, sub] of PAGES) {
    await go(p, sec, sub);
    t.ok((await p.locator('#panel').innerText()).length > 20, `offline ${sec}/${sub || ''} renders`);
  }
  await go(p, 'spells'); await p.waitForSelector('#list [data-spell]');
  await p.click('#list [data-spell] > summary >> nth=0');
  await p.waitForSelector('#list .sd-list');
  t.ok(/Casting Time/.test(await p.textContent('#list .sd-list')), 'spell details open offline');
  await p.ctx.setOffline(false);
  await p.ctx.close();
  t.noErrors(/ERR_INTERNET|Failed to load resource/);
}
