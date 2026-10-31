# 04/02 — Guide UI: channel key, lap story, chart and map markers

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01 · Parallel with: none

## Decisions you need
E1, E4, E5, E7, E8 — run `grep -E '^\| (E1|E4|E5|E7|E8) ' 00-README.md`.

## Read first
- `src/pages/Telemetry.tsx` — `TelemetryPanel`, `LapTrace`, selection state.
- `components/TelemetryChart.tsx` — layout constants, `cursor` state, `nearestByDistance`.
- `lib/telemetryInsights.ts` (01).
- `lib/staticData.ts` — `CIRCUITS`, `pointAt`, `outlinePath`; `components/TrackMap.tsx` for the outline drawing style.

## Scope (files you own)
- `components/TelemetryGuide.tsx` (new): `ChannelKey`, `LapStory`, `ReadingNote`, `LapEventMap`.
- `components/TelemetryChart.tsx`: optional props `annotations?: { zones; straights }`, `cursorIndex?: number`, `onCursorChange?`. Without them the chart renders exactly as now.
- `src/pages/Telemetry.tsx`: the `Explain this lap` toggle and wiring.

## Tasks
1. **Toggle (E1).** Checkbox with visible label in the `Driver and lap` panel; persisted to `localStorage` in try/catch.
2. **Insights.** In `LapTrace`, `useMemo(() => buildLapInsights(trace), [trace])` when the guide is on.
3. **Channel key (E4.1).** One line per channel with this lap's value: speed (top & average), throttle (full-throttle seconds and %), brake (braking seconds, %, zone count), gear (changes, highest gear), RPM (max). DRS line only when `hasDrsData` (E7).
4. **Lap story (E4.2).** Ordered list mixing braking zones and the three longest straights in lap order; each item is a `<button>` that sets the shared cursor to the event index. Sentence templates only interpolate insight values.
5. **Reading note (E4.3).** Short static guidance with no numbers.
6. **Chart markers (E5).** Numbered vertical ticks at zone starts on the speed strip, translucent bands for straights; driven by the `annotations` prop. Lift cursor state to `LapTrace` via `cursorIndex` / `onCursorChange` so the story and chart share it.
7. **Track map (E5).** `LapEventMap` draws the outline and numbered markers at `pointAt(outline, startDistanceM / trace.distanceM)`; caption states positions are derived from distance. Hidden when no outline.
8. **Missing states (E7).** No brake data → named sentence instead of the story.

## Done when
- `npm run build` passes; guide off = unchanged; guide on shows key, story, note, markers and map for 2024 Silverstone and 2024 Monaco laps; story buttons move the cursor; no console errors; readable at 360 px.
- Append `## Result` with screenshots/DOM evidence.
