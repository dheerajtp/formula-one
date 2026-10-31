# 05/04 — Race integration, deep links and Records links

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 02, 03 · Parallel with: none

## Decisions you need
L1, L3, L9 — run `grep -E '^\| (L1|L3|L9) ' 00-README.md`.

## Scope (files you own)
- `src/pages/Race.tsx`, `src/App.tsx`, `lib/router.ts`, `src/pages/Telemetry.tsx`, `src/pages/Records.tsx`

## Tasks
1. **Tabs.** `TABS = ["Result", "Qualifying", "Lap chart", "Fastest laps", "Pit stops", "Telemetry", "Strategy"]`; mount `RaceFastestLapsPanel` and `RacePitStopsPanel`.
2. **Routes.** Extend the plan 03 tab-segment pattern to `(telemetry|strategy|fastest-laps|pit-stops)`, add `[/^\/race\/(\d+)\/(\d+)\/telemetry\/([A-Za-z]{3})\/(\d+)\/?$/, "race", ["season","round","driver","lap"]]` mapping to the Telemetry tab; extend `RACE_TAB_SEGMENTS` in `App.tsx`.
3. **Telemetry preselect (L3).** `TelemetryPanel` accepts `initialDriverCode?` / `initialLap?`; initial selection uses them when they match a driver with that timed lap, else the existing default. Pass from `RacePage`.
4. **Records links (L9).** In `Records.tsx`, round rows link to `…/fastest-laps`; the transit footnote race link to `…/pit-stops`.
5. Nothing else on the Race page changes.

## Done when
- `npm run build` passes; all deep links open the right tab; `#/race/2024/12/telemetry/HAM/45` opens HAM lap 45; an unknown code falls back to the default; Records links land on the new tabs.
- Append `## Result`.
