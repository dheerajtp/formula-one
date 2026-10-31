# 02/05 — Acceptance QA

Plan folder: [`00-README.md`](00-README.md) · Model: Opus · Prerequisites: 02/03, 02/04 · Parallel with: none

## Decisions you need
All of R1–R10, especially R3 (race-lap definition), R4 (lap views), R5 (transit definition), R6 (crew coverage), R8 (missing states), R9 (no hardcoded values), R10 (accessibility/attribution) — run `grep -E '^\| R[0-9]+ ' 00-README.md`.

## Read first
- `00-README.md` `## Acceptance checklist` — the rows you must check.
- `lib/records.ts`, `src/pages/Records.tsx`, `src/pages/Circuit.tsx`, `lib/jolpica.ts`, `lib/openf1.ts` additions.
- `lib/router.ts`, `src/App.tsx` navigation.
- `README.md` records section and footer attribution.

## Scope (files you own)
- None. This slice verifies and reports; do not change source files or the plan README.

Use `/tmp/f1-02-acceptance/` for evidence files. Write one evidence file per checklist area with the command and its output, plus a `STATUS` header `PASS`, `FAIL` or `MANUAL`.

## Tasks
1. **Static checks.** `npm run build`; confirm `dist/` is refreshed. Grep for direct `api.jolpi.ca` / `api.openf1.org` fetches outside the two clients. Grep `src/pages/Records.tsx`, `src/pages/Circuit.tsx` and `lib/records.ts` for literal lap/duration values, fallback timings, thresholds and coverage years; only the crew limit and display decimals may be fixed. Check `package.json` is unchanged.
2. **Lap reconciliation (2024).** From the API independently (`curl https://api.jolpi.ca/ergast/f1/2024/fastest/1/results.json?limit=100`), derive the expected 24 rows, round 8 (Hamilton, lap 63, `1:14.165`, no average speed) and round 17 (Norris, `1:45.255`, `205.318`). Compare with the page and with `buildLapRecords`. In the round detail, verify the fastest row is gap `—`/0 and every other gap equals the parsed time difference. Verify the awards leaderboard by counting `FastestLap.rank === "1"` per driver from the API; no duplicates.
3. **Circuit reconciliation.** Fetch `https://api.jolpi.ca/ergast/f1/circuits/monaco/fastest/1/results.json?limit=100`; confirm the Monaco card's quickest row matches and shows `24 recorded editions`; confirm the race-lap/qualifying note is visible. Check a circuit with no rows shows the explicit empty state.
4. **Pit reconciliation.**
   - Transit: for a selected 2024 race, fetch `/{season}/{round}/pitstops.json`, compare durations and gaps. Confirm the label and definition say pit entry to pit exit, not crew time, and that the quickest row's gap is `—`/0.
   - Crew: for 2025, compare the top rows with `https://api.openf1.org/v1/pit?session_key={key}` `stop_duration` values and the `published of total` coverage with the raw rows. Confirm null durations never appear as rows or zeros.
   - Coverage states: 2023 must show the explicit `no published stationary times` state; 2010 must show the empty transit state. Use the API to confirm those assertions, not a hardcoded assumption.
5. **States and navigation.** Both tabs remain usable when the other tab errors (simulate by blocking one host in the browser if possible; otherwise report as MANUAL). Change the header season, each round selector, and the tab; deep-link `#/records` directly. Confirm no runtime console errors and no direct fetch outside the clients.
6. **Responsive and accessibility.** At 360, 768 and 1440 px: no horizontal page overflow; tables scroll inside their panels; tabs and selects are keyboard operable; selected tab has `aria-selected`; team colour bars are `aria-hidden`. Use a real browser if available; otherwise mark these rows MANUAL with exact steps.
7. **Attribution and README.** Jolpica and OpenF1 are each credited once in the footer/README; the README records section matches the shipped definitions and route.
8. **Report.** Fill a PASS/FAIL/MANUAL table for every acceptance checklist row with the evidence file. List any known issues (including MANUAL rows and deferred work) with area, severity and detail. If a row fails, state the smallest reproducible command; do not patch source. Append `## Result` with the table and evidence directory.

## Done when
- Every checklist row has a verdict and an evidence file, or is explicitly MANUAL with steps.
- `npm run build` passes and the build output is recorded.
- Known issues are listed for the orchestrator; no source or README file was modified by this slice.

## Result
- Build/typecheck pass; API hosts referenced only in the two clients; no new dependency; only `#/records` added.
- All README acceptance items verified in headless Chrome against live data (see 03/04 Results). Monaco shows 22, not 24, editions due to a feed gap (documented in 01).
- Tables scroll at 360 px; the pre-existing top nav overflows at 360 px on every page (outside this plan).
