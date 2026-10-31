# 01/04 — Strategy view (actual and upcoming baseline)

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01, 02 · Parallel with: 03

## Decisions you need
T3 (tab content), T6 (measured strategy), T7 (upcoming baseline), T8 (missing states), T9 (no domain values), T11 (accessibility) — run `grep -E '^\| (T3|T6|T7|T8|T9|T11) ' 00-README.md`.

## Read first
- `lib/openf1.ts` (01) — `resolveRaceSession`, `getPriorRaceSessions`, session data getters, types.
- `lib/strategy.ts` (02) — `buildStrategyReport`, `buildStrategyBaseline`, `officialStopsFromJolpica`, types.
- `lib/jolpica.ts` — `getRaceResults`, `getPitStops`, `Race`.
- `src/pages/Race.tsx` — `RacePage`, current `PitStopSection` and `TyreSection` (the views this replaces), header allocation chips.
- `src/pages/Qualifying.tsx` — table/panel composition style.
- `components/Bits.tsx` — `Panel`, `Loading`, `PageLoader`, `ErrorBlock`, `Empty`.
- `lib/staticData.ts` — `TYRES`, `COMPOUND_STYLE`, `compoundAppearance`, `CircuitOutline`.
- `lib/colors.ts` — `textOn`, `teamColor`; `lib/format.ts` — `formatLapTime`.

## Scope (files you own)
- `src/pages/Strategy.tsx` (new; export `StrategyPanel({ season, round, race })`)

Do not edit `src/pages/Race.tsx`, `src/App.tsx`, `lib/*` or `components/*`.

## Tasks
1. **Resolve the session and choose a mode.**
   - One `useAsync` calls `resolveRaceSession(season, race)`.
   - Loading → `Loading` in a `Panel`; error → `ErrorBlock`; no resolved session → `Empty("OpenF1 has no session data for this race.")` (T8).
   - Fetch the session's laps. If it has at least one finite `lap_duration`, render **actual strategy**. Otherwise render **baseline strategy** for this upcoming/unpublished round.
2. **Actual strategy data.**
   - In parallel fetch `getSessionDrivers`, `getSessionLaps`, `getSessionStints`, `getSessionPit`, `getSessionRaceControl` and Jolpica `getRaceResults`, `getPitStops`.
   - Build `officialStops = officialStopsFromJolpica(pitStops, results, drivers)` and `report = buildStrategyReport({ season: Number(race.season), drivers, laps, stints, pits, raceControl, officialStops, results })`. Pass `officialStops` even when empty, so an official zero-stop race is not replaced by OpenF1 pit records.
   - If the report has no driver stints at all, show a `Panel` marked unavailable rather than an empty timeline.
3. **Baseline data (upcoming races).**
   - `getPriorRaceSessions(resolved.session.circuit_key, resolved.session.date_start, resolved.session.session_key)`.
   - If empty → `Empty` naming that there is no completed OpenF1 race at this circuit yet; no baseline is invented.
   - For each prior session, fetch drivers, laps, stints, pit and race control, then `buildStrategyReport` with `season: prior.year` and **without** `officialStops`/`results` (historical stop counts come from OpenF1 pit records; durations stay unavailable rather than guessed).
   - `buildStrategyBaseline(reports)`. Show the contributing session count, seasons, and driver-race sample count. Label the whole panel as historical context, explicitly not a prediction of the upcoming race.
   - Read the current allocation from `TYRES.get(race.raceName)` and render the hard/medium/soft codes only when present, with `allocation.source`; otherwise state that the allocation has not been published in the data bundle. Never substitute a default allocation.
4. **Actual-strategy presentation.**
   - Summary row (all values from `report`): total laps, recorded stops (and excluded count), field median pit loss with sample count, compounds used.
   - **Stint timeline:** one row per driver, sorted by classified position then code, with team colour accent. Render a segmented bar: width = `lengthLaps / totalLaps` (derived), colour = `COMPOUND_STYLE[compound]` or a neutral unknown style, label = compound when it fits, `title` with lap range, tyre age at start, stint length and degradation. Show a compound legend built from the session's actual stints. Include drivers with zero stops.
   - **Pit stops:** a scrollable table of every recorded stop: driver, stop number, lap, published duration (`durationLabel` verbatim or `—`), measured loss in seconds, track state, and delta to `report.pitLossMedianS` (computed, with sign). Mark excluded (non-green) stops and show `—` for their measured loss; they must not contribute to the median. Add a data-derived note listing drivers with zero recorded stops.
   - **Tyre degradation:** per-compound table with stint count, median stint length, degradation in seconds/lap and clean-lap sample count. Render `Not enough clean laps` when the slope is null.
   - Notes must state: compounds/stints from OpenF1, stop laps/durations from the official Jolpica rows, measured loss = in-lap + out-lap − 2 × clean-lap median, and clean laps exclude pit in/out and non-green running when race control is available.
5. **Baseline presentation.**
   - Summary cards: contributing sessions, seasons, driver-race samples, median stop count with observed min–max, typical measured pit loss with sample count.
   - Compound table: median stint length and median degradation per compound, with stint/sample counts.
   - A clear banner that this is historical evidence, not a live or predicted pit window.
   - Do not show per-driver current-session timeline, predicted stop laps, undercut/overcut claims, or a what-if calculator (T7/T6).
6. **Formatting and accessibility.**
   - Use `formatLapTime` for anything that is a lap time; use a local seconds formatter for pit durations/losses (no `+` unless the value is a delta).
   - All tables have captions; bars have accessible text via visible labels and titles; no information exists only in a hover tooltip. Tables scroll horizontally on narrow screens; timeline rows remain readable at 360 px.
   - Reuse `Panel`, `Empty`, `Loading`, `ErrorBlock`; no new dependency; no direct `api.openf1.org` fetch.
7. **No hardcoded values.** There must be no default pit loss, assumed stop count, standard stint length, fallback compound or fixed race length in this file. Missing values render as unavailable; every displayed number comes from `StrategyReport`/`StrategyBaseline` or the published allocation data.

## Done when
- `npx tsc --noEmit` and `npm run build` pass.
- For a completed race (e.g. 2024 Silverstone), the stint bars use actual compounds, the stop table includes published durations and measured losses, and the field median equals the median of the non-excluded measured losses.
- For 2024 Monaco, the first-lap red-flag stops are visibly excluded and absent from the field median.
- For an upcoming 2026 race with prior OpenF1 editions at the same circuit, the baseline shows the contributing session/season count and compound medians; for a venue with no prior session, the explicit empty state appears.
- No fallback timing/strategy number exists in the file; a grep for fixed decimal pit-loss values returns nothing.
- `StrategyPanel` is exported for slice 05 but `Race.tsx` is not modified here.
- Append `## Result` with the races used, values reconciled against OpenF1/Jolpica, and screenshots/DOM evidence at 360 px and 1440 px.

## Result
- 2024 Silverstone: 52 laps, 45 recorded stops, 0 neutralised, field median 36.95 s from 45 measured stops (matches `buildStrategyReport` run directly against the API); compounds Hard/Inter/Medium/Soft from OpenF1 stints; GAS listed with no stints.
- 2024 Monaco: 23 stops, 16 lap-1 red-flag stops shown as "Neutralised · excluded from median" with `—` loss; median 17.89 s from the 7 green stops.
- 2026 Mexico City (upcoming): baseline from 3 completed races (2023–2025), 60 driver-race samples, median 1 stop (observed 0–3), typical pit loss 23.16 s from 65 stops; compound medians shown with counts; historical-context banner shown.
- 2022 round 1: explicit "OpenF1 has no session data for this race".
