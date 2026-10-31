# 05/05 — Acceptance QA

Plan folder: [`00-README.md`](00-README.md) · Model: Opus · Prerequisites: 04 · Parallel with: none

## Scope
None. Verification only; record defects against the owning slice.

## Tasks
1. **Static.** `npm run build`; API hosts only in the two clients; no numeric timing literals in the new pages; no new dependency.
2. **Matrix (headless Chrome, real data, outside live-session windows):**
   - `#/race/2026/18` (US GP): both tabs render; numbers equal Records page for 2026 R18.
   - `#/race/2024/8`: fastest-lap headline HAM `1:14.165` L63, circuit context HAM 2021 `1:12.909`.
   - `#/race/2024/12`: 45 stops; transit = Jolpica; stationary = OpenF1 where published; coverage counts; crew summary.
   - `#/race/2022/1`: OpenF1 coverage note, Jolpica data intact. `#/race/2010/1`: no pit stops state.
   - Deep links incl. `…/telemetry/HAM/45`; Records page drill-down links.
3. **Layout/a11y.** 360 / 768 / 1440 px; tab list scrolls; keyboard reachable; no console errors.
4. Tick only passing items; append `## Result`.

Note: OpenF1 blocks all free access while any F1 session is live (401, no CORS). Run QA outside session windows.
