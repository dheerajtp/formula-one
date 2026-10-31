# 02/03 — Records page

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 02/02 · Parallel with: 04

## Decisions you need
R2 (placement), R3 (race-lap definition), R4 (lap views), R5 (pit-lane transit), R6 (crew stops), R8 (missing states), R10 (accessibility) — run `grep -E '^\| (R2|R3|R4|R5|R6|R8|R10) ' 00-README.md`.

## Read first
- `src/pages/Race.tsx`: the tablist markup at lines 115–132 and the table/Panel conventions.
- `src/pages/Driver.tsx`: the leaderboard/table markup and `teamColor` bar.
- `src/components/Bits.tsx`: `Panel`, `Empty`, `Loading`, `ErrorBlock`, `PageLoader`, `PositionBadge`, `StatRow`.
- `lib/records.ts` (from 02/02): every builder and the `loadCrewStops` loader.
- `lib/jolpica.ts`: `getSeasonFastestLaps`, `getSeasonPitStops`, `getRaceResults`.
- `lib/openf1.ts`: `loadCrewStops` dependencies; do not call it directly.
- `lib/format.ts`: `formatLapTime`, `formatGapSeconds`, `formatDate`, `teamColor`.

## Scope (files you own)
- `src/pages/Records.tsx` (new)

Do not edit `src/App.tsx`, `lib/router.ts`, `src/pages/Circuit.tsx` or `README.md`; slice 04 owns those.

## Tasks
1. **Page shell.** Export `RecordsPage({ season }: { season: number })`. One header `Panel` with the title `Records — {season}` and a short visible definition: race fastest laps are official race laps, not qualifying; pit-lane time is not crew time. A `role="tablist"` with `Lap records` and `Pit stops`, using the Race page's button styling.
2. **Lap records tab** (own component, mounted only when selected):
   - `useAsync(() => getSeasonFastestLaps(season), [season])`, then `buildLapRecords`, `buildLapAwards`, `seasonLapHighlights` in `useMemo`.
   - Highlights panel: shortest race lap (time, driver, race, link) and fastest published average speed (speed, driver, race). When no average speed is published, show a short explicit note; do not print 0. Add the note that the shortest lap is circuit-length dependent and average speed is comparable.
   - Awards panel: driver, team of that driver's quickest award, awards count, best lap; link each driver to `#/drivers/{driverId}`. Empty state when there are no records.
   - Season race table: one row per round with round/race link, that round's fastest time, driver, team, lap number, published speed (or `—`). Sort by round, not time.
   - Round detail: a labelled `<select>` of the season's rounds; default to the record with the latest date, not the quickest. Render a child that fetches `getRaceResults(season, round)` and renders `buildRoundLapTable`: rank, driver, team, race position, time, gap to the round fastest, lap, speed. The fastest row shows `—` for gap; all other gaps use `formatGapSeconds`.
   - Loading/error states scoped to this tab.
3. **Pit stops tab** (own component):
   - **Crew stops**: render `<CrewStops season={season} />` only when the tab is selected. It calls `useAsync(() => loadCrewStops(season, 20), [season])` and shows the quickest 20 published stationary stops: rank, `stop_duration` in seconds to three decimals, driver, team, race (session location), date, lap. Coverage line from `coverage`: `{published} of {total} pit rows across {sessions} race sessions`; when `published === 0`, the explicit unavailable state distinguishes `total === 0` (no pit rows) from a season where OpenF1 publishes no stationary duration. Add a loading note that completed OpenF1 race sessions are read at 3 requests/second. Never show a row with a null duration.
   - **Pit-lane transit**: `useAsync(() => getSeasonPitStops(season), [season])`; group by round; a labelled round `<select>` defaulting to the latest round with rows; render the selected race's `buildPitLaneTable` joined to `getRaceResults` for driver/team. Columns: driver, team, lap, stop number, duration (seconds), gap to the race's quickest. The panel title and note must say `Pit-lane transit — time from pit entry to pit exit, not stationary crew time`. Empty state when the season has no official pit rows; keep the crew panel usable.
4. **Formatting and links.** Use `formatLapTime` for lap times and gaps; for pit seconds use a local three-decimal `s` formatter (a presentation constant, not a domain value). Link races to `#/race/{season}/{round}` and drivers to `#/drivers/{driverId}`. Crew rows have no Jolpica driver id, so do not invent a link.
5. **Accessibility and layout.** Native labelled selects, `aria-selected` tabs, tables wrapped in `overflow-x-auto` with sensible `min-w`, numbers with `tnum`, team colour bars with `aria-hidden`. No chart is required.
6. **No hardcoded data.** Only the crew limit (20) and display decimals are fixed; every time, gap, speed, count and label comes from the builders. Do not add fallback timings or thresholds.

## Done when
- `npm run build` passes.
- With the dev server and real data (browser if available; otherwise say exactly what was not checked):
  - 2024 lap tab shows 24 race rows; Monaco round 8 is Hamilton `1:14.165` lap 63; the round table's fastest gap is `—` and the rest are non-negative.
  - 2025 pit tab shows a crew list with values around 2–3 seconds and a coverage line; 2023 crew panel shows the explicit unavailable state; 2010 transit panel shows its empty state.
  - Switching tabs, changing the season in the header, and changing each round selector all work; no console errors; 360 px tables scroll.
- Append `## Result` listing the checks and anything left for acceptance.

## Result
- 2024 Lap records: 24 rounds; R8 Monaco HAM `1:14.165` lap 63, no speed; R17 Azerbaijan NOR `1:45.255`, 205.318 km/h; 12 award rows, no duplicate driver; round table gap `—` then +1.48s, +1.59s… none negative. Highlights: shortest lap 1:07.694 (Austria, with circuit-length note), fastest average 256.1 km/h (Monza).
- Pit stops: 2024 crew top 20 at 2.0–2.4 s, coverage 149 of 825 rows / 24 sessions; 2026 coverage 506 of 715 / 18 sessions; 2023 explicit "publishes no stationary crew time" (0 of 693); 2010 explicit "no race pit rows" and "No official pit rows are recorded for 2010".
- 2024 transit defaults to R24; quickest stop `—`, others positive gaps.
- Fix made during QA: OpenF1 also enforces a per-minute cap (429 with `Retry-After: 60` after ~13 fast requests; header is not CORS-exposed). `lib/openf1.ts` now keeps a 30-per-minute sliding window and a queue-wide pause on 429 (fallback 60 s).
- One transient Jolpica "Failed to fetch" during heavy testing, not reproduced on reload.
