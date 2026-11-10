# DnD Slop

A character sheet and campaign journal for an **Artificer (Artillerist)** in an **Eberron** campaign, using the D&D 2024 rules with the 2025 *Eberron: Forge of the Artificer* Artificer.

It works offline, installs like an app on Android and Windows, and needs no account or server.

## Navigation and theme

A fixed bottom bar has five sections: **Combat**, **Spells**, **Workshop** (Equipment & bag, Magic items, Plans), **Journal** (Sessions, NPCs, Places, Factions, Quests) and **Character** (Stats, Voice, Feats, Selected, Campaign & data). Sections with several pages show a tab strip at the top and remember the last one you used. The header has a **＋ Quick add** button (session note, NPC, place, faction, quest or in-character line, from any page) and a theme button that cycles Dark (default), Light (paper) and Auto (follows the device); the choice is saved on the device.

## Pages

| Page | What's in it |
|---|---|
| **Stats** | Identity (name, player, level, species, alignment, size), Artificer level 1-20, ability scores, saves (CON/INT preset), skills (Artificer choices marked **A**), proficiencies and resistances, all class and Artillerist features by level with use trackers |
| **Combat** | A fixed thumb dock above the bottom bar shows HP (with temp HP) and has Damage, Heal and Rest buttons. Damage and Heal open a bottom sheet with a number pad and +1/+2/+5/+10 chips (temp HP absorb damage first; Heal also sets temp HP); with concentration active, damage shows the Constitution save DC (10 or half the damage, max 30). Concentration plate (pick a prepared Concentration spell or type an effect; Incapacitating conditions end it), conditions picker sheet with the 6-step exhaustion meter and short effect reminders (also shown as a status strip and subtle screen effects on every page), Resources card (spell slots, limited uses, d8 Hit Dice with a sheet where you tap the die you rolled), a Roll reference card of big modifiers for real dice (initiative, spell attack and DC, six saves, attacks), the **Eldritch Cannon** (state, HP with quick -/+ buttons, Detonate at level 9, two cannons at 15, create with a free use or a chosen spell slot, modes with your DC and damage), death saves (on top at 0 HP), AC computed from equipped armor/shield/items (or manual) and the attack editors in collapsed blocks. Rests open a sheet that lists exactly what will change before you confirm (long rest can optionally clear conditions; short rest takes your Hit Dice rolls). **Undo** for the last actions (HP, slots, uses, conditions, cannons, rests, deletes) via a toast, and optional vibration feedback (Character > Campaign & data). No dice are rolled by the app. |
| **Equipment & bag** | Weapons, armor, shields and other gear with catalog pickers (simple/martial weapons, armor table), magic bonuses, equipped and attunement, collapsed item cards with big Equipped / Attuned toggles, quantity steppers and an Edit block, attunement slot pips, optional weight tracking (carried vs STR × 15, "Track weight" switch), filters, a coins card (tap a coin for an Add / Spend keypad, undoable, total in gp using the SRD coin values) and gear notes |
| **Spells** | Only Artificer spells. Each spell shows a **level tag** and a **status flag**: *Always prepared* (Artillerist spells and Mending), *Prepared / Known*, or *Not prepared*. Counters show prepared and cantrips against your level's limit. **My spells** (default) lists only your cantrips and prepared spells grouped by level; **All spells** has the full list with filters. Cards carry **casting-time tags** (Action, Bonus Action, Reaction, Ritual, Longer) with a casting-time filter, and preparing past your limit asks first in a sheet. Tap a spell's name for its collapsible **description** (Casting Time, Range, Components, Duration, Description, At Higher Levels). 82 spells use the **official SRD 5.2.1 text word for word** (tagged *SRD 5.2.1 · official text*); the other 36 are short own-words summaries tagged *community source, unverified* with a link. Spells from books outside your set (Arcana Unleashed, D&D Beyond Drops) are hidden unless you tick *other official books*; spells you selected always stay visible |
| **Plans** | Every Replicate Magic Item plan by tier (level 2+, 6+, 10+, 14+). Learn or forget plans, learn the "any Common / Uncommon Wondrous / Rare Wondrous" options as named items, and **Create** an item into Magic items (a sheet warns which item vanishes if you go over your limit). Default view: known plans first, then plans you can learn now; chips for Known and All |
| **Magic items** | Non-mundane items you replicated or found: rarity, type, attunement (counter against 3/4/5/6), equipped, charges, notes |
| **Feats** | PHB 2024, Tasha's, Xanathar's and Forge of the Artificer feats (Dragonmarks, Greater Dragonmarks, Boon of Siberys), with prerequisites checked against your character. Default view "Available to me" (eligible and not yet taken), plus Taken and All, and a "Your feats" summary; taking one without meeting the prerequisite asks in a sheet |
| **★ Selected** | A read-only overview of what is chosen right now: AC / Prof / Spell DC, concentration and conditions, spells by level (always-prepared marked), known plans, equipped and attuned items, feats, skills with modifiers. Each card has an Open button to the page where you change it |
| **Journal** | Sub-tabs for Sessions, NPCs, Places, Factions and Quests. Every entry has tags, notes and a delete that can be undone; each list has search, tag filter chips and collapsed cards. NPCs and factions show an attitude badge, quests a status badge and step progress (2/5). A search box at the top searches the whole journal and groups the results by kind |
| **Voice** | Personality, ideals, bonds, flaws, speech quirks, goals and hooks (a checklist), and short in-character lines with a Copy button. Old appearance/backstory notes sit in a collapsed Background notes block |
| **Campaign & data** | Campaign notes, backup share/download/import (journal and voice are included), and **Snapshots**: automatic copies of your data kept only on this device (one daily, one before the last long rest, and the 3 newest "important" ones: before an upgrade, import, restore, delete everything, or when saved data could not be read) with Restore and Download |

