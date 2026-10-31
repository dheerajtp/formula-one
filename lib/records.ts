/**
 * Season and circuit records: official race fastest laps, fastest-lap awards,
 * per-race pit-lane transit and OpenF1 stationary crew stops.
 *
 * Builders are pure; `loadCrewStops` is the only function that fetches, and it
 * goes through the two clients. A missing timing stays absent — never zero —
 * and pit-lane transit is never relabelled as a crew stop.
 */
import { parseLapTime } from "./format";
import type { PitStop, RaceFastestLap, RaceResult } from "./jolpica";
import { getSeasonRaceSessions, getSessionDrivers, getSessionPit } from "./openf1";
import type { OpenF1Driver, OpenF1Pit, OpenF1Session } from "./openf1";

export interface LapRecord {
  season: number;
  round: number;
  raceName: string;
  date: string;
  circuitId: string;
  circuitName: string;
  driverId: string;
  code: string;
  driverName: string;
  constructorId: string;
  team: string;
  lap: number;
  millis: number;
  /** The published timing string, kept verbatim for display. */
  time: string;
  avgSpeedKph: number | null;
}

export interface LapAward {
  driverId: string;
  code: string;
  driverName: string;
  team: string;
  constructorId: string;
  awards: number;
  bestMillis: number;
  bestTime: string;
}

export interface RoundLapRow {
  rank: number;
  driverId: string;
  code: string;
  driverName: string;
  team: string;
  constructorId: string;
  racePosition: number | null;
  lap: number;
  millis: number;
  time: string;
  gapMillis: number;
  avgSpeedKph: number | null;
}

export interface PitLaneRow {
  driverId: string;
  lap: number;
  stop: number;
  durationSeconds: number;
  gapSeconds: number;
}

export interface CrewStopRow {
  sessionKey: number;
  meetingKey: number;
  location: string;
  dateStart: string;
  driverNumber: number;
  code: string;
  driverName: string;
  team: string;
  lap: number;
  stopSeconds: number;
}

export interface CrewCoverage {
  /** Pit rows with a finite, positive `stop_duration`. */
  published: number;
  /** Every pit row read, published or not. */
  total: number;
  /** Race sessions whose pit rows were read. */
  sessions: number;
}

export interface CrewStopsResult {
  rows: CrewStopRow[];
  coverage: CrewCoverage;
}

function driverCode(result: RaceResult): string {
  return result.Driver.code ?? result.Driver.familyName.slice(0, 3).toUpperCase();
}

function driverName(result: RaceResult): string {
  return `${result.Driver.givenName} ${result.Driver.familyName}`;
}

