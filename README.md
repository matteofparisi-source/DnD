# DnD Slop

A character sheet and campaign journal for an **Artificer (Artillerist)** in an **Eberron** campaign, using the D&D 2024 rules with the 2025 *Eberron: Forge of the Artificer* Artificer.

It works offline, installs like an app on Android and Windows, and needs no account or server.

## Pages

| Page | What's in it |
|---|---|
| **Stats** | Identity, Artificer level 1-20, ability scores, saves (CON/INT preset), skills (Artificer choices marked **A**), proficiencies, all class and Artillerist features by level with use trackers |
| **Combat** | HP (auto max: 8 + CON, then 5 + CON per level), damage/heal/temp HP, death saves, d8 Hit Dice, AC, conditions, exhaustion, the **Eldritch Cannon** panel (create, HP, modes with your DC and damage, Detonate at level 9, two cannons at 15), spell slots, limited uses, attacks with an Arcane Firearm flag |
| **Spells** | Only Artificer spells. Each spell shows a **level tag** and a **status flag**: *Always prepared* (Artillerist spells and Mending), *Prepared / Known*, or *Not prepared*. Counters show prepared and cantrips against your level's limit |
| **Plans** | Every Replicate Magic Item plan by tier (level 2+, 6+, 10+, 14+). Learn or forget plans, learn the "any Common / Uncommon Wondrous / Rare Wondrous" options as named items, and **Create** an item into Magic items (the oldest vanishes if you go over your limit) |
| **Magic items** | Items you replicated or found: rarity, type, attunement (counter against 3/4/5/6), equipped, charges, notes |
| **Feats** | PHB 2024, Tasha's, Xanathar's and Forge of the Artificer feats (Dragonmarks, Greater Dragonmarks, Boon of Siberys), with prerequisites checked against your character |
| **★ Selected** | Everything you've chosen in one place: spells by level, known plans, items, feats, skills, conditions |
| **Journal** | Session notes with search |
| **Campaign & data** | Campaign notes, and backup share/download/import |

**Filters:** Spells (search, level, status, school, concentration, ritual, above-my-level, legacy), Plans (search, tier, known, type, attunement, learnable now), Items (search, attuned/equipped, origin, type, rarity), Feats (search, category, taken, book, "only feats I qualify for"). Every filter has a **★ Selected / Known / Taken** option.

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

- Class numbers, Artillerist features, plan lists and the Artificer spell list come from community transcriptions of *Forge of the Artificer* (dnd2024.wikidot.com), cross-checked with guides (rpgbot.net, dungeonmister.com). **I could not check them against the book itself.** If something differs from your book, the book wins. The data lives in `js/data/*.js` and is easy to fix.
- **Legacy spells:** these were on the 2020 Tasha's Artificer list (Absorb Elements, Catapult, Tasha's Caustic Brew, etc.) but don't appear on the 2025 list. They're hidden unless you enable them. Ask your DM.
- **Feats:** summaries are short reminders in my own words, not rules text. Where a Tasha's/Xanathar's feat was reprinted in the 2024 PHB, only the 2024 version is listed, following the 2024 rule that the newer version wins. Xanathar's racial feats were written for 2014 species; check with your DM.
- The app doesn't reproduce the books' text. Spell, feat and item descriptions are left to your notes fields.

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
```
