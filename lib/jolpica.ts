/**
 * Client for the free Jolpica API (Ergast-compatible, `access-control-allow-origin: *`),
 * so the deployed site talks to it straight from the browser with no backend.
 */
import { parseLapTime, utcDateTime } from "./format";

const BASE = "https://api.jolpi.ca/ergast/f1";
const CACHE_KEY = "f1-jolpica-cache:v1";

export interface Location {
  locality: string;
  country: string;
  lat?: string;
  long?: string;
}

export interface Circuit {
  circuitId: string;
  url?: string;
  circuitName: string;
  Location: Location;
}

export interface DriverRef {
  driverId: string;
  code?: string;
  permanentNumber?: string;
  givenName: string;
  familyName: string;
  nationality: string;
  dateOfBirth?: string;
  url?: string;
}

export interface ConstructorRef {
  constructorId: string;
  name: string;
  nationality: string;
  url?: string;
}

export interface Race {
  season: string;
  round: string;
  raceName: string;
  Circuit: Circuit;
  date: string;
  time?: string;
  url?: string;
  FirstPractice?: { date: string; time?: string };
  SecondPractice?: { date: string; time?: string };
  ThirdPractice?: { date: string; time?: string };
  Sprint?: { date: string; time?: string };
  Qualifying?: { date: string; time?: string };
}

export interface Standing {
  position: string;
  positionText: string;
  points: string;
  wins: string;
  grids?: string;
  podiums?: string;
}

export interface DriverStanding extends Standing {
  Driver: DriverRef;
  Constructors: ConstructorRef[];
}

export interface ConstructorStanding extends Standing {
  Constructor: ConstructorRef;
}

export interface RaceResult {
  number: string;
  position: string;
  positionText: string;
  points: string;
  Driver: DriverRef;
  Constructor: ConstructorRef;
  grid: string;
  laps: string;
  status: string;
  Time?: { millis: string; time: string; stop?: string };
  FastestLap?: {
    rank: string;
    lap: string;
    Time: { time: string };
    AverageSpeed?: { units: string; speed: string };
  };
}

/** A result row tagged with the meeting it came from, which the API only records on the race wrapper. */
export interface CareerRaceResult extends RaceResult {
  season: string;
  round: string;
  raceName: string;
  date: string;
}

export interface Lap {
  /** 1-based lap number */
  number: number;
  driverId: string;
  /** Classification at the end of this lap; the feed omits the row when a car was not classified. */
  position: number | null;
  /** Lap duration in milliseconds, parsed from the "1:37.284" timing string. */
  millis: number | null;
}

export interface PitStop {
  driverId: string;
  stop: string;
  lap: string;
  time: string;
  duration: string;
}

export interface QualifyingResult {
  number: string;
  position: string;
  Driver: DriverRef;
  Constructor: ConstructorRef;
  Q1?: string;
  Q2?: string;
  Q3?: string;
}

interface MRData<T> {
  MRData: { RaceTable?: { Races: T[] }; StandingsTable?: Record<string, unknown> };
}

/** Session-scoped cache: standings and calendars are static within a visit. */
const cache = new Map<string, unknown>();

function readPersisted(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePersisted(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota — the in-memory map still serves the visit */
  }
}

async function request<T>(path: string, opts: { persist?: boolean } = {}): Promise<T> {
  const url = `${BASE}${path}`;
  if (cache.has(url)) return cache.get(url) as T;
  if (opts.persist) {
    const persisted = readPersisted(CACHE_KEY + url);
    if (persisted) {
      cache.set(url, persisted);
      return persisted as T;
    }
  }
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`F1 data request failed (${res.status}) for ${path}`);
  const json = (await res.json()) as T;
  // An empty race table usually means a session the feed has not written yet, so
  // it must not outlive the request that asked for it. That is what lets the
  // weekend page keep probing for a lap sheet until it really appears.
  if (!isEmptyTable(json)) {
    cache.set(url, json);
    if (opts.persist) writePersisted(CACHE_KEY + url, json);
  }
  return json;
}

function isEmptyTable(value: unknown): boolean {
  const races = (value as { MRData?: { RaceTable?: { Races?: unknown[] } } } | undefined)?.MRData?.RaceTable?.Races;
  return Array.isArray(races) && races.length === 0;
}

function races(body: MRData<Race>): Race[] {
  return body.MRData.RaceTable?.Races ?? [];
}

/** Run `worker` over `items` with at most `size` in flight, preserving order. */
async function mapPool<In, Out>(
  items: In[],
  size: number,
  worker: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const out = new Array<Out>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return out;
}

