# 01/06 — Acceptance QA

Plan folder: [`00-README.md`](00-README.md) · Model: Opus · Prerequisites: 05 · Parallel with: none

## Decisions you need
T1–T11 — run `grep -E '^\| T[0-9]+ ' 00-README.md`. Treat every decision as a testable claim.

## Read first
- `docs/plans/01-telemetry-strategy/00-README.md` — the acceptance checklist and decisions.
- `src/pages/Telemetry.tsx`, `src/pages/Strategy.tsx`, `components/TelemetryChart.tsx`, `lib/openf1.ts`, `lib/telemetry.ts`, `lib/strategy.ts`.
- `src/pages/Race.tsx` — the five tabs and the old tabs' removal.
- `README.md` and the `src/App.tsx` footer.

## Scope (files you own)
- None. Verification only; do not change application code in this slice. If a defect is found, record it and send it back to the owning slice rather than patching it here.

## Tasks
1. **Static checks.**
   - `npx tsc --noEmit` and `npm run build` must pass.
   - `rg -n "api\\.openf1\\.org" src components lib` must return only `lib/openf1.ts`.
   - Inspect `src/pages/Telemetry.tsx`, `src/pages/Strategy.tsx`, `components/TelemetryChart.tsx` for numeric literals. Classify each as presentation/protocol (chart geometry, tick count, CSS) or domain value. Any fixed lap time, pit loss, stop count, stint length, compound, race length or degradation number is a failure of T9.
   - Confirm no new dependency in `package.json` and no new route/nav entry.
2. **Session and missing-data matrix.**
   - 2024 Monaco (`#/race/2024/8`): session resolves to OpenF1 race 9523, not a practice/sprint; telemetry available; the red-flag first-lap stops are excluded from the strategy field median.
   - 2024 Silverstone (`#/race/2024/12`): normal pit stops; strategy shows actual compounds and measured losses; telemetry loads for multiple drivers/laps.
   - A sprint weekend (2024 Shanghai or Miami): the app resolves the Race session, never the Sprint session.
   - A pre-OpenF1 race (e.g. 2022 round 1): result remains visible; Telemetry and Strategy show explicit unavailable states; no zero-filled chart/table.
   - An upcoming 2026 race with prior editions at its circuit (Qatar or Yas Marina): Strategy shows a baseline with the contributing session/season count; Telemetry states the session is not final.
   - A venue with no prior OpenF1 race (if reachable): baseline empty state names that fact.
3. **Telemetry checks.**
   - Switching driver changes the lap list; switching lap changes the trace; prev/next never leaves that driver's timed laps.
   - The session table lists every driver with a timed lap; no cap.
   - Network: selecting a lap issues one `/car_data` request with a lap-sized `date>=`/`date<=`; no 422 and no whole-session car-data request.
   - Trace values reconcile with the source: max/average speed and sample count come from the plotted points; the distance axis ends at the recorded lap length when `CIRCUITS` has one; the derived-distance note is visible.
   - Empty car data for a lap shows the named unavailable state, not an empty chart.
4. **Strategy checks.**
   - For a sample stop, verify `measuredLossS = in-lap + out-lap − 2 × driver clean-lap median` against the OpenF1 lap rows; verify the field median is the median of the non-excluded values.
   - Confirm excluded non-green stops have no measured loss and do not affect the median.
   - Confirm stint compound/lap ranges match OpenF1 stints and stop laps/counts match Jolpica pit rows for the same race.
   - Confirm degradation is null when a stint lacks two clean laps, and the per-compound median is computed from the displayed sample counts.
   - Confirm the upcoming baseline shows only historical aggregates and no predicted pit lap or fabricated current-session value.
5. **UI and accessibility.**
   - 360 px, 768 px and 1440 px: no horizontal page overflow; tables scroll within their panels; the chart keeps its aspect ratio; controls wrap.
   - Tab through the driver/lap selectors and previous/next buttons; the chart has an accessible name and its summary text is readable without hover.
   - No runtime console errors on the checked pages; no failed OpenF1/Jolpica requests other than intentional empty/future-session responses.
6. **Attribution and docs.** Footer and README credit OpenF1 and state that live telemetry is not included. `dist/` is refreshed by the build. Do not commit.
7. **Known issues to record.**
   - OpenF1 free tier is 3 req/s; a multi-session baseline can take several seconds.
   - OpenF1 coverage starts with 2023; older races are explicitly unavailable.
   - OpenF1 `stop_duration` is often null and `pit_duration` semantics vary; the app therefore uses Jolpica's published stop duration and its own measured lap-based loss.
   - Non-green filtering depends on race-control coverage; `flagsAvailable` tells the UI whether it could apply.
   - Driver joins use code/name; an unmatched driver keeps the OpenF1 identity and has no Jolpica position/link.
   - Data appears after the session is published; there is no live polling.
8. **Evidence.** Append `## Result` with the command outputs, race URLs, request counts, the reconciliation numbers for at least one pit stop and one stint, and screenshot paths for 360 px and 1440 px.

## Done when
- Every line of the README acceptance checklist has evidence recorded in `## Result`.
- Every T1–T11 decision has been checked or explicitly marked with its known limitation.
- Any failing item names the owning slice and the exact observed behaviour; do not mark the plan complete with a failing acceptance item.

## Result
- Static: tsc + build pass; `api.openf1.org` appears only in `lib/openf1.ts`; no new dependency, route or nav item; numeric literals in the new components are chart geometry/CSS only.
- Matrix: Monaco 2024 (session 9523, red-flag stops excluded), Silverstone 2024, Miami 2024 sprint weekend (Race session 9507 chosen over Sprint 9506), 2022 R1 (unavailable states, result kept), 2026 R19 (baseline + "not final").
- Known issue outside this plan: the existing top navigation bar makes every page 451 px wide at a 360 px viewport.
