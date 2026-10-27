import type { Lap, PitStop, RaceResult } from "./jolpica";

/**
 * Reconstructs a race replay from end-of-lap classification data.
 *
 * A driver's absolute race clock is the sum of their own lap times, so their
 * position along the lap at time T is interpolated between two recorded laps.
 * That is a reconstruction from timing data, not a GPS trace: sub-lap corner
 * speeds and throttle/brake traces come from the F1 live feed, which is no
 * longer publicly available.
 */

export interface ReplayEntrant {
  driverId: string;
  code: string;
  name: string;
  team: string;
  carNumber: string;
  color: string;
  /** Lap the car was last seen on; anything earlier means it retired. */
  lastLap: number;
  /** True when the timing sheet credits the car with the full race distance. */
  completedRace: boolean;
  gridPosition: number;
  finishPosition: number;
  status: string;
}

interface LapTrack {
  /** Lap numbers the feed has a row for, ascending. A car can miss early laps. */
  lapNumbers: number[];
  /** cumulative elapsed ms at the END of `lapNumbers[i]` */
  cumulative: number[];
  /** Duration of `lapNumbers[i]`, NaN when the lap was not timed. */
  millis: number[];
  /** Classification at the END of `lapNumbers[i]`, carried forward when the row omits it. */
  positions: number[];
}

export interface CarState {
  entrant: ReplayEntrant;
  lap: number;
  /** 0..1 progress around the current lap */
  fraction: number;
  /** Laps this car has crossed the line for, so cars on different laps never share a rank. */
  lapsDone: number;
  /** Classification at the end of `lapsDone`, or the grid slot before the first crossing. */
  classification: number;
  /** Elapsed race ms at which the car crossed the line to begin the current lap. */
  beganLapMs: number;
  runningOrder: number;
  /**
   * True until the car has crossed the line once. Nobody has set a lap then, so the
   * order is the starting grid and the intervals have not been measured yet.
   */
  onGrid: boolean;
  /** True once the car has no more laps to run: it finished, or it stopped. */
  parked: boolean;
  gapToAheadMs: number | null;
  lapsAheadInFront: number;
  intervalText: string;
  lastLapTimeMs: number | null;
  /** Length of the lap in progress, used only to space the field out on the map. */
  refLapMs: number | null;
  retired: boolean;
}

export interface ReplayFrame {
  clockMs: number;
  leaderLap: number;
  totalLaps: number;
  cars: CarState[];
}

export interface Replay {
  totalLaps: number;
  durationMs: number;
  entrants: ReplayEntrant[];
  stopsByDriver: Map<string, PitStop[]>;
  frameAt: (clockMs: number) => ReplayFrame;
}

function toTracks(lapsByDriver: Record<string, Lap[]>): Map<string, LapTrack> {
  const tracks = new Map<string, LapTrack>();
  for (const [driverId, laps] of Object.entries(lapsByDriver)) {
    const sorted = [...laps].sort((a, b) => a.number - b.number);
    const lapNumbers: number[] = [];
    const cumulative: number[] = [];
    const millis: number[] = [];
    const positions: number[] = [];
    let running = 0;
    // A lap without a recorded time still occupies the running order, and a row
    // without a classification keeps the position the car was last shown at.
    let lastPosition = 0;
    for (const lap of sorted) {
      const ms = lap.millis ?? NaN;
      if (Number.isFinite(ms)) running += ms;
      lastPosition = lap.position ?? lastPosition;
      lapNumbers.push(lap.number);
      cumulative.push(running);
      millis.push(ms);
      positions.push(lastPosition || 99);
    }
    tracks.set(driverId, { lapNumbers, cumulative, millis, positions });
  }
  return tracks;
}

