/**
 * Pit-strategy maths for a completed session: official stop identity, clean
 * laps, measured pit loss, stint degradation and the historical baseline.
 *
 * Every function is pure and returns API units (seconds, laps, metres). Missing
 * data stays an explicit null — no assumed pit loss, race length, stop count or
 * tyre life is ever substituted. Nothing here is a prediction: the baseline is
 * a median over completed sessions at the same circuit.
 */
import { normaliseName } from "./openf1";
import type {
  OpenF1Driver,
  OpenF1Lap,
  OpenF1Pit,
  OpenF1RaceControl,
  OpenF1Stint,
} from "./openf1";
import type { PitStop, RaceResult } from "./jolpica";
import { parseLapTime } from "./format";

/** Track state at a moment, derived from race-control messages. */
export type TrackState = "green" | "not-green" | "unknown";

/** One official Jolpica stop resolved to an OpenF1 driver number. */
export interface OfficialStop {
  driverNumber: number;
  lap: number;
  /** The published duration string, preserved verbatim for display. */
  durationLabel: string;
  durationS: number | null;
}

export interface StopSummary {
  stopNumber: number;
  lap: number;
  durationLabel: string | null;
  durationS: number | null;
  trackState: TrackState;
  excluded: boolean;
  measuredLossS: number | null;
}

export interface StintSummary {
  stintNumber: number;
  compound: string;
  lapStart: number;
  lapEnd: number;
  lengthLaps: number;
  tyreAgeAtStart: number;
  /** Least-squares slope in seconds per lap, or null with fewer than two clean-lap ages. */
  degradationS: number | null;
  /** Clean laps used for the slope. */
  cleanLaps: number;
}

export interface DriverStrategy {
  driverNumber: number;
  code: string;
  teamName: string;
  /** `#rrggbb` from the feed, or null when the feed published no colour. */
  teamColor: string | null;
  position: number | null;
  /** Median clean-lap time in seconds, or null when no lap is clean. */
  baselineS: number | null;
  cleanLapCount: number;
  stops: StopSummary[];
  stints: StintSummary[];
}

export interface CompoundSummary {
  compound: string;
  stintCount: number;
  medianStintLengthLaps: number | null;
  medianDegradationS: number | null;
  /** Clean laps behind the stint slopes that produced `medianDegradationS`. */
  degradationSamples: number;
}

export interface StrategyReport {
  season: number;
  totalLaps: number | null;
  drivers: DriverStrategy[];
  pitLossMedianS: number | null;
  pitLossSamples: number;
  excludedStops: number;
  /** Whether race-control messages were supplied at all; without them every tracker state is unknown. */
  flagsAvailable: boolean;
  compounds: CompoundSummary[];
}

export interface StrategyReportInput {
  season: number;
  drivers: OpenF1Driver[];
  laps: OpenF1Lap[];
  stints: OpenF1Stint[];
  pits: OpenF1Pit[];
  raceControl: OpenF1RaceControl[];
  /** When supplied (even empty) these replace OpenF1 pit rows as the stop records. */
  officialStops?: OfficialStop[];
  results?: RaceResult[];
}

export interface StrategyBaseline {
  sessionCount: number;
  seasons: number[];
  /** One sample per driver per contributing session. */
  driverRaceSamples: number;
  medianStopCount: number | null;
  minStopCount: number | null;
  maxStopCount: number | null;
  medianPitLossS: number | null;
  pitLossSamples: number;
  compounds: CompoundSummary[];
}

