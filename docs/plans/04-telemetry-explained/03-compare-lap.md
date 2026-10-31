# 04/03 — Compare with another lap

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01, 02 · Parallel with: none

## Decisions you need
E6, E7, E9 — run `grep -E '^\| (E6|E7|E9) ' 00-README.md`.

## Read first
- `src/pages/Telemetry.tsx` after 02, `components/TelemetryChart.tsx` after 02, `lib/telemetryInsights.ts` (`buildLapDelta`, `matchZones`).

## Scope (files you own)
- `src/pages/Telemetry.tsx`, `components/TelemetryChart.tsx`, `components/TelemetryGuide.tsx`

## Tasks
1. **Selector.** `Compare with` select: `None` (default), `Session fastest lap` (resolved from the existing session table), then any driver → that driver's fastest lap, then a second select for a specific lap of that driver. Available whether or not the guide is on.
2. **Fetch.** A second `useAsync` keyed by compare driver/lap/session, calling `getCarData` with the compare lap's window and `buildTelemetryTrace`; nothing runs when `None`.
3. **Chart.** `compare?: { trace; color; label }` prop: muted overlay on the speed strip and a new `Delta` strip (seconds, zero line, + = compare slower) from `buildLapDelta`. Legend and `aria-label` mention the comparison.
4. **Story.** With the guide on, append per-zone comparisons from `matchZones` ("vs VER: brakes 12 m later, 6 km/h more minimum speed"). Unpaired zones say so.
5. **States (E7).** Compare lap loading/error/no-data states appear inline without hiding the primary lap.

## Done when
- `npm run build` passes; selecting `Session fastest lap` issues one extra `/car_data` request; delta end ≈ lap-time difference; `None` removes overlay and fetches nothing.
- Append `## Result`.