function averageSpeed(result: RaceResult): number | null {
  const raw = result.FastestLap?.AverageSpeed?.speed;
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** One record per race with a parsable official fastest lap, quickest first. */
export function buildLapRecords(rows: RaceFastestLap[]): LapRecord[] {
  const records: LapRecord[] = [];
  for (const row of rows) {
    const fastest = row.result.FastestLap;
    const time = fastest?.Time?.time;
    const millis = parseLapTime(time);
    if (!fastest || !time || millis === null) continue;
    records.push({
      season: row.season,
      round: row.round,
      raceName: row.raceName,
      date: row.date,
      circuitId: row.circuit.circuitId,
      circuitName: row.circuit.circuitName,
      driverId: row.result.Driver.driverId,
      code: driverCode(row.result),
      driverName: driverName(row.result),
      constructorId: row.result.Constructor.constructorId,
      team: row.result.Constructor.name,
      lap: Number(fastest.lap),
      millis,
      time,
      avgSpeedKph: averageSpeed(row.result),
    });
  }
  return records.sort((a, b) => a.millis - b.millis || a.date.localeCompare(b.date) || a.round - b.round);
}

/** Fastest-lap awards per driver, counted from the same records. */
export function buildLapAwards(records: LapRecord[]): LapAward[] {
  const byDriver = new Map<string, LapAward>();
  for (const record of records) {
    const existing = byDriver.get(record.driverId);
    if (!existing) {
      byDriver.set(record.driverId, {
        driverId: record.driverId,
        code: record.code,
        driverName: record.driverName,
        team: record.team,
        constructorId: record.constructorId,
        awards: 1,
        bestMillis: record.millis,
        bestTime: record.time,
      });
      continue;
    }
    existing.awards += 1;
    if (record.millis < existing.bestMillis) {
      existing.bestMillis = record.millis;
      existing.bestTime = record.time;
      existing.team = record.team;
      existing.constructorId = record.constructorId;
    }
  }
  return [...byDriver.values()].sort(
    (a, b) => b.awards - a.awards || a.bestMillis - b.bestMillis || a.driverName.localeCompare(b.driverName),
  );
}

/**
 * The season's shortest race lap (driven by circuit length, not pace) and the
 * highest published average speed (the comparable figure). Either is null when
 * the records cannot supply it.
 */
export function seasonLapHighlights(records: LapRecord[]): {
  shortest: LapRecord | null;
  fastestAverageSpeed: LapRecord | null;
} {
  const sorted = [...records].sort((a, b) => a.millis - b.millis || a.date.localeCompare(b.date) || a.round - b.round);
  let fastestAverageSpeed: LapRecord | null = null;
  for (const record of sorted) {
    if (record.avgSpeedKph === null) continue;
    if (!fastestAverageSpeed || record.avgSpeedKph > (fastestAverageSpeed.avgSpeedKph as number)) {
      fastestAverageSpeed = record;
    }
  }
  return { shortest: sorted[0] ?? null, fastestAverageSpeed };
}

/** Every classified driver's official fastest lap in one race, with the gap to the quickest. */
export function buildRoundLapTable(results: RaceResult[]): RoundLapRow[] {
  const rows = results.flatMap((result) => {
    const fastest = result.FastestLap;
    const time = fastest?.Time?.time;
    const millis = parseLapTime(time);
    if (!fastest || !time || millis === null) return [];
    const position = Number(result.position);
    return [
      {
        driverId: result.Driver.driverId,
        code: driverCode(result),
        driverName: driverName(result),
        team: result.Constructor.name,
        constructorId: result.Constructor.constructorId,
        racePosition: Number.isFinite(position) ? position : null,
        lap: Number(fastest.lap),
        millis,
        time,
        avgSpeedKph: averageSpeed(result),
      },
    ];
  });
  rows.sort((a, b) => a.millis - b.millis || (a.racePosition ?? Infinity) - (b.racePosition ?? Infinity));
  const best = rows[0]?.millis ?? 0;
  return rows.map((row, index) => ({ ...row, rank: index + 1, gapMillis: row.millis - best }));
}

/** Official pit-lane transit (entry to exit) for one race, quickest first. */
export function buildPitLaneTable(stops: PitStop[]): PitLaneRow[] {
  const rows = stops.flatMap((stop) => {
    const durationSeconds = Number(stop.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
    return [{ driverId: stop.driverId, lap: Number(stop.lap), stop: Number(stop.stop), durationSeconds }];
  });
  rows.sort((a, b) => a.durationSeconds - b.durationSeconds || a.lap - b.lap);
  const best = rows[0]?.durationSeconds ?? 0;
  return rows.map((row) => ({ ...row, gapSeconds: row.durationSeconds - best }));
}

function isPublishedStop(pit: OpenF1Pit): pit is OpenF1Pit & { stop_duration: number } {
  return typeof pit.stop_duration === "number" && Number.isFinite(pit.stop_duration) && pit.stop_duration > 0;
}

/** The quickest `limit` published stationary crew stops across the groups, with coverage counts. */
export function buildCrewStops(
  groups: { session: OpenF1Session; rows: OpenF1Pit[] }[],
  driversBySession: Map<number, OpenF1Driver[]>,
  limit: number,
): CrewStopsResult {
  let total = 0;
  const published: { session: OpenF1Session; pit: OpenF1Pit & { stop_duration: number } }[] = [];
  for (const group of groups) {
    for (const pit of group.rows) {
      total += 1;
      if (isPublishedStop(pit)) published.push({ session: group.session, pit });
    }
  }
  published.sort(
    (a, b) =>
      a.pit.stop_duration - b.pit.stop_duration ||
      a.session.date_start.localeCompare(b.session.date_start) ||
      a.pit.lap_number - b.pit.lap_number,
  );

  const rows = published.slice(0, Math.max(0, limit)).map(({ session, pit }): CrewStopRow => {
    const driver = driversBySession.get(session.session_key)?.find((d) => d.driver_number === pit.driver_number);
    return {
      sessionKey: session.session_key,
      meetingKey: session.meeting_key,
      location: session.location,
      dateStart: session.date_start,
      driverNumber: pit.driver_number,
      code: driver?.name_acronym ?? `#${pit.driver_number}`,
      driverName: driver?.full_name ?? "",
      team: driver?.team_name ?? "",
      lap: pit.lap_number,
      stopSeconds: pit.stop_duration,
    };
  });

  return { rows, coverage: { published: published.length, total, sessions: groups.length } };
}

/**
 * Read every completed race session of a season through the OpenF1 client and
 * build the crew-stop leaderboard. Drivers are fetched only for sessions that
 * appear in the top `limit`, so a season with no published stops makes no
 * driver requests.
 */
export async function loadCrewStops(season: number, limit: number): Promise<CrewStopsResult> {
  const now = Date.now();
  const sessions = (await getSeasonRaceSessions(season)).filter((session) => {
    const end = Date.parse(session.date_end || session.date_start);
    return Number.isFinite(end) && end <= now;
  });
  if (!sessions.length) return { rows: [], coverage: { published: 0, total: 0, sessions: 0 } };

  const groups: { session: OpenF1Session; rows: OpenF1Pit[] }[] = [];
  for (const session of sessions) {
    groups.push({ session, rows: await getSessionPit(session.session_key, { persist: true }) });
  }

  const preview = buildCrewStops(groups, new Map(), limit);
  if (!preview.rows.length) return preview;

  const driversBySession = new Map<number, OpenF1Driver[]>();
  for (const key of new Set(preview.rows.map((row) => row.sessionKey))) {
    driversBySession.set(key, await getSessionDrivers(key, { persist: true }));
  }
  return buildCrewStops(groups, driversBySession, limit);
}
