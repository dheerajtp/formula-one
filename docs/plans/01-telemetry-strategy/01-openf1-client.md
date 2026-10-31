# 01/01 — OpenF1 client and session mapping

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: none · Parallel with: none

## Decisions you need
T1 (sources), T2 (no live), T5 (session mapping), T9 (no hardcoded domain values), T10 (request discipline) — run `grep -E '^\| (T1|T2|T5|T9|T10) ' 00-README.md`.

## Read first
- `lib/jolpica.ts` — `request`, `withRetry`, `mapPool`, `Circuit`, `Race`, `DriverRef`, `utcDateTime` usage and the existing cache/retry conventions.
- `lib/format.ts` — `utcDateTime`, `parseLapTime` (pit durations arrive as `"28.481"` or `"39:18.026"`).
- `src/pages/Race.tsx` — `RacePage`, `race` object shape and how tabs consume season/round.
- `docs/plans/01-telemetry-strategy/00-README.md` — T1, T2, T5, T10.

## Scope (files you own)
- `lib/openf1.ts` (new)

Do not edit `lib/jolpica.ts`, pages or components.

## Tasks
1. **Types.** Export interfaces that mirror the observed API fields:
   - `OpenF1Meeting`: `meeting_key`, `meeting_name`, `meeting_official_name`, `location`, `country_name`, `circuit_key`, `circuit_short_name`, `date_start`, `date_end`, `year`.
   - `OpenF1Session`: `session_key`, `session_type`, `session_name`, `date_start`, `date_end`, `meeting_key`, `circuit_key`, `circuit_short_name`, `location`, `country_name`, `year`, `is_cancelled?`.
   - `OpenF1Driver`: `driver_number`, `name_acronym`, `full_name`, `first_name`, `last_name`, `team_name`, `team_colour`, `country_code`.
   - `OpenF1Lap`: `driver_number`, `lap_number`, `date_start`, `lap_duration`, `is_pit_out_lap`, plus optional sector fields used by the UI (`st_speed`, `i1_speed`, `i2_speed`).
   - `OpenF1Stint`: `driver_number`, `stint_number`, `lap_start`, `lap_end`, `compound`, `tyre_age_at_start`.
   - `OpenF1Pit`: `driver_number`, `lap_number`, `date`, `pit_duration`, `lane_duration`, `stop_duration` (all durations nullable).
   - `OpenF1RaceControl`: `date`, `category`, `flag`, `scope`, `sector`, `message`, `lap_number`.
   - `OpenF1CarData`: `date`, `driver_number`, `speed`, `throttle`, `brake`, `n_gear`, `rpm`, `drs`.
   Use `number | null` where the feed is nullable; never invent defaults.
2. **Request core.** One `requestOpenF1<T>(path, params, { persist })` that:
   - Builds `https://api.openf1.org/v1${path}` with `URLSearchParams` (so `date>=` and `date<=` are encoded correctly).
   - Serializes requests through a queue with a 350 ms minimum spacing (OpenF1 free tier publishes 3 req/s). Keep the spacing in one named constant with a comment that it is a protocol limit.
   - Retries 429 using `Retry-After` when present (fallback 1 s) and 5xx with exponential backoff, at most 3 attempts. Do not retry 404/422.
   - Throws `Error("OpenF1 request failed (<status>) for <path>")`; for 422 append `" (query too large; narrow the date range)"`.
   - Caches successful non-empty responses in a module `Map` keyed by the full URL. `persist: true` also writes to `sessionStorage` under `f1-openf1-cache:v1`. Never cache an empty array or a response for a future/empty session.
   - Uses only `fetch`, no key and no custom headers beyond `accept: application/json`.
