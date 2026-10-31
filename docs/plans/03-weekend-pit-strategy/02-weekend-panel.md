# 03/02 — Weekend pit strategy panel

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 01 · Parallel with: 03

## Decisions you need
W1 (placement), W2 (modes), W4 (deps), W5 (compact content), W6 (link target), W7 (missing states), W8 (no domain values), W9 (accessibility) — run `grep -E '^\| (W[1-9]) ' 00-README.md`.

## Read first
- `lib/strategyLoader.ts` (from 01) — `loadStrategy`, `StrategyData`.
- `src/pages/Strategy.tsx` — `StintTimeline`, `DegradationTable`, `compoundLook`, `seconds`, `signedSeconds` for visual consistency (copy the small formatters; do not import page internals).
- `src/pages/Weekend.tsx` — `Conditions` panel and the `Panel` / `Empty` usage style; `SessionPhase` from `lib/live.ts`.
- `lib/staticData.ts` — `COMPOUND_STYLE`.

## Scope (files you own)
- `src/pages/WeekendStrategy.tsx` (new; export `WeekendStrategyPanel({ season, round, race, racePhase })`)

Do not edit `Weekend.tsx`, `Race.tsx`, the router or any `lib/*` file.

## Tasks
1. **Data.** Derive `want = racePhase === "done" ? "auto" : "baseline"` and `raceOver = racePhase === "done"`. One `useAsync(() => loadStrategy(season, round, race, { want, raceOver }), [season, round, want])`. Never depend on `now`.
2. **States.** Loading → `Loading` ("Reading past races at this circuit from OpenF1 — the free feed allows 30 requests a minute"); error → `ErrorBlock` inside the panel; `missing` → "OpenF1 has no session data for this race"; `no-history` → "No completed OpenF1 race at this circuit yet, so there is no baseline; nothing is estimated in its place."
3. **Baseline mode** (`upcoming`, `live`, and `awaiting`):
   - Banner line: "Historical context from {n} past races ({seasons}) — not a prediction for this race."
   - Compact stat grid: median stops (observed min–max), typical measured pit loss (sample count), driver-race samples.
   - Compound rows: colour dot + label, median stint length, median degradation s/lap (or "not enough clean laps"), stint/sample counts.
   - `live`: add "Live strategy needs OpenF1's paid real-time feed, so it is not shown; the actual strategy appears here once the session is published."
   - `awaiting`: lead with "The race is over; OpenF1 has not published this session yet." then the baseline (or the no-history line).
4. **Actual mode** (`done` + published):
   - Stat grid: race laps, recorded stops (+ neutralised count), field median pit loss (sample count), compounds used.
   - Top-10 finishers (by classified position; presentation cap) as one-line stint bars: code + compound-coloured segments, width = `lengthLaps / totalLaps`, `aria-label` with compound and lap range.
   - Link "Full strategy: every stop, losses and degradation →" to `#/race/{season}/{round}/strategy` (W6).
5. **Notes.** One short visible footnote with the measured-loss definition and sources (OpenF1 stints/race control, Jolpica official stops), same wording family as the Race page.
6. **No hardcoded strategy values** (W8); only the top-10 cap, decimals and bar heights are fixed.

## Done when
- `npm run build` passes.
- Rendered in isolation (temporary mount or after 03), each mode shows the right content for: 2026 R19 (baseline), 2026 R18 and 2024 R12 (actual), 2024 R8 (actual, neutralised count 16), 2022 R1 (missing).
- Numbers equal the Race → Strategy tab for the same round.
- Append `## Result`.
