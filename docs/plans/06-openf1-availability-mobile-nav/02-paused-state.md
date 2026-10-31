# 06/02 — OpenF1 paused state

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: 01, 03, 04

## Decisions you need
A5, A6 — run `grep -E '^\| (A5|A6) ' 00-README.md`.

## Read first
- `lib/openf1.ts` — `requestOpenF1`, `unreachable`, the queue.
- Every OpenF1 consumer's error branch: `src/pages/Telemetry.tsx`, `Strategy.tsx`, `WeekendStrategy.tsx`, `RacePitStops.tsx`, `Records.tsx` (`CrewStops`), `RaceFastestLaps.tsx` (session lookup).

## Scope (files you own)
- `lib/openf1.ts`, `components/Bits.tsx` (add `PausedNote`), the pages listed above (error branches only).

## Tasks
1. Export `class OpenF1PausedError extends Error` and `isOpenF1Paused(error | message)`. On a fetch that throws, probe once (`/sessions?session_key=` of a known-completed key already in memory, else `/meetings?year=` of the previous season); a second outright failure → `OpenF1PausedError`. Do not retry further; do not poison the queue.
2. `useAsync` stores only the message string — make the paused message start with a stable prefix (`OpenF1 paused:`) so pages can detect it without changing `useAsync`.
3. `PausedNote` (neutral styling, not destructive red): the A5 copy, optional end time.
4. Replace `ErrorBlock` with `PausedNote` in each consumer when the error is the paused state; other errors keep `ErrorBlock`.

## Done when
- `npm run build` passes; with `api.openf1.org` blocked (CDP `Network.setBlockedURLs`) each OpenF1 view shows `PausedNote`, Jolpica parts still render; unblocked behaviour unchanged.
- Append `## Result`.
