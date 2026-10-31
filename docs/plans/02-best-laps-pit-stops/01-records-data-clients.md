# 02/01 — Records data clients

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: plan 01/01 (gated OpenF1 client) · Parallel with: none

## Decisions you need
R1 (sources), R5 (transit uses the Jolpica duration), R6 (crew-stop field), R7 (endpoints, request discipline, caching) — run `grep -E '^\| (R1|R5|R6|R7) ' 00-README.md`.

## Read first
- `lib/jolpica.ts`: `request`, `mapPool`, `withRetry`, `getCalendar`, `getPitStops`, `getCircuitHistory`, `raceStartDate`, and the `RaceResult` / `PitStop` / `Circuit` / `Race` types. `getSeasonProgression` is the pattern for one-request-per-round work with a concurrency pool.
- `lib/openf1.ts`: `requestOpenF1`, `allowMissing`, `isCacheable`, `getSeasonMeetings`, `getSessionDrivers`, `getSessionPit`, `OpenF1Session`, `OpenF1Pit`, `OpenF1Driver`.
- `lib/format.ts`: `parseLapTime` only, for context on what the later analysis slice parses. Do not parse times or durations in this slice.

## Scope (files you own)
- `lib/jolpica.ts`
- `lib/openf1.ts`

## Tasks
1. **Fastest-lap rows.** Add `RaceFastestLap`:
   `{ season: number; round: number; raceName: string; date: string; circuit: Circuit; result: RaceResult }`.
   Add `getSeasonFastestLaps(season)` and `getCircuitFastestLaps(circuitId)`:
   - Endpoints: `/{season}/fastest/1/results.json?limit=100` and `/circuits/{circuitId}/fastest/1/results.json?limit=100`. Paginate with `offset` while `offset + 100 < Number(MRData.total)`; the circuit endpoint pages by race.
   - Flatten `MRData.RaceTable.Races`. For each race choose the result whose `FastestLap.rank === "1"`; if none matches, fall back to the first result with a `FastestLap`; skip a race with no such result.
   - Map `season`/`round` to numbers. Sort the season function by round; the circuit function by date then round.
   - Do not persist these calls: a new round appears during a race weekend, so the memory cache is the right lifetime.
2. **Season pit rows.** Add `SeasonPitStop extends PitStop` with `season`, `round`, `raceName`, `date`, `circuitId`; add `getSeasonPitStops(season)`:
   - Use `getCalendar(season)`; keep races whose `raceStartDate(race)` is at or before now (fall back to `race.date` when the helper returns null), sorted by round.
   - Run `mapPool(races, 4, race => withRetry(() => getPitStops(season, Number(race.round))))`.
   - Flatten with the race metadata. Leave `duration` as the published seconds string. Return `[]` for a season with no pit rows.
   - The season-wide pitstops URL is rejected by the feed (`Missing one of the required parameters ['season_year', 'race_round']`), so do not try it.
3. **OpenF1 season race sessions.** Add `getSeasonRaceSessions(season)`:
   - `allowMissing(requestOpenF1<OpenF1Session[]>("/sessions", { year: season }, { persist: true }))`, then keep `!is_cancelled && session_name === "Race"`, sorted by `date_start`.
   - A sprint weekend's Sprint has `session_type: "Race"`; filtering on the type is wrong. Use the name.
4. **Persist immutable session rows.** Give `getSessionDrivers(sessionKey, opts?)` and `getSessionPit(sessionKey, opts?)` an optional `{ persist?: boolean }`, forwarded to `requestOpenF1`; default off so plan 01's existing callers do not change. `isCacheable` already refuses empty answers, and only completed sessions will pass `persist: true`.
5. **Boundaries.** No gaps, medians, coverage counts, parsing or formatting here. No fetch outside the two clients.