3. **Meeting and session lookup.**
   - `getSeasonMeetings(season)` → `GET /meetings?year={season}`, persist.
   - `normaliseName` (lowercase, strip accents/punctuation, collapse whitespace) and `findRaceMeeting(meetings, race): OpenF1Meeting | null`:
     - Prefer meetings whose `[date_start, date_end]` day range contains `race.date`.
     - Break ties or fall back to a single meeting whose normalised `meeting_name` contains/equals the normalised `race.raceName`; otherwise return the nearest start date among that named subset.
     - If no meeting contains the date and no name matches, return `null` (never guess a different venue).
   - `getRaceSession(meetingKey)` → `GET /sessions?meeting_key={meetingKey}`, persist, return the non-cancelled session with `session_name === "Race"` (do **not** accept `session_type === "Race"` alone: sprint sessions also carry that type), or `null`.
   - `resolveRaceSession(season, race): Promise<{ meeting: OpenF1Meeting; session: OpenF1Session } | null>` composing the two above.
   - `getPriorRaceSessions(circuitKey, beforeIso, excludeSessionKey?)` → `GET /sessions?circuit_key={circuitKey}&session_name=Race`, keep non-cancelled sessions with `date_start < beforeIso` and `session_key !== excludeSessionKey`, newest first. No hardcoded coverage year.
4. **Session data.**
   - `getSessionDrivers(sessionKey)` → `/drivers?session_key=`.
   - `getSessionLaps(sessionKey, driverNumber?)` → `/laps?session_key=` plus optional `driver_number`.
   - `getSessionStints(sessionKey)` → `/stints?session_key=`.
   - `getSessionPit(sessionKey)` → `/pit?session_key=`.
   - `getSessionRaceControl(sessionKey)` → `/race_control?session_key=`.
   - `getCarData(sessionKey, driverNumber, fromIso, toIso)` → `/car_data?session_key=&driver_number=&date>=&date<=`; memory cache only. The API answers 422 when a query is too broad, so the caller must always pass a lap-sized window.
5. **Documentation in code.** One short module comment explains that OpenF1 is the historical/session feed and that real-time data is deliberately absent (T2). Do not add fallback sample data.

## Done when
- `npx tsc --noEmit` and `npm run build` pass with no new dependency.
- Manual endpoint checks (curl or browser network) confirm: 2024 Monaco race resolves to session `9523`; `getSeasonMeetings(2026)` finds the Qatar and Yas Marina meetings; `getPriorRaceSessions(22, "2024-05-26T13:00:00Z")` returns 2023 Monaco only; a sprint weekend does not resolve to a Sprint session.
- No URL or fetch for `api.openf1.org` exists outside `lib/openf1.ts`.
- Append `## Result` with the checks performed and any API quirks observed.

## Result

**STATUS: DONE**

### Files changed
- `lib/openf1.ts` (new, 447 lines): the types, the `requestOpenF1` queue/retry/cache core, meeting and session lookup, and the session data readers.
- Nothing else in scope was touched: `package.json` is unchanged (no new dependency), `lib/jolpica.ts`, pages, components and `data/` keep the uncommitted circuit-page work exactly as found. `npm run build` refreshed `dist/`, which was already uncommitted before this slice.

### Checks run
| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0, no diagnostics (`TSC_EXIT=0`) |
| `npm run build` | exit 0, `✓ 46 modules transformed`, `✓ built in 220ms`, `BUILD_EXIT=0` |
| `grep -rn "api.openf1.org"` over the repo (excluding `node_modules`, `dist`, `docs`) | only `lib/openf1.ts:2` (module comment) and `lib/openf1.ts:14` (`BASE`) |
| `git status --short` | only `lib/openf1.ts` added; no other source file changed by this slice |

Both commands were slow on this iCloud-synced folder — the first `tsc` run took roughly 9 minutes and the first clean build 2m21s — but both completed; nothing was abandoned.

### Endpoint evidence
Verified with a temporary Node harness in `/tmp` that imports `lib/openf1.ts` (stubbed `sessionStorage`, counting `fetch`). Deleted afterwards.