export function buildReplay(
  results: RaceResult[],
  lapsByDriver: Record<string, Lap[]>,
  pitStops: PitStop[],
  colorFor: (constructorId: string) => string,
): Replay {
  const tracks = toTracks(lapsByDriver);
  const stopsByDriver = new Map<string, PitStop[]>();
  for (const stop of pitStops) {
    const list = stopsByDriver.get(stop.driverId) ?? [];
    list.push(stop);
    stopsByDriver.set(stop.driverId, list);
  }
  for (const list of stopsByDriver.values()) list.sort((a, b) => Number(a.lap) - Number(b.lap));

  const totalLaps = Math.max(0, ...[...tracks.values()].map((t) => t.lapNumbers.at(-1) ?? 0));

  // The timing sheet can stop one lap short of the flag for a classified runner, so whether a
  // car finished comes from the result: "Finished", "Lapped" and "+2 Laps" all took the chequered flag.
  const FINISHED = /^(finished|lapped|\+\d+ laps?)$/i;

  const entrants: ReplayEntrant[] = results.map((r) => {
    const track = tracks.get(r.Driver.driverId);
    const last = track?.lapNumbers.at(-1) ?? 0;
    return {
      driverId: r.Driver.driverId,
      code: r.Driver.code ?? r.Driver.familyName.slice(0, 3).toUpperCase(),
      name: `${r.Driver.givenName} ${r.Driver.familyName}`,
      team: r.Constructor.name,
      carNumber: r.number,
      color: colorFor(r.Constructor.constructorId),
      lastLap: last,
      completedRace: FINISHED.test(r.status),
      gridPosition: Number(r.grid),
      finishPosition: Number(r.position),
      status: r.status,
    };
  });

  const timed = (ms: number) => (Number.isFinite(ms) ? ms : null);

  function stateAt(entrant: ReplayEntrant, clockMs: number): CarState | null {
    const track = tracks.get(entrant.driverId);
    if (!track || track.lapNumbers.length === 0) return null;
    const recorded = track.lapNumbers.length;

    // Once a car has run every lap the feed credits it with, it stops moving: the
    // winner parks at the line while the field is still crossing it.
    const lastEnd = track.cumulative[recorded - 1];
    if (clockMs > lastEnd + 1) {
      const lap = track.lapNumbers[recorded - 1];
      return {
        entrant,
        lap,
        fraction: 0,
        lapsDone: lap,
        classification: track.positions[recorded - 1],
        beganLapMs: lastEnd,
        runningOrder: 0,
        onGrid: false,
        parked: true,
        gapToAheadMs: null,
        lapsAheadInFront: 0,
        intervalText: entrant.completedRace ? "" : "OUT",
        lastLapTimeMs: timed(track.millis[recorded - 1]),
        refLapMs: timed(track.millis[recorded - 1]),
        retired: !entrant.completedRace,
      };
    }

    // The car is on the first recorded lap whose end has not passed yet.
    let i = 0;
    while (i < recorded - 1 && clockMs > track.cumulative[i]) i++;
    const lap = track.lapNumbers[i];
    const begin = i === 0 ? 0 : track.cumulative[i - 1];
    const end = track.cumulative[i];
    // Every crossing is in the timing sheet, so the lap in progress has a known length and
    // progress within it interpolates exactly. The last completed lap is the only one the
    // board can honestly call a lap time; before the first crossing there is none.
    const span = end - begin;
    const fraction = span > 0 ? Math.min(1, Math.max(0, (clockMs - begin) / span)) : 0;
    const onGrid = i === 0;

    return {
      entrant,
      lap,
      fraction,
      lapsDone: lap - 1,
      // Nothing has crossed the line yet, so the field is still in its grid slots.
      classification: onGrid ? entrant.gridPosition : track.positions[i - 1],
      beganLapMs: begin,
      runningOrder: 0,
      onGrid,
      parked: false,
      gapToAheadMs: null,
      lapsAheadInFront: 0,
      intervalText: "",
      lastLapTimeMs: onGrid ? null : timed(track.millis[i - 1]),
      refLapMs: span > 0 ? span : null,
      retired: false,
    };
  }

  function frameAt(clockMs: number): ReplayFrame {
    const running = entrants
      .map((e) => stateAt(e, clockMs))
      .filter((c): c is CarState => c !== null);

    const active = running.filter((c) => !c.retired);
    const leaderLap = Math.max(0, ...active.map((c) => c.lap));

    // Distance covered first: a car that has completed more laps is ahead, full stop.
    // Inside one lap group the classification at the last crossing is the order the cars
    // took the flag in, so the board only ever rewrites itself as cars cross the line.
    const ordered = [...running].sort((a, b) => {
      if (a.retired !== b.retired) return a.retired ? 1 : -1;
      if (a.lapsDone !== b.lapsDone) return b.lapsDone - a.lapsDone;
      if (a.classification !== b.classification) return a.classification - b.classification;
      return a.entrant.gridPosition - b.entrant.gridPosition;
    });
    ordered.forEach((car, index) => {
      const ahead = ordered[index - 1];
      car.runningOrder = index + 1;
      if (!ahead || car.retired) {
        car.intervalText = index === 0 ? "LEADER" : "OUT";
        car.gapToAheadMs = null;
        return;
      }
      const lapDiff = ahead.lapsDone - car.lapsDone;
      car.lapsAheadInFront = Math.max(0, lapDiff);
      if (lapDiff >= 1) {
        car.gapToAheadMs = null;
        car.intervalText = `+${lapDiff} LAP${lapDiff > 1 ? "S" : ""}`;
        return;
      }
      // Before the first crossing nothing has been timed, so the field is still in grid
      // slots and there is no interval to report.
      if (car.onGrid || ahead.onGrid) {
        car.gapToAheadMs = null;
        car.intervalText = car.onGrid && ahead.onGrid ? "GRID" : "—";
        return;
      }
      // Same lap: the interval is the difference in race clock at which both cars
      // crossed the line to begin it.
      const gap = Math.max(0, car.beganLapMs - ahead.beganLapMs);
      car.gapToAheadMs = gap;
      car.intervalText = `+${(gap / 1000).toFixed(2)}s`;
    });

    return { clockMs, leaderLap, totalLaps, cars: ordered };
  }

  // The replay runs until the last car is credited with its final lap, so lapped
  // cars still cross the line after the winner.
  const durationMs = Math.max(0, ...[...tracks.values()].map((t) => t.cumulative.at(-1) ?? 0));

  return { totalLaps, durationMs, entrants, stopsByDriver, frameAt };
}

