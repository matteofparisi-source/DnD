// Layout and toast details: journal form fields line up when a label wraps; toasts can be swiped away left or right.
import { openPage, go, text } from '../lib.mjs';

export const name = 'Field alignment and toast swipe';

export async function run(env, t) {
  const p = await openPage(env, t);

  // Fields in the same grid row keep their inputs level, even when one label wraps to two lines.
  const tops = (sel) => p.locator(sel).first().evaluate((g) => [...g.querySelectorAll('input')].map((i) => [Math.round(i.getBoundingClientRect().top), Math.round(i.getBoundingClientRect().height)]));
  await go(p, 'journal', 'journal');
  await p.click('[data-action="addSession"]');
  const s = await tops('.jcard[open] .grid');
  t.ok(s[0][0] === s[1][0] && s[2][0] === s[3][0], 'session fields line up in pairs: ' + JSON.stringify(s));
  t.ok(s.every(([, h]) => h === s[0][1]), 'session inputs (date included) have the same height');
  await go(p, 'journal', 'places');
  await p.click('[data-action="addEntry"][data-coll="places"]');
  const pl = await tops('.jcard[open] .grid');
  t.eq(pl[0][0], pl[1][0], 'place Name and Kind line up');
  t.eq(await p.locator('.jcard[open] input[placeholder="City, dungeon…"]').count(), 1, 'Kind examples moved to the placeholder');

  // Toast swipe: a short drag snaps back, a long drag left or right removes it, buttons still work.
  await go(p, 'combat');
  const toastNow = async () => { await p.click('.dock [data-kind="damage"]'); await p.click('.sheet [data-k="1"]'); await p.click('.sheet [data-action="applyDmg"]'); await p.waitForSelector('.toast'); };
  const drag = async (dx) => {
    const b = await p.locator('.toast .toast-msg').boundingBox();
    const x = b.x + 10; const y = b.y + b.height / 2;
    await p.mouse.move(x, y); await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(x + (dx * i) / 8, y);
    await p.mouse.up();
  };
  await toastNow();
  await drag(20);
  await p.waitForTimeout(350);
  t.eq(await p.locator('.toast').count(), 1, 'a short drag keeps the toast');
  t.ok(await p.locator('.toast').evaluate((el) => el.style.transform === ''), 'it snaps back');
  await drag(-180);
  await p.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 2000 }).catch(() => {});
  t.eq(await p.locator('.toast').count(), 0, 'swipe left removes the toast');
  await toastNow();
  await drag(180);
  await p.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 2000 }).catch(() => {});
  t.eq(await p.locator('.toast').count(), 0, 'swipe right removes the toast');
  const hp = await text(p, '.dock-num');
  await toastNow();
  await p.click('.toast [data-action="undo"]');
  t.eq(await text(p, '.dock-num'), hp, 'Undo on a toast still works');
  t.ok(await p.locator('.toast').evaluate((el) => getComputedStyle(el).touchAction).catch(() => 'pan-y') !== 'auto', 'toast lets vertical scrolling through (touch-action)');

  await p.ctx.close();
  t.noErrors();
}
