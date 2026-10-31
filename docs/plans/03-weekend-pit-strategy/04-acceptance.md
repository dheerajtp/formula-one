# 03/04 — Acceptance QA

Plan folder: [`00-README.md`](00-README.md) · Model: Opus · Prerequisites: 02, 03 · Parallel with: none

## Read first
- `00-README.md` — decisions W1–W9 and the acceptance checklist.
- `lib/strategyLoader.ts`, `src/pages/WeekendStrategy.tsx`, `src/pages/Weekend.tsx`, `src/pages/Race.tsx`, `lib/router.ts`.

## Scope
None. Verification only; record defects against the owning slice rather than patching here.

## Tasks
1. **Static.** `npm run build`; `api.openf1.org` only in `lib/openf1.ts`; no numeric strategy literal in `WeekendStrategy.tsx` / `strategyLoader.ts` beyond W8's presentation constants; no new dependency.
2. **Mode matrix** (headless Chrome against the dev or preview server, real data):
   - `#/weekend/2026/19` (upcoming at time of writing; Mexico City): baseline from 3 races 2023–2025; values equal `#/race/2026/19/strategy` (plan 01 recorded: median 1 stop, observed 0–3, typical loss 23.16 s from 65 stops).
   - `#/weekend/2026/18` and `#/weekend/2024/12`: actual summary; 2024 R12 shows 52 laps, 45 stops, median 36.95 s; link opens the Strategy tab.
   - `#/weekend/2024/8`: 16 neutralised stops, median 17.89 s from 7.
   - `#/weekend/2022/1`: missing state; rest of the page intact.
   - Live and awaiting modes: if no race is live during QA, force them by temporarily passing `racePhase` in a scratch mount and record that this was simulated.
3. **Requests.** With the page open for ≥ 90 s, count OpenF1 requests after the first load: expect 0. Reload `#/weekend/2026/19` in the same tab: expect 0 prior-session requests (baseline cache).
4. **Layout and a11y.** 360 / 768 / 1440 px screenshots; stint bars have labels; no console errors (note the pre-existing 360 px top-nav overflow separately, it is outside this plan).
5. Tick the README checklist only for items that pass; append `## Result` with evidence.
