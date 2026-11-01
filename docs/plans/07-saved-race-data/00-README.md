# 07 — Saved race data without a database

Master plan: [`../../PLAN.md`](../../PLAN.md) · Builds on: plan 06 (slices 03–05 already shipped, slice 04 never run) · Used by: none

## Problem
Weekend "Pit strategy" sits on "Reading past races at this circuit from OpenF1 — the free feed allows 30 requests a minute…" and never finishes (screenshot, 1 Nov 2026, race day). Two causes:
1. **`public/openf1/` does not exist.** Plan 06 built the snapshot client (`lib/openf1.ts`) and the generator (`scripts/build-openf1.mjs`), but the generator was never run — OpenF1 returns 401 to everyone during any live session — and nothing runs it later. Every prior race therefore goes to live OpenF1: ~5 requests per race behind a 30/min queue, and a 429 stalls the whole queue for 60 s.
2. **`getPriorRaceSessions` always calls live `/sessions`**, even when the snapshot already lists the circuit's races, so it can still hang on a locked or throttled API.

The current session itself (race in progress) cannot be saved by anyone; the page's "available shortly after the flag" text is correct.

## Decision: no database
Completed-race data never changes, is small (~100–200 KB per race, ~10–15 MB for 2023–now), and is read-only for visitors. A static JSON file in the repo, served by Vercel, beats any database: no account, no quota, no project limit, no CORS, no cold start, works during OpenF1 lockout.

"Store a race when someone loads it" is rejected: it needs a writable server (a Vercel function plus KV/Blob/Turso/Neon/R2) and, worse, a visitor's load during lockout is exactly the moment live data is unreachable — so it saves nothing when it matters. Supabase's 3-project cap is irrelevant to this design.

Free fallbacks if ever wanted (not planned): Vercel Blob/Edge Config, Upstash Redis (Vercel marketplace), Cloudflare R2/KV, Turso, Neon.

## Tasks
1. **Generate now (manual, once).** When no F1 session is live: `npm run build-openf1`, review `public/openf1/index.json` + file sizes, commit `public/openf1/**`, push; Vercel redeploys. Script is resumable and aborts cleanly on 401.
2. **Keep it fresh automatically.** Add `.github/workflows/openf1-snapshot.yml` (free for public repos; free minutes for private): `schedule` cron Monday 06:00 UTC (+ `workflow_dispatch`), Node 22, `npm ci`, `npm run build-openf1`, commit changed `public/openf1/**` as `github-actions[bot]` with `[skip ci]` avoided (the push must trigger the Vercel deploy). Skip the commit when nothing changed. A 401 run exits non-zero without committing; the next week's run catches up because the script skips files that exist.
3. **Never block on live when saved data exists.** In `getPriorRaceSessions`, if the snapshot has races for the circuit, return them without the live `/sessions` call (CI keeps the index current). Keep the live call only when the snapshot has none for that circuit.
4. **Honest loading text.** `WeekendStrategy.tsx` / `Records.tsx` loading labels: say "Reading saved races" when served from the snapshot; mention the 30/min limit only on the live path.
5. **Docs.** README + footer already state that completed sessions are cached; add one line on the weekly refresh. Tick plan 06 slices 04/06 once verified.

## Files
`public/openf1/**` (generated), `.github/workflows/openf1-snapshot.yml` (new), `lib/openf1.ts` (`getPriorRaceSessions`), `src/pages/WeekendStrategy.tsx`, `src/pages/Records.tsx` (label only), `README.md`, `docs/plans/06-…/00-README.md` (status).

## Risks
- Repo grows ~0.2 MB per race (~5 MB/season); acceptable. If it ever hurts, move files to a `data` branch or Vercel Blob.
- A race whose OpenF1 data lands late is skipped ("no timed laps yet") and picked up by the next weekly run.
- OpenF1 may block GitHub runner IPs; fall back to running the script locally.

## Acceptance
- [ ] `public/openf1/index.json` lists every completed race 2023–now with `circuitId`; `dist/openf1/` exists after `npm run build`.
- [ ] With DevTools blocking `api.openf1.org`, `#/weekend` pit strategy renders history for the circuit in seconds, and `#/race/{s}/{r}` Strategy renders from the snapshot.
- [ ] Workflow runs via `workflow_dispatch`, is a no-op when nothing is new, and commits when a race has finished.
- [ ] `npm run build` passes.

## Addendum — how a race reaches Vercel, previous races, and "someone opens it"
**Next race.** Flag drops → OpenF1 reopens and publishes laps → within ≤6 h the Action runs `build-openf1` (the new race is the only missing file, ~5 requests) → commits `public/openf1/{season}/{round}.json` + `index.json` to `main` → Vercel's Git integration sees the push and rebuilds → Vite copies `public/` into `dist/openf1/` → live site serves it. Until that run, the race page uses live OpenF1 (and IndexedDB keeps what that visitor loaded). Trigger it sooner from the Actions tab (`workflow_dispatch`). Requires Vercel to build from the repo (not deploy the committed `dist/`), and Actions → Workflow permissions to allow pushes (the workflow sets `contents: write`).

**Previous races.** The script already walks back from the current season until OpenF1 returns an empty year, so the first successful run backfills 2023→now (~120 requests/season at 30/min ≈ 4 min/season). Run it once locally or via `workflow_dispatch` right after the race lockout ends; resumable, skips existing files.

**Someone opens a race not saved yet** (new race inside the 6 h gap, or a failed run): the page falls through to live OpenF1 and writes the answers to that browser's IndexedDB; if OpenF1 is locked it shows the paused note. Visitors cannot write to the repo, so their load cannot fix it for others — the next Action run does. Missing races are visible as absent from `index.json`.