const GREEN_FLAGS = new Set(["GREEN", "CLEAR"]);
const STOP_FLAGS = new Set(["YELLOW", "DOUBLE YELLOW", "RED"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** One shared median: even counts average the two middle samples. */
function median(values: number[]): number | null {
  const sorted = values.filter(isFiniteNumber).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

type TimedLap = OpenF1Lap & { lap_duration: number };

function isTimedLap(lap: OpenF1Lap): lap is TimedLap {
  return isFiniteNumber(lap.lap_duration);
}

interface StateTimeline {
  /** Sorted message timestamps that can change the track state. */
  times: number[];
  /** State after the message at the same index. */
  states: TrackState[];
}

/**
 * Reduce race control to the messages that change track-wide state: track-scope
 * (or unscoped) GREEN/CLEAR/YELLOW/DOUBLE YELLOW/RED flags and SafetyCar
 * deployments. Sector-scope flags and informational categories are dropped
 * because they say nothing about the whole track.
 */
function buildStateTimeline(messages: OpenF1RaceControl[]): StateTimeline {
  const events: { t: number; state: TrackState }[] = [];
  for (const message of messages) {
    const t = Date.parse(message.date);
    if (!Number.isFinite(t)) continue;

    if (message.category === "SafetyCar") {
      events.push({ t, state: "not-green" });
      continue;
    }
    if (message.category !== "Flag") continue;

    const scope = message.scope ? message.scope.trim().toLowerCase() : null;
    if (scope !== null && scope !== "track") continue;

    const flag = message.flag ? message.flag.trim().toUpperCase() : "";
    if (GREEN_FLAGS.has(flag)) events.push({ t, state: "green" });
    else if (STOP_FLAGS.has(flag)) events.push({ t, state: "not-green" });
  }

  events.sort((a, b) => a.t - b.t);
  return { times: events.map((event) => event.t), states: events.map((event) => event.state) };
}

/** State after the last applicable message at or before `iso`. */
function stateAt(timeline: StateTimeline, iso: string): TrackState {
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return "unknown";

  let lo = 0;
  let hi = timeline.times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline.times[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? "unknown" : timeline.states[lo - 1];
}

/**
 * Track state at `iso`. A SafetyCar deployment is not-green until the next
 * track GREEN/CLEAR; no applicable message at all is unknown, which callers
 * must not read as green or as an exclusion.
 */
export function trackStateAt(messages: OpenF1RaceControl[], iso: string): TrackState {
  return stateAt(buildStateTimeline(messages), iso);
}

/**
 * State across a window, used for a pit visit. OpenF1 stamps a pit row when the
 * visit is recorded (the car's exit), so a stop that began under yellow, SC or
 * red can end on a green stamp — Monaco's red-flag first-lap stops leave after
 * the track is declared clear. A visit that overlapped not-green running is
 * therefore reported as not-green; otherwise the state at `toIso` stands.
 * Without an in-lap start (`fromIso` null) only the end stamp is consulted.
 */
function stateDuring(timeline: StateTimeline, fromIso: string | null, toIso: string): TrackState {
  const to = Date.parse(toIso);
  if (!Number.isFinite(to)) return "unknown";

  let start = 0;
  const from = fromIso ? Date.parse(fromIso) : Number.NaN;
  if (Number.isFinite(from)) {
    if (stateAt(timeline, fromIso as string) === "not-green") return "not-green";
    // First message strictly after the window start.
    let lo = 0;
    let hi = timeline.times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timeline.times[mid] <= from) lo = mid + 1;
      else hi = mid;
    }
    start = lo;
  }

  let end = timeline.times.length;
  let lo = start;
  let hi = timeline.times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline.times[mid] <= to) lo = mid + 1;
    else hi = mid;
  }
  end = lo;

  for (let i = start; i < end; i++) {
    if (timeline.states[i] === "not-green") return "not-green";
  }
  return stateAt(timeline, toIso);
}

/**
 * When the car entered the pit lane: the row's exit stamp minus its published
 * lane duration. OpenF1 can stamp a red-flag in-lap as starting at the restart
 * (Monaco 2024 lap 1), so the lap start alone would miss the stoppage the car
 * actually sat through; the lane duration covers it. Null when not published.
 */
