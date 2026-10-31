# 05 — Race fastest laps and pit stops

Master plan: [`../../PLAN.md`](../../PLAN.md) · Builds on: [01](../01-telemetry-strategy/00-README.md) (Race page, OpenF1 client, Telemetry tab), [02](../02-best-laps-pit-stops/00-README.md) (`lib/records.ts` builders), [03](../03-weekend-pit-strategy/00-README.md) (Race tab deep links) · Used by: none

## Goal
- Every race page (`#/race/{season}/{round}`, e.g. `#/race/2026/18`) answers, for **that race**: who set the fastest lap, how every driver's best lap compares, and how it stands against the circuit's best recorded race lap.
- The same page answers for that race: which pit stop was quickest — both as official pit-lane transit and as stationary crew time where OpenF1 publishes it — and which team's crew was quickest.
- Reuse plan 02's definitions so the Records page and the Race page always agree.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| L1 | **Placement.** Two new Race-page tabs, giving `Result · Qualifying · Lap chart · Fastest laps · Pit stops · Telemetry · Strategy`. Deep links `#/race/{s}/{r}/fastest-laps` and `#/race/{s}/{r}/pit-stops` via the plan 03 tab-segment mechanism. `Strategy` keeps measured pit loss and stints; `Pit stops` is about stop times only; the two tabs cross-link. No new top-level route. |
| L2 | **Fastest laps tab.** (a) Headline card: the race's official fastest lap (`FastestLap.rank === "1"`): time, driver, team, lap number, average speed when published. (b) Every classified driver's fastest lap via plan 02's `buildRoundLapTable`: rank, driver, team, finish position, time, gap to fastest, lap, average speed. (c) **Circuit context**: the quickest race lap the feed records at this circuit (`getCircuitFastestLaps` → `buildLapRecords`), with the gap from this race's fastest lap and a visible note that layouts and car rules change between seasons. Within one circuit is the only cross-race comparison shown (plan 02 R4). |
| L3 | **Telemetry jump.** Each fastest-lap row links to `#/race/{s}/{r}/telemetry/{code}/{lap}`, which opens the Telemetry tab with that driver (matched by `name_acronym`) and lap preselected. `TelemetryPanel` gains optional `initialDriverCode` / `initialLap` props; unknown code/lap falls back to today's default. Shown only for seasons where OpenF1 resolves a session; otherwise the link is omitted, not broken. |
| L4 | **Pit stops tab.** One row per official Jolpica stop: driver, team, stop number, lap, **pit-lane transit** (Jolpica `duration`, entry → exit), gap to the race's quickest transit, and **stationary time** (OpenF1 `stop_duration` for the same driver and lap) or `not published`. Headline cards: quickest transit and quickest stationary stop. Coverage line: `n of m stops have a published stationary time`. Definitions are visible text: transit ≠ crew time (plan 02 R5/R6). |
| L5 | **Crew summary per team.** From published stationary times only: per team, stop count with a time, best and median stationary time, sorted by median. Teams with no published times are listed under a "no stationary time published" line, never as zero. |
| L6 | **Joining the two sources.** Jolpica `Driver.code` = OpenF1 `name_acronym` (fallback normalised family name, as plan 01's `officialStopsFromJolpica`); OpenF1 pit row matched on driver number + `lap_number`. An unmatched stop keeps its transit and shows stationary `not published`. All joins are pure functions in `lib/records.ts`. |
| L7 | **Missing data is explicit.** No results yet → "Results are not published for this round"; no pit rows (e.g. 2010) → "No official pit stops recorded"; no OpenF1 session (pre-2023) → stationary column and crew summary replaced by "OpenF1 does not cover this season"; OpenF1 live-session lockout → the client's existing message, with the Jolpica columns still rendered. |
| L8 | **No hardcoded domain values.** Every time, gap, speed and count comes from Jolpica/OpenF1 rows or `lib/records.ts`. Fixed numbers are presentation only (decimals). No "good stop" threshold. |
| L9 | **Records page links.** Plan 02's Records page links each round's fastest lap to `…/fastest-laps` and the transit panel's race link to `…/pit-stops`, so the season view drills into the race view. |
| L10 | **Accessibility and layout.** Same conventions as plans 01/02: captions, `tnum`, scrollable tables at 360 px, visible definitions, no console errors. |

## Status
- [x] 01 — Race records builders and loader
- [x] 02 — Fastest laps tab
- [x] 03 — Pit stops tab
- [x] 04 — Race integration, deep links and Records links
- [ ] 05 — Acceptance QA

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | plans 02, 03 complete | — | Sonnet | `lib/records.ts` |
| 02 | 01 | 03 | Sonnet | `src/pages/RaceFastestLaps.tsx` (new) |
| 03 | 01 | 02 | Sonnet | `src/pages/RacePitStops.tsx` (new) |
| 04 | 02, 03 | — | Haiku | `src/pages/Race.tsx`, `src/App.tsx`, `lib/router.ts`, `src/pages/Telemetry.tsx`, `src/pages/Records.tsx` |
| 05 | 04 | — | Opus | none (verification only) |

**Rules for every slice:** Jolpica only via `lib/jolpica.ts`, OpenF1 only via `lib/openf1.ts`; joins and rankings in `lib/records.ts`; reuse plan 02 builders rather than re-deriving; no new dependency; no commits; finish with `npm run build` and append `## Result`.

## Acceptance checklist
- [ ] `#/race/2026/18` shows `Fastest laps` and `Pit stops` tabs; deep links open them directly.
- [ ] Fastest laps for `#/race/2024/8` shows HAM `1:14.165` lap 63 as headline; gaps start at `—` and are non-negative; the table equals the Records page round table for the same race; circuit context shows the Monaco record (`1:12.909`, HAM 2021) and the gap.
- [ ] A fastest-lap row's telemetry link opens Telemetry on that driver and lap.
- [ ] Pit stops for `#/race/2024/12` lists all 45 official stops with transit values equal to Jolpica, quickest gap `—`, and stationary times equal to OpenF1 `stop_duration` where published; coverage line matches the counts.
- [ ] Crew summary uses only published stationary times; teams without any are listed as such.
- [ ] `#/race/2022/1` shows transit and fastest laps with the OpenF1-coverage note; `#/race/2010/1` shows the no-pit-stop state.
- [ ] Records page links drill into `…/fastest-laps` and `…/pit-stops`.
- [ ] No hardcoded timing values; `npm run build` passes; `dist/` refreshed; 360 / 768 / 1440 px hold; no console errors.
