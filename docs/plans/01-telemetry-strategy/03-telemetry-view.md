# 01/03 — Telemetry view (whole session)

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01, 02 · Parallel with: 04

## Decisions you need
T3 (tab content), T4 (session navigation, lazy per-lap car data, trace), T8 (missing states), T9 (no domain values), T11 (accessibility) — run `grep -E '^\| (T3|T4|T8|T9|T11) ' 00-README.md`.

## Read first
- `lib/openf1.ts` (01) — `resolveRaceSession`, `getSessionDrivers`, `getSessionLaps`, `getCarData`, types.
- `lib/telemetry.ts` (02) — `buildTelemetryTrace`, `TelemetryTrace`, `nearestPointIndex`.
- `lib/jolpica.ts` — `getRaceResults`, `Race`, `formatLapTime`.
- `src/pages/Race.tsx` — `RacePage`, `LapSection`, `PositionChart` (plain-SVG chart style).
- `src/pages/Replay.tsx` — speed/selection state and `TrackMap` usage for interaction patterns.
- `components/Bits.tsx` — `Panel`, `Loading`, `PageLoader`, `ErrorBlock`, `Empty`, `StatRow`.
- `lib/staticData.ts` — `CIRCUITS`, `CircuitOutline`.
- `lib/colors.ts` — `teamColor`.

## Scope (files you own)
- `components/TelemetryChart.tsx` (new)
- `src/pages/Telemetry.tsx` (new; export `TelemetryPanel({ season, round, race })`)

Do not edit `src/pages/Race.tsx`, `src/App.tsx` or `lib/*`.

## Tasks
1. **`TelemetryPanel` data flow.**
   - One `useAsync` resolves `resolveRaceSession(season, race)`, then `Promise.all` over `getSessionDrivers`, `getSessionLaps`, `getRaceResults(season, round)`. Return `{ resolved, drivers, laps, results }`.
   - `loading` → `Loading` inside a `Panel`; `error` → `ErrorBlock`; no resolved session → `Empty` stating that OpenF1 has no session data for this race (T8).
   - Timed laps = `lap_duration` finite. No timed laps → `Empty`: the session is not final / telemetry appears after the session is published. Never render an empty chart.
   - Build a per-driver `laps` map, sorted by lap number. Show only drivers with at least one timed lap.
2. **Selection.**
   - Driver options are sorted by classified position from `results` when the driver codes match (`Driver.code` = `name_acronym`), else by code.
   - Default driver = classified winner matched by code, else the first option with timed laps.
   - Default lap = the selected driver's fastest timed lap (`min lap_duration`). On driver change, select that driver's fastest lap.
   - Provide labelled `<select>` controls for driver and lap, plus previous/next-lap `<button>`s that move through that driver's timed laps in order and disable at the ends.
   - Every selector has a visible label; do not rely on placeholder text alone.
3. **Lap car data.**
   - Fetch only the selected driver/lap: end = `new Date(Date.parse(lap.date_start) + lap.lap_duration * 1000).toISOString()`; call `getCarData(sessionKey, driverNumber, lap.date_start, end)`. Dependencies are session key, driver number and lap number. Never fetch the grid or whole session.
   - Build the trace with `buildTelemetryTrace(samples, lap, CIRCUITS.get(race.Circuit.circuitId)?.outline.length ?? null)`.
   - Empty samples / null trace → `Empty` naming that this lap has no car data. Loading → `Loading`; error → `ErrorBlock`.
4. **Summary and chart.**
   - Summary cards/rows: max speed, average speed, time at full throttle, time braking, gear changes, sample count. All values come from the trace; format times as seconds with one decimal and speeds as integers.
   - Render `TelemetryChart` in a `Panel` titled with the driver/lap. It shows speed (km/h), throttle and brake (0–100), and gear + RPM against distance. It includes a legend and a readable note: distance is integrated from the car's speed and scaled to the recorded lap length when one is known.
   - Do not add a prediction, ideal lap, or reference driver.
5. **Session fastest laps.**
   - Add a `Panel` table with every driver that has a timed lap: grid/position when available, code, team, fastest lap time, lap number, speed trap when present.
   - A row's driver button sets that driver and their fastest lap. Sort by position when available, else by fastest lap.
   - The table is session-wide and is the "whole session" navigation surface; it must not cap the number of drivers and must not require loading every car-data stream.
6. **`TelemetryChart` component.**
   - Props: `{ trace, label, color }`. Plain SVG, no chart dependency. ViewBox width/height are presentation constants; x domain is `0..trace.distanceM`; speed/gear/RPM domains are derived from the trace; pedal domain is the API's 0–100 scale.
   - Draw a shared x-axis with distance ticks, stacked strips for speed, pedals and gear/RPM, and a legend. Use the passed team colour for the driver accent.
   - Add pointer hover (nearest point by distance) and keyboard Left/Right cursor movement with a vertical guide and a readout of time, speed, throttle, brake, gear and RPM. `role="img"` plus a descriptive `aria-label`; a visible text summary is always present so the chart is not the only source of information.
   - Handle empty/one-point traces without dividing by zero; the parent already blocks null traces, but the component must not crash.
7. **Responsive layout.** Controls wrap on narrow screens; the session table scrolls horizontally; the chart keeps its aspect ratio; the panel is usable at 360 px.

## Done when
- `npx tsc --noEmit` and `npm run build` pass.
- For a completed 2024/2026 race, the panel lists all drivers with timed laps, changing driver changes the lap options, changing lap changes the chart, and prev/next stay inside that driver's timed laps.
- The selected lap produces exactly one `/car_data` request for that driver/window; no requests contain a whole-session car-data query.
- Switching to a future/unpublished race shows the explicit unavailable state, not a chart with zeroes.
- No numeric lap times, lap counts or speed values are present in the component source; summary values come from `TelemetryTrace`.
- `TelemetryPanel` is exported for slice 05 but `Race.tsx` is not modified here.
- Append `## Result` with the race/lap used, sample counts and screenshots or DOM evidence at 360 px and 1440 px.

## Result
- `npx tsc --noEmit` and `npm run build` pass.
- 2024 Silverstone (`#/race/2024/12`): 19 drivers with timed laps listed (GAS did not start); default HAM (P1) lap 45, his fastest, 1:29.438; trace 339 samples, top 305 km/h, avg 238 km/h, distance axis ends at 5.891 km. Next lap → lap 46.
- 2024 Monaco: each lap selection issued exactly one `/car_data` request bounded to that lap's window; no whole-session query, no 422.
- 2022 round 1: "OpenF1 has no session data for this race". 2026 round 19 (Mexico City, not yet run): "This session is not final".
- Headless Chrome screenshots at 1440 px and 360 px; panels fit, session table scrolls horizontally; no console errors.