function pitEntryDate(pit: OpenF1Pit | undefined): string | null {
  if (!pit) return null;
  const exit = Date.parse(pit.date);
  const lane = pit.lane_duration;
  if (!Number.isFinite(exit) || !isFiniteNumber(lane) || lane <= 0) return null;
  return new Date(exit - lane * 1000).toISOString();
}

function earliestIso(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function driverMatcher(drivers: OpenF1Driver[]) {
  const byAcronym = new Map<string, OpenF1Driver>();
  const byLastName = new Map<string, OpenF1Driver>();
  for (const driver of drivers) {
    const acronym = driver.name_acronym?.trim().toUpperCase();
    if (acronym && !byAcronym.has(acronym)) byAcronym.set(acronym, driver);
    const lastName = normaliseName(driver.last_name ?? "");
    if (lastName && !byLastName.has(lastName)) byLastName.set(lastName, driver);
  }
  return (code?: string | null, familyName?: string | null): OpenF1Driver | null => {
    const acronym = code?.trim().toUpperCase();
    if (acronym) {
      const match = byAcronym.get(acronym);
      if (match) return match;
    }
    const lastName = familyName ? normaliseName(familyName) : "";
    return lastName ? byLastName.get(lastName) ?? null : null;
  };
}

function resultMatcher(results: RaceResult[] | undefined) {
  const byCode = new Map<string, RaceResult>();
  const byLastName = new Map<string, RaceResult>();
  for (const result of results ?? []) {
    const code = result.Driver.code?.trim().toUpperCase();
    if (code) byCode.set(code, result);
    const lastName = normaliseName(result.Driver.familyName ?? "");
    if (lastName) byLastName.set(lastName, result);
  }
  return (driver: OpenF1Driver): RaceResult | null => {
    const acronym = driver.name_acronym?.trim().toUpperCase();
    if (acronym) {
      const match = byCode.get(acronym);
      if (match) return match;
    }
    const lastName = normaliseName(driver.last_name ?? "");
    return lastName ? byLastName.get(lastName) ?? null : null;
  };
}

/**
 * Resolve Jolpica's official pit rows to OpenF1 driver numbers. Identity is
 * `Driver.code` = `name_acronym` (case-insensitive), then normalised
 * `familyName` = `last_name`. Only an unmatched driver drops a stop; the
 * duration is parsed to seconds but its published string is kept as-is, and an
 * unparsable duration stays null rather than becoming an assumed number.
 */
export function officialStopsFromJolpica(
  pitStops: PitStop[],
  results: RaceResult[],
  drivers: OpenF1Driver[],
): OfficialStop[] {
  const matchDriver = driverMatcher(drivers);
  const resultByDriverId = new Map<string, RaceResult>();
  for (const result of results) resultByDriverId.set(result.Driver.driverId, result);

  const stops: OfficialStop[] = [];
  for (const stop of pitStops) {
    const result = resultByDriverId.get(stop.driverId);
    const driver = matchDriver(result?.Driver.code ?? null, result?.Driver.familyName ?? null);
    if (!driver) continue;

    const millis = parseLapTime(stop.duration);
    stops.push({
      driverNumber: driver.driver_number,
      lap: Number(stop.lap),
      durationLabel: stop.duration,
      durationS: millis === null ? null : millis / 1000,
    });
  }
  return stops;
}

interface StopRecord {
  driverNumber: number;
  lap: number;
  durationLabel: string | null;
  durationS: number | null;
  /** Timestamp of the matching OpenF1 pit row, used for the track state. */
  date: string | null;
  /** Pit-entry instant derived from the row's exit stamp minus its lane duration, when published. */
  entryDate: string | null;
}

interface StintSample {
  compound: string;
  lengthLaps: number;
  degradationS: number | null;
  cleanLaps: number;
}

function leastSquaresSlope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  // Two distinct tyre ages are the mathematical minimum for a line.
  if (n < 2 || new Set(xs).size < 2) return null;

  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    numerator += dx * (ys[i] - meanY);
    denominator += dx * dx;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function summariseCompounds(samples: StintSample[]): CompoundSummary[] {
  const byCompound = new Map<string, StintSample[]>();
  for (const sample of samples) {
    const list = byCompound.get(sample.compound) ?? [];
    list.push(sample);
    byCompound.set(sample.compound, list);
  }

  return [...byCompound.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([compound, list]) => {
      const lengths = list.map((stint) => stint.lengthLaps).filter((length) => length > 0);
      const slopes = list
        .filter((stint): stint is StintSample & { degradationS: number } => stint.degradationS !== null)
        .map((stint) => stint.degradationS);
      const cleanLaps = list.reduce(
        (sum, stint) => sum + (stint.degradationS !== null ? stint.cleanLaps : 0),
        0,
      );
      return {
        compound,
        stintCount: list.length,
        medianStintLengthLaps: median(lengths),
        medianDegradationS: median(slopes),
        degradationSamples: cleanLaps,
      };
    });
}

function lapOrder(lap: number): number {
  return Number.isFinite(lap) ? lap : Number.POSITIVE_INFINITY;
}

/**
 * Build one session's strategy report.
 *
 * Clean laps are timed, not the pit-out lap, not a stop's in- or out-lap and not
 * under not-green running. When no race-control messages are supplied every
 * state is unknown and therefore excludes nothing (`flagsAvailable` says so).
 * A stop's state covers its pit sequence, so a visit that overlapped a red flag
 * or safety car is not-green even when the feed stamps its exit after the
 * restart. Measured pit loss keeps its sign: a cut-back can make it negative and
 * is not clamped to an assumed minimum.
 */
export function buildStrategyReport(input: StrategyReportInput): StrategyReport {
  const { season, drivers, laps, stints, pits, raceControl } = input;
  const timeline = buildStateTimeline(raceControl);
  const flagsAvailable = raceControl.length > 0;

  let totalLaps: number | null = null;
  for (const lap of laps) {
    if (!isTimedLap(lap) || !isFiniteNumber(lap.lap_number)) continue;
    totalLaps = totalLaps === null ? lap.lap_number : Math.max(totalLaps, lap.lap_number);
  }

  // Earliest OpenF1 pit row per driver/lap, for the stop's track state.
  const pitByKey = new Map<string, OpenF1Pit>();
  for (const pit of pits) {
    if (!Number.isFinite(pit.driver_number) || !Number.isFinite(pit.lap_number)) continue;
    const key = `${pit.driver_number}:${pit.lap_number}`;
    const existing = pitByKey.get(key);
    if (existing === undefined || Date.parse(pit.date) < Date.parse(existing.date)) {
      pitByKey.set(key, pit);
    }
  }

  const official = input.officialStops;
  const stopRecords: StopRecord[] =
    official === undefined
      ? pits.map((pit) => ({
          driverNumber: pit.driver_number,
          lap: pit.lap_number,
          durationLabel: null,
          // The feed's pit_duration arrives on an inconsistent scale; never present it as a stop time.
          durationS: null,
          date: pit.date,
          entryDate: pitEntryDate(pit),
        }))
      : official.map((stop) => ({
          driverNumber: stop.driverNumber,
          lap: stop.lap,
          durationLabel: stop.durationLabel,
          durationS: stop.durationS,
          date: pitByKey.get(`${stop.driverNumber}:${stop.lap}`)?.date ?? null,
          entryDate: pitEntryDate(pitByKey.get(`${stop.driverNumber}:${stop.lap}`)),
        }));

  const recordsByDriver = new Map<number, StopRecord[]>();
  const inLapsByDriver = new Map<number, Set<number>>();
  const outLapsByDriver = new Map<number, Set<number>>();
  for (const record of stopRecords) {
    const list = recordsByDriver.get(record.driverNumber) ?? [];
    list.push(record);
    recordsByDriver.set(record.driverNumber, list);

    if (Number.isFinite(record.lap)) {
      const inLaps = inLapsByDriver.get(record.driverNumber) ?? new Set<number>();
      inLaps.add(record.lap);
      inLapsByDriver.set(record.driverNumber, inLaps);
      const outLaps = outLapsByDriver.get(record.driverNumber) ?? new Set<number>();
      outLaps.add(record.lap + 1);
      outLapsByDriver.set(record.driverNumber, outLaps);
    }
  }

  const lapsByDriver = new Map<number, TimedLap[]>();
  for (const lap of laps) {
    if (!isTimedLap(lap)) continue;
    const list = lapsByDriver.get(lap.driver_number) ?? [];
    list.push(lap);
    lapsByDriver.set(lap.driver_number, list);
  }
  const allLapsByDriver = new Map<number, OpenF1Lap[]>();
  for (const lap of laps) {
    const list = allLapsByDriver.get(lap.driver_number) ?? [];
    list.push(lap);
    allLapsByDriver.set(lap.driver_number, list);
  }

  const matchResult = resultMatcher(input.results);

  const rows: DriverStrategy[] = drivers.map((driver) => {
    const driverLaps = allLapsByDriver.get(driver.driver_number) ?? [];
    const inLaps = inLapsByDriver.get(driver.driver_number) ?? new Set<number>();
    const outLaps = outLapsByDriver.get(driver.driver_number) ?? new Set<number>();

    const cleanLaps = driverLaps.filter(isTimedLap).filter(
      (lap) =>
        !lap.is_pit_out_lap &&
        !inLaps.has(lap.lap_number) &&
        !outLaps.has(lap.lap_number) &&
        stateAt(timeline, lap.date_start) !== "not-green",
    );
    const baselineS = median(cleanLaps.map((lap) => lap.lap_duration));

    const lapByNumber = new Map<number, TimedLap>();
    for (const lap of lapsByDriver.get(driver.driver_number) ?? []) {
      lapByNumber.set(lap.lap_number, lap);
    }
    const anyLapByNumber = new Map<number, OpenF1Lap>();
    for (const lap of driverLaps) anyLapByNumber.set(lap.lap_number, lap);

    const stops = [...(recordsByDriver.get(driver.driver_number) ?? [])]
      .sort((a, b) => lapOrder(a.lap) - lapOrder(b.lap))
      .map((record, index): StopSummary => {
        const inLap = lapByNumber.get(record.lap);
        const inLapStart = anyLapByNumber.get(record.lap)?.date_start ?? null;
        const windowStart = earliestIso(inLapStart, record.entryDate);
        const trackState = record.date
          ? stateDuring(timeline, windowStart, record.date)
          : "unknown";
        const excluded = trackState === "not-green";
        const outLap = lapByNumber.get(record.lap + 1);
        const measuredLossS =
          !excluded && baselineS !== null && inLap && outLap
            ? inLap.lap_duration + outLap.lap_duration - 2 * baselineS
            : null;
        return {
          stopNumber: index + 1,
          lap: record.lap,
          durationLabel: record.durationLabel,
          durationS: record.durationS,
          trackState,
          excluded,
          measuredLossS,
        };
      });

    const driverStints = stints
      .filter((stint) => stint.driver_number === driver.driver_number)
      .sort((a, b) => lapOrder(a.lap_start) - lapOrder(b.lap_start) || a.stint_number - b.stint_number);

    const stintSummaries: StintSummary[] = driverStints.map((stint) => {
      const start = stint.lap_start;
      const end = isFiniteNumber(stint.lap_end) && stint.lap_end > 0 ? stint.lap_end : totalLaps;
      const lapEnd = end ?? stint.lap_end;
      const lengthLaps =
        end === null || !isFiniteNumber(start) || !isFiniteNumber(end)
          ? 0
          : Math.max(0, end - start + 1);

      const samples = cleanLaps.filter(
        (lap) =>
          isFiniteNumber(start) &&
          isFiniteNumber(stint.tyre_age_at_start) &&
          lap.lap_number >= start &&
          lap.lap_number <= lapEnd,
      );
      const xs = samples.map(
        (lap) => stint.tyre_age_at_start + (lap.lap_number - start),
      );
      const ys = samples.map((lap) => lap.lap_duration);

      return {
        stintNumber: stint.stint_number,
        compound: stint.compound,
        lapStart: start,
        lapEnd,
        lengthLaps,
        tyreAgeAtStart: stint.tyre_age_at_start,
        degradationS: leastSquaresSlope(xs, ys),
        cleanLaps: samples.length,
      };
    });

    const result = matchResult(driver);
    const position = result ? Number(result.position) : Number.NaN;
    const colour = driver.team_colour?.trim();

    return {
      driverNumber: driver.driver_number,
      code: driver.name_acronym,
      teamName: result?.Constructor.name ?? driver.team_name,
      teamColor: colour ? `#${colour.replace(/^#/, "")}` : null,
      position: Number.isFinite(position) ? position : null,
      baselineS,
      cleanLapCount: cleanLaps.length,
      stops,
      stints: stintSummaries,
    };
  });

  rows.sort(
    (a, b) =>
      (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY) ||
      a.code.localeCompare(b.code),
  );

  const measuredLosses: number[] = [];
  let excludedStops = 0;
  for (const row of rows) {
    for (const stop of row.stops) {
      if (stop.excluded) excludedStops += 1;
      else if (isFiniteNumber(stop.measuredLossS)) measuredLosses.push(stop.measuredLossS);
    }
  }

  const compoundSamples: StintSample[] = rows.flatMap((row) =>
    row.stints.map((stint) => ({
      compound: stint.compound,
      lengthLaps: stint.lengthLaps,
      degradationS: stint.degradationS,
      cleanLaps: stint.cleanLaps,
    })),
  );

  return {
    season,
    totalLaps,
    drivers: rows,
    pitLossMedianS: median(measuredLosses),
    pitLossSamples: measuredLosses.length,
    excludedStops,
    flagsAvailable,
    compounds: summariseCompounds(compoundSamples),
  };
}

/**
 * Historical context for an upcoming race: pool every contributing session's
 * driver-race samples. Every benchmark is a median with its sample count; with
 * no data the medians stay null instead of becoming a default.
 */
export function buildStrategyBaseline(reports: StrategyReport[]): StrategyBaseline {
  const seasons = [...new Set(reports.map((report) => report.season).filter(isFiniteNumber))].sort(
    (a, b) => a - b,
  );

  const stopCounts: number[] = [];
  const measuredLosses: number[] = [];
  const stintSamples: StintSample[] = [];
  let driverRaceSamples = 0;

  for (const report of reports) {
    for (const driver of report.drivers) {
      driverRaceSamples += 1;
      stopCounts.push(driver.stops.length);

      for (const stop of driver.stops) {
        if (!stop.excluded && isFiniteNumber(stop.measuredLossS)) {
          measuredLosses.push(stop.measuredLossS);
        }
      }

      for (const stint of driver.stints) {
        stintSamples.push({
          compound: stint.compound,
          lengthLaps: stint.lengthLaps,
          degradationS: stint.degradationS,
          cleanLaps: stint.cleanLaps,
        });
      }
    }
  }

  return {
    sessionCount: reports.length,
    seasons,
    driverRaceSamples,
    medianStopCount: median(stopCounts),
    minStopCount: stopCounts.length ? Math.min(...stopCounts) : null,
    maxStopCount: stopCounts.length ? Math.max(...stopCounts) : null,
    medianPitLossS: median(measuredLosses),
    pitLossSamples: measuredLosses.length,
    compounds: summariseCompounds(stintSamples),
  };
}
