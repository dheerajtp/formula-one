# 01 — Telemetry and pit strategy

Master plan: [`../../PLAN.md`](../../PLAN.md) · Builds on the existing Race tabs, lap sheet, circuit geometry and tyre allocation data · Used by: [02 — Best laps and pit stops](../02-best-laps-pit-stops/00-README.md) (reuses the OpenF1 client)

## Goal
- Show what the car actually did in a session: speed, throttle, brake, gear and RPM for any driver and lap, navigable across the whole session.
- Show pit strategy as measured evidence: real stints and compounds, stop laps, stop durations, measured time lost in the pit sequence, and tyre degradation.
- Make the same evidence useful before lights out: an upcoming race shows a baseline built from every completed OpenF1 race at that circuit, plus the current compound allocation when it has been published.
- Never invent a number. Live telemetry is not in this plan.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| T1 | **Sources.** OpenF1 (`https://api.openf1.org/v1`, CORS `*`, no key for completed sessions) supplies car data, laps, stints, pit timestamps, race-control messages, drivers and meetings. Jolpica supplies race classification, official pit-stop rows, the calendar and circuit history. Existing `data/*.json` supplies track geometry and published compound allocations. No new npm dependency. |
| T2 | **Live is out of scope.** OpenF1 real-time telemetry requires a paid subscription and a credential; a static browser bundle cannot protect that credential. V1 reads only completed sessions. The client seam in `lib/openf1.ts` must make a future server-side Function proxy possible, but no live code or key is added now. Every telemetry pane states when a session is not final. |
| T3 | **Placement.** The views live on the existing Race page (`src/pages/Race.tsx`, route `#/race/{season}/{round}`): add a `Telemetry` tab and replace the old `Pit stops` and `Tyres` tabs with one `Strategy` tab. Keep `Result`, `Qualifying` and `Lap chart`. No new route, no top-nav item. |
| T4 | **Telemetry scope.** "Whole session" means the session is browsable end to end: all drivers and all timed laps, a fastest-lap table across the field, driver and lap selectors, and previous/next-lap navigation. Car data is fetched lazily for one selected driver and lap at a time using `date>=` / `date<=`; never the whole grid. Default driver is the classified winner matched by driver code, else the first driver with laps; default lap is that driver's fastest timed lap. Channels are speed, throttle, brake, gear and RPM. The distance axis is the cumulative integral of speed over sample time, scaled once to the recorded lap length when `CIRCUITS` has one; the trace note states that it is derived from speed, not GPS. |
| T5 | **Session mapping.** Season meetings: `GET /v1/meetings?year={season}`; match the Jolpica race to the meeting whose date interval contains the race date, falling back to nearest date plus normalised meeting/race name. Current session: `GET /v1/sessions?meeting_key={meeting_key}&session_type=Race`. Prior editions at a venue: `GET /v1/sessions?circuit_key={circuit_key}&session_type=Race`. Completed means the session has at least one timed lap; future or unpublished sessions have none. No coverage year is hardcoded. |
| T6 | **Strategy math.** Stints and compounds come from `/v1/stints`; stop laps and stop counts from the official Jolpica pit rows; driver identity joins on Jolpica `Driver.code` = OpenF1 `name_acronym`. Stop timestamps and race-control state come from OpenF1. `cleanLap` = a timed lap that is not `is_pit_out_lap`, is not a stop in-lap or out-lap, and starts while the session is green (track-scope green/clear, no red/SC/VSC) when race control is available. Driver baseline = median clean lap. Measured pit loss for a stop = in-lap + out-lap − 2 × driver baseline, null if either lap is missing or not clean; field benchmark = median of those measured losses. Degradation = least-squares slope of lap time against tyre age for each stint with at least two clean laps, aggregated by compound as a median. No assumed pit loss, lap count, stop count, tyre life or ideal strategy. |
| T7 | **Upcoming-race baseline.** A race with no completed session shows `Strategy baseline`: aggregate medians over every completed OpenF1 race session at the same `circuit_key` before this race, for stop count, measured pit loss, stint length and degradation by compound. Show how many sessions/seasons contributed. Show the current allocation from `TYRES` only when present. Label it as historical context, never as a prediction of this race. No historical value is presented as a current-session value. |
| T8 | **Missing data is explicit.** The UI must name what is missing: no OpenF1 meeting/session for this race, session not final, no prior OpenF1 sessions at this circuit, or no car data for the selected lap. Keep the Jolpica race classification visible. Never render zero, an assumed compound, or an assumed duration as a substitute. |
| T9 | **No hardcoded domain values.** Every displayed lap, time, duration, gap, compound, stop count, pit loss and degradation value is read from `lib/openf1.ts`, `lib/jolpica.ts`, `data/*.json`, or computed in `lib/telemetry.ts` / `lib/strategy.ts`. Fixed numbers are limited to presentation and protocol concerns (SVG viewBox and stroke widths, chart tick layout, OpenF1's published request rate, the mathematical minimum of two points for a slope). Components must not contain fallback timings or magic strategy thresholds. |
| T10 | **Request discipline.** One serialized OpenF1 queue capped at the published free-tier rate (3 requests/second) with `Retry-After` support on 429 and retry on 5xx. Cache immutable responses in memory by full URL; persist only season meetings and session metadata in sessionStorage. Never cache a future/empty session. Reuse `useAsync` for component state; do not add a data-fetching library. |
| T11 | **Attribution and accessibility.** Footer and README credit OpenF1 alongside Jolpica. Selectors are native controls with labels; charts expose a text summary and meaningful `aria-label`; layouts hold at 360 px, 768 px and 1440 px. |

## Status
- [x] 01 — OpenF1 client and session mapping
- [x] 02 — Telemetry and strategy analysis
- [x] 03 — Telemetry view (whole session)
- [x] 04 — Strategy view (actual and upcoming baseline)
- [x] 05 — Race page integration
- [x] 06 — Acceptance QA

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | — | Sonnet | `lib/openf1.ts` |
| 02 | 01 | — | Sonnet | `lib/telemetry.ts`, `lib/strategy.ts` |
| 03 | 01, 02 | 04 | Sonnet | `components/TelemetryChart.tsx`, `src/pages/Telemetry.tsx` |
| 04 | 01, 02 | 03 | Sonnet | `src/pages/Strategy.tsx` |
| 05 | 03, 04 | — | Haiku | `src/pages/Race.tsx`, `src/App.tsx`, `README.md` |
| 06 | 05 | — | Opus | none (verification only) |

**Rules for every slice:** all OpenF1 access goes through `lib/openf1.ts` (pages and components never call `api.openf1.org` directly); all timing/strategy math lives in `lib/telemetry.ts` or `lib/strategy.ts` as pure functions; UI components only format and render; reuse `useAsync`, `Panel`, `Empty`, `Loading`, `ErrorBlock`, `CIRCUITS`, `COMPOUND_STYLE`, `teamColor`, `formatLapTime`, `formatDistance`, `formatInterval`; do not add routes, nav items or dependencies; no committed changes; finish with root typecheck, production build and browser QA against real API data; append `## Result`.

## Acceptance checklist
- [x] Race page shows `Telemetry` and `Strategy`; `Pit stops` and `Tyres` are gone; `Result`, `Qualifying` and `Lap chart` behave as before.
- [x] A completed race (2024 or later) loads telemetry for a selected driver/lap and reloads correctly when either changes; the session table covers every driver with a timed lap.
- [x] Telemetry summary values reconcile with the plotted sample data; the distance axis ends at the recorded lap length when one exists, and the derived-distance note is visible.
- [x] Strategy shows real compounds, stint ranges, stop count, published stop durations, per-stop measured loss, the field median and per-compound degradation; every value is traceable to OpenF1/Jolpica data.
- [x] Red-flag/SC running is excluded from clean-lap math; the 2024 Monaco red-flag stop does not appear as a normal pit loss.
- [x] An upcoming race shows the historical baseline with its contributing-session count, or an explicit unavailable state when no prior session exists; no current-session numbers are fabricated.
- [x] A pre-2023 race and an unpublished session show explicit unavailable states; no empty chart, zero-filled table or assumed compound.
- [x] No direct OpenF1 fetches outside `lib/openf1.ts`; no domain constants in components; no new dependency.
- [x] (new panels; the pre-existing top nav overflows to 451 px at 360 px on every page — outside this plan) Layouts hold at 360 px, 768 px and 1440 px; selectors are keyboard operable; charts have accessible text; no runtime console errors.
- [x] `npm run build` passes and `dist/` is refreshed; OpenF1 is credited in the footer and README.
