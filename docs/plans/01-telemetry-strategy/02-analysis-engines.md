# 01/02 — Telemetry and strategy analysis

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01 · Parallel with: none

## Decisions you need
T4 (trace definition), T6 (clean laps, pit loss, degradation), T7 (baseline aggregation), T9 (no hardcoded domain values) — run `grep -E '^\| (T4|T6|T7|T9) ' 00-README.md`.

## Read first
- `lib/openf1.ts` (from slice 01) — `OpenF1CarData`, `OpenF1Lap`, `OpenF1Stint`, `OpenF1Pit`, `OpenF1RaceControl`, `OpenF1Driver`.
- `lib/jolpica.ts` — `PitStop`, `RaceResult`.
- `lib/format.ts` — `parseLapTime` (milliseconds; convert to seconds at the boundary).
- `lib/staticData.ts` — `COMPOUND_STYLE`, `CircuitOutline` (the UI supplies `outline.length`; do not import React).
- `src/pages/Race.tsx` — existing `PitStopSection` and `TyreSection` show the current (limited) logic.

## Scope (files you own)
- `lib/telemetry.ts` (new)
- `lib/strategy.ts` (new)

Do not edit `lib/openf1.ts`, pages, components or data files.

## Tasks
1. **Telemetry trace — `lib/telemetry.ts`.**
   - Export `TelemetryPoint` (`timeS`, `distanceM`, `speedKph`, `throttlePct`, `brakePct`, `gear`, `rpm`, `drs`) and `TelemetryTrace` (`points`, `durationS`, `distanceM`, `maxSpeedKph`, `averageSpeedKph`, `fullThrottleS`, `brakingS`, `gearChanges`, `sampleCount`).
   - `buildTelemetryTrace(samples: OpenF1CarData[], lap: OpenF1Lap, recordedLapLengthM: number | null): TelemetryTrace | null`:
     - Require a finite positive `lap.lap_duration` and at least two finite samples inside `[lap.date_start, date_start + lap_duration]`; otherwise return `null`.
     - Sort by timestamp; `timeS` is the offset from `lap.date_start`. Drop samples outside the lap.
     - Distance is trapezoidal integration of `speed` (km/h → m/s) over sample intervals. When `recordedLapLengthM` is finite and positive and the integrated total is positive, scale every distance by `recordedLapLengthM / integratedTotal` exactly once so the axis ends at the recorded lap length. Never substitute a guessed lap length when none is supplied.
     - `fullThrottleS` = summed interval time where the leading sample has `throttle >= 100`; `brakingS` = summed interval time where `brake > 0`; `gearChanges` counts adjacent finite gear changes. `averageSpeedKph` = `distanceM / durationS * 3.6` (or the unscaled integrated distance when no recorded length); `maxSpeedKph` = max finite speed.
     - Keep the API's units and values; do not clamp laps or invent samples.
   - `nearestPointIndex(points, timeS)` for chart cursor use.
2. **Track-state helper — `lib/strategy.ts`.**
   - `trackStateAt(messages: OpenF1RaceControl[], iso: string): "green" | "not-green" | "unknown"`:
     - Process messages in date order up to `iso`.
     - `category === "Flag"`: only track-scope (or scope null) messages count. `GREEN`/`CLEAR` → green; `YELLOW`/`DOUBLE YELLOW`/`RED` → not-green. Ignore sector-scope flags.
     - `category === "SafetyCar"` → not-green; the next track GREEN/CLEAR restores green.
     - No applicable message before `iso` → unknown. Do not treat unknown as green or as an exclusion.
3. **Driver identity.**
   - `officialStopsFromJolpica(pitStops: PitStop[], results: RaceResult[], drivers: OpenF1Driver[]): OfficialStop[]` where `OfficialStop = { driverNumber, lap, durationLabel, durationS }`.
   - Match Jolpica `Driver.code` to OpenF1 `name_acronym` (case-insensitive); fall back to normalised `familyName` = `last_name`. Skip a stop only when no driver number can be matched. Parse the published duration with `parseLapTime(...) / 1000`; preserve the original string for display. Never assume a duration when parsing fails.
