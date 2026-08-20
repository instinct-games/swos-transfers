# SWOS Transfers

A local web app for scouting Sensible World of Soccer players: search and filter
the full 25,000-player database, keep a shortlist with bid notes, and track your
own squad.

Player data and inspiration come from
[GazChap's SWOS Player Database](https://swos.gazchap.com).

## Run it

The app is plain HTML/JS with no build step — it just needs any static file
server (browsers block `fetch()` of the CSV from `file://`):

```sh
cd swos-transfers
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Features

- **Players** — the full database from `swos_players.csv`. A Clubs / National /
  Both toggle controls whether national squads are shown (the six continental
  "leagues" — Africa, Asia, Europe, North America, Oceania, South America —
  hold the national teams; the default is clubs only). Search by name,
  club or nationality; filter by position, league, nationality, value range,
  and per-skill min/max (e.g. Control ≥ 7, Velocity ≥ 7, Heading ≤ 3).
- **Shortlist** — star players you're interested in (`☆ List`).
  `Signed ➜` moves a bought player into your squad. Filterable by position,
  with a legend explaining the skill letters.
- **My Team** — mark the players you currently own (`+ Team`); the squad is
  listed in formation order with its size and total value, plus the team
  history below (see Persistence).
- **Notes** — free-text notes (bids made, asking price…) on any player via
  the note icon beside their name in any table (gold = has a note; hover to
  preview it).

All three tables sort by clicking column headers. Skill columns use the SWOS
convention: **P**assing, **V**elocity (shot power), **H**eading, **T**ackling,
ball **C**ontrol, **S**peed, **F**inishing (0–7), colour-coded like the
in-game editor, plus a **Tot** column summing all seven. The layout is
responsive — on narrow screens the tables scroll sideways with the player
name pinned.

## Persistence

Your team, shortlist and notes are saved in the browser's
`localStorage` (keys `swos.team`, `swos.shortlist` and `swos.notes`). Each
player has a stable id: club rows are `name-club-country` (country = the club's
league, e.g. `ryan-giggs-manchester-utd-england`) and national-team rows are
`name-country` (e.g. `ryan-giggs-wales`); a shirt number is appended only for
same-name-same-club collisions. The team and
shortlist are stored as id lists and notes as an `id → text` map, which is also
the export file format.

Removing a player from the shortlist or team asks for confirmation first.

**Team history** (My Team tab): save named snapshots of your current squad with
a description ("End of season 2 — won the league…"). Snapshots list the squad
and its value at that point, and can be renamed, re-described, or deleted.
They're stored in `swos.history` and included in Export/Import.

Data survives restarts but is per-browser and per-origin. The CSV itself is
read-only source data.

**Export / Import** (header, top right): Export downloads your team, shortlist,
notes and team history as a JSON file; Import restores from one, replacing the
current state (entries that don't match the CSV are skipped). Use it as a backup
or to move your data between browsers/ports.
