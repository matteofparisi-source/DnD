# CLAUDE.md

**DnD Slop** is a D&D 2024 character sheet and Eberron campaign journal for one character, an Artificer (Artillerist) from *Eberron: Forge of the Artificer*.
Stack: plain HTML/CSS/JavaScript (ES modules) installable PWA. No build step, no dependencies, no backend; works offline.
Target devices: Android (Redmi 15, Chrome) and Windows 10/11 (Edge/Chrome). README.md is the user-facing feature list and install guide; don't repeat it here.

## Agent setup
- `.claude/settings.json` sets the main session (the coordinator) to `claude-opus-5-5`. It sets subagents to `claude-sonnet-5-5` through `CLAUDE_CODE_SUBAGENT_MODEL`, with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` so built-in agents (Explore, Plan) use Sonnet too.
  - unverified: the FORCE variable needs Claude Code 2.1.257+ per the docs. It was not tested in this repo.
  - `/model`, `--model`, `ANTHROPIC_MODEL` or `.claude/settings.local.json` can override the main model.
- Operative agents live in `.claude/agents/`: `implementer` (code/data edits), `tester` (local server + Playwright checks), `rules-researcher` (web facts with sources), `reviewer` (diff review against this file). All pin `model: claude-sonnet-5-5`.
- The coordinator plans, splits work, delegates to these agents, checks their reports, and does the commits/pushes itself. Agents don't commit.
- Model IDs are pinned, not aliases. When a newer Opus/Sonnet ships, update `.claude/settings.json`, every file in `.claude/agents/` and this section.

## Run and check locally
- Serve the repo root: `python3 -m http.server 8000`, then open http://localhost:8000. Opening `index.html` via `file://` fails (ES modules; the service worker isn't registered on `file:`).
- There is **no automated test suite** in the repo and no package.json. Checks used so far:
  - Syntax: `node --check js/app.js` (works for each JS file).
  - Data modules load: `node -e "import('./js/data/spells.js').then(m => console.log(m.SPELLS.length))"`. The same pattern works for `feats.js` (`FEATS`) and `plans.js` (`PLANS`).
  - Behavior: Playwright scripts (`require('playwright')`, phone viewport such as Pixel 7, plus 1366×768), kept outside the repo. Seed localStorage with `page.addInitScript`: the app saves its in-memory state on `pagehide`, so data seeded after load is overwritten on reload.

## Hosting
- Live at https://matteofparisi-source.github.io/DnD/ (GitHub Pages, branch `ccr-99717c64-lm0jqw`, root folder). **Every push to that branch goes live** within about a minute.
- `.nojekyll` makes Pages serve files as-is. Keep it.

## File map
- `index.html`: shell; loads `css/styles.css` and `js/app.js` (module). Everything renders into `#view`.
- `js/app.js`: all UI, derived values, actions and event wiring (about 1500 lines). Sections, in order:
  - helpers (`esc`, `getPath`/`setPath`, `persist`, `commit`)
  - derived values and `calc(key)`
  - field builders (`input`, `select`, `check`, `textarea`, `pips`)
  - filter builders (`chips`, `fselect`, `fsearch`, `fcheck`)
  - one `tabX()` per page (lists come from `xList()`)
  - `RENDER` / `LIST_RENDER` maps, `render()`, `renderList()`
  - `rest()`, the `actions` object, then the event listeners
- `js/store.js`: state shape (`defaultState`), `normalize` (merge plus migrations), `load`/`save` (localStorage), `backupFile`/`downloadFile`, `uid`, and item helpers `newItem`, `ensureItemData`, `magicBonus`, `newWeapon`/`newArmor`/`newShield`.
- `js/rules.js`: generic 2024 data and math: `ABILITIES`, `SKILLS`, `CONDITIONS`, `ALIGNMENTS`, `DAMAGE_TYPES`, `WEAPON_MASTERIES`, `XP_THRESHOLDS`, `CONDITION_EFFECTS` (one-line condition reminders), `mod`, `profBonus`, `fmt`.
- `js/data/artificer.js`:
  - per-level tables (`PLANS_KNOWN`, `MAGIC_ITEMS`, `CANTRIPS`, `PREPARED`, `SLOTS`) read with `at(arr, level)`
  - `FEATURES` (class plus Artillerist) and `USES` (tracked limited uses)
  - `ARTILLERIST_SPELLS`, `cannonStats()`, `attunementLimit()`, `maxSpellLevel()`, species suggestions