4. **Strategy report — `buildStrategyReport(input)`.** Input: `season`, `drivers`, `laps`, `stints`, `pits`, `raceControl`, optional `officialStops`, optional `results`. Return `StrategyReport` with `totalLaps`, `drivers` (one `DriverStrategy` per session driver), `pitLossMedianS`, `pitLossSamples`, `excludedStops`, `flagsAvailable`, `compounds`.
   - `totalLaps` = maximum finite `lap_number` with a finite `lap_duration`; do not use a series constant.
   - Stops: use `officialStops` when supplied (an empty array means "zero official stops"); otherwise use OpenF1 pit rows as lap/count records with `durationS = null`. Sort per driver.
   - `cleanLap`: finite `lap_duration`, `!is_pit_out_lap`, lap is not a stop's in-lap or out-lap, and `trackStateAt(lap.date_start) !== "not-green"`. When `raceControl` is empty, the state is unknown and does not exclude the lap (`flagsAvailable` exposes that).
   - Driver `baselineS` = median clean-lap time; `cleanLapCount` is the count used. If none, `null`.
   - For each stop: `trackState` from the matching OpenF1 pit timestamp (driver number + lap; `unknown` when absent); `excluded = trackState === "not-green"`. `measuredLossS = inLap + outLap − 2 × baselineS` only when not excluded and both lap times and the baseline are finite; otherwise `null`. Keep negative results as measured (traffic/cut-back can produce them); never clamp to an assumed minimum.
   - Stints: fill `lap_end <= 0` with `totalLaps`; `lengthLaps = max(0, end − start + 1)`. For each clean lap in the stint, x = `tyre_age_at_start + (lap_number − lap_start)`, y = lap duration seconds. With at least two distinct x values, compute the least-squares slope `seconds per lap`; otherwise `null`. `cleanLaps` is the sample count for that stint.
   - Sort drivers by classified position when `results` match, otherwise by driver code. Position, team and `teamColor` come from `results`/`OpenF1 `team_colour``; no hardcoded team map.
   - `pitLossMedianS` = median of all non-excluded finite `measuredLossS`; `pitLossSamples` = count; `excludedStops` = count of excluded stops. `compounds` = per-compound medians of stint length and degradation with stint/sample counts.
5. **Baseline — `buildStrategyBaseline(reports)`.** Aggregate every report: `sessionCount`, unique `seasons`, driver-race samples, median stop count and its observed min/max, median measured pit loss with sample count, and per-compound median stint length/degradation. Return `null` fields when there is no data; never fill a missing benchmark with a default. Label nothing in this module as a prediction.
6. **No UI imports or formatting.** Return numbers in seconds/laps/metres; components own display strings. Use one shared `median` helper; do not put magic strategy thresholds in this module.

## Done when
- `npx tsc --noEmit` and `npm run build` pass.
- With 2024 Monaco inputs, the red-flag first-lap stops are marked `not-green` and excluded from `pitLossMedianS`; no `measuredLossS` is non-null for them.
- With 2024 Silverstone inputs, every finite measured loss comes from a real in-lap + out-lap pair and the field median is the median of those values; changing one lap time changes the result.
- A trace built from the 2024 Monaco lap-30 Leclerc sample has monotonic `timeS` and `distanceM`, and its final distance equals the supplied recorded lap length.
- No numeric pit-loss, lap-count, stop-count or degradation fallback exists in either file; only the two-point minimum for a slope and the API scales (0/100) are fixed.
- Append `## Result` with the checks and any null cases found.

## Result
- `npx tsc --noEmit` passes.
- 2024 Monaco (session 9523): all 16 lap-1 stops resolve `not-green` and are excluded (`excludedStops` 16); none has a non-null `measuredLossS`; `pitLossMedianS` uses the 7 green stops only.
  - Fix applied: OpenF1 stamps the red-flag lap 1 as starting at the restart (13:44:00), so the stop window now begins at the earlier of the in-lap start and pit entry (`pit.date − lane_duration`); the red flag at 13:04:08 now falls inside the window.
- 2024 Silverstone: 45 measured losses, 0 excluded; adding 5 s to HAM's lap-27 in-lap moves that stop from 42.697 s to 47.697 s.
- Monaco lap 30 LEC trace: 311 samples, monotonic time and distance, final distance 3337 m (= supplied recorded length).
- Null cases seen: in-laps with no `lap_duration` (lap 1 under red) give `measuredLossS = null`.
