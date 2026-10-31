# 06/06 — Acceptance QA

Plan folder: [`00-README.md`](00-README.md) · Model: Opus · Prerequisites: 01–05 · Parallel with: none

## Scope
None. Verification only; record defects against the owning slice.

## Tasks
1. **Lockout simulation.** Headless Chrome with `Network.setBlockedURLs(["*api.openf1.org*"])`, plus one real lockout window if one occurs during QA. Walk `#/calendar` → a finished race → Telemetry, Strategy, Pit stops; `#/weekend`; `#/records` → Pit stops.
2. **Parity.** Same pages unblocked; values equal (Silverstone 2024 median 36.95 s; Monaco 2024 16 neutralised; Mexico City baseline 23.16 s).
3. **Store.** Open a lap, reload blocked → chart renders; unopened lap → `PausedNote`.
4. **Mobile.** 360 / 390 / 768 / 1440 px on every route: `scrollWidth === innerWidth`; menu keyboard flow; desktop header screenshot unchanged.
5. **Static.** `npm run build`; no new dependency; OpenF1 host only in `lib/openf1.ts` and the build script.
6. Tick passing items; append `## Result`.