- `js/data/spells.js`: `SPELLS` with `source`: `list` (2025 Artificer list), `tinker` (Mending), `artillerist`, `legacy` (2020 Tasha's list, hidden by default), `extra` (7 spells from books outside the user's set, with a `book` field, hidden by default). Selected spells always stay visible. Also exports `SOURCE_LABEL`, `SCHOOLS`, `slug`.
- `js/data/spell-details.js`: `SPELL_DETAILS` keyed by spell id (`time`, `range`, `components`, `duration`, `desc`, `higher`, `verbatim`, `source`, `checked`, `note`), generated from the SRD 5.2.1 PDF and researched JSON (the generator isn't kept; edit entries by hand). `verbatim: true` (the 82 `checked` spells) = SRD text word for word; `higher` keeps its "Using a Higher-Level Spell Slot." / "Cantrip Upgrade." lead-in and `desc` uses `\n\n` between paragraphs. Shown in a collapsible `spell-desc` block on the Spells page as Casting Time / Range / Components / Duration / Description / At Higher Levels (open state kept in `openSpells`) and searched by the spell filter. The Credits card in the Campaign & data tab holds the SRD attribution.
- `js/data/plans.js`: `PLANS` (Replicate Magic Item, tiers 2/6/10/14; `generic` = "any item of this kind"), `PLAN_TYPES`, `TIERS`.
- `js/data/feats.js`: `FEATS` (PHB 2024, Tasha's, Xanathar's, Eberron) with a `req` object used by `meetsReq()` in app.js. Also exports `FEAT_CATEGORIES`, `FEAT_SOURCES`.
- `js/data/equipment.js`: `WEAPONS` and `ARMOR` catalogs (armor has `str` and `stealth`) (SRD 5.2.1 tables, checked). Picking one in the Equipment tab prefills the item.
- `css/styles.css`: one coherent file with a single `:root` token block (light "sunlit parchment") plus a `prefers-color-scheme: dark` override ("moonlit scroll"). Magical-parchment look: grain texture on the page and tab bar only (cards stay smooth for readability), gold corner flourishes, ribbon tabs, glowing arcane pips. Fonts are self-hosted via `@font-face`.
- `fonts/`: latin-subset woff2 files (Cinzel, Cinzel Decorative, EB Garamond; OFL licenses in `OFL-*.txt`). `img/grain.png`: tileable parchment grain overlay. Both are listed in `sw.js` `ASSETS` (not the license files).
- `sw.js`: offline cache. `manifest.webmanifest` + `icons/`: install metadata.

## State and data
- One state object (`version`, `character`, `campaign`, `sessions`, `ui`). It's saved as JSON in localStorage under the key `dnd-companion-v1`. Don't rename the key: existing devices would lose their data.
- Inputs bind with `data-bind="dot.path"`. A `#id` segment selects an array item by `id` (e.g. `character.items.#abc.name`).
  - The input handler writes the value, saves (debounced, 250 ms) and calls `refreshDerived()`.
  - Derived numbers live in `<span data-calc="key">` elements, computed by `calc()`.
- Choices are stored as ids, never as copies of data: `character.spells` maps spell id → `'prepared'`/`'known'`; `plans.known` maps plan id → true; `feats` is a list of `{featId, level, notes}`.
  - Ids come from names (`slug`, or the same regex in plans/feats), so **renaming a data entry orphans saved choices** unless you migrate them.
  - "Always prepared" is computed (`alwaysPrepared()`), not stored.
- Schema v3: `attacks[].damages` is a list of `{id, dice, type}` (flat bonus and ability mod go on the first). Items carry `qty`, `weight`, `acBonus` and a `weapon`/`armor`/`shield` sub-object by type (`ensureItemData()` in store.js adds them, parsing "+N" from the name); rarity `Mundane` items show only on the Equipment tab. `character.acAuto`/`acMisc`: AC is computed by `acInfo()` from equipped items; `ac` is used only when `acAuto` is false. `inspiration` stays in the data but has no UI.
- `render()` puts `cond-<name>` and `exh-<n>` classes on `<body>`; CSS draws the vignettes and hero effects from them. The status strip under the header lists active conditions.
- Damage components are edited with `damageEditor(path, list)` and the `addDamage`/`removeDamage` actions (`data-path` is the list path).
- Export: `backupFile()` makes a JSON file, offered through the Web Share API (when files can be shared) or as a download. Import: JSON → `normalize()` → replaces all state. A `storage` event listener keeps open tabs in sync.
- **Any change to the data shape needs a migration** in `normalize()`, plus a `SCHEMA_VERSION` bump. The existing v1→v2 step (generic sheet → Artificer) is the pattern. `merge()` fills in missing fields from `defaultState()`, so purely additive fields need only a default.

## Service worker rules
- `sw.js` is network-first: online users get new files without a bump. Offline users and freshly installed apps get the cached copy.
- The browser only reinstalls the worker when `sw.js` itself changes. So **bump `CACHE` (`ledger-vN`) whenever any cached asset changes**. That refreshes the precache and deletes old caches.
- Add every new file the app loads to `ASSETS`, or it won't be available offline.

## Rules-accuracy policy
- Checked against the official SRD 5.2.1 (CC-BY-4.0) on 2026-11-09: `js/data/equipment.js`, `CONDITION_EFFECTS` (rules.js), and the 82 `spell-details.js` entries with `checked: true`.
- Checked on 2026-11-10 against the user's own copy of *Forge of the Artificer*: Artificer class data (`artificer.js` tables and features, Artillerist, cannon numbers), the 2025 spell list in `spells.js` (Catnap is not on it, so it is `legacy`), plan names in `plans.js` and tier 10/14 attunement, the Eberron feats in `feats.js`, Homunculus Servant. Against the user's *Tasha's*: legacy list membership, Tasha's feats, Booming Blade, Intellect Fortress, Sword Burst. Spell entries sourced "(user's copy)" show the tag "Checked against your book" (still `checked: false`, since `checked` means SRD).
- The other 36 spell descriptions (`checked: false`) without a "(user's copy)" source are community data and the UI labels them so.
- Still unverified (community transcriptions: dnd2024.wikidot.com, rpgbot.net, dungeonmister.com): Xanathar's spells and racial feats, PHB 2024 feats that are not in the SRD, the 2024 Summon Construct text, plan attunement values for tiers 2/6 (unreadable in the scan), Magic Item Adept's 4 attunements (text unreadable), the species words used for racial-feat checks (e.g. Khoravar as half-elf), the Medium Armor Master DEX 16 condition, the source books of the 7 `extra` spells (Arcana Unleashed / D&D Beyond Drops). Never call these verified, in code, UI text, docs or replies.
- Text from the official SRD 5.2.1 may be used verbatim (CC-BY-4.0): keep the attribution in spell-details.js, README and the app's Credits. **Never copy text from the books** (PHB, Tasha's, Xanathar's, Forge of the Artificer) or from wikidot transcriptions of them, and never commit the books or their scans: the repo and site are public. Non-SRD content stays in short own-words summaries; full text belongs in the user's notes fields.
- When the user's book disagrees, the book wins: fix the data entry and mention it.

## Conventions seen in the code
- No frameworks. Views are template-string functions returning HTML. Re-rendering replaces `#view.innerHTML`, and `render()` restores focus and scroll.
- Escape every user or data string with `esc()` before putting it into HTML.
- Buttons use `data-action="name"` plus `data-*` args, handled in the `actions` object through one delegated click listener.
- Fields that change structure use `data-rerender`. Checkboxes and selects re-render automatically on `change`.
- **New page:** add `tabX()`, an entry in `TABS` and one in `RENDER`. A filterable list also needs an `xList()` rendered into `<div id="list">` and an entry in `LIST_RENDER`.
- **New filter:** store it in `state.ui.f[page][key]` through `F(page)`. Build it with `chips`/`fselect`/`fsearch`/`fcheck` and apply it inside `xList()`.
  - Search uses `matchQ(page, ...texts)`.
  - Typing in a filter re-renders only the list (keeps focus); chip clicks re-render the page.
- Data entries are built with small factory helpers (`L` in spells, `P` in plans, `F` in feats) and get an `id` from the name. Per-level numbers are 20-element arrays indexed with `at()`.
- Uses and spell slots are stored as "used" counts. Rests reset them in `rest()`.
- Naming: camelCase JavaScript, kebab-case CSS classes, 2-space indent, single quotes, semicolons.

## Known weak spots
- `js/app.js` is large (about 1500 lines) and mixes views, logic and actions. Splitting it (e.g. one module per tab) is reasonable, but **only do it when the user asks**.
- No automated tests in the repo; checks are manual or ad-hoc Playwright.
- Data lives per device and browser only: no sync between the user's phone and PCs (export/import only).
- `confirm()`/`prompt()`/`alert()` are used for dialogs (hit dice, generic plans, cannon slot choice).

## Keeping this file current
- After any change that affects structure, data format, conventions, commands or features, update CLAUDE.md in the same commit. Update README.md too if the feature list changes.
- Update the `sw.js` cache version whenever cached assets change.
- Remove outdated lines instead of piling up new ones, and keep this file under 150 lines.
- Before finishing any task, check whether CLAUDE.md is now out of date.