- **2024 Monaco** — `resolveRaceSession(2024, { raceName: "Monaco Grand Prix", date: "2024-05-26" })` → meeting `1236`, session `9523`, `session_name: "Race"`, `session_type: "Race"`.
- **2026 meetings** — `getSeasonMeetings(2026)` → 27 meetings. `findRaceMeeting(..., { raceName: "Qatar Grand Prix", date: "2026-11-29" })` → `1301 Qatar Grand Prix @ Lusail`; `{ raceName: "Abu Dhabi Grand Prix", date: "2026-12-06" }` → `1302 Abu Dhabi Grand Prix @ Yas Marina`.
- **Prior editions** — `getPriorRaceSessions(22, "2024-05-26T13:00:00Z")` → exactly `9094 / 2023 / 2023-05-28`, current session excluded. `getPriorRaceSessions(22, "2025-05-25T13:00:00Z")` → `9523/2024, 9094/2023`, newest first.
- **Sprint exclusion** — meeting `1233` (2024 China) sessions: `9663 Practice/Practice 1`, `9668 Qualifying/Sprint Qualifying`, `9672 Race/Sprint`, `9664 Qualifying/Qualifying`, `9673 Race/Race`. `resolveRaceSession(2024, { raceName: "Chinese Grand Prix", date: "2024-04-21" })` → `9673` (`Race`), never `9672` (`Sprint`).
- **Session data**, session `9523`: 20 drivers, 78 laps for driver 1, 43 stints, 23 pit rows, 122 race-control messages.
- **Car data window** `9523 / driver 1 / 13:02:00–13:03:30Z`: 340 samples, first `2024-05-26T13:02:00.235000+00:00`, last `2024-05-26T13:03:29.916000+00:00`, every row inside the requested window.
- **Caching** — a second `getSeasonMeetings(2026)` made 0 extra fetches (memory map plus `sessionStorage`); two `getRaceSession(1301)` calls against the future 2026 Qatar meeting made 2 fetches, because future session metadata is deliberately not cached.
- **No coverage** — `getSeasonMeetings(2019)` → `[]`, `resolveRaceSession(2019, Monaco)` → `null`, and repeated calls hit the network again (empty answers are never cached).

### API quirks observed
1. **No rows is a 404, not `[]`.** `/meetings?year=2019` and `/pit?session_key=9094` (2023 Monaco has no pit rows) answer `404 {"detail":"No results found."}`. Unknown query parameter names also 404 — the API rejects rather than ignores them. The request core still throws the specified `Error("OpenF1 request failed (<status>) for <path>")`; the lookup functions translate only 404 into their documented `null`/`[]` via a private `allowMissing` helper, so "nothing published" stays distinguishable from a real failure everywhere else.
2. **`date>=` / `date<=` cannot be serialised by `URLSearchParams` verbatim.** `new URLSearchParams({ "date>=": iso })` produces `date%3E%3D=<iso>`, and the API answers 404 for that query (confirmed on `car_data`). The accepted form is `date%3E%3D<iso>` / `date%3C%3D<iso>` with no separator, so `buildUrl` appends just those two bounds already encoded while every plain parameter still goes through `URLSearchParams`. Both bounds are inclusive, verified against the exact timestamp of a known sample.
3. **Sprint sessions carry `session_type: "Race"`** — `Sprint` is typed `Race` and `Sprint Qualifying` is typed `Qualifying`. `getRaceSession` therefore keys on `session_name === "Race"`.
4. **`pit_duration` units are not uniform.** Monza 2024 rows are plain seconds (`24.1`–`38.8`), while the 2024 Monaco lap-1 red-flag visits are around `2358.0` in the same field. It is also a plain number, not the `"28.481"` / `"39:18.026"` string the slice anticipated, so the type stays `number | null` and this module neither scales nor parses it.
5. **The feed already contains future rows** — a 2027 Monaco race (`92713175`, `2027-06-06`) and the 2026 sessions. Date filtering plus the "no future session" cache rule keep them out of prior-edition results and out of the cache.
6. **2026 has a stray duplicate meeting** `1308 "Bahrain Grand Prix" @ Kuala Lumpur` inside the Singapore weekend (2026-10-02…04). Date containment still resolves the real Singapore meeting, and the name fallback only ever picks a meeting whose normalised name matches the calendar race, so the stray row is never chosen by accident.

### Deliberate implementation notes
- `requestOpenF1` is exported and is the only place that knows the base URL, the 350 ms queue, `Retry-After`, the 5xx backoff and the cache. That is the seam a future server-side proxy can replace without touching callers (T2).
- 429/5xx retries (max 3 attempts, 404/422 never retried) are implemented per the slice but could not be exercised against the live API without deliberately abusing it; they were reviewed against the spec rather than observed.
- The only fixed numbers are protocol constants: 350 ms spacing (OpenF1 free tier's 3 req/s), 3 attempts, 1 s `Retry-After` fallback and the 500 ms doubling backoff base.
