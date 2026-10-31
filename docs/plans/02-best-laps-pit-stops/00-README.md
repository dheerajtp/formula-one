# 02 — Best laps and pit stops

Master plan: [`../../PLAN.md`](../../PLAN.md) · Builds on: [01 — Telemetry and pit strategy](../01-telemetry-strategy/00-README.md) · Used by: none

## Goal
- Give the season a records view: every round's official fastest race lap, a per-race fastest-lap table with gaps, and a fastest-lap awards leaderboard.
- Show the quickest published stationary crew stops of a season where OpenF1 publishes them, and race-by-race pit-lane transit times with a definition that cannot be mistaken for a crew stop.
- Put a circuit's fastest recorded race lap on its profile.
- Never present a missing duration as zero, never call pit-lane time a crew stop, and never compare lap times across circuits as if the difference were pace.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| R1 | **Sources.** Jolpica supplies official race fastest laps (`GET /{season}/fastest/1/results.json`, one row per round), race results, pit-stop rows (`GET /{season}/{round}/pitstops.json`) and the calendar. OpenF1, through the plan 01 client, supplies stationary crew times (`/v1/pit`, `stop_duration`) and race-session metadata (`/v1/sessions?year=`). Existing `data/*.json` supplies track geometry only. No new dependency. |
| R2 | **Placement.** A new page at `#/records` (route name `records`) with two tabs, `Lap records` and `Pit stops`; a `Records` item in the top navigation between `Circuits` and `Drivers`; and a `Fastest race lap here` panel on `#/circuits/{circuitId}`. The Race page is not changed in this plan; plan 01 owns it. |
| R3 | **Lap record definition.** A lap record is the official **race** fastest lap: the result row whose `FastestLap.rank` is `1`, with its `FastestLap.Time.time`, `lap` and optional `AverageSpeed`. Qualifying and practice laps are out of scope; the page says so and links to the existing Qualifying tab. A circuit's panel shows every race edition the feed records a fastest lap for, and states how many editions that is; it never claims continuity across seasons the feed omits. |
| R4 | **Lap views.** `Lap records` shows: (a) two season highlights, the shortest race lap and the fastest published average speed; (b) a fastest-lap awards leaderboard by driver, counted from the same rows; (c) one row per round with that round's fastest lap, driver, team, circuit, lap number and published speed; (d) a selected-round table of every classified driver's official fastest lap, sorted by time, with the gap to that round's fastest. Race times are not ranked across circuits as a pace order. The shortest-lap highlight carries a note that circuit length drives it; average speed is the comparable figure and is shown only where the feed publishes it. |
| R5 | **Pit-lane transit.** Jolpica's `PitStop.duration` is the published pit-lane time from entry to exit, **not** the stationary crew time. Every transit figure is labelled `Pit-lane transit` and carries that definition. Transit is shown within one race only, sorted by duration with the gap to that race's quickest stop, because pit-lane length differs by circuit. Do not use OpenF1 `lane_duration` for this figure; use the official Jolpica duration. |
| R6 | **Crew stops.** A crew stop is OpenF1 `stop_duration` in seconds, included only when it is a finite number. The season leaderboard is the quickest 20 published crew stops, comparable across circuits. It shows coverage (`n` published of `m` race pit rows across `k` sessions), derived from the fetched rows. When a season publishes none, the panel says so explicitly. Never substitute `lane_duration`, never treat null as zero, never impute a stop. |
| R7 | **Data acquisition.** Fastest laps: `GET /{season}/fastest/1/results.json?limit=100`, paginated if the total exceeds a page, mapped to one row per race. Pit-lane rows: one request per completed round (the season-wide pitstops URL is rejected by the feed), four in flight, retried. Crew stops: `GET /v1/sessions?year={season}` filtered to `session_name === "Race"`, then `/v1/pit?session_key=` for each completed race session, then `/v1/drivers?session_key=` only for the sessions that appear in the quickest 20 (the per-year driver and pit URLs are 404). Season race sessions, session pit rows and session drivers are persisted in `sessionStorage` because completed sessions are immutable; season fastest laps and pit rows stay in memory. No coverage year is hardcoded. |
| R8 | **Missing data is explicit.** Name the missing thing: no fastest-lap rows for the season, results not yet published for the selected round, no official pit rows for the season, no published stationary crew times, or an OpenF1 request that failed. Keep the other tab usable. Never render a zero, a placeholder duration or an assumed team to fill a gap. |
| R9 | **No hardcoded domain values.** Every lap, gap, duration, speed, coverage count and award count is read from an API row or computed in `lib/records.ts`. Fixed numbers are limited to presentation and protocol concerns: the quickest-20 crew list, the five circuit editions shown, table page sizes, decimal places, and the OpenF1 rate limit already enforced by the client. No "good stop" threshold, no assumed season range, no fallback timing. |
| R10 | **Accessibility and attribution.** Tabs use the Race page's tablist pattern; selectors are labelled native controls; tables scroll at 360 px and rows link to the race and driver pages; every definition is visible text, not a tooltip only. Footer and README credit Jolpica and OpenF1. Layouts hold at 360 px, 768 px and 1440 px. |

