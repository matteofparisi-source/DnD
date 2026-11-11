// Combat page: dock damage/heal, temp HP, concentration DC, conditions, resource pips, attacks, undo, sheet behaviour.
import { openPage, go, saved, text, keypad, closeSheet } from '../lib.mjs';

export const name = 'Combat dock, concentration, undo';

export async function run(env, t) {
  const p = await openPage(env, t);
  t.eq(await text(p, '.dock-num'), '24', 'dock shows HP 24');

  // Damage: three taps, temp HP absorbs first
  await p.click('.dock [data-kind="damage"]');
  t.eq(await p.locator('.sheet[role="dialog"][aria-modal="true"]').count(), 1, 'damage sheet is a modal dialog');
  t.ok(await p.evaluate(() => document.activeElement.classList.contains('sheet')), 'focus moved into the sheet');
  await p.click('.sheet [data-k="7"]'); await p.click('.sheet [data-action="applyDmg"]');
  t.ok(await text(p, '.dock-num') === '20' && !(await p.locator('.dock-temp:visible').count()), 'damage 7: temp 3 absorbed, HP 24 -> 20');
  t.eq(await p.evaluate(() => document.activeElement?.dataset?.kind), 'damage', 'focus returned to the Damage button');
  const r = await p.evaluate(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); return { tb: q('.toast').bottom, dt: q('.dock').top, nt: q('.bnav').top }; });
  t.ok(r.tb <= r.dt + 0.5 && r.dt < r.nt, 'toast sits above the dock');
  t.ok((await p.getAttribute('#toasts', 'aria-live')) === 'polite' && (await p.getAttribute('#toasts', 'role')) === 'status', 'toast region is a polite status');
  await p.click('.toast [data-action="undo"]');
  t.ok(await text(p, '.dock-num') === '24' && await text(p, '.dock-temp') === '+3 temp', 'undo restores HP and temp HP');

  // Temp HP replaces rather than stacks; heal chips add
  await p.click('.dock [data-kind="heal"]'); await keypad(p, '5'); await p.click('.sheet [data-action="setTemp"]');
  t.eq(await text(p, '.dock-temp'), '+5 temp', 'set temp HP replaces');
  await p.click('.dock [data-kind="heal"]'); await p.click('.sheet [data-action="chip"][data-n="10"]'); await p.click('.sheet [data-action="chip"][data-n="2"]'); await p.click('.sheet [data-action="applyHeal"]');
  t.eq(await text(p, '.dock-num'), '36', 'heal chips 10+2: 24 -> 36');

  // Escape, backdrop and focus trap
  await p.click('.dock [data-kind="damage"]'); await p.keyboard.press('Escape');
  t.eq(await p.locator('.sheet').count(), 0, 'Escape closes the sheet');
  await p.click('.dock [data-kind="damage"]'); await p.mouse.click(200, 130);
  t.eq(await p.locator('.sheet').count(), 0, 'backdrop tap closes the sheet');
  await p.click('.dock [data-kind="damage"]');
  for (let i = 0; i < 30; i++) await p.keyboard.press('Tab');
  t.ok(await p.evaluate(() => !!document.activeElement.closest('#sheet-root')), 'Tab stays inside the sheet');
  await closeSheet(p);

  // Concentration: pick a spell, damage shows the save DC, Incapacitated ends it
  await p.click('.g-conc');
  t.ok(await p.locator('.pick-list button').count() >= 2, 'concentration list offers prepared concentration spells');
  await p.click('.pick-list [data-id="faerie-fire"]');
  t.ok(await text(p, '.g-conc b') === 'Faerie Fire' && await p.locator('.g-conc.on').count() === 1, 'concentration plate shows the spell');
  await p.click('.dock [data-kind="damage"]'); await keypad(p, '14'); await p.click('.sheet [data-action="applyDmg"]');
  t.ok(/DC 10 \(CON save \+5\)/.test(await text(p, '.toast')), 'damage 14 -> DC 10');
  await p.click('.dock [data-kind="heal"]'); await keypad(p, '99'); await p.click('.sheet [data-action="applyHeal"]');
  await p.click('.dock [data-kind="damage"]'); await keypad(p, '30'); await p.click('.sheet [data-action="applyDmg"]');
  t.ok(/DC 15 \(CON save \+5\)/.test(await text(p, '.toast')), 'damage 30 -> DC 15');
  await p.click('[data-kind="cond"]:has-text("Edit")');
  await p.click('.sheet [data-key="Incapacitated"]');
  t.ok(/Concentration ended/.test(await text(p, '.toast')), 'Incapacitated toast says concentration ended');
  t.eq(await p.locator('.sheet [data-key="Incapacitated"][aria-pressed="true"]').count(), 1, 'condition toggle is pressed');
  await closeSheet(p);
  t.eq(await text(p, '.g-conc b'), 'None', 'concentration ended');
  t.eq(await p.locator('.status-chip.k-incapacitated').count(), 1, 'status chip shows Incapacitated');

  // Resource pips: spend and undo
  const before = (await saved(p)).character.slotsUsed[0];
  await p.click('.res-list li:first-child .pip >> nth=3');
  t.eq((await saved(p)).character.slotsUsed[0], 4, 'pip spend sets used to 4');
  await p.click('.toast [data-action="undo"]');
  t.eq((await saved(p)).character.slotsUsed[0], before, 'undo restores slots');
  t.eq(await p.locator('.res-list li:first-child .pip.on').count(), before, 'pips redrawn after undo');

  // Attacks: delete without confirm, undo restores, block stays open
  await p.click('details[data-block="attacks"] > summary');
  await p.click('[data-action="addAttack"]');
  await p.fill('[data-bind^="character.attacks.#"][aria-label="Attack name"]', 'Zap');
  await p.click('[data-action="removeAttack"]');
  t.eq(await p.locator('[data-action="removeAttack"]').count(), 0, 'attack deleted without a confirm dialog');
  await p.click('.toast [data-action="undo"]');
  t.eq(await p.locator('[data-action="removeAttack"]').count(), 1, 'undo restores the attack');
  t.eq(await p.locator('details[data-block="attacks"][open]').count(), 1, 'attacks block stays open across re-render');
  await p.ctx.close();

  // Typing clears the undo stack (Undo can never revert typed text)
  const q = await openPage(env, t);
  await q.click('.dock [data-kind="damage"]'); await keypad(q, '3'); await q.click('.sheet [data-action="applyDmg"]');
  await go(q, 'character', 'stats'); await q.fill('[data-bind="character.name"]', 'Typed');
  await go(q, 'combat');
  t.eq(await q.locator('.toast [data-action="undo"]').count(), 0, 'no stale Undo after typing');
  await q.ctx.close();

  // Derived numbers from the stats page (level 5, INT 18, CON 14)
  const s = await openPage(env, t, { tab: 'stats', mut: (st) => { st.character.name = ''; st.ui.sub.character = 'stats'; st.character.items = []; st.character.conditions = []; st.character.exhaustion = 0; } });
  await go(s, 'character', 'stats');
  t.eq(await text(s, '[data-calc="dc"]'), '15', 'spell save DC 8+3+4');
  t.eq(await text(s, '[data-calc="satk"]'), '+7', 'spell attack +7');
  t.eq(await text(s, '[data-calc="save:int"]'), '+7', 'INT save proficient');
  t.ok((await text(s, '[data-calc="hp"]')).includes('/ 38'), 'auto max HP at level 5 with CON 14 is 38');
  await s.fill('[data-bind="character.abilities.int"]', '20'); await s.locator('[data-bind="character.abilities.int"]').blur();
  t.eq(await text(s, '[data-calc="dc"]'), '16', 'DC follows the INT score');
  await s.ctx.close();
  t.noErrors();
}
