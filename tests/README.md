# Tests

No package.json, no build, nothing installed in the repo. Playwright is found in your environment.

## Run
- `node tests/unit.mjs`: pure Node, about 1 s (syntax, data integrity, version/asset sync, manifest, store migrations).
- `node tests/run.mjs`: unit plus every browser suite in `tests/e2e/`. Starts its own static server on a random port.
  - `--only <text>` runs suites whose name contains the text (`--only drive`), `--headed` shows the browser, `--list` lists suites.
  - Exit code is non-zero on any failure; failures print under their suite.
- Playwright: `npm i -g playwright && npx playwright install chromium` (or any install reachable via `npm root -g` or `NODE_PATH`). If it is missing, `run.mjs` prints this and stops.
- Optional: `npm i -g axe-core` makes the a11y suite also run axe (serious/critical fail). Without it the suite notes a skip.

## Covered
| Suite | What |
|---|---|
| unit | syntax of all scripts, no `Math.random`, spell/feat/plan/equipment data, `APP_VERSION` equals `CACHE`, `ASSETS` exist and cover everything loaded, plan/item description coverage and SRD spot check (set `SRD_TXT` to a pdftotext extract of the SRD), manifest and icon sizes, `normalize()` v1-v3 to v4, ids, snapshots, quota fallback |
| 01-nav | first run, v1 migration on load, every page in both themes, theme cycle, 1366x768 |
| 02-combat | dock damage/heal/temp HP, concentration DC, conditions, pips, attacks, undo, sheet focus |
| 03-rest-cannon | rest summaries/apply/undo, hit dice, cannon create/HP/detonate/slot |
| 04-spells | lazy details, My/All, casting-time filters, lazy cards, prepare over limit |
| 05-equipment | AC from armor/shield, weapon in Combat, attunement, qty, weight toggle, coins |
| 06-plans-feats | learn/limit/generic/craft, feat views and prerequisite sheet |
| 07-journal | quick add of every kind, drafts, tags, search, quests, sessions, voice |
| 08-data | snapshots, export/import round trip, restore, quota, unreadable data |
| 09-drive | stubbed Drive: 2-tap connect, upload, debounce, expiry, import confirm, conflicts, no token stored |
| 10-pwa | update banner (server swaps the served version), offline after one visit |
| 11-a11y | 44px targets, names, no h-scroll on pages, open cards and sheets |
| 12-effects | item/spell effects, attunement gating, "+" breakdowns, buffs and long rest |
| 13-feats-fx | feat choice sheet, automatic feat bonuses, feat spells (always prepared, free casts, Feat filter), feat uses and rests, undo |
| 17-plan-details | lazy description module, Description on plan and item cards (SRD tag vs community tag), search by description text, load failure, axe |
| 14-items-fx | craft copies plan effects, SRD catalog picker, armor +N counted once, one-time Apply catalog effects, generic plan item pick |

## Add a test
Create `tests/e2e/NN-name.mjs` exporting `name` and `async function run(env, t)`. Use helpers from `tests/lib.mjs` (`openPage` seeds state, `go`, `saved`, `audit`...), assert with `t.ok(cond, msg)` / `t.eq(got, want, msg)`, end with `t.noErrors()`. Wait on conditions, not fixed sleeps. Keep files under about 250 lines.