## Status
- [x] 01 — Records data clients
- [x] 02 — Records analysis
- [x] 03 — Records page
- [x] 04 — Navigation and circuit record
- [x] 05 — Acceptance QA

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | plan 01/01 (OpenF1 client) | — | Sonnet | `lib/jolpica.ts`, `lib/openf1.ts` |
| 02 | 02/01 | — | Sonnet | `lib/records.ts` |
| 03 | 02/02 | 04 | Sonnet | `src/pages/Records.tsx` |
| 04 | 02/01, 02/02 | 03 | Haiku | `lib/router.ts`, `src/App.tsx`, `src/pages/Circuit.tsx`, `README.md` |
| 05 | 02/03, 02/04 | — | Opus | none (verification only) |

**Rules for every slice:** read Jolpica only through `lib/jolpica.ts` and OpenF1 only through `lib/openf1.ts`; put every parse, ranking, gap, median and coverage count in `lib/records.ts` as pure functions; components format and render only. Do not edit `src/pages/Race.tsx` or any plan 01 telemetry/strategy file. Reuse `useAsync`, `Panel`, `Empty`, `Loading`, `ErrorBlock`, `parseLapTime`, `formatLapTime`, `formatDate` and `teamColor`. Do not add routes beyond `#/records`, add no dependency and make no commits. Finish with `npm run build` (it runs the typecheck) and append `## Result`.

## Acceptance checklist
- [x] `#/records` is reachable from the top navigation, the season selector changes its data, and both tabs keep working when the other tab's data is unavailable.
- [x] The 2024 season lists 24 race fastest laps; Monaco round 8 is Hamilton, lap 63, `1:14.165`; Azerbaijan round 17 is Norris with average speed `205.318` km/h.
- [x] The selected-round fastest-lap table shows the round's fastest driver at gap `0.000`; every other gap equals that driver's `FastestLap.Time.time` minus the fastest, parsed to milliseconds.
- [x] The fastest-lap awards leaderboard counts only rows whose result has `FastestLap.rank === "1"`, and no driver appears twice.
- [x] The `Fastest race lap here` circuit panel shows the quickest row from `GET /circuits/{id}/fastest/1/results.json`, the number of recorded editions, and the race-lap/qualifying distinction.
- [x] Pit-lane transit is labelled as pit-lane time with the entry-to-exit definition; its values equal the Jolpica pit rows for the selected race and the gap to the race's quickest stop is non-negative.
- [x] Crew stops equal OpenF1 `stop_duration` values, carry driver, team and race from OpenF1, and show the derived `published of total` coverage; a season with no published stationary times (for example 2023) shows the explicit unavailable state rather than zeros.
- [x] A season with no pit rows (for example 2010) and a round whose results are not published show explicit empty states; neither tab fabricates a value from the other source.
- [x] No direct `fetch` to either API outside its client; no domain constants in components; no new dependency; `npm run build` passes and `dist/` is refreshed.
- [x] Layouts hold at 360 px, 768 px and 1440 px; tabs and selectors are keyboard operable; no runtime console errors; Jolpica and OpenF1 are credited.