## Done when
- `npm run build` passes.
- Live checks (curl or a temporary Node harness) confirm:
  - `getSeasonFastestLaps(2024)` returns 24 rows; round 8 is Hamilton `1:14.165` lap 63 with no `AverageSpeed`, round 17 is Norris `1:45.255` with `AverageSpeed.speed === "205.318"`.
  - `getCircuitFastestLaps("monaco")` returns 24 rows and includes season 2024.
  - `getSeasonPitStops(2010)` returns `[]`; 2024 round 12 (Silverstone) returns string durations such as `"29.178"`.
  - `getSeasonRaceSessions(2025)` returns 24 `Race` sessions and no Sprint.
  - `getSessionPit(9888)` returns rows with numeric `stop_duration`; a 2023 session returns rows with `stop_duration: null`.
- `grep -R "api.jolpi.ca\|api.openf1.org" lib src components` finds those hosts only in the two client modules.
- Append `## Result` with each check and any new API quirk.

## Result

Added to `lib/jolpica.ts`: `RaceFastestLap`, `getSeasonFastestLaps`, `getCircuitFastestLaps`, `SeasonPitStop`, `getSeasonPitStops`. Added to `lib/openf1.ts`: `getSeasonRaceSessions`, and an optional `{ persist?: boolean }` on `getSessionDrivers` / `getSessionPit`. No export was removed or renamed; every new parameter defaults off.

Live checks (temporary Node harness compiled from the two clients, not committed):
- `getSeasonFastestLaps(2024)` → 24 rows, sorted by round. Round 8 Monaco is Hamilton `1:14.165`, lap 63, no `AverageSpeed`; round 17 Azerbaijan is Norris `1:45.255`, `AverageSpeed.speed === "205.318"`.
- `getCircuitFastestLaps("monaco")` → **22 rows, not 24**, and includes 2024. Quirk: the endpoint lists 24 race wrappers (1958, 1959, 2004–2019, 2021–2026) but 1958 and 1959 each hold a single result row with **no `FastestLap` at all** (their own `results.json` has 0 rows with a `FastestLap` across 16 results). The slice rule says to skip a race with no such result, so the client drops those two; `buildLapRecords` would drop them anyway. Consequence for 02/04: the Monaco panel will render `22 recorded editions`, not 24.
- `getSeasonPitStops(2010)` → `[]` (the feed answers `total: "0"` with an empty `Races` for all 19 rounds). `getSeasonPitStops(2024)` → 825 rows; round 12 is Silverstone (45 rows) and `duration` is the published string, e.g. `"29.178"`, `"28.481"`. `season`/`round` are numbers, `circuitId` is attached.
- `getSeasonRaceSessions(2025)` → 24 sessions, all `session_name: "Race"`, no Sprint, sorted by `date_start`. Note a Sprint carries `session_type: "Race"`, so the name filter is the only correct one.
- `getSessionPit(9888)` → 21 rows with numeric `stop_duration`. A 2023 race session (9126, Silverstone) → 24 rows with `stop_duration: null` for every row.
- `getSessionDrivers(9888)` → 20 rows both with the default arguments and with `{ persist: true }`, so plan 01's callers are unaffected.

Other quirks found:
- Several early 2023 sessions (7953, 7779, 7787, 9070) answer `/v1/pit?session_key=` with 404 `{"detail":"No results found."}` while later 2023 rounds return rows with null stops; `allowMissing` already maps that to `[]`.
- Jolpica throttles a four-in-flight burst with 429s, sometimes carrying `Retry-After: 1`–`10`, sometimes with no header. The old flat 400/800 ms backoff could not clear it and a season walk failed intermittently. `withRetry` now reuses the feed's `Retry-After` (capped at 10 s) and waits at least 1 s per attempt for a bare 429; `request` attaches `status` and `retryAfterMs` to the error to enable that. Signature and default attempts are unchanged, and `getSeasonProgression` keeps its behaviour apart from the longer wait when throttled.
- Fastest-lap pages are memory-only (`request` without `persist`), pit rows likewise; only `/sessions?year=` rows are persisted, matching the immutability rule.

Boundaries: `grep -R "api.jolpi.ca\|api.openf1.org" lib src components` matches only `lib/jolpica.ts` and `lib/openf1.ts`, plus the pre-existing attribution link `<a href="https://api.jolpi.ca/">` in `src/App.tsx` (a credit, not a fetch; 02/04 owns that file).
Verification: `npx tsc --noEmit` exits 0. `npm run build` was not run, by instruction.
