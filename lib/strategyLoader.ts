/**
 * Loads one race's strategy evidence for any page that shows it (Race → Strategy,
 * Weekend → Pit strategy). It only orchestrates the two clients and the plan 01
 * builders in `lib/strategy.ts`; no strategy maths lives here.
 *
 * Modes:
 * - `missing`     — OpenF1 has no meeting/session for this race.
 * - `actual`      — the race session has timed laps; full report.
 * - `baseline`    — historical medians over completed races at this circuit.
 * - `no-history`  — no completed OpenF1 race at this circuit to build a baseline.
 * - `awaiting`    — the caller says the race is over, but OpenF1 has not published
 *                   it yet; carries the baseline (or null without history).
 */
import { getPitStops, getRaceResults, type Race } from "./jolpica";
import {
  getPriorRaceSessions,
  getSessionDrivers,
  getSessionLaps,
  getSessionPit,
  getSessionRaceControl,
  getSessionStints,
  isOpenF1Paused,
  resolveRaceSession,
  savedRaceSessionsAt,
  type OpenF1Lap,
  type OpenF1Session,
} from "./openf1";
import {
  buildStrategyBaseline,
  buildStrategyReport,
  officialStopsFromJolpica,
  type StrategyBaseline,
  type StrategyReport,
} from "./strategy";

export type StrategyData =
  | { mode: "missing" }
  | { mode: "actual"; report: StrategyReport; session: OpenF1Session }
  | { mode: "no-history"; session: OpenF1Session }
  | { mode: "baseline"; baseline: StrategyBaseline; session: OpenF1Session }
  | { mode: "awaiting"; baseline: StrategyBaseline | null; session: OpenF1Session };

export interface LoadStrategyOptions {
  /** `auto` checks the race session first; `baseline` skips it and reads only past races. */
  want?: "auto" | "baseline";
  /** When the race is over, an unpublished session is `awaiting` rather than a plain baseline. */
  raceOver?: boolean;
}

const BASELINE_CACHE_KEY = "f1-strategy-baseline:v1";

function isTimed(lap: OpenF1Lap): boolean {
  return typeof lap.lap_duration === "number" && Number.isFinite(lap.lap_duration);
}

function readCachedBaseline(key: string): StrategyBaseline | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StrategyBaseline) : null;
  } catch {
    return null;
  }
}

function writeCachedBaseline(key: string, baseline: StrategyBaseline) {
  try {
    sessionStorage.setItem(key, JSON.stringify(baseline));
  } catch {
    /* private mode or quota — the baseline is simply rebuilt next visit */
  }
}

/**
 * Medians over every completed OpenF1 race at the session's circuit before it.
 * Past sessions are immutable, so the computed baseline is kept for the browser
 * session and a revisit costs no OpenF1 requests. Null when there is no history.
 */
async function loadBaseline(
  session: Pick<OpenF1Session, "circuit_key" | "date_start" | "session_key">,
  priorOverride?: OpenF1Session[],
): Promise<StrategyBaseline | null> {
  const cacheKey = `${BASELINE_CACHE_KEY}:${session.circuit_key}:${session.date_start}`;
  const cached = readCachedBaseline(cacheKey);
  if (cached) return cached;

  const prior =
    priorOverride ?? (await getPriorRaceSessions(session.circuit_key, session.date_start, session.session_key));
  const reports: StrategyReport[] = [];
  for (const past of prior) {
    const laps = await getSessionLaps(past.session_key);
    if (!laps.some(isTimed)) continue;
    const [drivers, stints, pits, raceControl] = await Promise.all([
      getSessionDrivers(past.session_key),
      getSessionStints(past.session_key),
      getSessionPit(past.session_key),
      getSessionRaceControl(past.session_key),
    ]);
    // Past editions use OpenF1 pit rows for stop counts; published durations stay unavailable.
    reports.push(buildStrategyReport({ season: past.year, drivers, laps, stints, pits, raceControl }));
  }
  if (!reports.length) return null;

  const baseline = buildStrategyBaseline(reports);
  writeCachedBaseline(cacheKey, baseline);
  return baseline;
}

export async function loadStrategy(
  season: number,
  round: number,
  race: Race,
  opts: LoadStrategyOptions = {},
): Promise<StrategyData> {
  const want = opts.want ?? "auto";
  let resolved: Awaited<ReturnType<typeof resolveRaceSession>>;
  try {
    resolved = await resolveRaceSession(season, race);
  } catch (error) {
    // OpenF1 is paused and this race is not saved (it has not run, or is newer than
    // the snapshot): the venue's saved past races still give the historical baseline.
    if (!isOpenF1Paused(error)) throw error;
    const raceStart = `${race.date}T${race.time ?? "00:00:00Z"}`;
    const prior = await savedRaceSessionsAt(race.Circuit.circuitId, raceStart);
    if (!prior.length) throw error;
    const stand = { circuit_key: prior[0].circuit_key, date_start: raceStart, session_key: -1 };
    const baseline = await loadBaseline(stand, prior);
    const session = { ...prior[0], session_key: -1, date_start: raceStart, date_end: raceStart, year: season };
    if (opts.raceOver) return { mode: "awaiting", baseline, session };
    return baseline ? { mode: "baseline", baseline, session } : { mode: "no-history", session };
  }
  if (!resolved) return { mode: "missing" };
  const session = resolved.session;

  if (want === "auto") {
    const laps = await getSessionLaps(session.session_key);
    if (laps.some(isTimed)) {
      const [drivers, stints, pits, raceControl, results, pitStops] = await Promise.all([
        getSessionDrivers(session.session_key),
        getSessionStints(session.session_key),
        getSessionPit(session.session_key),
        getSessionRaceControl(session.session_key),
        getRaceResults(season, round),
        getPitStops(season, round),
      ]);
      // Passed even when empty, so an official zero-stop race is not replaced by OpenF1 pit rows.
      const officialStops = officialStopsFromJolpica(pitStops, results, drivers);
      const report = buildStrategyReport({
        season: Number(race.season),
        drivers,
        laps,
        stints,
        pits,
        raceControl,
        officialStops,
        results,
      });
      return { mode: "actual", report, session };
    }
  }

  const baseline = await loadBaseline(session);
  if (opts.raceOver) return { mode: "awaiting", baseline, session };
  if (!baseline) return { mode: "no-history", session };
  return { mode: "baseline", baseline, session };
}
