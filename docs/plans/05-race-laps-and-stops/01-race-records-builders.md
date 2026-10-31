# 05/01 — Race records builders and loader

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: plans 02, 03 complete · Parallel with: none

## Decisions you need
L2, L4, L5, L6, L7, L8 — run `grep -E '^\| (L2|L4|L5|L6|L7|L8) ' 00-README.md`.

## Read first
- `lib/records.ts` — `buildLapRecords`, `buildRoundLapTable`, `buildPitLaneTable`, `LapRecord`, `PitLaneRow`.
- `lib/strategy.ts` — `officialStopsFromJolpica` (identity rules to mirror; do not import UI).
- `lib/openf1.ts` — `resolveRaceSession`, `getSessionPit`, `getSessionDrivers`, `normaliseName`.
- `lib/jolpica.ts` — `getRaceResults`, `getPitStops`, `getCircuitFastestLaps`.

## Scope (files you own)
- `lib/records.ts`

## Tasks
1. **`circuitLapContext(raceFastest: RoundLapRow | null, circuitRecords: LapRecord[])`** → `{ record: LapRecord | null; gapMillis: number | null; editions: number; isRecord: boolean }`. `isRecord` when this race's lap equals the circuit best (same season/round). Pure.
2. **`buildRacePitRows(stops, results, openf1Pits, openf1Drivers)`** → rows `{ driverId; code; driverName; team; constructorId; stop; lap; transitS; transitGapS; stationaryS: number | null }` sorted by transit, per L4/L6. Reuse `buildPitLaneTable` for transit and gaps; stationary only when `stop_duration` is finite and > 0.
3. **`buildCrewSummary(rows)`** → `{ teams: { team; constructorId; timed; best; median }[]; untimedTeams: string[]; published; total }` per L5 (median with one local helper; even counts average the middle two).
4. **`loadRacePitStops(season, round, race)`** → `{ rows; summary; openf1: "ok" | "no-session" }`: Jolpica `getPitStops` + `getRaceResults`; `resolveRaceSession`; when resolved, `getSessionPit(key, { persist: true })` and `getSessionDrivers(key, { persist: true })` only if the race has finished (session `date_end` ≤ now). OpenF1 errors propagate only to the stationary part: return `openf1Error: string` alongside the Jolpica rows (L7) instead of failing the whole load.
5. Pure builders; the loader is the only fetching function added.

## Done when
- `npm run build` passes.
- Harness on 2024 R12: 45 rows, transit equals Jolpica strings, stationary non-null count equals OpenF1 published rows for session 9558's matching laps; 2024 R8 Monaco context gives HAM 2021 `1:12.909` and gap `+1.256 s`.
- Append `## Result`.
