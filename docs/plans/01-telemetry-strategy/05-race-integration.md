# 01/05 — Race page integration

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 03, 04 · Parallel with: none

## Decisions you need
T3 (tab set), T8 (keep race data visible while new views are unavailable), T11 (attribution) — run `grep -E '^\| (T3|T8|T11) ' 00-README.md`.

## Read first
- `src/pages/Race.tsx` — `TABS`, `RacePage`, `useRaceData`, `PitStopSection`, `TyreSection`, header allocation chips (`TYRES`, `compoundAppearance`) and `ResultTable`.
- `src/pages/Telemetry.tsx` (03) — `TelemetryPanel` props.
- `src/pages/Strategy.tsx` (04) — `StrategyPanel` props.
- `src/App.tsx` — footer attribution block.
- `README.md` — starter documentation to extend with the app's data sources.

## Scope (files you own)
- `src/pages/Race.tsx`
- `src/App.tsx`
- `README.md`

Do not edit `lib/*`, `components/*`, `src/pages/Telemetry.tsx` or `src/pages/Strategy.tsx`.

## Tasks
1. **Tabs.** Change `TABS` to `["Result", "Qualifying", "Lap chart", "Telemetry", "Strategy"]` and keep the `Tab` type derived from it. Do not add a route or nav item.
2. **Mount the panels.** Import `TelemetryPanel` from `./Telemetry` and `StrategyPanel` from `./Strategy`; render:
   - `tab === "Telemetry" && <TelemetryPanel season={season} round={round} race={race} />`
   - `tab === "Strategy" && <StrategyPanel season={season} round={round} race={race} />`
   Pass the already-loaded `race` object.
3. **Remove the superseded views.** Delete `PitStopSection` and `TyreSection` and their `tab` branches. Remove imports that become unused (`PitStop` type), but keep `getPitStops` for `ResultTable` and `TYRES`/`compoundAppearance` for the header chips. Simplify `useRaceData` to fetch only what `LapSection` still uses (`getRaceResults` + `getLapsByDriver`) so the removed tabs do not leave a dead pit-stop request.
4. **Attribution.** In the footer, replace the claim that telemetry is omitted because no free feed exists with:
   - Session telemetry and tyre compounds come from [OpenF1](https://openf1.org/) for completed sessions.
   - Real-time telemetry is not included because OpenF1 live access is a paid service; the Race page shows published session data only.
   - Keep the Jolpica, circuit-geometry and allocation credits. Use the existing link styling.
5. **README.** Add a short `## Data sources` section after the develop/publish content (or another suitable top-level spot) naming Jolpica, OpenF1 (completed sessions only; live is paid), bacinger/f1-circuits and the static tyre allocations. Do not rewrite the starter instructions or add product documentation beyond what is needed for attribution.
6. **Keep old behaviour.** `Result`, `Qualifying` and `Lap chart` must render exactly as before; the header tyre allocation chips and the Race replay/Qualifying links stay. Do not rename routes or change `RacePage` props.

## Done when
- `npx tsc --noEmit` and `npm run build` pass.
- `#/race/2024/12` (or another completed race) shows the five tabs; Telemetry and Strategy render their panels; Result and Lap chart still work.
- `#/race/2022/1` keeps the race result visible and the new tabs show their explicit unavailable/baseline states rather than crashing.
- No unused imports/variables remain; no new route or nav item exists.
- Footer and README name OpenF1 and state the live limitation.
- Append `## Result` with the checked race URLs and the typecheck/build output.

## Result
- Tabs: Result | Qualifying | Lap chart | Telemetry | Strategy. `PitStopSection`/`TyreSection` removed; `useRaceData` now fetches results + laps only.
- Footer credits OpenF1 and states the paid-live limitation; README has `## Data sources`.
- Checked `#/race/2024/12`, `#/race/2024/8`, `#/race/2022/1`, `#/race/2026/19`. `tsc` and `npm run build` pass; `dist/` refreshed.
