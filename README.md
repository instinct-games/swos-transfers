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
  Click column headers to sort.
- **Shortlist** — star players you're interested in (`☆ List`) and keep
  free-text notes per player (bids made, asking price…). `Signed ➜` moves a
  bought player into your squad.
- **My Team** — mark the players you currently own (`+ Team`), see the squad
  grouped by position with total value and average skills.

Skill columns use the SWOS convention: **P**assing, **V**elocity (shot power),
**H**eading, **T**ackling, ball **C**ontrol, **S**peed, **F**inishing (0–7).

## Persistence

Your team, shortlist and notes are saved in the browser's
`localStorage` (keys `swos.team` and `swos.shortlist`) — they survive restarts
but are per-browser and per-origin. The CSV itself is read-only source data.

**Export / Import** (header, top right): Export downloads your team, shortlist,
and notes as a JSON file; Import restores from one, replacing the
current state (entries that don't match the CSV are skipped). Use it as a backup
or to move your data between browsers/ports.
