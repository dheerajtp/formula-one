# 06/05 — Snapshot-first client and view fallbacks

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 02, 03, 04 · Parallel with: none

## Decisions you need
A1, A3, A5, A6 — run `grep -E '^\| (A1|A3|A5|A6) ' 00-README.md`.

## Scope (files you own)
- `lib/openf1.ts`, `lib/strategyLoader.ts`, `src/pages/Telemetry.tsx`, `src/App.tsx` (footer line), `README.md`

## Tasks
1. `loadSnapshotIndex()` (fetch `/openf1/index.json` once, memoised) and `loadSessionSnapshot(sessionKey)` (fetch `/openf1/{season}/{round}.json`, memoised, laps expanded back to `OpenF1Lap`).
2. `resolveRaceSession`: check the index first (match season + round via the Jolpica race); fall back to live lookup. `getPriorRaceSessions`: from the index by `circuit_key` and date, then live for anything newer.
3. Session getters (`drivers/laps/stints/pit/race_control`): snapshot when the key is in the index, else store → live.
4. Telemetry: session table/laps work from snapshot; `LapTrace` shows `PausedNote` only when car data is in neither the store nor live.
5. Footer + README: one sentence that completed OpenF1 sessions are cached in the site so pages keep working while OpenF1 pauses free access during live sessions.

## Done when
- `npm run build` passes; with OpenF1 blocked, `#/race/2026/18` Strategy, `#/weekend` baseline, `#/records` crew stops and `…/pit-stops` stationary times all render; with OpenF1 unblocked the values are identical.
- Append `## Result`.
