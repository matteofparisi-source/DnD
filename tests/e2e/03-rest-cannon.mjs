// Rest sheets (summary, apply, undo, hit dice) and the Eldritch Cannon (create, HP, detonate, slot sheet, free use).
import { openPage, saved, text, keypad } from '../lib.mjs';

export const name = 'Rests and Eldritch Cannon';

export async function run(env, t) {
  // Long rest summary lists every change, applying it and undoing it work
  let p = await openPage(env, t, { mut: (s) => { s.character.uses = { tinker: 2 }; } });
  await p.click('.dock [data-kind="rest"]');
  await p.click('.sheet [data-action="restTab"][data-key="long"]');
  const lines = await p.locator('.sheet .sum-list li').allTextContents();
  const has = (re) => lines.some((l) => re.test(l));
  t.ok(has(/^HP 24 → 38/) && has(/Spell slots restored \(L1 2→4, L2 1→2\)/) && has(/Temp HP 3 removed/) && has(/Tinker's Magic 2→4/) && has(/Cannon removed/) && has(/Exhaustion 1 → 0/), 'long rest summary lists HP, temp HP, slots, uses, cannon, exhaustion: ' + lines.join(' | '));
  t.ok(!has(/Conditions cleared/), 'conditions are not cleared by default');
  await p.click('.sheet [data-action="restConfirm"]');
  let st = await saved(p); const c = st.character;
  t.ok(c.hp.current === 38 && c.hp.temp === 0 && c.hdUsed === 0 && c.exhaustion === 0 && c.slotsUsed.every((x) => x === 0) && c.cannons.length === 0 && c.conditions.includes('Poisoned'), 'long rest applied, conditions kept');
  await p.click('.toast [data-action="undo"]');
  st = await saved(p);
  t.ok(st.character.hp.current === 24 && st.character.exhaustion === 1 && st.character.cannons.length === 1, 'undo long rest restores everything');
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-action="restTab"][data-key="long"]');
  await p.check('.sheet [data-sh="clear"]');
  t.ok((await p.locator('.sheet .sum-list li').allTextContents()).some((l) => /Conditions cleared \(Poisoned, Frightened\)/.test(l)), 'clear-conditions option adds its line');
  await p.keyboard.press('Escape');

  // Short rest with a d6 hit die (CON +2), then the hit dice sheet
  await p.click('.dock [data-kind="rest"]');
  await p.click('.sheet [data-action="restRoll"][data-n="6"]');
  const sl = await p.locator('.sheet .sum-list li').allTextContents();
  t.ok(sl.some((l) => /HP 24 → 32/.test(l)) && sl.some((l) => /Hit Dice 5\/5 → 4\/5/.test(l)), 'short rest: die 6 + CON 2 = +8 and one die spent: ' + sl.join(' | '));
  await p.click('.sheet [data-action="restConfirm"]');
  st = await saved(p);
  t.ok(st.character.hp.current === 32 && st.character.hdUsed === 1, 'short rest applied');
  await p.click('.res-list [data-kind="hd"]'); await p.click('.sheet [data-action="hdPick"][data-n="3"]');
  t.ok(/3 \+2 CON = 5 HP healed/.test(await text(p, '.sheet .kp-preview')), 'hit die sheet previews the total');
  await p.click('.sheet [data-action="hdApply"]');
  st = await saved(p);
  t.ok(st.character.hp.current === 37 && st.character.hdUsed === 2, 'hit die spend applied');
  await p.ctx.close();

  // Cannon at level 9: HP steps, keypad repair, detonate, create with a slot, 0 HP death-save card
  p = await openPage(env, t, { mut: (s) => { Object.assign(s.character, { level: 9, cannons: [{ id: 'k1', hp: 20 }], slotsUsed: [0, 1, 0, 0, 0] }); } });
  await p.click('.cannon-steps [data-n="-5"]');
  t.eq(await text(p, '[data-calc^="cannonhp:"]'), '15', 'cannon -5: 20 -> 15');
  await p.click('[data-action="sheet"][data-kind="cannonhp"]'); await keypad(p, '3'); await p.click('.sheet [data-action="cannonAmt"][data-dir="1"]');
  t.eq(await text(p, '[data-calc^="cannonhp:"]'), '18', 'cannon keypad repair +3');
  await p.click('[data-action="sheet"][data-kind="detonate"]');
  t.ok(/DC 16/.test(await text(p, '.sheet p')), 'detonate confirm shows the DC');
  await p.click('.sheet [data-action="detonateGo"]');
  t.eq((await saved(p)).character.cannons.length, 0, 'detonate removes the cannon');
  await p.click('[data-action="createCannon"][data-key="slot"]');
  await p.click('.sheet [data-action="slotPick"][data-level="2"]');
  st = await saved(p);
  t.ok(st.character.cannons.length === 1 && st.character.slotsUsed[1] === 2, 'cannon created by spending a level 2 slot');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('.dock [data-kind="damage"]'); await keypad(p, '99'); await p.click('.sheet [data-action="applyDmg"]');
  t.ok(await p.locator('.death-card.urgent').count() === 1 && await p.evaluate(() => document.querySelector('#panel .card').classList.contains('death-card')), 'death saves card moves to the top at 0 HP');
  await p.ctx.close();

  // Free cannon use and numbers by level, then a long rest gives the free use back
  p = await openPage(env, t, { mut: (s) => { s.character.cannons = []; } });
  await p.click('[data-action="createCannon"][data-key="free"]');
  t.eq(await p.locator('.cannon-card').count(), 1, 'free cannon created');
  t.ok(await p.locator('[data-action="createCannon"][data-key="free"]').isDisabled(), 'free use is used up');
  const modes = await p.textContent('.modes');
  t.ok(modes.includes('2d8 Fire') && modes.includes('DC 15') && modes.includes('1d8 + 4'), 'level 5 cannon numbers: flamethrower 2d8 DC 15, protector 1d8+4');
  await p.click('.dock [data-kind="rest"]'); await p.click('.sheet [data-action="restTab"][data-key="long"]'); await p.click('.sheet [data-action="restConfirm"]');
  t.ok(await p.locator('.cannon-card').count() === 0 && !(await p.locator('[data-action="createCannon"][data-key="free"]').isDisabled()), 'long rest clears the cannon and restores the free use');
  await p.ctx.close();
  t.noErrors();
}
