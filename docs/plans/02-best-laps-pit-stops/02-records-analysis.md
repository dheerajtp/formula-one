# 02/02 — Records analysis

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 02/01 · Parallel with: none

## Decisions you need
R3 (race fastest lap), R4 (lap views), R5 (pit-lane transit), R6 (crew stops and coverage), R9 (no hardcoded domain values) — run `grep -E '^\| (R3|R4|R5|R6|R9) ' 00-README.md`.

## Read first
- `lib/jolpica.ts` (after 02/01): `RaceFastestLap`, `SeasonFastestLap` call, `SeasonPitStop`, `PitStop`, `RaceResult`.
- `lib/openf1.ts` (after 02/01): `OpenF1Session`, `OpenF1Pit`, `OpenF1Driver`, `getSeasonRaceSessions`, `getSessionPit`, `getSessionDrivers` (the latter two now accept `{ persist?: boolean }`).
- `lib/format.ts`: `parseLapTime` (string timing to milliseconds).
- `lib/strategy.ts` (plan 01/02) only for the median/aggregation style; do not import it, because this plan must stay usable if that file changes.

## Scope (files you own)
- `lib/records.ts` (new)

Do not edit the clients, pages, components or plan 01 files.

## Tasks
1. **Lap records.** Export:
   `interface LapRecord { season; round; raceName; date; circuitId; circuitName; driverId; code; driverName; constructorId; team; lap; millis; time; avgSpeedKph: number | null }`
   `buildLapRecords(rows: RaceFastestLap[]): LapRecord[]`
   - Read `result.FastestLap`; skip the row when the timing string is missing or `parseLapTime` returns null.
   - `lap = Number(FastestLap.lap)`. `avgSpeedKph = Number(FastestLap.AverageSpeed.speed)` only when the field exists and the number is finite, else null.
   - Driver code fallback: `result.Driver.code ?? result.Driver.familyName.slice(0, 3).toUpperCase()`.
   - Sort by `millis` ascending, then date, then round. Keep the published timing string in `time`.
2. **Lap awards and highlights.**
   `buildLapAwards(records): { driverId; code; driverName; team; constructorId; awards; bestMillis; bestTime }[]`
   - Group by driverId; `awards` is the count; `bestMillis`/`bestTime`/team/constructor come from that driver's quickest record. Sort by awards descending, then `bestMillis` ascending, then driver name. No driver appears twice.
   `seasonLapHighlights(records): { shortest: LapRecord | null; fastestAverageSpeed: LapRecord | null }`
   - `shortest` is the first sorted record. `fastestAverageSpeed` is the record with the largest non-null `avgSpeedKph`; null when no record publishes a speed.
3. **One round's fastest-lap table.**
   `buildRoundLapTable(results: RaceResult[]): { rank; driverId; code; driverName; team; constructorId; racePosition: number | null; lap; millis; time; gapMillis; avgSpeedKph: number | null }[]`
   - Only results with a parsable `FastestLap.Time.time`. Sort by millis; assign `rank` 1..n; `gapMillis = millis - first.millis` (never negative); `racePosition` is `Number(result.position)` when finite, else null.
   - Keep drivers without a published fastest lap out of the table; do not give them a zero.
4. **Pit-lane transit.**
   `buildPitLaneTable(stops: PitStop[]): { driverId; lap; stop; durationSeconds; gapSeconds }[]`
   - Parse `duration` with `Number`; skip non-finite and non-positive values. Sort ascending; `gapSeconds = durationSeconds - first.durationSeconds`. `lap`/`stop` are numbers. No rounding.
5. **Crew stops.**
   Types:
   `interface CrewStopRow { sessionKey; meetingKey; location; dateStart; driverNumber; code; driverName; team; lap; stopSeconds }`
   `interface CrewCoverage { published; total; sessions }`
   `interface CrewStopsResult { rows: CrewStopRow[]; coverage: CrewCoverage }`
   `buildCrewStops(groups: { session: OpenF1Session; rows: OpenF1Pit[] }[], driversBySession: Map<number, OpenF1Driver[]>, limit: number): CrewStopsResult`
   - `total` counts every pit row in the groups; `published` counts rows whose `stop_duration` is a finite number greater than zero; `sessions` is the number of groups read.
   - Rank published rows by `stop_duration` ascending, take `limit`. Map the driver by `driver_number` in `driversBySession.get(session.session_key)`; when missing, use `code = "#" + driverNumber`, `driverName = ""`, `team = ""`. `lap` is `lap_number`; location/date come from the session.
6. **Loader.** Export `loadCrewStops(season: number, limit: number): Promise<CrewStopsResult>`:
   - `getSeasonRaceSessions(season)`; keep sessions whose `date_end` (fallback `date_start`) is at or before now.
   - Fetch `getSessionPit(session_key, { persist: true })` for every completed session, then build; when there are no sessions or no published stops, return empty rows with the coverage counts and make no extra requests.
   - Fetch `getSessionDrivers(session_key, { persist: true })` only for the session keys that appear in the top `limit`, and pass those lists to `buildCrewStops`. This loader is the only non-pure function in the file; it must call only the two clients.
7. **Pure math only.** No React, no formatting, no `Date.now()`/`new Date()` in the builders, no domain constants. Presentation limits (`limit`, five circuit rows) are passed in or applied by the page.

## Done when
- `npm run build` passes.
- A short review confirms: unsorted input produces sorted output; every gap is non-negative and the first row's gap is 0; a record without `AverageSpeed` does not become 0; a null `stop_duration` is absent from crew rows but still counted in `coverage.total`; a driver with no driver record is still returned with the `#number` fallback.
- Append `## Result` with the invariants checked and any data shape surprises.

## Result
- `lib/records.ts` added: `buildLapRecords`, `buildLapAwards`, `seasonLapHighlights`, `buildRoundLapTable`, `buildPitLaneTable`, `buildCrewStops`, `loadCrewStops`. Build passes.
- Invariants checked via the page on live data: outputs sorted; first gap 0 (shown `—`), none negative; missing `AverageSpeed` stays null (2024 R8 Monaco shows `—`); null `stop_duration` rows are excluded from crew rows but counted in coverage (2024: 149 of 825); unmatched drivers would fall back to `#number`.
