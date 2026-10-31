# 06 — OpenF1 availability and mobile navigation

Master plan: [`../../PLAN.md`](../../PLAN.md) · Builds on: plans 01, 03, 04, 05 (every OpenF1-backed view) · Used by: none

## Problem
1. **Telemetry and Strategy fail for finished races.** Reproduced on `#/calendar` → `#/race/2026/18` → Telemetry / Strategy on 31 Oct 2026, 17:30 UTC: both tabs show "Could not load F1 data". Cause: while **any** F1 session is live, OpenF1 answers every unauthenticated request — past sessions included — with `401 {"detail":"Live F1 session in progress. Global API access (including past sessions) is restricted to authenticated users until the session ends."}` and no CORS header, so the browser sees only a network failure. A race weekend has up to five such windows (practice, sprint, qualifying, race), so the site's OpenF1 features go dark several times a week during the season. Outside those windows the same pages work (verified in plans 01–05).
2. **Mobile navigation overflows.** At 390 px the header nav row is 526 px wide (360 px: 451 px), so every page scrolls sideways and the season/time-zone controls wrap below the fold.

## Goal
- A finished race's Telemetry session table, Strategy, Weekend pit strategy, Records crew stops and Race pit stops keep working during OpenF1's live-session lockout.
- When something genuinely needs live OpenF1 (per-lap car data never fetched before), the page says plainly that OpenF1 is paused for a live session and when to retry — not a generic error.
- The header fits every width from 360 px up with no horizontal scroll; desktop is unchanged.

## Decisions (already made; do not revisit)
| # | Decision |
| --- | --- |
| A1 | **Three layers, cheapest first.** (1) a bundled **session snapshot** of completed races, (2) a browser **IndexedDB store** of every completed-session OpenF1 response already fetched, (3) live OpenF1. `requestOpenF1` consults them in that order for completed-session reads. No paid key and no server proxy: a static site cannot protect a credential (plan 01 T2 still holds). |
| A2 | **Session snapshot.** New `scripts/build-openf1.mjs` (`npm run build-openf1`), run outside lockout windows, writes `public/openf1/{season}/{round}.json` for every completed race with an OpenF1 race session: session meta, drivers, laps (compact tuple form), stints, pit rows and race-control messages. **Car data is excluded** (too large). Files are same-origin static assets fetched lazily — never imported into the JS bundle. The script reuses the client's spacing (3/s, 30/min) and resumes, skipping races already written. No season range is hardcoded; it walks OpenF1's own `/sessions?year=` for each season the calendar lists. |
| A3 | **Snapshot use.** `lib/openf1.ts` gains `loadSessionSnapshot(season, round)`; `resolveRaceSession`, `getSessionDrivers/Laps/Stints/Pit/RaceControl` serve from it when the requested session key is in a loaded snapshot. Meetings/sessions lookups for snapshot races resolve from the snapshot without calling `/meetings`. Prior-session baselines (Strategy/Weekend) read prior races' snapshots too. |
| A4 | **IndexedDB store.** `lib/openf1Store.ts`: an IndexedDB object store keyed by full OpenF1 URL, written only for responses `isCacheable` already accepts **and** whose session has ended. Covers car data, so any lap a user has opened before replays offline. Capped by total size (presentation/storage constant, oldest-first eviction); every access wrapped in try/catch so private mode just falls through. |
| A5 | **Lockout is a named state, not an error.** A fetch that fails outright is re-tried once against a cheap probe; if the probe also fails, `requestOpenF1` throws `OpenF1PausedError`. UI shows a neutral banner: "OpenF1 pauses free access while an F1 session is live. Data saved for this race is shown; the rest returns when the session ends", plus the session end time when the current weekend's OpenF1 session metadata is known (from snapshot/store), otherwise just "when the session ends". Components keep rendering whatever came from layers 1–2. |
| A6 | **Per-view fallback.** Telemetry: session table and lap list from snapshot; chart shows the paused state only when the lap's car data is in neither store. Strategy / Weekend pit strategy / Race pit stops / Records crew stops: fully served from snapshot. Jolpica-backed parts (results, official stops, fastest laps) are unaffected. |
| A7 | **Mobile header.** Below `md` (768 px): one row with logo and a `Menu` button (`aria-expanded`, `aria-controls`); the panel opens beneath as a two-column grid of nav links, then the time-zone toggle and season select. Closes on link click, route change and `Escape`; focus returns to the button. At `md`+ the current header is untouched. No new dependency. |
| A8 | **No horizontal scroll anywhere.** After A7, every route at 360 px has `document.documentElement.scrollWidth === innerWidth`; only tables and charts scroll inside their own `overflow-x-auto` containers. |
| A9 | **Honesty and attribution.** Snapshot data is OpenF1's own data; the footer and README say that completed sessions are cached in the site for availability. Snapshot files carry `generatedAt`; nothing in them is edited or derived. |

## Status
- [x] 01 — Mobile header
- [x] 02 — OpenF1 paused state
- [x] 03 — IndexedDB response store
- [ ] 04 — Session snapshot builder
- [x] 05 — Snapshot-first client and view fallbacks
- [ ] 06 — Acceptance QA

## Dependencies and parallel tracks
| Slice | Prerequisites | Parallel with | Model | Files touched |
| --- | --- | --- | --- | --- |
| 01 | none | 02–04 | Haiku | `src/App.tsx` |
| 02 | none | 01, 03, 04 | Sonnet | `lib/openf1.ts`, `components/Bits.tsx` (new `PausedNote`), pages that show OpenF1 errors |
| 03 | 02 | 01, 04 | Sonnet | `lib/openf1Store.ts` (new), `lib/openf1.ts` |
| 04 | none | 01–03 | Sonnet | `scripts/build-openf1.mjs` (new), `package.json` (script only), `public/openf1/**` |
| 05 | 02, 03, 04 | — | Sonnet | `lib/openf1.ts`, `lib/strategyLoader.ts`, `src/pages/Telemetry.tsx` |
| 06 | 01–05 | — | Opus | none (verification only) |

**Rules for every slice:** OpenF1 only through `lib/openf1.ts` (the snapshot script is a build tool and may call it over HTTP directly); no new dependency; no strategy/telemetry maths changes; no commits; finish with `npm run build` and append `## Result`.

## Acceptance checklist
- [ ] During a live-session lockout (or with OpenF1 blocked in DevTools), `#/race/2026/18` → Strategy renders the full report from the snapshot; Telemetry shows the session table and laps, and the chart for any lap opened before.
- [ ] A never-opened lap during lockout shows the paused note with retry guidance, not "Could not load F1 data".
- [ ] `#/weekend` pit strategy baseline, `#/records` crew stops and `#/race/{s}/{r}/pit-stops` stationary times render from the snapshot during lockout.
- [ ] Outside lockout, results equal plan 01/02/05 recorded values (snapshot and live agree).
- [ ] `npm run build-openf1` is resumable and writes only completed races; `public/openf1` size is reported in the Result.
- [ ] At 360 / 390 / 768 / 1440 px every route has no horizontal page scroll; the mobile menu opens/closes by click, link and `Escape`, with correct `aria-expanded` and focus return; desktop header unchanged.
- [ ] `npm run build` passes, `dist/` refreshed, no console errors; footer/README mention the cached snapshot.