/** The feed occasionally answers a burst with a refusal that clears on its own. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * i));
    }
  }
}

export function getCalendar(season: number): Promise<Race[]> {
  return request<MRData<Race>>(`/${season}.json?limit=100`, { persist: true }).then(races);
}

interface StandingsBody<T> {
  MRData: { StandingsTable?: { StandingsLists: Record<string, T>[] } };
}

export async function getDriverStandings(season: number): Promise<DriverStanding[]> {
  const body = await request<StandingsBody<DriverStanding[]>>(
    `/${season}/driverstandings.json?limit=40`,
    { persist: true },
  );
  return body.MRData.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
}

/** The championship table as it stood after one specific round. */
export async function getDriverStandingsAtRound(season: number, round: number): Promise<DriverStanding[]> {
  const body = await request<StandingsBody<DriverStanding[]>>(
    `/${season}/${round}/driverstandings.json?limit=40`,
    { persist: true },
  );
  return body.MRData.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
}

export interface ProgressionRound {
  round: number;
  circuit: string;
  locality: string;
}

export interface ProgressionSeries {
  driverId: string;
  code: string;
  name: string;
  team: string;
  constructorId: string;
  /** Cumulative points after each round of `rounds`, index-aligned. */
  points: number[];
}

export interface Progression {
  rounds: ProgressionRound[];
  series: ProgressionSeries[];
}

/**
 * Cumulative points after every round, which is the only way to show the season
 * taking shape rather than just where it ended.
 *
 * The feed publishes the table one round at a time, so this is a request per
 * completed round. They run four at a time and every response is cached for the
 * session, so the walk happens once however often the chart is opened.
 */
export async function getSeasonProgression(season: number): Promise<Progression> {
  const calendar = await getCalendar(season);
  const now = Date.now();
  const raced = calendar
    .filter((race) => utcDateTime(race.date, race.time).getTime() <= now)
    .sort((a, b) => Number(a.round) - Number(b.round));
  if (raced.length === 0) return { rounds: [], series: [] };

  const tables = await mapPool(raced, 4, (race) =>
    withRetry(() => getDriverStandingsAtRound(season, Number(race.round))).catch(() => [] as DriverStanding[]),
  );

  const rounds: ProgressionRound[] = [];
  const totals: Map<string, number>[] = [];
  const people = new Map<string, DriverStanding>();
  raced.forEach((race, i) => {
    const table = tables[i];
    // A round with no table is a race the feed has not scored yet, not a zero.
    if (table.length === 0) return;
    rounds.push({
      round: Number(race.round),
      circuit: race.Circuit.circuitName,
      locality: race.Circuit.Location.locality,
    });
    const total = new Map<string, number>();
    for (const standing of table) {
      total.set(standing.Driver.driverId, Number(standing.points));
      people.set(standing.Driver.driverId, standing);
    }
    totals.push(total);
  });

  // Someone missing from one round's table keeps the total they were last credited with.
  const series = [...people.values()]
    .map((standing) => {
      const driverId = standing.Driver.driverId;
      let carry = 0;
      const points = rounds.map((_, i) => {
        const found = totals[i].get(driverId);
        if (found != null) carry = found;
        return carry;
      });
      const constructor = standing.Constructors[0];
      return {
        driverId,
        code: standing.Driver.code ?? standing.Driver.familyName.slice(0, 3).toUpperCase(),
        name: `${standing.Driver.givenName} ${standing.Driver.familyName}`,
        team: constructor?.name ?? "",
        constructorId: constructor?.constructorId ?? "",
        points,
      };
    })
    .sort((a, b) => (b.points.at(-1) ?? 0) - (a.points.at(-1) ?? 0));

  return { rounds, series };
}

export async function getConstructorStandings(season: number): Promise<ConstructorStanding[]> {
  const body = await request<StandingsBody<ConstructorStanding[]>>(
    `/${season}/constructorstandings.json?limit=40`,
    { persist: true },
  );
  return body.MRData.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
}
export async function getRaceResults(season: number, round: number): Promise<RaceResult[]> {
  const body = await request<{
    MRData: { RaceTable?: { Races: { Results: RaceResult[] }[] } };
  }>(`/${season}/${round}/results.json?limit=40`, { persist: true });
  return body.MRData.RaceTable?.Races?.[0]?.Results ?? [];
}