/** Distance in metres the gap represents, using the lap's average speed. */
export function gapToMetres(gapMs: number | null, lapMs: number | null, lapLengthM: number | null) {
  if (!gapMs || !lapMs || !lapLengthM || lapMs <= 0) return null;
  return Math.round((gapMs / lapMs) * lapLengthM * 10) / 10;
}

export type PositionScale = "spread" | "true";

export interface CarPlacement {
  /** 0..1 position around the lap, already wrapped. */
  fraction: number;
  /** Offset from the centre line in the outline's normalised units. */
  lateral: number;
}

/** Gap between grid slots, as a share of one lap. Also used to space the field before anyone has crossed the line. */
const GRID_SLOT = 0.0035;
/** In spread mode the lead lap is stretched across half the circuit. */
const SPREAD_TARGET = 0.5;
/** Wide fields are already readable, so never stretch beyond this. */
const MAX_STRETCH = 16;

const wrap = (f: number) => ((f % 1) + 1) % 1;

/**
 * Places the field on the circuit outline.
 *
 * `true` keeps the geometry honest, which means a dry lap 1 puts all 22 cars
 * inside 1.5% of the track. `spread` stretches every lap group so the running
 * order can be read off the map; the interval column keeps the real gaps.
 * Lap 1 also starts the cars on their grid slots behind the line, two-wide,
 * merging into a single line as the field accelerates away.
 */
export function layoutField(frame: ReplayFrame, scale: PositionScale): Map<string, CarPlacement> {
  const out = new Map<string, CarPlacement>();
  const running = frame.cars.filter((c) => !c.retired);
  if (running.length === 0) return out;

  // The reference is the car that has gone furthest round, not the leader by name:
  // classification and track position disagree for a moment as each car crosses the line.
  let front = running[0];
  for (const car of running) if (car.lap > front.lap) front = car;
  const frontLap = front.lap;
  const stagger = frontLap === 1 ? 1 - front.fraction : 0;

  const place = (car: CarState, fraction: number) => {
    const row = (car.entrant.gridPosition - 1) % 2;
    out.set(car.entrant.driverId, {
      fraction: wrap(fraction),
      lateral: (row === 0 ? -1 : 1) * 0.0075 * stagger,
    });
  };

  // Lap 1 is timed from the lights-out grid, which sits just behind the line.
  const gridShift = (car: CarState) =>
    car.lap === 1 ? (car.entrant.gridPosition - 1) * GRID_SLOT * (1 - car.fraction) : 0;

  if (scale === "true") {
    for (const car of running) place(car, car.fraction - gridShift(car));
    return out;
  }

  const frontPos = front.fraction - gridShift(front);
  const groups: CarState[][] = [];
  for (const car of running) {
    const group = groups[groups.length - 1];
    if (group && group[0].lap === car.lap) group.push(car);
    else groups.push([car]);
  }

  for (const group of groups) {
    const headRef = group[0].refLapMs ?? front.refLapMs ?? 0;
    const offsetsLaps: number[] = [0];
    for (let i = 1; i < group.length; i++) {
      const car = group[i];
      const offset =
        car.gapToAheadMs == null
          ? car.onGrid
            ? GRID_SLOT
            : 0
          : Math.max(0, car.gapToAheadMs) / (headRef || 1);
      offsetsLaps.push(offsetsLaps[i - 1] + offset);
    }
    const span = offsetsLaps[offsetsLaps.length - 1];
    const stretch = span > 0 ? Math.min(MAX_STRETCH, Math.max(1, SPREAD_TARGET / span)) : 1;
    group.forEach((car, i) => {
      place(car, frontPos - (frontLap - car.lap) - offsetsLaps[i] * stretch);
    });
  }
  return out;
}
