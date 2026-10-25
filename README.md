# Shiftage Community Tools — Hellruler

A home for community-made, unofficial tools for the free browser ARPG
[Hellruler](https://hellruler.com).

**Open the site:** https://hellrulertools.github.io/Community-Tools/

## About the game

Hellruler is a browser ARPG about descending ever deeper into hell — levelling a hero, shaping a
sprawling passive tree, stacking runes and skills, and prestiging to push further than the last run.
These tools help plan that climb outside the game. They are unofficial and non-commercial.

## Tools

| Tool | What it does |
| --- | --- |
| **Tree Planner** | Plan the passive tree with the game's node art, route to any node, pick your altar ascendancy and notables, and lay out prestige. Builds share via a code. |
| **Skill Planner** | Browse every active rune and support, and build skill groups like in game — socket an active and add supports, with only compatible runes offered at each socket. |

More tools are planned (a loot filter helper and a rune reference are next).

## How the site is built

A single hub (`index.html`) with hash-based page navigation, ready for more tools. Each tool is its own
self-contained HTML file loaded in the hub; `planner.html` is generated from the current game build —
regenerate it and replace the file to update.

## Credit

Hellruler and its art and data belong to the game's developers. This is an unofficial, non-commercial
community project by Shiftage.
