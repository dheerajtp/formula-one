# 04 — Telemetry explained

Master plan: [`../../PLAN.md`](../../PLAN.md) · Builds on: [01 — Telemetry and pit strategy](../01-telemetry-strategy/00-README.md) (`TelemetryPanel`, `TelemetryChart`, `buildTelemetryTrace`) · Used by: none

## Goal
- Help someone who has never read a telemetry trace understand what the selected lap shows: what each line means, where the driver braked and how hard, where the corners and straights are, and how this lap compares with another.
- Every explanation is written from the lap's own numbers ("braked from 296 to 87 km/h over 2.1 s"), never generic filler and never an invented value.
- Keep the existing Telemetry tab working exactly as it does for people who do not want the guide.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| E1 | **Placement.** Everything lives inside the existing Race → Telemetry tab (`#/race/{season}/{round}/telemetry`). A labelled `Explain this lap` switch (native checkbox styled as a toggle) in the `Driver and lap` panel turns the guide on; the choice is remembered in `localStorage` (`f1-telemetry-explain`), wrapped in try/catch. Off = today's view, unchanged. No new route or nav item. |
| E2 | **Lap events are detected from the data, not thresholds.** New pure module `lib/telemetryInsights.ts`. A *braking zone* is a maximal run of consecutive points with `brakePct > 0`. Its *corner* runs from the zone start to the first later point with `throttlePct >= 100` (the API's full-throttle scale) or the lap end; the corner's *minimum speed* and *gear at minimum* are read from the points in that span. A *full-throttle stretch* is a maximal run with `throttlePct >= 100`. Top speed is the max-speed point. No tuned speed, distance or duration threshold is introduced; the only fixed numbers are the API's 0/100 pedal scale. |
| E3 | **What each event reports.** Braking zone: start distance, entry speed, minimum speed, speed lost, braking time, gear at minimum. Straight: start/end distance, length, time, speed at exit. Lap shares: % of lap time at full throttle, % braking, % coasting (neither pedal), all from `TelemetryTrace` sums. Events are numbered in lap order (`B1`, `B2`, … and `S1`, …). |
| E4 | **Plain-language guide.** When on, show three things under the chart: (1) a **channel key** — one sentence per line explaining speed, throttle, brake, gear and RPM, each sentence completed with this lap's value (e.g. "Throttle: 0–100 % pedal. This lap was flat out for 57.5 s, 64 % of the lap."); (2) a **lap story** — a numbered list of braking zones and longest straights in order, each a single sentence built from E3 values; (3) a short **how to read the chart** note (x-axis is distance, lines dip into corners, brake spikes mark braking points). All copy is templated from data; no static sentence contains a number. |
| E5 | **Chart and map annotations.** With the guide on, the chart draws numbered markers at each braking-zone start and shades full-throttle stretches; hovering or focusing a lap-story item moves the chart cursor to that event (reusing the existing cursor/readout). When `CIRCUITS` has an outline, a small `TrackMap`-style SVG places the numbered markers on the circuit using `pointAt(outline, distanceM / trace.distanceM)`; the note says positions are derived from distance, not GPS (same caveat as plan 01 T4). |
| E6 | **Compare with another lap.** An optional `Compare with` selector (default: none; quick option "Session fastest lap") loads a second lap through the same `getCarData` path — at most one extra `/car_data` request per change. The second trace is overlaid in a muted colour on the speed strip, and a `Delta` strip shows cumulative time difference against distance, computed in `lib/telemetryInsights.ts` by interpolating each trace's `timeS` at shared distance points (distance-normalised to each lap's own length). The lap story adds per-zone comparisons ("brakes 12 m later, carries 6 km/h more minimum speed"). Without a comparison selected, nothing extra is fetched. |
| E7 | **Missing data is explicit.** No brake samples → "This lap has no braking data in the feed" (no empty story). Compare lap without car data → named state, primary lap still shown. DRS is explained only when the lap's samples contain non-zero values, using the feed's published code meanings; otherwise it is omitted (2026 cars run active aero, so the channel may carry nothing). |
| E8 | **Accessibility.** The lap story is a real ordered list with buttons, keyboard reachable; markers have `aria-label`s; the guide is visible text, never tooltip-only; layout holds at 360 / 768 / 1440 px. |
| E9 | **Request discipline and purity.** Insights are pure functions of `TelemetryTrace` (and an optional second trace); no fetching in `lib/telemetryInsights.ts`. OpenF1 access stays in `lib/openf1.ts`. No new dependency. |

## Status
- [x] 01 — Lap insights engine
- [x] 02 — Guide UI: channel key, lap story, chart and map markers
- [x] 03 — Compare with another lap
- [ ] 04 — Acceptance QA

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | plan 01 complete | — | Sonnet | `lib/telemetryInsights.ts` (new) |
| 02 | 01 | — | Sonnet | `src/pages/Telemetry.tsx`, `components/TelemetryChart.tsx`, `components/TelemetryGuide.tsx` (new) |
| 03 | 01, 02 | — | Sonnet | `src/pages/Telemetry.tsx`, `components/TelemetryChart.tsx`, `lib/telemetryInsights.ts` |
| 04 | 03 | — | Opus | none (verification only) |

**Rules for every slice:** maths only in `lib/telemetryInsights.ts` / `lib/telemetry.ts`; components format and render; reuse `Panel`, `Empty`, `Loading`, `ErrorBlock`, `formatLapTime`, `pointAt`, `CIRCUITS`; no new dependency; no commits; finish with `npm run build` and append `## Result`.

## Acceptance checklist
- [ ] With the guide off, the Telemetry tab is visually and behaviourally unchanged.
- [ ] With the guide on for 2024 Silverstone HAM lap 45, the channel key, lap story and markers appear; every number in them reconciles with the trace (spot-check three braking zones against the sample rows).
- [ ] Lap story items move the chart cursor; markers appear on the chart and, where an outline exists, on the track map.
- [ ] Comparing with the session fastest lap issues exactly one extra `/car_data` request and draws the overlay and delta strip; the delta at lap end equals the difference of the two lap durations within one sample interval.
- [ ] A lap with no brake data and a compare lap with no car data show their named states.
- [ ] No sentence template contains a hardcoded number; only the API's 0/100 pedal scale is fixed in the engine.
- [ ] `npm run build` passes, `dist/` refreshed, no console errors, layout holds at 360 / 768 / 1440 px.
