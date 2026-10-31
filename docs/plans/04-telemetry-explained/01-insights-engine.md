# 04/01 — Lap insights engine

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: plan 01 complete · Parallel with: none

## Decisions you need
E2, E3, E6 (delta maths), E9 — run `grep -E '^\| (E2|E3|E6|E9) ' 00-README.md`.

## Read first
- `lib/telemetry.ts` — `TelemetryPoint`, `TelemetryTrace`, `buildTelemetryTrace`, `nearestPointIndex`.
- `lib/openf1.ts` — `OpenF1CarData` comment on `drs`.

## Scope (files you own)
- `lib/telemetryInsights.ts` (new)

## Tasks
1. **Types.** `BrakingZone { id: "B1"…; startIndex; minIndex; endIndex; startDistanceM; entrySpeedKph; minSpeedKph; speedLostKph; brakingS; gearAtMin }`, `Straight { id: "S1"…; startDistanceM; endDistanceM; lengthM; durationS; exitSpeedKph }`, `LapShares { fullThrottlePct; brakingPct; coastingPct }`, `LapInsights { zones; straights; shares; topSpeed: { index; distanceM; speedKph }; hasBrakeData; hasDrsData }`.
2. **`buildLapInsights(trace)`** per E2/E3: brake runs (`brakePct > 0`), corner span to next `throttlePct >= 100`, full-throttle runs. Straights sorted by lap order; expose all, the UI picks the longest. `coastingPct` = interval time with throttle < 100 and brake = 0, divided by `trace.durationS`. Shares use the same leading-sample interval rule as `buildTelemetryTrace`.
3. **`buildLapDelta(base, compare)`** for E6: normalise each trace's distance to 0..1 by its own `distanceM`, sample at the base trace's normalised points, linearly interpolate `timeS` in the compare trace, return `{ fraction, distanceM, deltaS }[]` where `deltaS = compareTime − baseTime`. Return `null` when either trace has < 2 points.
4. **`matchZones(baseZones, compareZones, baseTrace, compareTrace)`**: pair zones whose normalised start distances are nearest without reuse; report `brakeLaterM` (compare start − base start in base metres), `minSpeedDiffKph`. Unpaired zones are returned as unpaired, not forced.
5. Pure functions only; no React, no formatting, no fetch. Only the 0/100 pedal scale is fixed.

## Done when
- `npm run build` passes.
- On 2024 Silverstone HAM lap 45 (from plan 01's harness): zones are in increasing distance, each `minSpeedKph <= entrySpeedKph`, shares sum to ≤ 100 % (the remainder is partial throttle while braking-free and is reported, not hidden).
- Delta of HAM lap 45 vs SAI lap 52 ends within one sample interval of the lap-duration difference.
- Append `## Result` with the zone list for that lap.
