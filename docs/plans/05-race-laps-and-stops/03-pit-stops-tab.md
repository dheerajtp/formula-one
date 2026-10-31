# 05/03 — Pit stops tab

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01 · Parallel with: 02

## Decisions you need
L4, L5, L7, L8, L10 — run `grep -E '^\| (L4|L5|L7|L8|L10) ' 00-README.md`.

## Read first
- `lib/records.ts` — `loadRacePitStops`, `buildCrewSummary`.
- `src/pages/Records.tsx` — `TransitTable` and `CrewStops` styling.
- `src/pages/Strategy.tsx` — for the cross-link wording only.

## Scope (files you own)
- `src/pages/RacePitStops.tsx` (new; export `RacePitStopsPanel({ season, round, race })`)

## Tasks
1. One `useAsync(() => loadRacePitStops(season, round, race), [season, round])`.
2. Headline cards: quickest pit-lane transit and quickest stationary stop (or "no stationary time published").
3. Stops table (L4): driver (linked), team bar, stop, lap, transit (`x.xxx s`), gap (`—` for quickest), stationary (`x.xxx s` or `not published`). Caption + visible definitions of both measures.
4. Crew summary (L5): per-team best/median stationary with counts; untimed teams line.
5. Coverage line and sources; link "Time lost in the pits and tyre stints → Strategy" to `#/race/{s}/{r}/strategy`.
6. States (L7): no pit rows; no OpenF1 session (season coverage note); OpenF1 error message shown in the stationary area while the transit table renders.

## Done when
- `npm run build` passes; 2024 R12, 2026 R18, 2022 R1 and 2010 R1 render their expected states; append `## Result`.
