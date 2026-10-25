# Shiftage Community Tools — Hellruler

A home for community-made, unofficial tools for the free browser ARPG
[Hellruler](https://hellruler.com).

**Open the site:** https://hellrulertools.github.io/Community-Tools/

## About the game

Hellruler is a browser ARPG about descending ever deeper into hell — levelling a hero, shaping a
sprawling passive tree, stacking runes and skills, and prestiging to push further than the last run.
These tools help plan that climb outside the game. They are unofficial and non-commercial.

## Import and export

The thread tying these tools together: pull a build out of the game, work on it here, then take it back
in. Hellruler's own BUILD CODE already carries gear, skills, tree and path, and the aim is for every tool
to read and write it. Anything deeper (an API or a console export) will only happen with the devs' blessing.

## Tools

| Tool | Status | What it does |
| --- | --- | --- |
| **Tree Planner** | Live | Plan the passive tree with the game's node art, route to any node, pick your altar ascendancy and notables, and lay out prestige. Builds share via a code. |
| **Skill Planner** | Live | Browse every active rune and support, and build skill groups like in game — socket an active and add supports, with only compatible runes offered at each socket. |
| **Build Code Import/Export** | In progress | Read what a BUILD CODE holds and build a fresh one from your plan to paste back into the game. |
| **Equipment Check** | Planned | Score a loadout's real DPS and per-type effective HP with the game's own damage code. |
| **DPS Tester** | Planned | Run a build through simulated floor fights and see how it holds up. |
| **Defence Breakdown** | Planned | See the biggest hit you survive per damage type and where armour, resists and barrier help. |

Got an idea or a request? Tell Shiftage what would help and it can join the backlog.

## How the site is built

A single hub (`index.html`) with hash-based page navigation, ready for more tools. Each tool is its own
self-contained HTML file loaded in the hub; `planner.html` is generated from the current game build —
regenerate it and replace the file to update.

## Credit

Hellruler and its art and data belong to the game's developers. This is an unofficial, non-commercial
community project by Shiftage.
