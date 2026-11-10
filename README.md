# DnD Slop

A character sheet and campaign journal for an **Artificer (Artillerist)** in an **Eberron** campaign, using the D&D 2024 rules with the 2025 *Eberron: Forge of the Artificer* Artificer.

It works offline, installs like an app on Android and Windows, and needs no account or server.

## Navigation and theme

A fixed bottom bar has five sections: **Combat**, **Spells**, **Workshop** (Equipment & bag, Magic items, Plans), **Journal** and **Character** (Stats, Feats, Selected, Campaign & data). Sections with several pages show a tab strip at the top and remember the last one you used. The header has a theme button that cycles Dark (default), Light (paper) and Auto (follows the device); the choice is saved on the device.

## Pages

| Page | What's in it |
|---|---|
| **Stats** | Identity (name, player, level, species, alignment, size), Artificer level 1-20, ability scores, saves (CON/INT preset), skills (Artificer choices marked **A**), proficiencies and resistances, all class and Artillerist features by level with use trackers |
| **Combat** | A fixed thumb dock above the bottom bar shows HP (with temp HP) and has Damage, Heal and Rest buttons. Damage and Heal open a bottom sheet with a number pad and +1/+2/+5/+10 chips (temp HP absorb damage first; Heal also sets temp HP); with concentration active, damage shows the Constitution save DC (10 or half the damage, max 30). Concentration plate (pick a prepared Concentration spell or type an effect; Incapacitating conditions end it), conditions picker sheet with the 6-step exhaustion meter and short effect reminders (also shown as a status strip and subtle screen effects on every page), Resources card (spell slots, limited uses, d8 Hit Dice with a sheet where you tap the die you rolled), a Roll reference card of big modifiers for real dice (initiative, spell attack and DC, six saves, attacks), the **Eldritch Cannon** (state, HP with quick -/+ buttons, Detonate at level 9, two cannons at 15, create with a free use or a chosen spell slot, modes with your DC and damage), death saves (on top at 0 HP), AC computed from equipped armor/shield/items (or manual) and the attack editors in collapsed blocks. Rests open a sheet that lists exactly what will change before you confirm (long rest can optionally clear conditions; short rest takes your Hit Dice rolls). **Undo** for the last actions (HP, slots, uses, conditions, cannons, rests, deletes) via a toast, and optional vibration feedback (Character > Campaign & data). No dice are rolled by the app. |
| **Equipment & bag** | Weapons, armor, shields and other gear with catalog pickers (simple/martial weapons, armor table), magic bonuses, equipped and attunement, carried weight vs STR × 15, filters, coins and gear notes |
| **Spells** | Only Artificer spells. Each spell shows a **level tag** and a **status flag**: *Always prepared* (Artillerist spells and Mending), *Prepared / Known*, or *Not prepared*. Counters show prepared and cantrips against your level's limit. Every spell has a collapsible **description** (Casting Time, Range, Components, Duration, Description, At Higher Levels). 82 spells use the **official SRD 5.2.1 text word for word** (tagged *SRD 5.2.1 · official text*); the other 36 are short own-words summaries tagged *community source, unverified* with a link. Spells from books outside your set (Arcana Unleashed, D&D Beyond Drops) are hidden unless you tick *other official books*; spells you selected always stay visible |
| **Plans** | Every Replicate Magic Item plan by tier (level 2+, 6+, 10+, 14+). Learn or forget plans, learn the "any Common / Uncommon Wondrous / Rare Wondrous" options as named items, and **Create** an item into Magic items (the oldest vanishes if you go over your limit) |
| **Magic items** | Non-mundane items you replicated or found: rarity, type, attunement (counter against 3/4/5/6), equipped, charges, notes |
| **Feats** | PHB 2024, Tasha's, Xanathar's and Forge of the Artificer feats (Dragonmarks, Greater Dragonmarks, Boon of Siberys), with prerequisites checked against your character |
| **★ Selected** | Everything you've chosen in one place: spells by level, known plans, items, feats, skills, conditions |
| **Journal** | Session notes with search |
| **Campaign & data** | Campaign notes, and backup share/download/import |

**Filters:** Spells (search, level, status, school, concentration, ritual, above-my-level, legacy, other official books), Plans (search, tier, known, type, attunement, learnable now), Items (search, attuned/equipped, origin, type, rarity), Feats (search, category, taken, book, "only feats I qualify for"). Every filter has a **★ Selected / Known / Taken** option.

**Rests:** a *Long rest* restores HP, Hit Dice, slots and all uses, removes cannons, and lowers Exhaustion by 1. A *Short rest* applies Refreshed Genius (level 14) or Magical Guidance (level 20).

## Install

### Redmi 15 (Android)
1. Open the app's URL in **Chrome**. The Xiaomi/Mi Browser has weaker app-install support.
2. Menu ⋮ → **Add to Home screen** → **Install**.

### Windows 10 / 11
1. Open the URL in **Edge** or **Chrome**.
2. Click the **Install** icon in the address bar, or Menu → *Apps → Install this site as an app*.

### Hosting (GitHub Pages)
On GitHub, open **Settings → Pages** and deploy from this branch, folder `/ (root)`. Free accounts need the repository to be public. Only the app code is public: your character stays on your devices.

To run it locally instead: `python3 -m http.server 8000`, then open `http://localhost:8000`.

## Your data — important

- Each device and browser keeps **its own copy**. Your Redmi and your Windows PCs **don't sync**.
- To move your character: **Campaign & data → Share backup** (Android: send it to Drive, WhatsApp, email…) or **Download backup**. On the other device, use **Import backup**. Importing replaces that device's data.
- Clearing browser data deletes it. Export a backup after every session.

## Rules accuracy

- Class numbers, Artillerist features, plan names, the Artificer spell list and the Eberron feats were checked against the owner's own copy of *Forge of the Artificer* (2026-11-10); the Tasha's legacy list, Tasha's feats and three Tasha's spells against their copy of *Tasha's Cauldron of Everything*. Xanathar's content, the non-SRD 2024 PHB feats and a few unreadable values are still unverified. If something differs from your book, the book wins. The data lives in `js/data/*.js` and is easy to fix.
- **Legacy spells:** these were on the 2020 Tasha's Artificer list (Absorb Elements, Catapult, Catnap, Tasha's Caustic Brew, etc.) but are not on the 2025 list. They're hidden unless you enable them. Ask your DM.
- **Feats:** summaries are short reminders in my own words, not rules text. Where a Tasha's/Xanathar's feat was reprinted in the 2024 PHB, only the 2024 version is listed, following the 2024 rule that the newer version wins. Xanathar's racial feats were written for 2014 species; check with your DM.
- Apart from the SRD 5.2.1 spell text, the app doesn't reproduce the books' text. Feat and item descriptions are left to your notes fields.

## Credits

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Fonts Source Sans 3 and IM Fell English SC are used under the SIL Open Font License 1.1 (see `fonts/OFL-*.txt`).

## Project layout

```
index.html, css/styles.css, sw.js, manifest.webmanifest
js/app.js              UI and actions
js/store.js            saving, import/export, migration from the first version
js/rules.js            generic 2024 rules data
js/data/artificer.js   class table, features, Artillerist, cannon math
js/data/spells.js      Artificer spell list (+ Artillerist, + legacy)
js/data/plans.js       Replicate Magic Item plans
js/data/feats.js       feats from the four books
js/data/equipment.js   SRD 5.2.1 weapon and armor tables (checked)
```
