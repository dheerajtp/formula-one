# 04/04 — Acceptance QA

Plan folder: [`00-README.md`](00-README.md) · Model: Opus · Prerequisites: 03 · Parallel with: none

## Scope
None. Verification only; record defects against the owning slice.

## Tasks
1. **Static.** `npm run build`; grep the guide templates for numeric literals (only presentation decimals allowed); OpenF1 only in `lib/openf1.ts`; no new dependency.
2. **Data reconciliation.** For 2024 Silverstone HAM lap 45 export the trace points (harness from plan 01) and check three braking zones and the shares by hand against the sample rows.
3. **Behaviour.** Guide off = unchanged; guide on for Silverstone 2024, Monaco 2024 and a 2026 race (DRS line hidden when the channel carries nothing); story buttons ↔ cursor; map markers; compare with session fastest (one extra request, delta end check); compare lap without data → named state.
4. **Layout.** 360 / 768 / 1440 px screenshots; keyboard-only pass through toggle, story and compare selects; no console errors.
5. Tick only passing checklist items; append `## Result`.

Note: OpenF1 blocks all free access while any F1 session is live (401, no CORS). Run QA outside session windows.
