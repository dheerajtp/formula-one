# 02/04 — Navigation and circuit record

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 02/01, 02/02 · Parallel with: 03

## Decisions you need
R2 (placement), R3 (circuit race-lap definition), R10 (attribution) — run `grep -E '^\| (R2|R3|R10) ' 00-README.md`.

## Read first
- `lib/router.ts`: the `Route["name"]` union, `PATTERNS`, `parse`.
- `src/App.tsx`: `NAV`, the route render block, `isActive`, and the footer paragraphs.
- `src/pages/Circuit.tsx`: the hooks at the top of `CircuitPage`, the header `Panel`, the `Stat` helper and the `WinnersPanel` table style. Note that all hooks must run before the existing early returns.
- `lib/jolpica.ts`: `getCircuitFastestLaps`, `RaceFastestLap`.
- `lib/records.ts`: `buildLapRecords`, `LapRecord`.
- `lib/format.ts`: `formatLapTime`, `formatDate`.

## Scope (files you own)
- `lib/router.ts`
- `src/App.tsx`
- `src/pages/Circuit.tsx`
- `README.md`

Do not edit `src/pages/Records.tsx`; slice 03 owns it.

## Tasks
1. **Route.** Add `"records"` to the `Route["name"]` union and `[/^\/records\/?$/, "records", []]` to `PATTERNS`. `isActive` already maps an unknown section name to `#/<name>`, so no extra branch is needed.
2. **Navigation.** Import `RecordsPage` from `./pages/Records`; add `{ href: "#/records", label: "Records" }` to `NAV` between `Circuits` and `Drivers`; render `{route.name === "records" && <RecordsPage season={season} />}` in the route block.
3. **Circuit fastest lap.** In `CircuitPage`, add `const lapRecords = useAsync(() => getCircuitFastestLaps(circuitId), [circuitId]);` with the other hooks and `const fastestLaps = useMemo(() => buildLapRecords(lapRecords.data ?? []), [lapRecords.data]);`.
   - Render a `Fastest race lap here` panel directly after the header panel and before the winners block, with its own loading/error/empty states.
   - Content: the quickest record as a headline (time, driver link, team, season, race date) and the next four rows in a compact table (season, driver, team, time). Show `{fastestLaps.length} recorded editions` in the panel note.
   - The note must say this is the fastest **race** lap recorded by the feed, that qualifying laps are not included, and that feed coverage is not continuous. Use `formatLapTime` and `formatDate`.
   - Do not add a chart.
4. **README.** Add a `## Records` section before `## Optional Function` covering: the `#/records` route and its two tabs; the race-fastest-lap definition and the circuit panel; `Pit-lane transit` (entry-to-exit, not crew stationary time) versus `Crew stops` (OpenF1 `stop_duration` where published, with coverage stated); and the data sources Jolpica and OpenF1. Keep it short and factual, no plan numbers.
5. **Attribution.** Ensure the footer/README credit OpenF1 for completed-session pit data. Plan 01 may already have added the credit; if so, leave it untouched. Do not duplicate the sentence.
6. **No hardcoded data.** The five-edition limit is presentation; all times/seasons/counts come from the builders. No source edit outside this scope.

## Done when
- `npm run build` passes.
- `#/records` opens from the nav and the nav item is active; the season selector still drives the page; `#/circuits/monaco` shows the quickest Monaco race lap and `24 recorded editions`, and an unknown/new circuit with no rows shows the empty state.
- README has the `## Records` section and OpenF1 is credited once.
- Append `## Result` with the checks.

## Result
- `#/records` route + `Records` nav item (active state confirmed) between Circuits and Drivers; season selector drives the page.
- `#/circuits/monaco`: headline HAM `1:12.909` (2021), next four rows, note "22 recorded editions" (feed has no FastestLap for 1958/1959 — see 01 Result).
- README `## Records` added; footer OpenF1 credit extended to cover stationary pit-stop times (not duplicated).
