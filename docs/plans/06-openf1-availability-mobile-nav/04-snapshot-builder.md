# 06/04 — Session snapshot builder

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: 01–03

## Decisions you need
A2, A9 — run `grep -E '^\| (A2|A9) ' 00-README.md`.

## Read first
- `scripts/build-data.mjs` — fetch/retry style and output conventions.
- `lib/openf1.ts` — endpoint shapes, sprint-vs-race naming rule (`session_name === "Race"`), 404 = no rows.

## Scope (files you own)
- `scripts/build-openf1.mjs` (new), `package.json` (`"build-openf1"` script only), `public/openf1/**` (generated)

## Tasks
1. For each season in OpenF1 (`/sessions?year=` from the current year backwards until a 404/empty year), take race sessions with `date_end` in the past.
2. Per race: `drivers`, `laps`, `stints`, `pit`, `race_control` by `session_key`; write `public/openf1/{season}/{round}.json` with `{ generatedAt, session, meeting, drivers, laps, stints, pit, raceControl }`. Laps as compact tuples `[driver_number, lap_number, date_start, lap_duration, is_pit_out_lap, st_speed]` with a `lapFields` header. Map OpenF1 meeting → Jolpica round by the same date/name rule as `findRaceMeeting` (import nothing from `lib/`; reimplement the small rule in the script).
3. Also write `public/openf1/index.json`: `{ season, round, session_key, circuit_key, date_start }[]` so the client can resolve sessions and prior circuit races without `/meetings`.
4. 350 ms spacing, 30/min budget, `Retry-After` honoured; skip files that already exist (`--force` to rebuild); abort cleanly on 401 lockout with a message.
5. Print total files and bytes.

## Done when
- Running it outside a lockout produces snapshots for 2023–present completed races and an index; rerun is a no-op; Result lists file count and total size.
