# 03/01 — Shared strategy loader and baseline cache

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: plan 01 complete · Parallel with: none

## Decisions you need
W2 (modes), W3 (one loader), W4 (request discipline, baseline cache), W7 (missing states) — run `grep -E '^\| (W2|W3|W4|W7) ' 00-README.md`.

## Read first
- `src/pages/Strategy.tsx` — `loadStrategy`, `StrategyData`, `isTimed`, and how `StrategyPanel` switches on `data.mode`.
- `lib/openf1.ts` — `resolveRaceSession`, `getPriorRaceSessions`, the session getters, and the `readPersisted` / `writePersisted` pattern (copy the pattern; do not export those internals).
- `lib/strategy.ts` — `buildStrategyReport`, `buildStrategyBaseline`, `officialStopsFromJolpica`, `StrategyBaseline`. Do not edit.

## Scope (files you own)
- `lib/strategyLoader.ts` (new)
- `src/pages/Strategy.tsx` (only to import the loader instead of defining it)

## Tasks
1. **Move the loader.** Create `lib/strategyLoader.ts` exporting `StrategyData` and `loadStrategy(season, round, race, opts?)`. Move the body from `Strategy.tsx` verbatim; keep the four modes `missing | actual | no-history | baseline` and add `awaiting` (W2): a race whose session resolves but has no timed laps **and** whose caller said the race is over. `awaiting` carries the baseline result (or `null` when there is no history).
2. **Mode hint.** `opts.want?: "auto" | "baseline"` (default `"auto"`).
   - `"auto"` keeps today's behaviour: fetch the session's laps; timed laps → `actual`, otherwise baseline/no-history.
   - `"baseline"` skips the current session's laps entirely and goes straight to the prior-session baseline.
   - `opts.raceOver?: boolean` turns the "no timed laps" outcome into `awaiting` instead of `baseline`.
   `StrategyPanel` keeps calling it with defaults, so the Race page behaves exactly as before.
3. **Baseline cache.** Persist the computed `StrategyBaseline` in `sessionStorage` under `f1-strategy-baseline:v1:{circuit_key}:{before date_start}` (W4). Read it before fetching prior sessions; write it only when `reports.length > 0`. Wrap storage in try/catch like `lib/openf1.ts`. Do not cache `actual` reports here (they are large and the per-URL OpenF1 cache already covers them).
4. **No maths, no UI.** The module only orchestrates client calls and the plan 01 builders. No React imports, no formatting.

## Done when
- `npm run build` passes.
- The Race → Strategy tab renders identically for `#/race/2024/12`, `#/race/2024/8` and `#/race/2026/19` (same summary values as plan 01's Results).
- A second visit to `#/race/2026/19` → Strategy in the same tab makes no `/laps`, `/stints`, `/pit`, `/race_control` or `/drivers` requests for the prior sessions.
- Append `## Result`.
