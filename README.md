# DnD Slop

A D&D 5e **2024 rules** character sheet and campaign journal. It runs in the browser on phone and PC, works offline, and can be installed to your home screen. There is no server and no account: your data stays on your device.

## Features

**Character sheet**
- Identity, species, background and XP, with the XP needed for the next level
- Multiclass support: total level drives the Proficiency Bonus
- Ability scores with automatic modifiers
- Saving throws (one tap applies your first class's proficiencies), plus a bonus to all saves
- 18 skills with none / proficient / expertise, Jack of All Trades, and Passive Perception
- HP with damage, heal and temporary HP (damage uses temp HP first; temp HP don't stack), death saves, and Hit Dice you can spend
- AC, Speed, Initiative, Heroic Inspiration, Exhaustion (shows the 2024 penalty), and conditions
- Attacks with automatic to-hit and damage, damage type and Weapon Mastery
- Spellcasting: save DC, spell attack, spell slots (auto-filled from your classes using the multiclass Spellcaster table), Pact Magic, and a spell list grouped by level
- Inventory with weight vs. carrying capacity, coins and attunement count
- Features with limited uses that reset on a Short or Long Rest
- Proficiencies, languages, appearance, personality and backstory

**Rests**
- *Short rest*: resets short-rest features and Pact Magic slots; you then spend Hit Dice in the Combat tab
- *Long rest* (2024): full HP, all Hit Dice and spell slots, all features, Exhaustion −1, temp HP and death saves cleared

**Campaign**
- Session journal: number, real and in-game date, summary, notes, loot, open threads, plus full-text search
- Campaign notes (DM, setting, house rules…)
- Backup export and import (JSON)

Every number can also be edited by hand, so homebrew and items the app doesn't know about still work.

## Run it

There's no build step. Serve the folder with any static web server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.

## Put it on your phone (GitHub Pages)

1. On GitHub, go to **Settings → Pages**, set *Source* to "Deploy from a branch", then pick the branch and `/ (root)`.
2. Open the URL GitHub gives you on your phone.
   - **iPhone (Safari):** Share → *Add to Home Screen*
   - **Android (Chrome):** menu → *Install app* / *Add to Home screen*

GitHub Pages on a free account needs the repository to be **public**. Your character data is not in the repository, only the app code.

## Your data: read this

- Data lives in the browser's `localStorage`, **separately on each device and browser**. Your phone and your PC do not sync.
- To move data, use **Campaign → Export backup** on one device and **Import backup** on the other.
- Browsers can delete site data. Safari on iOS may clear data for sites not used in 7 days unless the app is added to the Home Screen. Clearing browser data also deletes it. **Export a backup regularly**, for example after each session.

## Project layout

```
index.html            app shell
css/styles.css        styles (light and dark themes)
js/app.js             UI, calculations, actions
js/rules.js           2024 rules data (classes, skills, slot tables, XP…)
js/store.js           save, load, import, export
sw.js                 offline cache
manifest.webmanifest  install-to-home-screen metadata
```