**Filters:** Spells (search, casting time, level, status, school, concentration, above-my-level, legacy, other official books), Plans (search, view, tier, type, attunement), Items (search, attuned/equipped, origin, type, rarity), Feats (search, view, category, book). Every filter has a **★ Selected / Known / Taken** option.

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

- Each device and browser keeps **its own copy**. Your Redmi and your Windows PCs only sync if you turn on **Google Drive** (below); otherwise they don't.
- To move your character: **Campaign & data → Share backup** (Android: send it to Drive, WhatsApp, email…) or **Download backup**. On the other device, use **Import backup**. Importing replaces that device's data.
- Clearing browser data deletes it. Export a backup after every session.

## Updates

The app updates itself in the background. When a new version has been installed, a banner at the bottom says **DnD Slop was updated** with a **Reload** button; nothing reloads until you tap it (your data is saved first). The current version is shown in **Campaign & data → About and credits**.

## Google Drive sync (optional)

**Campaign & data → Google Drive → Connect Google Drive** copies your save into one visible folder, **DnD Slop**, in your own Google Drive (`dnd-slop-save.json`, plus a daily backup `dnd-slop-YYYY-MM-DD.json`; the newest 7 are kept). The app asks only for the `drive.file` permission, so it **can't see any other file in your Drive**. The data is always saved on the device first; Drive is a mirror, and the app works fully offline.

- **Set-up already done:** a Google Cloud OAuth client for this site exists (its public client ID is in `js/drive.js`); nothing to configure in the app.
- **When it syncs:** about 15 s after your last change, right after a long rest and right after a quick-add session note, while the sign-in pass is valid. **Sync now**, **Restore from Drive** and **Disconnect** are in the card.
- **Approvals:** the Google sign-in pass lasts about an hour. After that a **Sync to Drive** button appears under the header and in the card: one tap renews it (a Google pop-up may flash). While the app is in Google's *testing* mode, Google may also ask you to approve again about every 7 days.
- **Two devices:** if Drive has newer data than your last sync and this device also has unsynced changes, a sheet lets you use the Drive version (your current data is first saved as a snapshot), keep this device's version (the Drive version is first copied to a `dnd-slop-conflict-…` file), or cancel.
- **Privacy:** no tokens are stored on the device or in backups. Disconnect revokes access when you are signed in; to fully remove the app's access at any time, visit myaccount.google.com/permissions. Files already in Drive stay until you delete them.
- **Imports:** after you import a backup or restore a snapshot, nothing is uploaded automatically; the next sync asks first, and the current Drive copy is saved as `dnd-slop-before-import-…` before it is replaced.
- The sign-in pop-up has been confirmed working by the owner (2026-11-10, device not specified). Not yet verified in real use: silent renewal of the pass and the 7-day re-approval.

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
js/drive.js            optional Google Drive sync (loaded on demand)
js/version.js          APP_VERSION shown in Campaign & data (keep in step with sw.js)
js/rules.js            generic 2024 rules data
js/data/artificer.js   class table, features, Artillerist, cannon math
js/data/spells.js      Artificer spell list (+ Artillerist, + legacy)
js/data/plans.js       Replicate Magic Item plans
js/data/feats.js       feats from the four books
js/data/equipment.js   SRD 5.2.1 weapon and armor tables (checked)
```
