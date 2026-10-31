# 03 — Weekend pit strategy

Master plan: [`../../PLAN.md`](../../PLAN.md) · Builds on: [01 — Telemetry and pit strategy](../01-telemetry-strategy/00-README.md) (OpenF1 client, `lib/strategy.ts`, `StrategyPanel`) · Used by: none

## Goal
- Put pit strategy on the Weekend page (`#/weekend`, `#/weekend/{season}/{round}`) so the race weekend shows the strategy picture without opening the Race page.
- Before and during the race: show what past races at this circuit say (stop count, typical measured pit loss, stint length and degradation by compound) as clearly labelled historical context.
- After the race, once OpenF1 has published it: show a compact summary of the actual strategy and link straight to the full Race → Strategy view.
- Reuse plan 01's analysis exactly; never invent a number, a predicted pit window or an assumed compound.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| W1 | **Placement.** One new `Pit strategy` panel on the Weekend page, in the right-hand column directly after `Conditions and tyres` and before `What this page can honestly show`. No new route or nav item. The Conditions panel keeps owning the compound allocation chips; the strategy panel does not repeat them. |
| W2 | **Mode follows the race phase.** Use the page's existing `racePhase` (`sessionPhase(raceSession, now)` from `lib/live.ts`). `upcoming` → **baseline**. `live` → **baseline** plus a line that live strategy needs OpenF1's paid real-time feed and is not shown. `done` → **actual** when the OpenF1 race session has at least one timed lap, otherwise **awaiting** (says OpenF1 has not published the session yet) followed by the baseline. |
| W3 | **One loader for both pages.** Move `loadStrategy` and its `StrategyData` union out of `src/pages/Strategy.tsx` into `lib/strategyLoader.ts`, unchanged in behaviour, and have both `StrategyPanel` and the Weekend panel call it. Add an explicit `mode` hint parameter so the Weekend page can ask for the baseline without first fetching the current session's laps while the race is upcoming/live. No strategy maths moves; `lib/strategy.ts` is not edited. |
| W4 | **Request discipline.** The Weekend page is a landing page and re-renders every 30 s (`useNow(30000)`). The panel's `useAsync` deps are `[season, round, mode]` only — never `now` — so it fetches once per phase change. The computed `StrategyBaseline` for a `(circuit_key, before-date)` pair is persisted in `sessionStorage` (prior sessions are immutable), so revisiting the weekend costs zero OpenF1 requests. All OpenF1 traffic still goes through `lib/openf1.ts` and its 3/s + 30/min queue. |
| W5 | **Compact presentation.** Baseline: contributing races and seasons, median stops with observed min–max, typical measured pit loss with sample count, and one row per compound (median stint length, median degradation s/lap, sample counts). Actual: race laps, recorded stops (and neutralised count), field median pit loss with sample count, compounds used, and the top-10 finishers' stint bars (compound-coloured, width = stint laps / race laps). Everything else stays on the Race page. |
| W6 | **Deep link to the full view.** Add an optional tab segment to the Race route: `#/race/{season}/{round}/strategy` (and `/telemetry`) opens that tab. `RacePage` gains an optional `initialTab` prop; the bare route keeps defaulting to `Result`. The Weekend panel links to `#/race/{season}/{round}/strategy` in actual mode, and the Race page's Strategy tab is the only place with the full stop table. |
| W7 | **Missing data is explicit.** Name it: no OpenF1 meeting for this race (pre-2023 seasons), no completed OpenF1 race at this circuit yet (new venue), OpenF1 has not published this session yet, or an OpenF1 request failed. The rest of the Weekend page must keep rendering when the strategy panel errors. |
| W8 | **No hardcoded domain values.** Every number comes from `StrategyReport` / `StrategyBaseline`. Fixed numbers are presentation only: the top-10 row cap, decimal places, bar heights. No assumed pit loss, stop count, stint length, tyre life or pit window. |
| W9 | **Accessibility and layout.** Same conventions as plan 01: visible definitions (not tooltip-only), stint bars with `aria-label`, `tnum` numbers, the panel readable at 360 px inside the existing two-column layout (it stacks on narrow screens). |

## Status
- [x] 01 — Shared strategy loader and baseline cache
- [x] 02 — Weekend pit strategy panel
- [x] 03 — Weekend integration and Race tab deep link
- [ ] 04 — Acceptance QA

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | plan 01 complete | — | Sonnet | `lib/strategyLoader.ts` (new), `src/pages/Strategy.tsx` |
| 02 | 01 | 03 | Sonnet | `src/pages/WeekendStrategy.tsx` (new) |
| 03 | 01 | 02 (mount last) | Haiku | `src/pages/Weekend.tsx`, `src/pages/Race.tsx`, `lib/router.ts`, `src/App.tsx` |
| 04 | 02, 03 | — | Opus | none (verification only) |

**Rules for every slice:** OpenF1 only through `lib/openf1.ts`, Jolpica only through `lib/jolpica.ts`; no strategy maths outside `lib/strategy.ts`; reuse `useAsync`, `Panel`, `Empty`, `Loading`, `ErrorBlock`, `COMPOUND_STYLE`; no new dependency; no commits; finish with `npm run build` and append `## Result`.

## Acceptance checklist
- [ ] `#/weekend` (the current weekend) shows a `Pit strategy` panel after `Conditions and tyres`; the rest of the page is unchanged.
- [ ] An upcoming race with prior OpenF1 editions (e.g. 2026 Mexico City, `#/weekend/2026/19`) shows the baseline labelled as historical context with its race/season count, and its numbers equal the Race → Strategy baseline for the same round.
- [ ] A finished, published race (e.g. `#/weekend/2026/18`, `#/weekend/2024/12`) shows the actual summary; its median pit loss and stop counts equal the Race → Strategy tab, and the link opens `#/race/{season}/{round}/strategy` on the Strategy tab.
- [ ] 2024 Monaco (`#/weekend/2024/8`) shows the red-flag stops as neutralised and excluded from the median, matching plan 01.
- [ ] A pre-OpenF1 race (`#/weekend/2022/1`) shows the explicit unavailable state; a new venue with no prior OpenF1 race shows the explicit no-history state.
- [ ] While the race is `live`, the panel shows the baseline plus the paid-live note and fetches nothing from the current session's car data.
- [ ] Leaving the page open across several 30 s ticks issues no repeat OpenF1 requests; reloading the same weekend in the same tab issues none for the baseline.
- [ ] `#/race/{s}/{r}` still opens on `Result`; `/strategy` and `/telemetry` open those tabs; unknown segments fall through to not-found.
- [ ] No hardcoded strategy values; no new dependency; `npm run build` passes and `dist/` is refreshed; layout holds at 360 px, 768 px and 1440 px with no console errors.