export async function getQualifying(season: number, round: number): Promise<QualifyingResult[]> {
  const body = await request<{
    MRData: { RaceTable?: { Races: { QualifyingResults: QualifyingResult[] }[] } };
  }>(`/${season}/${round}/qualifying.json?limit=40`);
  return body.MRData.RaceTable?.Races?.[0]?.QualifyingResults ?? [];
}

/**
 * Has the lap sheet been published yet? The feed only writes it once a session
 * closes, so this one-row probe is how the weekend page knows to stop waiting.
 * Deliberately uncached: the answer changes while a race is running.
 */
export async function hasTiming(season: number, round: number): Promise<boolean> {
  const body = await request<{ MRData: { RaceTable?: { Races: { Laps?: unknown[] }[] } } }>(
    `/${season}/${round}/laps.json?limit=1`,
  );
  return (body.MRData.RaceTable?.Races?.[0]?.Laps?.length ?? 0) > 0;
}

export async function getPitStops(season: number, round: number): Promise<PitStop[]> {
  const body = await request<{
    MRData: { RaceTable?: { Races: { PitStops: PitStop[] }[] } };
  }>(`/${season}/${round}/pitstops.json?limit=200`);
  return body.MRData.RaceTable?.Races?.[0]?.PitStops ?? [];
}

interface LapRow {
  number: string;
  Timings?: { driverId: string; time?: string; position?: string }[];
}

type LapsBody = { MRData: { total: string; RaceTable?: { Races: { Laps: LapRow[] }[] } } };

/**
 * Every timed lap of a race, grouped by driver.
 *
 * The laps endpoint pages by *timing row* (about 100 per response) and returns
 * each lap with the whole field inside it, so `?driver=` cannot narrow the
 * payload. Walking the offsets once and de-duplicating by lap + driver rebuilds
 * the full grid in roughly a dozen requests.
 */
export async function getLapsByDriver(season: number, round: number): Promise<Record<string, Lap[]>> {
  const path = `/${season}/${round}/laps.json`;
  const first = await request<LapsBody>(`${path}?limit=100&offset=0`);
  const total = Number(first.MRData.total);
  const seen = new Map<string, Lap>();

  const collect = (rows: LapRow[]) => {
    for (const row of rows) {
      const number = Number(row.number);
      for (const timing of row.Timings ?? []) {
        const key = `${number}:${timing.driverId}`;
        if (seen.has(key)) continue;
        seen.set(key, {
          number,
          driverId: timing.driverId,
          position: timing.position ? Number(timing.position) : null,
          millis: parseLapTime(timing.time),
        });
      }
    }
  };
  collect(first.MRData.RaceTable?.Races?.[0]?.Laps ?? []);

  for (let offset = 100; offset < total; offset += 100) {
    const next = await request<LapsBody>(`${path}?limit=100&offset=${offset}`);
    collect(next.MRData.RaceTable?.Races?.[0]?.Laps ?? []);
  }

  const grouped: Record<string, Lap[]> = {};
  for (const lap of seen.values()) (grouped[lap.driverId] ??= []).push(lap);
  for (const laps of Object.values(grouped)) laps.sort((a, b) => a.number - b.number);
  return grouped;
}

export async function getDriverInfo(driverId: string): Promise<DriverRef | null> {
  const body = await request<{
    MRData: { DriverTable?: { Drivers: DriverRef[] } };
  }>(`/drivers/${driverId}.json`, { persist: true });
  return body.MRData.DriverTable?.Drivers?.[0] ?? null;
}

type CareerBody = {
  MRData: {
    total: string;
    RaceTable?: {
      Races: { season: string; round: string; raceName: string; date: string; Results?: RaceResult[] }[];
    };
  };
};

/** Every race result a driver has on record, newest season first as the API returns them. */
export async function getDriverCareerResults(driverId: string): Promise<CareerRaceResult[]> {
  const path = `/drivers/${driverId}/results.json`;
  const first = await request<CareerBody>(`${path}?limit=100&offset=0`);
  const total = Number(first.MRData.total);
  const flatten = (body: CareerBody) =>
    (body.MRData.RaceTable?.Races ?? []).flatMap((race) =>
      (race.Results ?? []).map((row) => ({
        ...row,
        season: race.season,
        round: race.round,
        raceName: race.raceName,
        date: race.date,
      })),
    );

  let rows = flatten(first);
  for (let offset = 100; offset < total; offset += 100) {
    rows = rows.concat(flatten(await request<CareerBody>(`${path}?limit=100&offset=${offset}`)));
  }
  return rows;
}

export function raceStartDate(race: Race): Date | null {
  if (!race.date) return null;
  return utcDateTime(race.date, race.time);
}
