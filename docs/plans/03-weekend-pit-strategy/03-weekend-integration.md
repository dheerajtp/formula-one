# 03/03 — Weekend integration and Race tab deep link

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: 01 (mount after 02) · Parallel with: 02

## Decisions you need
W1 (placement), W2 (phase source), W6 (deep link), W7 (page keeps rendering) — run `grep -E '^\| (W1|W2|W6|W7) ' 00-README.md`.

## Read first
- `src/pages/Weekend.tsx` — `Weekend` component: `racePhase`, the right-hand column order (`Starting grid`, `Conditions`, `What this page can honestly show`).
- `lib/router.ts` — `PATTERNS` and `parse`.
- `src/pages/Race.tsx` — `TABS`, `Tab`, `RacePage` props and `useState<Tab>("Result")`.
- `src/App.tsx` — the `route.name === "race"` render line.

## Scope (files you own)
- `src/pages/Weekend.tsx`, `src/pages/Race.tsx`, `lib/router.ts`, `src/App.tsx`

## Tasks
1. **Mount the panel.** In `Weekend`, render `<WeekendStrategyPanel season={season} round={round} race={race} racePhase={racePhase} />` immediately after `<Conditions … />` (W1). Give it `key={`${season}:${round}`}` so switching weekends resets it. Nothing else on the page moves.
2. **Route.** Add `[/^\/race\/(\d+)\/(\d+)\/(telemetry|strategy)\/?$/, "race", ["season", "round", "tab"]]` after the existing race pattern. Unknown segments must still fall to `notfound`.
3. **Race page.** `RacePage` gains `initialTab?: Tab`; map `"strategy"` → `"Strategy"`, `"telemetry"` → `"Telemetry"` in `App.tsx`, and pass it. `useState<Tab>(initialTab ?? "Result")`, and reset the tab when `initialTab` changes (key the page on the full hash in `App.tsx`, or a small effect). Clicking tabs does not rewrite the URL (unchanged behaviour).
4. **No other changes.** Header, timing, grid, conditions and the honesty panel stay as they are.

## Done when
- `npm run build` passes.
- `#/weekend`, `#/weekend/2026/19`, `#/weekend/2024/12` show the panel in the right column after Conditions.
- `#/race/2024/12` opens on Result; `#/race/2024/12/strategy` opens on Strategy; `#/race/2024/12/telemetry` on Telemetry; `#/race/2024/12/pits` is not-found.
- Append `## Result`.
