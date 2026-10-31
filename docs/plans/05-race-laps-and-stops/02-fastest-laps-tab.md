# 05/02 — Fastest laps tab

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01 · Parallel with: 03

## Decisions you need
L2, L3 (link shape), L7, L8, L10 — run `grep -E '^\| (L2|L3|L7|L8|L10) ' 00-README.md`.

## Read first
- `src/pages/Records.tsx` — `RoundLapTable`, `HighlightBody`, table class constants (copy style; do not import page internals).
- `lib/records.ts` — `buildRoundLapTable`, `buildLapRecords`, `circuitLapContext`.

## Scope (files you own)
- `src/pages/RaceFastestLaps.tsx` (new; export `RaceFastestLapsPanel({ season, round, race })`)

## Tasks
1. Two `useAsync`s: `getRaceResults(season, round)` and `getCircuitFastestLaps(race.Circuit.circuitId)`; plus `resolveRaceSession` only to decide whether telemetry links are shown (L3).
2. Headline card (L2a): rank-1 row; average speed or "not published".
3. Table (L2b): same columns and formatting as the Records round table; each row has a `Telemetry →` link to `#/race/{s}/{r}/telemetry/{code}/{lap}` when a session resolved.
4. Circuit context card (L2c): circuit best race lap, holder, season (linked to its race), gap from this race's fastest (`+x.xxx s`, or "This race set the circuit's best recorded race lap"), `{editions} recorded editions`, and the layout/rules caveat.
5. States (L7): results not published; no fastest-lap data; circuit endpoint failure hides only the context card.

## Done when
- `npm run build` passes; 2024 R8 and 2026 R18 render with correct headline, gaps and context; append `## Result`.
